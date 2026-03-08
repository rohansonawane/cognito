/**
 * Enterprise File Routes
 * POST   /enterprise/files/upload        - upload one or more files
 * GET    /enterprise/files/:workspaceId  - list files in workspace
 * GET    /enterprise/files/download/:id  - download a file
 * DELETE /enterprise/files/:id           - delete a file
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import { existsSync, unlinkSync, statSync } from 'fs';
import { createReadStream } from 'fs';
import { getDb, Files, Workspaces } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { upload, detectFileType, UPLOAD_DIR } from '../middleware/upload.js';

const router = Router();
router.use(requireAuth);

function assertWorkspaceAccess(db, workspaceId, userId) {
  const ws = Workspaces.findById(db, workspaceId);
  if (!ws) return null;
  if (ws.owner_id === userId) return ws;
  const all = Workspaces.forUser(db, userId);
  return all.find(w => w.id === workspaceId) || null;
}

// POST /enterprise/files/upload
// Body: workspaceId (form field), files[] (multipart)
router.post('/upload', upload.array('files', 20), (req, res) => {
  try {
    const { workspaceId } = req.body;
    if (!workspaceId) {
      return res.status(400).json({ ok: false, error: 'workspaceId is required' });
    }

    const db = getDb();
    const ws = assertWorkspaceAccess(db, workspaceId, req.user.id);
    if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

    const uploadedFiles = req.files || [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ ok: false, error: 'No files uploaded' });
    }

    const saved = [];
    for (const f of uploadedFiles) {
      const fileType = detectFileType(f.mimetype, f.originalname);
      const id = uuidv4();
      const storagePath = f.path;

      Files.create(db, {
        id,
        workspace_id: workspaceId,
        uploader_id: req.user.id,
        name: f.filename,
        original_name: f.originalname,
        mime_type: f.mimetype,
        size: f.size,
        file_type: fileType,
        storage_path: storagePath,
        url: `/enterprise/files/download/${id}`,
        metadata: JSON.stringify({}),
      });

      saved.push(Files.findById(db, id));
    }

    return res.status(201).json({ ok: true, files: saved });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Upload failed' });
  }
});

// GET /enterprise/files/workspace/:workspaceId
router.get('/workspace/:workspaceId', (req, res) => {
  const db = getDb();
  const ws = assertWorkspaceAccess(db, req.params.workspaceId, req.user.id);
  if (!ws) return res.status(404).json({ ok: false, error: 'Workspace not found or access denied' });

  const files = Files.forWorkspace(db, req.params.workspaceId);
  return res.json({ ok: true, files });
});

// GET /enterprise/files/download/:id
router.get('/download/:id', (req, res) => {
  const db = getDb();
  const file = Files.findById(db, req.params.id);
  if (!file) return res.status(404).json({ ok: false, error: 'File not found' });

  // Check workspace access
  const ws = assertWorkspaceAccess(db, file.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  if (!existsSync(file.storage_path)) {
    return res.status(404).json({ ok: false, error: 'File not found on disk' });
  }

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('Content-Length', file.size);
  createReadStream(file.storage_path).pipe(res);
});

// GET /enterprise/files/:id (file info)
router.get('/:id', (req, res) => {
  const db = getDb();
  const file = Files.findById(db, req.params.id);
  if (!file) return res.status(404).json({ ok: false, error: 'File not found' });

  const ws = assertWorkspaceAccess(db, file.workspace_id, req.user.id);
  if (!ws) return res.status(403).json({ ok: false, error: 'Access denied' });

  return res.json({ ok: true, file });
});

// DELETE /enterprise/files/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const file = Files.findById(db, req.params.id);
  if (!file) return res.status(404).json({ ok: false, error: 'File not found' });

  const ws = Workspaces.findById(db, file.workspace_id);
  if (!ws || (ws.owner_id !== req.user.id && file.uploader_id !== req.user.id)) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  // Remove from disk
  if (existsSync(file.storage_path)) {
    try { unlinkSync(file.storage_path); } catch { /* ignore */ }
  }

  Files.delete(db, req.params.id);
  return res.json({ ok: true, message: 'File deleted' });
});

export default router;
