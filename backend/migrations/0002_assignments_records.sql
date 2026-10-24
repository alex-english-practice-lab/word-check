-- PR15-B: additive assignment binding and per-student record storage.
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id),
  preset_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX assignments_student ON assignments(student_id, created_at);
CREATE TABLE student_records (
  student_id TEXT NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL CHECK (kind IN ('session','check','daily')),
  record_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  assignment_id TEXT REFERENCES assignments(id),
  PRIMARY KEY (student_id, kind, record_id)
);
CREATE INDEX student_records_student ON student_records(student_id, updated_at);
