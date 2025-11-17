// Simple markdown to HTML converter for AI responses
// Handles common markdown patterns without external dependencies

export function markdownToHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  let html = text;
  
  // Escape HTML first to prevent XSS
  html = escapeHtml(html);
  
  // Code blocks (process before inline code to avoid conflicts)
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });
  
  // Headers (process before other formatting)
  html = html.replace(/^### (.*)$/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gim, '<h1>$1</h1>');
  
  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr>');
  html = html.replace(/^\*\*\*$/gim, '<hr>');
  
  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gim, '<blockquote>$1</blockquote>');
  
  // Bold (must come before italic to avoid conflicts)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic (avoid matching bold)
  html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)([^_]+?)(?<!_)_(?!_)/g, '<em>$1</em>');
  
  // Inline code (avoid matching code blocks)
  html = html.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '<code>$1</code>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists - ordered (process before unordered)
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inOrderedList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    
    if (orderedMatch) {
      if (!inOrderedList) {
        processedLines.push('<ol>');
        inOrderedList = true;
      }
      processedLines.push(`<li>${orderedMatch[2]}</li>`);
    } else {
      if (inOrderedList) {
        processedLines.push('</ol>');
        inOrderedList = false;
      }
      processedLines.push(line);
    }
  }
  
  if (inOrderedList) {
    processedLines.push('</ol>');
  }
  
  html = processedLines.join('\n');
  
  // Lists - unordered
  const lines2 = html.split('\n');
  const processedLines2: string[] = [];
  let inUnorderedList = false;
  
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const unorderedMatch = line.match(/^[\*\-\+]\s+(.+)$/);
    
    if (unorderedMatch && !line.match(/^<[ou]l>/)) {
      if (!inUnorderedList) {
        processedLines2.push('<ul>');
        inUnorderedList = true;
      }
      processedLines2.push(`<li>${unorderedMatch[1]}</li>`);
    } else {
      if (inUnorderedList) {
        processedLines2.push('</ul>');
        inUnorderedList = false;
      }
      processedLines2.push(line);
    }
  }
  
  if (inUnorderedList) {
    processedLines2.push('</ul>');
  }
  
  html = processedLines2.join('\n');
  
  // Line breaks - convert double newlines to paragraphs
  html = html.split('\n\n').map(para => {
    para = para.trim();
    if (!para) return '';
    // Don't wrap if already a block element
    if (para.match(/^<(h[1-6]|p|ul|ol|pre|blockquote|hr)/)) {
      return para;
    }
    return `<p>${para}</p>`;
  }).join('\n');
  
  // Clean up empty paragraphs and fix nested block elements
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<[^>]+>)/g, '$1');
  html = html.replace(/(<\/[^>]+>)<\/p>/g, '$1');
  
  return html;
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

