/**
 * AI Connector Service — processes multiple files together using AI.
 * Supports OpenAI and Gemini with multi-modal content.
 */

import { processFile, buildFilesSummary } from './fileProcessor.js';

const CONNECTOR_SYSTEM_PROMPT = `You are an expert multi-modal AI analyst for Cognito Enterprise.
You will receive one or more files (images, documents, articles, code, videos) along with a user prompt.

Your job:
1. Analyze ALL provided files holistically
2. Identify connections, patterns, and relationships between them
3. Answer the user's prompt in full detail, referencing specific files by name
4. Structure your response clearly with sections
5. For code: identify bugs, suggest improvements, explain logic
6. For documents/articles: summarize key points, compare if multiple
7. For images: describe and analyze visual content
8. For mixed content: synthesize insights across all file types

FORMATTING RULES:
- Use Markdown with clear headings (###, ####)
- Math expressions MUST use LaTeX: \\( inline \\) and \\[ display \\]
- Reference files by their name in bold: **filename.ext**
- Use bullet lists for structured information
- Provide actionable insights and concrete next steps

Always be thorough, accurate, and helpful.`;

/**
 * Analyze multiple files together using the specified AI provider.
 * @param {object[]} files - Array of file records from the database
 * @param {string} prompt - User's analysis prompt
 * @param {string} provider - 'openai' | 'gemini'
 * @param {string} apiKey - Provider API key
 * @returns {Promise<string>} - Analysis result in Markdown
 */
export async function analyzeFiles(files, prompt, provider, apiKey) {
  if (!files.length) throw new Error('No files to analyze');

  // Process each file into content parts
  const fileContents = await Promise.all(files.map(f => processFile(f)));
  const summary = buildFilesSummary(files);

  const userPrompt = [
    `**Files being analyzed (${files.length} total):**\n${summary}`,
    '',
    prompt || 'Analyze these files comprehensively. Identify key insights, patterns, and relationships between them.',
  ].join('\n');

  if (provider === 'openai') {
    return analyzeWithOpenAI(fileContents, userPrompt, files, apiKey);
  }
  if (provider === 'gemini') {
    return analyzeWithGemini(fileContents, userPrompt, files, apiKey);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

async function analyzeWithOpenAI(fileContents, userPrompt, files, apiKey) {
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  // Build content array for OpenAI
  const contentParts = [{ type: 'text', text: userPrompt }];

  for (let i = 0; i < fileContents.length; i++) {
    const parts = fileContents[i];
    const file = files[i];
    contentParts.push({ type: 'text', text: `\n--- File ${i + 1}: ${file.original_name} ---` });

    for (const part of parts) {
      if (part.type === 'image') {
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:${part.mediaType};base64,${part.data}`, detail: 'high' },
        });
      } else {
        contentParts.push({ type: 'text', text: part.text });
      }
    }
  }

  const messages = [
    { role: 'system', content: CONNECTOR_SYSTEM_PROMPT },
    { role: 'user', content: contentParts },
  ];

  const resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 4096 }),
  }, timeoutMs);

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  return json.choices?.[0]?.message?.content || 'No response from AI';
}

async function analyzeWithGemini(fileContents, userPrompt, files, apiKey) {
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiVersion = process.env.GEMINI_API_VERSION || 'v1beta';
  const apiHost = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';

  // Build Gemini parts
  const parts = [
    { text: CONNECTOR_SYSTEM_PROMPT + '\n\n' + userPrompt },
  ];

  for (let i = 0; i < fileContents.length; i++) {
    const fileParts = fileContents[i];
    const file = files[i];
    parts.push({ text: `\n--- File ${i + 1}: ${file.original_name} ---` });

    for (const part of fileParts) {
      if (part.type === 'image') {
        parts.push({ inline_data: { mime_type: part.mediaType, data: part.data } });
      } else {
        parts.push({ text: part.text });
      }
    }
  }

  const body = { contents: [{ parts }] };
  const url = `${apiHost}/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  const responseParts = json.candidates?.[0]?.content?.parts || [];
  return responseParts.map(p => p.text || '').filter(Boolean).join('\n').trim() || 'No response from AI';
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
