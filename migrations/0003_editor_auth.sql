CREATE TABLE IF NOT EXISTS editor_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS editor_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES editor_users(id)
);

CREATE INDEX IF NOT EXISTS editor_sessions_token_idx ON editor_sessions(token_hash);
CREATE INDEX IF NOT EXISTS editor_sessions_user_idx ON editor_sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES editor_users(id)
);

CREATE INDEX IF NOT EXISTS auth_audit_created_idx ON auth_audit(created_at);
CREATE INDEX IF NOT EXISTS auth_audit_user_idx ON auth_audit(user_id, created_at);
