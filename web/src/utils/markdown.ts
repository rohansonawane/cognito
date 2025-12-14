// Markdown → HTML for AI responses, with robust KaTeX math rendering.
//
// Design goals:
// - Accept messy AI outputs (Markdown-ish text mixed with LaTeX).
// - Render math reliably via KaTeX.
// - Support delimiters: \(..\), \[..\], $..$, $$..$$ (legacy).
// - Avoid markdown emphasis rules breaking math (especially underscores).
// - Keep non-math HTML escaped to avoid XSS.

import { renderMath } from './mathRenderer';

type MathSegment = {
  placeholder: string;
  tex: string;
  display: boolean;
};

function isAiFormatDebugEnabled(): boolean {
  try {
    // Opt-in via: localStorage.setItem('AI_DEBUG', '1')
    // or in console: window.__AI_DEBUG = true
    // SECURITY/PERF: keep debug OFF by default. Enable only via flags above.
    const defaultEnabled = false;
    return (
      defaultEnabled ||
      (typeof window !== 'undefined' && (window as any).__AI_DEBUG === true) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('AI_DEBUG') === '1')
    );
  } catch {
    return false;
  }
}

// Minimal renderer: only renders math, everything else stays as raw text (HTML escaped for security)
export function renderMathOnly(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  // Remove AI-specific prefixes and wrappers
  let result = text;
  
  // Remove common AI wrappers/prefixes
  result = result.replace(/\bAI Response\b\s*⧉?\s*/gi, '');
  result = result.replace(/^\s*⧉\s*/g, '');
  
  // Remove all HTML tags (AI might add wrappers like <App>, <div>, etc.)
  result = result.replace(/<[^>]+>/g, '');
  
  // Remove HTML entities that might have been left behind
  result = result.replace(/&nbsp;/g, ' ');
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#039;/g, "'");
  
  // Normalize spacing: remove excessive whitespace and newlines aggressively
  result = result.replace(/\n{3,}/g, '\n'); // Max 1 consecutive newline
  result = result.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
  result = result.replace(/[ \t]+\n/g, '\n'); // Trailing spaces before newlines
  result = result.replace(/\n[ \t]+/g, '\n'); // Leading spaces after newlines
  result = result.replace(/\n\n+/g, '\n'); // Remove multiple newlines
  result = result.trim(); // Remove leading/trailing whitespace
  
  // Extract and render only math formulas, leave everything else untouched (but HTML escaped)
  const segments: MathSegment[] = [];
  const placeholder = (i: number, display: boolean) => `⧉MATH${display ? 'D' : 'I'}⧉${i}⧉MATH⧉`;
  
  // Extract display math \[...\]
  while (true) {
    let startIdx = result.indexOf('\\[');
    if (startIdx === -1) {
      startIdx = result.indexOf('\\ [');
      if (startIdx === -1) break;
    }
    
    let depth = 1;
    let endIdx = startIdx + (result[startIdx + 1] === ' ' ? 3 : 2);
    let found = false;
    
    while (endIdx < result.length) {
      if (result.slice(endIdx, endIdx + 2) === '\\[' || result.slice(endIdx, endIdx + 3) === '\\ [') {
        depth++;
        endIdx += result[endIdx + 1] === ' ' ? 3 : 2;
      } else if (result.slice(endIdx, endIdx + 2) === '\\]' || result.slice(endIdx, endIdx + 3) === '\\ ]') {
        depth--;
        if (depth === 0) {
          found = true;
          break;
        }
        endIdx += result[endIdx + 1] === ' ' ? 3 : 2;
      } else {
        endIdx++;
      }
    }
    
    if (found) {
      const content = result.slice(startIdx + (result[startIdx + 1] === ' ' ? 3 : 2), endIdx);
      const tex = fixLatexForKatex(content.trim());
      const ph = placeholder(segments.length, true);
      segments.push({ placeholder: ph, tex, display: true });
      result = result.slice(0, startIdx) + ph + result.slice(endIdx + (result[endIdx + 1] === ' ' ? 3 : 2));
    } else {
      break;
    }
  }
  
  // Extract inline math \(...\)
  result = result.replace(/\\\s*\(([\s\S]*?)\\\s*\)/g, (match, content) => {
    const tex = fixLatexForKatex(content.trim());
    const ph = placeholder(segments.length, false);
    segments.push({ placeholder: ph, tex, display: false });
    return ph;
  });
  
  // Escape HTML in non-math parts for security
  result = escapeHtml(result);

  // If needed: treat leading "* " as a bullet list marker.
  // IMPORTANT: Do NOT touch "**bold**" (subtitle marker), so we require the next char not to be "*".
  // Only convert when the first non-space token is "* " and the list item starts with a letter.
  result = result.replace(/^(\s*)\*(?!\*)\s+([A-Za-z\u00C0-\u017F])/gm, '$1• $2');
  
  // Remove standalone dashes that aren't list items (dash followed by space but not at line start)
  // This removes dashes like " - " in the middle of text that aren't needed
  result = result.replace(/\s+-\s+/g, ' ');
  
  // Remove dashes at the end of lines that aren't needed
  result = result.replace(/-\s*$/gm, '');
  
  // Remove dashes at the start of lines that aren't list items (not followed by space and letter)
  result = result.replace(/^-\s*$/gm, '');
  
  // Replace - with bullet points ONLY for actual list items (at start of line, followed by space and letter)
  result = result.replace(/^(\s*)-\s+([A-Za-z\u00C0-\u017F])/gm, '$1• $2');
  
  // Style markdown headings (#### and ###) as titles: font-size 1em, font-weight 300, no background
  result = result.replace(/^####\s+(.+?)(?=\n|$)/gim, (match, content) => {
    const titleText = content.trim().toUpperCase();
    return `<div style="font-weight: 300; font-size: 1em; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary, #0ea5e9); margin: 0.7em 0 0.4em 0; padding: 0.4em 0.6em; border-left: 3px solid var(--color-primary, #0ea5e9); border-radius: 0;">${titleText}</div>`;
  });
  
  result = result.replace(/^###\s+(.+?)(?=\n|$)/gim, (match, content) => {
    const titleText = content.trim().toUpperCase();
    return `<div style="font-weight: 300; font-size: 1em; line-height: 1.5; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary, #0ea5e9); margin: 0.7em 0 0.4em 0; padding: 0.4em 0.6em; border-left: 3px solid var(--color-primary, #0ea5e9); border-radius: 0;">${titleText}</div>`;
  });
  
  // Style bold markdown (**text**) as subtitles: proper formatting
  result = result.replace(/\*\*(.+?)\*\*/g, (match, content) => {
    return `<span style="font-weight: 500; font-size: 0.95em; color: var(--color-text); display: inline-block; margin: 0.3em 0;">${content}</span>`;
  });
  
  // Style section titles: minimal spacing and side border
  // Match common section labels like "Title:", "What I see:", "Details:", etc.
  const sectionLabels = [
    'Title', 'What I see', 'Details', 'Steps', 'Math Steps', 
    'Answer', 'Final Answer', 'Options', 'Solution', 'Given', 'Tips/Next'
  ];
  
  // Create regex pattern for section labels
  const sectionPattern = new RegExp(
    `^(${sectionLabels.join('|')})\\s*:\\s*(.+?)(?=\\n|$)`,
    'gim'
  );
  
  result = result.replace(sectionPattern, (match, label, content) => {
    const labelUpper = label.toUpperCase();
    const contentText = content.trim();
  
    // For TIPS/NEXT section, convert content to bullet points
    if (label.toUpperCase() === 'TIPS/NEXT' || label.toUpperCase() === 'TIPS' || label.toUpperCase() === 'NEXT') {
      // Split by periods followed by uppercase letters or end of string, but keep the period
      // This handles sentences like "REVIEW THE CONCEPTS. ENSURE CLARITY. CONSIDER HOW..."
      const sentences = contentText.split(/(?<=\.)\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
      
      if (sentences.length > 1) {
        const bulletItems = sentences.map(sentence => {
          const trimmed = sentence.trim();
          // Remove trailing period if it exists (we'll add it back in the bullet)
          const cleanSentence = trimmed.replace(/\.$/, '');
          return `<div style="margin: 0.2em 0; padding: 0.2em 0.5em 0.2em 1.4em; text-indent: -1.2em; border-left: 2px solid color-mix(in srgb, var(--color-primary, #0ea5e9) 30%, transparent);"><span style="color: var(--color-primary, #0ea5e9); font-weight: 500; margin-right: 0.4em; font-size: 1em;">•</span><span style="color: var(--color-text);">${cleanSentence}</span></div>`;
        }).join('');
        
        return `<div style="margin: 0.6em 0 0.3em 0; padding: 0.4em 0.6em; border-left: 2px solid var(--color-primary, #0ea5e9);"><div style="font-weight: 500; font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-primary, #0ea5e9); margin-bottom: 0.3em;">${labelUpper}:</div>${bulletItems}</div>`;
      }
    }
    
    return `<div style="margin: 0.6em 0 0.3em 0; padding: 0.4em 0.6em; border-left: 2px solid var(--color-primary, #0ea5e9);"><div style="font-weight: 500; font-size: 0.95em; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-primary, #0ea5e9); margin-bottom: 0.3em;">${labelUpper}:</div><div style="color: var(--color-text);">${contentText}</div></div>`;
  });
  
  // Format bullet points ONLY where they are actual list items (minimal spacing, side border)
  result = result.replace(/^•\s+(.+?)(?=\n|$)/gm, (match, content) => {
    return `<div style="margin: 0.2em 0; padding: 0.2em 0.5em 0.2em 1.4em; text-indent: -1.2em; border-left: 2px solid color-mix(in srgb, var(--color-primary, #0ea5e9) 30%, transparent);"><span style="color: var(--color-primary, #0ea5e9); font-weight: 500; margin-right: 0.4em; font-size: 1em;">•</span><span style="color: var(--color-text);">${content.trim()}</span></div>`;
  });
  
  // Format paragraphs with minimal spacing (no background)
  result = result.split('\n\n').map(para => {
    const trimmed = para.trim();
    if (!trimmed) return '';
    // Skip if it's already a div (title, section, bullet)
    if (trimmed.startsWith('<div') || trimmed.startsWith('<span')) return trimmed;
    return `<div style="margin: 0.5em 0; padding: 0.4em 0.6em; line-height: 1.55; color: var(--color-text); border-left: 2px solid color-mix(in srgb, var(--color-primary, #0ea5e9) 20%, transparent);">${trimmed}</div>`;
  }).filter(Boolean).join('\n');
  
  // Replace placeholders with rendered math
  for (const seg of segments) {
    const rendered = renderMath(seg.tex, { displayMode: seg.display });
    result = result.split(seg.placeholder).join(rendered);
  }
  
  return result;
}

