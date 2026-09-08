-- Whole-library guest access (docs/plans/shared-library-mode.md).
-- One row per invited guest; the 128-bit token is the only credential.

CREATE TABLE IF NOT EXISTS roux.library_shares (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS library_shares_user_idx
  ON roux.library_shares (user_id);
