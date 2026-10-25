CREATE TABLE IF NOT EXISTS discord_accounts (
  discord_user_id VARCHAR(32) PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_bans (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  moderator_discord_id VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS service_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by_discord_id VARCHAR(32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_discord_id VARCHAR(32),
  moderator_discord_id VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target
  ON moderation_actions(target_user_id, created_at DESC);