export function markdownToHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  if (isAiFormatDebugEnabled() && text.includes('\\[')) {
    // eslint-disable-next-line no-console
    console.log('[AI_FORMAT_DEBUG] markdownToHtml INPUT:', {
      hasBackslashBracket: text.includes('\\['),
      hasBackslashBracketSpace: text.includes('\\ ['),
      firstBackslashBracketIndex: text.indexOf('\\['),
      preview: text.slice(0, 500),
      charCodes: text.slice(text.indexOf('\\['), text.indexOf('\\[') + 5).split('').map(c => c.charCodeAt(0)),
    });
  }
  
  // 1) Normalize a few common "AI output" patterns BEFORE extracting math.
  const normalized = preNormalizeAiMath(text);

  // 2) Extract math segments and replace with placeholders.
  const extracted = extractMathSegments(normalized);

  // 2.3) Recovery pass: Fix orphaned \] delimiters (missing opening \[)
  // This handles cases where AI outputs math content with only closing delimiter
  let recoveryText = extracted.text;
  const recoverySegments: MathSegment[] = [];
  const recoveryPlaceholder = (i: number) => `⧉RECOVERY${i}⧉RECOVERY⧉`;
  
  // Pattern 1: Standalone LaTeX expression on line(s) ending with \] but no opening \[
  // Example: "\\frac{mv^2}{R} = kR\n\n\n\\]"
  recoveryText = recoveryText.replace(/((?:[^\n]*?(?:\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod|\\alpha|\\beta|\\gamma|\\pi|\\theta|\\phi|\\omega|\\vec|\\hat|\\cdot|\\times|\\div|\\pm|\\mp|\\leq|\\geq|\\neq|\\approx|\\equiv|\\sin|\\cos|\\tan|\\log|\\ln|\\exp)[^\n]*?(?:\n[^\n]*?)*?))\s*\\\]/g, (match, content) => {
    // Only fix if this doesn't already have an opening \[ and looks like math
    if (!match.includes('\\[') && !match.includes('\\ [')) {
      const tex = fixLatexForKatex(content.trim());
      // Only create segment if it's valid LaTeX-looking content
      if (tex.length > 0 && (tex.includes('\\') || (tex.includes('=') && (tex.includes('^') || tex.includes('_') || tex.includes('/'))))) {
        const ph = recoveryPlaceholder(recoverySegments.length);
        recoverySegments.push({ placeholder: ph, tex, display: true });
        if (isAiFormatDebugEnabled()) {
          // eslint-disable-next-line no-console
          console.log('[AI_FORMAT_DEBUG] Recovery pass fixed orphaned \\]:', {
            original: match.slice(0, 150),
            tex: tex.slice(0, 150),
          });
        }
        return ph;
      }
    }
    return match;
  });
  
  // Pattern 2: Simple case - line with LaTeX ending in \] on its own
  recoveryText = recoveryText.replace(/^([^\n]*?(?:\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod|\\alpha|\\beta|\\gamma|\\pi|\\theta|\\phi|\\omega|\\vec|\\hat|\\cdot|\\times|\\div|\\pm|\\mp|\\leq|\\geq|\\neq|\\approx|\\equiv|\\sin|\\cos|\\tan|\\log|\\ln|\\exp)[^\n]*?)\s*\\\]\s*$/gm, (match, content) => {
    if (!match.includes('\\[') && !match.includes('\\ [')) {
      const tex = fixLatexForKatex(content.trim());
      if (tex.length > 0 && tex.includes('\\')) {
        const ph = recoveryPlaceholder(recoverySegments.length);
        recoverySegments.push({ placeholder: ph, tex, display: true });
        return ph;
    }
  }
    return match;
  });

  // Merge recovery segments
  if (recoverySegments.length > 0) {
    extracted.segments.push(...recoverySegments);
    extracted.text = recoveryText;
    if (isAiFormatDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.warn('[AI_FORMAT_DEBUG] Recovery pass found', recoverySegments.length, 'orphaned math blocks');
    }
  }

  // 2.5) Safety pass: catch any remaining \[...\] or \(...\) that might have been missed
  // This uses manual bracket matching like the main extraction for robustness
  let safetyText = extracted.text;
  const safetySegments: MathSegment[] = [];
  const safetyPlaceholder = (i: number, display: boolean) => `⧉SAFETY${display ? 'D' : 'I'}⧉${i}⧉SAFETY⧉`;
  
  // Manually find any remaining \[...\] blocks (handle both \[ and \ [)
  while (true) {
    let startIdx = safetyText.indexOf('\\[');
    let startLen = 2;
    
    if (startIdx === -1) {
      startIdx = safetyText.indexOf('\\ [');
      startLen = 3;
    }
    
    if (startIdx === -1) break;
    
    let depth = 1;
    let endIdx = startIdx + startLen;
    let found = false;
    let endLen = 2;
    
    while (endIdx < safetyText.length) {
      if (safetyText.slice(endIdx, endIdx + 2) === '\\[') {
        depth++;
        endIdx += 2;
      } else if (safetyText.slice(endIdx, endIdx + 3) === '\\ [') {
        depth++;
        endIdx += 3;
      } else if (safetyText.slice(endIdx, endIdx + 2) === '\\]') {
        depth--;
        if (depth === 0) {
          found = true;
          endLen = 2;
          break;
        }
        endIdx += 2;
      } else if (safetyText.slice(endIdx, endIdx + 3) === '\\ ]') {
        depth--;
        if (depth === 0) {
          found = true;
          endLen = 3;
          break;
        }
        endIdx += 3;
      } else {
        endIdx++;
      }
    }
    
    if (found) {
      const content = safetyText.slice(startIdx + startLen, endIdx);
      const tex = fixLatexForKatex(content.trim());
      const ph = safetyPlaceholder(safetySegments.length, true);
      safetySegments.push({ placeholder: ph, tex, display: true });
      safetyText = safetyText.slice(0, startIdx) + ph + safetyText.slice(endIdx + endLen);
      
      if (isAiFormatDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log('[AI_FORMAT_DEBUG] Safety pass found display math:', {
          contentPreview: content.slice(0, 100),
          texPreview: tex.slice(0, 100),
        });
      }
    } else {
      // Skip this unmatched \[
      safetyText = safetyText.slice(0, startIdx) + safetyText.slice(startIdx + startLen);
    }
  }
  
  // Look for any remaining inline math patterns \(...\)
  safetyText = safetyText.replace(/\\\s*\(([\s\S]*?)\\\s*\)/g, (match, content) => {
    const tex = fixLatexForKatex(content.trim());
    const ph = safetyPlaceholder(safetySegments.length, false);
    safetySegments.push({ placeholder: ph, tex, display: false });
    return ph;
  });

  // Merge safety segments into main segments
  if (safetySegments.length > 0) {
    if (isAiFormatDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.warn('[AI_FORMAT_DEBUG] Safety pass found', safetySegments.length, 'additional math segments');
  }
    extracted.segments.push(...safetySegments);
    extracted.text = safetyText;
  }

  // 3) Escape the non-math parts, then apply markdown-ish formatting.
  let html = escapeHtml(extracted.text);
  html = applyMarkdown(html);

  // 4) Replace placeholders with KaTeX-rendered HTML.
  for (const seg of extracted.segments) {
    const rendered = renderMath(seg.tex, { displayMode: seg.display });
    html = html.split(seg.placeholder).join(rendered);
  }

  if (isAiFormatDebugEnabled()) {
    try {
      const displayMathSegments = extracted.segments.filter(s => s.display);
      const inlineMathSegments = extracted.segments.filter(s => !s.display);
      const debugPayload = {
        inputPreview: text.slice(0, 600),
        normalizedPreview: normalized.slice(0, 600),
        segmentCount: extracted.segments.length,
        displayMathCount: displayMathSegments.length,
        inlineMathCount: inlineMathSegments.length,
        segmentsPreview: extracted.segments.slice(0, 8).map((s) => ({
          display: s.display,
          texPreview: s.tex.slice(0, 200),
          placeholder: s.placeholder.slice(0, 50),
        })),
        displayMathSegments: displayMathSegments.map((s) => ({
          tex: s.tex,
          placeholder: s.placeholder,
        })),
        htmlPreview: html.slice(0, 1000),
        hasDisplayMathInInput: text.includes('\\[') || text.includes('\\ ['),
      };
      (window as any).__AI_DEBUG_LAST_MARKDOWN = debugPayload;
      // eslint-disable-next-line no-console
      console.log('[AI_FORMAT_DEBUG] markdownToHtml()', debugPayload);
      
      if (debugPayload.hasDisplayMathInInput && displayMathSegments.length === 0) {
        // eslint-disable-next-line no-console
        console.error('[AI_FORMAT_DEBUG] ERROR: Input contains \\[ but no display math segments were found!', {
          inputSample: text,
          normalizedSample: normalized,
        });
      }
    } catch {
      // ignore
    }
  }
  
  return html;
}

