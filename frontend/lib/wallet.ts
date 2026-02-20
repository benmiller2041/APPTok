"use client";

import type { TronWeb as TronWebType } from "tronweb";
import { getWalletConnectProvider, initWalletConnect } from "@/lib/walletconnect";

export type WalletMode = "tronlink" | "walletconnect" | null;

export const TRON_RPC =
  process.env.NEXT_PUBLIC_TRON_RPC || "https://api.trongrid.io";

const TRONGRID_API_KEY = process.env.NEXT_PUBLIC_TRONGRID_API_KEY || "";

/** Headers to send with every TronWeb / TronGrid request */
export function getTronGridHeaders(): Record<string, string> {
  if (!TRONGRID_API_KEY) return {};
  return { "TRON-PRO-API-KEY": TRONGRID_API_KEY };
}

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
    const headers = getTronGridHeaders();
    readTronWeb = new TronWeb({ fullHost: TRON_RPC, headers });
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
  const headers = getTronGridHeaders();
  const tronWeb = new TronWeb({ fullHost: TRON_RPC, headers });
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

      // Normalize a single signature: strip "0x" prefix and ensure it's in an array
      const normalizeSig = (sig: any): string[] | null => {
        if (!sig) return null;
        if (typeof sig === "string" && sig.length >= 100) {
          const cleaned = sig.startsWith("0x") ? sig.slice(2) : sig;
          return [cleaned];
        }
        if (Array.isArray(sig) && sig.length > 0) {
          return sig.map((s: any) => {
            if (typeof s === "string" && s.startsWith("0x")) return s.slice(2);
            return String(s);
          });
        }
        return null;
      };

      // Check for signature on each candidate
      for (const { label, obj } of candidates) {
        if (!obj || typeof obj !== "object") continue;

        const rawSig = obj.signature || obj.signatures;
        const normalizedSig = normalizeSig(rawSig);
        const hasRawData = !!(obj.raw_data || obj.raw_data_hex);

        if (normalizedSig) {
          console.log(`[WC-sign] ✓ Found signature on "${label}", normalized ${normalizedSig.length} sig(s)`);
          obj.signature = normalizedSig;
          // Ensure we return the complete object with BOTH raw_data + signature
          // If this candidate doesn't have raw_data, merge signature into one that does
          if (!hasRawData) {
            console.log(`[WC-sign] "${label}" has sig but no raw_data, merging into original tx`);
            transaction.signature = normalizedSig;
            return transaction;
          }
          return obj;
        }

        if (hasRawData) {
          console.log(`[WC-sign] "${label}" has raw_data but no signature detected (sig type: ${typeof rawSig}, val: ${JSON.stringify(rawSig).slice(0, 100)})`);
        }
      }

      // Check if the original transaction was mutated with a signature
      if (transaction.signature) {
        const mutatedSig = normalizeSig(transaction.signature);
        console.log("[WC-sign] ✓ Original tx was mutated with signature:", typeof transaction.signature);
        if (mutatedSig) transaction.signature = mutatedSig;
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

/**
 * Check if a transaction is already confirmed on-chain.
 * Uses TronWeb (not raw fetch, which gets aborted on mobile browsers).
 */
async function checkTxOnChain(txId: string): Promise<boolean> {
  if (!txId) return false;
  try {
    const tronWeb = await getTronWebForRead();
    const data = await tronWeb.trx.getTransaction(txId);
    const exists = !!(data?.txID || data?.ret);
    console.log(`[checkTxOnChain] txId=${txId}, exists=${exists}`, data ? "(found)" : "(not found)");
    return exists;
  } catch (e) {
    console.warn("[checkTxOnChain] TronWeb check failed:", e);
    return false;
  }
}

/* =====================================================
   SIGN + BROADCAST (handles TrustWallet auto-broadcast)
===================================================== */

/**
 * Sign a transaction and broadcast it.
 *
 * For WalletConnect / TrustWallet:
 *   TrustWallet auto-broadcasts TRON transactions when you approve them.
 *   So we SKIP our own broadcast and just return the txID.
 *   The caller should verify the effect (e.g. check allowance).
 *
 * For TronLink / injected wallets:
 *   We sign locally and broadcast normally.
 */
export async function signAndBroadcast(transaction: any): Promise<string> {
  const mode = getEffectiveWalletMode();
  const originalTxID = transaction?.txID;

  const signedTx = await signTransaction(transaction);

  if (!signedTx) {
    throw new Error("Wallet did not return a signed transaction");
  }

  // ── Extract txID from response ──
  const extractTxId = (obj: any): string | null => {
    if (!obj) return null;
    if (typeof obj === "string" && obj.length >= 60) return obj;
    return obj.txid || obj.txID || obj.hash || obj.transactionId ||
      obj.result?.txid || obj.result?.txID || null;
  };

  const txId = extractTxId(signedTx) || originalTxID;

  // ── Helper: try to broadcast a signed transaction ──
  const tryBroadcast = async (): Promise<string | null> => {
    // Build broadcast candidates from the signed response
    const broadcastCandidates: Array<{ label: string; tx: any }> = [];
    const addCandidate = (label: string, tx: any) => {
      if (tx && typeof tx === "object" && (tx.raw_data || tx.raw_data_hex)) {
        // Ensure signature array exists on the candidate
        if (!tx.signature && signedTx?.signature) {
          tx.signature = signedTx.signature;
        }
        if (tx.signature && tx.signature.length > 0) {
          broadcastCandidates.push({ label, tx });
        }
      }
    };
    addCandidate("signedTx", signedTx);
    addCandidate("signedTx.result", signedTx?.result);
    addCandidate("signedTx.transaction", signedTx?.transaction);
    // Also try the original transaction with signature merged in
    if (transaction && signedTx?.signature) {
      const mergedTx = { ...transaction, signature: signedTx.signature };
      addCandidate("originalTx+sig", mergedTx);
    }
    addCandidate("originalTx", transaction);

    for (const { label, tx } of broadcastCandidates) {
      try {
        console.log(`[signAndBroadcast] Trying broadcast with "${label}"...`);
        const result = await broadcastTransaction(tx);
        if (result.result) {
          console.log(`[signAndBroadcast] ✓ "${label}" broadcast SUCCESS`);
          return result.txid || tx.txID || txId || "broadcast-ok";
        }
        const code = result?.code || result?.message || "";
        const codeStr = typeof code === "string" ? code : JSON.stringify(code);
        if (codeStr.includes("DUP_TRANSACTION")) {
          console.log(`[signAndBroadcast] ✓ "${label}" DUP_TRANSACTION — already broadcast`);
          return result.txid || tx.txID || txId || "tx-already-broadcast";
        }
        console.warn(`[signAndBroadcast] "${label}" broadcast failed:`, codeStr);
      } catch (e: any) {
        console.warn(`[signAndBroadcast] "${label}" broadcast threw:`, e?.message);
      }
    }
    return null;
  };

  // ── WalletConnect flow ──
  // Some wallets (e.g. TrustWallet) auto-broadcast TRON transactions,
  // but others don't. We check on-chain and fall back to manual broadcast.
  if (mode === "walletconnect") {
    // If the wallet returned a plain txid string, it likely auto-broadcast
    if (typeof signedTx === "string") {
      console.log("[signAndBroadcast] WC: wallet returned txid string:", signedTx);
      return signedTx;
    }

    console.log("[signAndBroadcast] WC: Response keys:", signedTx ? Object.keys(signedTx) : "null");
    console.log("[signAndBroadcast] WC: txId:", txId);
    console.log("[signAndBroadcast] WC: has signature?", !!(signedTx?.signature));
    console.log("[signAndBroadcast] WC: signature type:", typeof signedTx?.signature,
      "length:", Array.isArray(signedTx?.signature) ? signedTx.signature.length : "n/a");
    console.log("[signAndBroadcast] WC: has raw_data?", !!(signedTx?.raw_data));
    console.log("[signAndBroadcast] WC: has raw_data_hex?", !!(signedTx?.raw_data_hex));
    console.log("[signAndBroadcast] WC: full response (first 500):", JSON.stringify(signedTx).slice(0, 500));

    // Step 1: Wait a moment for potential auto-broadcast to propagate
    if (txId && txId !== "WC_AUTO_BROADCAST") {
      console.log("[signAndBroadcast] WC: Checking if tx was auto-broadcast...");
      for (let attempt = 1; attempt <= 3; attempt++) {
        const delay = attempt * 2000; // 2s, 4s, 6s
        console.log(`[signAndBroadcast] On-chain check attempt ${attempt}/3, waiting ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        const exists = await checkTxOnChain(txId);
        if (exists) {
          console.log("[signAndBroadcast] ✓ WC: Tx confirmed on-chain (auto-broadcast worked):", txId);
          return txId;
        }
      }
      console.log("[signAndBroadcast] WC: Tx NOT found on-chain after retries.");
    }

    // Step 2: Auto-broadcast didn't work. Try manual broadcast if we have a signature.
    if (signedTx?.signature && signedTx.signature.length > 0) {
      console.log("[signAndBroadcast] WC: Attempting manual broadcast with signed tx...");
      const broadcastResult = await tryBroadcast();
      if (broadcastResult) {
        console.log("[signAndBroadcast] ✓ WC: Manual broadcast succeeded:", broadcastResult);
        return broadcastResult;
      }
      console.warn("[signAndBroadcast] WC: Manual broadcast also failed.");
    } else {
      console.warn("[signAndBroadcast] WC: No signature found on signed tx, cannot manually broadcast.");
    }

    // Step 3: If we still have a txId, return it and let the caller poll for confirmation.
    // This handles edge cases where the tx was broadcast but not yet indexed.
    if (txId && txId !== "WC_AUTO_BROADCAST") {
      console.log("[signAndBroadcast] WC: Returning txId for caller to verify:", txId);
      return txId;
    }

    throw new Error(
      "Transaction was signed but could not be broadcast. " +
      "This may happen if your wallet did not complete the transaction. " +
      "Please ensure you have enough TRX for energy/gas and try again."
    );
  }

  // ── TronLink / injected: broadcast normally ──
  if (typeof signedTx === "string") {
    console.log("[signAndBroadcast] Wallet returned plain string (txid):", signedTx);
    return signedTx;
  }

  const broadcastResult = await tryBroadcast();
  if (broadcastResult) return broadcastResult;

  throw new Error("Transaction broadcast failed. Please try again.");
}
