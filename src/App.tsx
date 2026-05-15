import { useState, useEffect, useRef } from 'react';
import { PenTool, Menu, Pencil, Settings } from 'lucide-react';
import { PdfUploader } from './components/PdfUploader';
import { Workspace } from './components/Workspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/shell/Sidebar';
import { Breadcrumb } from './components/shell/Breadcrumb';
import { db, courseDB, defaultFolders, type DocumentRecord, type Course, type CourseFolder } from './utils/db';
import { loadSettings, type AppSettings } from './utils/settings';
import { applyThemeMode } from './utils/theme';
import { useTabletLayout } from './hooks/useMediaQuery';
import { exportDocument, importDocument } from './utils/share';
import { loadRecentDocIds, pushRecentDocId } from './utils/recentDocs';
import { buildDocBreadcrumb, docDisplayName } from './utils/breadcrumb';
import { hapticLight } from './utils/haptic';
import { useEdgeSwipeOpen } from './hooks/useEdgeSwipeOpen';
import { useConfirm } from './contexts/ConfirmContext';
import { OfflineBanner } from './components/shell/OfflineBanner';

// ── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [docs, setDocs]                 = useState<DocumentRecord[]>([]);
  const [courses, setCourses]           = useState<Course[]>([]);
  const [activeDocId, setActiveDocId]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [uploadCourseId, setUploadCourseId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [solveFocusMode, setSolveFocusMode] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSettings());
  const [recentDocIds, setRecentDocIds] = useState<string[]>(() => loadRecentDocIds());
  const importInputRef = useRef<HTMLInputElement>(null);

  const [showNewCourse, setShowNewCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');

  const openDoc = (id: string) => {
    hapticLight();
    setActiveDocId(id);
    setRecentDocIds(pushRecentDocId(id));
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { applyThemeMode(appSettings.themeMode ?? 'system'); }, [appSettings.themeMode]);

  const isTablet = useTabletLayout();
  const activeDoc = docs.find(d => d.id === activeDocId);
  const openLibrary = () => setSidebarOpen(true);
  const { confirm } = useConfirm();
  const edgeSwipe = useEdgeSwipeOpen(solveFocusMode ? () => {} : openLibrary);

  useEffect(() => {
    if (activeDoc?.mode === 'SOLVE') setSidebarOpen(false);
  }, [activeDoc?.mode, activeDocId]);

  useEffect(() => {
    if (!activeDocId || activeDoc?.mode !== 'SOLVE') setSolveFocusMode(false);
  }, [activeDocId, activeDoc?.mode]);

  useEffect(() => {
    if (solveFocusMode) setSidebarOpen(false);
  }, [solveFocusMode]);

  const loadAll = async () => {
    const [allDocs, allCourses] = await Promise.all([db.getAllDocuments(), courseDB.getAll()]);
    setDocs(allDocs);
    setCourses(allCourses);
  };

  // ── Document operations ───────────────────────────────────────────────────
  const handleFileLoad = async (data: ArrayBuffer, name: string) => {
    const newDoc: DocumentRecord = {
      id: crypto.randomUUID(), name, pdfData: data,
      regions: [], croppedItems: [], excalidrawElements: [], strokes: {},
      mode: 'SELECT_QUESTIONS', createdAt: Date.now(),
      courseId: uploadCourseId ?? undefined,
      folderId: uploadFolderId ?? undefined,
    };
    await db.saveDocument(newDoc);
    await loadAll();
    openDoc(newDoc.id);
    setUploadFolderId(null);
    setUploadCourseId(null);
  };

  const handleSaveDoc = async (updated: DocumentRecord) => {
    await db.saveDocument(updated);
    setDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const handleDeleteDoc = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const doc = docs.find(d => d.id === id);
    const ok = await confirm({
      title: 'Belgeyi sil',
      message: `"${docDisplayName(doc?.name ?? 'Belge')}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await db.deleteDocument(id);
    if (activeDocId === id) setActiveDocId(null);
    await loadAll();
  };

  const handleExportDoc = (e: React.MouseEvent, doc: DocumentRecord) => {
    e.stopPropagation();
    exportDocument(doc);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await importDocument(file);
      await db.saveDocument(doc);
      await loadAll();
      openDoc(doc.id);
    } catch (err: any) {
      alert(err?.message || 'İçe aktarma başarısız');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  // ── Course operations ─────────────────────────────────────────────────────
  const createCourse = async () => {
    const name = newCourseName.trim();
    if (!name) return;
    const course: Course = { id: crypto.randomUUID(), name, folders: defaultFolders(), createdAt: Date.now() };
    await courseDB.save(course);
    setNewCourseName('');
    setShowNewCourse(false);
    await loadAll();
    setExpanded(prev => new Set([...prev, course.id]));
  };

  const deleteCourse = async (e: React.MouseEvent, courseId: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Dersi sil',
      message: 'Bu ders silinecek. Derse ait belgeler kütüphanede kalır.',
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await courseDB.delete(courseId);
    await loadAll();
  };

  const updateCourse = async (courseId: string, patch: Partial<Course>) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const updated = { ...course, ...patch };
    await courseDB.save(updated);
    setCourses(prev => prev.map(c => c.id === courseId ? updated : c));
  };

  const addFolder = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    // Count existing "Midterm N" folders to determine next number
    const midtermCount = course.folders.filter(f => f.name.startsWith('Midterm')).length;
    const newName = `Midterm ${midtermCount + 1}`;
    const newFolder: CourseFolder = { id: crypto.randomUUID(), name: newName };
    await updateCourse(courseId, { folders: [...course.folders, newFolder] });
  };

  const removeLastFolder = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const course = courses.find(c => c.id === courseId);
    if (!course || course.folders.length <= 1) return;
    const last = course.folders[course.folders.length - 1];
    const ok = await confirm({
      title: 'Klasörü sil',
      message: `"${last.name}" klasörü silinecek. İçindeki belgeler etkilenmez.`,
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await updateCourse(courseId, { folders: course.folders.slice(0, -1) });
  };

  const renameFolder = async (courseId: string, folderId: string, newName: string) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    await updateCourse(courseId, {
      folders: course.folders.map(f => f.id === folderId ? { ...f, name: newName } : f),
    });
  };

  const toggleExpand = (courseId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(courseId) ? next.delete(courseId) : next.add(courseId);
      return next;
    });
  };

  const breadcrumb = activeDoc ? buildDocBreadcrumb(activeDoc, courses) : [];

  const moveDocToFolder = async (docId: string, courseId: string, folderId: string) => {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;
    const updated = { ...doc, courseId, folderId };
    await db.saveDocument(updated);
    setDocs(prev => prev.map(d => d.id === docId ? updated : d));
  };

  return (
    <div className={`app-root${solveFocusMode ? ' app-solve-focus' : ''}`}>
      <OfflineBanner />
      {isTablet && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      <input ref={importInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImport} />

      {(!isTablet || sidebarOpen) && (
        <Sidebar
          open={sidebarOpen}
          isTablet={isTablet}
          onClose={() => setSidebarOpen(false)}
          docs={docs}
          courses={courses}
          activeDocId={activeDocId}
          recentDocIds={recentDocIds}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          dragOverFolderId={dragOverFolderId}
          onDragOverFolder={setDragOverFolderId}
          onMoveDocToFolder={moveDocToFolder}
          onOpenDoc={openDoc}
          onDeleteDoc={handleDeleteDoc}
          onExportDoc={handleExportDoc}
          onShowSettings={() => setShowSettings(true)}
          onImportClick={() => importInputRef.current?.click()}
          onFileLoad={handleFileLoad}
          onUploadToFolder={(courseId, folderId) => {
            setUploadCourseId(courseId);
            setUploadFolderId(folderId);
          }}
          showNewCourse={showNewCourse}
          onShowNewCourse={setShowNewCourse}
          newCourseName={newCourseName}
          onNewCourseNameChange={setNewCourseName}
          onCreateCourse={createCourse}
          onAddFolder={addFolder}
          onRemoveLastFolder={removeLastFolder}
          onDeleteCourse={deleteCourse}
          onRenameFolder={renameFolder}
        />
      )}



      {uploadFolderId && (
        <div className="settings-sheet-backdrop" onClick={() => { setUploadFolderId(null); setUploadCourseId(null); }}>
          <div className="settings-sheet upload-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="PDF yükle">
            <div className="settings-sheet-handle" />
            {(() => {
              const course = courses.find(c => c.id === uploadCourseId);
              const folder = course?.folders.find(f => f.id === uploadFolderId);
              return (
                <>
                  <div className="upload-sheet-header">
                    <p className="upload-sheet-course">{course?.name}</p>
                    <h2 className="upload-sheet-title">{folder?.name} — PDF Ekle</h2>
                  </div>
                  <PdfUploader onFileLoad={handleFileLoad} compact={false} />
                  <button type="button" className="upload-sheet-cancel" onClick={() => { setUploadFolderId(null); setUploadCourseId(null); }}>
                    İptal
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div
        className="app-main"
        onTouchStart={edgeSwipe.onTouchStart}
        onTouchEnd={edgeSwipe.onTouchEnd}
      >
        {!sidebarOpen && activeDoc?.mode !== 'SOLVE' && (
          <div className="chrome-topbar" style={{ minHeight: 48 }}>
            <button type="button" className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)} title="Paneli aç" aria-label="Paneli aç">
              <Menu size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              {activeDoc && breadcrumb.length > 0 ? (
                <Breadcrumb segments={breadcrumb} current={docDisplayName(activeDoc.name)} />
              ) : (
                <span className="chrome-doc-name">{activeDoc ? docDisplayName(activeDoc.name) : 'ÇözHocam'}</span>
              )}
            </div>
            <button type="button" className="sidebar-toggle-btn" onClick={() => setShowSettings(true)} title="Ayarlar" aria-label="Ayarlar">
              <Settings size={18} />
            </button>
          </div>
        )}
        <ErrorBoundary>
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {!activeDoc ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: 'var(--bg-canvas)' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, rgba(0,122,255,0.12), rgba(191,90,242,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,122,255,0.15)' }}>
                  <PenTool size={30} color="var(--text-tertiary)" />
                </div>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Çalışmaya başlayın</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Bir ders oluşturun veya sol panelden PDF seçin.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setSidebarOpen(true)} style={{ gap: 7 }}>
                  <Pencil size={15} /> Başla
                </button>
              </div>
            ) : (
              <Workspace
                key={activeDoc.id}
                doc={activeDoc}
                onSave={handleSaveDoc}
                appSettings={appSettings}
                breadcrumbSegments={breadcrumb}
                onOpenSettings={() => setShowSettings(true)}
                onOpenSidebar={openLibrary}
                onSolveFocusModeChange={setSolveFocusMode}
                onModeChange={mode => { if (mode === 'SOLVE') setSidebarOpen(false); }}
              />
            )}
          </main>
        </ErrorBoundary>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          settings={appSettings}
          onChange={s => setAppSettings(s)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
