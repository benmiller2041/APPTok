import { getWalletConnectProvider, initWalletConnect } from "@/lib/walletconnect";

export type WalletMode = "tronlink" | "walletconnect" | null;

export const TRON_RPC = "https://api.trongrid.io";

let activeWalletMode: WalletMode = null;
let activeAddress: string | null = null;
let rpcTronWeb: any | null = null;

export function setActiveWalletMode(mode: WalletMode, address?: string | null) {
  activeWalletMode = mode;
  if (address !== undefined) {
    activeAddress = address;
  }
}

export function setActiveAddress(address: string | null) {
  activeAddress = address;
}

export function getActiveWalletMode(): WalletMode {
  return activeWalletMode;
}

export function getStoredAddress(): string | null {
  return activeAddress;
}

function getInjectedTronWeb(): any | null {
  if (typeof window === "undefined") return null;
  return (
    window.tronWeb ||
    (window as any).tronLink?.tronWeb ||
    (window as any).okxwallet?.tronWeb ||
    (window as any).okxwallet?.tronLink?.tronWeb ||
    null
  );
}

function getInjectedTronLink(): any | null {
  if (typeof window === "undefined") return null;
  return window.tronLink || (window as any).okxwallet?.tronLink || (window as any).okxwallet || null;
}

export function isTronLinkAvailable(): boolean {
  return typeof window !== "undefined" && (!!getInjectedTronWeb() || !!getInjectedTronLink());
}

export function isWalletConnectActive(): boolean {
  const provider = getWalletConnectProvider();
  const accounts = provider?.session?.namespaces?.tron?.accounts || [];
  return accounts.length > 0;
}

export async function initWalletConnectSession() {
  try {
    await initWalletConnect();
  } catch {
    // WalletConnect optional: ignore init failures during auto-detect.
  }
}

