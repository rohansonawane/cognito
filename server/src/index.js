// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for Vite in dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(compression());
// CORS configuration - only allow trusted origins
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['https://cognito.shuruaat.in', 'https://3.12.155.210', 'http://localhost:5173', 'http://localhost:8787'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.) in development
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 8);
const BODY_LIMIT = `${Math.min(Math.max(MAX_IMAGE_MB + 1, 4), 20)}mb`;
app.use(express.json({ limit: BODY_LIMIT }));

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 24 * 60 * 60 * 1000); // default 24h
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10); // default 10 requests per window per IP
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Rate limit exceeded. Please try again later.' },
  handler: (req, res/*, next*/) => {
    res.status(429).json({ ok: false, error: 'You have reached the limit. Please try again later.' });
  }
});
app.use('/api/', limiter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

app.get('/api/health', (_, res) => res.json({ ok: true }));

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

    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  } catch (e) {
    // Log full error server-side for debugging
    console.error('API Error:', e);
    const isDev = process.env.NODE_ENV === 'development';
    const errorMessage = isDev 
      ? String(e?.message || e) 
      : 'An error occurred while processing your request. Please try again.';
    return res.status(500).json({ ok: false, error: errorMessage });
  }
});

app.listen(PORT, () => console.log(`[ai-canvas-server] listening on http://127.0.0.1:${PORT}`));

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
        { type: 'text', text: sanitizePrompt(prompt) || 'Analyze and explain the image per the format. If math, solve with steps and final answer.' },
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
          { text: (sanitizePrompt(prompt) || '') + '\n\nRole: Expert vision tutor for sketches. Follow this output format with short, clear sections. If math, show steps and end with Answer: <value>. If diagram/UI, describe parts and suggestions. If text, summarize and extract actions. Keep under 12 lines.' },
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

function sanitizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  // Remove control characters and limit length
  return prompt
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .slice(0, 2000) // Limit length to prevent abuse
    .trim();
}

function toPlainText(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input;
  // Remove LaTeX delimiters and code ticks
  s = s.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/`+/g, '');
  // Remove markdown bullets/numbering prefixes
  s = s.replace(/^\s*[-*]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  // Collapse multiple spaces/newlines
  s = s.replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ');
  // Trim and ensure single-line paragraphs
  s = s.trim();
  return s;
}


