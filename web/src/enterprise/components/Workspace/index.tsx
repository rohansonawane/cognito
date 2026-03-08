/**
 * Workspace Manager — lets users switch between workspaces and see stats.
 */

import React, { useState } from 'react';
import { Building2, Plus, ChevronDown, Check, Users, Folder, Zap, Trash2, Settings, Loader2 } from 'lucide-react';
import type { Workspace, User } from '../../types';
import { WorkspaceAPI } from '../../services/api';

interface WorkspaceManagerProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  user: User;
  onSwitch: (workspace: Workspace) => void;
  onRefresh: () => void;
}

export function WorkspaceManager({ workspaces, currentWorkspace, user, onSwitch, onRefresh }: WorkspaceManagerProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await WorkspaceAPI.create(name.trim(), description.trim());
      onRefresh();
      onSwitch(res.workspace);
      setOpen(false);
      setShowCreate(false);
      setName('');
      setDescription('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    if (ws.owner_id !== user.id) return;
    if (!confirm(`Delete workspace "${ws.name}"? This will permanently delete all files and connections.`)) return;
    try {
      await WorkspaceAPI.delete(ws.id);
      onRefresh();
      if (currentWorkspace?.id === ws.id) {
        const remaining = workspaces.filter(w => w.id !== ws.id);
        if (remaining.length) onSwitch(remaining[0]);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-3 py-2 transition w-full"
      >
        <Building2 size={15} className="text-blue-400 flex-shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-semibold text-white truncate">
            {currentWorkspace?.name || 'Select Workspace'}
          </p>
          <p className="text-[10px] text-slate-500">{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</p>
        </div>
        <ChevronDown size={13} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="py-1">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => { onSwitch(ws); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700 transition text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{ws.name}</p>
                  {ws.description && <p className="text-[10px] text-slate-500 truncate">{ws.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {ws.id === currentWorkspace?.id && <Check size={13} className="text-blue-400" />}
                  {ws.owner_id === user.id && (
                    <button
                      onClick={e => handleDelete(ws, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Create new */}
          <div className="border-t border-slate-700 p-3 space-y-2">
            {!showCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-2 text-xs text-slate-400 hover:text-white py-2 transition"
              >
                <Plus size={13} /> New Workspace
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Workspace name"
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!name.trim() || creating}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    Create
                  </button>
                  <button onClick={() => setShowCreate(false)} className="text-xs text-slate-400 hover:text-white transition px-2">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Workspace stats card ─────────────────────────────────────────────────────

interface WorkspaceStatsProps {
  stats: { files: number; connections: number; analyses: number };
}

export function WorkspaceStats({ stats }: WorkspaceStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Files', value: stats.files, icon: Folder, color: 'text-blue-400' },
        { label: 'Connections', value: stats.connections, icon: Settings, color: 'text-purple-400' },
        { label: 'Analyses', value: stats.analyses, icon: Zap, color: 'text-green-400' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
          <Icon size={16} className={`${color} mx-auto mb-1`} />
          <p className="text-lg font-bold text-white">{value}</p>
          <p className="text-[10px] text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}
