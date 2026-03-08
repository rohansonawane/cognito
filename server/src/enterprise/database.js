/**
 * Enterprise SQLite database layer using better-sqlite3.
 * Handles users, workspaces, files, connections, and analysis history.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_DIR || join(__dirname, '../../../data');
const DB_PATH = join(DB_DIR, 'cognito-enterprise.db');

let db;

export function getDb() {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role          TEXT NOT NULL DEFAULT 'viewer',
      joined_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS files (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      uploader_id   TEXT NOT NULL REFERENCES users(id),
      name          TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size          INTEGER NOT NULL,
      file_type     TEXT NOT NULL,
      storage_path  TEXT NOT NULL,
      url           TEXT,
      metadata      TEXT DEFAULT '{}',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS connections (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      creator_id    TEXT NOT NULL REFERENCES users(id),
      name          TEXT NOT NULL,
      description   TEXT DEFAULT '',
      file_ids      TEXT NOT NULL DEFAULT '[]',
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
      user_id       TEXT NOT NULL REFERENCES users(id),
      prompt        TEXT DEFAULT '',
      provider      TEXT NOT NULL DEFAULT 'gemini',
      result        TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      file_ids      TEXT NOT NULL DEFAULT '[]',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL UNIQUE,
      last_used   INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_connections_workspace ON connections(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_workspace ON analyses(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_connection ON analyses(connection_id);
  `);
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export const Users = {
  create: (db, { id, email, name, password, role = 'user' }) =>
    db.prepare(`INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, ?)`)
      .run(id, email, name, password, role),

  findByEmail: (db, email) =>
    db.prepare(`SELECT * FROM users WHERE email = ?`).get(email),

  findById: (db, id) =>
    db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(id),

  list: (db) =>
    db.prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC`).all(),
};

// ─── Workspace helpers ────────────────────────────────────────────────────────

export const Workspaces = {
  create: (db, { id, owner_id, name, description = '' }) =>
    db.prepare(`INSERT INTO workspaces (id, owner_id, name, description) VALUES (?, ?, ?, ?)`)
      .run(id, owner_id, name, description),

  findById: (db, id) =>
    db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id),

  forUser: (db, userId) =>
    db.prepare(`
      SELECT w.* FROM workspaces w
      WHERE w.owner_id = ?
      UNION
      SELECT w.* FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
      ORDER BY w.updated_at DESC
    `).all(userId, userId),

  update: (db, id, { name, description }) =>
    db.prepare(`UPDATE workspaces SET name = ?, description = ?, updated_at = unixepoch() WHERE id = ?`)
      .run(name, description, id),

  delete: (db, id) =>
    db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id),

  addMember: (db, { workspace_id, user_id, role = 'viewer' }) =>
    db.prepare(`INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)`)
      .run(workspace_id, user_id, role),
};

// ─── File helpers ─────────────────────────────────────────────────────────────

export const Files = {
  create: (db, { id, workspace_id, uploader_id, name, original_name, mime_type, size, file_type, storage_path, url = null, metadata = '{}' }) =>
    db.prepare(`INSERT INTO files (id, workspace_id, uploader_id, name, original_name, mime_type, size, file_type, storage_path, url, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, workspace_id, uploader_id, name, original_name, mime_type, size, file_type, storage_path, url, metadata),

  findById: (db, id) =>
    db.prepare(`SELECT * FROM files WHERE id = ?`).get(id),

  forWorkspace: (db, workspaceId) =>
    db.prepare(`SELECT * FROM files WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId),

  byIds: (db, ids) => {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).all(...ids);
  },

  delete: (db, id) =>
    db.prepare(`DELETE FROM files WHERE id = ?`).run(id),
};

// ─── Connection helpers ───────────────────────────────────────────────────────

export const Connections = {
  create: (db, { id, workspace_id, creator_id, name, description = '', file_ids = '[]' }) =>
    db.prepare(`INSERT INTO connections (id, workspace_id, creator_id, name, description, file_ids)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, workspace_id, creator_id, name, description, file_ids),

  findById: (db, id) =>
    db.prepare(`SELECT * FROM connections WHERE id = ?`).get(id),

  forWorkspace: (db, workspaceId) =>
    db.prepare(`SELECT * FROM connections WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId),

  update: (db, id, updates) => {
    const fields = Object.entries(updates)
      .map(([k]) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);
    return db.prepare(`UPDATE connections SET ${fields}, updated_at = unixepoch() WHERE id = ?`)
      .run(...values, id);
  },

  delete: (db, id) =>
    db.prepare(`DELETE FROM connections WHERE id = ?`).run(id),
};

// ─── Analysis helpers ─────────────────────────────────────────────────────────

export const Analyses = {
  create: (db, { id, workspace_id, connection_id = null, user_id, prompt = '', provider = 'gemini', file_ids = '[]' }) =>
    db.prepare(`INSERT INTO analyses (id, workspace_id, connection_id, user_id, prompt, provider, file_ids)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, workspace_id, connection_id, user_id, prompt, provider, file_ids),

  findById: (db, id) =>
    db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id),

  forWorkspace: (db, workspaceId) =>
    db.prepare(`SELECT * FROM analyses WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId),

  update: (db, id, { result, status }) =>
    db.prepare(`UPDATE analyses SET result = ?, status = ?, updated_at = unixepoch() WHERE id = ?`)
      .run(result, status, id),
};
