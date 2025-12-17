import React, { useMemo, useRef, useState, useEffect, useLayoutEffect, Suspense } from 'react';
import { renderMathOnly } from './utils/markdown';
import 'katex/dist/katex.min.css';
import { CanvasBoard, CanvasBoardRef, HistorySnapshot, type BrushKind, type CanvasTextField, type CanvasLayer } from './components/CanvasBoard';
import { analyze, recognizeShapes, suggestLayout } from './ai/api';
import logoImage from './assets/Logo.png';
import {
  Undo2,
  Redo2,
  Eraser,
  PenLine,
  MousePointer2,
  Palette,
  SlidersHorizontal,
  Download as DownloadIcon,
  Save,
  Image as ImageIcon,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  History,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  ChevronUp,
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
  Shapes,
  AlignLeft,
  AlignRight,
  AlignCenter,
  ArrowUp,
  ArrowDown,
  Minus,
  MoreHorizontal,
  Wand2,
  Layout,
  X,
  Maximize2,
  Minimize2,
  Move,
} from 'lucide-react';
import { ColorPicker } from './components/ColorPicker';
import { SizeControl } from './components/SizeControl';
// Footer removed from this page (will be used on other pages later)

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
  const [eraserMode, setEraserMode] = useState<'pixel' | 'stroke'>(() => {
    try {
      const v = localStorage.getItem('COGNITO_ERASER_MODE');
      return v === 'stroke' ? 'stroke' : 'pixel';
    } catch {
      return 'pixel';
    }
  });
  const [shapeFill, setShapeFill] = useState<boolean>(() => {
    try {
      return localStorage.getItem('COGNITO_SHAPE_FILL') === '1';
    } catch {
      return false;
    }
  });
  const [cornerRadius, setCornerRadius] = useState<number>(() => {
    try {
      const v = localStorage.getItem('COGNITO_CORNER_RADIUS');
      return v ? parseInt(v, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [polygonSides, setPolygonSides] = useState<number>(() => {
    try {
      const v = localStorage.getItem('COGNITO_POLYGON_SIDES');
      return v ? parseInt(v, 10) : 5;
    } catch {
      return 5;
    }
  });
  const [starPoints, setStarPoints] = useState<number>(() => {
    try {
      const v = localStorage.getItem('COGNITO_STAR_POINTS');
      return v ? parseInt(v, 10) : 5;
    } catch {
      return 5;
    }
  });
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('COGNITO_RECENT_COLORS');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const [aiText, setAiText] = useState('Draw something and press "Ask AI".');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecognizingShapes, setIsRecognizingShapes] = useState(false);
  const [isSuggestingLayout, setIsSuggestingLayout] = useState(false);
  const [aiBorderActive, setAiBorderActive] = useState(false);
  const borderTimer = React.useRef<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const [askClicked, setAskClicked] = useState(false);
  const [aiPanelPos, setAiPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [aiPanelSize, setAiPanelSize] = useState<{ width: number; height: number }>({ width: 360, height: 520 });
  const [aiPanelMinimized, setAiPanelMinimized] = useState(false);
  const [aiPanelMaximized, setAiPanelMaximized] = useState(false);
  const aiPrevPanelRef = React.useRef<{ pos: { x: number; y: number }; size: { width: number; height: number } }>({
    pos: { x: 0, y: 0 },
    size: { width: 360, height: 520 },
  });
  const aiDragRef = React.useRef(false);
  const aiResizeRef = React.useRef(false);
  const aiDragOffsetRef = React.useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const aiResizeStartRef = React.useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 360,
    height: 520,
  });
  const [provider, setProvider] = useState<Provider>('openai');
  const [askUsage, setAskUsage] = useState<{ count: number; resetAt: number }>(() => ({
    count: 0,
    resetAt: Date.now() + ASK_WINDOW_MS,
  }));
  const [isMobile, setIsMobile] = useState(false);
  const clampAiPos = React.useCallback(
    (x: number, y: number, width: number, height: number) => ({
      x: Math.max(8, Math.min(x, (window.innerWidth || width) - width - 8)),
      y: Math.max(56, Math.min(y, (window.innerHeight || height) - height - 12)),
    }),
    []
  );
  useEffect(() => {
    if (isMobile) return;
    setAiPanelPos({
      x: Math.max(12, (window.innerWidth || 0) - aiPanelSize.width - 20),
      y: 80,
    });
  }, [isMobile, aiPanelSize.width]);
  useEffect(() => {
    if (isMobile) return;
    const handleMove = (e: PointerEvent) => {
      if (aiDragRef.current) {
        const width = aiPanelMaximized ? Math.max(320, (window.innerWidth || 0) - 24) : aiPanelSize.width;
        const height = aiPanelMaximized ? Math.max(320, (window.innerHeight || 0) - 80) : aiPanelSize.height;
        const next = clampAiPos(e.clientX - aiDragOffsetRef.current.dx, e.clientY - aiDragOffsetRef.current.dy, width, height);
        setAiPanelPos(next);
      } else if (aiResizeRef.current) {
        const dx = e.clientX - aiResizeStartRef.current.x;
        const dy = e.clientY - aiResizeStartRef.current.y;
        const width = Math.max(280, Math.min((window.innerWidth || 0) - aiPanelPos.x - 16, aiResizeStartRef.current.width + dx));
        const height = Math.max(260, Math.min((window.innerHeight || 0) - aiPanelPos.y - 24, aiResizeStartRef.current.height + dy));
        setAiPanelSize({ width, height });
      }
    };
    const handleUp = () => {
      aiDragRef.current = false;
      aiResizeRef.current = false;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [aiPanelMaximized, aiPanelPos.x, aiPanelPos.y, aiPanelSize.height, aiPanelSize.width, clampAiPos, isMobile]);
  const startAiDrag = (e: React.PointerEvent) => {
    if (aiPanelMaximized) return;
    aiDragRef.current = true;
    aiDragOffsetRef.current = { dx: e.clientX - aiPanelPos.x, dy: e.clientY - aiPanelPos.y };
  };
  const startAiResize = (e: React.PointerEvent) => {
    if (aiPanelMaximized) return;
    aiResizeRef.current = true;
    aiResizeStartRef.current = { x: e.clientX, y: e.clientY, width: aiPanelSize.width, height: aiPanelSize.height };
    e.preventDefault();
    e.stopPropagation();
  };
  const toggleAiMinimize = () => setAiPanelMinimized((v) => !v);
  const toggleAiMaximize = () => {
    if (!aiPanelMaximized) {
      aiPrevPanelRef.current = { pos: aiPanelPos, size: aiPanelSize };
      setAiPanelPos({ x: 12, y: 12 });
      setAiPanelSize({
        width: Math.max(320, (window.innerWidth || 0) - 24),
        height: Math.max(320, (window.innerHeight || 0) - 80),
      });
      setAiPanelMaximized(true);
      setAiPanelMinimized(false);
    } else {
      setAiPanelPos(aiPrevPanelRef.current.pos);
      setAiPanelSize(aiPrevPanelRef.current.size);
      setAiPanelMaximized(false);
    }
  };
  const [isHandMode, setIsHandMode] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const howWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [showLimit, setShowLimit] = useState(false);
  const canvasWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'tools' | 'brush' | 'color' | 'size' | null>(null);
  const [historyTimeline, setHistoryTimeline] = useState<HistorySnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLabel, setHistoryLabel] = useState('');
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [showLayers, setShowLayers] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState<string>('');
  const [showGrid, setShowGrid] = useState(false);
  const [activeHowCard, setActiveHowCard] = useState<string>('quick');
  const [selectedTextField, setSelectedTextField] = useState<CanvasTextField | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  type ToolPanelKey = 'shapes' | 'color' | 'size';
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanelKey | null>(null);
  const [toolAnchorRect, setToolAnchorRect] = useState<{ left: number; right: number; top: number; bottom: number; width: number; height: number } | null>(null);
  const [toolPanelSide, setToolPanelSide] = useState<'right' | 'left'>('right');
  // Start off-screen to avoid a one-frame flash before layout measurements run.
  const [toolPanelLeft, setToolPanelLeft] = useState<number>(-9999);
  const [toolPanelTop, setToolPanelTop] = useState<number>(-9999);
  const [toolArrowTop, setToolArrowTop] = useState<number>(0);
  const toolsDockRef = useRef<HTMLDivElement | null>(null);
  const toolsPanelRef = useRef<HTMLDivElement | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportIsSelection, setExportIsSelection] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'svg' | 'pdf'>('png');
  const [exportTransparent, setExportTransparent] = useState(false);
  const [exportDpi, setExportDpi] = useState(96);
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
  // const currentYear = new Date().getFullYear();
  type BrushOption = {
    key: BrushKind;
    label: string;
    Icon?: React.ComponentType<{ size?: number }>;
    glyph?: string;
  };
  const brushOptions = useMemo<BrushOption[]>(
    () => [
      { key: 'select', label: 'Select', Icon: MousePointer2 },
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
      { key: 'polygon', label: 'Polygon', Icon: Shapes },
      { key: 'star', label: 'Star', Icon: Sparkles },
      { key: 'text', label: 'Text', Icon: Type },
    ],
    []
  );

  const SHAPE_BRUSHES = useMemo(
    () => new Set<BrushKind>(['line', 'rect', 'ellipse', 'arrow', 'double-arrow', 'triangle', 'diamond', 'hexagon', 'polygon', 'star']),
    []
  );
  const brushIsShape = SHAPE_BRUSHES.has(brush);
  const howSections = useMemo(() => [
    {
      id: 'quick',
      title: 'Quick Start',
      icon: PenLine,
      type: 'ol' as const,
      items: [
        'Pick a tool, color, and stroke size from the left rail.',
        'Use Select (V) to move strokes/text. Shift-click to multi-select, drag empty space to marquee-select.',
        'Sketch freely or drag images onto the canvas to annotate.',
        'Hold Shift while drawing shapes to snap (45° lines, perfect squares/circles).',
        'Zoom with the bottom-right controls; press Space or H to pan (when zoomed).',
        'Toggle the grid from Tools → Grid if you need alignment guides.',
        'Open Layers to lock a layer (locked layers can’t be edited/drawn on).',
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
            <span className="how-text">Tools – Select, brush, eraser, shapes, and text.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><MousePointer2 size={14} /></span>
            <span className="how-text">Shortcuts – V(select), B(brush), E(eraser), T(text), H(hand/pan), ⌘/Ctrl+C/V (copy/paste), ⌘/Ctrl+D (duplicate). In Select: drag corners to resize; drag the top handle to rotate (Shift snaps).</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><PenLine size={14} /></span>
            <span className="how-text">Size &amp; Color – fine-tune stroke weight, fill shapes, and reuse recent colors.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><Eraser size={14} /></span>
            <span className="how-text">Eraser modes – Pixel (paint erase) or Stroke (delete strokes).</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><GridIcon size={14} /></span>
            <span className="how-text">Grid – toggle guides and adjust spacing for layouts.</span>
          </>
        ),
        (
          <>
            <span className="how-inline-icon"><Layers size={14} /></span>
            <span className="how-text">Layers – hide/show, reorder, and lock layers to prevent edits.</span>
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

  // Footer/marketing lazy-loading removed for this page.

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

  // Keyboard shortcuts: V(select), B(brush), E(eraser), T(text), H(hand)
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'v') {
        e.preventDefault();
        setIsHandMode(false);
        setBrush('select');
      } else if (key === 'b') {
        e.preventDefault();
        setIsHandMode(false);
        setBrush('brush');
      } else if (key === 'e') {
        e.preventDefault();
        setIsHandMode(false);
        setBrush('eraser');
      } else if (key === 't') {
        e.preventDefault();
        setIsHandMode(false);
        setBrush('text');
      } else if (key === 'h') {
        e.preventDefault();
        setIsHandMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
        setShowLayers(false);
        const snapshot = boardRef.current?.getHistoryTimeline?.();
        if (snapshot) setHistoryTimeline(snapshot);
      }
      return next;
    });
  }, []);

  const refreshLayers = React.useCallback(() => {
    const nextLayers = boardRef.current?.getLayers?.() || [];
    const activeId = boardRef.current?.getActiveLayerId?.() || '';
    setLayers(nextLayers);
    setActiveLayerId(activeId || (nextLayers[0]?.id ?? ''));
  }, []);

  const toggleLayers = React.useCallback(() => {
    setShowLayers((prev) => {
      const next = !prev;
      if (next) {
        setShowHistory(false);
        refreshLayers();
      } else {
        setEditingLayerId(null);
        setEditingLayerName('');
      }
      return next;
    });
  }, [refreshLayers]);

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

  // Desktop tool panels: close on outside click or Esc (software-like behavior).
  useEffect(() => {
    if (!activeToolPanel) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (toolsDockRef.current?.contains(target)) return;
      if (toolsPanelRef.current?.contains(target)) return;
      setActiveToolPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveToolPanel(null);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [activeToolPanel]);

  const toggleToolPanel = (key: ToolPanelKey) => (e: React.MouseEvent<HTMLElement>) => {
    if (activeToolPanel === key) {
      setActiveToolPanel(null);
      return;
    }
    const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const anchorY = btnRect.top + btnRect.height / 2;
    setToolAnchorRect({
      left: btnRect.left,
      right: btnRect.right,
      top: btnRect.top,
      bottom: btnRect.bottom,
      width: btnRect.width,
      height: btnRect.height,
    });
    // Immediate positioning: open to the right of the clicked icon, vertically centered.
    setToolPanelSide('right');
    setToolPanelLeft(btnRect.right + 10);
    // Immediate positioning near the icon (final position is recalculated in layout effect).
    setToolPanelTop(Math.max(12, anchorY - 140));
    setToolArrowTop(140);
    setActiveToolPanel(key);
  };

  const selectBrushTool = (next: BrushKind) => {
    setBrush(next);
    setIsHandMode(false);
    // If user picked something from a popover menu, close it (pro-app behavior).
    setActiveToolPanel(null);
  };

  const isShapeSelected = useMemo(() => {
    return (
      brush === 'line' ||
      brush === 'rect' ||
      brush === 'ellipse' ||
      brush === 'arrow' ||
      brush === 'double-arrow' ||
      brush === 'triangle' ||
      brush === 'diamond' ||
      brush === 'hexagon'
    );
  }, [brush]);

  // Keep the floating tool panel anchored to the clicked dock icon and clamped within the viewport.
  useLayoutEffect(() => {
    if (!activeToolPanel) return;
    const panel = toolsPanelRef.current;
    if (!panel || !toolAnchorRect) return;

    const recalc = () => {
      const panelW = panel.offsetWidth || 0;
      const panelH = panel.offsetHeight || 0;
      if (!panelW) return;
      const PAD = 12;
      const GAP = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const anchorCenterY = toolAnchorRect.top + toolAnchorRect.height / 2;

      // Prefer right side of the clicked icon; if it doesn't fit, flip to left.
      const rightLeft = toolAnchorRect.right + GAP;
      const leftLeft = toolAnchorRect.left - GAP - panelW;
      let side: 'right' | 'left' = 'right';
      if (rightLeft + panelW <= vw - PAD) side = 'right';
      else if (leftLeft >= PAD) side = 'left';
      else {
        // If neither fits cleanly, choose the side with more room.
        const roomRight = (vw - PAD) - rightLeft;
        const roomLeft = (toolAnchorRect.left - GAP) - PAD;
        side = roomRight >= roomLeft ? 'right' : 'left';
      }

      const preferredLeft = side === 'right' ? rightLeft : leftLeft;
      const left = Math.max(PAD, Math.min((vw - PAD - panelW), preferredLeft));

      // Always center vertically on the clicked icon (designer expectation), clamped to viewport.
      const h = Math.max(1, panelH || 0);
      const top = Math.max(PAD, Math.min((vh - PAD - h), anchorCenterY - h / 2));
      const arrow = Math.max(18, Math.min(Math.max(18, h - 18), anchorCenterY - top));
      setToolPanelLeft(left);
      setToolPanelTop(top);
      setToolArrowTop(arrow);
      setToolPanelSide(side);
    };

    // Measure immediately (layout effect runs before paint) to keep panel attached to the icon.
    recalc();
    // Also re-measure next frame in case content/fonts change the panel size.
    const raf = window.requestAnimationFrame(recalc);
    const onResize = () => recalc();
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [activeToolPanel, toolAnchorRect]);

  const colors = useMemo(
    () => ['#FFFFFF', '#000000', '#00F0C8', '#00C2A8', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9'],
    []
  );

  const colorSwatches = useMemo(() => {
    const merged = [...recentColors, ...colors];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of merged) {
      const v = String(c || '').toUpperCase();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= 18) break;
    }
    return out;
  }, [recentColors, colors]);

  const setColorWithRecents = React.useCallback((next: string) => {
    setColor(next);
    setRecentColors((prev) => {
      const v = String(next || '').toUpperCase();
      const nextList = [v, ...prev.filter((x) => String(x).toUpperCase() !== v)].slice(0, 8);
      try {
        localStorage.setItem('COGNITO_RECENT_COLORS', JSON.stringify(nextList));
      } catch {}
      return nextList;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('COGNITO_ERASER_MODE', eraserMode);
    } catch {}
  }, [eraserMode]);

  useEffect(() => {
    try {
      localStorage.setItem('COGNITO_SHAPE_FILL', shapeFill ? '1' : '0');
    } catch {}
  }, [shapeFill]);

  useEffect(() => {
    try {
      localStorage.setItem('COGNITO_CORNER_RADIUS', cornerRadius.toString());
    } catch {}
  }, [cornerRadius]);

  useEffect(() => {
    try {
      localStorage.setItem('COGNITO_POLYGON_SIDES', polygonSides.toString());
    } catch {}
  }, [polygonSides]);

  useEffect(() => {
    try {
      localStorage.setItem('COGNITO_STAR_POINTS', starPoints.toString());
    } catch {}
  }, [starPoints]);

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

  async function onRecognizeShapes() {
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
    setIsRecognizingShapes(true);
    const strokes = boardRef.current?.getAllStrokes?.() || [];
    const res = await recognizeShapes({ image: dataUrl, provider, strokes });
    setIsRecognizingShapes(false);
    if (!res.ok || !res.shapes || res.shapes.length === 0) {
      setAiText(res.error || 'No shapes recognized. Try drawing clearer shapes.');
      return;
    }
    boardRef.current?.convertShapesToPerfect?.(res.shapes);
    setAiText(`Recognized and converted ${res.shapes.length} shape(s) to perfect geometric forms.`);
  }

  async function onSuggestLayout() {
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
    setIsSuggestingLayout(true);
    const res = await suggestLayout({ image: dataUrl, provider });
    setIsSuggestingLayout(false);
    if (!res.ok || !res.layout) {
      setAiText(res.error || 'Failed to get layout suggestions.');
      return;
    }
    const { suggestions, alignment, spacing } = res.layout;
    let message = 'Layout Suggestions:\n';
    if (suggestions && suggestions.length > 0) {
      message += suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }
    message += `\n\nRecommended: ${alignment} alignment with ${spacing}px spacing.`;
    setAiText(message);
    // Optionally auto-arrange based on suggestion
    if (alignment === 'grid') {
      boardRef.current?.autoArrange?.();
    }
  }

  function onAutoArrange() {
    boardRef.current?.autoArrange?.();
    setAiText('Elements have been automatically arranged in a grid layout.');
  }

  function onDownload() {
    setExportIsSelection(false);
    setShowExportMenu(true);
  }

  async function handleExport() {
    try {
      let blob: Blob | null = null;
      let filename = '';
      const timestamp = Date.now();
      
      if (exportFormat === 'svg') {
        const svgData = exportIsSelection 
          ? boardRef.current?.exportSvg?.({ transparent: exportTransparent, dpi: exportDpi })
          : boardRef.current?.exportSvg?.({ transparent: exportTransparent, dpi: exportDpi });
        if (!svgData) return;
        blob = new Blob([svgData], { type: 'image/svg+xml' });
        filename = `canvas-${exportIsSelection ? 'selection-' : ''}${timestamp}.svg`;
      } else if (exportFormat === 'pdf') {
        const pdfBlob = await boardRef.current?.exportPdf?.({ transparent: exportTransparent, dpi: exportDpi });
        if (!pdfBlob) return;
        blob = pdfBlob;
        filename = `canvas-${exportIsSelection ? 'selection-' : ''}${timestamp}.pdf`;
      } else {
        // PNG
        const dataUrl = exportIsSelection
          ? boardRef.current?.exportPngSelection?.({ transparent: exportTransparent, dpi: exportDpi })
          : boardRef.current?.exportPng({ transparent: exportTransparent, dpi: exportDpi });
        if (!dataUrl) return;
        // Convert data URL to blob
        const response = await fetch(dataUrl);
        blob = await response.blob();
        filename = `canvas-${exportIsSelection ? 'selection-' : ''}${timestamp}.png`;
      }
      
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setShowExportMenu(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }


  function checkHasSelection() {
    // Check if there's a selection by trying to export it
    const hasSel = !!boardRef.current?.exportPngSelection?.();
    setHasSelection(hasSel);
    return hasSel;
  }


  function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        boardRef.current?.loadImage?.(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function copyAiResponse() {
    const html = renderMathOnly(aiText);
    const plain = aiText;
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([plain], { type: 'text/plain' });
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
    } catch {
      try { await navigator.clipboard.writeText(plain); } catch { /* ignore */ }
    }
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
            <div className="header-actions">
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
              <div className="mobile-icon-bar">
                {[
                  { key: 'tools', icon: <MoreHorizontal size={18} />, tooltip: 'Tools' },
                  { key: 'brush', icon: <PenLine size={18} />, tooltip: 'Brush & shapes' },
                  { key: 'color', icon: <Palette size={18} />, tooltip: 'Colors' },
                  { key: 'size', icon: <SlidersHorizontal size={18} />, tooltip: 'Stroke & options' },
                ].map(({ key, icon, tooltip }) => (
                  <button
                    key={key}
                    className={`icon-pill ${activeMobilePanel === key ? 'active' : ''}`}
                    onClick={() => setActiveMobilePanel((p) => (p === key ? null : key as any))}
                    data-tooltip={tooltip}
                    aria-label={tooltip}
                    aria-pressed={activeMobilePanel === key}
                  >
                    {icon}
                  </button>
                ))}
              </div>

              {activeMobilePanel === 'tools' && (
                <div className="mobile-panel" style={{ marginTop:8 }}>
                  <div className="mobile-icon-grid">
                    <button className="icon-btn" data-tooltip="Undo" title="Undo" onClick={() => boardRef.current?.undo()}><Undo2 size={16} /></button>
                    <button className="icon-btn" data-tooltip="Redo" title="Redo" onClick={() => boardRef.current?.redo()}><Redo2 size={16} /></button>
                    <button className={`icon-btn ${showHistory ? 'active' : ''}`} data-tooltip="History" title="History" onClick={toggleHistory}><History size={16} /></button>
                    <button className={`icon-btn ${showLayers ? 'active' : ''}`} data-tooltip="Layers" title="Layers" onClick={toggleLayers}><Layers size={16} /></button>
                    <button
                      className={`icon-btn ${isHandMode ? 'active' : ''}`}
                      data-tooltip="Pan / Move canvas"
                      title="Pan / Move canvas"
                      onClick={() => setIsHandMode((v) => !v)}
                    >
                      <Hand size={16} />
                    </button>
                    <button
                      className={`icon-btn ${showGrid ? 'active' : ''}`}
                      data-tooltip={showGrid ? 'Hide grid' : 'Show grid'}
                      title={showGrid ? 'Hide grid' : 'Show grid'}
                      onClick={() => setShowGrid((v) => !v)}
                    >
                      <GridIcon size={16} />
                    </button>
                    <button className="icon-btn" data-tooltip="Save" title="Save" onClick={() => boardRef.current?.saveBoard?.()}><Save size={16} /></button>
                    <button className="icon-btn" data-tooltip="Download" title="Download" onClick={onDownload}><DownloadIcon size={16} /></button>
                    <label className="icon-btn" data-tooltip="Add Image" title="Add Image">
                      <ImageIcon size={16} />
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickImage(e.target.files)} />
                    </label>
                    <button className="icon-btn" data-tooltip="Clear Canvas" title="Clear Canvas" onClick={() => boardRef.current?.clear()}><Trash2 size={16} /></button>
                  </div>
                </div>
              )}

              {activeMobilePanel === 'brush' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', justifyContent:'center' }}>
                  <div className="segmented brush-grid mobile-brush-grid">
                    {brushOptions.map(({ key, Icon, glyph, label }) => (
                      <button
                        key={key}
                        className={`segmented-item ${brush===key?'active':''}`}
                        onClick={() => setBrush(key)}
                        data-tooltip={label}
                        title={label}
                      >
                        {Icon ? <Icon size={16} /> : <span className="shape-glyph">{glyph}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeMobilePanel === 'color' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ColorPicker value={color} onChange={setColorWithRecents} swatches={colorSwatches} inline={true} />
                </div>
              )}

              {activeMobilePanel === 'size' && (
                <div className="mobile-panel" style={{ marginTop:8, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <label className="tool-label">Size <span id="size-value">{size}</span>px</label>
                  <SizeControl value={size} onChange={(n) => setSize(n)} min={1} max={64} />
                  {brush === 'eraser' && (
                    <div style={{ width: '100%', marginTop: 12 }}>
                      <div className="tool-panel-title" style={{ marginTop: 0 }}>Eraser</div>
                      <div className="segmented" role="group" aria-label="Eraser mode">
                        <button className={`segmented-item ${eraserMode === 'pixel' ? 'active' : ''}`} onClick={() => setEraserMode('pixel')}>Pixel</button>
                        <button className={`segmented-item ${eraserMode === 'stroke' ? 'active' : ''}`} onClick={() => setEraserMode('stroke')}>Stroke</button>
                      </div>
                    </div>
                  )}
                  {brushIsShape && (
                    <div style={{ width: '100%', marginTop: 12 }}>
                      <div className="tool-panel-title" style={{ marginTop: 0 }}>Shape</div>
                      <label className="tool-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={shapeFill} onChange={(e) => setShapeFill(e.target.checked)} />
                        Fill
                      </label>
                      {brush === 'rect' && (
                        <>
                          <label className="tool-label">Corner Radius <span>{cornerRadius}px</span></label>
                          <SizeControl value={cornerRadius} onChange={(n) => setCornerRadius(n)} min={0} max={100} />
                        </>
                      )}
                      {brush === 'polygon' && (
                        <>
                          <label className="tool-label">Sides <span>{polygonSides}</span></label>
                          <SizeControl value={polygonSides} onChange={(n) => setPolygonSides(n)} min={3} max={20} />
                        </>
                      )}
                      {brush === 'star' && (
                        <>
                          <label className="tool-label">Points <span>{starPoints}</span></label>
                          <SizeControl value={starPoints} onChange={(n) => setStarPoints(n)} min={3} max={20} />
                        </>
                      )}
                    </div>
                  )}
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
                          {selectedTextField && (
                            <div style={{ marginTop: 12 }}>
                              <div className="tool-panel-title" style={{ marginTop: 0 }}>Text Formatting</div>
                              <div className="text-size-control">
                                <div className="text-size-meta">
                                  <span>Font Size</span>
                                  <span>{selectedTextField.fontSize}px</span>
                                </div>
                                <input
                                  type="range"
                                  min={8}
                                  max={120}
                                  value={selectedTextField.fontSize}
                                  onChange={(e) => boardRef.current?.updateTextFieldFormatting?.({ fontSize: Number(e.target.value) })}
                                  className="size-slider"
                                />
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <label className="tool-label">Font Family</label>
                                <select
                                  className="tool-select"
                                  value={selectedTextField.fontFamily || 'sans-serif'}
                                  onChange={(e) => boardRef.current?.updateTextFieldFormatting?.({ fontFamily: e.target.value })}
                                  style={{ width: '100%', padding: '6px', fontSize: '14px' }}
                                >
                                  <option value="sans-serif">Sans-serif</option>
                                  <option value="serif">Serif</option>
                                  <option value="monospace">Monospace</option>
                                  <option value="Arial">Arial</option>
                                  <option value="Helvetica">Helvetica</option>
                                  <option value="Times New Roman">Times New Roman</option>
                                  <option value="Courier New">Courier New</option>
                                  <option value="Georgia">Georgia</option>
                                  <option value="Verdana">Verdana</option>
                                </select>
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <label className="tool-label">Font Weight</label>
                                <div className="segmented" role="group">
                                  <button
                                    className={`segmented-item ${(selectedTextField.fontWeight || 'normal') === 'normal' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontWeight: 'normal' })}
                                  >
                                    Normal
                                  </button>
                                  <button
                                    className={`segmented-item ${(selectedTextField.fontWeight || 'normal') === 'bold' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontWeight: 'bold' })}
                                  >
                                    Bold
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <label className="tool-label">Font Style</label>
                                <div className="segmented" role="group">
                                  <button
                                    className={`segmented-item ${(selectedTextField.fontStyle || 'normal') === 'normal' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontStyle: 'normal' })}
                                  >
                                    Normal
                                  </button>
                                  <button
                                    className={`segmented-item ${(selectedTextField.fontStyle || 'normal') === 'italic' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontStyle: 'italic' })}
                                  >
                                    Italic
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <label className="tool-label">Text Alignment</label>
                                <div className="segmented" role="group">
                                  <button
                                    className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'left' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'left' })}
                                    title="Align Left"
                                  >
                                    <AlignLeft size={14} />
                                  </button>
                                  <button
                                    className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'center' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'center' })}
                                    title="Align Center"
                                  >
                                    <AlignCenter size={14} />
                                  </button>
                                  <button
                                    className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'right' ? 'active' : ''}`}
                                    onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'right' })}
                                    title="Align Right"
                                  >
                                    <AlignRight size={14} />
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 10 }}>
                                <label className="tool-label">Text Color</label>
                                <ColorPicker
                                  value={selectedTextField.textColor || selectedTextField.color}
                                  onChange={(newColor) => boardRef.current?.updateTextFieldFormatting?.({ textColor: newColor })}
                                  swatches={colorSwatches}
                                  inline={true}
                                />
                              </div>
                            </div>
                          )}
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
            <div className="tool-surface">
              <div className="tool-dock" ref={toolsDockRef}>
                {/* Primary tools (always visible) */}
                <button
                  className={`tool-dock-btn ${brush === 'select' && !isHandMode ? 'active' : ''}`}
                  onClick={() => selectBrushTool('select')}
                  data-tooltip="Select"
                  aria-label="Select"
                  aria-pressed={brush === 'select' && !isHandMode}
                >
                  <MousePointer2 size={18} />
                </button>
                <button
                  className={`tool-dock-btn ${brush === 'brush' && !isHandMode ? 'active' : ''}`}
                  onClick={() => selectBrushTool('brush')}
                  data-tooltip="Brush"
                  aria-label="Brush"
                  aria-pressed={brush === 'brush' && !isHandMode}
                >
                  <PenLine size={18} />
                </button>
                <button
                  className={`tool-dock-btn ${brush === 'eraser' && !isHandMode ? 'active' : ''}`}
                  onClick={() => selectBrushTool('eraser')}
                  data-tooltip="Eraser"
                  aria-label="Eraser"
                  aria-pressed={brush === 'eraser' && !isHandMode}
                >
                  <Eraser size={18} />
                </button>
                <button
                  className={`tool-dock-btn ${(activeToolPanel === 'shapes' || isShapeSelected) ? 'active' : ''}`}
                  onClick={toggleToolPanel('shapes')}
                  data-tooltip="Shapes"
                  aria-label="Shapes"
                  aria-pressed={activeToolPanel === 'shapes'}
                >
                  <Shapes size={18} />
                </button>
                <button
                  className={`tool-dock-btn ${brush === 'text' && !isHandMode ? 'active' : ''}`}
                  onClick={() => selectBrushTool('text')}
                  data-tooltip="Text"
                  aria-label="Text"
                  aria-pressed={brush === 'text' && !isHandMode}
                >
                  <Type size={18} />
                </button>

                <div className="tool-dock-sep" aria-hidden="true" />

                {/* Grouped controls */}
                <button
                  className={`tool-dock-btn ${isHandMode ? 'active' : ''}`}
                  onClick={() => setIsHandMode((v) => !v)}
                  data-tooltip="Pan"
                  aria-label="Pan"
                  aria-pressed={isHandMode}
                >
                  <Hand size={18} />
                </button>
                <label className="tool-dock-btn" data-tooltip="Add image" aria-label="Add image">
                  <ImageIcon size={18} />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPickImage(e.target.files)} />
                </label>
                <button
                  className={`tool-dock-btn ${activeToolPanel === 'color' ? 'active' : ''}`}
                  onClick={toggleToolPanel('color')}
                  data-tooltip="Color"
                  aria-label="Color"
                  aria-pressed={activeToolPanel === 'color'}
                >
                  <Palette size={18} />
                </button>
                <button
                  className={`tool-dock-btn ${activeToolPanel === 'size' ? 'active' : ''}`}
                  onClick={toggleToolPanel('size')}
                  data-tooltip="Size"
                  aria-label="Size"
                  aria-pressed={activeToolPanel === 'size'}
                >
                  <SlidersHorizontal size={18} />
                </button>
              </div>

              {activeToolPanel && (
                <div
                  className="tool-panel"
                  ref={toolsPanelRef}
                  data-panel={activeToolPanel}
                  data-side={toolPanelSide}
                  style={{
                    left: `${toolPanelLeft}px`,
                    top: `${toolPanelTop}px`,
                    ['--arrow-top' as any]: `${toolArrowTop}px`,
                    ['--anchor-top' as any]: `${toolAnchorRect?.top ?? 0}px`,
                  }}
                  role="dialog"
                  aria-label="Tool options"
                >
                  {activeToolPanel === 'shapes' && (
                    <>
                      <div className="tool-panel-list icons-only">
                        {([
                          { key: 'line', label: 'Line', Icon: Slash },
                          { key: 'rect', label: 'Rectangle', Icon: Square },
                          { key: 'ellipse', label: 'Ellipse', Icon: Circle },
                          { key: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
                          { key: 'double-arrow', label: 'Double Arrow', Icon: ArrowLeftRight },
                          { key: 'triangle', label: 'Triangle', Icon: TriangleIcon },
                          { key: 'diamond', label: 'Diamond', Icon: DiamondIcon },
                          { key: 'hexagon', label: 'Hexagon', Icon: HexagonIcon },
                          { key: 'polygon', label: 'Polygon', Icon: Shapes },
                          { key: 'star', label: 'Star', Icon: Sparkles },
                        ] as Array<{ key: BrushKind; label: string; Icon: React.ComponentType<{ size?: number }> }>).map(({ key, label, Icon }) => (
                          <button
                            key={key}
                            className={`tool-panel-item icon-only ${brush === key && !isHandMode ? 'active' : ''}`}
                            onClick={() => selectBrushTool(key)}
                            data-tooltip={label}
                            title={label}
                          >
                            <span className="tool-panel-item-icon"><Icon size={14} /></span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {activeToolPanel === 'color' && (
                    <>
                      <div className="tool-panel-title">Color</div>
                      <ColorPicker value={color} onChange={setColorWithRecents} swatches={colorSwatches} inline={true} />
                    </>
                  )}

                  {activeToolPanel === 'size' && (
                    <>
                      <div className="tool-panel-title">Size</div>
                      <label className="tool-label">Stroke <span id="size-value">{size}</span>px</label>
                      <SizeControl value={size} onChange={(n) => setSize(n)} min={1} max={64} />

                      {brush === 'eraser' && (
                        <div style={{ marginTop: 10 }}>
                          <div className="tool-panel-title" style={{ marginTop: 8 }}>Eraser</div>
                          <div className="segmented" role="group" aria-label="Eraser mode">
                            <button className={`segmented-item ${eraserMode === 'pixel' ? 'active' : ''}`} onClick={() => setEraserMode('pixel')}>Pixel</button>
                            <button className={`segmented-item ${eraserMode === 'stroke' ? 'active' : ''}`} onClick={() => setEraserMode('stroke')}>Stroke</button>
                          </div>
                        </div>
                      )}

                      {brushIsShape && (
                        <div style={{ marginTop: 10 }}>
                          <div className="tool-panel-title" style={{ marginTop: 8 }}>Shape</div>
                          <label className="tool-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={shapeFill} onChange={(e) => setShapeFill(e.target.checked)} />
                            Fill
                          </label>
                          {brush === 'rect' && (
                            <>
                              <label className="tool-label">Corner Radius <span>{cornerRadius}px</span></label>
                              <SizeControl value={cornerRadius} onChange={(n) => setCornerRadius(n)} min={0} max={100} />
                            </>
                          )}
                          {brush === 'polygon' && (
                            <>
                              <label className="tool-label">Sides <span>{polygonSides}</span></label>
                              <SizeControl value={polygonSides} onChange={(n) => setPolygonSides(n)} min={3} max={20} />
                            </>
                          )}
                          {brush === 'star' && (
                            <>
                              <label className="tool-label">Points <span>{starPoints}</span></label>
                              <SizeControl value={starPoints} onChange={(n) => setStarPoints(n)} min={3} max={20} />
                            </>
                          )}
                        </div>
                      )}

                      {(brush === 'text' || selectedTextField) && (
                        <div style={{ marginTop: 10 }}>
                          <div className="tool-panel-title" style={{ marginTop: 8 }}>Text Box</div>
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
                              <div style={{ marginTop: 12 }}>
                                <div className="tool-panel-title" style={{ marginTop: 0 }}>Text Formatting</div>
                                <div className="text-size-control">
                                  <div className="text-size-meta">
                                    <span>Font Size</span>
                                    <span>{selectedTextField.fontSize}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={8}
                                    max={120}
                                    value={selectedTextField.fontSize}
                                    onChange={(e) => boardRef.current?.updateTextFieldFormatting?.({ fontSize: Number(e.target.value) })}
                                    className="size-slider"
                                  />
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <label className="tool-label">Font Family</label>
                                  <select
                                    className="tool-select"
                                    value={selectedTextField.fontFamily || 'sans-serif'}
                                    onChange={(e) => boardRef.current?.updateTextFieldFormatting?.({ fontFamily: e.target.value })}
                                  >
                                    <option value="sans-serif">Sans-serif</option>
                                    <option value="serif">Serif</option>
                                    <option value="monospace">Monospace</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Helvetica">Helvetica</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                    <option value="Courier New">Courier New</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Verdana">Verdana</option>
                                  </select>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <label className="tool-label">Font Weight</label>
                                  <div className="segmented" role="group">
                                    <button
                                      className={`segmented-item ${(selectedTextField.fontWeight || 'normal') === 'normal' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontWeight: 'normal' })}
                                    >
                                      Normal
                                    </button>
                                    <button
                                      className={`segmented-item ${(selectedTextField.fontWeight || 'normal') === 'bold' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontWeight: 'bold' })}
                                    >
                                      Bold
                                    </button>
                                  </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <label className="tool-label">Font Style</label>
                                  <div className="segmented" role="group">
                                    <button
                                      className={`segmented-item ${(selectedTextField.fontStyle || 'normal') === 'normal' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontStyle: 'normal' })}
                                    >
                                      Normal
                                    </button>
                                    <button
                                      className={`segmented-item ${(selectedTextField.fontStyle || 'normal') === 'italic' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ fontStyle: 'italic' })}
                                    >
                                      Italic
                                    </button>
                                  </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <label className="tool-label">Text Alignment</label>
                                  <div className="segmented" role="group">
                                    <button
                                      className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'left' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'left' })}
                                      title="Align Left"
                                    >
                                      <AlignLeft size={14} />
                                    </button>
                                    <button
                                      className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'center' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'center' })}
                                      title="Align Center"
                                    >
                                      <AlignCenter size={14} />
                                    </button>
                                    <button
                                      className={`segmented-item ${(selectedTextField.textAlign || 'left') === 'right' ? 'active' : ''}`}
                                      onClick={() => boardRef.current?.updateTextFieldFormatting?.({ textAlign: 'right' })}
                                      title="Align Right"
                                    >
                                      <AlignRight size={14} />
                                    </button>
                                  </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <label className="tool-label">Text Color</label>
                                  <ColorPicker
                                    value={selectedTextField.textColor || selectedTextField.color}
                                    onChange={(newColor) => boardRef.current?.updateTextFieldFormatting?.({ textColor: newColor })}
                                    swatches={colorSwatches}
                                    inline={true}
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="tool-hint" style={{ margin: 0 }}>Select a text box to resize.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                </div>
              )}
            </div>
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
            eraserMode={eraserMode}
            shapeFill={shapeFill}
            cornerRadius={cornerRadius}
            polygonSides={polygonSides}
            starPoints={starPoints}
            onHistoryUpdate={handleHistoryUpdate}
            showGrid={showGrid}
            onTextFieldChange={handleTextFieldChange}
            panMode={isHandMode}
          />
          {/* Desktop: workflow actions bottom-center */}
          {!isMobile && (
            <div className="canvas-actions" role="toolbar" aria-label="Canvas actions">
              <button className="icon-btn" data-tooltip="Undo" title="Undo" onClick={() => boardRef.current?.undo()}><Undo2 size={16} /></button>
              <button className="icon-btn" data-tooltip="Redo" title="Redo" onClick={() => boardRef.current?.redo()}><Redo2 size={16} /></button>
              <button className={`icon-btn ${showHistory ? 'active' : ''}`} data-tooltip="History" onClick={toggleHistory} title="History"><History size={16} /></button>
              <button className={`icon-btn ${showLayers ? 'active' : ''}`} data-tooltip="Layers" onClick={toggleLayers} title="Layers"><Layers size={16} /></button>
              <button
                className={`icon-btn ${showGrid ? 'active' : ''}`}
                data-tooltip={showGrid ? 'Hide grid' : 'Show grid'}
                title={showGrid ? 'Hide grid' : 'Show grid'}
                onClick={() => setShowGrid((v) => !v)}
              >
                <GridIcon size={16} />
              </button>
              <button className="icon-btn" data-tooltip="Download" title="Download" onClick={onDownload}><DownloadIcon size={16} /></button>
              <button className="icon-btn" data-tooltip="Clear Canvas" title="Clear Canvas" onClick={() => boardRef.current?.clear()}><Trash2 size={16} /></button>
            </div>
          )}

          {/* Desktop: view controls bottom-right */}
          {!isMobile && (
            <div className="canvas-zoom" role="toolbar" aria-label="Canvas zoom">
              <button className="icon-btn" data-tooltip="Zoom out" onClick={() => boardRef.current?.setZoom(-0.1)} title="Zoom out"><ZoomOut size={16} /></button>
              <button className="icon-btn" data-tooltip="Reset view" onClick={() => boardRef.current?.resetView()} title="Reset view"><Maximize size={16} /></button>
              <button className="icon-btn" data-tooltip="Zoom in" onClick={() => boardRef.current?.setZoom(0.1)} title="Zoom in"><ZoomIn size={16} /></button>
            </div>
          )}
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
          {showLayers && (
            <div className="layers-popover" role="dialog" aria-label="Canvas layers">
              <div className="layers-header">
                <span className="layers-title">Layers</span>
                <div className="layers-header-actions">
                  <button
                    className="icon-btn small"
                    title="Add layer"
                    aria-label="Add layer"
                    onClick={() => {
                      boardRef.current?.createLayer?.();
                      refreshLayers();
                    }}
                  >
                    <Plus size={16} />
                  </button>
                  <button className="icon-btn small" onClick={() => setShowLayers(false)} aria-label="Close layers">✕</button>
                </div>
              </div>
              <div className="layers-hint">
                New drawing/text goes to the <strong>active</strong> layer.
                {selectedTextField ? ' Select a layer row to set active, or use ↔ to move the selected text box.' : ''}
              </div>
              <div className="layers-list">
                {(() => {
                  const layerList = layers.length ? layers : [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false }];
                  const listLen = layerList.length;
                  return layerList.map((layer, idx) => {
                  const isActive = layer.id === activeLayerId;
                  const isEditing = editingLayerId === layer.id;
                  const canMoveUp = idx > 0;
                  const canMoveDown = idx < listLen - 1;
                  const canDelete = listLen > 1;
                  return (
                    <div key={layer.id} className={`layers-item ${isActive ? 'active' : ''}`}>
                      <button
                        className="icon-btn small"
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                        aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                        onClick={() => {
                          boardRef.current?.toggleLayerVisibility?.(layer.id);
                          refreshLayers();
                        }}
                      >
                        {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>

                      <button
                        className="icon-btn small"
                        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                        onClick={() => {
                          boardRef.current?.toggleLayerLock?.(layer.id);
                          refreshLayers();
                        }}
                      >
                        {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>

                      <div className="layers-main">
                        {!isEditing ? (
                          <button
                            type="button"
                            className="layers-name"
                            aria-pressed={isActive}
                            onClick={() => {
                              boardRef.current?.setActiveLayerId?.(layer.id);
                              setActiveLayerId(layer.id);
                              refreshLayers();
                            }}
                            onDoubleClick={() => {
                              setEditingLayerId(layer.id);
                              setEditingLayerName(layer.name);
                            }}
                            title="Click to set active. Double-click to rename."
                          >
                            {layer.name}
                          </button>
                        ) : (
                          <input
                            className="layers-rename"
                            value={editingLayerName}
                            autoFocus
                            onChange={(e) => setEditingLayerName(e.target.value)}
                            onBlur={() => {
                              boardRef.current?.renameLayer?.(layer.id, editingLayerName);
                              setEditingLayerId(null);
                              setEditingLayerName('');
                              refreshLayers();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                boardRef.current?.renameLayer?.(layer.id, editingLayerName);
                                setEditingLayerId(null);
                                setEditingLayerName('');
                                refreshLayers();
                              }
                              if (e.key === 'Escape') {
                                setEditingLayerId(null);
                                setEditingLayerName('');
                              }
                            }}
                          />
                        )}
                      </div>

                      {selectedTextField && (
                        <button
                          className="icon-btn small"
                          title="Move selected text box to this layer"
                          aria-label="Move selected text box to this layer"
                          onClick={() => {
                            boardRef.current?.moveSelectedTextFieldToLayer?.(layer.id);
                            refreshLayers();
                          }}
                        >
                          <ArrowLeftRight size={16} />
                        </button>
                      )}

                      <button
                        className="icon-btn small"
                        disabled={!canMoveUp}
                        title="Move layer up"
                        aria-label="Move layer up"
                        onClick={() => {
                          boardRef.current?.moveLayer?.(layer.id, 'up');
                          refreshLayers();
                        }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        className="icon-btn small"
                        disabled={!canMoveDown}
                        title="Move layer down"
                        aria-label="Move layer down"
                        onClick={() => {
                          boardRef.current?.moveLayer?.(layer.id, 'down');
                          refreshLayers();
                        }}
                      >
                        <ChevronDown size={16} />
                      </button>

                      <button
                        className="icon-btn small danger"
                        disabled={!canDelete}
                        title="Delete layer"
                        aria-label="Delete layer"
                        onClick={() => {
                          boardRef.current?.deleteLayer?.(layer.id);
                          refreshLayers();
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                  });
                })()}
              </div>
            </div>
          )}
        </section>

        {!isMobile && (
          <div
            className="ai-float"
            style={{
              position: 'fixed',
              top: aiPanelPos.y,
              left: aiPanelPos.x,
              width: aiPanelMaximized ? Math.max(320, (typeof window !== 'undefined' ? window.innerWidth : 0) - 24) : aiPanelSize.width,
              height: aiPanelMinimized
                ? 'auto'
                : aiPanelMaximized
                ? Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 0) - 80)
                : aiPanelSize.height,
              maxHeight: 'calc(100vh - 24px)',
              zIndex: 30,
              boxShadow: '0 12px 30px rgba(0,0,0,0.22)',
              borderRadius: 12,
              background: 'var(--card-bg, #0b1220)',
              border: aiBorderActive ? '1px solid var(--accent, #5b8def)' : '1px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 300,
            }}
          >
            <div
              className="ai-float-header"
              style={{
                cursor: aiDragRef.current ? 'grabbing' : 'grab',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                userSelect: 'none',
              }}
              onPointerDown={startAiDrag}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Move size={14} />
                <span>AI Response</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="icon-btn"
                  title={aiPanelMinimized ? 'Restore' : 'Minimize'}
                  onClick={toggleAiMinimize}
                  style={{ cursor: 'pointer' }}
                >
                  {aiPanelMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                </button>
                <button
                  className="icon-btn"
                  title={aiPanelMaximized ? 'Restore size' : 'Maximize'}
                  onClick={toggleAiMaximize}
                  style={{ cursor: 'pointer' }}
                >
                  {aiPanelMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              </div>
            </div>
            {!aiPanelMinimized && (
              <>
                <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
                    <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card" style={{ margin: 0, height: '100%', display:'flex', flexDirection:'column', gap:12 }}>
                    <div className="card-header" style={{ alignItems:'center', gap:8, justifyContent:'space-between' }}>
                      <div className="ai-meta-row" style={{ margin:0 }}>
                        <span className={`pill ${isAnalyzing ? 'warn' : 'success'}`}>{isAnalyzing ? 'Processing…' : 'Ready'}</span>
                        <span className="pill neutral">Provider: {provider === 'openai' ? 'OpenAI' : provider}</span>
                      </div>
                      <button className="icon-btn" data-tooltip="Copy" title="Copy" onClick={copyAiResponse}>⧉</button>
                    </div>
                    <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`} style={{ flex: 1, minHeight:0 }}>
                      <div className="ai-output-box">
                        <div dangerouslySetInnerHTML={{ __html: renderMathOnly(aiText) }} />
                      </div>
                    </div>
                    {/* AI features enabled */}
                    {true && (
                      <>
                        <div className="ai-ask">
                          <input
                            className="ask-input"
                            placeholder="Ask AI (optional prompt)"
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                          />
                          <button
                            className={`btn accent ask-btn ${isAnalyzing ? 'beam' : ''} ${askClicked ? 'clicked' : ''}`}
                            title="Ask AI"
                            data-tooltip="Ask AI"
                            onClick={onAnalyze}
                            aria-label="Ask AI"
                            style={{ borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: '1px solid rgba(37,99,235,0.4)' }}
                          >
                            <Send size={16} />
                            <span>Ask AI</span>
                          </button>
                        </div>
                        {/* AI enhancements hidden per request */}
                      </>
                    )}
                  </div>
                </div>
                {!aiPanelMaximized && (
                  <div
                    onPointerDown={startAiResize}
                    style={{
                      position: 'absolute',
                      width: 16,
                      height: 16,
                      bottom: 6,
                      right: 6,
                      cursor: 'nwse-resize',
                      opacity: 0.8,
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
        {isMobile && (
          <aside className="panel-mobile ai-mobile">
            <div className={`card ${aiBorderActive ? 'beam' : ''}`} id="ai-card" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="card-header" style={{ alignItems:'center', gap:8, justifyContent:'space-between' }}>
                <div className="ai-meta-row" style={{ margin:0 }}>
                  <span className={`pill ${isAnalyzing ? 'warn' : 'success'}`}>{isAnalyzing ? 'Processing…' : 'Ready'}</span>
                  <span className="pill neutral">Provider: {provider === 'openai' ? 'OpenAI' : provider}</span>
                </div>
                <button className="icon-btn" title="Copy" onClick={copyAiResponse}>⧉</button>
              </div>
                    <div className={`ai-output ${isAnalyzing ? 'loading' : ''}`} style={{ flex: 1, minHeight:0 }}>
                      <div className="ai-output-box">
                        <div dangerouslySetInnerHTML={{ __html: renderMathOnly(aiText) }} />
                      </div>
                    </div>
              {/* AI features enabled */}
              {true && (
                <>
                  <div className="ai-ask">
                    <input
                      className="ask-input"
                      placeholder="Ask AI (optional prompt)"
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                    />
                    <button
                      className={`btn accent ask-btn ${isAnalyzing ? 'beam' : ''} ${askClicked ? 'clicked' : ''}`}
                      onClick={onAnalyze}
                      aria-label="Ask AI"
                      style={{ borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: '1px solid rgba(37,99,235,0.4)' }}
                    >
                      <Send size={16} />
                      <span>Ask AI</span>
                    </button>
                  </div>
                  {/* AI enhancements hidden per request */}
                </>
              )}
            </div>
          </aside>
        )}
      </main>

      {/* IntegrationSection removed per request */}

      {/* Footer removed per request */}

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

      {showExportMenu && (
        <div 
          className="about-modal" 
          role="dialog" 
          aria-modal="true" 
          aria-label="Export options"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowExportMenu(false);
            }
          }}
        >
          <div className="about-header">
            <strong>Export {exportIsSelection ? 'Selection' : 'Canvas'}</strong>
            <button className="icon-btn" onClick={() => setShowExportMenu(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="tool-label" style={{ marginBottom: '8px', display: 'block' }}>Format</label>
                <div className="segmented" role="group" aria-label="Export format">
                  <button 
                    className={`segmented-item ${exportFormat === 'png' ? 'active' : ''}`} 
                    onClick={() => setExportFormat('png')}
                  >
                    PNG
                  </button>
                  <button 
                    className={`segmented-item ${exportFormat === 'svg' ? 'active' : ''}`} 
                    onClick={() => setExportFormat('svg')}
                  >
                    SVG
                  </button>
                  <button 
                    className={`segmented-item ${exportFormat === 'pdf' ? 'active' : ''}`} 
                    onClick={() => setExportFormat('pdf')}
                  >
                    PDF
                  </button>
                </div>
              </div>
              
              <div>
                <label className="tool-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={exportTransparent} 
                    onChange={(e) => setExportTransparent(e.target.checked)}
                    disabled={exportFormat === 'pdf'}
                  />
                  <span>Transparent background</span>
                </label>
                {exportFormat === 'pdf' && (
                  <p className="tool-hint" style={{ marginTop: '4px', fontSize: '12px', color: '#888' }}>
                    PDF format doesn't support transparency
                  </p>
                )}
              </div>
              
              <div>
                <label className="tool-label" style={{ marginBottom: '8px', display: 'block' }}>
                  Resolution (DPI): <span id="dpi-value">{exportDpi}</span>
                </label>
                <input
                  type="range"
                  min="72"
                  max="300"
                  step="24"
                  value={exportDpi}
                  onChange={(e) => setExportDpi(Number(e.target.value))}
                  className="size-slider"
                  disabled={exportFormat === 'svg'}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  <span>72 (Web)</span>
                  <span>150 (Print)</span>
                  <span>300 (High)</span>
                </div>
                {exportFormat === 'svg' && (
                  <p className="tool-hint" style={{ marginTop: '4px', fontSize: '12px', color: '#888' }}>
                    SVG is vector format, resolution independent
                  </p>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn accent" onClick={handleExport}>
                  Export
                </button>
                <button className="btn" onClick={() => setShowExportMenu(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
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


