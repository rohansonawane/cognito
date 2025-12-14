// Math rendering utility using KaTeX for better performance and React integration
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface MathRenderOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
  errorColor?: string;
}

/**
 * Render LaTeX math expression to HTML string
 */
export function renderMath(tex: string, options: MathRenderOptions = {}): string {
  try {
    let normalizedTex = tex;

    // Repair JSON escape corruption for LaTeX commands that start with valid JSON escapes.
    // Example: "\frac" can become formfeed + "rac" because JSON treats "\f" as formfeed.
    // Example: "\to" / "\text" / "\times" can become tab + "o"/"ext"/"imes" because JSON treats "\t" as tab.
    // Example: "\beta" can become backspace + "eta" because JSON treats "\b" as backspace.
    // Only do this when the control character is followed by letters.
    normalizedTex = normalizedTex.replace(/\x0c([A-Za-z]+)/g, '\\f$1'); // formfeed → \f...
    normalizedTex = normalizedTex.replace(/\t([A-Za-z]+)/g, '\\t$1'); // tab → \t...
    normalizedTex = normalizedTex.replace(/\x08([A-Za-z]+)/g, '\\b$1'); // backspace → \b...

    // Normalize double backslashes to single (if escaped).
    normalizedTex = normalizedTex.replace(/\\\\/g, '\\');

    const defaultOptions = {
      displayMode: false,
      throwOnError: false,
      errorColor: '#cc0000',
      ...options,
    };
    return katex.renderToString(normalizedTex, defaultOptions);
  } catch (error) {
    console.warn('KaTeX rendering error:', error, 'for expression:', tex);
    // Return escaped text if rendering fails
    return `<span class="math-error" style="color: ${options.errorColor || '#cc0000'}">${escapeHtml(tex)}</span>`;
  }
}

/**
 * Process text and render all math expressions
 * Handles both \(...\) and $...$ formats
 */
export function renderMathInText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let result = text;
  
  // Handle display math \[...\] first
  result = result.replace(/\\\[([^\]]+)\\\]/g, (match, content) => {
    try {
      return renderMath(content.trim(), { displayMode: true });
    } catch {
      return match;
    }
  });
  
  // Handle inline math \(...\)
  result = result.replace(/\\\(([^)]+)\\\)/g, (match, content) => {
    try {
      return renderMath(content.trim(), { displayMode: false });
    } catch {
      return match;
    }
  });
  
  // Handle legacy $...$ format (convert to inline)
  result = result.replace(/\$([^$]+)\$/g, (match, content) => {
    // Skip if already processed
    if (match.includes('katex')) return match;
    try {
      return renderMath(content.trim(), { displayMode: false });
    } catch {
      return match;
    }
  });
  
  // Handle legacy $$...$$ format (convert to display)
  result = result.replace(/\$\$([^$]+)\$\$/g, (match, content) => {
    // Skip if already processed
    if (match.includes('katex')) return match;
    try {
      return renderMath(content.trim(), { displayMode: true });
    } catch {
      return match;
    }
  });
  
  return result;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