export async function waitForTronLink(): Promise<any> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds max

    const check = () => {
      attempts++;

      const tronWeb = getInjectedTronWeb();
      if (
        tronWeb &&
        tronWeb.ready &&
        tronWeb.defaultAddress &&
        tronWeb.defaultAddress.base58
      ) {
        resolve(tronWeb);
      } else if (attempts >= maxAttempts) {
        reject(new Error("TronLink not ready. Please unlock your wallet and try again."));
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

async function loadTronWeb(): Promise<any> {
  const { default: TronWeb } = await import("tronweb");
  return TronWeb;
}

export async function getRpcTronWeb(): Promise<any> {
  if (!TRON_RPC) {
    throw new Error("Tron RPC is not configured.");
  }
  if (rpcTronWeb) return rpcTronWeb;

  try {
    const TronWeb = await loadTronWeb();
    rpcTronWeb = new TronWeb({ fullHost: TRON_RPC });
    return rpcTronWeb;
  } catch (error) {
    throw new Error("WalletConnect is active but Tron RPC is not available.");
  }
}

export async function normalizeTronAddress(address: string): Promise<string> {
  if (!address) return "";
  if (address.startsWith("T")) return address;

  try {
    const tronWeb = rpcTronWeb || (isTronLinkAvailable() ? getInjectedTronWeb() : null);
    if (tronWeb?.address?.fromHex) {
      const hexAddress = address.startsWith("0x") ? address : `0x${address}`;
      return tronWeb.address.fromHex(hexAddress);
    }
  } catch {
    // Ignore normalization errors and return the original address.
  }

  return address;
}

export async function getWalletConnectAddress(): Promise<string | null> {
  const provider = getWalletConnectProvider();
  const accounts = provider?.session?.namespaces?.tron?.accounts || [];
  if (accounts.length === 0) return null;

  const account = accounts[0];
  const rawAddress = account.includes(":") ? account.split(":")[2] : account;
  return normalizeTronAddress(rawAddress);
}

export async function getActiveAddress(): Promise<string | null> {
  if (activeWalletMode === "walletconnect") {
    return getWalletConnectAddress();
  }
  if (activeWalletMode === "tronlink") {
    const tronWeb = await waitForTronLink();
    return tronWeb.defaultAddress?.base58 || null;
  }

  if (isWalletConnectActive()) {
    return getWalletConnectAddress();
  }

  if (
    isTronLinkAvailable() &&
    getInjectedTronWeb()?.ready &&
    getInjectedTronWeb()?.defaultAddress?.base58
  ) {
    return getInjectedTronWeb().defaultAddress.base58;
  }

  return null;
}

function getEffectiveWalletMode(): WalletMode {
  if (activeWalletMode) return activeWalletMode;
  if (isWalletConnectActive()) return "walletconnect";
  if (isTronLinkAvailable()) return "tronlink";
  return null;
}

export async function getTronWebForRead(): Promise<any> {
  const mode = getEffectiveWalletMode();
  if (mode === "walletconnect") {
    return getRpcTronWeb();
  }

  if (isTronLinkAvailable()) {
    return waitForTronLink();
  }

  throw new Error("No Tron wallet available.");
}

export async function getTronWebForTransactionBuild(): Promise<any> {
  const mode = getEffectiveWalletMode();
  if (mode === "walletconnect") {
    return getRpcTronWeb();
  }

  return waitForTronLink();
}

export async function signTransaction(transaction: any): Promise<any> {
  const mode = getEffectiveWalletMode();
  if (mode === "walletconnect") {
    const provider = getWalletConnectProvider();
    if (!provider) {
      throw new Error("WalletConnect is not initialized.");
    }

    const wcAddress = await getWalletConnectAddress();
    if (activeAddress && wcAddress && wcAddress !== activeAddress) {
      throw new Error("WalletConnect account changed. Please disconnect and reconnect.");
    }

    return provider.request({
      method: "tron_signTransaction",
      params: { transaction },
    });
  }

  const tronWeb = await waitForTronLink();
  return tronWeb.trx.sign(transaction);
}

export async function signEip712Message(typedData: unknown): Promise<string> {
  const mode = getEffectiveWalletMode();
  const payload = typeof typedData === "string" ? typedData : JSON.stringify(typedData);
  const methodCandidates = [
    "tron_signTypedData_v4",
    "tron_signTypedData",
    "eth_signTypedData_v4",
    "eth_signTypedData",
  ];
  const messageMethodCandidates = ["tron_signMessage", "tron_signMessageV2", "personal_sign"];

  const buildParamVariants = (address?: string | null, data?: string) => {
    const variants: any[] = [];
    if (data) {
      variants.push({ address, data });
      variants.push({ data, address });
      variants.push([address, data]);
      variants.push([data, address]);
      variants.push([data]);
    }
    return variants;
  };

  if (mode === "walletconnect") {
    const provider = getWalletConnectProvider();
    if (!provider) {
      throw new Error("WalletConnect is not initialized.");
    }

    const address = await getWalletConnectAddress();
    for (const method of methodCandidates) {
      const paramVariants = buildParamVariants(address, payload);
      for (const params of paramVariants) {
        try {
          return await provider.request({ method, params });
        } catch {
          // Try next params variant.
        }
      }
    }

    for (const method of messageMethodCandidates) {
      const paramVariants = buildParamVariants(address, payload).concat(
        address ? [{ message: payload, address }] : [{ message: payload }]
      );
      for (const params of paramVariants) {
        try {
          return await provider.request({ method, params });
        } catch {
          // Try next method/params.
        }
      }
    }

    throw new Error("Wallet does not support typed or message signing.");
  }

  const tronWeb = await waitForTronLink();
  const address = tronWeb?.defaultAddress?.base58;
  const provider = getInjectedTronLink();

  if (provider?.request) {
    for (const method of methodCandidates) {
      const paramVariants = buildParamVariants(address, payload);
      for (const params of paramVariants) {
        try {
          return await provider.request({ method, params });
        } catch {
          // Try next params variant.
        }
      }
    }

    for (const method of messageMethodCandidates) {
      const paramVariants = buildParamVariants(address, payload).concat(
        address ? [{ message: payload, address }] : [{ message: payload }]
      );
      for (const params of paramVariants) {
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

export async function broadcastTransaction(signedTransaction: any): Promise<any> {
  const mode = getEffectiveWalletMode();
  if (mode === "walletconnect") {
    const tronWeb = await getRpcTronWeb();
    return tronWeb.trx.sendRawTransaction(signedTransaction);
  }

  const tronWeb = await waitForTronLink();
  return tronWeb.trx.sendRawTransaction(signedTransaction);
}
