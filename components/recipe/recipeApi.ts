import type { Recipe } from "@/lib/types";

export async function recipeApiJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 204) {
      return { ok: true, data: undefined as T };
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      recipe?: Recipe;
      slug?: string;
    };
    if (!res.ok) {
      return { ok: false, error: body.error ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
