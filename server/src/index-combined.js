// Combined server that serves both frontend and backend
// Use this for single-server hosting (Railway, Fly.io, etc.)

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
}));

const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 8);
const BODY_LIMIT = `${Math.min(Math.max(MAX_IMAGE_MB + 1, 4), 20)}mb`;
app.use(express.json({ limit: BODY_LIMIT }));

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 24 * 60 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit exceeded. Please try again later.' },
  handler: (req, res) => {
    res.status(429).json({ ok: false, error: 'You have reached the limit. Please try again later.' });
  }
});
app.use('/api/', limiter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// API Routes
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/analyze', async (req, res) => {
  try {
    const { image, provider = 'openai', prompt } = req.body || {};
    if (!image || typeof image !== 'string') return res.status(400).json({ ok: false, error: 'Missing image dataUrl' });
    if (!['openai', 'gemini'].includes(provider)) return res.status(400).json({ ok: false, error: 'Invalid provider' });
    const validImage = validateDataUrl(image, MAX_IMAGE_MB);

    if (provider === 'openai') {
      if (!OPENAI_API_KEY) return res.status(500).json({ ok: false, error: 'Missing OPENAI_API_KEY' });
      const result = await analyzeOpenAI(validImage, prompt, OPENAI_API_KEY);
      return res.json({ ok: true, message: result });
    }

    if (provider === 'gemini') {
      if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: 'Missing GEMINI_API_KEY' });
      const result = await analyzeGemini(validImage, prompt, GEMINI_API_KEY);
      return res.json({ ok: true, message: result });
    }

    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
});

// Serve static files from web/dist (frontend)
const webDistPath = join(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  
  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      const indexPath = join(webDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Frontend not built. Run "npm run build" in web/ directory.');
      }
    } else {
      res.status(404).json({ ok: false, error: 'Not found' });
    }
  });
} else {
  // Fallback if frontend not built
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ ok: false, error: 'Not found' });
    } else {
      res.status(503).send('Frontend not available. Please build the frontend first.');
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-canvas-server] listening on port ${PORT}`);
  console.log(`[ai-canvas-server] serving frontend from ${webDistPath}`);
});

// Copy the analyze functions from the original index.js
async function analyzeOpenAI(dataUrl, prompt, apiKey) {
  const messages = [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: `You are an expert vision tutor for whiteboard sketches. Analyze any image (math, diagrams, UI wireframes, notes, charts). Always respond clearly and helpfully for a general audience. Use short sections and bullet points where useful. If math is present, show concise step-by-step reasoning and end with a final line that begins with "Answer:". If a diagram or UI sketch, describe key parts and suggest improvements. If handwriting/text, summarize and extract action items. If ambiguous, state assumptions or ask 1-2 clarifying questions. Keep responses under 12 lines unless the user prompt requests more.\nOutput format: Title: <one-line title>\nWhat I see: <1-2 lines>\nDetails: <bullets>\nIf math: Steps: <short steps>\nAnswer: <final>\nTips/Next: <1-3 brief suggestions>`
        }
      ]
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'Analyze and explain the image per the format. If math, solve with steps and final answer.' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages })
  });
  if (!resp.ok) {
    const t = await safeText(resp);
    throw new Error(`OpenAI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const raw = json.choices?.[0]?.message?.content || 'No response';
  return toPlainText(raw);
}

async function analyzeGemini(dataUrl, prompt, apiKey) {
  const [meta, base64Raw] = dataUrl.split(',');
  if (!base64Raw) throw new Error('Invalid image payload');
  const mimeMatch = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(meta || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64 = base64Raw.trim();
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
  const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';
  const apiHost = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const body = {
    contents: [
      {
        parts: [
          { text: (prompt || '') + '\n\nRole: Expert vision tutor for sketches. Follow this output format with short, clear sections. If math, show steps and end with Answer: <value>. If diagram/UI, describe parts and suggestions. If text, summarize and extract actions. Keep under 12 lines.' },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }
    ]
  };
  const url = `${apiHost}/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await safeText(resp);
    throw new Error(`Gemini ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => (p && p.text) || '').filter(Boolean).join('\n').trim() || 'No response';
  return toPlainText(text);
}

async function safeText(resp) {
  try { return await resp.text(); } catch { return ''; }
}

function validateDataUrl(dataUrl, maxMb = 8) {
  if (!dataUrl.startsWith('data:image/')) throw new Error('Only data:image/* URLs are allowed');
  const allowed = ['png', 'jpeg', 'jpg', 'webp'];
  const mime = (dataUrl.split(';')[0] || '').toLowerCase();
  const ext = mime.substring('data:image/'.length);
  if (!allowed.includes(ext)) throw new Error('Unsupported image type');
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Math.ceil((base64.length * 3) / 4);
  const mb = bytes / (1024 * 1024);
  if (mb > maxMb) throw new Error(`Image too large: ${mb.toFixed(2)}MB > ${maxMb}MB`);
  return dataUrl;
}

function toPlainText(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input;
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/`+/g, '');
  s = s.replace(/^\s*[-*]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  s = s.replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ');
  s = s.trim();
  return s;
}

