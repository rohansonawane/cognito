/**
 * Enterprise Workspace Routes
 * GET    /enterprise/workspaces          - list user's workspaces
 * POST   /enterprise/workspaces          - create workspace
 * GET    /enterprise/workspaces/:id      - get workspace details
 * PUT    /enterprise/workspaces/:id      - update workspace
 * DELETE /enterprise/workspaces/:id      - delete workspace
 * POST   /enterprise/workspaces/:id/members - add member
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, Workspaces, Files, Connections, Analyses, Users } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Check workspace access
function assertAccess(db, workspaceId, userId) {
  const ws = Workspaces.findById(db, workspaceId);
  if (!ws) return null;
  if (ws.owner_id === userId) return { ws, role: 'owner' };
  const workspaces = Workspaces.forUser(db, userId);
  if (workspaces.find(w => w.id === workspaceId)) return { ws, role: 'member' };
  return null;
}

// GET /enterprise/workspaces
router.get('/', (req, res) => {
  const db = getDb();
  const workspaces = Workspaces.forUser(db, req.user.id);
  return res.json({ ok: true, workspaces });
});

// POST /enterprise/workspaces
router.post('/', (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ ok: false, error: 'Workspace name is required' });
  }
  const db = getDb();
  const id = uuidv4();
  Workspaces.create(db, { id, owner_id: req.user.id, name: name.trim(), description: description?.trim() || '' });
  const ws = Workspaces.findById(db, id);
  return res.status(201).json({ ok: true, workspace: ws });
});

// GET /enterprise/workspaces/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const access = assertAccess(db, req.params.id, req.user.id);
  if (!access) return res.status(404).json({ ok: false, error: 'Workspace not found' });

  const files = Files.forWorkspace(db, req.params.id);
  const connections = Connections.forWorkspace(db, req.params.id);
  const analyses = Analyses.forWorkspace(db, req.params.id);

  return res.json({
    ok: true,
    workspace: access.ws,
    role: access.role,
    stats: { files: files.length, connections: connections.length, analyses: analyses.length },
    files,
    connections,
    recentAnalyses: analyses.slice(0, 10),
  });
});

// PUT /enterprise/workspaces/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const ws = Workspaces.findById(db, req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found' });
  if (ws.owner_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Only the owner can update this workspace' });

  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'Workspace name is required' });

  Workspaces.update(db, req.params.id, { name: name.trim(), description: description?.trim() || '' });
  return res.json({ ok: true, workspace: Workspaces.findById(db, req.params.id) });
});

// DELETE /enterprise/workspaces/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const ws = Workspaces.findById(db, req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found' });
  if (ws.owner_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Only the owner can delete this workspace' });

  Workspaces.delete(db, req.params.id);
  return res.json({ ok: true, message: 'Workspace deleted' });
});

// POST /enterprise/workspaces/:id/members
router.post('/:id/members', (req, res) => {
  const db = getDb();
  const ws = Workspaces.findById(db, req.params.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found' });
  if (ws.owner_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Only the owner can add members' });

  const { email, role = 'viewer' } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'Email is required' });

  const user = Users.findByEmail(db, email.toLowerCase());
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  Workspaces.addMember(db, { workspace_id: req.params.id, user_id: user.id, role });
  return res.json({ ok: true, message: `${user.name} added to workspace` });
});

export default router;
