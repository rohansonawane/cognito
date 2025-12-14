// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app = express();
app.disable('x-powered-by');

const IS_DEV = process.env.NODE_ENV === 'development';
// Trust proxy in production so rate limiting + req.ip work correctly behind Nginx/ALB.
// Security: default to trusting only loopback proxies (Nginx on same host).
// Override with TRUST_PROXY (examples: "1", "loopback", "0").
if (process.env.TRUST_PROXY) {
  if (process.env.TRUST_PROXY === '0') app.set('trust proxy', false);
  else if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  else app.set('trust proxy', process.env.TRUST_PROXY);
} else if (!IS_DEV) {
  app.set('trust proxy', 'loopback');
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Tighten CSP in production; dev may need relaxed settings for tooling.
      scriptSrc: IS_DEV ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
      // This app uses inline styles in a few places (buttons / AI formatting), keep unsafe-inline for now.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      // Browser only calls our API; keep it strict.
      connectSrc: ["'self'"],
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

// System prompt (Markdown-only, strict LaTeX rules, no HTML)
const SYSTEM_PROMPT = `
You are an expert canvas analyst. The whiteboard can contain anything (math, UI wireframes, architecture diagrams, code, meeting notes, sketches, etc.). Tailor the response to whatever is actually present—do not assume it is mathematical. Use concise sections and bullets when helpful. Only add a Math Steps or Answer section if math is clearly present; otherwise summarize key insights, actions, or suggestions that match the content type. If the content is ambiguous, mention assumptions or provide clarifying questions.

MANDATORY MATH FORMATTING RULE:
EVERY mathematical expression, formula, equation, variable, number, operator, or symbol MUST be wrapped in LaTeX delimiters. There are NO exceptions. This includes:
- Single variables: \\(x\\), \\(y\\), \\(S_n\\), \\(T_n\\)
- Simple equations: \\(v = \\sqrt{\\frac{k}{2mR}}\\)
- Complex expressions: \\(\\frac{mv^2}{R} = kr\\)
- Comparisons: \\(S_n > \\frac{\\pi}{3\\sqrt{3}}\\)
- Standalone equations: \\[U(r) = \\frac{k}{2} r^2\\]
- Even single numbers in mathematical context: \\(2\\), \\(\\pi\\), \\(\\infty\\)

NEVER write math without LaTeX delimiters. NEVER use plain text for mathematical content. If you see "v = sqrt(k/(2mR))" in the image, output it as "\\(v = \\sqrt{\\frac{k}{2mR}}\\)" not as plain text.

CRITICAL: For mathematical questions, problems, or proofs, you MUST provide ALL steps in complete detail. Break down every transformation, simplification, and calculation. Show intermediate results, explain each algebraic manipulation, and justify each step. Do not skip steps or assume the reader can fill in gaps. Make the solution comprehensive and educational. EVERY step must use LaTeX formatting.

Preferred structure (include only sections that make sense) using Markdown headings:
### Title: <one-line summary>
#### What I see:
<1-2 lines>
#### Details:
<bullets or short paragraphs>
#### Math Steps:
<if relevant - MUST include ALL steps in complete detail for mathematical problems>
#### Answer:
<clearly state the conclusion or selected option>
#### Tips/Next:
<1-3 suggestions>

OUTPUT RULES (MUST FOLLOW):
- Output MUST be Markdown only. Do NOT use any HTML tags (no <div>, <p>, <ol>, <li>, <br>, etc.).
- ALL mathematical content MUST use LaTeX delimiters: \\( ... \\) for inline, \\[ ... \\] for display. This is MANDATORY - there are no exceptions.
- NEVER write mathematical expressions, formulas, equations, variables, or symbols without LaTeX delimiters.
- CRITICAL: Even if you see "U(r) = \\frac{kr^2}{2}" in the image, you MUST output it as "\\[U(r) = \\frac{kr^2}{2}\\]" (with delimiters). NEVER output raw LaTeX without delimiters.
- Do not wrap math in code fences.
- If you see any math in the image (even simple things like "x = 5" or "v²"), convert it to LaTeX: "\\(x = 5\\)" or "\\(v^2\\)".
- For standalone equations on their own line, ALWAYS use display math: \\[equation\\]
- For math within sentences, use inline math: \\(equation\\)

CRITICAL LaTeX formatting rules (MUST FOLLOW EXACTLY):
1. ALWAYS use underscores for subscripts in operators: \\sum_{k=1}^{n} (NEVER \\sum{k=1}^{n} or \\sum{k=1}^{n})
2. When defining variables with math expressions, ALWAYS wrap the ENTIRE expression including the variable as a SINGLE math block: "\\(S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\)" (NOT "S_n = \\(\\sum_{k=1}^{n}\\) \\(\\frac{n}{n^2 + kn + k^2}\\)" - NEVER split into multiple math blocks)
3. NEVER split a single mathematical expression into multiple \\(...\\) blocks. If you have "S_n = sum + fraction", write it as "\\(S_n = \\sum_{k=1}^{n} \\frac{n}{n^2 + kn + k^2}\\)" (one block), NOT as "S_n = \\(\\sum_{k=1}^{n}\\) \\(\\frac{n}{n^2 + kn + k^2}\\)" (multiple blocks)
4. For all operators with limits, ALWAYS use underscores: \\sum_{lower}^{upper}, \\prod_{lower}^{upper}, \\int_{lower}^{upper}, \\lim_{x\\to\\infty}
5. Use LaTeX delimiters: \\( ... \\) for inline math, \\[ ... \\] for display math (standalone equations on their own line)
6. NEVER use $...$ or $$...$$ delimiters - ONLY use \\( ... \\) and \\[ ... \\]
7. For standalone equations, use display math: \\[S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\]
8. In list items with math, wrap entire expression: "- \\(S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\)"
9. Put multiple-choice options on bullets with inline math: "- A) \\(S_n > \\frac{\\pi}{3\\sqrt{3}}\\)"
10. Finish Answer section with definitive statement (e.g., "Options B and C are true")
11. For arrows and limits, ALWAYS complete the expression: use \\(n \\to \\infty\\) (NOT "n \\to" alone). Common arrows: \\to (→), \\rightarrow (→), \\infty (∞). Always include what the variable approaches: \\(n \\to \\infty\\), \\(x \\to 0\\), \\(\\lim_{n\\to\\infty} a_n\\)

CORRECT formatting examples:
- "\\(S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\)" (single math block with entire expression)
- "\\(T_n = \\sum_{k=0}^{n-1}\\frac{n}{n^2 + kn + k^2}\\)" (single math block)
- "- \\(S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\)" (list item, single block)
- "- A) \\(S_n > \\frac{\\pi}{3\\sqrt{3}}\\)" (multiple choice, single block)
- Limits: "\\(\\lim_{n\\to\\infty} a_n\\)" or "\\(\\lim_{x\\to 0} \\frac{\\sin x}{x}\\)"
- Arrows: "\\(n \\to \\infty\\)" (renders as n → ∞), "\\(x \\to 0\\)" (renders as x → 0)
- Standalone equation: "\\[S_n = \\sum_{k=1}^{n}\\frac{n}{n^2 + kn + k^2}\\]"

WRONG formatting (DO NOT USE):
- "S_n = \\(\\sum_{k=1}^{n}\\) \\(\\frac{n}{n^2 + kn + k^2}\\)" (SPLIT into multiple blocks - WRONG!)
- "S_n = $\\sum_{k=1}^{n}$ $\\frac{n}{n^2 + kn + k^2}$" (SPLIT into multiple blocks with wrong delimiters - WRONG!)
- "Sn = \\(\\sum_{k=1}^{n}...\\)" (variable outside math delimiters)
- "\\(\\sum{k=1}^{n}...\\)" (missing underscore)
- "n \\to" (incomplete - must include what it approaches like "\\(n \\to \\infty\\)")
- "$Sn = ...$" or "$$Sn = ...$$" (wrong delimiters)
- "Sn = $\\sum{k=1}^{n}...$" (wrong delimiter and missing underscore)
`.trim();
// Rate limiting enabled with 30 requests per day
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 24 * 60 * 60 * 1000); // default 24h
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30); // 30 requests per window per IP
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Use memory store (default) - resets on server restart
  // To clear existing limits, restart the server or use /api/reset-limit endpoint
  message: { ok: false, error: 'Rate limit exceeded. Please try again later.' },
  handler: (req, res/*, next*/) => {
    res.status(429).json({ ok: false, error: `You've used your ${RATE_LIMIT_MAX} AI requests for the day. Please try again later.` });
  }
});
app.use('/api/', limiter);

