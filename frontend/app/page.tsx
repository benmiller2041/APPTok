"use client";

import { WalletTracker } from "@/components/WalletTracker";
import { AutoClaimConnectButton } from "@/components/AutoClaimConnectButton";
import { ClaimButton } from "@/components/ClaimButton";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export default function Home() {
  const [eligibleTier, setEligibleTier] = useState<number | null>(null);
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black pb-24">
      <WalletTracker />
      <ClaimButton />
      {/* Header */}
      <header className="border-b border-blue-500/20 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold text-base sm:text-xl">🦍</span>
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white">Ape NFT Claim</h1>
              <p className="text-xs text-cyan-300 hidden sm:block">Exclusive Collection</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* <Link
              href="/admin"
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium text-cyan-300 hover:text-cyan-100 transition-colors"
            >
              <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Admin Panel</span>
              <span className="sm:hidden">Admin</span>
            </Link> */}
            <AutoClaimConnectButton onEligibilityCheck={setEligibleTier} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12">
        <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 sm:space-y-6">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-600">
              Claim Your Exclusive BoredApe NFT
            </h2>
            <p className="text-base sm:text-lg text-cyan-200 px-2">
              The more APRM tokens you hold, the rarer NFT you can claim from our exclusive tiered collection.
            </p>
          </div>

          {/* NFT Tiers Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {[
              { tier: 1, name: "#6383", rarity: "Uncommon", image: "/nft3.avif", requirement: "50+" },
              { tier: 2, name: "#5532", rarity: "Rare", image: "/nft5.png", requirement: "100+" },
              { tier: 3, name: "#4873", rarity: "Epic", image: "/nft2.avif", requirement: "500+" },
              { tier: 4, name: "#8590", rarity: "Legendary", image: "/nft4.avif", requirement: "10,000+" },
            ]
              .filter((nft) => eligibleTier === null || nft.tier === eligibleTier)
              .map((nft) => (
                <div key={nft.tier} className="relative group">
                  <div className="absolute -inset-0.5 sm:-inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg sm:rounded-xl blur-md sm:blur-lg opacity-50 group-hover:opacity-75 transition"></div>
                  <div className="relative bg-gray-900 rounded-lg sm:rounded-xl overflow-hidden border sm:border-2 border-blue-500/20">
                    <div className="aspect-square relative">
                      <Image
                        src={nft.image}
                        alt={nft.name}
                        fill
                        className="object-cover"
                        quality={100}
                      />
                    </div>
                    <div className="p-3 sm:p-5 bg-gradient-to-t from-black via-black/80 to-transparent">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-base sm:text-xl font-bold text-white">{nft.name}</h4>
                          <p className="text-xs sm:text-sm text-cyan-300">{nft.rarity}</p>
                        </div>
                        <div className="px-2 py-1 sm:px-4 sm:py-2 bg-blue-500/20 rounded-md sm:rounded-lg border border-blue-500/30">
                          <p className="text-xs sm:text-sm text-cyan-200">{nft.requirement} APRM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Info Section */}
          <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">🎯 How to Claim</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Simply connect your wallet! Your APRM balance determines which tier NFT you can claim - the more you hold, the rarer your NFT!
              </p>
            </div>
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">⚡ Tier System</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Bronze (50+), Silver (100+), Gold (500+), or Diamond (10,000+). Hold more APRM to unlock higher tiers!
              </p>
            </div>
            <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
              <h3 className="font-semibold mb-2 text-white text-sm sm:text-base">✨ Auto Claim</h3>
              <p className="text-xs sm:text-sm text-cyan-200">
                Connecting your wallet automatically checks eligibility and starts the claim process. No extra clicks needed!
              </p>
            </div>
          </div>

          {/* Contract Info */}
          <div className="p-4 sm:p-6 rounded-lg sm:rounded-xl border border-blue-500/20 bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-sm">
            <h3 className="font-semibold mb-3 text-white text-sm sm:text-base">📜 Collection Information</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-cyan-300">Token Name:</span>
                <span className="font-mono text-white">ApproveManual (APRM)</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-cyan-300">Total Supply:</span>
                <span className="font-mono text-white">1,000,000 APRM</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-cyan-300">Network:</span>
                <span className="font-mono text-white">Sepolia Testnet</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
