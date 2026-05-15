import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Trash2, Eye, EyeOff, Grid3x3, Square, CheckCircle2, XCircle } from 'lucide-react';
import { SCALE } from '../utils/pdfCrop';

const A4_W = 794;
const ANSWER_HEIGHT = 420;
const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

type Tool = 'pencil' | 'pen' | 'highlighter' | 'eraser';

interface StrokePoint { x: number; y: number; p: number; }
interface StrokeData { tool: Tool; color: string; baseSize: number; points: StrokePoint[]; }
import type { CroppedItem, QuestionAnswerStatus } from '../utils/db';
import { buildSolveFlow } from '../utils/questionGroups';

function strokeKey(item: CroppedItem): number {
  if (item.type === 'stem') return item.questionIndex * 1000 + (item.stemIndex ?? 1);
  return item.questionIndex;
}

function solutionForContent(item: CroppedItem, solutions: CroppedItem[]): CroppedItem | undefined {
  const seg = item.type === 'question' ? 0 : (item.stemIndex ?? 1);
  return solutions.find(
    s => s.questionIndex === item.questionIndex && (s.segmentIndex ?? 0) === seg,
  );
}

type QuestionStatus = 'correct' | 'wrong' | null;

import type { ToolbarDock, BgStyle as SettingsBgStyle } from '../utils/settings';
import { DrawToolbar, type DrawTool } from './shell/DrawToolbar';
import { ZoomControls } from './shell/ZoomControls';
import { QuestionNavigator } from './shell/QuestionNavigator';
import { Breadcrumb } from './shell/Breadcrumb';
import { OnboardingTip } from './shell/OnboardingTip';
import { usePerKeyStrokeHistory } from '../hooks/usePerKeyStrokeHistory';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';
import { SolveChromeActions } from './shell/SolveChromeActions';
import { SolveProgressSummary } from './shell/SolveProgressSummary';
import { ClassicThumbZone } from './shell/ClassicThumbZone';
import { hapticLight } from '../utils/haptic';
import type { SaveStatus } from './shell/SaveIndicator';
import { useApplePencilGestures } from '../hooks/useApplePencilGestures';

interface SolveViewProps {
  questions: CroppedItem[];
  stems: CroppedItem[];
  solutions: CroppedItem[];
  allStrokes: Record<number, StrokeData[]>;
  onStrokesChange: (qi: number, strokes: StrokeData[]) => void;
  onGoEdit?: () => void;
  toolbarDock: ToolbarDock;
  palmDefault: boolean;
  defaultBgStyle: SettingsBgStyle;
  docName: string;
  breadcrumbSegments?: string[];
  onOpenLibrary?: () => void;
  saveStatus?: SaveStatus;
  questionStatus?: Record<number, QuestionAnswerStatus>;
  onQuestionStatusChange?: (key: number, status: QuestionAnswerStatus | null) => void;
}

type BgStyle = 'plain' | 'grid';
// Module-level shared state
const G = { tool: 'pencil' as Tool, color: '#e8e8ed', baseSize: 2, bg: 'plain' as BgStyle };

// ── Drawing Helpers ───────────────────────────────────────────────────────

function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeData) {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = s.baseSize * 8 * DPR;
  } else if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.baseSize * 10 * DPR;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.tool === 'pen'
      ? s.baseSize * 1.8 * DPR
      : s.baseSize * DPR;
  }

  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore(); return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
  ctx.restore();
}

