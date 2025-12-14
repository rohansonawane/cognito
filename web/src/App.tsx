import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { renderMathOnly } from './utils/markdown';
import 'katex/dist/katex.min.css';
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
  Slash,
  Square,
  Circle,
  Triangle as TriangleIcon,
  Diamond as DiamondIcon,
  Hexagon as HexagonIcon,
  Type,
  Hand,
} from 'lucide-react';
import { ColorPicker } from './components/ColorPicker';
import { SizeControl } from './components/SizeControl';
const IntegrationSection = React.lazy(() => import('./components/IntegrationSection'));
const SiteFooter = React.lazy(() => import('./components/SiteFooter'));

// Preferred/known labels (for ordering + styling). We still accept other labels too,
// because the AI response depends on the image type.
const KNOWN_AI_LABELS = new Set([
  'Title',
  'What I see',
  'Details',
  'Steps',
  'Math Steps',
  'Answer',
  'Final Answer',
  'Options',
  'Solution',
  'Given',
  'Tips/Next',
]);
// Comprehensive HTML and wrapper stripping function
const stripHtml = (s: string): string => {
  if (typeof s !== 'string') return s;
  let text = s;
  
  // Remove all HTML tags (including self-closing and malformed)
  text = text.replace(/<\/?[^>]+(>|$)/g, '');
  
  // Remove common AI wrapper patterns
  text = text.replace(/<App[^>]*>/gi, '');
  text = text.replace(/<\/App>/gi, '');
  text = text.replace(/<div[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '');
  text = text.replace(/<span[^>]*>/gi, '');
  text = text.replace(/<\/span>/gi, '');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/p>/gi, '');
  
  // Remove HTML entities that might have been left behind
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");
  
  return text;
};

