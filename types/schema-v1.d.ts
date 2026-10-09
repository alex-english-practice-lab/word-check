/** Vocabulary v1 wire types (plain JSON). No TypeScript runtime or build required. */
export type ID = string;
export type UTCDateTime = string;
export type Mode = 'full' | 'single';
export interface VocabularyLibrary {
  schemaVersion: 1;
  id: ID;
  name: string;
  description?: string;
  version: string;
  source: { type: 'builtin' | 'user' | 'test'; format?: string; path?: string; sha256?: string; attribution?: string };
  lists: VocabularyList[];
  importDiagnostics?: { line: number; text: string; reason: string }[];
}
export interface VocabularyList {
  id: ID;
  libraryId: ID;
  name: string;
  /** Legacy UI number, not identity; unique positive integer within this library. */
  number: number;
  order: number;
  words: VocabularyWord[];
}
export interface VocabularyWord {
  id: ID;
  libraryId: ID;
  listId: ID;
  revision: number;
  order: number;
  text: string;
  phonetic: string;
  pos: string;
  senses: string[];
  acceptedAnswers: string[];
}
export interface VocabularyCatalog {
  schemaVersion: 1;
  defaultLibraryId: ID;
  libraries: { id: ID; version: string; url: string }[];
}
export interface PracticeWord {
  id: ID;
  libraryId: ID;
  libraryVersion: string;
  listId: ID;
  wordRevision: number;
  word: string;
  phonetic: string;
  pos: string;
  senses: string[];
  list: number;
  variants?: string[];
}
export interface Identity {
  /** Durable local UUID namespace, independent of login; do not use display name. */
  profileId: ID;
  userId: ID | null;
  /** Random installation identifier, not a hardware fingerprint. */
  deviceId: ID;
}
export type PracticeSource =
  | { type: 'free'; id: null }
  | { type: 'preset'; id: ID }
  | { type: 'assignment'; id: ID };
export interface PracticeQuestion {
  id: ID;
  wordId: ID;
  listId: ID;
  wordRevision: number;
  mode: Mode;
  snapshot: Pick<VocabularyWord, 'text' | 'phonetic' | 'pos' | 'senses' | 'acceptedAnswers'>;
  prompt: { meaning: string; phonetic: string; pos: string };
}
export interface PracticeAttempt {
  schemaVersion: 1;
  id: ID;
  identity: Identity;
  libraryId: ID;
  libraryVersion: string;
  listIds: ID[];
  mode: Mode | 'mixed';
  /** Number actually selected at start, NOT number answered. */
  questionCount: number;
  startedAt: UTCDateTime;
  /** Terminal time for either completed or abandoned; otherwise null. */
  completedAt: UTCDateTime | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  source: PracticeSource;
  parentAttemptId: ID | null;
  /** Materialized original sequence; array order is NOT identity. */
  questions: PracticeQuestion[];
}
export interface GradeResult {
  isCorrect: boolean;
  outcome: 'correct' | 'assisted' | 'wrong';
  grading: { algorithm: 'legacy-spelling-v1'; normalizedAnswer: string; acceptedAnswers: string[] };
}
export interface AttemptAnswer {
  schemaVersion: 1;
  id: ID;
  attemptId: ID;
  questionId: ID;
  wordId: ID;
  mode: Mode;
  response: { text: string; skipped: boolean; hintCount: number };
  result: GradeResult;
  answeredAt: UTCDateTime;
  durationMs: number | null;
}
export interface WordProgress {
  schemaVersion: 1;
  profileId: ID;
  wordId: ID;
  libraryId: ID;
  mode: Mode;
  practiceCount: number;
  wrongCount: number;
  assistedCount: number;
  independentCorrectCount: number;
  lastAnsweredAt: UTCDateTime | null;
  lastAnswerId: ID | null;
  lastResult: GradeResult | null;
  review: { status: 'unseen' | 'ready' | 'needs_review'; dueAt: UTCDateTime | null; algorithm: string | null };
}
/** Phase 2 contract only: NOT implemented or called by the current app. */
export interface PracticeRepository {
  /** One transaction: identical retry is no-op, conflict rejects, no silent replacement. */
  putBundle(bundle: { attempt: PracticeAttempt; answers: AttemptAnswer[] }): Promise<void>;
  getAttempt(id: ID): Promise<{ attempt: PracticeAttempt; answers: AttemptAnswer[] } | null>;
  listAttempts(profileId: ID): Promise<PracticeAttempt[]>;
  /** Derived disposable cache, never the only source of truth. */
  getProgress(profileId: ID): Promise<WordProgress[]>;
}
