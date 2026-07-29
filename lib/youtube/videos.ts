/**
 * YouTube videos.list — batch metadata (uploader channel + existence).
 *
 * playlistItems.snippet.channelTitle is the *playlist owner*, not the uploader.
 * Always prefer videos.list snippet for channel credit.
 */

export type VideoMeta = {
  videoId: string;
  /** True when videos.list returned the id (still exists / accessible). */
  exists: boolean;
  /** Uploading channel display name. */
  channelTitle?: string;
  channelId?: string;
  title?: string;
  thumbnailUrl?: string | null;
  /** Video publish time (snippet.publishedAt). */
  publishedAt?: string | null;
  privacyStatus?: string;
  uploadStatus?: string;
};

/** @deprecated use VideoMeta — kept as alias for status-only callers */
export type VideoStatusInfo = VideoMeta;

type VideosListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      channelId?: string;
      publishedAt?: string;
      thumbnails?: {
        medium?: { url?: string };
        high?: { url?: string };
        default?: { url?: string };
      };
    };
    status?: {
      privacyStatus?: string;
      uploadStatus?: string;
    };
  }>;
  error?: {
    message?: string;
    code?: number;
    errors?: Array<{ reason?: string }>;
  };
};

const BATCH = 50;

/**
 * Batch-fetch video metadata via videos.list (part=snippet,status).
 * Ids not present in the response are marked exists=false (gone / private-to-us).
 */
export async function getVideosMeta(
  accessToken: string,
  videoIds: string[],
): Promise<Map<string, VideoMeta>> {
  const result = new Map<string, VideoMeta>();
  if (videoIds.length === 0) return result;

  const unique = [...new Set(videoIds.filter(Boolean))];

  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,status");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("maxResults", String(BATCH));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as VideosListResponse;

    if (!res.ok) {
      const reason = json.error?.errors?.[0]?.reason;
      const msg = json.error?.message ?? "";
      const err = new Error(
        `YouTube videos.list failed (${res.status}): ${msg}`,
      );
      (err as Error & { quota?: boolean }).quota =
        res.status === 403 &&
        (reason === "quotaExceeded" ||
          reason === "dailyLimitExceeded" ||
          /quota/i.test(msg));
      throw err;
    }

    const found = new Set<string>();
    for (const item of json.items ?? []) {
      if (!item.id) continue;
      found.add(item.id);
      const thumbs = item.snippet?.thumbnails;
      result.set(item.id, {
        videoId: item.id,
        exists: true,
        channelTitle: item.snippet?.channelTitle?.trim() || undefined,
        channelId: item.snippet?.channelId || undefined,
        title: item.snippet?.title?.trim() || undefined,
        thumbnailUrl:
          thumbs?.medium?.url ??
          thumbs?.high?.url ??
          thumbs?.default?.url ??
          null,
        publishedAt: item.snippet?.publishedAt ?? null,
        privacyStatus: item.status?.privacyStatus,
        uploadStatus: item.status?.uploadStatus,
      });
    }
    for (const id of chunk) {
      if (!found.has(id)) {
        result.set(id, { videoId: id, exists: false });
      }
    }
  }

  return result;
}

/** Status-only convenience (same as getVideosMeta). */
export async function getVideosStatus(
  accessToken: string,
  videoIds: string[],
): Promise<Map<string, VideoMeta>> {
  return getVideosMeta(accessToken, videoIds);
}
