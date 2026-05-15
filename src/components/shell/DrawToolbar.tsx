import React, { useEffect, useRef, useState } from 'react';
import {
  Pencil, Eraser, PenLine, Highlighter, Hand, Undo2, Redo2, ChevronLeft, SlidersHorizontal, Settings,
  Eye, EyeOff,
} from 'lucide-react';
import type { ToolbarDock } from '../../utils/settings';
import { hapticLight } from '../../utils/haptic';

export type DrawTool = 'pencil' | 'pen' | 'highlighter' | 'eraser';

const TOOLS: { id: DrawTool; icon: React.ReactNode; label: string; color: string }[] = [
  { id: 'pencil', icon: <Pencil size={16} />, label: 'Kalem', color: '#0a84ff' },
  { id: 'pen', icon: <PenLine size={16} />, label: 'Dolma', color: '#5e5ce6' },
  { id: 'highlighter', icon: <Highlighter size={16} />, label: 'İşaret', color: '#ffd60a' },
  { id: 'eraser', icon: <Eraser size={16} />, label: 'Silgi', color: '#ff453a' },
];

const COLORS = ['#1a1a1f', '#0a84ff', '#ff453a', '#30d158', '#ffd60a', '#bf5af2', '#ff9f0a', '#ff375f'];
const PINNED_COLOR_COUNT = 3;

const STROKE_PRESETS: { value: number; label: string; previewPx: number }[] = [
  { value: 1, label: 'İnce', previewPx: 3 },
  { value: 2, label: 'Normal', previewPx: 5 },
  { value: 4, label: 'Kalın', previewPx: 8 },
  { value: 8, label: 'Çok kalın', previewPx: 12 },
];

export interface DrawToolbarProps {
  dock: ToolbarDock;
  tool: DrawTool;
  color: string;
  size: number;
  palm: boolean;
  onTool: (t: DrawTool) => void;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onPalm: () => void;
  onGoEdit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onOpenSettings?: () => void;
  /** Pencil sıkıştırma web’de çalışmayabilir — tüm çözümler aç/kapa */
  onToggleAllSolutions?: () => void;
  allSolutionsOpen?: boolean;
  extra?: React.ReactNode;
}

