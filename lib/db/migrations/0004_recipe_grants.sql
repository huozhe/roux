-- Inter-user private grants (docs/plans/inter-user-sharing.md §4.1).
-- Separate from public share_links.

CREATE TABLE IF NOT EXISTS roux.recipe_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES roux.recipes (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES roux.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- One active grant per (recipe, recipient).
CREATE UNIQUE INDEX IF NOT EXISTS recipe_grants_active_unique
  ON roux.recipe_grants (recipe_id, recipient_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS recipe_grants_recipient_idx
  ON roux.recipe_grants (recipient_user_id);

CREATE INDEX IF NOT EXISTS recipe_grants_owner_idx
  ON roux.recipe_grants (owner_user_id);

CREATE INDEX IF NOT EXISTS recipe_grants_recipe_idx
  ON roux.recipe_grants (recipe_id);
