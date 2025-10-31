import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

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

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  standardHeaders: true,
  legacyHeaders: false,
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

app.listen(PORT, () => console.log(`[ai-canvas-server] listening on http://127.0.0.1:${PORT}`));

async function analyzeOpenAI(dataUrl, prompt, apiKey) {
  const messages = [
    {
      role: 'system',
      content:
        'You analyze drawings and reply in plain English text only. No LaTeX, no Markdown, no special characters, no bullet lists. If it is a math equation, give a short explanation and end with "Answer: <final value>".'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'Describe this drawing. If it is an equation, solve it and respond in plain text.' },
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
  const base64 = dataUrl.split(',')[1] || '';
  const body = {
    contents: [
      {
        parts: [
          { text: prompt || 'Describe this drawing. If it is an equation, solve it.' },
          { inline_data: { mime_type: 'image/png', data: base64 } }
        ]
      }
    ]
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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
  const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ') || 'No response';
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


