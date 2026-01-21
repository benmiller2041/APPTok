"use client";

import { useEffect, useState } from "react";
import { useTron } from "./TronProvider";
import { authReadyPromise, db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { TOKEN_ADDRESS, getTokenBalance, fromSun } from "@/lib/tron";

export function WalletTracker() {
  const { address, isConnected } = useTron();
  const [balance, setBalance] = useState<bigint>(BigInt(0));

  // Fetch balance when address changes
  useEffect(() => {
    if (!address || !isConnected) {
      setBalance(BigInt(0));
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await getTokenBalance(TOKEN_ADDRESS, address);
        setBalance(bal);
      } catch (error) {
        console.error("Error fetching balance:", error);
      }
    };

    fetchBalance();
    
    // Poll for balance updates every 10 seconds
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [address, isConnected]);

  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;
    
    const trackWallet = async () => {
      if (!db) {
        console.warn("Firebase db not initialized, skipping wallet tracking");
        return;
      }

      if (authReadyPromise) {
        await authReadyPromise;
      }

      if (isConnected && address) {
        try {
          const domain = window.location.hostname;
          console.log("🔍 Checking wallet:", address);
          console.log("💰 Balance data:", balance);
          
          const walletsRef = collection(db, "connected_wallets");
          const walletDocRef = doc(walletsRef, address);

          // Check if wallet already exists
          const walletSnapshot = await getDoc(walletDocRef);

          const balanceInTokens = balance ? fromSun(balance.toString(), 6) : "0";
          console.log("💵 Balance in tokens:", balanceInTokens);

          if (walletSnapshot.exists()) {
            // Wallet exists - update lastConnected timestamp and balance
            console.log("📝 Updating existing wallet:", address);
            await setDoc(
              walletDocRef,
              {
                address,
                lastConnected: serverTimestamp(),
                balance: balanceInTokens,
                domain,
              },
              { merge: true }
            );
            console.log("✅ Wallet lastConnected and balance updated:", address, balanceInTokens, "USDT");
          } else {
            // New wallet - save with firstSeen, lastConnected, and balance
            console.log("🆕 New wallet detected, saving:", address);
            await setDoc(walletDocRef, {
              address,
              firstSeen: serverTimestamp(),
              lastConnected: serverTimestamp(),
              balance: balanceInTokens,
              domain,
            });
            console.log("✅ New wallet saved to Firestore:", address, balanceInTokens, "USDT");
          }
        } catch (error: any) {
          console.error("❌ Error tracking wallet:", error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
        }
      }
    };

    trackWallet();
  }, [address, isConnected, balance]);

  return null;
}
