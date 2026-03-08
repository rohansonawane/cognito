/**
 * Enterprise Auth Routes
 * POST /enterprise/auth/register
 * POST /enterprise/auth/login
 * GET  /enterprise/auth/me
 * POST /enterprise/auth/logout  (client-side token drop, just returns 200)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb, Users, Workspaces } from '../database.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body || {};

    if (!email || !name || !password) {
      return res.status(400).json({ ok: false, error: 'email, name, and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    }
    if (name.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Name must be at least 2 characters' });
    }

    const db = getDb();
    const existing = Users.findByEmail(db, email.toLowerCase());
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    Users.create(db, {
      id: userId,
      email: email.toLowerCase(),
      name: name.trim(),
      password: hash,
      role: 'user',
    });

    // Create a default workspace for new users
    const wsId = uuidv4();
    Workspaces.create(db, {
      id: wsId,
      owner_id: userId,
      name: `${name.trim()}'s Workspace`,
      description: 'Default workspace',
    });

    const token = signToken({ id: userId, email: email.toLowerCase() });
    const user = Users.findById(db, userId);

    return res.status(201).json({
      ok: true,
      token,
      user,
      defaultWorkspaceId: wsId,
    });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ ok: false, error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email and password are required' });
    }

    const db = getDb();
    const user = Users.findByEmail(db, email.toLowerCase());
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const token = signToken({ id: user.id, email: user.email });
    const safeUser = Users.findById(db, user.id);

    // Find default workspace
    const workspaces = Workspaces.forUser(db, user.id);

    return res.json({
      ok: true,
      token,
      user: safeUser,
      workspaces,
    });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ ok: false, error: 'Login failed' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const workspaces = Workspaces.forUser(db, req.user.id);
  return res.json({ ok: true, user: req.user, workspaces });
});

router.post('/logout', requireAuth, (_req, res) => {
  // JWT is stateless; client drops the token
  return res.json({ ok: true, message: 'Logged out successfully' });
});

export default router;
