import React, { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../contexts/ConfirmContext';
import { hapticLight, hapticMedium } from '../utils/haptic';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface Region {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'question' | 'solution' | 'stem';
  /** Öncül / çözüm → hangi soruya bağlı */
  parentQuestionId?: string;
  /** Öncül sırası (1, 2, …) — aynı soru altında */
  stemIndex?: number;
  /** Çözüm: soru ile öncül veya öncüller arası boşluk (0 = sorudan sonra) */
  segmentIndex?: number;
  /** Çözümün hemen üstündeki bölge */
  afterRegionId?: string;
}

interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
  offsetY: number;
}

interface PdfViewerProps {
  pdfData: ArrayBuffer;
  mode?: 'SELECT_QUESTIONS' | 'ADJUST_SOLUTIONS' | 'SOLVE';
  regions?: Region[];
  onRegionsChange?: (regions: Region[]) => void;
  /** Sürükleme sırasında geçici önizleme (undo kaydı oluşturmaz) */
  onRegionsPreview?: (regions: Region[]) => void;
  showOriginal?: boolean;
  drawType?: 'question' | 'stem';
  onDrawTypeChange?: (t: 'question' | 'stem') => void;
  activeQuestionId?: string | null;
  onActiveQuestionIdChange?: (id: string) => void;
}

import { SCALE, PAGE_GAP } from '../utils/pdfCrop';
import {
  assignStemIndices,
  inferParentQuestionId,
  migrateRegions,
  regionLabel,
  removeQuestionCascade,
} from '../utils/questionGroups';

/* ── Single page renderer (self-contained, StrictMode safe) ── */
const PageCanvas: React.FC<{ pdf: pdfjsLib.PDFDocumentProxy; pageNum: number }> = ({ pdf, pageNum }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      await new Promise(r => setTimeout(r, 0));
      if (cancelled || !canvasRef.current) return;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
      }

      try {
        setPageError(null);
        const page = await pdf.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: SCALE });
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;

        let canvasWidth = Math.floor(viewport.width * dpr);
        let canvasHeight = Math.floor(viewport.height * dpr);

        // Prevent exceeding browser canvas limits (e.g. 4096px or 16M pixels)
        const MAX_DIM = 4096;
        const MAX_AREA = 16777216; // 16MB
        if (canvasWidth > MAX_DIM || canvasHeight > MAX_DIM || (canvasWidth * canvasHeight) > MAX_AREA) {
          const ratioX = MAX_DIM / canvasWidth;
          const ratioY = MAX_DIM / canvasHeight;
          const ratioArea = Math.sqrt(MAX_AREA / (canvasWidth * canvasHeight));
          const scaleDown = Math.min(ratioX, ratioY, ratioArea, 1);
          canvasWidth = Math.floor(canvasWidth * scaleDown);
          canvasHeight = Math.floor(canvasHeight * scaleDown);
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d')!;
        
        // Correct way to handle high-DPI and scaled down canvas in PDF.js
        const scaleX = canvasWidth / viewport.width;
        const scaleY = canvasHeight / viewport.height;
        const transform = (scaleX !== 1 || scaleY !== 1) ? [scaleX, 0, 0, scaleY, 0, 0] : undefined;

        const renderTask = page.render({ 
          canvasContext: ctx, 
          viewport,
          transform
        } as any);
        
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
        console.error(`Page ${pageNum} render error:`, err);
        setPageError(`Sayfa ${pageNum} çizilemedi: ${err?.message || 'Bilinmeyen hata'}`);
      } finally {
        if (renderTaskRef.current) renderTaskRef.current = null;
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNum]);

  if (pageError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff453a', padding: 16, textAlign: 'center', fontWeight: 500, fontSize: 14 }}>
        {pageError}
      </div>
    );
  }

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
};

