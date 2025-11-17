import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CanvasBoard, CanvasBoardRef, HistorySnapshot, type BrushKind, type CanvasTextField } from './components/CanvasBoard';
import { analyze } from './ai/api';
import logoImage from './assets/Logo.png';
import {
  Undo2,
  Redo2,
  Eraser,
  PenLine,
  Download as DownloadIcon,
  Save,
  Image as ImageIcon,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  History,
  Sun,
  Moon,
  Send,
  Save as SaveIcon,
  Grid as GridIcon,
  Sparkles,
  ChevronDown,
  ArrowUpRight,
  ArrowLeftRight,
  Github,
  Linkedin,
  Mail,
  Globe,
  Slash,
  Square,
  Circle,
  Triangle as TriangleIcon,
  Diamond as DiamondIcon,
  Hexagon as HexagonIcon,
  Type,
} from 'lucide-react';
import { ColorPicker } from './components/ColorPicker';
import { SizeControl } from './components/SizeControl';

const KNOWN_AI_LABELS = new Set(['Title', 'What I see', 'Details', 'Steps', 'Answer', 'Tips/Next']);

type ParsedAiSection = {
  label: string;
  slug: string;
  items: string[];
  isList: boolean;
};

function normalizeSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function parseAiResponse(text: string): ParsedAiSection[] {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const sections: ParsedAiSection[] = [];
  let current: ParsedAiSection | null = null;
  let matchedAnySection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z][A-Za-z\/ ]+):\s*(.*)$/);
    if (match) {
      const [ , labelRaw, rest ] = match;
      const label = labelRaw.trim();
      if (KNOWN_AI_LABELS.has(label)) {
        matchedAnySection = true;
        current = {
          label,
          slug: normalizeSlug(label),
          items: rest ? [rest.trim()] : [],
          isList: false,
        };
        sections.push(current);
        continue;
      }
    }
    if (current) {
      current.items.push(line);
    }
  }

  if (!matchedAnySection) return [];

  sections.forEach((section) => {
    const listPattern = /^([-•]\s*|\d+[\.\)]\s*)/;
    const isList = section.items.length > 1 && section.items.every((item) => listPattern.test(item));
    section.isList = isList;
    if (isList) {
      section.items = section.items.map((item) => item.replace(listPattern, '').trim());
    }
  });

  return sections;
}

type Provider = 'openai' | 'gemini';

