/**
 * YouTube videos.list — batch status for gone detection.
 */

export type VideoStatusInfo = {
  videoId: string;
  /** True when videos.list returned the id (still exists / accessible). */
  exists: boolean;
  privacyStatus?: string;
  uploadStatus?: string;
};

type VideosListResponse = {
  items?: Array<{
    id?: string;
    status?: {
      privacyStatus?: string;
      uploadStatus?: string;
    };
  }>;
  error?: { message?: string; code?: number; errors?: Array<{ reason?: string }> };
};

const BATCH = 50;

/**
 * Batch-check whether videos still exist via videos.list (part=status).
 * Ids not present in the response are marked exists=false (gone / private-to-us).
 */
export async function getVideosStatus(
  accessToken: string,
  videoIds: string[],
): Promise<Map<string, VideoStatusInfo>> {
  const result = new Map<string, VideoStatusInfo>();
  if (videoIds.length === 0) return result;

  const unique = [...new Set(videoIds.filter(Boolean))];

  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "status");
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
      result.set(item.id, {
        videoId: item.id,
        exists: true,
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
