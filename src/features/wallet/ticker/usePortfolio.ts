"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Portfolio } from "@/lib/portfolio/portfolio";

/*
  Live wallet data (payment plan P5.2): polls /api/wallet/portfolio every 12 s — inside
  the 10–15 s window — paused while the tab is hidden (React Query stops background
  intervals) and refreshed the moment the tab is visible again. `refreshPortfolio()`
  forces a read, e.g. right after a payment confirms.
*/

export const PORTFOLIO_POLL_MS = 12_000;

const key = (address: string | null | undefined) => ["portfolio", address?.toLowerCase() ?? "none"] as const;

export function usePortfolio(address: string | null | undefined) {
  return useQuery<Portfolio>({
    queryKey: key(address),
    enabled: Boolean(address),
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/wallet/portfolio?address=${address}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`portfolio ${res.status}`);
      return res.json();
    },
    refetchInterval: PORTFOLIO_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

export function useRefreshPortfolio() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["portfolio"] });
}
