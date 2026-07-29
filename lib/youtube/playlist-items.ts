/**
 * YouTube playlistItems.list — paginated, newest-first by playlist add time.
 */

export type PlaylistItem = {
  videoId: string;
  title: string;
  /**
   * From playlistItems — often the *playlist owner*, not the uploader.
   * Prefer videos.list snippet for credit (see getVideosMeta).
   */
  channelTitle: string;
  channelId: string;
  thumbnailUrl: string | null;
  /** Video publish time (contentDetails.videoPublishedAt), if present. */
  publishedAt: string | null;
  /** When the item was added to the playlist (snippet.publishedAt). */
  addedAt: string;
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      channelTitle?: string;
      channelId?: string;
      publishedAt?: string;
      thumbnails?: {
        medium?: { url?: string };
        default?: { url?: string };
        high?: { url?: string };
      };
      resourceId?: { videoId?: string; kind?: string };
    };
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
  }>;
  error?: { message?: string; code?: number; errors?: Array<{ reason?: string }> };
};

function mapItem(
  raw: NonNullable<PlaylistItemsResponse["items"]>[number],
): PlaylistItem | null {
  const videoId =
    raw.contentDetails?.videoId ?? raw.snippet?.resourceId?.videoId;
  if (!videoId) return null;

  const thumbs = raw.snippet?.thumbnails;
  const thumbnailUrl =
    thumbs?.medium?.url ?? thumbs?.high?.url ?? thumbs?.default?.url ?? null;

  const addedAt = raw.snippet?.publishedAt ?? new Date(0).toISOString();

  return {
    videoId,
    title: raw.snippet?.title?.trim() || "Untitled",
    channelTitle: raw.snippet?.channelTitle?.trim() || "Unknown",
    channelId: raw.snippet?.channelId ?? "",
    thumbnailUrl,
    publishedAt: raw.contentDetails?.videoPublishedAt ?? null,
    addedAt,
  };
}

export type ListPlaylistItemsOpts = {
  /**
   * Called after each API page (pre-sort, API order).
   * Return true to stop pagination (early-stop).
   */
  onPage?: (page: PlaylistItem[]) => boolean | void;
};

/**
 * List all (or early-stopped) items for a playlist.
 * Result is sorted newest-first by `addedAt`.
 */
export async function listPlaylistItems(
  accessToken: string,
  playlistId: string,
  opts?: ListPlaylistItemsOpts,
): Promise<PlaylistItem[]> {
  const out: PlaylistItem[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems",
    );
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as PlaylistItemsResponse;

    if (!res.ok) {
      const reason = json.error?.errors?.[0]?.reason;
      const msg = json.error?.message ?? "";
      const err = new Error(
        `YouTube playlistItems.list failed (${res.status}): ${msg}`,
      );
      (err as Error & { quota?: boolean }).quota =
        res.status === 403 &&
        (reason === "quotaExceeded" ||
          reason === "dailyLimitExceeded" ||
          /quota/i.test(msg));
      throw err;
    }

    const page: PlaylistItem[] = [];
    for (const item of json.items ?? []) {
      const mapped = mapItem(item);
      if (mapped) page.push(mapped);
    }

    out.push(...page);

    if (opts?.onPage?.(page)) {
      break;
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  out.sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
  );
  return out;
}
