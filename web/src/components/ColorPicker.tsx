import React, { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  swatches?: string[];
  inlineHex?: boolean;
};

export function ColorPicker({ value, onChange, swatches = DEFAULTS, inlineHex = false }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    
    const updatePosition = () => {
      if (!buttonRef.current || !panelRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 280; // min-width from CSS
      const panelHeight = 150; // approximate height
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      // Check if button is inside side panel
      let sidePanelElement: HTMLElement | null = null;
      let currentElement: HTMLElement | null = buttonRef.current.parentElement;
      while (currentElement) {
        if (currentElement.classList.contains('side-panel')) {
          sidePanelElement = currentElement;
          break;
        }
        currentElement = currentElement.parentElement;
      }
      
      let left = rect.left + scrollX;
      let top = rect.bottom + scrollY + 8;
      
      // If button is in side panel, position popup to the left of side panel
      if (sidePanelElement) {
        const sidePanelRect = sidePanelElement.getBoundingClientRect();
        // Position to the left of the side panel
        left = sidePanelRect.left + scrollX - panelWidth - 16;
        // If not enough space on left, position to the right
        if (left < scrollX + 16) {
          left = sidePanelRect.right + scrollX + 16;
        }
        // Align vertically with button
        top = rect.top + scrollY;
      } else {
        // Center on mobile if screen is narrow
        const isMobile = viewportWidth < 768;
        if (isMobile) {
          left = scrollX + (viewportWidth / 2) - (panelWidth / 2);
          // Ensure it doesn't go off-screen
          left = Math.max(16, Math.min(left, scrollX + viewportWidth - panelWidth - 16));
        } else {
          // On desktop, align to button but ensure it doesn't go off-screen
          if (left + panelWidth > scrollX + viewportWidth - 16) {
            left = scrollX + viewportWidth - panelWidth - 16;
          }
          if (left < scrollX + 16) {
            left = scrollX + 16;
          }
        }
      }
      
      // If popup would go below viewport, show it above the button
      if (top + panelHeight > scrollY + viewportHeight - 16) {
        top = rect.top + scrollY - panelHeight - 8;
        if (top < scrollY + 16) {
          top = scrollY + 16;
        }
      }
      
      setPosition({ top, left });
    };
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || !panelRef.current) return;
      const target = e.target as Node;
      if (!ref.current.contains(target) && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    
    // Use a small delay to allow button click to process first
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('touchend', onDoc);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchend', onDoc);
    };
  }, [open]);

  return (
    <div className="color-popper" ref={ref}>
      <button 
        ref={buttonRef}
        className="btn" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Color"
      >
        <span className="color-dot" style={{ background: value }} />
        <span style={{ marginLeft: 6, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>{value.toUpperCase()}</span>
      </button>
      {inlineHex && (
        <input
          className="hex-input"
          style={{ marginLeft: 8 }}
          value={value.toUpperCase()}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
        />
      )}
      {open && (
        <div 
          ref={panelRef}
          className="popper-panel" 
          style={{ top: `${position.top}px`, left: `${position.left}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="color-row">
            {swatches.map((c) => (
              <button 
                key={c} 
                className={`swatch ${value===c?'selected':''}`} 
                style={{ background: c }} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(c);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(c);
                }}
                title={c} 
              />
            ))}
          </div>
          <div className="color-custom" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <input 
              type="color" 
              value={value} 
              onChange={(e) => onChange(e.target.value)} 
              onClick={(e) => e.stopPropagation()}
            />
            <input 
              className="hex-input" 
              value={value.toUpperCase()} 
              onChange={(e) => onChange(normalizeHex(e.target.value))} 
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULTS = ['#FFFFFF', '#000000', '#00F0C8', '#00C2A8', '#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#9B5DE5', '#F15BB5', '#FEE440', '#00BBF9'];

function normalizeHex(v: string) {
  let s = v.trim().replace(/[^#0-9a-fA-F]/g, '');
  if (!s.startsWith('#')) s = '#' + s;
  if (s.length === 4) {
    const r = s[1], g = s[2], b = s[3];
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  return s.slice(0, 7);
}


