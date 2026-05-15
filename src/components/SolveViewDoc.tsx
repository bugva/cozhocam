import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { DrawToolbar, type DrawTool } from './shell/DrawToolbar';
import { ZoomControls } from './shell/ZoomControls';
import { QuestionNavigator } from './shell/QuestionNavigator';
import { Breadcrumb } from './shell/Breadcrumb';
import type { DocSolutionPlacement, ToolbarDock } from '../utils/settings';
import { SCALE, type PageLayout } from '../utils/pdfCrop';
import type { Region } from './PdfViewer';
import type { CroppedItem } from '../utils/db';
import {
  segmentIndexAfterContent,
  solutionDocButtonLabel,
  solutionPanelTitle,
  solutionToggleKey,
} from '../utils/questionGroups';
import { usePerKeyStrokeHistory } from '../hooks/usePerKeyStrokeHistory';
import { OnboardingTip } from './shell/OnboardingTip';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';
import { SolveChromeActions } from './shell/SolveChromeActions';
import { DocThumbZone } from './shell/DocThumbZone';
import { hapticLight } from '../utils/haptic';
import type { SaveStatus } from './shell/SaveIndicator';
import { useApplePencilGestures } from '../hooks/useApplePencilGestures';
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
}> = ({ layout, items, solMap, strokes, onStrokesChange, palmRejection, shownSols, onToggleSol, questionNumbers, solutionRegions, docSolutionPlacement }) => {
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
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    activeStroke.current = { tool: G.tool, color: G.color, baseSize: G.baseSize, points: [coord(e)] };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !activeStroke.current || ign(e)) return;
    activeStroke.current.points.push(coord(e)); composite(activeStroke.current);
  };
  const onUp = () => {
    if (!drawing.current || !activeStroke.current) return;
    drawing.current = false;
    const next = [...strokesRef.current, activeStroke.current];
    activeStroke.current = null; strokesRef.current = next;
    bake(next); composite(); onStrokesChange(next);
  };
  const clear = () => { strokesRef.current = []; onStrokesChange([]); bake([]); composite(); };

  const sorted = [...items].sort((a, b) => a.region.y - b.region.y);
  const placementSide = docSolutionPlacement === 'side';
  const solColLeft = placementSide ? dW : 0;
  const rowW = placementSide ? dW * 2 : dW;
  const btnColLeft = dW;
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
          const boxH = item.height / SCALE;
          const btnLabel = solutionDocButtonLabel(item);
          const panelTitle = solutionPanelTitle(item, qNum);
          const isStem = item.type === 'stem';
          const variant = isStem ? 'stem' : 'question';
          const solReg = solutionRegions.get(sol.regionId);
          const regionRight = boxLeft + boxW;
          const connectorW = Math.max(4, btnColLeft - regionRight - 6);
          const gapTop = solReg ? (solReg.y - layout.offsetY) / SCALE : 0;
          const gapH = solReg ? solReg.h / SCALE : 0;
          /** Sonraki soru/öncülün başladığı Y (beyaz alanın alt sınırı) */
          const nextBlockTop = gapTop + gapH;
          const solImgH = sol.height / SCALE;
          const revealTop = placementSide ? gapTop : nextBlockTop;
          const revealH = placementSide ? gapH : solImgH;
          const connectorTop = boxTop + boxH / 2;
          const anchorTop = boxTop;
          const anchorH = boxH;

          return (
            <React.Fragment key={`sol-${item.regionId}-${seg}`}>
              <div
                className={`doc-sol-connector-line doc-sol-connector-line--${variant}`}
                style={{
                  left: regionRight,
                  top: connectorTop,
                  width: connectorW,
                }}
              />
              <div
                className="doc-sol-anchor"
                style={{ left: btnColLeft, top: anchorTop, height: anchorH }}
              >
                <button
                  type="button"
                  className={`doc-sol-btn doc-sol-btn--${variant}${shown ? ' is-open' : ''}`}
                  style={{ transform: 'translate(-100%, -50%)' }}
                  onClick={() => onToggleSol(toggleKey)}
                  title={panelTitle}
                >
                  {shown ? <EyeOff size={12} strokeWidth={2.5} /> : <Eye size={12} strokeWidth={2.5} />}
                  {shown ? 'Gizle' : btnLabel}
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
      <button onClick={clear}
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
  onOpenLibrary?: () => void;
  saveStatus?: SaveStatus;
}

