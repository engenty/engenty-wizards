CREATE TABLE run_log_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  wizard_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX run_log_entry_ended ON run_log_entry (ended_at);
