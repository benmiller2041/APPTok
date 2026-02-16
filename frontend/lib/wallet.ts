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

    /**
     * Check whether a value looks like a valid TRON signature.
     * Signatures are 65-byte hex strings (130 hex chars).
     */
    const isValidSig = (s: any): boolean =>
      typeof s === "string" && /^[0-9a-fA-F]{100,}$/.test(s);

    const hasSignature = (tx: any): boolean => {
      if (!tx) return false;
      // Standard: signature is an array of hex strings
      if (Array.isArray(tx.signature) && tx.signature.length > 0) return true;
      // Some wallets use "signatures" (plural)
      if (Array.isArray(tx.signatures) && tx.signatures.length > 0) return true;
      // Single string signature
      if (isValidSig(tx.signature)) return true;
      return false;
    };

    /**
     * Normalize the signature field to always be an array of hex strings,
     * which is what sendRawTransaction expects.
     */
    const normalizeSig = (tx: any): any => {
      if (!tx) return tx;
      // Already an array — leave it
      if (Array.isArray(tx.signature) && tx.signature.length > 0) return tx;
      // "signatures" key → rename
      if (Array.isArray(tx.signatures) && tx.signatures.length > 0) {
        tx.signature = tx.signatures;
        return tx;
      }
      // Single string → wrap in array
      if (isValidSig(tx.signature)) {
        tx.signature = [tx.signature];
        return tx;
      }
      return tx;
    };

    /**
     * Walk every known wrapper shape until we find a transaction object
     * that carries a signature.
     */
    const extractSignedTx = (res: any): any => {
      if (!res) return res;

      // Direct hit
      if (hasSignature(res)) return normalizeSig(res);

      // Common wrappers from various wallets
      const candidates = [
        res?.result,
        res?.transaction,
        res?.signedTransaction,
        res?.data,
        res?.result?.result,
        res?.result?.transaction,
        res?.result?.signedTransaction,
      ];
      for (const c of candidates) {
        if (c && hasSignature(c)) return normalizeSig(c);
      }

      // If res itself looks like a tx (has raw_data), check again for
      // non-standard signature keys after normalization.
      if (res?.raw_data || res?.raw_data_hex) return normalizeSig(res);
      if (res?.result?.raw_data || res?.result?.raw_data_hex)
        return normalizeSig(res.result);

      return res;
    };

    try {
      console.log("[WalletConnect] Requesting tron_signTransaction, chainId:", chainId);

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
        console.warn("[WalletConnect] Wrapped params failed, trying raw:", firstError);
        res = await provider.request(
          { method: "tron_signTransaction", params: transaction },
          chainId
        );
      }

      console.log(
        "[WalletConnect] Raw signing response type:",
        typeof res,
        "keys:",
        res ? Object.keys(res) : "null",
      );
      console.log(
        "[WalletConnect] Raw signing response (truncated):",
        JSON.stringify(res).slice(0, 800),
      );

      const signed = extractSignedTx(res);

      if (!signed) {
        throw new Error("Wallet returned empty response");
      }

      if (hasSignature(signed)) {
        console.log("[WalletConnect] Signature found on extracted tx");
        return normalizeSig(signed);
      }

      // The wallet may have mutated the original transaction object.
      if (hasSignature(transaction)) {
        console.log("[WalletConnect] Signature found on original tx object (mutated)");
        return normalizeSig(transaction);
      }

      // Return whatever we got — signAndBroadcast will try to broadcast
      // and handle the error appropriately.
      console.warn(
        "[WalletConnect] No signature detected. Returning raw response for broadcast attempt.",
        "signature field:",
        signed?.signature,
        "type:",
        typeof signed?.signature,
      );
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

/* =====================================================
   SIGN + BROADCAST (handles TrustWallet auto-broadcast)
===================================================== */

/**
 * Sign a transaction and broadcast it, correctly handling wallets like
 * TrustWallet that may or may not auto-broadcast via WalletConnect.
 *
 * Strategy: ALWAYS attempt to broadcast when we have a transaction body.
 * - If broadcast succeeds → return txid
 * - If DUP_TRANSACTION → wallet already broadcast, return txid (success)
 * - If "not signed" → wallet didn't actually sign, throw clear error
 *
 * This avoids false positives from checking txID (which always exists
 * on raw transactions, even before signing).
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

  const txId = signedTx?.txid || signedTx?.txID;
  const hasTxBody = signedTx?.raw_data || signedTx?.raw_data_hex;

  // If the response has a tx body (raw_data), ALWAYS try to broadcast.
  // This covers: properly signed tx, auto-broadcast (→ DUP), unsigned (→ clear error).
  if (hasTxBody) {
    console.log(
      "[signAndBroadcast] Broadcasting tx. Has signature:",
      Array.isArray(signedTx?.signature) && signedTx.signature.length > 0,
      "txID:",
      txId,
    );

    const result = await broadcastTransaction(signedTx);
    console.log("[signAndBroadcast] Broadcast result:", JSON.stringify(result).slice(0, 400));

    if (result.result) {
      return result.txid || result.transaction?.txID || txId;
    }

    const code = result?.code || result?.message || "";
    const codeStr = typeof code === "string" ? code : JSON.stringify(code);

    // Wallet already broadcast for us — treat as success.
    if (codeStr.includes("DUP_TRANSACTION")) {
      console.log("[signAndBroadcast] DUP_TRANSACTION — wallet auto-broadcast. txid:", txId);
      return result.txid || txId || "tx-already-broadcast";
    }

    if (codeStr.toLowerCase().includes("not signed")) {
      throw new Error(
        "Your wallet did not sign the transaction. Please try again and confirm the signing prompt in your wallet app."
      );
    }

    throw new Error(result.message || "Transaction broadcast failed");
  }

  // No tx body — the wallet returned a minimal ack (e.g. { result: true }).
  // Check if the original transaction was mutated with a signature.
  if (Array.isArray(transaction?.signature) && transaction.signature.length > 0) {
    console.log("[signAndBroadcast] Original tx mutated with signature, broadcasting it");
    const res = await broadcastTransaction(transaction);

    if (res.result) return res.txid || res.transaction?.txID;

    const code2 = res?.code || res?.message || "";
    const codeStr2 = typeof code2 === "string" ? code2 : JSON.stringify(code2);
    if (codeStr2.includes("DUP_TRANSACTION")) {
      return res.txid || transaction.txID || "tx-already-broadcast";
    }
  }

  // Nothing to broadcast — if we have a txid, return it (might be auto-broadcast)
  if (txId) {
    console.warn("[signAndBroadcast] No tx body, returning txid as-is (possible auto-broadcast):", txId);
    return txId;
  }

  console.warn("[signAndBroadcast] Wallet returned unrecognised response:", signedTx);
  return signedTx?.result?.txid || signedTx?.result?.txID || "tx-auto-broadcast";
}
