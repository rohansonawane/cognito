/**
 * FileConnector — the heart of Cognito Enterprise.
 * Upload multiple files of any type, organize them into connections,
 * and run AI analysis across all of them together.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Link2, Sparkles, Plus, Trash2, ChevronDown, ChevronUp,
  X, Check, AlertCircle, Loader2, FolderOpen, Eye, MoreVertical,
  Zap, FileSearch, RefreshCw,
} from 'lucide-react';
import type { EnterpriseFile, Connection, Analysis } from '../../types';
import { FileAPI, ConnectorAPI } from '../../services/api';
import { MediaViewer, FileTypeIcon } from '../MediaViewer';

interface FileConnectorProps {
  workspaceId: string;
  initialFiles?: EnterpriseFile[];
  onAnalysisComplete?: (result: string, analysisId: string) => void;
}

type Tab = 'files' | 'connections' | 'history';

export function FileConnector({ workspaceId, initialFiles = [], onAnalysisComplete }: FileConnectorProps) {
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<EnterpriseFile[]>(initialFiles);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<EnterpriseFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await FileAPI.list(workspaceId);
      setFiles(res.files);
    } catch { /* ignore */ }
  }, [workspaceId]);

  const loadConnections = useCallback(async () => {
    try {
      const res = await ConnectorAPI.list(workspaceId);
      setConnections(res.connections);
    } catch { /* ignore */ }
  }, [workspaceId]);

  useEffect(() => {
    loadFiles();
    loadConnections();
  }, [loadFiles, loadConnections]);

  // ─── Upload ───────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (rawFiles: FileList | File[]) => {
    const fileArray = Array.from(rawFiles);
    if (!fileArray.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await FileAPI.upload(workspaceId, fileArray);
      setFiles(prev => [...res.files, ...prev]);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [workspaceId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const handleDelete = useCallback(async (fileId: string) => {
    try {
      await FileAPI.delete(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFileIds(prev => { const n = new Set(prev); n.delete(fileId); return n; });
    } catch { /* ignore */ }
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedFileIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    setSelectedFileIds(new Set(files.map(f => f.id)));
  };

  const clearSelection = () => setSelectedFileIds(new Set());

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Link2 size={18} className="text-blue-400" />
          <span className="font-semibold text-white text-sm">File Connector</span>
          <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">{files.length} files</span>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition font-medium"
        >
          <Upload size={13} /> Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => e.target.files && handleUpload(e.target.files)}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.html,.csv,.json,.yaml,.yml,.xml,.sql,.js,.ts,.jsx,.tsx,.py,.java,.go,.rs,.rb,.php,.cs,.cpp,.c,.h,.swift,.kt,.sh"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {([
          ['files', 'Files', FolderOpen],
          ['connections', 'Connections', Link2],
          ['history', 'History', FileSearch],
        ] as [Tab, string, typeof FolderOpen][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              tab === id
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={13} />
            {label}
            {id === 'connections' && connections.length > 0 && (
              <span className="text-[10px] bg-blue-600 text-white rounded-full px-1.5 ml-0.5">{connections.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 overflow-auto p-4">
          {tab === 'files' && (
            <FilesTab
              files={files}
              selectedFileIds={selectedFileIds}
              uploading={uploading}
              uploadError={uploadError}
              isDragging={isDragging}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onSelect={toggleSelect}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              onDelete={handleDelete}
              onPreview={setPreviewFile}
              onUploadClick={() => fileInputRef.current?.click()}
              workspaceId={workspaceId}
              onConnectionCreated={(conn) => { setConnections(prev => [conn, ...prev]); setTab('connections'); }}
            />
          )}
          {tab === 'connections' && (
            <ConnectionsTab
              connections={connections}
              files={files}
              workspaceId={workspaceId}
              onAnalysisComplete={(result, id) => {
                loadConnections();
                onAnalysisComplete?.(result, id);
              }}
              onDelete={async (id) => {
                await ConnectorAPI.delete(id);
                setConnections(prev => prev.filter(c => c.id !== id));
              }}
              onRefresh={loadConnections}
            />
          )}
          {tab === 'history' && (
            <HistoryTab workspaceId={workspaceId} />
          )}
        </div>

        {/* Preview panel */}
        {previewFile && (
          <div className="w-80 border-l border-slate-700 overflow-auto p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Preview</span>
              <button onClick={() => setPreviewFile(null)} className="text-slate-500 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
            <MediaViewer file={previewFile} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

interface FilesTabProps {
  files: EnterpriseFile[];
  selectedFileIds: Set<string>;
  uploading: boolean;
  uploadError: string | null;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: (id: string) => void;
  onPreview: (file: EnterpriseFile) => void;
  onUploadClick: () => void;
  workspaceId: string;
  onConnectionCreated: (connection: Connection) => void;
}

function FilesTab({
  files, selectedFileIds, uploading, uploadError, isDragging,
  onDragOver, onDragLeave, onDrop, onSelect, onSelectAll,
  onClearSelection, onDelete, onPreview, onUploadClick,
  workspaceId, onConnectionCreated,
}: FilesTabProps) {
  const [showCreateConn, setShowCreateConn] = useState(false);
  const [connName, setConnName] = useState('');
  const [connDesc, setConnDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreateConnection = async () => {
    if (!connName.trim() || selectedFileIds.size === 0) return;
    setCreating(true);
    try {
      const res = await ConnectorAPI.create(workspaceId, connName.trim(), connDesc.trim(), [...selectedFileIds]);
      onConnectionCreated(res.connection);
      setConnName('');
      setConnDesc('');
      setShowCreateConn(false);
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onUploadClick}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-400 bg-blue-400/10'
            : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-blue-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Uploading...</span>
          </div>
        ) : (
          <>
            <Upload size={22} className="mx-auto text-slate-500 mb-2" />
            <p className="text-sm text-slate-400 font-medium">Drop files here or click to upload</p>
            <p className="text-xs text-slate-600 mt-1">Images, videos, documents, articles, code — up to 100MB each</p>
          </>
        )}
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          <AlertCircle size={12} /> {uploadError}
        </div>
      )}

      {/* Selection bar */}
      {files.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <button onClick={onSelectAll} className="hover:text-white transition">Select all</button>
            {selectedFileIds.size > 0 && (
              <>
                <span>·</span>
                <span className="text-blue-400 font-medium">{selectedFileIds.size} selected</span>
                <button onClick={onClearSelection} className="hover:text-white transition">Clear</button>
              </>
            )}
          </div>
          {selectedFileIds.size > 0 && (
            <button
              onClick={() => setShowCreateConn(v => !v)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg transition font-medium"
            >
              <Link2 size={12} /> Connect {selectedFileIds.size} file{selectedFileIds.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Create connection form */}
      {showCreateConn && selectedFileIds.size > 0 && (
        <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Link2 size={14} className="text-blue-400" /> Create Connection
          </h4>
          <input
            value={connName}
            onChange={e => setConnName(e.target.value)}
            placeholder="Connection name (e.g. Q3 Marketing Analysis)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
          <textarea
            value={connDesc}
            onChange={e => setConnDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateConnection}
              disabled={!connName.trim() || creating}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-lg transition font-medium"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Create
            </button>
            <button onClick={() => setShowCreateConn(false)} className="text-xs text-slate-400 hover:text-white px-3 py-2 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* File grid */}
      {files.length === 0 && !uploading ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
          No files yet. Upload some to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {files.map(file => (
            <FileCard
              key={file.id}
              file={file}
              selected={selectedFileIds.has(file.id)}
              onSelect={() => onSelect(file.id)}
              onDelete={() => onDelete(file.id)}
              onPreview={() => onPreview(file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
  file, selected, onSelect, onDelete, onPreview,
}: {
  file: EnterpriseFile;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const size = file.size < 1024 * 1024
    ? `${(file.size / 1024).toFixed(1)}KB`
    : `${(file.size / (1024 * 1024)).toFixed(1)}MB`;

  const date = new Date(file.created_at * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
  });

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer group ${
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onSelect(); }}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
          selected ? 'border-blue-500 bg-blue-500' : 'border-slate-600 hover:border-slate-400'
        }`}
      >
        {selected && <Check size={11} className="text-white" />}
      </button>

      {/* Icon */}
      <div className="flex-shrink-0">
        <FileTypeIcon type={file.file_type} size={18} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <p className="text-sm text-white font-medium truncate">{file.original_name}</p>
        <p className="text-xs text-slate-500">{size} · {file.file_type} · {date}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={e => { e.stopPropagation(); onPreview(); }}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          title="Preview"
        >
          <Eye size={13} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Connections Tab ──────────────────────────────────────────────────────────

interface ConnectionsTabProps {
  connections: Connection[];
  files: EnterpriseFile[];
  workspaceId: string;
  onAnalysisComplete: (result: string, id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}

function ConnectionsTab({ connections, files, workspaceId, onAnalysisComplete, onDelete, onRefresh }: ConnectionsTabProps) {
  if (!connections.length) {
    return (
      <div className="text-center py-10 text-slate-500">
        <Link2 size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No connections yet.</p>
        <p className="text-xs mt-1">Select files in the Files tab and click "Connect" to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{connections.length} connection{connections.length !== 1 ? 's' : ''}</span>
        <button onClick={onRefresh} className="text-slate-500 hover:text-white transition p-1">
          <RefreshCw size={13} />
        </button>
      </div>
      {connections.map(conn => (
        <ConnectionCard
          key={conn.id}
          connection={conn}
          files={files}
          onAnalysisComplete={onAnalysisComplete}
          onDelete={() => onDelete(conn.id)}
        />
      ))}
    </div>
  );
}

// ─── Connection Card ──────────────────────────────────────────────────────────

function ConnectionCard({
  connection, files, onAnalysisComplete, onDelete,
}: {
  connection: Connection;
  files: EnterpriseFile[];
  onAnalysisComplete: (result: string, id: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedFiles = files.filter(f => connection.file_ids?.includes(f.id));

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await ConnectorAPI.analyze(connection.id, prompt, provider);
      setResult(res.result);
      onAnalysisComplete(res.result, res.analysisId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/50 transition"
        onClick={() => setExpanded(v => !v)}
      >
        <Link2 size={15} className="text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{connection.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {connection.file_ids?.length || 0} files connected
            {connection.description ? ` · ${connection.description}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-slate-500 hover:text-red-400 rounded transition"
          >
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          {/* Connected files */}
          <div>
            <p className="text-xs text-slate-400 font-medium mb-2">Connected Files</p>
            <div className="space-y-1.5">
              {connectedFiles.map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <FileTypeIcon type={f.file_type} size={12} />
                  <span className="truncate">{f.original_name}</span>
                  <span className="text-slate-500 ml-auto">{(f.size / 1024).toFixed(0)}KB</span>
                </div>
              ))}
              {connectedFiles.length === 0 && (
                <p className="text-xs text-slate-500">No files found. They may have been deleted.</p>
              )}
            </div>
          </div>

          {/* Analysis prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 font-medium">AI Analysis</p>
              <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                {(['gemini', 'openai'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={`text-[10px] px-2 py-1 rounded font-medium transition ${
                      provider === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p === 'gemini' ? 'Gemini' : 'GPT-4o'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="What would you like to know? (e.g. 'Summarize all files and identify key themes', 'Find bugs in the code', 'Compare these documents')"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            <button
              onClick={handleAnalyze}
              disabled={analyzing || connectedFiles.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition"
            >
              {analyzing ? (
                <><Loader2 size={15} className="animate-spin" /> Analyzing {connectedFiles.length} files...</>
              ) : (
                <><Zap size={15} /> Analyze with AI</>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-blue-400" />
                <span className="text-xs font-semibold text-slate-300">AI Analysis Result</span>
                <span className="text-xs text-slate-500 ml-auto">{connectedFiles.length} files analyzed</span>
              </div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ workspaceId }: { workspaceId: string }) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    import('../../services/api').then(({ AnalysisAPI }) => {
      AnalysisAPI.list(workspaceId)
        .then(res => setAnalyses(res.analyses))
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [workspaceId]);

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 size={20} className="animate-spin text-blue-400" />
    </div>
  );

  if (!analyses.length) return (
    <div className="text-center py-10 text-slate-500">
      <FileSearch size={32} className="mx-auto mb-3 opacity-30" />
      <p className="text-sm">No analyses yet.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {analyses.map(a => {
        const date = new Date(a.created_at * 1000).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const isOpen = expanded === a.id;
        const fileCount = a.file_ids?.length || 0;

        return (
          <div key={a.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/50 transition text-left"
              onClick={() => setExpanded(isOpen ? null : a.id)}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                a.status === 'completed' ? 'bg-green-400' : a.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{a.prompt || '(no prompt)'}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{date} · {fileCount} file{fileCount !== 1 ? 's' : ''} · {a.provider}</p>
              </div>
              {isOpen ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
            </button>
            {isOpen && a.result && (
              <div className="border-t border-slate-700 p-4">
                <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{a.result}</pre>
              </div>
            )}
            {isOpen && !a.result && (
              <div className="border-t border-slate-700 p-4 text-xs text-slate-500">No result available.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
