export type YtPlaylist = {
  id: string;
  title: string;
  visibility: "private" | "unlisted" | "public";
  item_count: number;
};

type PlaylistsListResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    status?: { privacyStatus?: string };
    contentDetails?: { itemCount?: number };
  }>;
  error?: { message?: string; code?: number };
};

function mapPrivacy(
  raw: string | undefined,
): "private" | "unlisted" | "public" {
  if (raw === "public" || raw === "unlisted" || raw === "private") return raw;
  return "private";
}

/** List the authenticated user's YouTube playlists (paginated). */
export async function listMinePlaylists(
  accessToken: string,
): Promise<YtPlaylist[]> {
  const out: YtPlaylist[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.searchParams.set("part", "snippet,status,contentDetails");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as PlaylistsListResponse;

    if (!res.ok) {
      const msg = json.error?.message ?? (await res.text().catch(() => ""));
      throw new Error(`YouTube playlists.list failed (${res.status}): ${msg}`);
    }

    for (const item of json.items ?? []) {
      if (!item.id) continue;
      out.push({
        id: item.id,
        title: item.snippet?.title?.trim() || "Untitled playlist",
        visibility: mapPrivacy(item.status?.privacyStatus),
        item_count: item.contentDetails?.itemCount ?? 0,
      });
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return out;
}
