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

    try {
      console.log("[WC-sign] Requesting tron_signTransaction, chainId:", chainId);
      console.log("[WC-sign] Input tx keys:", Object.keys(transaction));
      console.log("[WC-sign] Input tx.txID:", transaction?.txID);

      let res: any;
      try {
        res = await provider.request(
          { method: "tron_signTransaction", params: { transaction } },
          chainId
        );
      } catch (firstError: any) {
        const msg1 = firstError?.message?.toLowerCase() || "";
        if (msg1.includes("reject") || msg1.includes("denied") || msg1.includes("cancel")) {
          throw firstError;
        }
        console.warn("[WC-sign] Wrapped params failed, trying raw:", firstError);
        res = await provider.request(
          { method: "tron_signTransaction", params: transaction },
          chainId
        );
      }

      // ── Exhaustive logging of the response ──
      console.log("[WC-sign] Response typeof:", typeof res);
      if (typeof res === "string") {
        console.log("[WC-sign] String response:", res);
        return res; // might be a txid
      }

      const resKeys = res ? Object.keys(res) : [];
      console.log("[WC-sign] Response keys:", resKeys);
      console.log("[WC-sign] Response JSON (first 1200 chars):", JSON.stringify(res).slice(0, 1200));

      // Log signature-related fields specifically
      console.log("[WC-sign] res.signature:", res?.signature, "type:", typeof res?.signature);
      console.log("[WC-sign] res.signatures:", res?.signatures);
      console.log("[WC-sign] res.result type:", typeof res?.result, "keys:", res?.result ? Object.keys(res.result) : "n/a");
      if (res?.result && typeof res.result === "object") {
        console.log("[WC-sign] res.result.signature:", res.result?.signature);
      }

      // ── Find the signed transaction in every possible shape ──
      // Build a list of all candidate objects that might be the signed tx
      const candidates: Array<{ label: string; obj: any }> = [
        { label: "res", obj: res },
        { label: "res.result", obj: res?.result },
        { label: "res.transaction", obj: res?.transaction },
        { label: "res.signedTransaction", obj: res?.signedTransaction },
        { label: "res.data", obj: res?.data },
      ];
      // Also try 2-level nesting
      if (res?.result && typeof res.result === "object") {
        candidates.push(
          { label: "res.result.result", obj: res.result?.result },
          { label: "res.result.transaction", obj: res.result?.transaction },
          { label: "res.result.signedTransaction", obj: res.result?.signedTransaction },
        );
      }

      // Check for signature on each candidate
      for (const { label, obj } of candidates) {
        if (!obj || typeof obj !== "object") continue;

        const sig = obj.signature || obj.signatures;
        const hasSigArray = Array.isArray(sig) && sig.length > 0;
        const hasSigString = typeof sig === "string" && sig.length >= 100;
        const hasRawData = !!(obj.raw_data || obj.raw_data_hex);

        if (hasSigArray || hasSigString) {
          console.log(`[WC-sign] ✓ Found signature on "${label}"`, hasSigArray ? "(array)" : "(string)");
          // Normalize signature to array
          if (hasSigString) obj.signature = [sig];
          else if (obj.signatures && !obj.signature) {
            obj.signature = obj.signatures;
          }
          return obj;
        }

        if (hasRawData) {
          console.log(`[WC-sign] "${label}" has raw_data but no signature detected (sig type: ${typeof sig}, val: ${JSON.stringify(sig).slice(0, 100)})`);
        }
      }

      // Check if the original transaction was mutated with a signature
      if (transaction.signature) {
        console.log("[WC-sign] ✓ Original tx was mutated with signature:", typeof transaction.signature);
        if (typeof transaction.signature === "string") {
          transaction.signature = [transaction.signature];
        }
        return transaction;
      }

      // Return the best candidate we have (prefer one with raw_data)
      for (const { label, obj } of candidates) {
        if (obj && typeof obj === "object" && (obj.raw_data || obj.raw_data_hex)) {
          console.warn(`[WC-sign] Returning "${label}" (has raw_data, no detected signature)`);
          return obj;
        }
      }

      console.warn("[WC-sign] No signed tx found, returning raw response");
      return res;
    } catch (error: any) {
      console.error("[WC-sign] Signing error:", error);
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

/* =====================================================
   SIGN + BROADCAST (handles TrustWallet auto-broadcast)
===================================================== */

/**
 * Sign a transaction and broadcast it, correctly handling wallets like
 * TrustWallet that may or may not auto-broadcast via WalletConnect.
 *
 * Strategy: ALWAYS attempt to broadcast. Try multiple candidates.
 * - If broadcast succeeds → return txid
 * - If DUP_TRANSACTION → wallet already broadcast, return txid (success)
 * - If "not signed" on ALL candidates → throw clear error
 */
export async function signAndBroadcast(transaction: any): Promise<string> {
  const signedTx = await signTransaction(transaction);

  if (!signedTx) {
    throw new Error("Wallet did not return a signed transaction");
  }

  // TrustWallet may return a plain txid string when it auto-broadcasts.
  if (typeof signedTx === "string") {
    console.log("[signAndBroadcast] Wallet returned plain string (auto-broadcast txid):", signedTx);
    return signedTx;
  }

  // Build a list of candidate objects to try broadcasting.
  // The wallet may return the signed tx at the top level, nested,
  // or mutate the original transaction object in-place.
  const broadcastCandidates: Array<{ label: string; tx: any }> = [];

  const addCandidate = (label: string, tx: any) => {
    if (tx && typeof tx === "object" && (tx.raw_data || tx.raw_data_hex)) {
      broadcastCandidates.push({ label, tx });
    }
  };

  addCandidate("signedTx", signedTx);
  addCandidate("signedTx.result", signedTx?.result);
  addCandidate("signedTx.transaction", signedTx?.transaction);
  addCandidate("originalTx", transaction);  // might have been mutated

  console.log(
    "[signAndBroadcast] Broadcast candidates:",
    broadcastCandidates.map((c) => c.label),
  );

  if (broadcastCandidates.length === 0) {
    // No tx body anywhere — check if we got a txid
    const txId = signedTx?.txid || signedTx?.txID || signedTx?.result?.txid || signedTx?.result?.txID;
    if (txId) {
      console.warn("[signAndBroadcast] No tx body found, returning txid (possible auto-broadcast):", txId);
      return txId;
    }
    throw new Error("Wallet returned an unrecognised response with no transaction data.");
  }

  let lastError: string = "";

  for (const { label, tx } of broadcastCandidates) {
    const hasSig = Array.isArray(tx?.signature) && tx.signature.length > 0;
    const txId = tx?.txid || tx?.txID;

    console.log(
      `[signAndBroadcast] Trying "${label}": hasSig=${hasSig}, txID=${txId}, keys=${Object.keys(tx)}`,
    );

    try {
      const result = await broadcastTransaction(tx);
      console.log(
        `[signAndBroadcast] "${label}" broadcast result:`,
        JSON.stringify(result).slice(0, 400),
      );

      if (result.result) {
        console.log(`[signAndBroadcast] ✓ "${label}" broadcast SUCCESS`);
        return result.txid || result.transaction?.txID || txId;
      }

      const code = result?.code || result?.message || "";
      const codeStr = typeof code === "string" ? code : JSON.stringify(code);

      if (codeStr.includes("DUP_TRANSACTION")) {
        console.log(`[signAndBroadcast] ✓ "${label}" DUP_TRANSACTION — already on-chain`);
        return result.txid || txId || "tx-already-broadcast";
      }

      lastError = codeStr;
      console.warn(`[signAndBroadcast] "${label}" broadcast failed:`, codeStr);
    } catch (broadcastError: any) {
      lastError = broadcastError?.message || "broadcast exception";
      console.warn(`[signAndBroadcast] "${label}" broadcast threw:`, broadcastError);
    }
  }

  // All candidates failed. Try one more thing: raw HTTP POST to trongrid.
  // This bypasses any TronWeb serialization issues.
  const bestCandidate = broadcastCandidates[0].tx;
  try {
    console.log("[signAndBroadcast] Last resort: raw HTTP broadcast to trongrid");
    const httpRes = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bestCandidate),
    });
    const httpJson = await httpRes.json();
    console.log("[signAndBroadcast] Raw HTTP result:", JSON.stringify(httpJson).slice(0, 400));

    if (httpJson.result) {
      return httpJson.txid || bestCandidate.txID || "tx-http-broadcast";
    }

    const httpCode = httpJson?.code || httpJson?.message || "";
    const httpCodeStr = typeof httpCode === "string" ? httpCode : JSON.stringify(httpCode);

    if (httpCodeStr.includes("DUP_TRANSACTION")) {
      return httpJson.txid || bestCandidate.txID || "tx-already-broadcast";
    }

    if (httpCodeStr.toLowerCase().includes("not signed")) {
      throw new Error(
        "Your wallet did not sign the transaction. Please try again and confirm the signing prompt in your wallet app."
      );
    }

    lastError = httpCodeStr || lastError;
  } catch (httpError: any) {
    if (httpError.message?.includes("did not sign")) throw httpError;
    console.warn("[signAndBroadcast] Raw HTTP broadcast failed:", httpError);
  }

  throw new Error(lastError || "Transaction broadcast failed");
}
