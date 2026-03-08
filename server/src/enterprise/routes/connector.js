/**
 * Enterprise File Connector Routes
 * The connector lets users link multiple files together and process them as a unit.
 *
 * POST   /enterprise/connections              - create a connection
 * GET    /enterprise/connections/:workspaceId - list connections in workspace
 * GET    /enterprise/connections/detail/:id   - get connection detail
 * PUT    /enterprise/connections/:id          - update connection (add/remove files)
 * DELETE /enterprise/connections/:id          - delete connection
 * POST   /enterprise/connections/:id/analyze  - run AI analysis on connection
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, Connections, Files, Analyses, Workspaces } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { analyzeFiles } from '../services/aiConnector.js';

const router = Router();
router.use(requireAuth);

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY || '';

function assertWorkspaceAccess(db, workspaceId, userId) {
  const ws = Workspaces.findById(db, workspaceId);
  if (!ws) return null;
  if (ws.owner_id === userId) return ws;
  const all = Workspaces.forUser(db, userId);
  return all.find(w => w.id === workspaceId) || null;
}

// POST /enterprise/connections
router.post('/', (req, res) => {
  const { workspaceId, name, description, fileIds = [] } = req.body || {};
  if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId is required' });
  if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name is required' });

  const db = getDb();
  const ws = assertWorkspaceAccess(db, workspaceId, req.user.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

  // Validate that all fileIds belong to this workspace
  if (fileIds.length) {
    const files = Files.byIds(db, fileIds);
    const badFile = files.find(f => f.workspace_id !== workspaceId);
    if (badFile || files.length !== fileIds.length) {
      return res.status(400).json({ ok: false, error: 'Some files do not belong to this workspace' });
    }
  }

  const id = uuidv4();
  Connections.create(db, {
    id,
    workspace_id: workspaceId,
    creator_id: req.user.id,
    name: name.trim(),
    description: description?.trim() || '',
    file_ids: JSON.stringify(fileIds),
  });

  const connection = Connections.findById(db, id);
  return res.status(201).json({ ok: true, connection });
});

// GET /enterprise/connections/workspace/:workspaceId
router.get('/workspace/:workspaceId', (req, res) => {
  const db = getDb();
  const ws = assertWorkspaceAccess(db, req.params.workspaceId, req.user.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

  const connections = Connections.forWorkspace(db, req.params.workspaceId);
  // Enrich with file details
  const enriched = connections.map(c => ({
    ...c,
    file_ids: JSON.parse(c.file_ids || '[]'),
    files: Files.byIds(db, JSON.parse(c.file_ids || '[]')),
  }));

  return res.json({ ok: true, connections: enriched });
});

// GET /enterprise/connections/detail/:id
router.get('/detail/:id', (req, res) => {
  const db = getDb();
  const conn = Connections.findById(db, req.params.id);
  if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });

  const ws = assertWorkspaceAccess(db, conn.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  const fileIds = JSON.parse(conn.file_ids || '[]');
  const files = Files.byIds(db, fileIds);
  const analyses = db.prepare(`SELECT * FROM analyses WHERE connection_id = ? ORDER BY created_at DESC`).all(conn.id);

  return res.json({
    ok: true,
    connection: { ...conn, file_ids: fileIds },
    files,
    analyses,
  });
});

// PUT /enterprise/connections/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const conn = Connections.findById(db, req.params.id);
  if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });

  const ws = assertWorkspaceAccess(db, conn.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  const { name, description, fileIds } = req.body || {};
  const updates = {};
  if (name?.trim()) updates.name = name.trim();
  if (description !== undefined) updates.description = description.trim();
  if (fileIds !== undefined) {
    const files = Files.byIds(db, fileIds);
    if (files.some(f => f.workspace_id !== conn.workspace_id)) {
      return res.status(400).json({ ok: false, error: 'Some files do not belong to this workspace' });
    }
    updates.file_ids = JSON.stringify(fileIds);
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, error: 'Nothing to update' });
  }

  Connections.update(db, conn.id, updates);
  const updated = Connections.findById(db, conn.id);
  return res.json({ ok: true, connection: { ...updated, file_ids: JSON.parse(updated.file_ids || '[]') } });
});

// DELETE /enterprise/connections/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const conn = Connections.findById(db, req.params.id);
  if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });

  const ws = assertWorkspaceAccess(db, conn.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  Connections.delete(db, conn.id);
  return res.json({ ok: true, message: 'Connection deleted' });
});

// POST /enterprise/connections/:id/analyze
// Run AI analysis on all files in the connection
router.post('/:id/analyze', async (req, res) => {
  const db = getDb();
  const conn = Connections.findById(db, req.params.id);
  if (!conn) return res.status(404).json({ ok: false, error: 'Connection not found' });

  const ws = assertWorkspaceAccess(db, conn.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  const { prompt = '', provider = 'gemini' } = req.body || {};
  if (!['openai', 'gemini'].includes(provider)) {
    return res.status(400).json({ ok: false, error: 'Invalid provider. Use openai or gemini.' });
  }

  const fileIds = JSON.parse(conn.file_ids || '[]');
  if (!fileIds.length) {
    return res.status(400).json({ ok: false, error: 'Connection has no files. Add files before analyzing.' });
  }

  const files = Files.byIds(db, fileIds);
  if (!files.length) {
    return res.status(400).json({ ok: false, error: 'No valid files found in connection' });
  }

  // Create analysis record
  const analysisId = uuidv4();
  Analyses.create(db, {
    id: analysisId,
    workspace_id: conn.workspace_id,
    connection_id: conn.id,
    user_id: req.user.id,
    prompt,
    provider,
    file_ids: conn.file_ids,
  });

  try {
    const apiKey = provider === 'openai' ? OPENAI_API_KEY() : GEMINI_API_KEY();
    if (!apiKey) {
      Analyses.update(db, analysisId, { result: null, status: 'failed' });
      return res.status(500).json({ ok: false, error: `Missing ${provider.toUpperCase()}_API_KEY` });
    }

    const result = await analyzeFiles(files, prompt, provider, apiKey);
    Analyses.update(db, analysisId, { result, status: 'completed' });

    return res.json({
      ok: true,
      analysisId,
      result,
      filesAnalyzed: files.length,
      provider,
    });
  } catch (e) {
    console.error('Analysis error:', e);
    Analyses.update(db, analysisId, { result: null, status: 'failed' });
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(500).json({
      ok: false,
      error: isDev ? e.message : 'Analysis failed. Please try again.',
    });
  }
});

// POST /enterprise/connections/analyze-files — analyze specific files without a connection
router.post('/analyze-files', async (req, res) => {
  const { workspaceId, fileIds = [], prompt = '', provider = 'gemini' } = req.body || {};
  if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspaceId is required' });
  if (!fileIds.length) return res.status(400).json({ ok: false, error: 'fileIds are required' });
  if (!['openai', 'gemini'].includes(provider)) {
    return res.status(400).json({ ok: false, error: 'Invalid provider' });
  }

  const db = getDb();
  const ws = assertWorkspaceAccess(db, workspaceId, req.user.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

  const files = Files.byIds(db, fileIds);
  if (!files.length) return res.status(400).json({ ok: false, error: 'No valid files found' });
  if (files.some(f => f.workspace_id !== workspaceId)) {
    return res.status(400).json({ ok: false, error: 'Some files do not belong to this workspace' });
  }

  // Create analysis record
  const analysisId = uuidv4();
  Analyses.create(db, {
    id: analysisId,
    workspace_id: workspaceId,
    user_id: req.user.id,
    prompt,
    provider,
    file_ids: JSON.stringify(fileIds),
  });

  try {
    const apiKey = provider === 'openai' ? OPENAI_API_KEY() : GEMINI_API_KEY();
    if (!apiKey) {
      Analyses.update(db, analysisId, { result: null, status: 'failed' });
      return res.status(500).json({ ok: false, error: `Missing ${provider.toUpperCase()}_API_KEY` });
    }

    const result = await analyzeFiles(files, prompt, provider, apiKey);
    Analyses.update(db, analysisId, { result, status: 'completed' });

    return res.json({ ok: true, analysisId, result, filesAnalyzed: files.length, provider });
  } catch (e) {
    console.error('Analysis error:', e);
    Analyses.update(db, analysisId, { result: null, status: 'failed' });
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(500).json({
      ok: false,
      error: isDev ? e.message : 'Analysis failed. Please try again.',
    });
  }
});

export default router;
