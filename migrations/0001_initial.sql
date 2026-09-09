CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  person TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  exhibition TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  followup TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'needs_review',
  good_enough INTEGER NOT NULL DEFAULT 0,
  form_image_key TEXT NOT NULL DEFAULT '',
  card_image_key TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts(company);
CREATE INDEX IF NOT EXISTS contacts_review_idx ON contacts(good_enough, status);

CREATE TABLE IF NOT EXISTS edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  editor TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS edit_history_contact_idx ON edit_history(contact_id, created_at);
