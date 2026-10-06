ALTER TABLE run_log_entry ADD COLUMN project_id TEXT;
CREATE INDEX run_log_entry_project ON run_log_entry (project_id, ended_at);
