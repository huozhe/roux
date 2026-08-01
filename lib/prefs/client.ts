"use client";

import type { UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

/**
 * Server-passed prefs. Settings PUT revalidates RSC paths; PrefsForm also
 * calls `router.refresh()`. No per-mount `/api/prefs` fetch.
 */
export function useLivePrefs(initial: UserPrefs = DEFAULT_PREFS): UserPrefs {
  return initial;
}
