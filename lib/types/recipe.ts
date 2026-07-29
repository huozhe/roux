export type Ingredient = {
  qty: string;
  name: string;
  inferred: boolean;
  /** Culinary group label from LLM (e.g. "Protein", "For the sauce"). Optional for legacy rows. */
  group?: string;
};

export type Step = {
  n: number;
  text: string;
  t_seconds: number;
};

export type Confidence = "high" | "medium" | "low";
export type VideoStatus = "ok" | "gone" | "off_playlist";
export type RecipeLayout = "single" | "split";
export type SortKey = "added" | "uploaded" | "time";
export type SortDir = "asc" | "desc";
export type LibraryView = "library" | "archive";

export type Recipe = {
  id: string;
  video_id: string;
  title: string;
  video_title: string;
  channel_title: string;
  channel_id: string | null;
  thumbnail_url: string | null;
  cuisine: string | null;
  main_ingredient: string | null;
  cook_minutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  notes: string | null;
  confidence: Confidence;
  verified: boolean;
  video_status: VideoStatus;
  playlist_id: string | null;
  uploaded_at: string | null;
  added_at: string;
  written_at: string;
  archived_at: string | null;
};

export type UserPrefs = {
  layout: RecipeLayout;
  timestamps: boolean;
  newShelf: boolean;
  /**
   * When true, newly written-up recipes are verified (sync will not re-extract).
   * When false, they stay pending verification (default).
   */
  syncMarkVerified: boolean;
  customCuisines?: string[];
  customMains?: string[];
};

export type ExtractedRecipe = {
  title: string;
  cuisine: string | null;
  main_ingredient: string | null;
  cook_minutes: number | null;
  servings: string | null;
  ingredients: Ingredient[];
  steps: { text: string; t_seconds: number }[];
  confidence: Confidence;
};

export type Playlist = {
  id: string;
  title: string;
  visibility: "private" | "unlisted" | "public";
  item_count: number;
  selected: boolean;
  last_synced: string | null;
};

export type RecipeListParams = {
  q?: string;
  cuisine?: string[];
  main?: string[];
  sort?: SortKey;
  dir?: SortDir;
  view?: LibraryView;
};