function normalizeAiTextForSections(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let t = input;

  // FIRST: Strip all HTML tags and wrappers aggressively
  t = stripHtml(t);

  // Remove common AI wrappers/prefixes.
  t = t.replace(/\bAI Response\b\s*⧉?\s*/gi, '');
  t = t.replace(/^\s*⧉\s*/g, '');
  
  // Remove any remaining HTML-like patterns that might have slipped through
  t = t.replace(/<[^>]*>/g, '');

  // Remove markdown heading markers from AI (e.g. "#### What I see:")
  // We render sections with our own UI, so these prefixes just add noise.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  // Also drop lines that are ONLY hashes (e.g. "####")
  t = t.replace(/^\s{0,3}#{2,}\s*$/gm, '');

  // CRITICAL: Preserve math blocks before normalizing whitespace
  // Extract all math blocks temporarily to protect them
  const mathBlocks: string[] = [];
  const mathPlaceholder = (idx: number) => `__MATH_BLOCK_${idx}__`;
  
  // Protect display math \[...\]
  t = t.replace(/\\\[[\s\S]*?\\\]/g, (match) => {
    const idx = mathBlocks.length;
    mathBlocks.push(match);
    return mathPlaceholder(idx);
  });
  
  // Protect inline math \(...\)
  t = t.replace(/\\\([\s\S]*?\\\)/g, (match) => {
    const idx = mathBlocks.length;
    mathBlocks.push(match);
    return mathPlaceholder(idx);
  });

  // Normalize whitespace (now safe since math is protected).
  t = t.replace(/\u00a0/g, ' '); // NBSP
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');

  // Insert newlines before known section labels even if AI put them on one line.
  // Example: "Title: ... What I see: ..." -> "Title: ...\nWhat I see: ..."
  t = t.replace(/\b(Title|What I see|Details|Steps|Math Steps|Answer|Final Answer|Options|Solution|Given|Tips\/Next)\s*:/g, (match, label, offset, full) => {
    if (offset === 0) return `${label}:`;
    const prev = (full as string)[offset - 1];
    if (prev === '\n') return `${label}:`;
    return `\n${label}:`;
  });

  // Restore math blocks
  mathBlocks.forEach((block, idx) => {
    t = t.replace(mathPlaceholder(idx), block);
  });

  return t.trim();
}
const ASK_LIMIT = 10;
const ASK_WINDOW_MS = 24 * 60 * 60 * 1000;
const ASK_META_KEY = 'ASK_META';

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
  
  // CRITICAL: Merge lines that are part of incomplete math blocks before parsing sections
  // This prevents math blocks from being split across items
  let mergedText = text;
  
  // Merge lines that start with \[ or end with \] with adjacent lines
  // Pattern: If a line is just `\[` or `\]`, merge it with the next/previous line
  const lines = mergedText.split(/\r?\n/);
  const mergedLines: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // If line is just `\[`, merge with next non-empty line
    if (line === '\\[' || line === '\\ ]') {
      let merged = line;
      i++;
      // Find next non-empty line and merge
      while (i < lines.length && !lines[i].trim()) i++;
      if (i < lines.length) {
        merged += '\n' + lines[i];
        i++;
      }
      mergedLines.push(merged);
      continue;
    }
    
    // If line ends with `\]`, check if previous line needs merging
    if (line.endsWith('\\]') || line.endsWith('\\ ]')) {
      // Check if previous merged line is incomplete (starts with \[ but doesn't end with \])
      if (mergedLines.length > 0 && 
          (mergedLines[mergedLines.length - 1].includes('\\[') || mergedLines[mergedLines.length - 1].includes('\\ [')) &&
          !mergedLines[mergedLines.length - 1].includes('\\]') && 
          !mergedLines[mergedLines.length - 1].includes('\\ ]')) {
        mergedLines[mergedLines.length - 1] += '\n' + line;
      } else {
        mergedLines.push(line);
      }
      i++;
      continue;
    }
    
    // Regular line
    mergedLines.push(line);
    i++;
  }
  
  mergedText = mergedLines.join('\n');
  const finalLines = mergedText.split(/\r?\n/);
  
  const sections: ParsedAiSection[] = [];
  let current: ParsedAiSection | null = null;
  let matchedAnySection = false;

  const looksLikeSectionLabel = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    if (trimmed.length > 28) return false;
    // Avoid common false positives like full sentences.
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > 5) return false;
    // Must start with a letter, contain at least one letter.
    if (!/^[A-Za-z]/.test(trimmed)) return false;
    if (!/[A-Za-z]/.test(trimmed)) return false;
    // Avoid URLs / code-ish labels.
    if (trimmed.includes('http') || trimmed.includes('://')) return false;
    return true;
  };

  for (const raw of finalLines) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z][A-Za-z\/ ]+):\s*(.*)$/);
    if (match) {
      const [ , labelRaw, rest ] = match;
      const label = labelRaw.trim();
      if (looksLikeSectionLabel(label)) {
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
    // CRITICAL: Merge items that are part of split math blocks
    // If an item is just `\[` or `\]`, merge it with adjacent items
    const mergedItems: string[] = [];
    for (let i = 0; i < section.items.length; i++) {
      const item = section.items[i].trim();
      
      // If item is just opening delimiter, merge with next item(s) until we find closing
      if (item === '\\[' || item === '\\ [' || item === '\\]' || item === '\\ ]') {
        let merged = item;
        let j = i + 1;
        
        // If it's an opening delimiter, find the closing one
        if (item === '\\[' || item === '\\ [') {
          while (j < section.items.length) {
            merged += '\n' + section.items[j];
            if (section.items[j].includes('\\]') || section.items[j].includes('\\ ]')) {
              j++;
              break;
            }
            j++;
          }
        } else {
          // It's a closing delimiter, merge with previous if it exists
          if (mergedItems.length > 0) {
            mergedItems[mergedItems.length - 1] += '\n' + item;
            continue;
          }
        }
        
        mergedItems.push(merged);
        i = j - 1; // Skip the merged items
        continue;
      }
      
      // Check if item ends with opening delimiter or starts with closing delimiter
      // and merge accordingly
      if (item.endsWith('\\[') || item.endsWith('\\ [')) {
        // Merge with next items until closing delimiter
        let merged = item;
        let j = i + 1;
        while (j < section.items.length) {
          merged += '\n' + section.items[j];
          if (section.items[j].includes('\\]') || section.items[j].includes('\\ ]')) {
            j++;
            break;
          }
          j++;
        }
        mergedItems.push(merged);
        i = j - 1;
        continue;
      }
      
      if (item.startsWith('\\]') || item.startsWith('\\ ]')) {
        // Merge with previous if it exists
        if (mergedItems.length > 0) {
          mergedItems[mergedItems.length - 1] += '\n' + item;
          continue;
        }
      }
      
      mergedItems.push(item);
    }
    
    section.items = mergedItems;
    
    const listPattern = /^([-•]\s*|\d+[\.\)]\s*)/;
    const isList = section.items.length > 1 && section.items.every((item) => listPattern.test(item));
    section.isList = isList;
    if (isList) {
      section.items = section.items.map((item) => item.replace(listPattern, '').trim());
    }
  });

  // Order: known labels first (in a sensible order), then the rest.
  const order = [
    'Title',
    'What I see',
    'Given',
    'Details',
    'Options',
    'Steps',
    'Math Steps',
    'Solution',
    'Answer',
    'Final Answer',
    'Tips/Next',
  ];
  const rank = new Map(order.map((k, i) => [k, i]));
  sections.sort((a, b) => (rank.get(a.label) ?? 999) - (rank.get(b.label) ?? 999));

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
  const [askUsage, setAskUsage] = useState<{ count: number; resetAt: number }>(() => ({
    count: 0,
    resetAt: Date.now() + ASK_WINDOW_MS,
  }));
  const [isHandMode, setIsHandMode] = useState(false);
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
  const loadAskMeta = React.useCallback(() => {
    const now = Date.now();
    let meta: { count: number; resetAt: number } = { count: 0, resetAt: now + ASK_WINDOW_MS };
    if (typeof window === 'undefined') return meta;
    try {
      const raw = localStorage.getItem(ASK_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const storedCount = typeof parsed.count === 'number' ? parsed.count : 0;
        // If stored count is >= old limit (10), reset it since we increased limit to 30
        // This clears the limit for users who hit the old limit
        if (storedCount >= 10) {
          // Reset if user was at or exceeded old limit
          meta = { count: 0, resetAt: now + ASK_WINDOW_MS };
          localStorage.removeItem(ASK_META_KEY); // Clear old data
        } else {
          meta = {
            count: storedCount,
            resetAt: typeof parsed.resetAt === 'number' ? parsed.resetAt : now + ASK_WINDOW_MS,
          };
        }
      }
    } catch {}
    if (now > (meta.resetAt || 0)) {
      meta = { count: 0, resetAt: now + ASK_WINDOW_MS };
    }
    try {
      localStorage.setItem(ASK_META_KEY, JSON.stringify(meta));
    } catch {}
    return meta;
  }, []);

  const saveAskMeta = React.useCallback((meta: { count: number; resetAt: number }) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ASK_META_KEY, JSON.stringify(meta));
    } catch {}
    setAskUsage(meta);
  }, []);
  const currentYear = new Date().getFullYear();
  const [shouldLoadMarketing, setShouldLoadMarketing] = useState(false);
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
    if (typeof window === 'undefined') return;
    setAskUsage(loadAskMeta());
  }, [loadAskMeta]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setShouldLoadMarketing(true);
      return;
    }
    const idle = (window as any).requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 900));
    const cancelIdle = (window as any).cancelIdleCallback || ((id: number) => window.clearTimeout(id));
    const id = idle(() => setShouldLoadMarketing(true));
    return () => cancelIdle(id);
  }, []);

  useEffect(() => {
  }, [showGrid]);
  // Removed MathJax - we're using KaTeX which renders synchronously during markdownToHtml
  // No need for typesetting effects
  useEffect(() => {
    if (showHow) {
      setActiveHowCard('quick');
    }
  }, [showHow]);
  // stripHtml is now called inside normalizeAiTextForSections, so we don't need to call it twice
  const cleanAiText = useMemo(() => normalizeAiTextForSections(aiText), [aiText]);
  const parsedAiSections = useMemo(() => parseAiResponse(cleanAiText), [cleanAiText]);

  // Optional console debugging for formatting issues.
  // Enable via DevTools:
  //   localStorage.setItem('AI_DEBUG','1'); location.reload()
  // Or:
  //   window.__AI_DEBUG = true
  useEffect(() => {
    try {
      const enabled = localStorage.getItem('AI_DEBUG') === '1' || (window as any).__AI_DEBUG === true;
      if (!enabled) return;
      // eslint-disable-next-line no-console
      console.log('[AI_FORMAT_DEBUG] App aiText (raw)', { preview: (aiText || '').slice(0, 800) });
      // eslint-disable-next-line no-console
      console.log('[AI_FORMAT_DEBUG] App cleanAiText', { preview: (cleanAiText || '').slice(0, 800) });
      // eslint-disable-next-line no-console
      console.log('[AI_FORMAT_DEBUG] App parsedAiSections', {
        count: parsedAiSections.length,
        labels: parsedAiSections.map((s) => s.label),
        isStructured: parsedAiSections.length > 0,
      });
    } catch {
      // ignore
    }
  }, [aiText, cleanAiText, parsedAiSections]);
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
      { icon: '🖍️', title: 'AI Whiteboard', blurb: 'Brainstorm, sketch, and get instant AI feedback from your canvas.' },
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
    return 'dark';
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
    const meta = loadAskMeta();
    if (meta.count >= ASK_LIMIT) {
      setAskUsage(meta);
      setShowLimit(true);
      return;
    }
    const nextMeta = { ...meta, count: meta.count + 1 };
    saveAskMeta(nextMeta);
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
            <div className="brand-mark">
              <img src={logoImage} alt="Cognito AI Canvas" width={120} height={32} decoding="async" />
            </div>
          </div>
          {isMobile ? (
            <div className="header-actions" style={{ display:'flex', gap:8 }}>
              <select className="btn" value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
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
              <span className="usage-pill">{Math.max(0, ASK_LIMIT - askUsage.count)} / {ASK_LIMIT} asks left</span>
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
            <span className="usage-pill">{Math.max(0, ASK_LIMIT - askUsage.count)} / {ASK_LIMIT} asks left</span>
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
                  <button
                    className={`icon-btn ${isHandMode ? 'active' : ''}`}
                    title="Pan / Move canvas"
                    onClick={() => setIsHandMode((v) => !v)}
                  >
                    <Hand size={16} />
                  </button>
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
                  <button
                    className={`icon-btn ${isHandMode ? 'active' : ''}`}
                    title="Pan / Move canvas"
                    data-tooltip="Pan / Move"
                    onClick={() => setIsHandMode((v) => !v)}
                  >
                    <Hand size={16} />
                  </button>
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
            panMode={isHandMode}
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
              <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                <div dangerouslySetInnerHTML={{ __html: renderMathOnly(aiText) }} />
              </div>
            </div>
          </aside>
        )}
        {isMobile && (
          <aside className="panel-mobile ai-mobile">
            <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card">
              <div className="card-header">
                <h2>AI Response</h2>
                <button className="icon-btn" title="Copy" onClick={() => navigator.clipboard.writeText(cleanAiText)}>⧉</button>
              </div>
              <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                <div dangerouslySetInnerHTML={{ __html: renderMathOnly(aiText) }} />
              </div>
            </div>
          </aside>
        )}
      </main>

      {shouldLoadMarketing && (
        <Suspense fallback={null}>
          <IntegrationSection techStack={techStack} useCases={integrationUseCases} />
        </Suspense>
      )}

      {shouldLoadMarketing && (
        <Suspense fallback={null}>
          <SiteFooter
            logoImage={logoImage}
            currentYear={currentYear}
            onShowAbout={() => setShowAbout(true)}
            onShowHow={() => {
              setShowHow(true);
              setActiveHowCard('quick');
            }}
          />
        </Suspense>
      )}

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
            <p>You've used your 10 AI requests for the day. Please try again later.</p>
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


