import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { AGENT_DEFINITIONS } from "./agents";
import type {
  Agent,
  Observation,
  Comment,
  Vote,
  Tag,
  CommentWithAgent,
  VoteWithAgent,
  ThreadListItem,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "quorum.db");
const MIGRATIONS_DIR = path.join(DATA_DIR, "migrations");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    runMigrations(_db);
    seedAgents(_db);
  }
  return _db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[])
      .map((r) => r.name)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}

function seedAgents(db: Database.Database) {
  const upsert = db.prepare(
    `INSERT INTO agents (id, name, system_prompt, tools)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       system_prompt = excluded.system_prompt,
       tools = excluded.tools`
  );
  for (const agent of AGENT_DEFINITIONS) {
    upsert.run(agent.id, agent.name, agent.system_prompt, agent.tools);
  }
}

// --- Agents ---

export function getAllAgents(): Agent[] {
  return getDb().prepare("SELECT * FROM agents").all() as Agent[];
}

export function getAgent(id: string): Agent | undefined {
  return getDb().prepare("SELECT * FROM agents WHERE id = ?").get(id) as
    | Agent
    | undefined;
}

// --- Observations (threads) ---

export function createObservation(
  title: string,
  body: string,
  agentIds: string[]
): Observation {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO observations (id, title, body, phase, last_activity_at, created_at) VALUES (?, ?, ?, 'discussion', ?, ?)"
  ).run(id, title, body, now, now);

  const insertAgent = db.prepare(
    "INSERT INTO thread_agents (observation_id, agent_id) VALUES (?, ?)"
  );
  for (const agentId of agentIds) {
    insertAgent.run(id, agentId);
  }

  return getObservation(id)!;
}

export function getObservation(id: string): Observation | undefined {
  return getDb()
    .prepare("SELECT * FROM observations WHERE id = ?")
    .get(id) as Observation | undefined;
}

export function listObservations(): ThreadListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT o.id, o.title, o.phase, o.result, o.created_at,
              COUNT(c.id) as commentCount
       FROM observations o
       LEFT JOIN comments c ON c.observation_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    .all() as (Observation & { commentCount: number })[];

  return rows.map((row) => {
    const agents = db
      .prepare(
        `SELECT a.id, a.name FROM agents a
         JOIN thread_agents ta ON ta.agent_id = a.id
         WHERE ta.observation_id = ?`
      )
      .all(row.id) as { id: string; name: string }[];
    return {
      id: row.id,
      title: row.title,
      phase: row.phase,
      result: row.result,
      commentCount: row.commentCount,
      agents,
      created_at: row.created_at,
    };
  });
}

export function updateObservationPhase(
  id: string,
  phase: Observation["phase"]
) {
  getDb()
    .prepare("UPDATE observations SET phase = ? WHERE id = ?")
    .run(phase, id);
}

export function updateObservationResult(
  id: string,
  result: "approved" | "rejected"
) {
  getDb()
    .prepare("UPDATE observations SET result = ?, phase = 'resolved' WHERE id = ?")
    .run(result, id);
}

export function updateLastActivity(id: string) {
  getDb()
    .prepare(
      "UPDATE observations SET last_activity_at = datetime('now') WHERE id = ?"
    )
    .run(id);
}

// --- Thread Agents ---

export function getThreadAgentIds(observationId: string): string[] {
  const rows = getDb()
    .prepare("SELECT agent_id FROM thread_agents WHERE observation_id = ?")
    .all(observationId) as { agent_id: string }[];
  return rows.map((r) => r.agent_id);
}

export function getThreadAgents(observationId: string): Agent[] {
  return getDb()
    .prepare(
      `SELECT a.* FROM agents a
       JOIN thread_agents ta ON ta.agent_id = a.id
       WHERE ta.observation_id = ?`
    )
    .all(observationId) as Agent[];
}

// --- Comments ---

export function addComment(
  observationId: string,
  agentId: string,
  body: string
): Comment {
  const db = getDb();
  const id = uuid();
  db.prepare(
    "INSERT INTO comments (id, observation_id, agent_id, body) VALUES (?, ?, ?, ?)"
  ).run(id, observationId, agentId, body);
  updateLastActivity(observationId);
  return db.prepare("SELECT * FROM comments WHERE id = ?").get(id) as Comment;
}

export function getComments(observationId: string): CommentWithAgent[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, a.name as agentName
       FROM comments c
       JOIN agents a ON a.id = c.agent_id
       WHERE c.observation_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(observationId) as (Comment & { agentName: string })[];

  return rows.map((row) => ({
    ...row,
    timeAgo: getTimeAgo(row.created_at),
  }));
}

export function getCommentCount(observationId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) as count FROM comments WHERE observation_id = ?"
    )
    .get(observationId) as { count: number };
  return row.count;
}

export function getAgentCommentCount(
  observationId: string,
  agentId: string
): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) as count FROM comments WHERE observation_id = ? AND agent_id = ?"
    )
    .get(observationId, agentId) as { count: number };
  return row.count;
}

// --- Tags ---

export function addTag(
  observationId: string,
  commentId: string,
  fromAgentId: string,
  toAgentId: string
): Tag | null {
  const db = getDb();
  const id = uuid();
  try {
    db.prepare(
      "INSERT INTO tags (id, observation_id, comment_id, from_agent_id, to_agent_id) VALUES (?, ?, ?, ?, ?)"
    ).run(id, observationId, commentId, fromAgentId, toAgentId);
    return db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as Tag;
  } catch {
    // UNIQUE constraint violation — agent already tagged in this thread
    return null;
  }
}

export function getTags(observationId: string): Tag[] {
  return getDb()
    .prepare("SELECT * FROM tags WHERE observation_id = ? ORDER BY created_at ASC")
    .all(observationId) as Tag[];
}

export function hasBeenTagged(
  observationId: string,
  agentId: string
): boolean {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) as count FROM tags WHERE observation_id = ? AND to_agent_id = ?"
    )
    .get(observationId, agentId) as { count: number };
  return row.count > 0;
}

// --- Votes ---

export function addVote(
  observationId: string,
  agentId: string,
  value: 1 | -1,
  reasoning: string
): Vote {
  const db = getDb();
  const id = uuid();
  db.prepare(
    "INSERT INTO votes (id, observation_id, agent_id, value, reasoning) VALUES (?, ?, ?, ?, ?)"
  ).run(id, observationId, agentId, value, reasoning);
  return db.prepare("SELECT * FROM votes WHERE id = ?").get(id) as Vote;
}

export function getVotes(observationId: string): VoteWithAgent[] {
  return getDb()
    .prepare(
      `SELECT v.*, a.name as agentName
       FROM votes v
       JOIN agents a ON a.id = v.agent_id
       WHERE v.observation_id = ?
       ORDER BY v.created_at ASC`
    )
    .all(observationId) as VoteWithAgent[];
}

// --- Helpers ---

function getTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
