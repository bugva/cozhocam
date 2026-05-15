import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, Trash2, CheckCircle2, XCircle, LocateFixed } from 'lucide-react';
import { SolveFocusToggle } from './shell/SolveFocusToggle';
import { SolveSidebarToggle } from './shell/SolveSidebarToggle';
import { SaveIndicator } from './shell/SaveIndicator';
import { DrawToolbar, type DrawTool } from './shell/DrawToolbar';
import { ZoomControls } from './shell/ZoomControls';
import { QuestionNavigator } from './shell/QuestionNavigator';
import { Breadcrumb } from './shell/Breadcrumb';
import type { DocSolutionPlacement, SaveNotificationMode, ToolbarDock } from '../utils/settings';
import { SCALE, type PageLayout } from '../utils/pdfCrop';
import type { Region } from './PdfViewer';
import type { CroppedItem, QuestionAnswerStatus } from '../utils/db';
import { SolveProgressSummary } from './shell/SolveProgressSummary';
import {
  segmentIndexAfterContent,
  solutionPanelTitle,
  solutionToggleKey,
} from '../utils/questionGroups';
import { usePerKeyStrokeHistory } from '../hooks/usePerKeyStrokeHistory';
import { OnboardingTip } from './shell/OnboardingTip';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';
import { SolveChromeActions } from './shell/SolveChromeActions';
import { DocThumbZone } from './shell/DocThumbZone';
import { hapticLight, hapticMedium } from '../utils/haptic';
import type { SaveStatus } from './shell/SaveIndicator';
import { useApplePencilGestures } from '../hooks/useApplePencilGestures';
import { useConfirm } from '../contexts/ConfirmContext';
const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

type Tool = DrawTool;
interface StrokePoint { x: number; y: number; p: number }
interface StrokeData { tool: Tool; color: string; baseSize: number; points: StrokePoint[] }

function drawStroke(ctx: CanvasRenderingContext2D, s: StrokeData) {
  const pts = s.points; if (!pts.length) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = s.baseSize * 8 * DPR;
  } else if (s.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.35;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.baseSize * 10 * DPR;
  } else {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.tool === 'pen' ? s.baseSize * 1.8 * DPR : s.baseSize * DPR;
  }
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.restore(); return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke(); ctx.restore();
}

const G = { tool: 'pencil' as Tool, color: '#1a1a1f', baseSize: 2 };

function strokeKey(item: CroppedItem): number {
  if (item.type === 'stem') return item.questionIndex * 1000 + (item.stemIndex ?? 1);
  return item.questionIndex;
}

