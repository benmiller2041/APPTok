"use client";

import type { TronWeb as TronWebType } from "tronweb";
import { getWalletConnectProvider, initWalletConnect } from "@/lib/walletconnect";

export type WalletMode = "tronlink" | "walletconnect" | null;

export const TRON_RPC =
  process.env.NEXT_PUBLIC_TRON_RPC || "https://api.trongrid.io";

let activeWalletMode: WalletMode = null;
let activeAddress: string | null = null;
let readTronWeb: TronWebType | null = null;
let TronWebCtor: any | null = null;

/* =====================================================
   WALLET STATE
===================================================== */

export function setActiveWalletMode(mode: WalletMode, address?: string | null) {
  activeWalletMode = mode;
  if (address !== undefined) activeAddress = address;
}

export function setActiveAddress(address: string | null) {
  activeAddress = address;
}

function getEffectiveWalletMode(): WalletMode {
  if (activeWalletMode) return activeWalletMode;
  if (isWalletConnectActive()) return "walletconnect";
  if (isTronLinkAvailable()) return "tronlink";
  return null;
}

/* =====================================================
   WALLET DETECTION
===================================================== */

function getInjectedTronWeb(): any | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).tronWeb ||
    (window as any).tronLink?.tronWeb ||
    (window as any).okxwallet?.tronWeb ||
    null
  );
}

async function loadTronWebConstructor(): Promise<any> {
  if (TronWebCtor) return TronWebCtor;

  if (typeof window === "undefined") {
    throw new Error("TronWeb cannot be loaded on the server");
  }

  const mod = await import("tronweb");

  const candidates = [
    (mod as any).TronWeb,
    (mod as any).default?.TronWeb,
    (mod as any).default,
    mod,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      TronWebCtor = candidate;
      return TronWebCtor;
    }
  }

  console.error("Invalid tronweb module shape:", mod);
  throw new Error("Failed to resolve TronWeb constructor");
}

export function isTronLinkAvailable(): boolean {
  return !!getInjectedTronWeb();
}

export function isWalletConnectActive(): boolean {
  const provider = getWalletConnectProvider();
  return (provider?.session?.namespaces?.tron?.accounts ?? []).length > 0;
}

export async function waitForTronLink(): Promise<any> {
  let attempts = 0;
  while (attempts < 50) {
    const tronWeb = getInjectedTronWeb();
    if (
      tronWeb?.ready &&
      tronWeb?.defaultAddress?.base58
    ) {
      return tronWeb;
    }
    await new Promise((r) => setTimeout(r, 200));
    attempts++;
  }
  throw new Error("TronLink not ready");
}

/* =====================================================
   ADDRESS RESOLUTION
===================================================== */

export async function normalizeTronAddress(
  address: string
): Promise<string> {
  if (address.startsWith("T")) return address;

  const tronWeb =
    readTronWeb ||
    (isTronLinkAvailable() ? await waitForTronLink() : null);

  if (tronWeb?.address?.fromHex) {
    return tronWeb.address.fromHex(address);
  }

  throw new Error("Invalid Tron address");
}

export async function getWalletConnectAddress(): Promise<string | null> {
  const provider = getWalletConnectProvider();
  const accounts = provider?.session?.namespaces?.tron?.accounts || [];
  if (!accounts.length) return null;

  const raw = accounts[0].split(":").pop();
  if (!raw) return null;

  return normalizeTronAddress(raw);
}

export async function initWalletConnectSession() {
  try {
    await initWalletConnect();
  } catch (error) {
    console.warn("WalletConnect init skipped:", error);
  }
}

export async function getActiveAddress(): Promise<string | null> {
  const mode = getEffectiveWalletMode();

  if (mode === "walletconnect") {
    return getWalletConnectAddress();
  }

  if (mode === "tronlink") {
    const tronWeb = await waitForTronLink();
    return tronWeb.defaultAddress.base58;
  }

  return null;
}

/* =====================================================
   TRONWEB FACTORIES
===================================================== */

export async function getTronWebForRead(
  address?: string | null
): Promise<TronWebType> {
  if (!readTronWeb) {
    const TronWeb = await loadTronWebConstructor();
    readTronWeb = new TronWeb({ fullHost: TRON_RPC });
  }

  if (address) {
    try {
      readTronWeb!.setAddress(address);
    } catch {
      // Ignore invalid address errors for read-only clients.
    }
  }

  return readTronWeb!;
}

export async function getTronWebForTransactionBuild(): Promise<TronWebType> {
  const address = await getActiveAddress();
  if (!address) throw new Error("No active wallet address.");

  const TronWeb = await loadTronWebConstructor();
  const tronWeb = new TronWeb({ fullHost: TRON_RPC });
  tronWeb.setAddress(address);

  return tronWeb;
}

/* =====================================================
   SIGNING
===================================================== */

