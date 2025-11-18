import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bolt, Code2, Braces, Layers, Cloud, Sparkles, Menu, X, Sun, Moon, HelpCircle, Mail, MessageSquare, Rocket } from "lucide-react";
import brandLogo from "../../assets/Logo.png";
import heroOneLarge from "../../assets/hero/hero-1-1600.jpg";
import heroOneMedium from "../../assets/hero/hero-1-900.jpg";
import heroTwoLarge from "../../assets/hero/hero-2-1600.jpg";
import heroTwoMedium from "../../assets/hero/hero-2-900.jpg";
import heroThreeLarge from "../../assets/hero/hero-3-1600.jpg";
import heroThreeMedium from "../../assets/hero/hero-3-900.jpg";

const STYLE_ID = "hero3-animations";

const getRootTheme = () => {
  if (typeof document === "undefined") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.getAttribute("data-theme") === "dark" || (root as any).dataset?.theme === "dark") return "dark";
  if (root.classList.contains("light")) return "light";
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
};

const useThemeSync = () => {
  const [theme, setTheme] = useState<"dark" | "light">(() => getRootTheme() as "dark" | "light");
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => {
      const next = getRootTheme() as "dark" | "light";
      setTheme((prev) => (prev === next ? prev : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onMedia = () => sync();
    media?.addEventListener("change", onMedia);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "theme") sync();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", onMedia as any);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  }, []);
  return [theme, setTheme] as const;
};

const DeckGlyph = ({ theme = "dark" }: { theme?: "dark" | "light" }) => {
  const stroke = theme === "dark" ? "#f5f5f5" : "#111111";
  const fill = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(17,17,17,0.08)";
  return (
    <svg viewBox="0 0 120 120" className="h-16 w-16" aria-hidden>
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        className="motion-safe:animate-[hero3-orbit_8.5s_linear_infinite] motion-reduce:animate-none"
        style={{ strokeDasharray: "18 14" }}
      />
      <rect
        x="34"
        y="34"
        width="52"
        height="52"
        rx="14"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.2"
        className="motion-safe:animate-[hero3-grid_5.4s_ease-in-out_infinite] motion-reduce:animate-none"
      />
      <circle cx="60" cy="60" r="7" fill={stroke} />
      <path
        d="M60 30v10M60 80v10M30 60h10M80 60h10"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        className="motion-safe:animate-[hero3-pulse_6s_ease-in-out_infinite] motion-reduce:animate-none"
      />
    </svg>
  );
};

function HeroOrbitDeck() {
  const [theme, setTheme] = useThemeSync();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"strategy" | "execution">("strategy");
  const sectionRef = useRef<HTMLElement | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showHowModal, setShowHowModal] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  // rotating headline words
  const headlineWords = ["Sketch", "Solve", "Describe"] as const;
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.innerHTML = `
      @keyframes hero3-intro {
        0% { opacity: 0; transform: translate3d(0, 64px, 0) scale(0.98); filter: blur(12px); }
        60% { filter: blur(0); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
      }
      @keyframes hero3-card {
        0% { opacity: 0; transform: translate3d(0, 32px, 0) scale(0.95); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes hero3-orbit {
        0% { stroke-dashoffset: 0; transform: rotate(0deg); }
        100% { stroke-dashoffset: -64; transform: rotate(360deg); }
      }
      @keyframes hero3-grid {
        0%, 100% { transform: rotate(-2deg); opacity: 0.7; }
        50% { transform: rotate(2deg); opacity: 1; }
      }
      @keyframes hero3-pulse {
        0%, 100% { stroke-dasharray: 0 200; opacity: 0.2; }
        45%, 60% { stroke-dasharray: 200 0; opacity: 1; }
      }
      @keyframes hero3-glow {
        0%, 100% { opacity: 0.45; transform: translate3d(0,0,0); }
        50% { opacity: 0.9; transform: translate3d(0,-8px,0); }
      }
      @keyframes hero3-drift {
        0%, 100% { transform: translate3d(0,0,0) rotate(-3deg); }
        50% { transform: translate3d(0,-12px,0) rotate(3deg); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    if (!sectionRef.current || typeof window === "undefined") {
      setVisible(true);
      return;
    }
    const node = sectionRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const current = getRootTheme();
    const next = current === "dark" ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("light", next === "light");
    root.setAttribute("data-theme", next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage?.setItem("theme", next);
      } catch (_err) {}
    }
    setTheme(next as "dark" | "light");
  };

  const palette = useMemo(
    () => ({
      surface: "u-surface",
      subtle: "u-subtle",
      border: "u-border",
      card: "u-card",
      accent: "u-accent",
      glow: theme === 'dark' ? 'rgba(14,165,233,0.22)' : 'rgba(14,165,233,0.18)',
    }),
    [theme]
  );

  const metrics = [
    { label: "Tools", value: "7+" },
    { label: "Avg response", value: "~1.2s" },
    { label: "Saved boards", value: "Local" },
  ];

  const modes = useMemo(
    () => ({
      strategy: {
        title: "Sketch mode",
        description:
          "Fast canvas for drawing, annotating screenshots, and diagramming. Optimized for mouse, pen, and trackpad.",
        items: [
          "Brush, marker, highlighter, eraser",
          "Lines, rectangles, ellipses",
          "Zoom, reset, undo/redo",
        ],
      },
      execution: {
        title: "AI assist",
        description:
          "Send the canvas to AI for descriptions, summaries, or math steps. Optional prompt supported.",
        items: [
          "OpenAI and Gemini providers",
          "Prompt input with history limit",
          "Copyable responses",
        ],
      },
    }),
    []
  );

  const activeMode = (modes as any)[mode];

  const protocols = [
    {
      name: "Draw",
      detail: "Pick a tool and color, sketch or drop an image onto the board.",
      status: "Ready",
    },
    {
      name: "Ask AI",
      detail: "Optionally type a prompt, then get a description, summary, or solution.",
      status: "Go",
    },
    {
      name: "Export",
      detail: "Save your board locally or download a PNG to share anywhere.",
      status: "Done",
    },
  ];

  const setSpotlight = (event: React.MouseEvent<HTMLLIElement>) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--hero3-x", `${event.clientX - rect.left}px`);
    target.style.setProperty("--hero3-y", `${event.clientY - rect.top}px`);
  };

  const clearSpotlight = (event: React.MouseEvent<HTMLLIElement>) => {
    const target = event.currentTarget as HTMLElement;
    target.style.removeProperty("--hero3-x");
    target.style.removeProperty("--hero3-y");
  };

  const showcaseImages = [
    {
      src: heroOneLarge,
      srcSet: `${heroOneMedium} 900w, ${heroOneLarge} 1600w`,
      alt: "Cognito canvas preview 1",
    },
    {
      src: heroTwoLarge,
      srcSet: `${heroTwoMedium} 900w, ${heroTwoLarge} 1600w`,
      alt: "Cognito canvas preview 2",
    },
    {
      src: heroThreeLarge,
      srcSet: `${heroThreeMedium} 900w, ${heroThreeLarge} 1600w`,
      alt: "Cognito canvas preview 3",
    },
  ];
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSlide((s) => (s + 1) % showcaseImages.length), 4500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const set = () => setIsDesktop(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  // rotate headline periodically
  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((i) => (i + 1) % headlineWords.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, []);

  const brands = [
    { name: 'React', color: '#61DAFB', Icon: Code2 },
    { name: 'Vite', color: '#646CFF', Icon: Bolt },
    { name: 'TypeScript', color: '#3178C6', Icon: Braces },
    { name: 'Tailwind', color: '#38BDF8', Icon: Layers },
    { name: 'Express', color: '#111111', Icon: Code2 },
    { name: 'OpenAI', color: '#00A67E', Icon: Sparkles },
    { name: 'Gemini', color: '#4285F4', Icon: Cloud },
  ];

  return (
    <div className={`relative isolate min-h-screen w-full transition-colors duration-700 ${palette.surface}`}>
      <header className="sticky top-3 z-50">
        <div className="mx-auto mb-4 w-auto flex max-w-[1440px] items-center justify-between gap-4 rounded-full border-0 px-5 py-3 shadow glass">
          <a href="/" className="flex items-center gap-3" aria-label="Cognito Home">
            <img src={brandLogo} alt="Cognito" width={120} height={32} className="h-10 w-auto" decoding="async" />
          </a>
          {isDesktop ? (
            <nav className="flex items-center gap-4 text-sm u-subtle">
              <button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="link-plain text-center" onClick={() => setShowHowModal(true)}>How it works</button>
              <a href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer" className="link-plain text-center">Feedback</a>
              <button className="link-plain text-center" onClick={() => setShowContact(true)}>Contact</button>
              <a href="/" className="btn-cta px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.35em]"><Rocket size={16} /> Launch</a>
            </nav>
          ) : (
            <div className="flex items-center gap-2">
              <button className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="icon-btn" aria-label="Toggle menu" onClick={() => setShowMobileMenu(v=>!v)}>
                {showMobileMenu ? <X size={16} /> : <Menu size={16} />}
              </button>
            </div>
          )}
        </div>
        {!isDesktop && showMobileMenu && (
          <div className="md:hidden border-t u-border u-card">
            <div className="mx-auto max-w-[1440px] px-5 py-3 grid gap-3 text-sm">
              <button className="link-plain text-center" onClick={()=>{setShowHowModal(true); setShowMobileMenu(false);}}>How it works</button>
              <a href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer" onClick={()=>setShowMobileMenu(false)} className="link-plain text-center">Feedback</a>
              <button className="link-plain text-center" onClick={()=>{setShowContact(true); setShowMobileMenu(false);}}>Contact</button>
              <a href="/" onClick={()=>setShowMobileMenu(false)} className="btn-cta px-3 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-center" style={{ borderRadius: 9999 }}><Rocket size={16} /> Launch</a>
            </div>
          </div>
        )}
      </header>
      <div className="fx-aurora" aria-hidden />
      <section
        ref={sectionRef as any}
        className={`relative flex min-h-screen w-full flex-col gap-12 px-6 py-14 transition-opacity duration-700 md:gap-16 md:px-10 lg:px-16 xl:px-24 ${
          visible ? "motion-safe:animate-[hero3-intro_1s_cubic-bezier(.22,.68,0,1)_forwards]" : "opacity-0"
        }`}
      >
        <header className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-end">
          <div className="space-y-8">
            
            <div className="space-y-6">
              <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl hover-tilt">
                <span className="rotator curve-underline text-shimmer" aria-live="polite">
                  {headlineWords.map((w, i) => (
                    <span key={w} className={`rotator-item ${i === wordIndex ? 'active' : ''}`}>{w}</span>
                  ))}
                  <span style={{ visibility: 'hidden' }}>{headlineWords[0]}</span>
                </span>
                {" "}on an AI‑powered canvas.
              </h1>
              <p className={`max-w-2xl text-base md:text-lg ${(palette as any).subtle}`}>
                Draw with fast, minimal tools - then send your board to AI for explanations or step-by-step math. Built with React and Vite, tuned for clarity in light and dark.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/"
                  className="btn-cta px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em]"
                >
                  Open Canvas
                </a>
                <a
                  href="https://forms.gle/gzvFHB3RdxW71o9t6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-full border px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] transition ${(palette as any).border} ${(palette as any).accent}`}
                >
                  Feedback
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="chip-success">
              <span className="dot" />
              AI Mode
            </div>
              <div className="marquee">
                <div className="marquee-track">
                  {brands.concat(brands).map(({ name, color, Icon }, i) => (
                    <span key={name + '-' + i} className="brand-chip" style={{ ['--brand' as any]: color }}>
                      <Icon />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={`relative flex flex-col gap-6 rounded-3xl border p-8 transition ${palette.border} ${palette.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em]">Mode</p>
                <h2 className="text-xl font-semibold tracking-tight">{activeMode.title}</h2>
              </div>
              <DeckGlyph theme={theme} />
            </div>
            <p className={`text-sm leading-relaxed ${palette.subtle}`}>{activeMode.description}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("strategy")}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition ${
                  mode === "strategy" ? "bg-[var(--color-primary)] text-black" : `${palette.border} ${palette.accent}`
                }`}
              >
                Strategy
              </button>
              <button
                type="button"
                onClick={() => setMode("execution")}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition ${
                  mode === "execution" ? "bg-[var(--color-primary)] text-black" : `${palette.border} ${palette.accent}`
                }`}
              >
                Execution
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {activeMode.items.map((item: string) => (
                <li key={item} className={`flex items-start gap-3 ${palette.subtle}`}>
                  <span className="mt-1 h-2 w-2 rounded-full bg-current" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </header>
        <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] xl:items-stretch">
          <div id="features" className={`order-2 flex flex-col gap-6 rounded-3xl border p-8 transition ${palette.border} ${palette.card} xl:order-1`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.35em]">Features</h3>
            </div>
            <p className={`text-sm leading-relaxed ${palette.subtle}`}>
              A lightweight drawing surface for classrooms, teams, and makers. Keep focus with strict contrast discipline and subtle motion.
            </p>
            <div className="grid gap-3">
              {[
                { 
                  label: "Brushes, shapes, eraser", 
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7M3 22v-6h6M21 12a9 9 0 0 1-15 6.7"/></svg>
                },
                { 
                  label: "Ask AI (OpenAI or Gemini)", 
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="5"/></svg>
                },
                { 
                  label: "Save boards, download PNG", 
                  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                }
              ].map(({ label, icon }) => (
                <div key={label} className="relative overflow-hidden rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.3em] transition duration-500 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_14px_40px_rgba(0,0,0,0.45)] flex items-center gap-3">
                  <span className={`flex-shrink-0 ${palette.accent}`} style={{ opacity: 0.7 }}>{icon}</span>
                  <span className="flex-1">{label}</span>
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 hover:opacity-100" style={{ background: `radial-gradient(180px circle at 50% 20%, ${palette.glow}, transparent 70%)` }} />
                </div>
              ))}
            </div>
          </div>
          <figure className="order-1 overflow-hidden rounded-[32px] border transition xl:order-2 hover-tilt" style={{ position: "relative" }}>
            <div className="relative w-full pb-[120%] sm:pb-[90%] lg:pb-[72%] float-y">
              <img
                src={showcaseImages[slide].src}
                srcSet={showcaseImages[slide].srcSet}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 55vw"
                alt={showcaseImages[slide].alt}
                width={1600}
                height={1067}
                loading={slide === 0 ? 'eager' : 'lazy'}
                fetchPriority={slide === 0 ? 'high' : 'auto'}
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover grayscale transition duration-700 ease-out hover:scale-[1.03]"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50 mix-blend-soft-light dark:from-white/10" />
              <div className="pointer-events-none absolute inset-0 border border-white/10 mix-blend-overlay dark:border-white/20" />
              <span className="pointer-events-none absolute -left-16 top-16 h-40 w-40 rounded-full border border-white/15 opacity-70 motion-safe:animate-[hero3-glow_9s_ease-in-out_infinite]" />
              <span className="pointer-events-none absolute -right-12 bottom-16 h-48 w-48 rounded-full border border-white/10 opacity-40 motion-safe:animate-[hero3-drift_12s_ease-in-out_infinite]" />
            </div>
            <figcaption className={`flex items-center justify-between px-6 py-5 text-xs uppercase tracking-[0.35em] ${palette.subtle}`}>
              <span>Canvas preview</span>
              <span className="flex items-center gap-2">
                <span className="h-1 w-8 bg-current" />
                {slide + 1}/{showcaseImages.length}
              </span>
            </figcaption>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {showcaseImages.map((_, i) => (
                <button key={i} aria-label={`Go to slide ${i+1}`} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i===slide? 'w-6 bg-white/90 dark:bg-white' : 'w-2 bg-white/40 dark:bg-white/40'}`} />
              ))}
            </div>
          </figure>
          <aside id="how" className={`order-3 flex flex-col gap-6 rounded-3xl border p-8 transition fx-border-hover ${palette.border} ${palette.card} xl:order-3`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.35em]">How it works</h3>
              <span className="text-xs uppercase tracking-[0.35em] opacity-60">3 steps</span>
            </div>
            <ul className="space-y-4">
              {protocols.map((protocol, index) => (
                <li
                  key={protocol.name}
                  onMouseMove={setSpotlight}
                  onMouseLeave={clearSpotlight}
                  className="group relative overflow-hidden rounded-2xl border px-5 py-4 transition duration-500 hover:-translate-y-0.5"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
                    style={{
                      background:
                        theme === "dark"
                          ? "radial-gradient(190px circle at var(--hero3-x, 50%) var(--hero3-y, 50%), rgba(255,255,255,0.18), transparent 72%)"
                          : "radial-gradient(190px circle at var(--hero3-x, 50%) var(--hero3-y, 50%), rgba(17,17,17,0.12), transparent 72%)",
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.25em]">{protocol.name}</h4>
                    <span className="text-[10px] uppercase tracking-[0.35em] opacity-70">{protocol.status}</span>
                  </div>
                  <p className={`mt-3 text-sm leading-relaxed ${palette.subtle}`}>{protocol.detail}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
      {showHowModal && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="How it works">
          <div className="about-header">
            <strong>How it works</strong>
            <button className="icon-btn" onClick={() => setShowHowModal(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <ol>
              {protocols.map((p) => (
                <li key={p.name} style={{ marginBottom: 8 }}>
                  <strong>{p.name}:</strong> <span className="u-subtle">{p.detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {showContact && (
        <div className="about-modal" role="dialog" aria-modal="true" aria-label="Contact">
          <div className="about-header">
            <strong>Contact me</strong>
            <button className="icon-btn" onClick={() => setShowContact(false)} aria-label="Close">✕</button>
          </div>
          <div className="about-body">
            <p className="u-subtle" style={{ marginBottom: 8 }}>I'd love to hear from you.</p>
            <div style={{ display:'grid', gap:8 }}>
              <a className="btn" href="https://www.linkedin.com/in/rohansonawane" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a className="btn" href="mailto:rohan@example.com">rohan@example.com</a>
            </div>
          </div>
        </div>
      )}
      <footer className="border-t u-border u-card">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 text-sm u-subtle">
          <span>© Cognito • Built with React and Vite</span>
          <a href="/" className="link-underline">Open Canvas</a>
        </div>
      </footer>
    </div>
  );
}

export default HeroOrbitDeck;
export { HeroOrbitDeck };


