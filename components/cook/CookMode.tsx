"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatQty,
  formatTimestamp,
  youtubeStepUrl,
} from "@/lib/format";
import { useLivePrefs } from "@/lib/prefs/client";
import type { Ingredient, Recipe, UserPrefs } from "@/lib/types";
import { DEFAULT_PREFS } from "@/lib/types";

/** Match ingredients whose base name (or last significant word) appears in step text. */
export function ingredientsInStep(
  stepText: string,
  ingredients: Ingredient[],
): string[] {
  const lower = stepText.toLowerCase();
  const matched = ingredients
    .filter((ing) => {
      const base = ing.name.split(",")[0]?.trim() ?? "";
      if (!base) return false;
      const last = base.split(/\s+/).pop()?.toLowerCase() ?? "";
      if (last.length >= 2 && lower.includes(last)) return true;
      return lower.includes(base.toLowerCase());
    })
    .slice(0, 4)
    .map((ing) => {
      const base = ing.name.split(",")[0]?.trim() ?? ing.name;
      return `${formatQty(ing)} ${base}`.trim();
    });

  if (matched.length > 0) return matched;
  if (ingredients[0]) {
    const base = ingredients[0].name.split(",")[0]?.trim() ?? ingredients[0].name;
    return [`${formatQty(ingredients[0])} ${base}`.trim()];
  }
  return [];
}

export function CookMode({
  recipe,
  prefs = DEFAULT_PREFS,
  showTimestamps: showTimestampsProp,
  basePath = "",
}: {
  recipe: Recipe;
  prefs?: UserPrefs;
  /** @deprecated prefer prefs.timestamps */
  showTimestamps?: boolean;
  /** URL prefix, e.g. `/s/<token>` in shared mode. */
  basePath?: string;
}) {
  const router = useRouter();
  const livePrefs = useLivePrefs(prefs);
  const showTimestamps =
    showTimestampsProp !== undefined
      ? showTimestampsProp
      : livePrefs.timestamps !== false;
  const steps = recipe.steps;
  const [index, setIndex] = useState(0);
  const [awake, setAwake] = useState(true);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const step = steps[Math.min(index, Math.max(0, steps.length - 1))];
  const isLast = index >= steps.length - 1;
  const gone = recipe.video_status === "gone";

  const chips = useMemo(
    () => (step ? ingredientsInStep(step.text, recipe.ingredients) : []),
    [step, recipe.ingredients],
  );

  const releaseLock = useCallback(async () => {
    try {
      await lockRef.current?.release();
    } catch {
      /* ignore */
    }
    lockRef.current = null;
  }, []);

  const requestLock = useCallback(async () => {
    if (!awake) {
      await releaseLock();
      return;
    }
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
      lockRef.current.addEventListener("release", () => {
        lockRef.current = null;
      });
    } catch {
      /* permission / unsupported */
    }
  }, [awake, releaseLock]);

  useEffect(() => {
    void requestLock();
    return () => {
      void releaseLock();
    };
  }, [requestLock, releaseLock]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && awake) {
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [awake, requestLock]);

  const exit = () => {
    void releaseLock();
    router.push(`${basePath}/recipes/${recipe.id}`);
  };

  const next = () => {
    if (isLast) {
      exit();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const prev = () => {
    setIndex((i) => Math.max(0, i - 1));
  };

  if (!step || steps.length === 0) {
    return (
      <div style={{ padding: 26.4 }}>
        <p>No steps on this recipe.</p>
        <Link
          href={`${basePath}/recipes/${recipe.id}`}
          className="btn btn-secondary"
        >
          Exit
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13.2,
          padding: "13.2px 17.6px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={exit}
          style={{ minHeight: 40 }}
        >
          <ChevronLeft />
          Exit
        </button>
        <div
          style={{
            marginRight: "auto",
            fontFamily: "var(--font-heading)",
            fontSize: 17,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {recipe.title}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setAwake((a) => !a)}
          style={{ minHeight: 40 }}
          title="Keep screen awake"
        >
          <SunIcon />
          <span>{awake ? "Screen on" : "Screen auto"}</span>
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "13.2px 17.6px 0" }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background:
                i <= index
                  ? "var(--color-accent)"
                  : "var(--color-neutral-300)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 17.6,
          padding: "26.4px 17.6px",
          maxWidth: 900,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="tag tag-accent" style={{ fontSize: 12 }}>
            Step {index + 1} of {steps.length}
          </div>
          {showTimestamps && !gone && (
            <a
              href={youtubeStepUrl(recipe.video_id, step.t_seconds)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              style={{
                fontSize: 13,
                fontFamily: "var(--font-body)",
              }}
            >
              Watch this step at {formatTimestamp(step.t_seconds)}
            </a>
          )}
        </div>
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.3,
            fontWeight: 600,
            textWrap: "pretty",
          }}
        >
          {step.text}
        </div>
        {chips.length > 0 && (
          <div
            className="card"
            style={{
              background: "var(--color-accent-2-100)",
              gap: 8.8,
              padding: 17.6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-accent-2-800)",
              }}
            >
              In this step
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {chips.map((label) => (
                <div
                  key={label}
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "var(--color-bg)",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 13.2,
          padding: 17.6,
          borderTop: "1px solid var(--color-divider)",
          background: "var(--color-surface)",
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={prev}
          disabled={index === 0}
          style={{
            flex: 1,
            minHeight: 64,
            fontSize: 17,
            background: "var(--color-bg)",
          }}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
          style={{ flex: 2, minHeight: 64, fontSize: 17, marginTop: 0 }}
        >
          {isLast ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  );
}