export async function signTransaction(transaction: any): Promise<any> {
  const mode = getEffectiveWalletMode();

  if (mode === "walletconnect") {
    const provider = getWalletConnectProvider();
    if (!provider) throw new Error("WalletConnect not initialized");
    const chainId =
      provider?.session?.namespaces?.tron?.chains?.[0] || "tron:0x2b6653dc";

    const hasSignature = (tx: any) =>
      Array.isArray(tx?.signature) && tx.signature.length > 0;

    const normalizeSignedTx = (res: any) => {
      if (!res) return res;
      if (hasSignature(res)) return res;
      if (hasSignature(res?.result)) return res.result;
      if (hasSignature(res?.transaction)) return res.transaction;
      if (hasSignature(res?.signedTransaction)) return res.signedTransaction;
      return res?.result ?? res;
    };

    // Try different param formats — each wallet may expect a different shape.
    // Use a short timeout per attempt: if the wallet doesn't respond in 10s,
    // the format was likely wrong (wallet never opened) → try the next.
    const paramVariants = [
      { transaction },          // { transaction: {...} }
      [transaction],            // [tx]
      transaction,              // tx directly
    ];

    let lastError: any;
    for (const params of paramVariants) {
      try {
        console.log("[WalletConnect] Trying sign with params shape:", 
          Array.isArray(params) ? "array" : typeof params === "object" && params?.transaction ? "{ transaction }" : "raw");
        
        // UniversalProvider.request(args, chainId) is the correct API
        const res = await raceWithTimeout(
          provider.request(
            { method: "tron_signTransaction", params },
            chainId
          ),
          10_000 // 10s — if wallet doesn't open, this format is wrong
        );

        console.log("[WalletConnect] Signing response:", res);
        const signed = normalizeSignedTx(res);
        if (signed && hasSignature(signed)) {
          return signed;
        }
        // Wallet returned something — use it even if signature shape is unusual
        if (res) return signed ?? res;
      } catch (error: any) {
        lastError = error;
        const msg = error?.message?.toLowerCase() || "";
        // User explicitly rejected → stop retrying
        if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
          throw new Error("Transaction was rejected by the wallet.");
        }
        // If it was a timeout, try next format
        if (msg.includes("timed out")) {
          console.log("[WalletConnect] Format timed out, trying next...");
          continue;
        }
        // Other errors — also try next format
        console.warn("[WalletConnect] Format error:", error);
      }
    }

    // All formats failed — last resort: try the nested {chainId, topic, request} shape
    // that some older UniversalProvider versions accept
    const topic = provider?.session?.topic;
    if (topic) {
      try {
        console.log("[WalletConnect] Trying nested request format");
        const res = await provider.request({
          chainId,
          topic,
          request: { method: "tron_signTransaction", params: { transaction } },
        } as any);
        const signed = normalizeSignedTx(res);
        if (signed) return signed;
      } catch (error: any) {
        lastError = error;
      }
    }

    throw lastError || new Error("WalletConnect failed to sign transaction");
  }

  const tronWeb = await waitForTronLink();
  return tronWeb.trx.sign(transaction);
}

/** Race a promise against a timeout. Rejects with message if the timeout fires first. */
function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function signEip712Message(typedData: any): Promise<string> {
  const payload = typeof typedData === "string" ? typedData : JSON.stringify(typedData);
  const mode = getEffectiveWalletMode();

  const buildParamVariants = (address?: string | null) => [
    { message: payload, address },
    { message: payload },
    { data: payload, address },
    { data: payload },
  ];

  if (mode === "walletconnect") {
    const provider = getWalletConnectProvider();
    if (!provider) throw new Error("WalletConnect not initialized");

    const address = await getWalletConnectAddress();
    const methodCandidates = ["tron_signMessage", "tron_signMessageV2"];
    for (const method of methodCandidates) {
      for (const params of buildParamVariants(address)) {
        try {
          return await provider.request({ method, params });
        } catch {
          // Try next method/params.
        }
      }
    }

    throw new Error("WalletConnect does not support message signing.");
  }

  const tronWeb = await waitForTronLink();
  const provider = typeof window !== "undefined" ? (window as any).tronLink : null;
  if (provider?.request) {
    const methodCandidates = ["tron_signMessage", "tron_signMessageV2"];
    for (const method of methodCandidates) {
      for (const params of buildParamVariants(tronWeb?.defaultAddress?.base58)) {
        try {
          return await provider.request({ method, params });
        } catch {
          // Try next method/params.
        }
      }
    }
  }

  if (tronWeb?.trx?.signMessageV2) {
    return tronWeb.trx.signMessageV2(payload);
  }

  if (tronWeb?.trx?.signMessage) {
    return tronWeb.trx.signMessage(payload);
  }

  throw new Error("Wallet does not support message signing.");
}

/* =====================================================
   BROADCAST
===================================================== */

export async function broadcastTransaction(signedTx: any): Promise<any> {
  const tronWeb = await getTronWebForRead();
  return tronWeb.trx.sendRawTransaction(signedTx);
}
