"use client";

import { useEffect, useState } from "react";
import { useTron } from "@/components/TronProvider";
import {
  PULL_CONTRACT_ADDRESS,
  getContractOwner,
  getAdminStatus,
  addAdminOwner,
  removeAdmin,
  isValidTronAddress,
  formatAddress,
} from "@/lib/tron";
import { auth, authReadyPromise, db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, limit, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export function SuperAdminPanel() {
  const { address, isConnected } = useTron();
  const { toast } = useToast();

  const storageKey = `superAdminList:${PULL_CONTRACT_ADDRESS}`;
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [adminAddress, setAdminAddress] = useState("");
  const [domainAddress, setDomainAddress] = useState("");
  const [adminDomain, setAdminDomain] = useState("");
  const [adminStatus, setAdminStatusState] = useState<boolean | null>(null);
  const [adminList, setAdminList] = useState<string[]>([]);
  const [adminStatuses, setAdminStatuses] = useState<Record<string, boolean | null>>({});
  const [adminDomains, setAdminDomains] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDomain, setIsSavingDomain] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setAdminList(parsed.filter((value) => typeof value === "string"));
      }
    } catch (error) {
      console.error("Failed to load admin list:", error);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isConnected || !address) {
      setOwnerAddress(null);
      setIsOwner(false);
      return;
    }

    const loadOwner = async () => {
      try {
        const owner = await getContractOwner(PULL_CONTRACT_ADDRESS);
        setOwnerAddress(owner);
        setIsOwner(owner?.toLowerCase() === address.toLowerCase());
      } catch (error) {
        console.error("Error loading owner:", error);
      }
    };

    loadOwner();
  }, [isConnected, address]);

  const persistAdminList = (list: string[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(list));
  };

  const refreshAdminStatuses = async (list: string[] = adminList) => {
    if (!isConnected || list.length === 0) {
      setAdminStatuses({});
      return;
    }

    const statusEntries = await Promise.all(
      list.map(async (addr) => {
        try {
          const status = await getAdminStatus(PULL_CONTRACT_ADDRESS, addr);
          return [addr, status] as const;
        } catch (error) {
          console.error("Error loading admin status:", error);
          return [addr, null] as const;
        }
      })
    );

    const statusMap: Record<string, boolean | null> = {};
    statusEntries.forEach(([addr, status]) => {
      statusMap[addr] = status;
    });

    setAdminStatuses(statusMap);

    const activeList = list.filter((addr) => statusMap[addr]);
    if (activeList.length !== list.length) {
      setAdminList(activeList);
      persistAdminList(activeList);
    }
  };

  useEffect(() => {
    if (adminList.length === 0) return;
    refreshAdminStatuses(adminList);
  }, [adminList, isConnected]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!db) return;

    const firestore = db;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      if (authReadyPromise) {
        await authReadyPromise;
      }

      if (!auth?.currentUser) {
        console.warn("Firebase auth not available for admin domain read.");
        return;
      }

      if (cancelled) return;

      const domainRef = collection(firestore, "admin_domains");
      const q = query(domainRef, limit(500));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const domainMap: Record<string, string> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as { domain?: string };
            if (data?.domain) {
              domainMap[docSnap.id] = data.domain;
            }
          });
          setAdminDomains(domainMap);
        },
        (error) => {
          console.error("Admin domains snapshot error:", error);
        }
      );
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      setAdminStatusState(null);
      return;
    }

    if (!isValidTronAddress(adminAddress)) {
      setAdminStatusState(null);
      return;
    }

    const loadStatus = async () => {
      try {
        const status = await getAdminStatus(PULL_CONTRACT_ADDRESS, adminAddress);
        setAdminStatusState(status);
      } catch (error) {
        console.error("Error loading admin status:", error);
        setAdminStatusState(null);
      }
    };

    loadStatus();
  }, [isConnected, address, adminAddress]);

  const handleAddAdmin = async () => {
    if (!isValidTronAddress(adminAddress)) {
      toast({
        variant: "destructive",
        title: "Invalid address",
        description: "Enter a valid Tron base58 address.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const tx = await addAdminOwner(PULL_CONTRACT_ADDRESS, adminAddress);
      setAdminStatusState(true);
      if (!adminList.includes(adminAddress)) {
        const nextList = [...adminList, adminAddress];
        setAdminList(nextList);
        persistAdminList(nextList);
      }
      if (adminDomain.trim()) {
        setAdminDomains((prev) => ({ ...prev, [adminAddress]: adminDomain.trim() }));
      }
      toast({
        title: "Admin added",
        description: `Transaction: ${tx}`,
      });
    } catch (error: any) {
      console.error("Admin update error:", error);
      toast({
        variant: "destructive",
        title: "Admin update failed",
        description: error.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!isValidTronAddress(adminAddress)) {
      toast({
        variant: "destructive",
        title: "Invalid address",
        description: "Enter a valid Tron base58 address.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const tx = await removeAdmin(PULL_CONTRACT_ADDRESS, adminAddress);
      setAdminStatusState(false);
      if (adminList.includes(adminAddress)) {
        const nextList = adminList.filter((addr) => addr !== adminAddress);
        setAdminList(nextList);
        persistAdminList(nextList);
      }
      if (adminDomains[adminAddress]) {
        const nextDomains = { ...adminDomains };
        delete nextDomains[adminAddress];
        setAdminDomains(nextDomains);
      }
      toast({
        title: "Admin removed",
        description: `Transaction: ${tx}`,
      });
    } catch (error: any) {
      console.error("Admin remove error:", error);
      toast({
        variant: "destructive",
        title: "Admin removal failed",
        description: error.message || "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDomain = async () => {
    if (!isValidTronAddress(domainAddress)) {
      toast({
        variant: "destructive",
        title: "Invalid address",
        description: "Enter a valid Tron base58 address.",
      });
      return;
    }

    if (!adminDomain.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid domain",
        description: "Enter a domain name to save.",
      });
      return;
    }

    if (!db) {
      toast({
        variant: "destructive",
        title: "Firebase not configured",
        description: "Set up Firebase in .env.local to store domain labels.",
      });
      return;
    }

    setIsSavingDomain(true);
    try {
      if (authReadyPromise) {
        await authReadyPromise;
      }

      if (!auth?.currentUser) {
        toast({
          variant: "destructive",
          title: "Authentication required",
          description: "Enable Anonymous sign-in in Firebase Auth, then reload.",
        });
        return;
      }

      const domainDocRef = doc(collection(db, "admin_domains"), domainAddress);
      await setDoc(
        domainDocRef,
        {
          domain: adminDomain.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: address || null,
        },
        { merge: true }
      );
      setAdminDomains((prev) => ({ ...prev, [domainAddress]: adminDomain.trim() }));
      toast({
        title: "Domain saved",
        description: `Linked ${adminDomain.trim()} to ${formatAddress(domainAddress, 4)}.`,
      });
    } catch (error: any) {
      console.error("Failed to save domain:", error);
      toast({
        variant: "destructive",
        title: "Domain save failed",
        description: error.message || "Please try again.",
      });
    } finally {
      setIsSavingDomain(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Super Admin</CardTitle>
          <CardDescription className="text-cyan-300">
            Connect your wallet to manage admins.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Super Admin Control</CardTitle>
          <CardDescription className="text-cyan-300">
            Manage contract admins for token withdrawals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-500/20 bg-black/30 p-3 text-xs sm:text-sm text-cyan-200">
            <div>Contract: {PULL_CONTRACT_ADDRESS}</div>
            <div>
              Owner:{" "}
              {ownerAddress ? formatAddress(ownerAddress, 5) : "Loading..."}
              {isOwner ? " (you)" : ""}
            </div>
          </div>

          {!isOwner && ownerAddress && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-3 text-xs sm:text-sm text-amber-200">
              Only the owner can add or remove admins.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-500/20 bg-black/30 p-3 space-y-3">
                <div className="text-sm text-cyan-200 font-medium">Admin Wallet</div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm text-cyan-200">Admin wallet address</label>
                  <Input
                    value={adminAddress}
                    onChange={(e) => setAdminAddress(e.target.value.trim())}
                    placeholder="T..."
                    className="bg-black/40 border-blue-500/30 text-white placeholder:text-cyan-500"
                  />
                  {adminStatus !== null && (
                    <div className="text-xs text-cyan-300">
                      Current status: {adminStatus ? "Admin" : "Not admin"}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-black/30 p-3 space-y-3">
                <div className="text-sm text-cyan-200 font-medium">Admin Actions</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleAddAdmin}
                    disabled={!isOwner || isLoading}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Admin
                  </Button>
                  <Button
                    onClick={handleRemoveAdmin}
                    disabled={!isOwner || isLoading}
                    variant="outline"
                    className="border-red-500/40 text-red-300 hover:text-red-200 hover:bg-red-500/10"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Remove Admin
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-black/30 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-cyan-200 font-medium">Admin Wallets</div>
                <Button
                  variant="outline"
                  onClick={() => refreshAdminStatuses(adminList)}
                  className="h-7 px-2 text-xs border-blue-500/30 text-cyan-300 hover:text-cyan-100"
                  disabled={!isConnected || adminList.length === 0}
                >
                  Refresh
                </Button>
              </div>
              {adminList.length === 0 ? (
                <div className="text-xs text-cyan-400">No admins added yet.</div>
              ) : (
                <div className="space-y-2">
                  {adminList.map((addr) => {
                    const status = adminStatuses[addr];
                    const label = status === null ? "Unknown" : status ? "Active" : "Inactive";
                    const dot =
                      status === null ? "bg-gray-500" : status ? "bg-green-500" : "bg-red-500";
                    return (
                      <div
                        key={addr}
                        className="flex items-center justify-between rounded-md border border-blue-500/10 bg-black/20 px-3 py-2 text-xs sm:text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-mono text-cyan-100">{addr}</span>
                          <span className="text-xs text-cyan-400">
                            {adminDomains[addr] ? adminDomains[addr] : "No domain set"}
                          </span>
                        </div>
                        <span className="flex items-center gap-2 text-cyan-300">
                          <span className={`h-2 w-2 rounded-full ${dot}`} />
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {!isConnected && (
                <div className="text-xs text-amber-300">Connect wallet to verify status.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-blue-500/20 bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Admin Domain</CardTitle>
          <CardDescription className="text-cyan-300">
            Link a wallet address to a domain label.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs sm:text-sm text-cyan-200">Admin wallet address</label>
            <Input
              value={domainAddress}
              onChange={(e) => setDomainAddress(e.target.value.trim())}
              placeholder="T..."
              className="bg-black/40 border-blue-500/30 text-white placeholder:text-cyan-500"
            />
            <label className="text-xs sm:text-sm text-cyan-200">Domain name</label>
            <Input
              value={adminDomain}
              onChange={(e) => setAdminDomain(e.target.value.trim())}
              placeholder="example.com"
              className="bg-black/40 border-blue-500/30 text-white placeholder:text-cyan-500"
            />
          </div>
          <div className="text-xs text-cyan-400">
            Domain labels are stored off-chain in Firebase (not on-chain).
          </div>
          <Button
            onClick={handleSaveDomain}
            disabled={!domainAddress || !adminDomain.trim() || isSavingDomain}
            variant="outline"
            className="border-blue-500/30 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/10"
          >
            {isSavingDomain && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Domain
          </Button>
          <div className="pt-2 border-t border-blue-500/20 space-y-2">
            <div className="text-sm text-cyan-200 font-medium">Saved Domains</div>
            {Object.keys(adminDomains).length === 0 ? (
              <div className="text-xs text-cyan-400">No domains saved yet.</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {Object.entries(adminDomains).map(([addr, domain]) => (
                  <div
                    key={addr}
                    className="flex items-center justify-between rounded-md border border-blue-500/10 bg-black/20 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-cyan-100">{addr}</span>
                    <span className="text-cyan-300">{domain}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
