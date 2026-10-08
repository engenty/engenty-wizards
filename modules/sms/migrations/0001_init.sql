-- The tenant's Twilio account and the number it texts from. One row. Dates are milliseconds.
CREATE TABLE sms_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  number TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The keyword that starts a wizard on the number: sms:<number>?body=<keyword>.
CREATE TABLE sms_binding (
  wizard_id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL COLLATE NOCASE
);
CREATE UNIQUE INDEX sms_binding_keyword ON sms_binding (keyword);

-- One thread per number that wrote: the run it is in, and where in it (state is JSON).
CREATE TABLE sms_thread (
  number TEXT PRIMARY KEY,
  run_id TEXT,
  state TEXT NOT NULL,
  last_inbound_at INTEGER NOT NULL,
  last_message_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sms_thread_run ON sms_thread (run_id);
