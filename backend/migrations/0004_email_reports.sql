-- Reliable, idempotent email reports for completed assigned work.
CREATE TABLE email_reports (
  student_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('session','check','daily')),
  record_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  provider_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (student_id, kind, record_id),
  FOREIGN KEY (student_id, kind, record_id)
    REFERENCES student_records(student_id, kind, record_id)
);
CREATE INDEX email_reports_pending ON email_reports(status, next_attempt_at);
