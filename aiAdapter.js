export async function analyzeImage(dataUrl) {
  const { aiEndpoint, aiApiKey } = window.APP_CONFIG || {};
  if (!aiEndpoint) {
    // Mock offline response to keep the app usable without config
    await delay(400);
    return {
      ok: true,
      mode: 'mock',
      message:
        'AI endpoint not configured. Set window.APP_CONFIG.aiEndpoint to enable real analysis.\n\nMock: Your sketch looks interesting! If it\'s an equation, configure AI to solve it.',
    };
  }

  try {
    const resp = await fetch(aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {}),
      },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!resp.ok) {
      const text = await safeText(resp);
      return { ok: false, error: `AI error ${resp.status}: ${text}` };
    }
    const json = await resp.json();
    // expected { message: string, type?: 'description'|'equation'|'other', ... }
    return { ok: true, ...json };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}


