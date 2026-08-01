-- CQ-6: column was never written or read; dead-video UI uses STATUS_TEXT tag.
ALTER TABLE roux.recipes DROP COLUMN IF EXISTS thumbnail_blob;
