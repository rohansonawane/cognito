/**
 * Cognito Enterprise Server
 * Extends the base server with enterprise features:
 *   - JWT Authentication
 *   - SQLite persistence
 *   - Multi-file connector
 *   - Workspace management
 *   - Multi-media AI analysis
 *   - Analysis history
 */

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Enterprise routes
import authRoutes from './enterprise/routes/auth.js';
import workspaceRoutes from './enterprise/routes/workspaces.js';
import fileRoutes from './enterprise/routes/files.js';
import connectorRoutes from './enterprise/routes/connector.js';
import analysesRoutes from './enterprise/routes/analyses.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const app = express();
app.disable('x-powered-by');

// ─── Trust proxy ──────────────────────────────────────────────────────────────
if (process.env.TRUST_PROXY) {
  if (process.env.TRUST_PROXY === '0') app.set('trust proxy', false);
  else if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  else app.set('trust proxy', process.env.TRUST_PROXY);
} else if (!IS_DEV) {
  app.set('trust proxy', 'loopback');
}

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: IS_DEV ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(compression());

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['https://cognito.shuruaat.in', 'http://localhost:5173', 'http://localhost:8787'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin && IS_DEV) return callback(null, true);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 24 * 60 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 100); // Higher limit for enterprise

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit exceeded. Please try again later.' },
});

// Stricter limit on AI analysis endpoints
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.ANALYSIS_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Analysis rate limit exceeded. Please try again in an hour.' },
});

app.use('/api/', apiLimiter);
app.use('/enterprise/connections/:id/analyze', analysisLimiter);
app.use('/enterprise/connections/analyze-files', analysisLimiter);

// ─── Legacy canvas analysis endpoint ─────────────────────────────────────────
// Keep the original /api/analyze endpoint working
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 8);

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  version: '2.0.0-enterprise',
  features: ['canvas', 'auth', 'workspaces', 'file-connector', 'multi-modal-ai', 'analysis-history'],
}));

// Import and re-use original analyze logic
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, provider = 'openai', prompt } = req.body || {};
    if (!image || typeof image !== 'string') return res.status(400).json({ ok: false, error: 'Missing image dataUrl' });
    if (!['openai', 'gemini'].includes(provider)) return res.status(400).json({ ok: false, error: 'Invalid provider' });

    const validImage = validateDataUrl(image, MAX_IMAGE_MB);
    const sanitizedPrompt = sanitizePrompt(prompt);

    if (provider === 'openai') {
      if (!OPENAI_API_KEY) return res.status(500).json({ ok: false, error: 'Missing OPENAI_API_KEY' });
      const result = await analyzeOpenAI(validImage, sanitizedPrompt, OPENAI_API_KEY);
      return res.json({ ok: true, message: result });
    }

    if (provider === 'gemini') {
      if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: 'Missing GEMINI_API_KEY' });
      const result = await analyzeGemini(validImage, sanitizedPrompt, GEMINI_API_KEY);
      return res.json({ ok: true, message: result });
    }
  } catch (e) {
    console.error('Analyze error:', e);
    return res.status(500).json({ ok: false, error: IS_DEV ? String(e?.message || e) : 'Analysis failed' });
  }
});

// Dev-only rate limit reset
if (IS_DEV) {
  app.post('/api/reset-limit', (req, res) => {
    res.json({ ok: true, message: 'Rate limit will clear on server restart in dev mode' });
  });
}

// ─── Enterprise API routes ────────────────────────────────────────────────────
app.use('/enterprise/auth', authRoutes);
app.use('/enterprise/workspaces', workspaceRoutes);
app.use('/enterprise/files', fileRoutes);
app.use('/enterprise/connections', connectorRoutes);
app.use('/enterprise/analyses', analysesRoutes);

// ─── Static frontend serving ─────────────────────────────────────────────────
const webDistPath = join(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath, { maxAge: '1d', etag: true }));
  app.get('*', (_req, res) => {
    res.sendFile(join(webDistPath, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: `File too large. Max ${process.env.MAX_FILE_MB || 100}MB allowed.` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ ok: false, error: 'Too many files. Max 20 files per upload.' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({
    ok: false,
    error: IS_DEV ? (err.message || String(err)) : 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`[cognito-enterprise] v2.0.0 listening on http://127.0.0.1:${PORT}`);
  console.log(`[cognito-enterprise] Enterprise features: auth, workspaces, file-connector, multi-modal AI`);
});

// ─── Shared analysis helpers (from original index.js) ────────────────────────

const SYSTEM_PROMPT = `You are an expert canvas analyst. The whiteboard can contain anything (math, UI wireframes, architecture diagrams, code, meeting notes, sketches, etc.). Tailor the response to whatever is actually present—do not assume it is mathematical. Use concise sections and bullets when helpful. Only add a Math Steps or Answer section if math is clearly present; otherwise summarize key insights, actions, or suggestions that match the content type.

MANDATORY MATH FORMATTING RULE:
EVERY mathematical expression, formula, equation, variable, number, operator, or symbol MUST be wrapped in LaTeX delimiters. There are NO exceptions.

Preferred structure (include only sections that make sense) using Markdown headings:
### Title: <one-line summary>
#### What I see:
#### Details:
#### Math Steps:
#### Answer:
#### Tips/Next:

OUTPUT RULES:
- Output MUST be Markdown only. No HTML tags.
- ALL math MUST use LaTeX: \\( ... \\) inline, \\[ ... \\] display.`.trim();

async function analyzeOpenAI(dataUrl, prompt, apiKey) {
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages = [
    { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
    {
      role: 'user', content: [
        { type: 'text', text: prompt || 'Analyze and explain the image.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];
  const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  }, timeoutMs);
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text().catch(() => '')}`);
  const json = await resp.json();
  return (json.choices?.[0]?.message?.content || 'No response').replace(/\n{3,}/g, '\n\n').trim();
}

async function analyzeGemini(dataUrl, prompt, apiKey) {
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
  const [meta, base64Raw] = dataUrl.split(',');
  const mimeMatch = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(meta || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';
  const apiHost = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const body = {
    contents: [{
      parts: [
        { text: (prompt || '') + '\n\n' + SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Raw.trim() } },
      ],
    }],
  };
  const url = `${apiHost}/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text().catch(() => '')}`);
  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').filter(Boolean).join('\n').trim() || 'No response';
}

function validateDataUrl(dataUrl, maxMb = 8) {
  if (typeof dataUrl !== 'string') throw new Error('Invalid image payload');
  const m = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!m) throw new Error('Only data:image/png|jpeg|jpg|webp;base64 URLs are allowed');
  const base64 = (m[2] || '').trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('Invalid base64 image data');
  const bytes = Math.ceil((base64.length * 3) / 4);
  if (bytes / (1024 * 1024) > maxMb) throw new Error(`Image too large: ${(bytes / 1048576).toFixed(2)}MB > ${maxMb}MB`);
  return dataUrl;
}

function sanitizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  return prompt.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 2000).trim();
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(1, timeoutMs | 0));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
