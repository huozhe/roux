"use client";

import { useEffect, useState } from "react";
import type { UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

/**
 * Prefer server-passed prefs, then revalidate from GET /api/prefs so
 * Settings changes apply even if RSC cache is stale.
 */
export function useLivePrefs(initial: UserPrefs = DEFAULT_PREFS): UserPrefs {
  const [prefs, setPrefs] = useState<UserPrefs>(initial);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/prefs", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { prefs?: UserPrefs };
        if (!cancelled && body.prefs) {
          setPrefs(body.prefs);
        }
      } catch {
        /* keep initial */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return prefs;
}
