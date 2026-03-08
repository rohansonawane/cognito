/**
 * Enterprise Database layer tests.
 * Uses an in-memory SQLite database for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Users, Workspaces, Files, Connections, Analyses } from '../enterprise/database.js';

// Helper: create a fresh in-memory DB with the schema
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, description TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'viewer', joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      uploader_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
      file_type TEXT NOT NULL, storage_path TEXT NOT NULL, url TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      description TEXT DEFAULT '', file_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES users(id), prompt TEXT DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'gemini', result TEXT,
      status TEXT NOT NULL DEFAULT 'pending', file_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  return db;
}

let db;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

// ─── Users ────────────────────────────────────────────────────────────────────

describe('Users', () => {
  it('creates and retrieves a user', () => {
    Users.create(db, { id: 'u1', email: 'test@test.com', name: 'Test User', password: 'hashed', role: 'user' });
    const user = Users.findById(db, 'u1');
    expect(user).toBeDefined();
    expect(user.email).toBe('test@test.com');
    expect(user.name).toBe('Test User');
    expect(user.role).toBe('user');
  });

  it('finds user by email', () => {
    Users.create(db, { id: 'u2', email: 'alice@example.com', name: 'Alice', password: 'hash', role: 'user' });
    const user = Users.findByEmail(db, 'alice@example.com');
    expect(user).toBeDefined();
    expect(user.id).toBe('u2');
  });

  it('returns null for non-existent user', () => {
    expect(Users.findById(db, 'nonexistent')).toBeUndefined();
    expect(Users.findByEmail(db, 'nope@nope.com')).toBeUndefined();
  });

  it('enforces unique email constraint', () => {
    Users.create(db, { id: 'u3', email: 'dup@dup.com', name: 'A', password: 'h', role: 'user' });
    expect(() => {
      Users.create(db, { id: 'u4', email: 'dup@dup.com', name: 'B', password: 'h', role: 'user' });
    }).toThrow();
  });

  it('lists all users', () => {
    Users.create(db, { id: 'u5', email: 'a@a.com', name: 'A', password: 'h', role: 'user' });
    Users.create(db, { id: 'u6', email: 'b@b.com', name: 'B', password: 'h', role: 'admin' });
    const users = Users.list(db);
    expect(users.length).toBe(2);
  });
});

// ─── Workspaces ───────────────────────────────────────────────────────────────

describe('Workspaces', () => {
  beforeEach(() => {
    Users.create(db, { id: 'u1', email: 'owner@test.com', name: 'Owner', password: 'h', role: 'user' });
    Users.create(db, { id: 'u2', email: 'member@test.com', name: 'Member', password: 'h', role: 'user' });
  });

  it('creates and retrieves a workspace', () => {
    Workspaces.create(db, { id: 'ws1', owner_id: 'u1', name: 'My Workspace', description: 'Test' });
    const ws = Workspaces.findById(db, 'ws1');
    expect(ws).toBeDefined();
    expect(ws.name).toBe('My Workspace');
    expect(ws.owner_id).toBe('u1');
  });

  it('lists workspaces for user (owner + member)', () => {
    Workspaces.create(db, { id: 'ws1', owner_id: 'u1', name: 'Owned', description: '' });
    Workspaces.create(db, { id: 'ws2', owner_id: 'u2', name: 'Shared', description: '' });
    Workspaces.addMember(db, { workspace_id: 'ws2', user_id: 'u1', role: 'viewer' });

    const workspaces = Workspaces.forUser(db, 'u1');
    const ids = workspaces.map(w => w.id);
    expect(ids).toContain('ws1');
    expect(ids).toContain('ws2');
  });

  it('updates workspace name and description', () => {
    Workspaces.create(db, { id: 'ws3', owner_id: 'u1', name: 'Old Name', description: 'Old' });
    Workspaces.update(db, 'ws3', { name: 'New Name', description: 'New' });
    const ws = Workspaces.findById(db, 'ws3');
    expect(ws.name).toBe('New Name');
    expect(ws.description).toBe('New');
  });

  it('deletes workspace', () => {
    Workspaces.create(db, { id: 'ws4', owner_id: 'u1', name: 'To Delete', description: '' });
    Workspaces.delete(db, 'ws4');
    expect(Workspaces.findById(db, 'ws4')).toBeUndefined();
  });
});

// ─── Files ────────────────────────────────────────────────────────────────────

describe('Files', () => {
  beforeEach(() => {
    Users.create(db, { id: 'u1', email: 'u1@test.com', name: 'U1', password: 'h', role: 'user' });
    Workspaces.create(db, { id: 'ws1', owner_id: 'u1', name: 'WS', description: '' });
  });

  it('creates and retrieves a file', () => {
    Files.create(db, {
      id: 'f1', workspace_id: 'ws1', uploader_id: 'u1',
      name: 'img.jpg', original_name: 'image.jpg',
      mime_type: 'image/jpeg', size: 1024,
      file_type: 'image', storage_path: '/tmp/img.jpg',
      url: '/enterprise/files/download/f1', metadata: '{}',
    });
    const file = Files.findById(db, 'f1');
    expect(file).toBeDefined();
    expect(file.original_name).toBe('image.jpg');
    expect(file.file_type).toBe('image');
    expect(file.size).toBe(1024);
  });

  it('lists files for workspace', () => {
    for (let i = 1; i <= 3; i++) {
      Files.create(db, {
        id: `f${i}`, workspace_id: 'ws1', uploader_id: 'u1',
        name: `file${i}.txt`, original_name: `file${i}.txt`,
        mime_type: 'text/plain', size: 100 * i,
        file_type: 'article', storage_path: `/tmp/f${i}.txt`,
        url: null, metadata: '{}',
      });
    }
    const files = Files.forWorkspace(db, 'ws1');
    expect(files.length).toBe(3);
  });

  it('retrieves files by IDs', () => {
    Files.create(db, { id: 'fa', workspace_id: 'ws1', uploader_id: 'u1', name: 'a.txt', original_name: 'a.txt', mime_type: 'text/plain', size: 50, file_type: 'article', storage_path: '/tmp/a', url: null, metadata: '{}' });
    Files.create(db, { id: 'fb', workspace_id: 'ws1', uploader_id: 'u1', name: 'b.txt', original_name: 'b.txt', mime_type: 'text/plain', size: 50, file_type: 'article', storage_path: '/tmp/b', url: null, metadata: '{}' });

    const files = Files.byIds(db, ['fa', 'fb']);
    expect(files.length).toBe(2);
    const ids = files.map(f => f.id);
    expect(ids).toContain('fa');
    expect(ids).toContain('fb');
  });

  it('deletes file', () => {
    Files.create(db, { id: 'fd', workspace_id: 'ws1', uploader_id: 'u1', name: 'del.txt', original_name: 'del.txt', mime_type: 'text/plain', size: 10, file_type: 'article', storage_path: '/tmp/del', url: null, metadata: '{}' });
    Files.delete(db, 'fd');
    expect(Files.findById(db, 'fd')).toBeUndefined();
  });
});

// ─── Connections ──────────────────────────────────────────────────────────────

describe('Connections', () => {
  beforeEach(() => {
    Users.create(db, { id: 'u1', email: 'u1@test.com', name: 'U1', password: 'h', role: 'user' });
    Workspaces.create(db, { id: 'ws1', owner_id: 'u1', name: 'WS', description: '' });
  });

  it('creates and retrieves a connection', () => {
    Connections.create(db, {
      id: 'c1', workspace_id: 'ws1', creator_id: 'u1',
      name: 'My Connection', description: 'Testing',
      file_ids: JSON.stringify(['f1', 'f2']),
    });
    const conn = Connections.findById(db, 'c1');
    expect(conn).toBeDefined();
    expect(conn.name).toBe('My Connection');
    expect(JSON.parse(conn.file_ids)).toEqual(['f1', 'f2']);
  });

  it('lists connections for workspace', () => {
    Connections.create(db, { id: 'c1', workspace_id: 'ws1', creator_id: 'u1', name: 'C1', description: '', file_ids: '[]' });
    Connections.create(db, { id: 'c2', workspace_id: 'ws1', creator_id: 'u1', name: 'C2', description: '', file_ids: '[]' });
    const conns = Connections.forWorkspace(db, 'ws1');
    expect(conns.length).toBe(2);
  });

  it('updates connection', () => {
    Connections.create(db, { id: 'c3', workspace_id: 'ws1', creator_id: 'u1', name: 'Old', description: '', file_ids: '[]' });
    Connections.update(db, 'c3', { name: 'New Name', file_ids: JSON.stringify(['f1']) });
    const conn = Connections.findById(db, 'c3');
    expect(conn.name).toBe('New Name');
    expect(JSON.parse(conn.file_ids)).toEqual(['f1']);
  });

  it('deletes connection', () => {
    Connections.create(db, { id: 'c4', workspace_id: 'ws1', creator_id: 'u1', name: 'Del', description: '', file_ids: '[]' });
    Connections.delete(db, 'c4');
    expect(Connections.findById(db, 'c4')).toBeUndefined();
  });
});

// ─── Analyses ─────────────────────────────────────────────────────────────────

describe('Analyses', () => {
  beforeEach(() => {
    Users.create(db, { id: 'u1', email: 'u1@test.com', name: 'U1', password: 'h', role: 'user' });
    Workspaces.create(db, { id: 'ws1', owner_id: 'u1', name: 'WS', description: '' });
  });

  it('creates and retrieves an analysis', () => {
    Analyses.create(db, {
      id: 'a1', workspace_id: 'ws1', user_id: 'u1',
      prompt: 'Analyze this', provider: 'gemini', file_ids: '["f1"]',
    });
    const analysis = Analyses.findById(db, 'a1');
    expect(analysis).toBeDefined();
    expect(analysis.status).toBe('pending');
    expect(analysis.provider).toBe('gemini');
  });

  it('updates analysis with result', () => {
    Analyses.create(db, { id: 'a2', workspace_id: 'ws1', user_id: 'u1', prompt: '', provider: 'openai', file_ids: '[]' });
    Analyses.update(db, 'a2', { result: 'Analysis complete!', status: 'completed' });
    const analysis = Analyses.findById(db, 'a2');
    expect(analysis.status).toBe('completed');
    expect(analysis.result).toBe('Analysis complete!');
  });

  it('lists analyses for workspace', () => {
    for (let i = 1; i <= 5; i++) {
      Analyses.create(db, { id: `a${i}`, workspace_id: 'ws1', user_id: 'u1', prompt: `Prompt ${i}`, provider: 'gemini', file_ids: '[]' });
    }
    const analyses = Analyses.forWorkspace(db, 'ws1');
    expect(analyses.length).toBe(5);
  });
});
