import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.js?url';
import { PdfViewer, type Region } from './PdfViewer';
import { cropRegionFromPdf, buildPageLayouts, type PageLayout } from '../utils/pdfCrop';
import { SolveView } from './SolveView';
import { SolveViewDoc } from './SolveViewDoc';
import { Loader2, List, Undo2, Redo2 } from 'lucide-react';
import { type DocumentRecord, type CroppedItem, type QuestionAnswerStatus } from '../utils/db';
import { type AppSettings } from '../utils/settings';
import { inferSolutionRegions, migrateRegions } from '../utils/questionGroups';
import { WorkspaceTopBar } from './shell/WorkspaceTopBar';
import { PdfDrawControls } from './shell/PdfDrawControls';
import { OnboardingTip } from './shell/OnboardingTip';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { useRegionHistory } from '../hooks/useRegionHistory';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';
import { docDisplayName } from '../utils/breadcrumb';
import { hapticSuccess } from '../utils/haptic';
import { RegionListPanel } from './shell/RegionListPanel';
import { SaveErrorBanner } from './shell/SaveErrorBanner';
import { SolveExitSheet } from './shell/SolveExitSheet';
import { useConfirm } from '../contexts/ConfirmContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface WorkspaceProps {
  doc: DocumentRecord;
  onSave: (updated: DocumentRecord) => void;
  appSettings: AppSettings;
  onModeChange?: (mode: DocumentRecord['mode']) => void;
  breadcrumbSegments?: string[];
  onOpenSettings?: () => void;
  onOpenSidebar?: () => void;
  onSolveFocusModeChange?: (focused: boolean) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  doc, onSave, appSettings, onModeChange, breadcrumbSegments = [],
  onOpenSettings, onOpenSidebar, onSolveFocusModeChange,
}) => {
  const [mode, setMode] = useState(doc.mode);
  const {
    regions,
    setRegions,
    setRegionsPreview,
    undo: undoRegions,
    redo: redoRegions,
    canUndo: canUndoRegions,
    canRedo: canRedoRegions,
  } = useRegionHistory(migrateRegions(doc.regions));
  const [croppedItems, setCroppedItems] = useState<CroppedItem[]>(doc.croppedItems);
  const [isCropping, setIsCropping] = useState(false);
  const [cropProgress, setCropProgress] = useState({ current: 0, total: 0 });
  const [strokes, setStrokes] = useState<Record<number, any[]>>(doc.strokes || {});
  const [questionStatus, setQuestionStatus] = useState<Record<number, QuestionAnswerStatus>>(
    doc.questionStatus ?? {},
  );
  const [drawType, setDrawType] = useState<'question' | 'stem'>('question');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [showDrawTip, setShowDrawTip] = useState(() => !hasSeenOnboarding('draw_regions'));
  const [showPinchTip, setShowPinchTip] = useState(() => !hasSeenOnboarding('pdf_pinch'));
  const [regionPanelOpen, setRegionPanelOpen] = useState(false);
  const [solveFocusMode, setSolveFocusMode] = useState(false);
  const [exitSheetOpen, setExitSheetOpen] = useState(false);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    onSolveFocusModeChange?.(solveFocusMode);
  }, [solveFocusMode, onSolveFocusModeChange]);

  useEffect(() => {
    if (mode !== 'SOLVE') setSolveFocusMode(false);
  }, [mode]);

  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageLayouts, setPageLayouts] = useState<PageLayout[]>([]);

  const savePayload = useMemo(
    () => ({ mode, regions, croppedItems, strokes, questionStatus }),
    [mode, regions, croppedItems, strokes, questionStatus],
  );
  const persistDoc = useCallback(async (p: typeof savePayload) => {
    await onSave({ ...doc, ...p });
    onModeChange?.(p.mode);
  }, [doc, onSave, onModeChange]);
  const { status: saveStatus, retry: retrySave } = useDebouncedSave(savePayload, persistDoc);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(doc.pdfData.slice(0)),
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
      }).promise;
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageLayouts(await buildPageLayouts(pdf));
    })();
    return () => { cancelled = true; };
  }, [doc.pdfData]);

  const questionRegions = regions.filter(r => r.type === 'question');

  useEffect(() => {
    if (activeQuestionId && questionRegions.some(q => q.id === activeQuestionId)) return;
    setActiveQuestionId(questionRegions[questionRegions.length - 1]?.id ?? null);
  }, [questionRegions, activeQuestionId]);

  const inferSolutions = async () => {
    if (!questionRegions.length) return;
    const ok = await confirm({
      title: 'Çözüm alanlarını çıkar',
      message: 'Sorular arası boşluklardan çözüm bölgeleri otomatik oluşturulacak. Mevcut çözüm alanları değişebilir.',
      confirmLabel: 'Çıkar',
    });
    if (!ok) return;
    hapticSuccess();
    setRegions(inferSolutionRegions(regions));
    setMode('ADJUST_SOLUTIONS');
  };

  const startSolving = useCallback(async () => {
    if (!pdfRef.current || !pageLayouts.length) return;
    setIsCropping(true);
    const allRegs = [...regions];
    setCropProgress({ current: 0, total: allRegs.length });

    try {
      const pdf = pdfRef.current;
      const pages = pageLayouts;
      const items: CroppedItem[] = [];
      const questions = allRegs.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);
      const qIdToIndex = new Map(questions.map((q, i) => [q.id, i]));

      for (let i = 0; i < allRegs.length; i++) {
        setCropProgress({ current: i + 1, total: allRegs.length });
        await new Promise(r => setTimeout(r, 0));
        const reg = allRegs[i];
        const dataUrl = await cropRegionFromPdf(pdf, pages, { x: reg.x, y: reg.y, w: reg.w, h: reg.h });
        const dims = await imgDims(dataUrl);
        const parentQid = reg.parentQuestionId ?? (reg.type === 'question' ? reg.id : undefined);
        const qIdx = parentQid != null ? (qIdToIndex.get(parentQid) ?? 0) : questions.indexOf(reg);

        items.push({
          regionId: reg.id,
          type: reg.type as 'question' | 'solution' | 'stem',
          dataUrl, width: dims.width, height: dims.height,
          questionIndex: qIdx,
          sortY: reg.y,
          stemIndex: reg.stemIndex,
          segmentIndex: reg.segmentIndex,
        });
      }

      setCroppedItems(items);
      hapticSuccess();
      setMode('SOLVE');
    } catch (err) { console.error('Crop error:', err); }
    finally { setIsCropping(false); }
  }, [regions, pageLayouts]);

  const handleStrokesChange = useCallback((key: number, newStrokes: any[]) => {
    setStrokes(prev => ({ ...prev, [key]: newStrokes }));
  }, []);

  const handleQuestionStatusChange = useCallback((key: number, status: QuestionAnswerStatus | null) => {
    setQuestionStatus(prev => {
      const next = { ...prev };
      if (status == null) delete next[key];
      else next[key] = status;
      return next;
    });
  }, []);

  const openExitSheet = () => setExitSheetOpen(true);

  const goToSelectQuestions = async () => {
    const ok = await confirm({
      title: 'Soru seçimine dön',
      message: 'Çözüm ekranından çıkıp soru ve öncül kutularını düzenleyebilirsiniz. Kayıtlı çizimleriniz korunur.',
      confirmLabel: 'Düzenle',
    });
    if (!ok) return;
    setExitSheetOpen(false);
    setSolveFocusMode(false);
    setMode('SELECT_QUESTIONS');
  };

  const goToAdjustSolutions = async () => {
    const ok = await confirm({
      title: 'Çözüm alanlarına dön',
      message: 'Çözüm bölgelerini ayarlamak için düzenleme ekranına geçilecek. Kayıtlı çizimleriniz korunur.',
      confirmLabel: 'Düzenle',
    });
    if (!ok) return;
    setExitSheetOpen(false);
    setSolveFocusMode(false);
    setMode('ADJUST_SOLUTIONS');
  };

  const returnToSolve = () => {
    setSolveFocusMode(false);
    setMode('SOLVE');
  };

  const focusRegion = useCallback((r: Region) => {
    if (r.type === 'question') setActiveQuestionId(r.id);
    else if (r.parentQuestionId) setActiveQuestionId(r.parentQuestionId);
    pdfScrollRef.current?.scrollTo({ top: Math.max(0, r.y - 80), behavior: 'smooth' });
  }, []);

  const questions = croppedItems.filter(c => c.type === 'question');
  const solutions = croppedItems.filter(c => c.type === 'solution');
  const stems = croppedItems.filter(c => c.type === 'stem');
  const displayName = docDisplayName(doc.name);

  const drawControls = mode === 'SELECT_QUESTIONS' ? (
    <PdfDrawControls
      drawType={drawType}
      onDrawTypeChange={setDrawType}
      questionRegions={questionRegions}
      activeQuestionId={activeQuestionId}
      onActiveQuestionIdChange={setActiveQuestionId}
    />
  ) : null;

  return (
    <div className="app-main" style={{ width: '100%', height: '100%' }}>
      {saveStatus === 'error' && <SaveErrorBanner onRetry={retrySave} />}
      {mode !== 'SOLVE' && (
        <WorkspaceTopBar
          docName={displayName}
          breadcrumbSegments={breadcrumbSegments}
          mode={mode}
          onInferSolutions={inferSolutions}
          onStartSolving={startSolving}
          onReturnToSolve={croppedItems.length > 0 ? returnToSolve : undefined}
          canInfer={questionRegions.length > 0}
          isCropping={isCropping}
          drawControls={drawControls}
          saveStatus={saveStatus}
          onSaveRetry={retrySave}
          saveNotification={appSettings.saveNotification}
          rightExtra={(
            <>
              <button
                type="button"
                className="btn btn-ghost chrome-touch-btn"
                onClick={undoRegions}
                disabled={!canUndoRegions}
                aria-label="Bölge geri al"
                title="Geri al"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost chrome-touch-btn"
                onClick={redoRegions}
                disabled={!canRedoRegions}
                aria-label="Bölge yinele"
                title="Yinele"
              >
                <Redo2 size={16} />
              </button>
              <button type="button" className="btn btn-ghost chrome-touch-btn" onClick={() => setRegionPanelOpen(v => !v)}>
                <List size={16} /> Liste
              </button>
            </>
          )}
        />
      )}

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {isCropping && (
          <div className="loading-overlay">
            <div className="loading-card">
              <Loader2 size={36} color="var(--accent)" className="spin" />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Sorular kırpılıyor…</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {cropProgress.current} / {cropProgress.total} alan
              </span>
              <div className="progress-bar-track">
                <div className="progress-bar-fill"
                  style={{ width: `${cropProgress.total ? (cropProgress.current / cropProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {mode !== 'SOLVE' && (
          <div
            ref={pdfScrollRef}
            style={{
              flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center',
              alignItems: 'flex-start', background: 'var(--bg-canvas)', padding: '16px 16px 32px',
              position: 'relative', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
            }}
          >
            {showPinchTip && (
              <OnboardingTip
                position="fixed-top"
                title="Yakınlaştırma"
                message="PDF üzerinde iki parmakla sıkıştırarak yakınlaştırıp uzaklaştırabilir; iki parmakla kaydırarak gezinebilirsiniz."
                onDismiss={() => {
                  markOnboardingSeen('pdf_pinch');
                  setShowPinchTip(false);
                }}
              />
            )}
            {mode === 'SELECT_QUESTIONS' && showDrawTip && (
              <OnboardingTip
                position="fixed-top"
                title="Soru alanları çizin"
                message="PDF üzerinde sürükleyerek soru ve öncül kutuları oluşturun. Üstteki Soru / Öncül sekmesinden tür seçin; alanı silmek için kutuya uzun basın."
                onDismiss={() => {
                  markOnboardingSeen('draw_regions');
                  setShowDrawTip(false);
                }}
              />
            )}
            <PdfViewer
              pdfData={doc.pdfData}
              mode={mode}
              regions={regions}
              onRegionsChange={setRegions}
              onRegionsPreview={setRegionsPreview}
              showOriginal={false}
              drawType={drawType}
              onDrawTypeChange={setDrawType}
              activeQuestionId={activeQuestionId}
              onActiveQuestionIdChange={setActiveQuestionId}
            />
            <RegionListPanel
              open={regionPanelOpen}
              onClose={() => setRegionPanelOpen(false)}
              regions={regions}
              pageLayouts={pageLayouts}
              activeQuestionId={activeQuestionId}
              onSelect={r => { focusRegion(r); setRegionPanelOpen(false); }}
            />
          </div>
        )}

        {mode === 'SOLVE' && appSettings.solveLayout === 'document' && (
          <SolveViewDoc
            questions={questions}
            stems={stems}
            solutions={solutions}
            regions={regions}
            pageLayouts={pageLayouts}
            allStrokes={strokes}
            onStrokesChange={handleStrokesChange}
            onGoEdit={openExitSheet}
            saveNotification={appSettings.saveNotification}
            docSolutionPlacement={appSettings.docSolutionPlacement ?? 'side'}
            toolbarDock={appSettings.toolbarDock ?? 'right'}
            palmDefault={appSettings.palmRejection}
            docName={displayName}
            breadcrumbSegments={breadcrumbSegments}
            onOpenSettings={onOpenSettings}
            saveStatus={saveStatus}
            onSaveRetry={retrySave}
            questionStatus={questionStatus}
            onQuestionStatusChange={handleQuestionStatusChange}
            focusMode={solveFocusMode}
            onFocusModeChange={setSolveFocusMode}
            onOpenSidebar={onOpenSidebar}
          />
        )}
        {mode === 'SOLVE' && appSettings.solveLayout !== 'document' && (
          <SolveView
            questions={questions}
            stems={stems}
            solutions={solutions}
            allStrokes={strokes}
            onStrokesChange={handleStrokesChange}
            questionStatus={questionStatus}
            onQuestionStatusChange={handleQuestionStatusChange}
            onGoEdit={openExitSheet}
            saveNotification={appSettings.saveNotification}
            toolbarDock={appSettings.toolbarDock ?? 'right'}
            palmDefault={appSettings.palmRejection}
            defaultBgStyle={appSettings.defaultBgStyle}
            docName={displayName}
            breadcrumbSegments={breadcrumbSegments}
            onOpenSettings={onOpenSettings}
            saveStatus={saveStatus}
            onSaveRetry={retrySave}
            focusMode={solveFocusMode}
            onFocusModeChange={setSolveFocusMode}
            onOpenSidebar={onOpenSidebar}
          />
        )}

        {mode === 'SOLVE' && (
          <SolveExitSheet
            open={exitSheetOpen}
            onClose={() => setExitSheetOpen(false)}
            onSelectQuestions={goToSelectQuestions}
            onSelectSolutions={goToAdjustSolutions}
          />
        )}
      </div>
    </div>
  );
};

function imgDims(url: string): Promise<{ width: number; height: number }> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res({ width: img.width, height: img.height });
    img.onerror = () => res({ width: 200, height: 200 });
    img.src = url;
  });
}