function preNormalizeAiMath(input: string): string {
  let s = input;

  // If delimiters are double-escaped in the raw text (e.g., "\\["), normalize to "\[".
  // This can happen when upstream serializes strings oddly.
  s = s
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]')
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)');

  // Fix orphaned closing delimiters - if we see \] without a matching \[ before it,
  // try to find if there's math content that should be wrapped
  // Pattern: LaTeX content followed by \] without opening \[
  s = s.replace(/(?<!\\\[)(?<!\\ \[)([^\n]*?\\frac\{[^}]+\}\{[^}]+\}[^\n]*?)\s*\\\]/g, (match, content) => {
    // If this looks like LaTeX math content, wrap it properly
    if (content.includes('\\frac') || content.includes('\\sqrt') || content.includes('\\sum') || 
        content.includes('=') && (content.includes('^') || content.includes('_'))) {
      return `\\[${content.trim()}\\]`;
    }
    return match;
  });

  // Fix standalone LaTeX expressions that should be display math
  // Pattern: LaTeX expression on its own line(s) ending with \] but missing opening
  s = s.replace(/^\s*([^\n]*?\\frac\{[^}]+\}\{[^}]+\}[^\n]*?)\s*\\\]\s*$/gm, (match, content) => {
    if (!match.includes('\\[') && (content.includes('\\frac') || content.includes('='))) {
      return `\\[${content.trim()}\\]`;
    }
    return match;
  });

  // CRITICAL: Detect and wrap standalone LaTeX expressions that have NO delimiters at all
  // Pattern: Standalone math expressions on their own lines (display math)
  // Examples: "U(r) = \frac{kr^2}{2}" or "F_c = -\frac{dU}{dr}"
  s = s.replace(/^\s*([A-Za-z_][A-Za-z0-9_()]*\s*=\s*[^\n]*?(?:\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod|\\alpha|\\beta|\\gamma|\\pi|\\theta|\\phi|\\omega|\\vec|\\hat|\\cdot|\\times|\\div|\\pm|\\mp|\\leq|\\geq|\\neq|\\approx|\\equiv|\\sin|\\cos|\\tan|\\log|\\ln|\\exp|\\left|\\right|\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod)[^\n]*?)\s*$/gm, (match, content) => {
    // Only wrap if it doesn't already have delimiters and looks like math
    if (!match.includes('\\[') && !match.includes('\\(') && !match.includes('$') && 
        (content.includes('\\frac') || content.includes('\\sqrt') || content.includes('='))) {
      return `\\[${content.trim()}\\]`;
    }
    return match;
  });

  // Also detect inline math patterns without delimiters in the middle of text
  // Pattern: LaTeX expressions within sentences (inline math)
  // Example: "The potential energy is U(r) = \frac{kr^2}{2} for the particle"
  s = s.replace(/([A-Za-z_][A-Za-z0-9_()]*\s*=\s*[^\s]*?(?:\\frac|\\sqrt|\\sum|\\int|\\lim|\\prod|\\alpha|\\beta|\\gamma|\\pi|\\theta|\\phi|\\omega|\\vec|\\hat|\\cdot|\\times|\\div|\\pm|\\mp|\\leq|\\geq|\\neq|\\approx|\\equiv|\\sin|\\cos|\\tan|\\log|\\ln|\\exp|\\left|\\right)[^\s]*?)(?=\s|$|\.|,|;|:)/g, (match, content) => {
    // Only wrap if it doesn't already have delimiters
    if (!match.includes('\\[') && !match.includes('\\(') && !match.includes('$') && 
        (content.includes('\\frac') || content.includes('\\sqrt') || content.includes('='))) {
      return `\\(${content.trim()}\\)`;
    }
    return match;
  });

  // If AI uses split $...$ blocks after '=' like:
  //   S_n = $\\sum_{k=1}^{n}$ $\\frac{...}{...}$
  // Merge into a single \( ... \) so "S_n =" stays in math.
  s = s.replace(
    /\b([A-Za-z][A-Za-z0-9_]{0,16})\s*=\s*((?:\$(?:[^$\n]+)\$\s*){2,})/g,
    (match, varName, blocks) => {
      const parts = (blocks.match(/\$([^$\n]+)\$/g) || []).map((b) => b.replace(/^\$|\$$/g, '').trim());
      if (parts.length < 2) return match;
      return `\\(${varName} = ${parts.join(' ')}\\)`;
    },
  );

  // Also convert single "VAR = $...$" into a single math block.
  s = s.replace(
    /\b([A-Za-z][A-Za-z0-9_]{0,16})\s*=\s*\$([^$\n]+)\$/g,
    (_m, varName, body) => `\\(${varName} = ${body.trim()}\\)`,
  );

  // Convert comparisons like "S_n < $...$" into a single math block.
  s = s.replace(
    /\b([A-Za-z][A-Za-z0-9_]{0,16})\s*([<>≤≥≠])\s*\$([^$\n]+)\$/g,
    (_m, varName, op, body) => `\\(${varName} ${op} ${body.trim()}\\)`,
  );

  return s;
}

