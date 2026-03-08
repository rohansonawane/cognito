/**
 * MediaViewer — renders different file types appropriately.
 * Supports: image, video, audio, document, article/text, code, blob.
 */

import React, { useState, useEffect } from 'react';
import { FileText, Image, Film, Music, Code2, File, ExternalLink, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import type { EnterpriseFile } from '../../types';
import { FileAPI } from '../../services/api';

interface MediaViewerProps {
  file: EnterpriseFile;
  className?: string;
}

export function MediaViewer({ file, className = '' }: MediaViewerProps) {
  const url = FileAPI.downloadUrl(file.id);

  switch (file.file_type) {
    case 'image': return <ImageViewer file={file} url={url} className={className} />;
    case 'video': return <VideoViewer file={file} url={url} className={className} />;
    case 'audio': return <AudioViewer file={file} url={url} className={className} />;
    case 'document': return <DocumentViewer file={file} url={url} className={className} />;
    case 'article':
    case 'code': return <TextViewer file={file} url={url} className={className} />;
    default: return <BlobViewer file={file} url={url} className={className} />;
  }
}

// ─── Image Viewer ─────────────────────────────────────────────────────────────

function ImageViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <Image size={12} />
          {file.original_name}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-1 hover:text-white transition rounded hover:bg-slate-700">
            <ZoomOut size={12} />
          </button>
          <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-1 hover:text-white transition rounded hover:bg-slate-700">
            <ZoomIn size={12} />
          </button>
          <button onClick={() => setRotate(r => (r + 90) % 360)} className="p-1 hover:text-white transition rounded hover:bg-slate-700">
            <RotateCw size={12} />
          </button>
          <a href={url} download={file.original_name} className="p-1 hover:text-white transition rounded hover:bg-slate-700">
            <Download size={12} />
          </a>
        </div>
      </div>
      <div className="overflow-auto bg-slate-950 rounded-lg border border-slate-700 flex items-center justify-center min-h-[200px] max-h-[500px]">
        <img
          src={url}
          alt={file.original_name}
          style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: 'transform 0.2s ease' }}
          className="object-contain max-w-full"
        />
      </div>
    </div>
  );
}

// ─── Video Viewer ─────────────────────────────────────────────────────────────

function VideoViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="text-xs text-slate-400 px-1 flex items-center gap-1.5">
        <Film size={12} /> {file.original_name}
      </div>
      <div className="bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
        <video
          src={url}
          controls
          preload="metadata"
          className="w-full max-h-[500px]"
        >
          <source src={url} type={file.mime_type} />
          Your browser does not support video playback.
        </video>
      </div>
      <div className="text-xs text-slate-500 text-right px-1">{formatSize(file.size)}</div>
    </div>
  );
}

// ─── Audio Viewer ─────────────────────────────────────────────────────────────

function AudioViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="text-xs text-slate-400 px-1 flex items-center gap-1.5">
        <Music size={12} /> {file.original_name}
      </div>
      <div className="bg-slate-950 rounded-lg border border-slate-700 p-4">
        <audio src={url} controls className="w-full">
          <source src={url} type={file.mime_type} />
        </audio>
      </div>
    </div>
  );
}

// ─── Document Viewer ──────────────────────────────────────────────────────────

function DocumentViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  const isPdf = file.mime_type === 'application/pdf' || file.original_name.toLowerCase().endsWith('.pdf');

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          <FileText size={12} /> {file.original_name}
        </span>
        <div className="flex gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition">
            <ExternalLink size={10} /> Open
          </a>
          <a href={url} download={file.original_name} className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 hover:text-white transition">
            <Download size={10} /> Download
          </a>
        </div>
      </div>
      {isPdf ? (
        <div className="bg-slate-950 rounded-lg border border-slate-700 overflow-hidden">
          <iframe
            src={url}
            title={file.original_name}
            className="w-full"
            style={{ height: '600px' }}
          />
        </div>
      ) : (
        <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 text-center">
          <FileText size={40} className="text-slate-500 mx-auto mb-3" />
          <p className="text-slate-300 text-sm font-medium">{file.original_name}</p>
          <p className="text-slate-500 text-xs mt-1">{formatSize(file.size)} · {file.mime_type}</p>
          <p className="text-slate-400 text-xs mt-4">Office documents can be analyzed by AI. Use the connector to extract insights.</p>
        </div>
      )}
    </div>
  );
}

// ─── Text / Article / Code Viewer ─────────────────────────────────────────────

function TextViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(url)
      .then(r => r.text())
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => { setContent('Failed to load file content.'); setLoading(false); });
  }, [url]);

  const isCode = file.file_type === 'code';
  const ext = file.original_name.split('.').pop()?.toLowerCase() || '';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1.5">
          {isCode ? <Code2 size={12} /> : <FileText size={12} />}
          {file.original_name}
          {ext && <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase">{ext}</span>}
        </span>
        <a href={url} download={file.original_name} className="p-1 hover:text-white transition rounded hover:bg-slate-700">
          <Download size={12} />
        </a>
      </div>
      <div className="bg-slate-950 rounded-lg border border-slate-700 overflow-auto max-h-[500px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : (
          <pre className="text-xs text-slate-300 font-mono p-4 whitespace-pre-wrap break-words leading-relaxed">
            {content?.slice(0, 100_000)}
            {(content?.length || 0) > 100_000 && '\n\n... (truncated for display)'}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Blob / Unknown Viewer ────────────────────────────────────────────────────

function BlobViewer({ file, url, className }: { file: EnterpriseFile; url: string; className: string }) {
  return (
    <div className={`bg-slate-900 rounded-lg border border-slate-700 p-6 text-center ${className}`}>
      <File size={40} className="text-slate-500 mx-auto mb-3" />
      <p className="text-slate-300 text-sm font-medium">{file.original_name}</p>
      <p className="text-slate-500 text-xs mt-1">{formatSize(file.size)} · {file.mime_type}</p>
      <div className="flex justify-center gap-2 mt-4">
        <a href={url} download={file.original_name}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition">
          <Download size={12} /> Download
        </a>
      </div>
    </div>
  );
}

// ─── File type icon helper ────────────────────────────────────────────────────

export function FileTypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  switch (type) {
    case 'image': return <Image size={size} className="text-green-400" />;
    case 'video': return <Film size={size} className="text-purple-400" />;
    case 'audio': return <Music size={size} className="text-pink-400" />;
    case 'document': return <FileText size={size} className="text-orange-400" />;
    case 'article': return <FileText size={size} className="text-blue-400" />;
    case 'code': return <Code2 size={size} className="text-yellow-400" />;
    default: return <File size={size} className="text-slate-400" />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