function redrawCanvas(ctx: CanvasRenderingContext2D, strokes: StrokeData[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  strokes.forEach(s => drawStroke(ctx, s));
}

// ── Question Card ─────────────────────────────────────────────────────────

const QuestionCard: React.FC<{
  item: CroppedItem;
  isQuestion: boolean;
  questionNumber: number;
  stemIndex?: number;
  solution?: CroppedItem;
  strokes: StrokeData[];
  onStrokesChange: (s: StrokeData[]) => void;
  palmRejection: boolean;
  bgStyle: BgStyle;
  zoom: number;
  showSolOverride?: boolean;
  answerStatus?: QuestionAnswerStatus | null;
  onAnswerStatusChange?: (status: QuestionAnswerStatus | null) => void;
}> = ({ item, isQuestion, questionNumber, stemIndex, solution, strokes, onStrokesChange, palmRejection, bgStyle, zoom, showSolOverride, answerStatus = null, onAnswerStatusChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const activeStroke = useRef<StrokeData | null>(null);
  const strokesRef = useRef(strokes);
  const drawing = useRef(false);
  const [showSolLocal, setShowSolLocal] = useState(false);
  const showSol = showSolOverride ?? showSolLocal;
  const setShowSol = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(showSolLocal) : v;
    setShowSolLocal(next);
  };
  const status = answerStatus;
  const setStatus = (next: QuestionStatus | ((prev: QuestionStatus) => QuestionStatus)) => {
    const resolved = typeof next === 'function' ? next(status) : next;
    onAnswerStatusChange?.(resolved);
  };
  const [answerH, setAnswerH] = useState(ANSWER_HEIGHT);
  const resizing = useRef(false);
  const resizeStart = useRef({ y: 0, h: ANSWER_HEIGHT });

  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const cW = A4_W * DPR;
  const cH = answerH * DPR;

  const PADDING = 48;
  const maxW = A4_W - PADDING;
  const naturalW = item.width / SCALE;
  const naturalH = item.height / SCALE;
  const scaleRatio = naturalW > maxW ? maxW / naturalW : 1;
  const displayW = Math.round(naturalW * scaleRatio * 1.4);
  const displayH = Math.round(naturalH * scaleRatio * 1.4);

  // Resize handle handlers
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = true;
    resizeStart.current = { y: e.clientY, h: answerH };
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing.current) return;
    // Divide by zoom so drag distance matches visual card size
    const delta = (e.clientY - resizeStart.current.y) / zoom;
    setAnswerH(Math.max(120, resizeStart.current.h + delta));
  };
  const onResizeUp = () => { resizing.current = false; };

  const getOff = () => {
    if (!offRef.current) {
      offRef.current = document.createElement('canvas');
      offRef.current.width = cW;
      offRef.current.height = cH;
    }
    const off = offRef.current;
    // Only reset if dimensions changed (resetting clears the canvas!)
    if (off.width !== cW || off.height !== cH) {
      off.width = cW;
      off.height = cH;
      // Re-bake existing strokes after resize
      redrawCanvas(off.getContext('2d')!, strokesRef.current, cW, cH);
    }
    return off;
  };

  const bakeStrokes = (sl: StrokeData[]) => {
    const off = getOff();
    redrawCanvas(off.getContext('2d')!, sl, cW, cH);
  };

  const composite = (live?: StrokeData) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, cW, cH);
    ctx.drawImage(getOff(), 0, 0);
    if (live) drawStroke(ctx, live);
  };

  useEffect(() => { bakeStrokes(strokesRef.current); composite(); }, []); // eslint-disable-line

  const coord = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cW / r.width, y: (e.clientY - r.top) * cH / r.height, p: e.pressure > 0 ? e.pressure : 0.5 };
  };

  const ignore = (e: React.PointerEvent) => palmRejection && e.pointerType === 'touch';

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ignore(e) || e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    activeStroke.current = { tool: G.tool, color: G.color, baseSize: G.baseSize, points: [coord(e)] };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !activeStroke.current || ignore(e)) return;
    activeStroke.current.points.push(coord(e));
    composite(activeStroke.current);
  };

  const onUp = () => {
    if (!drawing.current || !activeStroke.current) return;
    drawing.current = false;
    const next = [...strokesRef.current, activeStroke.current];
    activeStroke.current = null;
    strokesRef.current = next;
    bakeStrokes(next); composite();
    onStrokesChange(next);
  };

  const clear = () => {
    strokesRef.current = []; onStrokesChange([]);
    bakeStrokes([]); composite();
  };

  return (
    <div style={{
      width: A4_W,
      background: 'linear-gradient(180deg, #1e1e24 0%, #17171c 100%)',
      borderRadius: 8,
      overflow: 'hidden', flexShrink: 0, userSelect: 'none',
      boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 4px 6px rgba(0,0,0,0.2), 0 24px 64px rgba(0,0,0,0.45)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Header */}
      <div style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {isQuestion ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: 'linear-gradient(135deg,#0a84ff,#5e5ce6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 5px rgba(10,132,255,0.3)' }}>
                <span style={{ fontSize: 8, fontWeight: 800, color: '#fff' }}>{questionNumber}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(10,132,255,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Soru {questionNumber}</span>
            </>
          ) : (
            <>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: 'linear-gradient(135deg,#ff9f0a,#ff6b00)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 8, fontWeight: 800, color: '#fff' }}>{stemIndex ?? 1}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9f0a', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Soru {questionNumber} · Öncül {stemIndex ?? 1}
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onAnswerStatusChange && (
          <>
          <button
            onClick={() => { hapticLight(); setStatus(s => s === 'correct' ? null : 'correct'); }}
            title="Doğru"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
              background: status === 'correct' ? 'rgba(48,209,88,0.18)' : 'rgba(255,255,255,0.05)',
              color: status === 'correct' ? '#30d158' : 'rgba(255,255,255,0.25)', transition: 'all 0.2s' }}
          ><CheckCircle2 size={11} /> Doğru</button>
          <button
            onClick={() => { hapticLight(); setStatus(s => s === 'wrong' ? null : 'wrong'); }}
            title="Yanlış"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
              background: status === 'wrong' ? 'rgba(255,69,58,0.18)' : 'rgba(255,255,255,0.05)',
              color: status === 'wrong' ? '#ff453a' : 'rgba(255,255,255,0.25)', transition: 'all 0.2s' }}
          ><XCircle size={11} /> Yanlış</button>
          </>
          )}
          {solution && (
            <button
              onClick={() => setShowSol(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                minHeight: 22,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.01em',
                background: showSol ? 'rgba(255,69,58,0.09)' : 'rgba(48,209,88,0.08)',
                color: showSol ? 'rgba(255,110,102,0.95)' : 'rgba(118,235,148,0.95)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                transition: 'all 0.15s',
              }}
            >
              {showSol ? <EyeOff size={9} /> : <Eye size={9} />} {showSol ? 'Gizle' : 'Çözüm'}
            </button>
          )}
        </div>
      </div>

      {/* Status stripe */}
      {status && (
        <div style={{ height: 3, background: status === 'correct' ? 'linear-gradient(90deg,#30d158,#34c759)' : 'linear-gradient(90deg,#ff453a,#ff375f)', transition: 'all 0.3s' }} />
      )}

      {/* Item image (soru veya öncül) */}
      <div style={{ background: '#ffffff', padding: '14px 24px' }}>
        <img
          src={item.dataUrl}
          alt={isQuestion ? `Soru ${questionNumber}` : 'Öncül'}
          draggable={false}
          style={{ width: displayW, height: displayH, display: 'block', imageRendering: 'crisp-edges' }}
        />
      </div>

      {/* Animated solution reveal */}
      <div style={{
        overflow: 'hidden',
        maxHeight: showSol && solution ? 2000 : 0,
        opacity: showSol && solution ? 1 : 0,
        transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
      }}>
        {solution && (
          <div style={{ background: '#fff', borderTop: '2px solid rgba(255,159,10,0.5)' }}>
            <div style={{ padding: '6px 20px 2px', fontSize: 9, fontWeight: 800, color: '#ff9f0a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>—— ÇÖZÜM ——</div>
            <img src={solution.dataUrl} alt="Çözüm" draggable={false} style={{ width: '100%', display: 'block', padding: '4px 16px 14px', boxSizing: 'border-box', pointerEvents: 'none' }} />
          </div>
        )}
      </div>

      {/* Answer separator */}
      <div style={{
        padding: '7px 20px 6px',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px dashed rgba(100,120,200,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: 'linear-gradient(135deg,#0a84ff,#5e5ce6)' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cevap</span>
        </div>
        <button onClick={clear}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 5, transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ff453a')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
        >
          <Trash2 size={10} /> Temizle
        </button>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} width={cW} height={cH}
        style={{
          width: '100%', height: answerH, display: 'block',
          touchAction: 'none',
          cursor: G.tool === 'eraser' ? 'cell' : 'crosshair',
          background: bgStyle === 'grid'
            ? `repeating-linear-gradient(rgba(100,140,255,0.10) 0 1px, transparent 1px 32px),
               repeating-linear-gradient(90deg, rgba(100,140,255,0.10) 0 1px, transparent 1px 32px)`
            : 'transparent',
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />

      {/* Resize handle */}
      <div
        onPointerDown={onResizeDown} onPointerMove={onResizeMove}
        onPointerUp={onResizeUp} onPointerCancel={onResizeUp}
        style={{
          height: 14, cursor: 'ns-resize',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.03)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <Square size={10} style={{ color: 'rgba(255,255,255,0.2)', transform: 'rotate(45deg)' }} />
      </div>
    </div>
  );
};

// ── Main SolveView ────────────────────────────────────────────────────────

export const SolveView: React.FC<SolveViewProps> = ({
  questions, stems = [], solutions, allStrokes, onStrokesChange, onGoEdit,
  toolbarDock, palmDefault, defaultBgStyle, docName, breadcrumbSegments = [],
  onOpenLibrary, saveStatus, questionStatus = {}, onQuestionStatusChange,
}) => {
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#e8e8ed');
  const [size, setSize] = useState(2);
  const [palmRejection, setPalmRejection] = useState(palmDefault);
  const [bgStyle, setBgStyle] = useState<BgStyle>(defaultBgStyle);
  const [zoom, setZoom] = useState(1);
  const [showAllSol, setShowAllSol] = useState(false);
  const [flowIndex, setFlowIndex] = useState(0);
  const [filterWrongOnly, setFilterWrongOnly] = useState(false);
  const [cardSolShown, setCardSolShown] = useState(false);
  const [, tick] = useState(0);
  const [showDockTip, setShowDockTip] = useState(() => !hasSeenOnboarding('solve_dock'));
  const chromeRootRef = useRef<HTMLDivElement>(null);
  const toolBeforeEraserRef = useRef<Tool>('pencil');

  const { commit, undo, redo, canUndo, canRedo, setFocusKey } = usePerKeyStrokeHistory(allStrokes, onStrokesChange);

  // Touch tracking for pinch+pan
  const touches = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // direct DOM zoom target
  const zoomRef    = useRef(1);                    // source of truth during gesture

  const applyTool = useCallback((t: Tool) => { G.tool = t; setTool(t); tick(n => n + 1); }, []);
  const applyColor = useCallback((c: string) => { G.color = c; G.tool = 'pencil'; setColor(c); setTool('pencil'); tick(n => n + 1); }, []);
  const applySize = useCallback((s: number) => { G.baseSize = s; setSize(s); tick(n => n + 1); }, []);
  const toggleBg = useCallback(() => { const next: BgStyle = bgStyle === 'plain' ? 'grid' : 'plain'; G.bg = next; setBgStyle(next); }, [bgStyle]);

  const togglePenEraser = useCallback(() => {
    if (tool === 'eraser') {
      applyTool(toolBeforeEraserRef.current);
    } else {
      toolBeforeEraserRef.current = tool;
      applyTool('eraser');
    }
  }, [tool, applyTool]);

  const solveFlow = buildSolveFlow(questions, stems, solutions);

  // ── Wheel zoom — direct DOM, no re-render ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current - e.deltaY * 0.005));
    zoomRef.current = next;
    if (contentRef.current) contentRef.current.style.transform = `scale(${next})`;
    setZoom(next);
  }, []);

  // ── Touch pinch+pan — fully ref-based, zero re-renders during gesture ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    Array.from(e.changedTouches).forEach(t => {
      touches.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    });
    if (touches.current.size === 2) {
      const pts = Array.from(touches.current.values());
      lastPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      lastPinchMid.current  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touches.current.size !== 2) return;
    e.preventDefault();
    Array.from(e.changedTouches).forEach(t => {
      touches.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    });
    const pts  = Array.from(touches.current.values());
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

    if (lastPinchDist.current !== null && contentRef.current) {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * (dist / lastPinchDist.current)));
      zoomRef.current = next;
      contentRef.current.style.transform = `scale(${next})`;
    }
    if (lastPinchMid.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft -= mid.x - lastPinchMid.current.x;
      scrollRef.current.scrollTop  -= mid.y - lastPinchMid.current.y;
    }
    lastPinchDist.current = dist;
    lastPinchMid.current  = mid;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    Array.from(e.changedTouches).forEach(t => touches.current.delete(t.identifier));
    if (touches.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current  = null;
      setZoom(zoomRef.current);
    }
  }, []);

  const zoomIn    = () => { const z = Math.min(MAX_ZOOM, +(zoomRef.current + 0.15).toFixed(2)); zoomRef.current = z; setZoom(z); if (contentRef.current) contentRef.current.style.transform = `scale(${z})`; };
  const zoomOut   = () => { const z = Math.max(MIN_ZOOM, +(zoomRef.current - 0.15).toFixed(2)); zoomRef.current = z; setZoom(z); if (contentRef.current) contentRef.current.style.transform = `scale(${z})`; };
  const zoomReset = () => { zoomRef.current = 1; setZoom(1); if (contentRef.current) contentRef.current.style.transform = 'scale(1)'; };

  const contentEntries = solveFlow.filter(e => e.kind === 'content');
  const contentKeys = useMemo(
    () => contentEntries.map(e => (e.kind === 'content' ? strokeKey(e.item) : 0)),
    [contentEntries],
  );
  const totalQ = contentEntries.length;

  const visibleFlow = useMemo(() => {
    if (!filterWrongOnly) return solveFlow;
    return solveFlow.filter(entry => {
      if (entry.kind !== 'content') return false;
      return questionStatus[strokeKey(entry.item)] === 'wrong';
    });
  }, [solveFlow, filterWrongOnly, questionStatus]);

  const visibleContentEntries = useMemo(
    () => visibleFlow.filter((e): e is Extract<typeof e, { kind: 'content' }> => e.kind === 'content'),
    [visibleFlow],
  );
  const visibleTotalQ = visibleContentEntries.length;

  useEffect(() => {
    if (flowIndex >= visibleTotalQ) setFlowIndex(Math.max(0, visibleTotalQ - 1));
  }, [visibleTotalQ, flowIndex]);

  useEffect(() => {
    const entry = visibleContentEntries[flowIndex];
    if (entry) setFocusKey(strokeKey(entry.item));
  }, [flowIndex, visibleContentEntries, setFocusKey]);

  const activeRegionId = visibleContentEntries[flowIndex]?.item.regionId;

  const onSqueezeToggle = useCallback(() => {
    hapticLight();
    if (visibleTotalQ > 0) setCardSolShown(v => !v);
  }, [visibleTotalQ]);

  useApplePencilGestures({
    targetRef: chromeRootRef,
    onToggleEraser: togglePenEraser,
    onSqueezeToggle,
  });

  return (
    <div ref={chromeRootRef} className="solve-chrome-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-canvas)' }}>
      <header className="chrome-topbar">
        <div className="chrome-topbar-start">
          {breadcrumbSegments.length > 0 ? (
            <Breadcrumb segments={breadcrumbSegments} current={docName} />
          ) : (
            <span className="chrome-doc-name" title={docName}>{docName}</span>
          )}
          <span className="chrome-step is-current"><span className="chrome-step-num">3</span><span className="chrome-step-label">Çöz</span></span>
        </div>
        <div className="chrome-topbar-end">
          <SolveChromeActions onOpenLibrary={onOpenLibrary} saveStatus={saveStatus} />
          {totalQ > 0 && (
            <SolveProgressSummary questionStatus={questionStatus} contentKeys={contentKeys} />
          )}
          {Object.values(questionStatus).some(s => s === 'wrong') && (
            <button
              type="button"
              className={`btn btn-ghost chrome-touch-btn${filterWrongOnly ? ' is-active' : ''}`}
              onClick={() => {
                hapticLight();
                setFilterWrongOnly(v => !v);
                setFlowIndex(0);
              }}
            >
              {filterWrongOnly ? 'Tümü' : 'Yanlışlar'}
            </button>
          )}
          {visibleTotalQ > 0 && (
            <QuestionNavigator
              current={Math.min(flowIndex + 1, visibleTotalQ)}
              total={visibleTotalQ}
              onPrev={() => setFlowIndex(i => Math.max(0, i - 1))}
              onNext={() => setFlowIndex(i => Math.min(visibleTotalQ - 1, i + 1))}
            />
          )}
          {solutions.length > 0 && (
            <button type="button" className="btn btn-ghost chrome-touch-btn" onClick={() => { hapticLight(); setShowAllSol(v => !v); }}>
              {showAllSol ? 'Çözümleri gizle' : 'Tüm çözümler'}
            </button>
          )}
          <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} />
        </div>
      </header>

      <div className="solve-chrome-layout solve-chrome-layout--classic">
        <DrawToolbar
          dock={toolbarDock}
          tool={tool as DrawTool}
          color={color}
          size={size}
          palm={palmRejection}
          onTool={t => applyTool(t)}
          onColor={applyColor}
          onSize={applySize}
          onPalm={() => setPalmRejection(v => !v)}
          onGoEdit={onGoEdit}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          extra={
            <button type="button" className="tool-btn" onClick={toggleBg} aria-label="Arka plan">
              <Grid3x3 size={18} />
            </button>
          }
        />
        {showDockTip && (
          <OnboardingTip
            position="right"
            title="Çizim araçları"
            message="Dock’tan araç seçin; geri al ve yinele burada. Sorular arasında üstteki oklarla gezinin."
            onDismiss={() => {
              markOnboardingSeen('solve_dock');
              setShowDockTip(false);
            }}
          />
        )}
        <div
          ref={scrollRef}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="solve-chrome-canvas"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 72px 80px' }}
        >
          <div ref={contentRef} className="solve-classic-scroll" style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            marginBottom: zoom < 1 ? `${(1 - zoom) * -400}px` : 0,
          }}>
            {solveFlow.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 14, marginTop: 80 }}>Henüz soru yok.</div>
            )}
            {visibleFlow.map(entry => {
              if (entry.kind !== 'content') return null;
              const isQ = entry.item.type === 'question';
              const sk = strokeKey(entry.item);
              const solForCard = solutionForContent(entry.item, solutions);
              const isActive = entry.item.regionId === activeRegionId;
              return (
                <div key={entry.item.regionId} className="question-card-wrap" style={{ outline: isActive ? '2px solid var(--accent)' : undefined, borderRadius: 8 }}>
                  <QuestionCard
                    item={entry.item}
                    isQuestion={isQ}
                    questionNumber={entry.questionNumber}
                    stemIndex={entry.stemIndex}
                    solution={solForCard}
                    strokes={allStrokes[sk] || []}
                    onStrokesChange={s => commit(sk, s)}
                    palmRejection={palmRejection}
                    bgStyle={bgStyle}
                    zoom={zoom}
                    showSolOverride={showAllSol || (isActive && cardSolShown) ? true : undefined}
                    answerStatus={questionStatus[sk] ?? null}
                    onAnswerStatusChange={onQuestionStatusChange ? s => onQuestionStatusChange(sk, s) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <ClassicThumbZone
          current={visibleTotalQ > 0 ? Math.min(flowIndex + 1, visibleTotalQ) : 0}
          total={visibleTotalQ}
          onPrev={() => setFlowIndex(i => Math.max(0, i - 1))}
          onNext={() => setFlowIndex(i => Math.min(visibleTotalQ - 1, i + 1))}
          canShowSol={solutions.length > 0}
          solShown={showAllSol || cardSolShown}
          onToggleSol={() => {
            if (showAllSol) {
              setShowAllSol(false);
              setCardSolShown(v => !v);
            } else {
              setCardSolShown(v => !v);
            }
          }}
        />
      </div>
    </div>
  );

};

