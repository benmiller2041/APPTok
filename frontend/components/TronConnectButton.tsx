"use client";

import { useState, useEffect } from "react";
import { useTron } from "./TronProvider";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, ChevronDown } from "lucide-react";
import { formatAddress } from "@/lib/tron";
import { isTronLinkAvailable } from "@/lib/wallet";

export function TronConnectButton() {
  const { address, isConnected, isConnecting, connectionType, connect, disconnect } = useTron();
  const [showMenu, setShowMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if user is on mobile device
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || window.innerWidth < 768;
      setIsMobile(mobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-connect based on device type and wallet availability
  const handleConnect = () => {
    if (isMobile) {
      // On mobile, only expose WalletConnect to avoid TronLink UI
      connect("walletconnect");
    } else {
      setShowMenu(!showMenu);
    }
  };

  if (isConnecting) {
    return (
      <Button disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting...
      </Button>
    );
  }

  if (isConnected && address) {
    return (
      <Button
        variant="outline"
        onClick={disconnect}
        className="gap-2 border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-950/50 text-cyan-300"
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">
          {formatAddress(address, 6)}
        </span>
        <span className="sm:hidden">
          {formatAddress(address, 3)}
        </span>
        <span className="text-xs opacity-70 hidden md:inline">
          ({connectionType === "tronlink" ? "TronLink" : "WalletConnect"})
        </span>
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        onClick={handleConnect}
        className="gap-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700"
      >
        <Wallet className="h-4 w-4" />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
        <ChevronDown className="h-3 w-3" />
      </Button>
      
      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-xl z-20 overflow-hidden">
            {!isMobile && isTronLinkAvailable() && (
              <button
                onClick={() => {
                  connect("tronlink");
                  setShowMenu(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-cyan-500/10 transition-colors border-b border-cyan-500/20 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold">
                  TL
                </div>
                <div>
                  <div className="text-white font-medium">TronLink</div>
                  <div className="text-xs text-cyan-400">Browser Extension</div>
                </div>
              </button>
            )}
            
            <button
              onClick={() => {
                connect("walletconnect");
                setShowMenu(false);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-cyan-500/10 transition-colors flex items-center gap-3 ${!isMobile && isTronLinkAvailable() ? "" : "border-t border-cyan-500/20"}`}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                WC
              </div>
              <div>
                <div className="text-white font-medium">WalletConnect</div>
                <div className="text-xs text-cyan-400">TrustWallet & Other Wallets</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
