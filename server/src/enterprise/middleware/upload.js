/**
 * Multer upload middleware for enterprise file connector.
 * Supports images, videos, documents, articles, and blobs.
 */

import multer from 'multer';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '../../../../uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

// Categorize file types
export function detectFileType(mimeType, originalName) {
  const ext = extname(originalName).toLowerCase();

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  if (mimeType === 'application/pdf' || ext === '.pdf') return 'document';
  if (['.doc', '.docx'].includes(ext) || mimeType.includes('word')) return 'document';
  if (['.ppt', '.pptx'].includes(ext) || mimeType.includes('presentation')) return 'document';
  if (['.xls', '.xlsx'].includes(ext) || mimeType.includes('spreadsheet')) return 'document';

  // Code extensions take priority over generic text/plain mime type
  const CODE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.swift', '.kt', '.json', '.yaml', '.yml', '.xml', '.sql', '.sh', '.bash']);
  if (CODE_EXTS.has(ext)) return 'code';

  if (['.md', '.markdown'].includes(ext) || mimeType === 'text/markdown') return 'article';
  if (['.html', '.htm'].includes(ext) || mimeType === 'text/html') return 'article';
  if (ext === '.txt' || mimeType === 'text/plain') return 'article';
  if (mimeType === 'text/csv' || ext === '.csv') return 'article';

  return 'blob';
}

const ALLOWED_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
  // Videos
  'video/mp4', 'video/mpeg', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Text / Articles
  'text/plain', 'text/html', 'text/markdown', 'text/csv',
  'application/json', 'application/xml', 'text/xml',
]);

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 100);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  // Allow any text/* or application/* with common extensions even if mime is generic
  const ext = extname(file.originalname).toLowerCase();
  const codeExts = new Set(['.js','.ts','.jsx','.tsx','.py','.java','.go','.rs','.rb','.php','.cs','.cpp','.c','.h','.swift','.kt','.json','.yaml','.yml','.xml','.sql','.sh','.bash','.md','.markdown','.txt','.csv','.html','.htm']);

  if (ALLOWED_TYPES.has(file.mimetype) || codeExts.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported: ${file.mimetype} (${ext})`), false);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_MB * 1024 * 1024,
    files: 20, // max 20 files per request
  },
});

export { UPLOAD_DIR };