function extractMathSegments(input: string): { text: string; segments: MathSegment[] } {
  const segments: MathSegment[] = [];
  const placeholder = (i: number, display: boolean) => `⧉MATH${display ? 'D' : 'I'}⧉${i}⧉MATH⧉`;

  // Process display math FIRST using a more robust approach that handles nested brackets
  // We'll manually find \[ and match to the corresponding \]
  let text = input;
  let displayMathIndex = 0;
  
  // Find all \[...\] blocks (display math)
  // Handle both "\[" and "\ [" (with space) patterns
  while (true) {
    // Try to find \[ first (no space)
    let startIdx = text.indexOf('\\[');
    let startLen = 2;
    
    // If not found, try \ [ (with space)
    if (startIdx === -1) {
      startIdx = text.indexOf('\\ [');
      startLen = 3;
    }
    
    if (startIdx === -1) break;
    
    // Look for the matching \] by counting brackets
    let depth = 1;
    let endIdx = startIdx + startLen;
    let found = false;
    let endLen = 2;
    
    while (endIdx < text.length) {
      // Check for opening bracket (with or without space)
      if (text.slice(endIdx, endIdx + 2) === '\\[') {
        depth++;
        endIdx += 2;
      } else if (text.slice(endIdx, endIdx + 3) === '\\ [') {
        depth++;
        endIdx += 3;
      }
      // Check for closing bracket (with or without space)
      else if (text.slice(endIdx, endIdx + 2) === '\\]') {
        depth--;
        if (depth === 0) {
          found = true;
          endLen = 2;
          break;
        }
        endIdx += 2;
      } else if (text.slice(endIdx, endIdx + 3) === '\\ ]') {
        depth--;
        if (depth === 0) {
          found = true;
          endLen = 3;
          break;
        }
        endIdx += 3;
      } else {
        endIdx++;
      }
    }
    
    if (found) {
      const content = text.slice(startIdx + startLen, endIdx);
      const tex = fixLatexForKatex(content.trim());
      const ph = placeholder(segments.length, true);
      segments.push({ placeholder: ph, tex, display: true });
      text = text.slice(0, startIdx) + ph + text.slice(endIdx + endLen);
      
      if (isAiFormatDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log(`[AI_FORMAT_DEBUG] Found display math #${displayMathIndex + 1}:`, {
          startDelimiter: text.slice(startIdx, startIdx + startLen),
          contentPreview: content.slice(0, 100),
          texPreview: tex.slice(0, 100),
          hasNewlines: content.includes('\n'),
          contentLength: content.length,
        });
      }
      displayMathIndex++;
    } else {
      // No matching \], skip this \[ by moving past it
      text = text.slice(0, startIdx) + text.slice(startIdx + startLen);
      if (isAiFormatDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.warn('[AI_FORMAT_DEBUG] Found \\[ but no matching \\]', {
          context: text.slice(Math.max(0, startIdx - 20), startIdx + 50),
        });
      }
    }
  }

  // Now process $$...$$ (legacy display math)
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    const tex = fixLatexForKatex(content.trim());
    const ph = placeholder(segments.length, true);
    segments.push({ placeholder: ph, tex, display: true });
    return ph;
  });

  // Process \(...\) (inline math)
  text = text.replace(/\\\s*\(([\s\S]*?)\\\s*\)/g, (match, content) => {
    const tex = fixLatexForKatex(content.trim());
    const ph = placeholder(segments.length, false);
    segments.push({ placeholder: ph, tex, display: false });
    return ph;
  });

  // Process $...$ (legacy inline math, single line only)
  text = text.replace(/\$([^\n$]+?)\$/g, (match, content) => {
    const tex = fixLatexForKatex(content.trim());
    const ph = placeholder(segments.length, false);
    segments.push({ placeholder: ph, tex, display: false });
    return ph;
  });

  if (isAiFormatDebugEnabled() && segments.length === 0 && input.includes('\\[')) {
    // eslint-disable-next-line no-console
    console.warn('[AI_FORMAT_DEBUG] Input contains \\[ but no matches found:', {
      inputPreview: input.slice(0, 500),
      hasBackslashBracket: input.includes('\\['),
      hasBackslashBracketSpace: input.includes('\\ ['),
    });
  }

  return { text, segments };
}

