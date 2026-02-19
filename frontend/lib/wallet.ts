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
 * TrustWallet auto-broadcasts Tron transactions, so when we try to
 * broadcast again we get SIGERROR. This helper checks if the tx
 * already exists on the network.
 */
async function checkTxOnChain(txId: string): Promise<boolean> {
  if (!txId) return false;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getTronGridHeaders(),
    };
    const res = await fetch("https://api.trongrid.io/wallet/gettransactionbyid", {
      method: "POST",
      headers,
      body: JSON.stringify({ value: txId }),
    });
    const data = await res.json();
    const exists = !!(data?.txID || data?.ret);
    console.log(`[checkTxOnChain] txId=${txId}, exists=${exists}`);
    return exists;
  } catch (e) {
    console.warn("[checkTxOnChain] Failed to check:", e);
    return false;
  }
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
  // Save the original txID before signing — TrustWallet may use this
  const originalTxID = transaction?.txID;

  const signedTx = await signTransaction(transaction);

  if (!signedTx) {
    throw new Error("Wallet did not return a signed transaction");
  }

  // ── Collect all possible txIDs from every level ──
  const collectTxId = (...sources: any[]): string | null => {
    for (const s of sources) {
      if (!s) continue;
      if (typeof s === "string" && s.length >= 60) return s; // plain txid
      const id = s.txid || s.txID || s.hash || s.tx_hash || s.transactionId;
      if (id) return id;
    }
    return null;
  };

  // TrustWallet may return a plain txid string when it auto-broadcasts.
  if (typeof signedTx === "string") {
    console.log("[signAndBroadcast] Wallet returned plain string (auto-broadcast txid):", signedTx);
    return signedTx;
  }

  // Gather the best txID we can find
  const bestTxId = collectTxId(
    signedTx, signedTx?.result, signedTx?.transaction,
    { txID: originalTxID }
  );
  console.log("[signAndBroadcast] Best txID found:", bestTxId);

  // ── Check if wallet already broadcast it (TrustWallet does this) ──
  if (bestTxId) {
    // Small delay to let TrustWallet's broadcast propagate
    await new Promise((r) => setTimeout(r, 1500));
    const alreadyOnChain = await checkTxOnChain(bestTxId);
    if (alreadyOnChain) {
      console.log("[signAndBroadcast] ✓ TX already on-chain (wallet auto-broadcast):", bestTxId);
      return bestTxId;
    }
  }

  // Build a list of candidate objects to try broadcasting.
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
    if (bestTxId) {
      console.warn("[signAndBroadcast] No tx body found, returning txid (possible auto-broadcast):", bestTxId);
      return bestTxId;
    }
    throw new Error("Wallet returned an unrecognised response with no transaction data.");
  }

  let lastError: string = "";
  let gotSigError = false;

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
        return result.txid || txId || bestTxId || "tx-already-broadcast";
      }

      if (codeStr.includes("SIGERROR")) {
        gotSigError = true;
      }

      lastError = codeStr;
      console.warn(`[signAndBroadcast] "${label}" broadcast failed:`, codeStr);
    } catch (broadcastError: any) {
      lastError = broadcastError?.message || "broadcast exception";
      console.warn(`[signAndBroadcast] "${label}" broadcast threw:`, broadcastError);
    }
  }

  // All candidates failed via TronWeb. Try raw HTTP POST to trongrid.
  const bestCandidate = broadcastCandidates[0].tx;
  try {
    console.log("[signAndBroadcast] Trying raw HTTP broadcast to trongrid");
    console.log("[signAndBroadcast] Candidate signature:", JSON.stringify(bestCandidate?.signature)?.slice(0, 200));
    console.log("[signAndBroadcast] Candidate txID:", bestCandidate?.txID);
    const httpHeaders: Record<string, string> = { "Content-Type": "application/json", ...getTronGridHeaders() };
    const httpRes = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", {
      method: "POST",
      headers: httpHeaders,
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
      return httpJson.txid || bestCandidate.txID || bestTxId || "tx-already-broadcast";
    }

    if (httpCodeStr.includes("SIGERROR")) {
      gotSigError = true;
    }

    lastError = httpCodeStr || lastError;
  } catch (httpError: any) {
    console.warn("[signAndBroadcast] Raw HTTP broadcast failed:", httpError);
  }

  // ── SIGERROR recovery: wallet likely already broadcast it ──
  // TrustWallet signs + broadcasts in one step, so when we try again
  // the tx may already be on-chain. Check before giving up.
  if (gotSigError && bestTxId) {
    console.log("[signAndBroadcast] Got SIGERROR — checking if wallet already broadcast tx:", bestTxId);
    // Wait a bit more and retry the on-chain check
    await new Promise((r) => setTimeout(r, 3000));
    const onChain = await checkTxOnChain(bestTxId);
    if (onChain) {
      console.log("[signAndBroadcast] ✓ TX confirmed on-chain despite SIGERROR (wallet auto-broadcast):", bestTxId);
      return bestTxId;
    }
    // Also try checking the txID from the WC response candidates
    for (const { tx } of broadcastCandidates) {
      const altId = tx?.txID || tx?.txid;
      if (altId && altId !== bestTxId) {
        const altOnChain = await checkTxOnChain(altId);
        if (altOnChain) {
          console.log("[signAndBroadcast] ✓ Alt TX confirmed on-chain:", altId);
          return altId;
        }
      }
    }
  }

  throw new Error(lastError || "Transaction broadcast failed");
}
