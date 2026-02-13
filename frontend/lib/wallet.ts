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

  let tronWeb =
    readTronWeb ||
    (isTronLinkAvailable() ? await waitForTronLink() : null);

  if (!tronWeb) {
    tronWeb = await getTronWebForRead();
  }

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

    const session = provider.session;
    if (!session?.topic) {
      throw new Error("WalletConnect session expired. Please reconnect your wallet.");
    }

    const chainId =
      session.namespaces?.tron?.chains?.[0] || "tron:0x2b6653dc";

    const hasSignature = (tx: any) =>
      Array.isArray(tx?.signature) && tx.signature.length > 0;

    /**
     * TrustWallet / various TRON wallets return signed transactions in
     * wildly different shapes.  Walk every known wrapper until we find
     * an object that carries a `signature` array.  If nothing matches,
     * return whatever the wallet gave us and let broadcast try anyway.
     */
    const extractSignedTx = (res: any): any => {
      if (!res) return res;

      // Direct hit
      if (hasSignature(res)) return res;

      // Common wrappers
      const candidates = [
        res?.result,
        res?.transaction,
        res?.signedTransaction,
        res?.raw_data ? res : null,             // already the tx itself
      ];
      for (const c of candidates) {
        if (c && hasSignature(c)) return c;
      }

      // TrustWallet sometimes returns { result: <signed-tx> } where
      // <signed-tx> has signature.  Or it might nest one level deeper.
      if (res?.result?.result && hasSignature(res.result.result)) {
        return res.result.result;
      }

      // If we still found nothing but `res` looks like a transaction
      // (has raw_data / raw_data_hex), the signature might be at a
      // non-standard key.  Merge it back and hope broadcast accepts it.
      if (res?.raw_data || res?.raw_data_hex) return res;
      if (res?.result?.raw_data || res?.result?.raw_data_hex) return res.result;

      return res;
    };

    try {
      console.log("[WalletConnect] Requesting tron_signTransaction, chainId:", chainId);

      // TrustWallet and most TRON wallets via WalletConnect v2 expect
      // params as { transaction: <tx-object> }.  Some older integrations
      // expect the raw tx directly.  We try the wrapped format first —
      // if the wallet doesn't recognise it, we fall back.
      let res: any;
      try {
        res = await provider.request(
          { method: "tron_signTransaction", params: { transaction } },
          chainId
        );
      } catch (firstError: any) {
        const msg1 = firstError?.message?.toLowerCase() || "";
        // If user rejected, don't retry with a different format
        if (msg1.includes("reject") || msg1.includes("denied") || msg1.includes("cancel")) {
          throw firstError;
        }
        console.warn("[WalletConnect] Wrapped params failed, trying raw:", firstError);
        // Fallback: send the raw transaction as params
        res = await provider.request(
          { method: "tron_signTransaction", params: transaction },
          chainId
        );
      }

      console.log("[WalletConnect] Raw signing response:", JSON.stringify(res).slice(0, 500));

      const signed = extractSignedTx(res);

      if (!signed) {
        throw new Error("Wallet returned empty response");
      }

      // If the extracted object has a signature, great — return it.
      if (hasSignature(signed)) {
        return signed;
      }

      // Last resort: the wallet may have merged the signature into the
      // original transaction object that was passed by reference.
      // Check if our input `transaction` now has a signature.
      if (hasSignature(transaction)) {
        console.log("[WalletConnect] Signature found on original tx object");
        return transaction;
      }

      // Return whatever we got — broadcastTransaction will surface
      // a clear error if it's truly unsigned.
      console.warn("[WalletConnect] No signature found, returning raw response");
      return signed;
    } catch (error: any) {
      console.error("[WalletConnect] Signing error:", error);
      const msg = error?.message?.toLowerCase() || "";
      if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
        throw new Error("Transaction was rejected by the wallet.");
      }
      if (msg.includes("expired") || msg.includes("no matching key") || msg.includes("tag")) {
        throw new Error("WalletConnect session expired. Please disconnect and reconnect your wallet.");
      }
      throw error;
    }
  }

  const tronWeb = await waitForTronLink();
  return tronWeb.trx.sign(transaction);
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