export const SolveViewDoc: React.FC<SolveViewDocProps> = ({
  questions, stems, solutions, regions, pageLayouts, allStrokes, onStrokesChange, onGoEdit,
  docSolutionPlacement, toolbarDock, palmDefault, docName, breadcrumbSegments = [],
  onOpenLibrary, saveStatus,
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
  const [showDockTip, setShowDockTip] = useState(() => !hasSeenOnboarding('solve_dock'));
  const lastTapRef = useRef(0);
  const chromeRootRef = useRef<HTMLDivElement>(null);
  const toolBeforeEraserRef = useRef<Tool>('pencil');
  const thumbSolKeyRef = useRef<number | null>(null);

  const { commit, undo, redo, canUndo, canRedo } = usePerKeyStrokeHistory(allStrokes, onStrokesChange);

  // Free-form pan+zoom: all refs, zero re-renders during gesture
  const touchesRef    = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid  = useRef<{ x: number; y: number } | null>(null);
  const viewportRef   = useRef<HTMLDivElement>(null); // overflow:hidden container
  const contentRef    = useRef<HTMLDivElement>(null); // transform target
  const txRef = useRef(0);   // translateX
  const tyRef = useRef(0);   // translateY
  const scRef = useRef(1);   // scale

  const FAR_THRESHOLD = 400; // px
  const applyTransform = (tx: number, ty: number, sc: number) => {
    txRef.current = tx; tyRef.current = ty; scRef.current = sc;
    if (!contentRef.current) return;
    contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    // Show 'return' button when far from content or very zoomed out
    const far = Math.abs(tx) > FAR_THRESHOLD || Math.abs(ty) > FAR_THRESHOLD || sc < 0.4;
    setIsFar(far);
  };

  const SOFT_LIMIT = 2000;
  const softApply = (tx: number, ty: number, sc: number) => {
    const clampedTx = Math.max(-SOFT_LIMIT, Math.min(SOFT_LIMIT, tx));
    const clampedTy = Math.max(-SOFT_LIMIT, Math.min(SOFT_LIMIT, ty));
    applyTransform(clampedTx, clampedTy, sc);
  };

  // Animate back to origin with a smooth CSS transition
  const returnToPage = () => {
    if (!contentRef.current) return;
    contentRef.current.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
    applyTransform(0, 0, 1);
    setZoom(1);
    setTimeout(() => {
      if (contentRef.current) contentRef.current.style.transition = '';
    }, 460);
  };

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

  const onSqueezeToggle = useCallback(() => {
    const key = thumbSolKeyRef.current;
    if (key != null) toggleSol(key);
  }, [toggleSol]);

  useApplePencilGestures({
    targetRef: chromeRootRef,
    onToggleEraser: togglePenEraser,
    onSqueezeToggle,
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
    softApply(tx, ty, sc);
    setZoom(sc);
  };
  const zoomIn  = () => zoomTo(Math.min(MAX_ZOOM, +(scRef.current + 0.25).toFixed(2)));
  const zoomOut = () => zoomTo(Math.max(MIN_ZOOM, +(scRef.current - 0.25).toFixed(2)));
  const zoomReset = () => { hapticLight(); softApply(0, 0, 1); setZoom(1); };

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
        softApply(
          midX - (midX - txRef.current) * ratio,
          midY - (midY - tyRef.current) * ratio,
          next,
        );
        setZoom(next);
      } else {
        // Two-finger pan — direct pixel delta, same smoothness as native scroll
        applyTransform(
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
    if (touchesRef.current.size === 2) {
      const pts = Array.from(touchesRef.current.values());
      lastPinchDist.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      lastPinchMid.current  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
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

    // Apply directly — no clamp during gesture, fully free
    applyTransform(tx, ty, sc);

    lastPinchDist.current = dist;
    lastPinchMid.current  = mid;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    Array.from(e.changedTouches).forEach(t => touchesRef.current.delete(t.identifier));
    if (touchesRef.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchMid.current  = null;
      setZoom(scRef.current);
    }
  }, []);

  const totalPages = pageLayouts.length;
  const currentPg = pageLayouts[activePage]?.pageNum;
  let thumbSolKey: number | null = null;
  if (currentPg != null) {
    for (const { item } of pageItems.get(currentPg) ?? []) {
      const seg = segmentIndexAfterContent(item);
      if (seg === null) continue;
      const key = solutionToggleKey(item.questionIndex, seg);
      if (solMap.has(key)) { thumbSolKey = key; break; }
    }
  }
  thumbSolKeyRef.current = thumbSolKey;

  const onViewportClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) returnToPage();
    lastTapRef.current = now;
  };

  return (
    <div ref={chromeRootRef} className="solve-chrome-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
          {totalPages > 1 && (
            <QuestionNavigator
              current={activePage + 1}
              total={totalPages}
              onPrev={() => setActivePage(p => Math.max(0, p - 1))}
              onNext={() => setActivePage(p => Math.min(totalPages - 1, p + 1))}
            />
          )}
          <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} />
          {isFar && (
            <button type="button" className="btn btn-ghost chrome-touch-btn" onClick={returnToPage}>Sayfaya dön</button>
          )}
        </div>
      </header>

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
        />
        {showDockTip && (
          <OnboardingTip
            position="right"
            title="Çizim araçları"
            message="Sağdaki (veya ayarlardan seçtiğiniz) dock’tan kalem, silgi ve avuç reddi kullanın. Geri al / yinele de burada."
            onDismiss={() => {
              markOnboardingSeen('solve_dock');
              setShowDockTip(false);
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
            {pageLayouts.map(pg => (
              <DocPage
                key={pg.pageNum}
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
              />
            ))}
          </div>
          <DocThumbZone
            pageIndex={activePage}
            totalPages={totalPages}
            onPrevPage={() => setActivePage(p => Math.max(0, p - 1))}
            onNextPage={() => setActivePage(p => Math.min(totalPages - 1, p + 1))}
            canToggleSol={thumbSolKey != null}
            solShown={thumbSolKey != null && shownSols.has(thumbSolKey)}
            onToggleSol={() => { if (thumbSolKey != null) toggleSol(thumbSolKey); }}
          />
        </div>
      </div>
    </div>
  );

};