/* ── PdfViewer ── */
export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfData,
  mode = 'SELECT_QUESTIONS',
  regions = [],
  onRegionsChange,
  onRegionsPreview,
  showOriginal = false,
  drawType: drawTypeProp,
  onDrawTypeChange,
  activeQuestionId: activeQuestionIdProp,
  onActiveQuestionIdChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const isDrawingRef = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [drawTypeLocal, setDrawTypeLocal] = useState<'question' | 'stem'>('question');
  const [activeQuestionIdLocal, setActiveQuestionIdLocal] = useState<string | null>(null);
  const drawType = drawTypeProp ?? drawTypeLocal;
  const activeQuestionId = activeQuestionIdProp ?? activeQuestionIdLocal;
  const setActiveQuestionId = onActiveQuestionIdChange ?? setActiveQuestionIdLocal;
  void onDrawTypeChange;
  void setDrawTypeLocal;
  const { confirm } = useConfirm();
  const dragRef = useRef<{ id: string; lastY: number; lastX: number } | null>(null);
  const resizeRef = useRef<{ id: string; edge: 'top' | 'bottom'; lastY: number } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  const applyRegions = (next: Region[], preview = false) => {
    regionsRef.current = next;
    if (preview) onRegionsPreview?.(next);
    else onRegionsChange?.(next);
  };

  const questionRegions = regions.filter(r => r.type === 'question');

  useEffect(() => {
    const migrated = migrateRegions(regions);
    if (JSON.stringify(migrated) !== JSON.stringify(regions)) {
      onRegionsChange?.(migrated);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeQuestionId && questionRegions.some(q => q.id === activeQuestionId)) return;
    setActiveQuestionId(questionRegions[questionRegions.length - 1]?.id ?? null);
  }, [questionRegions, activeQuestionId]);

  // Load PDF
  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;

    (async () => {
      try {
        console.log('Loading PDF...');
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(pdfData.slice(0)),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
        }).promise;
        console.log('PDF loaded, numPages:', doc.numPages);
        if (cancelled) return;

        const infos: PageInfo[] = [];
        let cumY = 0;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const vp = page.getViewport({ scale: SCALE });
          infos.push({ pageNum: i, width: vp.width, height: vp.height, offsetY: cumY });
          cumY += vp.height + PAGE_GAP;
        }

        console.log('Pages built:', infos.length);
        if (cancelled) return;
        setPdf(doc);
        setPages(infos);
      } catch (err: any) {
        if (cancelled) return;
        console.error('PdfViewer load error:', err);
        setRenderError('PDF Yükleme Hatası: ' + (err?.message ?? err));
      }
    })();

    return () => { cancelled = true; };
  }, [pdfData]);

  // Total size
  const totalHeight = pages.length > 0 ? pages[pages.length - 1].offsetY + pages[pages.length - 1].height : 0;
  const docWidth = pages.length > 0 ? pages[0].width : 0;

  // Pointer handlers
  const getPos = (e: React.PointerEvent) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, r.width)), y: Math.max(0, Math.min(e.clientY - r.top, r.height)) };
  };

  const activeTouches = useRef(0);
  const pendingDrawRef = useRef<{ pointerId: number } | null>(null);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const DRAW_THRESHOLD = 10;

  const onDown = (e: React.PointerEvent) => {
    if (mode !== 'SELECT_QUESTIONS' && mode !== 'ADJUST_SOLUTIONS') return;
    // İki parmak dokunuşu = scroll, çizim başlatma
    if (e.pointerType === 'touch') activeTouches.current++;
    if (activeTouches.current >= 2) return;
    if ((e.target as HTMLElement).dataset.resizeHandle) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (mode === 'ADJUST_SOLUTIONS' && (e.target as HTMLElement).closest('[data-region="true"]')) return;
    const p = getPos(e);
    drawStartRef.current = p;
    pendingDrawRef.current = { pointerId: e.pointerId };
    setStartPos(p);
    setCurrentPos(p);
    // capture yok — önce kaydırma; eşik aşılınca çizim
  };
  const onMove = (e: React.PointerEvent) => {
    if (mode !== 'SELECT_QUESTIONS' && mode !== 'ADJUST_SOLUTIONS') return;
    if (pendingDrawRef.current?.pointerId === e.pointerId && !isDrawingRef.current) {
      const p = getPos(e);
      const dx = p.x - drawStartRef.current.x;
      const dy = p.y - drawStartRef.current.y;
      // Dikey kaydırma niyeti → çizime geçme
      if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DRAW_THRESHOLD) {
        pendingDrawRef.current = null;
        return;
      }
      if (Math.hypot(dx, dy) < DRAW_THRESHOLD) return;
      pendingDrawRef.current = null;
      isDrawingRef.current = true;
      setIsDrawing(true);
      try { containerRef.current?.setPointerCapture(e.pointerId); } catch (_) {}
    }
    if (!isDrawingRef.current) return;
    setCurrentPos(getPos(e));
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') activeTouches.current = Math.max(0, activeTouches.current - 1);
    pendingDrawRef.current = null;
    if (!isDrawingRef.current) return;
    if (mode !== 'SELECT_QUESTIONS' && mode !== 'ADJUST_SOLUTIONS') return;
    isDrawingRef.current = false; setIsDrawing(false);
    try { containerRef.current?.releasePointerCapture(e.pointerId); } catch (_) {}
    const end = getPos(e);
    const x = Math.min(startPos.x, end.x), y = Math.min(startPos.y, end.y);
    const w = Math.abs(end.x - startPos.x), h = Math.abs(end.y - startPos.y);
    if (w > 8 && h > 8 && onRegionsChange) {
      hapticLight();
      if (mode === 'SELECT_QUESTIONS') {
        if (drawType === 'question') {
          const id = `question-${Date.now()}`;
          const next = assignStemIndices([...regions, { id, x, y, w, h, type: 'question' }]);
          onRegionsChange(next);
          setActiveQuestionId(id);
        } else {
          const parentId =
            activeQuestionId ?? inferParentQuestionId(regions, y);
          if (!parentId) return;
          const id = `stem-${Date.now()}`;
          const next = assignStemIndices([
            ...regions,
            { id, x, y, w, h, type: 'stem', parentQuestionId: parentId },
          ]);
          onRegionsChange(next);
        }
      } else {
        // ADJUST_SOLUTIONS: yeni çözüm alanı — serbest boyut, hiçbir kısıtlama yok
        const solId = `sol-${Date.now()}`;
        onRegionsChange([...regions, { id: solId, x, y, w, h, type: 'solution' }]);
      }
    }
  };

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const deleteRegionById = (id: string) => {
    const target = regionsRef.current.find(r => r.id === id);
    if (!target) return;
    const next =
      target.type === 'question'
        ? assignStemIndices(removeQuestionCascade(regionsRef.current, id))
        : assignStemIndices(regionsRef.current.filter(r => r.id !== id));
    onRegionsChange?.(next);
    if (activeQuestionId === id) {
      const qs = next.filter(r => r.type === 'question');
      setActiveQuestionId(qs[qs.length - 1]?.id ?? null);
    }
  };

  const deleteRegionMessage = (target: Region) => {
    if (target.type === 'question') {
      return 'Bu soru ve bağlı öncül / çözüm alanları kalıcı olarak silinecek.';
    }
    if (target.type === 'stem') return 'Bu öncül alanı silinecek.';
    return 'Bu çözüm alanı silinecek.';
  };

  const requestDeleteRegion = async (id: string) => {
    const target = regionsRef.current.find(r => r.id === id);
    if (!target) return;
    const ok = await confirm({
      title: 'Bölgeyi sil',
      message: deleteRegionMessage(target),
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    deleteRegionById(id);
  };

  const startLongPressDelete = (id: string) => {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      hapticMedium();
      void requestDeleteRegion(id);
    }, 550);
  };

  const removeRegion = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    void requestDeleteRegion(id);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>
      {renderError && (
        <div style={{ padding: 16, background: '#ff453a', color: '#fff', fontWeight: 600, fontSize: 14, borderRadius: 8 }}>
          {renderError}
        </div>
      )}


      <div
        ref={containerRef}
        style={{
          position: 'relative', width: docWidth || 'auto', height: totalHeight || 'auto',
          cursor: (mode === 'SELECT_QUESTIONS' || mode === 'ADJUST_SOLUTIONS') ? 'crosshair' : 'default',
          // İki parmak scroll için pan-y'e izin ver; tek parmak çizim touchAction:none yapar
          touchAction: (mode === 'SELECT_QUESTIONS' || mode === 'ADJUST_SOLUTIONS') ? 'pan-y pinch-zoom' : 'pan-y',
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* Per-page canvases */}
        {pdf && pages.map(p => (
          <div key={p.pageNum} style={{
            position: 'absolute', top: p.offsetY, left: 0, width: p.width, height: p.height,
            backgroundColor: '#fff', boxShadow: '0 1px 8px rgba(0,0,0,0.10)',
          }}>
            <PageCanvas pdf={pdf} pageNum={p.pageNum} />
          </div>
        ))}

        {/* Rubber-band selection */}
        {isDrawing && (
          <div style={{
            position: 'absolute',
            left: Math.min(startPos.x, currentPos.x), top: Math.min(startPos.y, currentPos.y),
            width: Math.abs(currentPos.x - startPos.x), height: Math.abs(currentPos.y - startPos.y),
            border: `2px dashed ${mode === 'ADJUST_SOLUTIONS' ? '#ff453a' : drawType === 'stem' ? '#ff9f0a' : '#007aff'}`,
            backgroundColor: mode === 'ADJUST_SOLUTIONS' ? 'rgba(255,69,58,0.08)' : drawType === 'stem' ? 'rgba(255,159,10,0.08)' : 'rgba(0,122,255,0.08)',
            pointerEvents: 'none', zIndex: 20,
          }} />
        )}

        {/* Region overlays */}
        {regions.map(region => {
          if (mode === 'SOLVE' && region.type === 'solution' && !showOriginal) {
            return <div key={region.id} style={{ position: 'absolute', left: 0, top: region.y, width: '100%', height: region.h, backgroundColor: '#fff', zIndex: 5, pointerEvents: 'none' }} />;
          }
          if (mode === 'SOLVE') return null;

          const isQ = region.type === 'question';
          const isStem = region.type === 'stem';
          const isSol = region.type === 'solution';
          const color = isQ ? '#34c759' : isStem ? '#ff9f0a' : '#ff453a';
          const bg = isQ ? 'rgba(52,199,89,0.10)' : isStem ? 'rgba(255,159,10,0.08)' : 'rgba(255,69,58,0.08)';
          const label = regionLabel(region, questionRegions);
          const solHint = isSol ? ' ↕ sürükle' : '';
          const isDraggable = mode === 'ADJUST_SOLUTIONS' && isSol;

          const tagClass = isQ ? 'region-tag--question' : isStem ? 'region-tag--stem' : 'region-tag--solution';

          return (
            <div
              key={region.id}
              data-region="true"
              className="region-overlay"
              style={{
                position: 'absolute',
                left: isQ || isStem ? region.x : 0,
                top: region.y,
                width: isQ || isStem ? region.w : '100%',
                height: region.h,
                border: `2px solid ${color}`, backgroundColor: bg,
                zIndex: 15, pointerEvents: 'all',
                cursor: isDraggable ? (activeDragId === region.id ? 'grabbing' : 'grab') : 'default',
              }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('.region-delete')) return;
                if ((e.target as HTMLElement).dataset.resizeHandle) return;
                if (!isDraggable) {
                  if (e.pointerType !== 'touch') {
                    e.stopPropagation();
                    startLongPressDelete(region.id);
                  }
                  return;
                }
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = { id: region.id, lastY: e.clientY, lastX: e.clientX };
                setActiveDragId(region.id);

                const onMv = (ev: PointerEvent) => {
                  if (!dragRef.current || dragRef.current.id !== region.id) return;
                  const dy = ev.clientY - dragRef.current.lastY;
                  dragRef.current.lastY = ev.clientY;
                  applyRegions(regionsRef.current.map(r =>
                    r.id !== region.id ? r : { ...r, y: Math.max(0, r.y + dy) }
                  ), true);
                };
                const captureEl = e.currentTarget as HTMLElement;
                const onUp = (ev: PointerEvent) => {
                  try { captureEl.releasePointerCapture(ev.pointerId); } catch (_) {}
                  dragRef.current = null;
                  setActiveDragId(null);
                  applyRegions(regionsRef.current);
                  window.removeEventListener('pointermove', onMv);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };
                window.addEventListener('pointermove', onMv);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
              onPointerUp={clearLongPress}
              onPointerCancel={clearLongPress}
              onPointerMove={e => {
                if (longPressTimerRef.current && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) {
                  clearLongPress();
                }
              }}
            >
              <span className={`region-tag ${tagClass}`}>
                {label}{solHint}
              </span>
              <button
                type="button"
                className="region-delete"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => removeRegion(region.id, e)}
                style={{ border: `2px solid ${color}`, color }}
                aria-label="Bölgeyi sil"
              >×</button>

              {mode === 'ADJUST_SOLUTIONS' && isSol && (['top','bottom'] as const).map(edge => (
                <div key={edge} data-resize-handle="1" style={{
                  position: 'absolute', [edge === 'top' ? 'top' : 'bottom']: -6,
                  left: '50%', transform: 'translateX(-50%)', width: 56, height: 12,
                  backgroundColor: color, borderRadius: 6, cursor: 'ns-resize', zIndex: 25, opacity: 0.85,
                }} onPointerDown={e => {
                  e.stopPropagation();
                  const captureEl = e.currentTarget as HTMLElement;
                  captureEl.setPointerCapture(e.pointerId);
                  resizeRef.current = { id: region.id, edge, lastY: e.clientY };

                  const onMv = (ev: PointerEvent) => {
                    if (!resizeRef.current || resizeRef.current.id !== region.id) return;
                    const d = ev.clientY - resizeRef.current.lastY;
                    resizeRef.current.lastY = ev.clientY;
                    applyRegions(regionsRef.current.map(r => {
                      if (r.id !== region.id) return r;
                      return edge === 'top'
                        ? { ...r, y: r.y + d, h: Math.max(r.h - d, 20) }
                        : { ...r, h: Math.max(r.h + d, 20) };
                    }), true);
                  };
                  const onUp = (ev: PointerEvent) => {
                    try { captureEl.releasePointerCapture(ev.pointerId); } catch (_) {}
                    resizeRef.current = null;
                    applyRegions(regionsRef.current);
                    window.removeEventListener('pointermove', onMv);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                  };
                  window.addEventListener('pointermove', onMv);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

