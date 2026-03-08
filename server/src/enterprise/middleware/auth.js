/**
 * JWT authentication middleware for enterprise routes.
 */

import jwt from 'jsonwebtoken';
import { getDb, Users } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cognito-enterprise-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Middleware: require a valid JWT token.
 * Attaches req.user = { id, email, name, role } on success.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(token);
    const db = getDb();
    const user = Users.findById(db, payload.id);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'User not found' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: require a specific role.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Optional auth — doesn't fail if no token, but populates req.user if valid.
 */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    const db = getDb();
    req.user = Users.findById(db, payload.id);
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}
