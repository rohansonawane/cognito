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


