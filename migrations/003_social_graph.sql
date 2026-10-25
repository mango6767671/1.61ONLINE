CREATE TABLE IF NOT EXISTS friendships (
  user_low_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id),
  CHECK (requested_by_user_id IN (user_low_id, user_high_id))
);

CREATE INDEX IF NOT EXISTS idx_friendships_pending_by_requester
  ON friendships(requested_by_user_id, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friendships_low_status
  ON friendships(user_low_id, status);

CREATE INDEX IF NOT EXISTS idx_friendships_high_status
  ON friendships(user_high_id, status);