// ── Per-page canvas with drawing ──
const DocPage: React.FC<{
  layout: PageLayout;
  items: { item: CroppedItem; region: Region }[];
  solMap: Map<number, CroppedItem>;
  strokes: StrokeData[];
  onStrokesChange: (s: StrokeData[]) => void;
  palmRejection: boolean;
  shownSols: Set<number>;
  onToggleSol: (key: number) => void;
  questionNumbers: Map<number, number>;
  solutionRegions: Map<string, Region>;
  docSolutionPlacement: DocSolutionPlacement;
  questionStatus: Record<number, QuestionAnswerStatus>;
  onQuestionStatusChange?: (key: number, status: QuestionAnswerStatus | null) => void;
}> = ({
  layout, items, solMap, strokes, onStrokesChange, palmRejection, shownSols, onToggleSol,
  questionNumbers, solutionRegions, docSolutionPlacement, questionStatus, onQuestionStatusChange,
}) => {
  const { confirm } = useConfirm();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const activeStroke = useRef<StrokeData | null>(null);
  const strokesRef = useRef(strokes);
  const drawing = useRef(false);

  const dW = Math.round(layout.width / SCALE);
  const dH = Math.round(layout.height / SCALE);
  const cW = layout.width, cH = layout.height;

  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const getOff = () => {
    if (!offRef.current) { offRef.current = document.createElement('canvas'); offRef.current.width = cW; offRef.current.height = cH; }
    return offRef.current;
  };
  const bake = (sl: StrokeData[]) => { const o = getOff(); const c = o.getContext('2d')!; c.clearRect(0, 0, cW, cH); sl.forEach(s => drawStroke(c, s)); };
  const composite = (live?: StrokeData) => {
    const cv = canvasRef.current; if (!cv) return;
    const c = cv.getContext('2d')!; c.clearRect(0, 0, cW, cH); c.drawImage(getOff(), 0, 0);
    if (live) drawStroke(c, live);
  };

  useEffect(() => { bake(strokesRef.current); composite(); }, []);

  const coord = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cW / r.width, y: (e.clientY - r.top) * cH / r.height, p: e.pressure > 0 ? e.pressure : 0.5 };
  };
  const ign = (e: React.PointerEvent) => palmRejection && e.pointerType === 'touch';

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ign(e) || e.button !== 0) return;
    if (e.pointerType === 'touch') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    activeStroke.current = { tool: G.tool, color: G.color, baseSize: G.baseSize, points: [coord(e)] };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !activeStroke.current || ign(e)) return;
    activeStroke.current.points.push(coord(e)); composite(activeStroke.current);
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch (_) {}
    if (!drawing.current || !activeStroke.current) return;
    drawing.current = false;
    const next = [...strokesRef.current, activeStroke.current];
    activeStroke.current = null; strokesRef.current = next;
    bake(next); composite(); onStrokesChange(next);
  };
  const clear = async () => {
    const ok = await confirm({
      title: 'Çizimleri temizle',
      message: 'Bu sayfadaki tüm çizimler silinecek.',
      confirmLabel: 'Temizle',
      danger: true,
    });
    if (!ok) return;
    strokesRef.current = [];
    onStrokesChange([]);
    bake([]);
    composite();
  };

  const sorted = [...items].sort((a, b) => a.region.y - b.region.y);
  const placementSide = docSolutionPlacement === 'side';
  const solColLeft = placementSide ? dW : 0;
  const rowW = placementSide ? dW * 2 : dW;
  const solBtnInset = 10;
  const solBtnSize = 24;
  /** Tüm çözüm düğmeleri sayfa sağ kenarında aynı sütunda */
  const solBtnColRight = dW - solBtnInset;
  const rowClass = placementSide ? 'doc-page-row doc-page-row--side' : 'doc-page-row doc-page-row--below';

  return (
    <div className={rowClass} style={{ position: 'relative', width: rowW, height: dH }}>
    <div className="doc-page-sheet" style={{ width: dW, height: dH }}>
      {/* Question images at original positions */}
      {sorted.map(({ item, region }) => {
        const left = region.x / SCALE;
        const top = (region.y - layout.offsetY) / SCALE;
        const w = item.width / SCALE;
        const h = item.height / SCALE;
        return (
          <img key={item.regionId} src={item.dataUrl} draggable={false}
            style={{ position: 'absolute', left, top, width: w, height: h, pointerEvents: 'none', imageRendering: 'crisp-edges', zIndex: 1 }}
          />
        );
      })}

      {/* Drawing canvas overlay */}
      <canvas ref={canvasRef} width={cW} height={cH}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, touchAction: 'none', cursor: G.tool === 'eraser' ? 'cell' : 'crosshair' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />

      {onQuestionStatusChange && sorted
        .filter(({ item }) => item.type === 'question' || item.type === 'stem')
        .map(({ item, region }) => {
          const sk = strokeKey(item);
          const status = questionStatus[sk];
          const boxLeft = region.x / SCALE;
          const boxTop = (region.y - layout.offsetY) / SCALE;
          const variant = item.type === 'stem' ? 'stem' : 'question';
          return (
            <div
              key={`status-${item.regionId}`}
              className={`doc-status-anchor doc-status-anchor--${variant}`}
              style={{ left: boxLeft + 6, top: boxTop + 6 }}
            >
              <button
                type="button"
                className={`doc-status-btn doc-status-btn--correct${status === 'correct' ? ' is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  hapticLight();
                  onQuestionStatusChange(sk, status === 'correct' ? null : 'correct');
                }}
                title="Doğru"
                aria-label="Doğru"
              >
                <CheckCircle2 size={10} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className={`doc-status-btn doc-status-btn--wrong${status === 'wrong' ? ' is-active' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  hapticLight();
                  onQuestionStatusChange(sk, status === 'wrong' ? null : 'wrong');
                }}
                title="Yanlış"
                aria-label="Yanlış"
              >
                <XCircle size={10} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}

      {/* Çözüm: her blokun sağında, dikey ortalanmış düğme */}
      {sorted
        .filter(({ item }) => item.type === 'question' || item.type === 'stem')
        .map(({ item, region }) => {
          const seg = segmentIndexAfterContent(item);
          if (seg === null) return null;
          const toggleKey = solutionToggleKey(item.questionIndex, seg);
          const sol = solMap.get(toggleKey);
          if (!sol) return null;
          const shown = shownSols.has(toggleKey);
          const qNum = questionNumbers.get(item.questionIndex) ?? item.questionIndex + 1;
          const boxLeft = region.x / SCALE;
          const boxTop = (region.y - layout.offsetY) / SCALE;
          const boxW = item.width / SCALE;
          const panelTitle = solutionPanelTitle(item, qNum);
          const isStem = item.type === 'stem';
          const variant = isStem ? 'stem' : 'question';
          const solReg = solutionRegions.get(sol.regionId);
          const regionRight = boxLeft + boxW;
          const gapTop = solReg ? (solReg.y - layout.offsetY) / SCALE : 0;
          const gapH = solReg ? solReg.h / SCALE : 0;
          /** Sonraki soru/öncülün başladığı Y (beyaz alanın alt sınırı) */
          const nextBlockTop = gapTop + gapH;
          const solImgH = sol.height / SCALE;
          const revealTop = placementSide ? gapTop : nextBlockTop;
          const revealH = placementSide ? gapH : solImgH;
          const btnTop = boxTop + solBtnInset;
          const connectorTop = btnTop + solBtnSize / 2;
          const connectorWAligned = Math.max(4, solBtnColRight - solBtnSize - regionRight);

          return (
            <React.Fragment key={`sol-${item.regionId}-${seg}`}>
              {placementSide && connectorWAligned > 0 && (
                <div
                  className={`doc-sol-connector-line doc-sol-connector-line--${variant}`}
                  style={{
                    left: regionRight,
                    top: connectorTop,
                    width: connectorWAligned,
                  }}
                />
              )}
              <div
                className="doc-sol-anchor doc-sol-anchor--page-col"
                style={{ right: solBtnInset, top: btnTop }}
              >
                <button
                  type="button"
                  className={`doc-sol-btn doc-sol-btn--${variant}${shown ? ' is-open' : ''}`}
                  onClick={() => onToggleSol(toggleKey)}
                  title={shown ? 'Gizle' : panelTitle}
                  aria-label={shown ? 'Çözümü gizle' : panelTitle}
                >
                  {shown ? <EyeOff size={9} strokeWidth={2.5} /> : <Eye size={9} strokeWidth={2.5} />}
                </button>
              </div>

              {shown && solReg && (
                <div
                  className={`doc-sol-reveal doc-sol-reveal--${variant} doc-sol-reveal--${placementSide ? 'side' : 'below'}`}
                  style={{
                    left: solColLeft,
                    top: revealTop,
                    width: dW,
                    height: revealH,
                  }}
                  title={panelTitle}
                >
                  <img
                    src={sol.dataUrl}
                    alt={panelTitle}
                    draggable={false}
                    style={{
                      width: dW,
                      height: revealH,
                      display: 'block',
                      objectFit: placementSide ? 'fill' : 'contain',
                      objectPosition: placementSide ? 'center' : 'top left',
                      imageRendering: 'crisp-edges',
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}

      {/* Clear button */}
      <button type="button" onClick={() => void clear()}
        style={{
          position: 'absolute', left: 8, bottom: 8, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 16, border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
          background: 'rgba(0,0,0,0.06)', color: '#999',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ff453a'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#999'; e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
      >
        <Trash2 size={10} /> Temizle
      </button>
    </div>
    </div>
  );
};


// ── Main Component ──
interface SolveViewDocProps {
  questions: CroppedItem[];
  stems: CroppedItem[];
  solutions: CroppedItem[];
  regions: Region[];
  pageLayouts: PageLayout[];
  allStrokes: Record<number, StrokeData[]>;
  onStrokesChange: (key: number, strokes: StrokeData[]) => void;
  onGoEdit?: () => void;
  docSolutionPlacement: DocSolutionPlacement;
  toolbarDock: ToolbarDock;
  palmDefault: boolean;
  docName: string;
  breadcrumbSegments?: string[];
  onOpenSettings?: () => void;
  onOpenSidebar?: () => void;
  focusMode?: boolean;
  onFocusModeChange?: (focused: boolean) => void;
  saveStatus?: SaveStatus;
  onSaveRetry?: () => void;
  saveNotification?: SaveNotificationMode;
  questionStatus?: Record<number, QuestionAnswerStatus>;
  onQuestionStatusChange?: (key: number, status: QuestionAnswerStatus | null) => void;
}

export const SolveViewDoc: React.FC<SolveViewDocProps> = ({
  questions, stems, solutions, regions, pageLayouts, allStrokes, onStrokesChange, onGoEdit,
  docSolutionPlacement, toolbarDock, palmDefault, docName, breadcrumbSegments = [],
  onOpenSettings, onOpenSidebar, saveStatus, onSaveRetry, saveNotification,
  questionStatus = {}, onQuestionStatusChange,
  focusMode = false, onFocusModeChange,
}) => {
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#1a1a1f');
  const [size, setSize] = useState(2);
  const [palm, setPalm] = useState(palmDefault);
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [shownSols, setShownSols] = useState<Set<number>>(new Set());
  const [, tick] = useState(0);
  const [isFar, setIsFar] = useState(false); // true when user is far from content
  const [filterWrongOnly, setFilterWrongOnly] = useState(false);
  const [showDockTip, setShowDockTip] = useState(() => !hasSeenOnboarding('solve_dock'));
  const [showFocusTip, setShowFocusTip] = useState(() => !hasSeenOnboarding('solve_focus'));
  const [showPanTip, setShowPanTip] = useState(() => !hasSeenOnboarding('doc_pan_reset'));
  const [showPencilTip, setShowPencilTip] = useState(() => !hasSeenOnboarding('pencil_squeeze'));
  const lastTapRef = useRef(0);
  const chromeRootRef = useRef<HTMLDivElement>(null);
  const toolBeforeEraserRef = useRef<Tool>('pencil');
  const { commit, undo, redo, canUndo, canRedo } = usePerKeyStrokeHistory(allStrokes, onStrokesChange);

  // Free-form pan+zoom: all refs, zero re-renders during gesture
  const touchesRef    = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid  = useRef<{ x: number; y: number } | null>(null);
  const lastSingleTouch = useRef<{ x: number; y: number } | null>(null);
  const singleTouchIdRef = useRef<number | null>(null);
  const viewportRef   = useRef<HTMLDivElement>(null); // overflow:hidden container
  const contentRef    = useRef<HTMLDivElement>(null); // transform target
  const txRef = useRef(0);   // translateX
  const tyRef = useRef(0);   // translateY
  const scRef = useRef(1);   // scale

  const FAR_THRESHOLD = 200;
  const applyTransform = (tx: number, ty: number, sc: number) => {
    txRef.current = tx; tyRef.current = ty; scRef.current = sc;
    if (!contentRef.current) return;
    contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    const far = Math.abs(tx) > FAR_THRESHOLD || Math.abs(ty) > FAR_THRESHOLD || sc < 0.5;
    setIsFar(far);
  };

  const getPanBounds = useCallback(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return null;
    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    const sc = scRef.current;
    const cW = content.offsetWidth * sc;
    const cH = content.offsetHeight * sc;
    const margin = 48;
    let minTx: number;
    let maxTx: number;
    let minTy: number;
    let maxTy: number;
    if (cW <= vpW) {
      const cx = (vpW - cW) / 2;
      minTx = maxTx = cx;
    } else {
      maxTx = margin;
      minTx = vpW - cW - margin;
    }
    if (cH <= vpH) {
      const cy = (vpH - cH) / 2;
      minTy = maxTy = cy;
    } else {
      maxTy = margin;
      minTy = vpH - cH - margin;
    }
    return { minTx, maxTx, minTy, maxTy };
  }, []);

  const clampPan = useCallback((tx: number, ty: number) => {
    const b = getPanBounds();
    if (!b) return { tx, ty };
    return {
      tx: Math.min(b.maxTx, Math.max(b.minTx, tx)),
      ty: Math.min(b.maxTy, Math.max(b.minTy, ty)),
    };
  }, [getPanBounds]);

  const panApply = useCallback((tx: number, ty: number, sc: number) => {
    const { tx: cx, ty: cy } = clampPan(tx, ty);
    applyTransform(cx, cy, sc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampPan]);

  const settlePan = useCallback(() => {
    const { tx, ty } = clampPan(txRef.current, tyRef.current);
    if (tx === txRef.current && ty === tyRef.current) return;
    if (!contentRef.current) return;
    contentRef.current.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
    applyTransform(tx, ty, scRef.current);
    window.setTimeout(() => {
      if (contentRef.current) contentRef.current.style.transition = '';
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampPan]);

  /** Aktif sayfayı görünüm ortasına getir (tx=0 belgeyi sola yaslar) */
  const centerActivePage = useCallback((animate = false) => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;

    const sc = 1;
    const pageEl = content.querySelector<HTMLElement>(`[data-doc-page-index="${activePage}"]`);

    let tx = txRef.current;
    let ty = tyRef.current;

    if (pageEl) {
      const vpRect = vp.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const vpCx = vpRect.left + vpRect.width / 2;
      const vpCy = vpRect.top + vpRect.height / 2;
      const pageCx = pageRect.left + pageRect.width / 2;
      const pageCy = pageRect.top + pageRect.height / 2;
      tx = txRef.current + (vpCx - pageCx);
      ty = tyRef.current + (vpCy - pageCy);
    }

    if (animate) {
      content.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
      window.setTimeout(() => {
        if (content) content.style.transition = '';
      }, 460);
    }

    panApply(tx, ty, sc);
    setZoom(sc);
  }, [activePage, panApply]);

  const returnToPage = () => centerActivePage(true);

  const applyTool  = useCallback((t: Tool) => { G.tool = t; setTool(t); tick(n => n + 1); }, []);
  const applyColor = useCallback((c: string) => { G.color = c; G.tool = 'pencil'; setColor(c); setTool('pencil'); tick(n => n + 1); }, []);
  const applySize  = useCallback((s: number) => { G.baseSize = s; setSize(s); tick(n => n + 1); }, []);

  const togglePenEraser = useCallback(() => {
    if (tool === 'eraser') {
      applyTool(toolBeforeEraserRef.current);
    } else {
      toolBeforeEraserRef.current = tool;
      applyTool('eraser');
    }
  }, [tool, applyTool]);

  const toggleSol = useCallback((qi: number) => {
    hapticLight();
    setShownSols(prev => { const n = new Set(prev); n.has(qi) ? n.delete(qi) : n.add(qi); return n; });
  }, []);

  const allSolutionKeys = useMemo(() => {
    const keys = new Set<number>();
    const solKeySet = new Set(
      solutions.map(s => solutionToggleKey(s.questionIndex, s.segmentIndex ?? 0)),
    );
    [...questions, ...stems].forEach(item => {
      const seg = segmentIndexAfterContent(item);
      if (seg === null) return;
      const key = solutionToggleKey(item.questionIndex, seg);
      if (solKeySet.has(key)) keys.add(key);
    });
    return keys;
  }, [questions, stems, solutions]);

  const toggleAllSolutions = useCallback(() => {
    const keys = Array.from(allSolutionKeys);
    if (keys.length === 0) return;
    hapticMedium();
    setShownSols(prev => {
      const allOpen = keys.every(k => prev.has(k));
      return allOpen ? new Set<number>() : new Set(keys);
    });
  }, [allSolutionKeys]);

  const allSolutionsOpen = useMemo(() => {
    const keys = Array.from(allSolutionKeys);
    return keys.length > 0 && keys.every(k => shownSols.has(k));
  }, [allSolutionKeys, shownSols]);

  useApplePencilGestures({
    targetRef: chromeRootRef,
    onToggleEraser: togglePenEraser,
    onSqueezeToggle: toggleAllSolutions,
  });

  // Build region map
  const regionMap = new Map(regions.map(r => [r.id, r]));
  const allItems = [...questions, ...stems];

  const solMap = new Map<number, CroppedItem>();
  solutions.forEach(s => {
    const seg = s.segmentIndex ?? 0;
    solMap.set(solutionToggleKey(s.questionIndex, seg), s);
  });

  const questionNumbers = new Map<number, number>();
  [...questions].sort((a, b) => (a.sortY ?? 0) - (b.sortY ?? 0)).forEach((q, i) => {
    questionNumbers.set(q.questionIndex, i + 1);
  });

  const solutionRegions = new Map(
    regions.filter(r => r.type === 'solution').map(r => [r.id, r]),
  );
  // const allQRegions = regions.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);

  const pageItems = new Map<number, { item: CroppedItem; region: Region }[]>();
  allItems.forEach(item => {
    const reg = regionMap.get(item.regionId);
    if (!reg) return;
    const pg = pageLayouts.find(p => reg.y >= p.offsetY && reg.y < p.offsetY + p.height);
    if (!pg) return;
    const arr = pageItems.get(pg.pageNum) || [];
    arr.push({ item, region: reg });
    pageItems.set(pg.pageNum, arr);
  });

  // Zoom pill helpers
  const zoomTo = (sc: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const midX = vp.offsetWidth / 2;
    const midY = vp.offsetHeight / 2;
    const ratio = sc / scRef.current;
    const tx = midX - (midX - txRef.current) * ratio;
    const ty = midY - (midY - tyRef.current) * ratio;
    panApply(tx, ty, sc);
    setZoom(sc);
  };
  const zoomIn  = () => zoomTo(Math.min(MAX_ZOOM, +(scRef.current + 0.25).toFixed(2)));
  const zoomOut = () => zoomTo(Math.max(MIN_ZOOM, +(scRef.current - 0.25).toFixed(2)));
  const zoomReset = () => { hapticLight(); centerActivePage(true); };

  // Native wheel + touch listeners — bypasses React's event system for max smoothness
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom: exponential scale for perceptually linear feel
        const rect = vp.getBoundingClientRect();
        const midX = e.clientX - rect.left;
        const midY = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.008); // exponential = perfectly smooth
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scRef.current * factor));
        const ratio = next / scRef.current;
        panApply(
          midX - (midX - txRef.current) * ratio,
          midY - (midY - tyRef.current) * ratio,
          next,
        );
        setZoom(next);
      } else {
        panApply(
          txRef.current - e.deltaX,
          tyRef.current - e.deltaY,
          scRef.current,
        );
      }
    };

    vp.addEventListener('wheel', handleWheel, { passive: false });
    return () => vp.removeEventListener('wheel', handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Touch: two-finger pan + pinch zoom centered at midpoint
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    Array.from(e.changedTouches).forEach(t => {
      touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    });
    if (touchesRef.current.size === 1) {
      const t = e.changedTouches[0];
      lastSingleTouch.current = { x: t.clientX, y: t.clientY };
      singleTouchIdRef.current = t.identifier;
      lastPinchDist.current = null;
      lastPinchMid.current = null;
    } else if (touchesRef.current.size === 2) {
      lastSingleTouch.current = null;
      singleTouchIdRef.current = null;
      const pts = Array.from(touchesRef.current.values());
      lastPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      lastPinchMid.current  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchesRef.current.size === 1 && lastSingleTouch.current != null) {
      e.preventDefault();
      const touch = Array.from(e.touches).find(t => t.identifier === singleTouchIdRef.current)
        ?? e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - lastSingleTouch.current.x;
      const dy = touch.clientY - lastSingleTouch.current.y;
      lastSingleTouch.current = { x: touch.clientX, y: touch.clientY };
      panApply(txRef.current + dx, tyRef.current + dy, scRef.current);
      return;
    }
    if (touchesRef.current.size !== 2) return;
    e.preventDefault();
    Array.from(e.changedTouches).forEach(t => {
      touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    });
    const pts  = Array.from(touchesRef.current.values());
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    // Midpoint relative to viewport
    const localMidX = mid.x - rect.left;
    const localMidY = mid.y - rect.top;

    let tx = txRef.current;
    let ty = tyRef.current;
    let sc = scRef.current;

    // Pinch zoom centered at fingers
    if (lastPinchDist.current !== null && lastPinchDist.current > 0) {
      const ratio = dist / lastPinchDist.current;
      const next  = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, sc * ratio));
      const r     = next / sc;
      tx = localMidX - (localMidX - tx) * r;
      ty = localMidY - (localMidY - ty) * r;
      sc = next;
    }

    // Two-finger pan
    if (lastPinchMid.current !== null) {
      const prevLocalX = lastPinchMid.current.x - rect.left;
      const prevLocalY = lastPinchMid.current.y - rect.top;
      tx += localMidX - prevLocalX;
      ty += localMidY - prevLocalY;
    }

    panApply(tx, ty, sc);

    lastPinchDist.current = dist;
    lastPinchMid.current  = mid;
  }, [panApply]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    Array.from(e.changedTouches).forEach(t => touchesRef.current.delete(t.identifier));
    if (touchesRef.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current  = null;
      setZoom(scRef.current);
    }
    if (touchesRef.current.size === 0) {
      lastSingleTouch.current = null;
      singleTouchIdRef.current = null;
      settlePan();
    } else if (touchesRef.current.size === 1) {
      const t = Array.from(e.touches)[0];
      if (t) {
        lastSingleTouch.current = { x: t.clientX, y: t.clientY };
        singleTouchIdRef.current = t.identifier;
      }
    }
  }, [settlePan]);

  const contentKeys = useMemo(
    () => [...questions, ...stems].map(item => strokeKey(item)),
    [questions, stems],
  );
  const totalContent = contentKeys.length;
  const hasWrongMarked = Object.values(questionStatus).some(s => s === 'wrong');

  const visiblePageLayouts = useMemo(() => {
    if (!filterWrongOnly) return pageLayouts;
    return pageLayouts.filter(pg => {
      const items = pageItems.get(pg.pageNum) ?? [];
      return items.some(({ item }) => {
        if (item.type !== 'question' && item.type !== 'stem') return false;
        return questionStatus[strokeKey(item)] === 'wrong';
      });
    });
  }, [filterWrongOnly, pageLayouts, pageItems, questionStatus]);

  useEffect(() => {
    if (activePage >= visiblePageLayouts.length) {
      setActivePage(Math.max(0, visiblePageLayouts.length - 1));
    }
  }, [activePage, visiblePageLayouts.length]);

  useEffect(() => {
    const t = window.setTimeout(() => centerActivePage(false), 80);
    return () => clearTimeout(t);
  }, [focusMode, activePage, visiblePageLayouts.length, centerActivePage]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => {
      if (scRef.current === 1) centerActivePage(false);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [centerActivePage]);

  const totalPages = visiblePageLayouts.length;

  const onViewportClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) returnToPage();
    lastTapRef.current = now;
  };

  const toggleFocus = () => {
    const next = !focusMode;
    onFocusModeChange?.(next);
    if (next && !hasSeenOnboarding('solve_focus')) {
      setShowFocusTip(true);
    }
  };
  const toolbarExtra = (
    <>
      {focusMode && onOpenSidebar && <SolveSidebarToggle onOpen={onOpenSidebar} />}
      {focusMode && (
        <SaveIndicator
          status={saveStatus ?? 'idle'}
          onRetry={onSaveRetry}
          notificationMode={saveNotification}
        />
      )}
      <SolveFocusToggle focusMode={focusMode} onToggle={toggleFocus} />
    </>
  );

  return (
    <div
      ref={chromeRootRef}
      className={`solve-chrome-root${focusMode ? ' solve-focus-mode' : ''}`}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {!focusMode && (
      <header className="chrome-topbar chrome-topbar--compact chrome-topbar--doc-solve">
        <div className="chrome-topbar-start">
          {onOpenSidebar && <SolveSidebarToggle onOpen={onOpenSidebar} />}
          {breadcrumbSegments.length > 0 ? (
            <Breadcrumb segments={breadcrumbSegments} current={docName} />
          ) : (
            <span className="chrome-doc-name" title={docName}>{docName}</span>
          )}
          <nav className="chrome-stepper chrome-stepper--mini" aria-label="İlerleme">
            <button type="button" className="chrome-step chrome-step--link" onClick={onGoEdit}>
              <span className="chrome-step-num">1</span><span className="chrome-step-label">Soru</span>
            </button>
            <button type="button" className="chrome-step chrome-step--link" onClick={onGoEdit}>
              <span className="chrome-step-num">2</span><span className="chrome-step-label">Çözüm</span>
            </button>
            <span className="chrome-step is-current">
              <span className="chrome-step-num">3</span><span className="chrome-step-label">Çöz</span>
            </span>
          </nav>
        </div>
        <div className="chrome-topbar-center">
          {totalContent > 0 && (
            <SolveProgressSummary questionStatus={questionStatus} contentKeys={contentKeys} />
          )}
          {totalPages > 1 && (
            <QuestionNavigator
              current={activePage + 1}
              total={totalPages}
              onPrev={() => setActivePage(p => Math.max(0, p - 1))}
              onNext={() => setActivePage(p => Math.min(totalPages - 1, p + 1))}
            />
          )}
          {filterWrongOnly && totalPages === 0 && (
            <span className="chrome-topbar-hint">Yanlış işaretli soru yok</span>
          )}
        </div>
        <div className="chrome-topbar-end">
          {hasWrongMarked && (
            <button
              type="button"
              className={`btn btn-ghost chrome-touch-btn${filterWrongOnly ? ' is-active' : ''}`}
              onClick={() => {
                hapticLight();
                setFilterWrongOnly(v => !v);
                setActivePage(0);
              }}
            >
              {filterWrongOnly ? 'Tümü' : 'Yanlışlar'}
            </button>
          )}
          <SolveChromeActions
            saveStatus={saveStatus}
            onSaveRetry={onSaveRetry}
            saveNotification={saveNotification}
          />
          <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} />
        </div>
      </header>
      )}

      <div className="solve-chrome-layout">
        <DrawToolbar
          dock={toolbarDock}
          tool={tool}
          color={color}
          size={size}
          palm={palm}
          onTool={applyTool}
          onColor={applyColor}
          onSize={applySize}
          onPalm={() => setPalm(v => !v)}
          onGoEdit={onGoEdit}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onOpenSettings={onOpenSettings}
          onToggleAllSolutions={allSolutionKeys.size > 0 ? toggleAllSolutions : undefined}
          allSolutionsOpen={allSolutionsOpen}
          extra={toolbarExtra}
        />
        {showDockTip && !focusMode && (
          <OnboardingTip
            dock={toolbarDock}
            title="Çizim araçları"
            message="Sağdaki (veya ayarlardan seçtiğiniz) dock’tan kalem, silgi ve avuç reddi kullanın. Geri al / yinele de burada."
            onDismiss={() => {
              markOnboardingSeen('solve_dock');
              setShowDockTip(false);
            }}
          />
        )}
        {showPencilTip && !focusMode && (
          <OnboardingTip
            dock={toolbarDock}
            title="Apple Pencil"
            message="Tarayıcıda çift dokunuş ve sıkıştırma çoğu zaman çalışmaz. Silgi için silgi düğmesi; tüm çözümler için göz simgesini kullanın. Ayarlar → Apple Pencil’de çift dokunuşu “Yok” yapmamanız gerekir."
            onDismiss={() => {
              markOnboardingSeen('pencil_squeeze');
              setShowPencilTip(false);
            }}
          />
        )}
        {focusMode && showFocusTip && (
          <OnboardingTip
            position="fixed-top"
            title="Tam ekran"
            message="Üst çubuk gizlendi; araç çubuğu ve sayfa gezgini açık. Sol üstten menüyü açabilirsiniz."
            onDismiss={() => {
              markOnboardingSeen('solve_focus');
              setShowFocusTip(false);
            }}
          />
        )}
        <div
          ref={viewportRef}
          onClick={onViewportClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="solve-chrome-canvas"
          style={{ flex: 1, overflow: 'hidden', position: 'relative', touchAction: 'none' }}
        >
          <div ref={contentRef} style={{
            transform: `translate(0px, 0px) scale(1)`,
            transformOrigin: '0 0',
            willChange: 'transform',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            padding: '24px 72px 80px',
            width: 'max-content',
            minWidth: '100%',
          }}>
            {visiblePageLayouts.map((pg, pageIdx) => (
              <div key={pg.pageNum} data-doc-page-index={pageIdx} className="doc-page-slot">
              <DocPage
                layout={pg}
                items={pageItems.get(pg.pageNum) || []}
                solMap={solMap}
                strokes={allStrokes[10000 + pg.pageNum] || []}
                onStrokesChange={s => commit(10000 + pg.pageNum, s)}
                palmRejection={palm}
                shownSols={shownSols}
                onToggleSol={toggleSol}
                questionNumbers={questionNumbers}
                solutionRegions={solutionRegions}
                docSolutionPlacement={docSolutionPlacement}
                questionStatus={questionStatus}
                onQuestionStatusChange={onQuestionStatusChange}
              />
              </div>
            ))}
          </div>
          {isFar && showPanTip && (
            <OnboardingTip
              position="fixed-top"
              title="Sayfaya dön"
              message="Belgeden uzaklaştınız. Alttaki düğme veya çift dokunuşla aktif sayfaya dönebilirsiniz."
              onDismiss={() => {
                markOnboardingSeen('doc_pan_reset');
                setShowPanTip(false);
              }}
            />
          )}
          {isFar && (
            <button
              type="button"
              className={`doc-return-page-fab${focusMode ? ' doc-return-page-fab--focus' : ''}`}
              onClick={() => { hapticLight(); returnToPage(); }}
              aria-label="Sayfaya dön"
              title="Sayfaya dön"
            >
              <LocateFixed size={18} strokeWidth={2.25} />
              <span>Sayfaya dön</span>
            </button>
          )}
          <DocThumbZone
            pageIndex={activePage}
            totalPages={totalPages}
            onPrevPage={() => setActivePage(p => Math.max(0, p - 1))}
            onNextPage={() => setActivePage(p => Math.min(totalPages - 1, p + 1))}
            canToggleSol={false}
            solShown={false}
            onToggleSol={() => {}}
          />
        </div>
      </div>
    </div>
  );

};
