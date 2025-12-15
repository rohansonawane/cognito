// Get API base URL from environment or use relative path
const getApiBaseUrl = () => {
  // In production, use environment variable or fallback to relative path
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // For development, use relative path (Vite proxy handles it)
  // For production, use relative path (Netlify/Render redirects handle it)
  return '';
};

export async function analyze(params: { image: string; provider: 'openai' | 'gemini'; prompt?: string }) {
  try {
    const apiBase = getApiBaseUrl();
    const apiUrl = `${apiBase}/api/analyze`;
    
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!resp.ok) {
      let detail = '';
      try {
        const t = await resp.text();
        detail = t || '';
      } catch {}
      return { ok: false as const, error: `HTTP ${resp.status}${detail ? `: ${detail}` : ''}` };
    }
    const json = await resp.json();
    return json as { ok: boolean; message?: string; error?: string };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e) };
  }
}

export async function recognizeShapes(params: { image: string; provider: 'openai' | 'gemini'; strokes?: any[] }) {
  try {
    const apiBase = getApiBaseUrl();
    const apiUrl = `${apiBase}/api/recognize-shapes`;
    
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!resp.ok) {
      let detail = '';
      try {
        const t = await resp.text();
        detail = t || '';
      } catch {}
      return { ok: false as const, error: `HTTP ${resp.status}${detail ? `: ${detail}` : ''}`, shapes: [] };
    }
    const json = await resp.json();
    return json as { ok: boolean; shapes?: Array<{ type: string; bounds: { x: number; y: number; width: number; height: number }; confidence: number }>; error?: string };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e), shapes: [] };
  }
}

export async function suggestLayout(params: { image: string; provider: 'openai' | 'gemini' }) {
  try {
    const apiBase = getApiBaseUrl();
    const apiUrl = `${apiBase}/api/suggest-layout`;
    
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!resp.ok) {
      let detail = '';
      try {
        const t = await resp.text();
        detail = t || '';
      } catch {}
      return { ok: false as const, error: `HTTP ${resp.status}${detail ? `: ${detail}` : ''}`, layout: null };
    }
    const json = await resp.json();
    return json as { ok: boolean; layout?: { suggestions: string[]; alignment: string; spacing: number; grouping?: any[] }; error?: string };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message || e), layout: null };
  }
}


