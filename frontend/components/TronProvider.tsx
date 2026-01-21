"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  WalletMode,
  getActiveAddress,
  initWalletConnectSession,
  isTronLinkAvailable,
  isWalletConnectActive,
  normalizeTronAddress,
  setActiveAddress,
  setActiveWalletMode,
  waitForTronLink,
} from "@/lib/wallet";
import { connectWalletConnect, disconnectWalletConnect, getWalletConnectProvider } from "@/lib/walletconnect";

interface TronContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionType: WalletMode;
  connect: (type?: WalletMode) => Promise<void>;
  disconnect: () => void;
}

const TronContext = createContext<TronContextType>({
  address: null,
  isConnected: false,
  isConnecting: false,
  connectionType: null,
  connect: async () => {},
  disconnect: () => {},
});

export function useTron() {
  return useContext(TronContext);
}

export function TronProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [connectionType, setConnectionType] = useState<WalletMode>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-detect existing sessions on mount
  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const detect = async () => {
      await initWalletConnectSession();
      if (isWalletConnectActive()) {
        const provider = getWalletConnectProvider();
        const accounts = provider?.session?.namespaces?.tron?.accounts || [];

        if (accounts.length > 0) {
          const rawAddress = accounts[0].includes(":") ? accounts[0].split(":")[2] : accounts[0];
          const normalized = await normalizeTronAddress(rawAddress);
          if (!cancelled) {
            setAddress(normalized);
            setConnectionType("walletconnect");
            setActiveWalletMode("walletconnect", normalized);
            setActiveAddress(normalized);
          }
          return;
        }
      }

      if (
        isTronLinkAvailable() &&
        window.tronWeb?.ready &&
        window.tronWeb.defaultAddress?.base58
      ) {
        const normalized = await normalizeTronAddress(window.tronWeb.defaultAddress.base58);
        if (!cancelled) {
          setAddress(normalized);
          setConnectionType("tronlink");
          setActiveWalletMode("tronlink", normalized);
          setActiveAddress(normalized);
        }
      }
    };

    detect();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  // Listen for account changes only when connected
  useEffect(() => {
    if (!mounted || !address) return;

    if (connectionType === "tronlink") {
      // Only poll for changes if already connected via TronLink
      if (typeof window !== "undefined" && window.tronWeb) {
        const interval = setInterval(async () => {
          try {
            const currentAddr = await getActiveAddress();
            const normalized = currentAddr ? await normalizeTronAddress(currentAddr) : null;
            if (normalized !== address) {
              setAddress(normalized);
              setActiveAddress(normalized);
            }
          } catch (error) {
            if (address) {
              setAddress(null);
              setConnectionType(null);
              setActiveWalletMode(null, null);
              setActiveAddress(null);
            }
          }
        }, 1000);

        return () => clearInterval(interval);
      }
    } else if (connectionType === "walletconnect") {
      // Listen for WalletConnect events
      const provider = getWalletConnectProvider();
      if (provider) {
        const handleAccountsChanged = (accounts: string[]) => {
          if (accounts.length > 0) {
            const rawAddress = accounts[0].includes(":") ? accounts[0].split(":")[2] : accounts[0];
            normalizeTronAddress(rawAddress).then((normalized) => {
              setAddress(normalized);
              setActiveAddress(normalized);
            });
          } else {
            setAddress(null);
            setConnectionType(null);
            setActiveWalletMode(null, null);
            setActiveAddress(null);
          }
        };

        provider.on("accountsChanged", handleAccountsChanged);
        provider.on("disconnect", () => {
          setAddress(null);
          setConnectionType(null);
          setActiveWalletMode(null, null);
          setActiveAddress(null);
        });

        return () => {
          provider.removeListener("accountsChanged", handleAccountsChanged);
          provider.removeListener("disconnect", () => {});
        };
      }
    }
  }, [mounted, address, connectionType]);

  const connect = async (type: WalletMode = "tronlink") => {
    if (connectionType && address && type === connectionType) return;
    setIsConnecting(true);
    
    try {
      if (type === "tronlink") {
        if (!isTronLinkAvailable()) {
          alert("TronLink wallet is not installed. Please install TronLink extension from https://www.tronlink.org/");
          window.open("https://www.tronlink.org/", "_blank");
          setIsConnecting(false);
          return;
        }

        // Request account access
        if (window.tronLink?.request) {
          await window.tronLink.request({ method: "tron_requestAccounts" });
        }

        const tronWeb = await waitForTronLink();
        const addr = await normalizeTronAddress(tronWeb.defaultAddress?.base58);
        
        if (addr) {
          setAddress(addr);
          setConnectionType("tronlink");
          setActiveWalletMode("tronlink", addr);
          setActiveAddress(addr);
        } else {
          throw new Error("No address found. Please unlock TronLink wallet.");
        }
      } else if (type === "walletconnect") {
        const provider = await connectWalletConnect();
        
        // Get accounts from WalletConnect
        const accounts = provider.session?.namespaces?.tron?.accounts || [];
        if (accounts.length > 0) {
          // Extract address from account string (format: "tron:0x2b6653dc:TAddress")
          const rawAddress = accounts[0].includes(":") ? accounts[0].split(":")[2] : accounts[0];
          const addr = await normalizeTronAddress(rawAddress);
          setAddress(addr);
          setConnectionType("walletconnect");
          setActiveWalletMode("walletconnect", addr);
          setActiveAddress(addr);
        } else {
          throw new Error("No accounts found from WalletConnect");
        }
      }
    } catch (error: any) {
      console.error("Failed to connect wallet:", error);
      alert(error.message || "Failed to connect wallet. Please try again.");
      setAddress(null);
      setConnectionType(null);
      setActiveWalletMode(null, null);
      setActiveAddress(null);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (connectionType === "walletconnect") {
      await disconnectWalletConnect();
    }
    setAddress(null);
    setConnectionType(null);
    setActiveWalletMode(null, null);
    setActiveAddress(null);
  };

  const value: TronContextType = {
    address,
    isConnected: !!address,
    isConnecting,
    connectionType,
    connect,
    disconnect,
  };

  return <TronContext.Provider value={value}>{children}</TronContext.Provider>;
}
