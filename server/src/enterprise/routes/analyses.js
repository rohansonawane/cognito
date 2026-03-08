/**
 * Enterprise Analysis History Routes
 * GET /enterprise/analyses/workspace/:workspaceId - list all analyses
 * GET /enterprise/analyses/:id                    - get analysis detail
 * DELETE /enterprise/analyses/:id                 - delete analysis record
 */

import { Router } from 'express';
import { getDb, Analyses, Workspaces } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function assertWorkspaceAccess(db, workspaceId, userId) {
  const ws = Workspaces.findById(db, workspaceId);
  if (!ws) return null;
  if (ws.owner_id === userId) return ws;
  const all = Workspaces.forUser(db, userId);
  return all.find(w => w.id === workspaceId) || null;
}

// GET /enterprise/analyses/workspace/:workspaceId
router.get('/workspace/:workspaceId', (req, res) => {
  const db = getDb();
  const ws = assertWorkspaceAccess(db, req.params.workspaceId, req.user.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

  const analyses = Analyses.forWorkspace(db, req.params.workspaceId);
  const enriched = analyses.map(a => ({
    ...a,
    file_ids: JSON.parse(a.file_ids || '[]'),
  }));

  return res.json({ ok: true, analyses: enriched });
});

// GET /enterprise/analyses/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const analysis = Analyses.findById(db, req.params.id);
  if (!analysis) return res.status(404).json({ ok: false, error: 'Analysis not found' });

  const ws = assertWorkspaceAccess(db, analysis.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  return res.json({
    ok: true,
    analysis: { ...analysis, file_ids: JSON.parse(analysis.file_ids || '[]') },
  });
});

// DELETE /enterprise/analyses/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const analysis = Analyses.findById(db, req.params.id);
  if (!analysis) return res.status(404).json({ ok: false, error: 'Analysis not found' });

  const ws = assertWorkspaceAccess(db, analysis.workspace_id, req.user.id);
  if (!ws || analysis.user_id !== req.user.id) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  db.prepare(`DELETE FROM analyses WHERE id = ?`).run(req.params.id);
  return res.json({ ok: true, message: 'Analysis deleted' });
});

export default router;
