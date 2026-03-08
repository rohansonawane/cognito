/**
 * File processor service tests.
 * Tests file type detection and content extraction.
 */

import { describe, it, expect } from 'vitest';
import { detectFileType } from '../enterprise/middleware/upload.js';
import { buildFilesSummary } from '../enterprise/services/fileProcessor.js';

// ─── detectFileType ───────────────────────────────────────────────────────────

describe('detectFileType', () => {
  it('detects images correctly', () => {
    expect(detectFileType('image/jpeg', 'photo.jpg')).toBe('image');
    expect(detectFileType('image/png', 'screenshot.png')).toBe('image');
    expect(detectFileType('image/webp', 'icon.webp')).toBe('image');
    expect(detectFileType('image/gif', 'animation.gif')).toBe('image');
  });

  it('detects videos correctly', () => {
    expect(detectFileType('video/mp4', 'video.mp4')).toBe('video');
    expect(detectFileType('video/webm', 'clip.webm')).toBe('video');
    expect(detectFileType('video/quicktime', 'movie.mov')).toBe('video');
  });

  it('detects audio correctly', () => {
    expect(detectFileType('audio/mpeg', 'song.mp3')).toBe('audio');
    expect(detectFileType('audio/wav', 'sound.wav')).toBe('audio');
  });

  it('detects PDFs as documents', () => {
    expect(detectFileType('application/pdf', 'report.pdf')).toBe('document');
    expect(detectFileType('application/octet-stream', 'doc.pdf')).toBe('document');
  });

  it('detects Word docs as documents', () => {
    expect(detectFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'report.docx')).toBe('document');
    expect(detectFileType('application/msword', 'old.doc')).toBe('document');
  });

  it('detects Markdown as articles', () => {
    expect(detectFileType('text/markdown', 'readme.md')).toBe('article');
    expect(detectFileType('text/plain', 'notes.md')).toBe('article');
  });

  it('detects text files as articles', () => {
    expect(detectFileType('text/plain', 'notes.txt')).toBe('article');
    expect(detectFileType('text/html', 'page.html')).toBe('article');
    expect(detectFileType('text/csv', 'data.csv')).toBe('article');
  });

  it('detects code files correctly', () => {
    expect(detectFileType('text/plain', 'app.js')).toBe('code');
    expect(detectFileType('application/javascript', 'component.tsx')).toBe('code');
    expect(detectFileType('text/plain', 'main.py')).toBe('code');
    expect(detectFileType('text/plain', 'server.go')).toBe('code');
    expect(detectFileType('application/json', 'config.json')).toBe('code');
    expect(detectFileType('text/plain', 'query.sql')).toBe('code');
    expect(detectFileType('text/plain', 'setup.sh')).toBe('code');
  });

  it('falls back to blob for unknown types', () => {
    expect(detectFileType('application/octet-stream', 'data.bin')).toBe('blob');
    expect(detectFileType('application/x-unknown', 'mystery.xyz')).toBe('blob');
  });
});

// ─── buildFilesSummary ────────────────────────────────────────────────────────

describe('buildFilesSummary', () => {
  it('generates correct summary for multiple files', () => {
    const files = [
      { original_name: 'report.pdf', file_type: 'document', size: 2048 * 1024, metadata: '{"pages": 5}' },
      { original_name: 'image.png', file_type: 'image', size: 512 * 1024, metadata: '{}' },
      { original_name: 'code.py', file_type: 'code', size: 4096, metadata: '{}' },
    ];

    const summary = buildFilesSummary(files);
    expect(summary).toContain('report.pdf');
    expect(summary).toContain('document');
    expect(summary).toContain('image.png');
    expect(summary).toContain('image');
    expect(summary).toContain('code.py');
    expect(summary).toContain('code');
    expect(summary).toContain('5 pages'); // PDF pages
  });

  it('returns empty string for empty file list', () => {
    const summary = buildFilesSummary([]);
    expect(summary).toBe('');
  });

  it('numbers files correctly', () => {
    const files = [
      { original_name: 'a.txt', file_type: 'article', size: 100, metadata: '{}' },
      { original_name: 'b.txt', file_type: 'article', size: 200, metadata: '{}' },
    ];
    const summary = buildFilesSummary(files);
    expect(summary).toContain('1.');
    expect(summary).toContain('2.');
  });
});