export const DrawToolbar: React.FC<DrawToolbarProps> = ({
  dock,
  tool,
  color,
  size,
  palm,
  onTool,
  onColor,
  onSize,
  onPalm,
  onGoEdit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenSettings,
  onToggleAllSolutions,
  allSolutionsOpen = false,
  extra,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (pickerRef.current?.contains(e.target as Node)) return;
      setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  if (collapsed) {
    return (
      <button
        type="button"
        className={`tool-dock tool-dock--${dock} tool-dock--collapsed`}
        onClick={() => setCollapsed(false)}
        aria-label="Araçları göster"
      >
        <Pencil size={18} />
      </button>
    );
  }

  const isVertical = dock === 'right' || dock === 'left';
  const activePresetValue = STROKE_PRESETS.some(p => p.value === size)
    ? size
    : STROKE_PRESETS.reduce((best, p) =>
        Math.abs(p.value - size) < Math.abs(best.value - size) ? p : best,
      ).value;

  return (
    <div className={`tool-dock tool-dock--${dock}`} role="toolbar" aria-label="Çizim araçları">
      <div className={`tool-dock-inner tool-dock-inner--compact${isVertical ? ' tool-dock-inner--vertical' : ''}`}>
        {onGoEdit && (
          <button
            type="button"
            className="tool-btn tool-btn--compact tool-btn--ghost"
            onClick={onGoEdit}
            aria-label="Düzenlemeye dön"
            title="Düzenlemeye dön"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Araçlar */}
        <div className="tool-dock-tools" role="group" aria-label="Araçlar">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`tool-btn tool-btn--compact${tool === t.id ? ' is-active' : ''}`}
              style={{ '--tool-accent': t.color } as React.CSSProperties}
              onClick={() => { hapticLight(); onTool(t.id); }}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Ayırıcı */}
        <div className="tool-dock-sep" />

        {/* İlk 3 renk — daima görünür */}
        <div className="tool-dock-colors--inline" role="group" aria-label="Hızlı renkler">
          {COLORS.slice(0, PINNED_COLOR_COUNT).map(c => (
            <button
              key={c}
              type="button"
              className={`tool-color-swatch tool-color-swatch--sm${color === c && tool !== 'eraser' ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => { hapticLight(); onColor(c); if (tool === 'eraser') onTool('pencil'); }}
              aria-label={`Renk ${c}`}
            />
          ))}
        </div>

        {/* Renk & boyut picker butonu + flyout */}
        <div className="tool-picker-wrap" ref={pickerRef}>
          <button
            type="button"
            className={`tool-btn tool-btn--compact tool-picker-toggle${pickerOpen ? ' is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); hapticLight(); setPickerOpen(v => !v); }}
            aria-label="Renk ve kalınlık seç"
            aria-expanded={pickerOpen}
          >
            <SlidersHorizontal size={15} />
            {/* aktif renk göstergesi */}
            <span
              className="tool-picker-dot"
              style={{ background: tool === 'eraser' ? 'var(--text-tertiary)' : color }}
            />
          </button>

          {pickerOpen && (
            <div
              className={`tool-picker-flyout${isVertical ? ' tool-picker-flyout--side' : ''}`}
              role="dialog"
              aria-label="Renk ve kalınlık"
            >
              {/* Tüm renkler */}
              <div className="tool-picker-colors" role="group" aria-label="Renkler">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`tool-color-swatch tool-color-swatch--sm${color === c && tool !== 'eraser' ? ' is-active' : ''}`}
                    style={{ background: c }}
                    onClick={() => {
                      hapticLight();
                      onColor(c);
                      if (tool === 'eraser') onTool('pencil');
                      setPickerOpen(false);
                    }}
                    aria-label={`Renk ${c}`}
                  />
                ))}
              </div>
              {/* Kalınlık */}
              <div className="tool-picker-sizes" role="group" aria-label="Kalınlık">
                {STROKE_PRESETS.map(p => {
                  const active = activePresetValue === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      className={`tool-size-preset--sm${active ? ' is-active' : ''}`}
                      onClick={() => { hapticLight(); onSize(p.value); setPickerOpen(false); }}
                      aria-label={p.label}
                      aria-pressed={active}
                    >
                      <span
                        className="tool-size-preset-dot"
                        style={{
                          width: p.previewPx,
                          height: p.previewPx,
                          background: tool === 'eraser' ? 'var(--text-tertiary)' : color,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ayırıcı */}
        <div className="tool-dock-sep" />

        {onToggleAllSolutions && (
          <button
            type="button"
            className={`tool-btn tool-btn--compact${allSolutionsOpen ? ' is-active' : ''}`}
            onClick={() => { hapticLight(); onToggleAllSolutions(); }}
            aria-label={allSolutionsOpen ? 'Tüm çözümleri gizle' : 'Tüm çözümleri göster'}
            title="Tüm çözümler (Pencil sıkıştırma yerine)"
          >
            {allSolutionsOpen ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}

        <button
          type="button"
          className={`tool-btn tool-btn--compact${palm ? ' is-active' : ''}`}
          onClick={() => { hapticLight(); onPalm(); }}
          aria-label="El reddi"
          aria-pressed={palm}
        >
          <Hand size={16} />
        </button>

        {(onUndo || onRedo) && (
          <div className="tool-dock-undo tool-dock-undo--compact">
            <button type="button" className="tool-btn tool-btn--compact tool-btn--icon" onClick={() => { hapticLight(); onUndo?.(); }} disabled={!canUndo} aria-label="Geri al">
              <Undo2 size={16} />
            </button>
            <button type="button" className="tool-btn tool-btn--compact tool-btn--icon" onClick={() => { hapticLight(); onRedo?.(); }} disabled={!canRedo} aria-label="Yinele">
              <Redo2 size={16} />
            </button>
          </div>
        )}

        {onOpenSettings && (
          <button
            type="button"
            className="tool-btn tool-btn--compact tool-btn--ghost"
            onClick={() => { hapticLight(); onOpenSettings(); }}
            aria-label="Ayarlar"
          >
            <Settings size={16} />
          </button>
        )}

        {extra}

        <button
          type="button"
          className="tool-btn tool-btn--compact tool-btn--collapse"
          onClick={() => setCollapsed(true)}
          aria-label="Araçları gizle"
        >
          ×
        </button>
      </div>
    </div>
  );
};
