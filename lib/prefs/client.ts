"use client";

import { useSyncExternalStore } from "react";
import type { UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

/**
 * In-session prefs after a Settings save.
 *
 * force-dynamic pages have no Full Route Cache, so revalidatePath alone does
 * not refresh other routes already held in the client Router Cache. Publishing
 * here updates every mounted consumer and wins over a stale RSC prop when the
 * user navigates Settings → Library without a full reload.
 *
 * Hard reload / new tab: snapshot is empty; server-passed `initial` is source of truth.
 */
let published: UserPrefs | null = null;
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): UserPrefs | null {
  return published;
}

function getServerSnapshot(): UserPrefs | null {
  return null;
}

/** Call after a successful PUT /api/prefs so other client trees see the change. */
export function publishPrefs(prefs: UserPrefs): void {
  published = prefs;
  for (const l of listeners) l();
}

/** Test / debug: current published session prefs, or null. */
export function getPublishedPrefs(): UserPrefs | null {
  return published;
}

/** Test helper: clear session publish (does not hit the server). */
export function resetPublishedPrefs(): void {
  published = null;
  for (const l of listeners) l();
}

export function useLivePrefs(initial: UserPrefs = DEFAULT_PREFS): UserPrefs {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return live ?? initial;
}
