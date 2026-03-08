/**
 * File processor service — extracts text/content from uploaded files
 * for AI analysis. Supports images (base64), text files, PDFs, code, etc.
 */

import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';

/**
 * Process a file record into AI-consumable content parts.
 * Returns an array of content parts suitable for multi-modal AI APIs.
 */
export async function processFile(file) {
  const { file_type, mime_type, storage_path, name, original_name } = file;
  const metadata = JSON.parse(file.metadata || '{}');

  if (!existsSync(storage_path)) {
    return [{ type: 'text', text: `[File not found: ${original_name}]` }];
  }

  switch (file_type) {
    case 'image':
      return processImage(storage_path, mime_type, original_name);

    case 'video':
      return processVideo(storage_path, original_name, metadata);

    case 'article':
    case 'code':
      return processText(storage_path, original_name, mime_type);

    case 'document':
      return processDocument(storage_path, original_name, mime_type);

    case 'audio':
      return [{ type: 'text', text: `[Audio file: ${original_name} — transcription not yet available]` }];

    default:
      return processBlob(storage_path, original_name);
  }
}

function processImage(storagePath, mimeType, name) {
  try {
    const data = readFileSync(storagePath);
    const base64 = data.toString('base64');
    const safeType = mimeType.startsWith('image/') ? mimeType : 'image/png';
    return [{
      type: 'image',
      mediaType: safeType,
      data: base64,
      label: name,
    }];
  } catch (e) {
    return [{ type: 'text', text: `[Could not read image: ${name} — ${e.message}]` }];
  }
}

function processText(storagePath, name, _mimeType) {
  try {
    const content = readFileSync(storagePath, 'utf-8');
    const ext = extname(name).toLowerCase();
    const label = ext ? `[${ext.slice(1).toUpperCase()} file: ${name}]` : `[Text file: ${name}]`;
    return [{ type: 'text', text: `${label}\n\n\`\`\`\n${content.slice(0, 50_000)}\n\`\`\`` }];
  } catch (e) {
    return [{ type: 'text', text: `[Could not read file: ${name} — ${e.message}]` }];
  }
}

async function processDocument(storagePath, name, mimeType) {
  if (mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return processPdf(storagePath, name);
  }
  // For Word/Excel/PPT — read as binary and note it
  return [{
    type: 'text',
    text: `[Office document: ${name} — content extraction for .docx/.pptx/.xlsx requires additional processing. File is ${(readFileSize(storagePath) / 1024).toFixed(1)}KB]`,
  }];
}

async function processPdf(storagePath, name) {
  try {
    // Try to dynamically import pdf-parse if available
    const { default: pdfParse } = await import('pdf-parse').catch(() => ({ default: null }));
    if (pdfParse) {
      const buffer = readFileSync(storagePath);
      const data = await pdfParse(buffer);
      return [{
        type: 'text',
        text: `[PDF: ${name}]\n\nPages: ${data.numpages}\n\n${data.text.slice(0, 50_000)}`,
      }];
    }
  } catch {
    // fall through
  }
  // Fallback: note the file
  const kb = (readFileSize(storagePath) / 1024).toFixed(1);
  return [{
    type: 'text',
    text: `[PDF file: ${name} — ${kb}KB. Install pdf-parse for full text extraction.]`,
  }];
}

function processVideo(storagePath, name, metadata) {
  // For now, describe the video — frame extraction would need ffmpeg
  const kb = (readFileSize(storagePath) / 1024).toFixed(1);
  const duration = metadata.duration ? ` Duration: ${metadata.duration}s.` : '';
  return [{
    type: 'text',
    text: `[Video file: ${name} — ${kb}KB.${duration} Frame extraction available via ffmpeg integration.]`,
  }];
}

function processBlob(storagePath, name) {
  const kb = (readFileSize(storagePath) / 1024).toFixed(1);
  try {
    // Try reading as text first
    const content = readFileSync(storagePath, 'utf-8');
    if (isProbablyText(content)) {
      return [{ type: 'text', text: `[Blob/Unknown: ${name}]\n\n${content.slice(0, 10_000)}` }];
    }
  } catch {
    // binary file
  }
  return [{ type: 'text', text: `[Binary blob: ${name} — ${kb}KB]` }];
}

function readFileSize(path) {
  try { return readFileSync(path).length; } catch { return 0; }
}

function isProbablyText(str) {
  // Heuristic: if >95% of chars are printable ASCII or common unicode, it's text
  const sample = str.slice(0, 1000);
  const nonPrintable = sample.split('').filter(c => {
    const code = c.charCodeAt(0);
    return code < 9 || (code > 13 && code < 32);
  }).length;
  return nonPrintable / sample.length < 0.05;
}

/**
 * Build a structured summary of multiple files for AI context.
 */
export function buildFilesSummary(files) {
  return files.map((f, i) => {
    const meta = JSON.parse(f.metadata || '{}');
    const size = (f.size / 1024).toFixed(1);
    return `${i + 1}. **${f.original_name}** (${f.file_type}, ${size}KB)${meta.pages ? ` — ${meta.pages} pages` : ''}`;
  }).join('\n');
}