export default function App() {
  const boardRef = useRef<CanvasBoardRef>(null);
  const TEXT_FIELD_WIDTH_MIN = 80;
  const TEXT_FIELD_WIDTH_MAX = 800;
  const TEXT_FIELD_HEIGHT_MIN = 40;
  const TEXT_FIELD_HEIGHT_MAX = 600;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const [brush, setBrush] = useState<BrushKind>('brush');
  const [size, setSize] = useState(8);
  const [color, setColor] = useState('#FFFFFF');
  const [aiText, setAiText] = useState('Draw something and press "Ask AI".');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiBorderActive, setAiBorderActive] = useState(false);
  const borderTimer = React.useRef<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [askClicked, setAskClicked] = useState(false);
  const [provider, setProvider] = useState<Provider>('openai');
  const [showAbout, setShowAbout] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const howWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const canvasWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'tools' | 'brush' | 'color' | 'size' | null>('tools');
  const [historyTimeline, setHistoryTimeline] = useState<HistorySnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLabel, setHistoryLabel] = useState('');
  const [showGrid, setShowGrid] = useState(false);
  const [activeHowCard, setActiveHowCard] = useState<string>('quick');
  const [selectedTextField, setSelectedTextField] = useState<CanvasTextField | null>(null);
  const currentYear = new Date().getFullYear();
  type BrushOption = {
    key: BrushKind;
    label: string;
    Icon?: React.ComponentType<{ size?: number }>;
    glyph?: string;
  };
  const brushOptions = useMemo<BrushOption[]>(
    () => [
      { key: 'brush', label: 'Brush', Icon: PenLine },
      { key: 'eraser', label: 'Eraser', Icon: Eraser },
      { key: 'line', label: 'Line', glyph: '／' },
      { key: 'rect', label: 'Rectangle', glyph: '▭' },
      { key: 'ellipse', label: 'Ellipse', glyph: '◯' },
      { key: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
      { key: 'double-arrow', label: 'Double Arrow', Icon: ArrowLeftRight },
      { key: 'triangle', label: 'Triangle', Icon: TriangleIcon },
      { key: 'diamond', label: 'Diamond', Icon: DiamondIcon },
      { key: 'hexagon', label: 'Hexagon', Icon: HexagonIcon },
      { key: 'text', label: 'Text', Icon: Type },
    ],
    []
  );
  const howSections = useMemo(() => [
    {
      id: 'quick',
      title: 'Quick Start',
      icon: PenLine,
      type: 'ol' as const,
      items: [
        'Pick a brush, color, and stroke size from the left rail.',
        'Sketch freely or drag images onto the canvas to annotate.',
        'Zoom with the top-right controls; right-click drag to pan when zoomed.',
        'Toggle the grid from Tools → Grid if you need alignment guides.',
        (
          <>
            <span className="how-inline-icon"><Send size={14} /></span>
            <span className="how-text">Press the floating Ask AI button with an optional prompt.</span>
          </>
        ),
        'Review the response, then save snapshots or export a PNG.'
      ]
    },
    {
      id: 'toolbelt',
      title: 'Toolbelt',
      icon: GridIcon,
      type: 'ul' as const,
      items: [
        (
          <>
            <span className="how-inline-icon"><Undo2 size={14} /></span>
            <span className="how-text">Undo / Redo – walk the timeline of your board.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><Save size={14} /></span>
            <span className="how-text">Save / Download – keep local snapshots or export PNG.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><ImageIcon size={14} /></span>
            <span className="how-text">Add Image – drop screenshots or reference photos.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><Trash2 size={14} /></span>
            <span className="how-text">Clear – wipes the canvas (a “Cleared” history entry is saved).</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><PenLine size={14} /></span>
            <span className="how-text">Brushes – brush, eraser, line, rectangle, ellipse.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><PenLine size={14} /></span>
            <span className="how-text">Size &amp; Color – fine-tune stroke weight and palette.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><GridIcon size={14} /></span>
            <span className="how-text">Grid – toggle guides and adjust spacing for layouts.</span>
          </>
        ),
      ]
    },
    {
      id: 'flow',
      title: 'Canvas Flow',
      icon: History,
      type: 'ul' as const,
      items: [
        (
          <>
            <span className="how-inline-icon"><History size={14} /></span>
            <span className="how-text">History popover – name snapshots and jump to any checkpoint.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><ZoomIn size={14} /></span>
            <span className="how-text">Zoom overlay – zoom out/in or reset instantly.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><Send size={14} /></span>
            <span className="how-text">Floating Ask AI – accessible while sketching.</span>
          </>
        ),
        'Keys: Space = pan, ⌘/Ctrl+Z = undo, ⌘/Ctrl+Shift+Z = redo.'
      ]
    },
    {
      id: 'assistant',
      title: 'AI Assistant',
      icon: Sparkles,
      type: 'ol' as const,
      items: [
        <span className="how-text">Select OpenAI or Gemini from the header drop-down.</span>,
        'Type a focused prompt (e.g., “Summarize this UI” or “Solve the integral step-by-step”).',
        'Review the structured response: Title, What I see, Details, Steps, Answer, Tips.',
        'Use the copy icon to paste the results into docs, Slack, or email.'
      ]
    },
    {
      id: 'pro',
      title: 'Pro Tips',
      icon: Sparkles,
      type: 'ol' as const,
      items: [
        <span className="how-text">Create named snapshots before major edits to branch ideas safely.</span>,
        'Pair the grid with history for pixel-perfect UI layouts or math proof checkpoints.',
        'Keep imported images under a few MB for the fastest AI turnarounds.',
        'Resend the same board to reuse cached responses instantly.'
      ]
    },
  ], []);
  useEffect(() => {
  }, [showGrid]);
  useEffect(() => {
    if (showHow) {
      setActiveHowCard('quick');
    }
  }, [showHow]);
  const parsedAiSections = useMemo(() => parseAiResponse(aiText), [aiText]);
  const techStack = useMemo(
    () => [
      {
        name: 'React',
        slug: 'react',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <g stroke="#61DAFB" strokeWidth="14" fill="none" strokeLinecap="round">
              <ellipse cx="128" cy="128" rx="88" ry="36" />
              <ellipse cx="128" cy="128" rx="88" ry="36" transform="rotate(60 128 128)" />
              <ellipse cx="128" cy="128" rx="88" ry="36" transform="rotate(-60 128 128)" />
            </g>
            <circle cx="128" cy="128" r="20" fill="#61DAFB" />
          </svg>
        ),
      },
      {
        name: 'TypeScript',
        slug: 'typescript',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <rect width="256" height="256" rx="44" fill="#3178C6" />
            <text
              x="128"
              y="170"
              textAnchor="middle"
              fontSize="130"
              fontWeight="700"
              fontFamily="'Inter', 'Segoe UI', sans-serif"
              fill="#ffffff"
            >
              TS
            </text>
          </svg>
        ),
      },
      {
        name: 'Vite',
        slug: 'vite',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="vite-flame" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFEA83" />
                <stop offset="50%" stopColor="#FFDD35" />
                <stop offset="100%" stopColor="#FFA800" />
              </linearGradient>
              <linearGradient id="vite-base" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#646CFF" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <path
              d="M94 16c30 64 48 110 53 138 5 29-3 52-23 74 74-30 109-87 112-169-46 9-94 0-142-43Z"
              fill="url(#vite-flame)"
            />
            <path
              d="M30 40c6 103 51 170 134 202-32-31-43-70-32-118 11-48 43-82 97-101C170 17 116 16 62 26 51 28 40 33 30 40Z"
              fill="url(#vite-base)"
            />
          </svg>
        ),
      },
      {
        name: 'Tailwind CSS',
        slug: 'tailwind',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <path
              d="M128 72c-36 0-58 18-66 53 13-18 29-26 48-24 10 1 18 6 27 13 13 10 28 15 44 15 36 0 58-18 66-53-13 18-29 26-48 24-10-1-18-6-27-13-13-10-28-15-44-15Zm-66 59c-36 0-58 18-66 53 13-18 29-26 48-24 10 1 18 6 27 13 13 10 28 15 44 15 36 0 58-18 66-53-13 18-29 26-48 24-10-1-18-6-27-13-13-10-28-15-44-15Z"
              fill="#38BDF8"
            />
          </svg>
        ),
      },
      {
        name: 'Express.js',
        slug: 'express',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <rect width="256" height="256" rx="44" fill="#1F2933" />
            <text
              x="128"
              y="160"
              textAnchor="middle"
              fontSize="96"
              fontWeight="600"
              fontFamily="'Inter', 'Segoe UI', sans-serif"
              fill="#ffffff"
            >
              ex
            </text>
          </svg>
        ),
      },
      {
        name: 'OpenAI',
        slug: 'openai',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <path
              d="M128 28c-30 0-56 17-68 42-24 4-40 24-40 48 0 12 4 23 12 32a52 52 0 0 0 44 84c7-18 16-32 32-40 16 8 25 22 32 40a52 52 0 0 0 44-84 52 52 0 0 0-44-84c-10-24-34-38-56-38Zm0 24c14 0 30 10 36 26l4 10 10-2c18-2 34 12 34 32 0 8-2 16-8 22l-7 7 5 9c8 14 5 32-7 43a28 28 0 0 1-41 0l-7-7-9 5c-4 2-7 4-10 7-3-3-6-5-10-7l-9-5-7 7a28 28 0 0 1-41 0 28 28 0 0 1 0-41l7-7-5-9c-3-6-4-13-4-20 3-16 16-27 32-27l10 2 4-10c6-16 22-26 36-26Z"
              fill="#10A37F"
            />
          </svg>
        ),
      },
      {
        name: 'Google Gemini',
        slug: 'gemini',
        icon: (
          <svg viewBox="0 0 256 256" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4285F4" />
                <stop offset="50%" stopColor="#9C27B0" />
                <stop offset="100%" stopColor="#FF4081" />
              </linearGradient>
            </defs>
            <path
              d="M128 28a68 68 0 0 0-68 68v64a68 68 0 0 0 136 0V96a68 68 0 0 0-68-68Zm0 24a44 44 0 0 1 44 44v64a44 44 0 0 1-88 0V96a44 44 0 0 1 44-44Z"
              fill="url(#gemini-gradient)"
            />
          </svg>
        ),
      },
    ],
    []
  );
  const integrationUseCases = useMemo(
    () => [
      { icon: '🖍️', title: 'AI Whiteboard', blurb: 'Brainstorm, sketch, and get real-time summaries and math derivations.' },
      { icon: '📝', title: 'Smart Notes', blurb: 'Auto-capture meeting minutes or lecture notes with export-ready snapshots.' },
      { icon: '🎓', title: 'LMS Companion', blurb: 'Embed Cognito in courseware to give students instant visual feedback.' },
      { icon: '⚙️', title: 'Platform Add-on', blurb: 'Extend your product or OS with AI-powered diagramming and review.' },
    ],
    []
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const set = () => setIsMobile(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  // multipage boards (vector)
  const [pages, setPages] = useState<{ id: string; name: string; strokes: string }[]>([
    { id: 'p1', name: 'Page 1', strokes: '[]' },
  ]);
  const [pageIndex, setPageIndex] = useState(0);

  function saveCurrentPage() {
    try {
      const strokes = boardRef.current?.getStrokesJSON?.() || '[]';
      setPages((prev) => prev.map((p, i) => (i === pageIndex ? { ...p, strokes } : p)));
    } catch {}
  }
  function loadPage(i: number) {
    const p = pages[i]; if (!p) return;
    try { boardRef.current?.setStrokesJSON?.(p.strokes || '[]'); } catch {}
  }
  function go(delta: number) {
    saveCurrentPage();
    setPageIndex((i) => {
      const ni = Math.max(0, Math.min(pages.length - 1, i + delta));
      setTimeout(() => loadPage(ni), 0);
      return ni;
    });
  }
  function addPage() {
    saveCurrentPage();
    const id = `p${Date.now()}`;
    setPages((prev) => [...prev, { id, name: `Page ${prev.length + 1}`, strokes: '[]' }]);
    const ni = pages.length;
    setPageIndex(ni);
    setTimeout(() => loadPage(ni), 0);
  }

  const handleHistoryUpdate = React.useCallback((timeline: HistorySnapshot[]) => {
    setHistoryTimeline(timeline);
  }, []);

  const toggleHistory = React.useCallback(() => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next) {
        const snapshot = boardRef.current?.getHistoryTimeline?.();
        if (snapshot) setHistoryTimeline(snapshot);
      }
      return next;
    });
  }, []);

  function onJumpToHistory(entryId: string) {
    boardRef.current?.jumpToHistory?.(entryId);
  }

  function onCreateHistorySnapshot() {
    const raw = historyLabel.trim();
    const fallback = `Snapshot ${historyTimeline.length + 1}`;
    boardRef.current?.createHistorySnapshot?.(raw || fallback);
    setHistoryLabel('');
  }

  function onDeleteHistory(entryId: string) {
    boardRef.current?.deleteHistorySnapshot?.(entryId);
  }

  const onHistoryInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCreateHistorySnapshot();
    }
  };

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    try { window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } })); } catch {}
  }, [theme]);

  const colors = useMemo(
    () => ['#FFFFFF', '#000000', '#00F0C8', '#00C2A8', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9'],
    []
  );

  const handleTextFieldChange = React.useCallback((field: CanvasTextField | null) => {
    setSelectedTextField(field);
  }, []);

  const handleWidthSliderChange = (value: number) => {
    const clampedValue = clamp(value, TEXT_FIELD_WIDTH_MIN, TEXT_FIELD_WIDTH_MAX);
    boardRef.current?.resizeSelectedTextField?.({ width: clampedValue });
  };

  const handleWidthSliderCommit = () => {
    if (!selectedTextField) return;
    const clampedValue = clamp(selectedTextField.width, TEXT_FIELD_WIDTH_MIN, TEXT_FIELD_WIDTH_MAX);
    boardRef.current?.resizeSelectedTextField?.({ width: clampedValue }, { commit: true });
  };

  const handleHeightSliderChange = (value: number) => {
    const clampedValue = clamp(value, TEXT_FIELD_HEIGHT_MIN, TEXT_FIELD_HEIGHT_MAX);
    boardRef.current?.resizeSelectedTextField?.({ height: clampedValue });
  };

  const handleHeightSliderCommit = () => {
    if (!selectedTextField) return;
    const clampedValue = clamp(selectedTextField.height, TEXT_FIELD_HEIGHT_MIN, TEXT_FIELD_HEIGHT_MAX);
    boardRef.current?.resizeSelectedTextField?.({ height: clampedValue }, { commit: true });
  };

  async function onAnalyze() {
    // client-side soft quota: 10 requests / 24h per browser
    try {
      const raw = localStorage.getItem('ASK_META');
      const meta = raw ? JSON.parse(raw) : { count: 0, resetAt: Date.now() + 24*60*60*1000 };
      if (Date.now() > (meta.resetAt || 0)) { meta.count = 0; meta.resetAt = Date.now() + 24*60*60*1000; }
      if (meta.count >= 10) { setShowLimit(true); return; }
      localStorage.setItem('ASK_META', JSON.stringify({ ...meta, count: meta.count + 1 }));
    } catch {}
    const dataUrl = boardRef.current?.exportPng();
    if (!dataUrl) return;
    setIsAnalyzing(true);
    setAskClicked(true);
    window.setTimeout(() => setAskClicked(false), 600);
    setAiBorderActive(true);
    if (borderTimer.current) { window.clearTimeout(borderTimer.current); borderTimer.current = null; }
    setAiText('Analyzing...');
    const res = await analyze({ image: dataUrl, provider, prompt: promptText || undefined });
    if (!res.ok) {
      setAiText(res.error || 'Failed to analyze.');
      setIsAnalyzing(false);
      borderTimer.current = window.setTimeout(() => { setAiBorderActive(false); borderTimer.current = null; }, 3000);
      if ((res.error || '').includes('429')) setShowLimit(true);
      return;
    }
    setAiText(res.message || 'Done.');
    setIsAnalyzing(false);
    borderTimer.current = window.setTimeout(() => { setAiBorderActive(false); borderTimer.current = null; }, 3000);
  }

  function onDownload() {
    const dataUrl = boardRef.current?.exportPng();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `canvas-${Date.now()}.png`;
    a.click();
  }

  function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') boardRef.current?.loadImage(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div id="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark"><img src={logoImage} alt="Cognito logo" /></div>
          </div>
          {isMobile ? (
            <div className="header-actions" style={{ display:'flex', gap:8 }}>
              <button className="btn" title="Toggle theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="icon-btn" aria-label="Menu" onClick={() => setShowMobileMenu(v=>!v)}>
                ☰
              </button>
            </div>
          ) : (
            <div className="header-actions">
              <div className="btn-popover" ref={howWrapRef}>
                <button className={`btn`} onClick={() => setShowHow(v=>!v)}>How to use</button>
                {showHow && null}
              </div>
              <select className="btn" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
              <button className="btn" title="Toggle theme" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <a className="btn feedback" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer">Feedback</a>
            </div>
          )}
        </div>
        {isMobile && showMobileMenu && (
          <div className="app-mobile-menu">
            <button className="btn" onClick={() => { setShowHow(true); setShowMobileMenu(false); }}>How to use</button>
            <select className="btn" value={provider} onChange={(e) => { setProvider(e.target.value as Provider); setShowMobileMenu(false); }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
            <a className="btn" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer" onClick={() => setShowMobileMenu(false)}>Feedback</a>
          </div>
        )}
      </header>

      <main className="app-main">
        <aside className={`tools`}>
          {isMobile ? (
            <div style={{ width:'100%' }}>
              <div className="mobile-tabs" style={{ display:'flex', gap:8, justifyContent:'center' }}>
                {(['tools','brush','color','size'] as const).map(tab => (
                  <button
                    key={tab}
                    className={`btn ${activeMobilePanel===tab?'primary':''}`}
                    onClick={() => setActiveMobilePanel(p => p===tab ? null : tab)}
                    style={{ padding:'6px 10px' }}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              {activeMobilePanel==='tools' && (
                <div className="mobile-panel" style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap', justifyContent:'center' }}>
                  <button className="icon-btn" title="Undo" onClick={() => boardRef.current?.undo()}><Undo2 size={16} /></button>
                  <button className="icon-btn" title="Redo" onClick={() => boardRef.current?.redo()}><Redo2 size={16} /></button>
                  <button className={`icon-btn ${showHistory ? 'active' : ''}`} title="History" onClick={toggleHistory}><History size={16} /></button>
                  <button className="icon-btn" title="Save" onClick={() => boardRef.current?.saveBoard?.()}><Save size={16} /></button>
                  <button className="icon-btn" title="Download" onClick={onDownload}><DownloadIcon size={16} /></button>
                  <label className="icon-btn" title="Add Image">
                    <ImageIcon size={16} />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickImage(e.target.files)} />
                  </label>
                  <button className="icon-btn" title="Clear Canvas" onClick={() => boardRef.current?.clear()}><Trash2 size={16} /></button>
                  <button
                    className={`icon-btn ${showGrid ? 'active' : ''}`}
                    title={showGrid ? 'Hide grid' : 'Show grid'}
                    onClick={() => setShowGrid((v) => !v)}
                  >
                    <GridIcon size={16} />
                  </button>
                </div>
              )}
              {activeMobilePanel==='brush' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', justifyContent:'center' }}>
                  <div className="segmented brush-grid mobile-brush-grid">
                    {brushOptions.map(({ key, Icon, glyph, label }) => (
                      <button
                        key={key}
                        className={`segmented-item ${brush===key?'active':''}`}
                        onClick={() => setBrush(key)}
                        title={label}
                      >
                        {Icon ? <Icon size={16} /> : <span className="shape-glyph">{glyph}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activeMobilePanel==='color' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ColorPicker value={color} onChange={setColor} swatches={colors} inline={true} />
                </div>
              )}
              {activeMobilePanel==='size' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <label className="tool-label">Size <span id="size-value">{size}</span>px</label>
                  <SizeControl value={size} onChange={(n) => setSize(n)} min={1} max={64} />
                  {(brush === 'text' || selectedTextField) && (
                    <div style={{ width: '100%', marginTop:12 }}>
                      {selectedTextField ? (
                        <>
                          <div className="text-size-control">
                            <div className="text-size-meta">
                              <span>Width</span>
                              <span>{Math.round(selectedTextField.width)} px</span>
                            </div>
                            <input
                              type="range"
                              min={TEXT_FIELD_WIDTH_MIN}
                              max={TEXT_FIELD_WIDTH_MAX}
                              value={clamp(Math.round(selectedTextField.width), TEXT_FIELD_WIDTH_MIN, TEXT_FIELD_WIDTH_MAX)}
                              onChange={(e) => handleWidthSliderChange(Number(e.target.value))}
                              onMouseUp={handleWidthSliderCommit}
                              onTouchEnd={handleWidthSliderCommit}
                              className="size-slider"
                            />
                          </div>
                          <div className="text-size-control">
                            <div className="text-size-meta">
                              <span>Height</span>
                              <span>{Math.round(selectedTextField.height)} px</span>
                            </div>
                            <input
                              type="range"
                              min={TEXT_FIELD_HEIGHT_MIN}
                              max={TEXT_FIELD_HEIGHT_MAX}
                              value={clamp(Math.round(selectedTextField.height), TEXT_FIELD_HEIGHT_MIN, TEXT_FIELD_HEIGHT_MAX)}
                              onChange={(e) => handleHeightSliderChange(Number(e.target.value))}
                              onMouseUp={handleHeightSliderCommit}
                              onTouchEnd={handleHeightSliderCommit}
                              className="size-slider"
                            />
                          </div>
                        </>
                      ) : (
                        <p className="tool-hint" style={{ textAlign:'center' }}>Select a text field to adjust its width and height.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="tool-group">
                <label className="tool-label">Tools</label>
                <div className="icon-row">
                  <button className="icon-btn" title="Undo" data-tooltip="Undo" onClick={() => boardRef.current?.undo()}><Undo2 size={16} /></button>
                  <button className="icon-btn" title="Redo" data-tooltip="Redo" onClick={() => boardRef.current?.redo()}><Redo2 size={16} /></button>
                  <button className={`icon-btn ${showHistory ? 'active' : ''}`} title="History" data-tooltip="History" onClick={toggleHistory}><History size={16} /></button>
                  <button className="icon-btn" title="Save" data-tooltip="Save" onClick={() => boardRef.current?.saveBoard?.()}><Save size={16} /></button>
                  <button className="icon-btn" title="Download" data-tooltip="Download" onClick={onDownload}><DownloadIcon size={16} /></button>
                  <label className="icon-btn" title="Add Image" data-tooltip="Add Image">
                    <ImageIcon size={16} />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickImage(e.target.files)} />
                  </label>
                  <button className="icon-btn" title="Clear Canvas" data-tooltip="Clear Canvas" onClick={() => boardRef.current?.clear()}><Trash2 size={16} /></button>
                  <button
                    className={`icon-btn ${showGrid ? 'active' : ''}`}
                    title={showGrid ? 'Hide grid' : 'Show grid'}
                    data-tooltip={showGrid ? 'Hide grid' : 'Show grid'}
                    onClick={() => setShowGrid((v) => !v)}
                  >
                    <GridIcon size={16} />
                  </button>
                </div>
              </div>
              <div className="tool-group">
                <label className="tool-label">Brush &amp; Shapes</label>
                <div className="segmented brush-grid">
                  {brushOptions.map(({ key, Icon, glyph, label }) => (
                    <button
                      key={key}
                      className={`segmented-item ${brush===key?'active':''}`}
                      onClick={() => setBrush(key)}
                      title={label}
                      data-tooltip={label}
                    >
                      {Icon ? <Icon size={16} /> : <span className="shape-glyph">{glyph}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tool-group">
                <label className="tool-label">Color</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <ColorPicker value={color} onChange={setColor} swatches={colors} />
                </div>
              </div>
              <div className="tool-group">
                <label className="tool-label">Size <span id="size-value">{size}</span>px</label>
                <SizeControl value={size} onChange={(n) => setSize(n)} min={1} max={64} />
              </div>
              {(brush === 'text' || selectedTextField) && (
                <div className="tool-group">
                  <label className="tool-label">Text Field Size</label>
                  {selectedTextField ? (
                    <>
                      <div className="text-size-control">
                        <div className="text-size-meta">
                          <span>Width</span>
                          <span>{Math.round(selectedTextField.width)} px</span>
                        </div>
                        <input
                          type="range"
                          min={TEXT_FIELD_WIDTH_MIN}
                          max={TEXT_FIELD_WIDTH_MAX}
                          value={clamp(Math.round(selectedTextField.width), TEXT_FIELD_WIDTH_MIN, TEXT_FIELD_WIDTH_MAX)}
                          onChange={(e) => handleWidthSliderChange(Number(e.target.value))}
                          onMouseUp={handleWidthSliderCommit}
                          onTouchEnd={handleWidthSliderCommit}
                          className="size-slider"
                        />
                      </div>
                      <div className="text-size-control">
                        <div className="text-size-meta">
                          <span>Height</span>
                          <span>{Math.round(selectedTextField.height)} px</span>
                        </div>
                        <input
                          type="range"
                          min={TEXT_FIELD_HEIGHT_MIN}
                          max={TEXT_FIELD_HEIGHT_MAX}
                          value={clamp(Math.round(selectedTextField.height), TEXT_FIELD_HEIGHT_MIN, TEXT_FIELD_HEIGHT_MAX)}
                          onChange={(e) => handleHeightSliderChange(Number(e.target.value))}
                          onMouseUp={handleHeightSliderCommit}
                          onTouchEnd={handleHeightSliderCommit}
                          className="size-slider"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="tool-hint">Select a text field to adjust its width and height.</p>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
        {/* tools toggle removed; tools are horizontal above canvas on mobile/tablet */}

        {/* Pages panel disabled for now */}

        <section
          className="canvas-wrap"
          ref={canvasWrapRef}
          onMouseMove={(e) => {
            const el = canvasWrapRef.current; if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            el.style.setProperty('--mx', x + 'px');
            el.style.setProperty('--my', y + 'px');
          }}
        >
          <CanvasBoard
            ref={boardRef}
            brush={brush}
            color={color}
            size={size}
            onHistoryUpdate={handleHistoryUpdate}
            showGrid={showGrid}
            onTextFieldChange={handleTextFieldChange}
          />
          <div className="canvas-overlay">
            <div className="overlay-row">
              <button className={`icon-btn ${showHistory ? 'active' : ''}`} onClick={toggleHistory} title="History" data-tooltip="History"><History size={16} /></button>
              <button className="icon-btn" onClick={() => boardRef.current?.setZoom(-0.1)}><ZoomOut size={16} /></button>
              <button className="icon-btn" onClick={() => boardRef.current?.resetView()}><Maximize size={16} /></button>
              <button className="icon-btn" onClick={() => boardRef.current?.setZoom(0.1)}><ZoomIn size={16} /></button>
            </div>
          </div>
          {showHistory && (
            <div className="history-popover" role="dialog" aria-label="Canvas history">
              <div className="history-header">
                <span className="history-title">History</span>
                <button className="icon-btn small" onClick={() => setShowHistory(false)} aria-label="Close history">✕</button>
              </div>
              <div className="history-actions">
                <label className="history-snapshot-label" htmlFor="history-label-input">Label snapshot</label>
                <span className="history-save-label">Save</span>
                <input
                  id="history-label-input"
                  className="history-input"
                  placeholder="e.g. Sketch start"
                  value={historyLabel}
                  onChange={(e) => setHistoryLabel(e.target.value)}
                  onKeyDown={onHistoryInputKeyDown}
                />
                <button className="icon-btn history-save-btn" onClick={onCreateHistorySnapshot} title="Save snapshot" aria-label="Save snapshot">
                  <SaveIcon size={16} />
                </button>
              </div>
              <div className="history-list">
                {historyTimeline.length ? (
                  historyTimeline.map((entry) => (
                    <div
                      key={entry.id}
                      className={`history-item ${entry.active ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="history-item-button"
                        onClick={() => onJumpToHistory(entry.id)}
                        aria-pressed={entry.active}
                      >
                        <span className="history-item-title">{entry.label}</span>
                        <span className="history-item-meta">{new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn history-delete"
                        title="Delete snapshot"
                        aria-label={`Delete ${entry.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteHistory(entry.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="history-empty">Snap with Save to create your first checkpoint.</p>
                )}
              </div>
            </div>
          )}
          {!isMobile && (
            <div className="canvas-ask">
              <input
                className="ask-input"
                placeholder="Ask AI (optional prompt)"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button className={`btn accent ask-btn ${isAnalyzing ? 'beam' : ''} ${askClicked ? 'clicked' : ''}`} title="Ask AI" data-tooltip="Ask AI" onClick={onAnalyze} aria-label="Ask AI">
                <Send size={16} />
                <span>Ask AI</span>
              </button>
            </div>
          )}
          {isMobile && (
            <div className="canvas-ask-mobile">
              <input
                id="ask-input-mobile"
                className="ask-input"
                placeholder="Ask AI (optional prompt)"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button className={`btn accent ask-btn ${isAnalyzing ? 'beam' : ''} ${askClicked ? 'clicked' : ''}`} onClick={onAnalyze} aria-label="Ask AI">
                <Send size={16} />
                <span>Ask AI</span>
              </button>
            </div>
          )}
        </section>

        {!isMobile && (
          <aside className="side-panel">
            <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card">
              <div className="card-header">
                <h2>AI Response</h2>
                <button className="icon-btn" data-tooltip="Copy" title="Copy" onClick={() => navigator.clipboard.writeText(aiText)}>⧉</button>
              </div>
              <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`}>
                {parsedAiSections.length && !isAnalyzing ? (
                  <div className="ai-output-structured">
                    {parsedAiSections.map((section) => (
                      <section key={section.slug} className="ai-section" data-section={section.slug}>
                        <span className="ai-section-label">{section.label}</span>
                        {section.items.length === 0 ? (
                          <p className="ai-section-text">—</p>
                        ) : section.isList ? (
                          <ul className="ai-section-list">
                            {section.items.map((item, idx) => (
                              <li key={`${section.slug}-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          section.items.map((item, idx) => (
                            <p key={`${section.slug}-${idx}`} className="ai-section-text">{item}</p>
                          ))
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  aiText
                )}
              </div>
            </div>
          </aside>
        )}
        {isMobile && (
          <aside className="panel-mobile ai-mobile">
            <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card">
              <div className="card-header">
                <h2>AI Response</h2>
                <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard.writeText(aiText)}>⧉</button>
              </div>
              <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`}>
                {parsedAiSections.length && !isAnalyzing ? (
                  <div className="ai-output-structured">
                    {parsedAiSections.map((section) => (
                      <section key={section.slug} className="ai-section" data-section={section.slug}>
                        <span className="ai-section-label">{section.label}</span>
                        {section.items.length === 0 ? (
                          <p className="ai-section-text">—</p>
                        ) : section.isList ? (
                          <ul className="ai-section-list">
                            {section.items.map((item, idx) => (
                              <li key={`${section.slug}-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          section.items.map((item, idx) => (
                            <p key={`${section.slug}-${idx}`} className="ai-section-text">{item}</p>
                          ))
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  aiText
                )}
              </div>
            </div>
          </aside>
        )}
      </main>

      <section className="integration-cta" aria-labelledby="integration-title">
        <div className="integration-inner">
          <span className="integration-pill">Integrate <span className="integration-brand">Cognito</span></span>
          <div className="integration-layout">
            <div className="integration-column">
              <div className="integration-headline">
                <h2 id="integration-title">Bring the AI canvas into your product</h2>
                <p>
                  Deliver real-time visual intelligence inside your app. Empower teams to sketch, annotate, and receive AI-crafted insights instantly—whether they&rsquo;re solving equations, designing interfaces, or collaborating across devices.
                </p>
              </div>
              <div className="integration-rail">
                <div className="integration-stack-wrapper">
                  <div className="integration-stack" aria-label="Supported tech stack">
                    {techStack.map(({ name, slug, icon }) => (
                      <div key={slug} className={`stack-chip ${slug}`}>
                        <span className="stack-chip__icon">{icon}</span>
                        <span className="stack-chip__label">{name}</span>
                      </div>
                    ))}
                    {/* Duplicate for seamless loop */}
                    {techStack.map(({ name, slug, icon }) => (
                      <div key={`${slug}-dup`} className={`stack-chip ${slug}`}>
                        <span className="stack-chip__icon">{icon}</span>
                        <span className="stack-chip__label">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="integration-side">
              <div className="integration-usecases">
                {integrationUseCases.map((useCase) => (
                  <article key={useCase.title} className="usecase-card">
                    <span className="usecase-icon" aria-hidden="true">{useCase.icon}</span>
                    <h3>{useCase.title}</h3>
                  </article>
                ))}
              </div>
              <a className="btn accent integration-action" href="https://forms.gle/EunESTAMAMsato776" target="_blank" rel="noopener noreferrer" title="Request an integration">
                INTEGRATE NOW
                <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="app-footer">
        <div className="footer-shell">
            <div className="footer-grid">
              <div className="footer-brand">
                <span className="footer-badge">Built for labs &amp; lecture halls</span>
                <div className="footer-logo" aria-hidden="true">
                  <img src={logoImage} alt="Cognito logo" />
                </div>
              <p className="footer-copy">
                Sketch complex ideas, annotate experiments, and ship insights faster with an AI-native canvas
                designed for science and engineering teams.
              </p>
              <div className="footer-actions">
                <a
                  className="btn-cta footer-cta"
                    href="https://forms.gle/gzvFHB3RdxW71o9t6"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                    Join the beta
                  <ArrowUpRight size={16} />
                </a>
                <div className="footer-social">
                  <a
                    className="footer-social-link"
                      href="https://www.linkedin.com/in/rohanbsonawane/"
                    target="_blank"
                    rel="noopener noreferrer"
                      aria-label="Connect on LinkedIn"
                  >
                      <Linkedin size={16} />
                  </a>
                  <a
                    className="footer-social-link"
                      href="https://www.rohansonawane.tech/"
                    target="_blank"
                    rel="noopener noreferrer"
                      aria-label="Visit portfolio"
                  >
                      <Globe size={16} />
                  </a>
                  <a
                    className="footer-social-link"
                      href="https://github.com/rohansonawane/"
                    target="_blank"
                    rel="noopener noreferrer"
                      aria-label="View GitHub profile"
                  >
                      <Github size={16} />
                  </a>
                </div>
              </div>
            </div>

              <div className="footer-nav-group">
                <span className="footer-nav-title">Quick links</span>
                <ul className="footer-nav-list">
                  <li><button type="button" className="footer-link" onClick={() => setShowAbout(true)}>Overview</button></li>
                <li>
                  <button
                    type="button"
                    className="footer-link"
                      onClick={() => { setShowHow(true); setActiveHowCard('quick'); }}
                  >
                      How it works
                  </button>
                </li>
                  <li><a className="footer-link" href="mailto:rohansonawane28@gmail.com">Email support</a></li>
                  <li><a className="footer-link" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer">Feedback</a></li>
              </ul>
            </div>

            <div className="footer-card">
              <span className="footer-card-title">Stay in the loop</span>
              <p>
                Monthly drops on new lab-ready brushes, equation templates, and AI workflows tailored for research teams.
              </p>
                <a className="footer-mail" href="mailto:rohansonawane28@gmail.com">
                <Mail size={16} />
                  rohansonawane28@gmail.com
              </a>
            </div>
          </div>

          <div className="footer-bottom">
            <span className="footer-bottom-copy">
              © {currentYear} Cognito Labs · Built with <span className="heart-anim">♥</span>
            </span>
          </div>
        </div>
      </footer>

      {showAbout && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="About Cognito">
          <div className="about-header">
            <strong>About Cognito</strong>
            <button className="icon-btn" onClick={() => setShowAbout(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <p>Cognito lets you sketch, annotate, and send your canvas to AI for descriptions or math solutions. Use the left panel to pick a tool and color, drop an image onto the canvas, then press Ask AI at the bottom.</p>
            <ul>
              <li>Brush, eraser, and basic shapes</li>
              <li>Undo/redo, save boards locally, download PNG</li>
              <li>Zoom controls top-right; theme toggle in header</li>
            </ul>
          </div>
        </div>
      )}

      {showLimit && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="Limit reached">
          <div className="about-header">
            <strong>Daily limit reached</strong>
            <button className="icon-btn" onClick={() => setShowLimit(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <p>You’ve used your 10 AI requests for the day. Please try again later.</p>
            <p>Want higher limits? Share feedback to help us plan upgrades.</p>
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <a className="btn accent" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer">Give feedback</a>
              <button className="btn" onClick={() => setShowLimit(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showHow && (
        <div className="how-overlay" onClick={(e)=>{
          // Close when clicking outside popover on desktop; stay for mobile fullscreen overlay
          const target = e.target as HTMLElement;
          if (target.classList.contains('how-overlay')) setShowHow(false);
        }} />
      )}

      {showHow && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="How to use">
          <div className="about-header">
            <strong>How to use</strong>
            <button className="icon-btn" onClick={() => setShowHow(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <section className="how-grid">
              {howSections.map((section) => {
                const Icon = section.icon;
                const isOpen = activeHowCard === section.id;
                return (
                  <article className={`how-card ${isOpen ? 'open' : ''}`} key={section.id}>
                    <button
                      type="button"
                      className="how-card__header"
                      onClick={() => setActiveHowCard(isOpen ? '' : section.id)}
                      aria-expanded={isOpen}
                      aria-controls={`how-card-${section.id}`}
                    >
                      <span className="how-title"><Icon size={16} /> {section.title}</span>
                      <ChevronDown className={`how-chevron ${isOpen ? 'open' : ''}`} size={16} />
                    </button>
                    <div className="how-card__body" id={`how-card-${section.id}`} hidden={!isOpen}>
                      {section.type === 'ol' ? (
                        <ol className="how-list how-list--numbered">
                          {section.items.map((item, itemIndex) => (
                            <li key={itemIndex}>
                              {typeof item === 'string' ? <span className="how-text">{item}</span> : item}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <ul className="how-list">
                          {section.items.map((item, itemIndex) => (
                            <li key={itemIndex}>
                              {typeof item === 'string' ? <span className="how-text">{item}</span> : item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}


