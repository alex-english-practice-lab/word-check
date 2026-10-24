-- PR15-A: identities only. Practice facts and assignments arrive in PR15-B.
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE student_aliases (
  normalized_alias TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX student_aliases_student ON student_aliases(student_id, active);
CREATE TABLE student_sessions (
  token_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX student_sessions_student ON student_sessions(student_id);
CREATE INDEX student_sessions_expiry ON student_sessions(expires_at);
