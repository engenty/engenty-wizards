-- The tenant's Twilio account and OpenAI project for calls. One row. Dates are milliseconds.
CREATE TABLE calls_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  twilio_sid TEXT NOT NULL,
  twilio_token TEXT NOT NULL,
  openai_project TEXT NOT NULL,
  openai_webhook_secret TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'eu',
  sms_from TEXT,
  updated_at INTEGER NOT NULL
);

-- One row per call: who called, over which door, which run it drives, how it went.
CREATE TABLE calls_call (
  token TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  channel TEXT NOT NULL,
  payload TEXT,
  twilio_call_sid TEXT,
  openai_call_id TEXT,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'ringing',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX calls_call_run ON calls_call (run_id);
