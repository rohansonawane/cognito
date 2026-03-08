/**
 * Cognito Enterprise App
 * Main application shell that integrates:
 * - Authentication
 * - Workspace management
 * - File Connector
 * - AI Canvas (original feature)
 * - Analysis results panel
 */

import React, { useState, useEffect } from 'react';
import {
  LogOut, User, Building2, PenLine, Link2, ChevronRight,
  Sparkles, X, Moon, Sun,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { AuthPanel } from './components/Auth';
import { FileConnector } from './components/FileConnector';
import { WorkspaceManager, WorkspaceStats } from './components/Workspace';
import { WorkspaceAPI } from './services/api';
import type { Workspace } from './types';

type View = 'canvas' | 'connector';

interface EnterpriseAppProps {
  /** Called when user wants to go back to the original canvas view */
  onCanvasMode?: () => void;
}

export function EnterpriseApp({ onCanvasMode }: EnterpriseAppProps) {
  const auth = useAuth();
  const [view, setView] = useState<View>('connector');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [workspaceStats, setWorkspaceStats] = useState({ files: 0, connections: 0, analyses: 0 });
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (auth.currentWorkspace) {
      WorkspaceAPI.get(auth.currentWorkspace.id).then(res => {
        setWorkspaceStats(res.stats);
      }).catch(() => {});
    }
  }, [auth.currentWorkspace]);

  // ─── Not authenticated ──────────────────────────────────────────────────────

  if (!auth.isAuthenticated) {
    return (
      <AuthPanel
        onLogin={auth.login}
        onRegister={auth.register}
        loading={auth.loading}
        error={auth.error}
        onClearError={auth.clearError}
      />
    );
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (!auth.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  const ws = auth.currentWorkspace;

  return (
    <div className={`flex h-screen ${darkMode ? 'bg-slate-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-72 flex flex-col border-r border-slate-800 bg-slate-900 flex-shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-slate-800">
          <Building2 size={20} className="text-blue-400" />
          <span className="font-bold text-white text-lg tracking-tight">Cognito</span>
          <span className="text-[10px] font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/30 rounded px-1.5 py-0.5 ml-1">Enterprise</span>
          <button onClick={() => setDarkMode(v => !v)} className="ml-auto text-slate-500 hover:text-white transition">
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {auth.user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{auth.user.name}</p>
            <p className="text-xs text-slate-500 truncate">{auth.user.email}</p>
          </div>
          <button
            onClick={auth.logout}
            className="text-slate-500 hover:text-red-400 transition p-1"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>

        {/* Workspace selector */}
        <div className="px-3 py-3 border-b border-slate-800">
          <WorkspaceManager
            workspaces={auth.workspaces}
            currentWorkspace={auth.currentWorkspace}
            user={auth.user}
            onSwitch={auth.setCurrentWorkspace}
            onRefresh={auth.refreshWorkspaces}
          />
        </div>

        {/* Workspace stats */}
        {ws && (
          <div className="px-3 py-3 border-b border-slate-800">
            <WorkspaceStats stats={workspaceStats} />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider px-2 mb-2">Views</p>
          {([
            ['connector', 'File Connector', Link2, 'Upload & connect files for AI analysis'],
            ['canvas', 'AI Whiteboard', PenLine, 'Draw and analyze on canvas'],
          ] as [View, string, typeof Link2, string][]).map(([id, label, Icon, desc]) => (
            <button
              key={id}
              onClick={() => id === 'canvas' ? onCanvasMode?.() : setView(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left group ${
                view === id && id !== 'canvas'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={15} className={view === id && id !== 'canvas' ? 'text-white' : ''} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className={`text-[10px] truncate ${view === id && id !== 'canvas' ? 'text-blue-200' : 'text-slate-600'}`}>{desc}</p>
              </div>
              {id === 'canvas' && <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400" />}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-600">Cognito Enterprise v2.0</p>
        </div>
      </aside>

      {/* ─── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
          <div>
            <h1 className="text-base font-semibold text-white">
              {view === 'connector' ? 'File Connector' : 'AI Whiteboard'}
            </h1>
            {ws && <p className="text-xs text-slate-500">{ws.name}</p>}
          </div>

          {view === 'connector' && (
            <div className="ml-auto flex items-center gap-2">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Sparkles size={12} className="text-blue-400" />
                Multi-modal AI · Connect any file type
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {!ws ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Select or create a workspace to get started.
            </div>
          ) : view === 'connector' ? (
            <div className="flex gap-6 h-full">
              {/* File Connector */}
              <div className="flex-1 min-w-0">
                <FileConnector
                  workspaceId={ws.id}
                  onAnalysisComplete={(result, id) => {
                    setAnalysisResult(result);
                    // Refresh stats
                    WorkspaceAPI.get(ws.id).then(r => setWorkspaceStats(r.stats)).catch(() => {});
                  }}
                />
              </div>

              {/* Analysis result panel */}
              {analysisResult && (
                <div className="w-96 flex-shrink-0 flex flex-col">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-400" />
                        <span className="text-sm font-semibold text-white">Latest Analysis</span>
                      </div>
                      <button
                        onClick={() => setAnalysisResult(null)}
                        className="text-slate-500 hover:text-white transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">
                        {analysisResult}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
