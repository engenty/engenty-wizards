-- The tenant's WhatsApp Business number, as Meta's Cloud API names it. One row. Dates are milliseconds.
CREATE TABLE whatsapp_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phone_number_id TEXT NOT NULL,
  number TEXT NOT NULL,
  access_token TEXT NOT NULL,
  app_secret TEXT,
  verify_token TEXT NOT NULL,
  template TEXT,
  updated_at INTEGER NOT NULL
);

-- The keyword that starts a wizard on the number: wa.me/<number>?text=<keyword>.
CREATE TABLE whatsapp_binding (
  wizard_id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL COLLATE NOCASE
);
CREATE UNIQUE INDEX whatsapp_binding_keyword ON whatsapp_binding (keyword);

-- One thread per number that wrote: the run it is in, and where in it (state is JSON).
CREATE TABLE whatsapp_thread (
  wa_id TEXT PRIMARY KEY,
  name TEXT,
  run_id TEXT,
  state TEXT NOT NULL,
  last_inbound_at INTEGER NOT NULL,
  last_message_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX whatsapp_thread_run ON whatsapp_thread (run_id);