// Endpoint to reset rate limit for current IP (for testing/admin purposes)
app.post('/api/reset-limit', (req, res) => {
  const key = limiter.keyGenerator(req, res);
  if (limiter.store && typeof limiter.store.resetKey === 'function') {
    limiter.store.resetKey(key);
    res.json({ ok: true, message: 'Rate limit reset for your IP address' });
  } else {
    // If store doesn't support resetKey, restart server to clear
    res.json({ ok: true, message: 'Rate limit will be cleared on server restart' });
  }
});

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
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages = [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: SYSTEM_PROMPT
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
  const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages })
  }, timeoutMs);
  if (!resp.ok) {
    const t = await safeText(resp);
    throw new Error(`OpenAI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const raw = json.choices?.[0]?.message?.content || 'No response';
  return toPlainText(raw);
}

async function analyzeGemini(dataUrl, prompt, apiKey) {
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
  const [meta, base64Raw] = dataUrl.split(',');
  if (!base64Raw) throw new Error('Invalid image payload');
  const mimeMatch = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(meta || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64 = base64Raw.trim();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';
  const apiHost = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const body = {
    contents: [
      {
        parts: [
          { text: (sanitizePrompt(prompt) || '') + '\n\n' + SYSTEM_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }
    ]
  };
  const url = `${apiHost}/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, timeoutMs);
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(1, timeoutMs | 0));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function validateDataUrl(dataUrl, maxMb = 8) {
  if (typeof dataUrl !== 'string') throw new Error('Invalid image payload');
  // Require strict data URL + base64 marker.
  const m = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!m) throw new Error('Only data:image/png|jpeg|jpg|webp;base64 URLs are allowed');
  const base64 = (m[2] || '').trim();
  // Basic base64 character validation (prevents obvious garbage payloads).
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('Invalid base64 image data');
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
  // Do NOT strip LaTeX delimiters; keep \(...\), \[...\], $...$, $$...$$ intact
  // Only normalize excessive whitespace (more than 2 newlines)
  s = s.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  s = s.trim();
  return s;
}


