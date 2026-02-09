"use client";

import { useEffect, useState } from "react";
import { authReadyPromise, db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, limit, where } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, Clock, Wallet } from "lucide-react";

interface ConnectedWallet {
  address: string;
  lastConnected: any;
  firstSeen: any;
  balance?: string;
  domain?: string;
}

type ConnectedWalletsListProps = {
  filterByDomain?: boolean;
};

export function ConnectedWalletsList({ filterByDomain = true }: ConnectedWalletsListProps) {
  const [wallets, setWallets] = useState<ConnectedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      // Only run on client side
      if (typeof window === "undefined") return;
      const domain = window.location.hostname;

      // Check if Firebase is configured
      if (!db) {
        console.error("Firebase db is not initialized");
        setError("Firebase not configured. Please add your Firebase credentials to .env.local");
        setLoading(false);
        return;
      }

      if (authReadyPromise) {
        await authReadyPromise;
      }

      if (cancelled) return;

      console.log("Setting up Firestore listener...");

      try {
        const walletsRef = collection(db, "connected_wallets");

        // Try with sorting first, fall back to no sorting if it fails
        const q = filterByDomain
          ? query(walletsRef, where("domain", "==", domain), limit(50))
          : query(walletsRef, limit(50));

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            console.log(`Received ${snapshot.size} wallet documents from Firestore`);
            const walletData: ConnectedWallet[] = [];
            snapshot.forEach((doc) => {
              console.log("Wallet doc:", doc.id, doc.data());
              walletData.push({
                address: doc.id,
                ...doc.data(),
              } as ConnectedWallet);
            });

            // Sort in memory if we have data
            walletData.sort((a, b) => {
              const aTime = a.lastConnected?.seconds || 0;
              const bTime = b.lastConnected?.seconds || 0;
              return bTime - aTime;
            });

            setWallets(walletData);
            setLoading(false);
          },
          (error) => {
            console.error("Firestore onSnapshot error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            setError(`Firestore error: ${error.message}`);
            setLoading(false);
          }
        );
      } catch (error: any) {
        console.error("Error setting up Firestore listener:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        console.log("Cleaning up Firestore listener");
        unsubscribe();
      }
    };
  }, [filterByDomain]);

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "Just now";
    try {
      const date = timestamp.toDate();
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "Recently";
    }
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-cyan-400" />
            Connected Wallets
          </CardTitle>
          <CardDescription className="text-cyan-300">
            Real-time wallet connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-cyan-400" />
            Connected Wallets
          </CardTitle>
          <CardDescription className="text-cyan-300">
            Real-time wallet connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-500/20 bg-amber-900/10 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-400" />
            Connected Wallets
          </CardTitle>
          <CardDescription className="text-amber-300">
            Firebase Configuration Required
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-amber-200 mb-2">⚠️ {error}</p>
            <p className="text-xs text-amber-300">
              Please check FIREBASE_SETUP.md for configuration instructions
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Users className="h-5 w-5 text-cyan-400" />
          Connected Wallets
          <span className="ml-auto text-sm font-normal text-cyan-300">
            {wallets.length} total
          </span>
        </CardTitle>
        <CardDescription className="text-cyan-300">
          Real-time tracking of all wallet connections
        </CardDescription>
      </CardHeader>
      <CardContent>
        {wallets.length === 0 ? (
          <div className="text-center py-8">
            <Wallet className="h-12 w-12 text-cyan-400/50 mx-auto mb-3" />
            <p className="text-cyan-300">No wallets connected yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {wallets.map((wallet) => (
              <div
                key={wallet.address}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 rounded-lg bg-black/30 border border-blue-500/20 hover:border-blue-500/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-mono text-sm font-medium text-white">
                    {shortenAddress(wallet.address)}
                  </p>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-cyan-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(wallet.lastConnected)}
                    </span>
                    {wallet.domain && (
                      <span className="text-cyan-500/70">
                        • {wallet.domain}
                      </span>
                    )}
                    {wallet.firstSeen && wallet.lastConnected && 
                     wallet.firstSeen !== wallet.lastConnected && (
                      <span className="text-cyan-500/70">
                        • First: {formatTimestamp(wallet.firstSeen)}
                      </span>
                    )}
                  </div>
                </div>
                {wallet.balance && (
                  <div className="text-center px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                    <p className="text-base font-bold text-cyan-200">
                      {parseFloat(wallet.balance).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-cyan-400">USDT</p>
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(wallet.address);
                      setCopiedAddress(wallet.address);
                      window.setTimeout(() => {
                        setCopiedAddress((current) =>
                          current === wallet.address ? null : current
                        );
                      }, 1400);
                    }}
                    className="text-xs text-cyan-300 hover:text-cyan-100 transition-colors px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20"
                  >
                    Copy
                  </button>
                  {copiedAddress === wallet.address && (
                    <div className="absolute right-0 -top-8 rounded-md border border-cyan-500/40 bg-black/80 px-2 py-1 text-[10px] text-cyan-100 shadow">
                      Copied!
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