function fixLatexForKatex(tex: string): string {
  let t = (tex ?? '').trim();

  // Strip accidental $ wrappers if they slipped inside captured content.
  t = t.replace(/^\$+|\$+$/g, '').trim();

  // Fix JSON-escape corruption for common LaTeX commands:
  // - "\frac" can become formfeed + "rac" (because JSON \f escape)
  // - "\to", "\times", "\text" etc can become tab + "o"/"imes"/"ext" (because JSON \t escape)
  // - "\beta" can become backspace + "eta" (because JSON \b escape)
  // We only “repair” these control chars when followed by letters.
  t = t.replace(/\x0c([A-Za-z]+)/g, '\\f$1'); // formfeed → \f...
  t = t.replace(/\t([A-Za-z]+)/g, '\\t$1'); // tab → \t...
  t = t.replace(/\x08([A-Za-z]+)/g, '\\b$1'); // backspace → \b...

  // Normalize escaped backslashes.
  t = t.replace(/\\\\/g, '\\');

  // Fix concatenated LaTeX commands that AI sometimes produces.
  // Example: "\cdotpm" is invalid; it usually means "\cdot \pm".
  t = t.replace(/\\cdotpm\b/g, '\\cdot \\pm');

  // Common AI mistake: \sum{...}^{...} instead of \sum_{...}^{...}
  t = t.replace(/\\(sum|prod|int|lim)\s*\{([^{}]+)\}\s*\^\s*\{([^{}]+)\}/g, '\\$1_{$2}^{$3}');
  t = t.replace(/\\(sum|prod|int|lim)\s*\{([^{}]+)\}/g, '\\$1_{$2}');

  return t;
}

function applyMarkdown(input: string): string {
  // Minimal formatting: just preserve newlines as <br> tags
  // No divs, no paragraphs, no lists - just plain text with line breaks
  return input.replace(/\n/g, '<br>');
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


