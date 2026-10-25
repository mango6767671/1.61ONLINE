CREATE TABLE IF NOT EXISTS player_presence (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'in_session')),
  session_id UUID,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_presence_last_seen
  ON player_presence(last_seen_at);

CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(48) NOT NULL,
  region VARCHAR(16) NOT NULL DEFAULT 'us-east',
  game_mode VARCHAR(32) NOT NULL DEFAULT 'freemode',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_progress', 'closed')),
  max_players SMALLINT NOT NULL DEFAULT 16 CHECK (max_players BETWEEN 2 AND 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_discovery
  ON game_sessions(region, game_mode, state, visibility, created_at);

CREATE TABLE IF NOT EXISTS session_members (
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_members_user ON session_members(user_id);

ALTER TABLE player_presence
  ADD CONSTRAINT fk_presence_session
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  game_mode VARCHAR(32) NOT NULL,
  region VARCHAR(16) NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_search
  ON matchmaking_queue(game_mode, region, queued_at);
