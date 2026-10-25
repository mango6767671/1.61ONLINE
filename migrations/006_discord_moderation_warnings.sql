CREATE TABLE IF NOT EXISTS community_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_discord_id VARCHAR(20) NOT NULL,
  target_username VARCHAR(100) NOT NULL,
  issued_by_discord_id VARCHAR(20) NOT NULL,
  issued_by_username VARCHAR(100) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  cleared_by_discord_id VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_community_warnings_target_active
  ON community_warnings(target_discord_id, created_at DESC)
  WHERE cleared_at IS NULL;
