-- Videos skipped for no captions or YouTube auth block (persist across syncs).
CREATE TABLE IF NOT EXISTS roux.caption_skips (
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  kind text NOT NULL,
  reason text,
  playlist_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS caption_skips_user_kind_idx
  ON roux.caption_skips (user_id, kind);
