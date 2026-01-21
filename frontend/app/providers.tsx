"use client";

import { TronProvider } from "@/components/TronProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <TronProvider>{children}</TronProvider>;
}
