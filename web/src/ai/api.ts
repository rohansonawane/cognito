export async function analyze(params: { image: string; provider: 'openai' | 'gemini'; prompt?: string }) {
  try {
    const resp = await fetch('/api/analyze', {
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


