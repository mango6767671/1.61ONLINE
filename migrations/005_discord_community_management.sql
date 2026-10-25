-- Discord-native community identities and bot-managed operations.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT chk_users_email_password_pair
  CHECK (
    (email IS NULL AND password_hash IS NULL)
    OR (email IS NOT NULL AND password_hash IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS discord_accounts (
  discord_user_id VARCHAR(20) PRIMARY KEY CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(64) NOT NULL,
  global_name VARCHAR(64),
  avatar_url TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  banned_by_discord_id VARCHAR(20) NOT NULL,
  banned_by_username VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_discord_id VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_community_bans_active
  ON community_bans(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_discord_id VARCHAR(20) NOT NULL,
  reporter_username VARCHAR(100) NOT NULL,
  target_discord_id VARCHAR(20),
  target_username VARCHAR(100),
  category VARCHAR(24) NOT NULL CHECK (category IN ('cheating', 'harassment', 'exploit', 'bug', 'other')),
  details VARCHAR(1500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_discord_id VARCHAR(20),
  reviewed_by_username VARCHAR(100),
  resolution VARCHAR(1000)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status_created
  ON community_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS community_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'maintenance')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_discord_id VARCHAR(20) NOT NULL,
  created_by_username VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_by_discord_id VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_community_announcements_active
  ON community_announcements(active, created_at DESC);

CREATE TABLE IF NOT EXISTS community_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_discord_id VARCHAR(20) NOT NULL,
  actor_username VARCHAR(100) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_discord_id VARCHAR(20),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_admin_audit_created
  ON community_admin_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS community_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_by_discord_id VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO community_settings (setting_key, setting_value)
VALUES ('maintenance', '{"enabled": false, "reason": null}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS community_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opener_discord_id VARCHAR(20) NOT NULL,
  opener_username VARCHAR(100) NOT NULL,
  topic VARCHAR(120) NOT NULL,
  channel_id VARCHAR(20) UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by_discord_id VARCHAR(20),
  close_reason VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_community_tickets_opener_status
  ON community_tickets(opener_discord_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS community_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_discord_id VARCHAR(20) NOT NULL,
  author_username VARCHAR(100) NOT NULL,
  body VARCHAR(1500) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'planned', 'implemented', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_discord_id VARCHAR(20),
  reviewed_by_username VARCHAR(100),
  staff_note VARCHAR(1000)
);

CREATE INDEX IF NOT EXISTS idx_community_suggestions_status_created
  ON community_suggestions(status, created_at DESC);
