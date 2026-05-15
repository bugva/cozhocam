import React, { useEffect, useRef, useState } from 'react';
import {
  PenTool, FileX, Menu, FolderOpen, Plus, ChevronRight,
  GraduationCap, Check, Trash2, FolderPlus, FolderMinus, Settings, Share2, Download,
  LayoutGrid, List, Search,
} from 'lucide-react';
import { PdfUploader } from '../PdfUploader';
import { InlineEdit } from './InlineEdit';
import { buildDocBreadcrumb, docDisplayName } from '../../utils/breadcrumb';
import { hapticLight } from '../../utils/haptic';
import type { Course, DocumentRecord } from '../../utils/db';

export interface SidebarProps {
  open: boolean;
  isTablet: boolean;
  onClose: () => void;
  docs: DocumentRecord[];
  courses: Course[];
  activeDocId: string | null;
  recentDocIds: string[];
  expanded: Set<string>;
  onToggleExpand: (courseId: string) => void;
  dragOverFolderId: string | null;
  onDragOverFolder: (folderId: string | null) => void;
  onMoveDocToFolder: (docId: string, courseId: string, folderId: string) => void;
  onOpenDoc: (id: string) => void;
  onDeleteDoc: (e: React.MouseEvent, id: string) => void;
  onExportDoc: (e: React.MouseEvent, doc: DocumentRecord) => void;
  onShowSettings: () => void;
  onImportClick: () => void;
  onFileLoad: (data: ArrayBuffer, name: string) => void;
  onUploadToFolder: (courseId: string, folderId: string) => void;
  showNewCourse: boolean;
  onShowNewCourse: (show: boolean) => void;
  newCourseName: string;
  onNewCourseNameChange: (name: string) => void;
  onCreateCourse: () => void;
  onAddFolder: (courseId: string, e: React.MouseEvent) => void;
  onRemoveLastFolder: (courseId: string, e: React.MouseEvent) => void;
  onDeleteCourse: (e: React.MouseEvent, courseId: string) => void;
  onRenameFolder: (courseId: string, folderId: string, name: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  open,
  isTablet,
  onClose,
  docs,
  courses,
  activeDocId,
  recentDocIds,
  expanded,
  onToggleExpand,
  dragOverFolderId,
  onDragOverFolder,
  onMoveDocToFolder,
  onOpenDoc,
  onDeleteDoc,
  onExportDoc,
  onShowSettings,
  onImportClick,
  onFileLoad,
  onUploadToFolder,
  showNewCourse,
  onShowNewCourse,
  newCourseName,
  onNewCourseNameChange,
  onCreateCourse,
  onAddFolder,
  onRemoveLastFolder,
  onDeleteCourse,
  onRenameFolder,
}) => {
  const [libraryView, setLibraryView] = useState<'tree' | 'grid'>('tree');
  const [libraryQuery, setLibraryQuery] = useState('');
  const newCourseInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (showNewCourse) setTimeout(() => newCourseInputRef.current?.focus(), 50); }, [showNewCourse]);

  const q = libraryQuery.trim().toLowerCase();
  const matchesDoc = (d: DocumentRecord) => {
    if (!q) return true;
    const name = docDisplayName(d.name).toLowerCase();
    const path = buildDocBreadcrumb(d, courses).join(' ').toLowerCase();
    return name.includes(q) || path.includes(q);
  };

  const folderDocs = (courseId: string, folderId: string) =>
    docs.filter(d => d.courseId === courseId && d.folderId === folderId && matchesDoc(d));
  const freeDocs = docs.filter(d => !d.courseId && matchesDoc(d));
  const filteredDocs = docs.filter(matchesDoc);

  const openDocHaptic = (id: string) => {
    hapticLight();
    onOpenDoc(id);
  };

  return (
    <aside
      className={`sidebar-panel${isTablet ? ' sidebar-panel--sheet' : ''}${!open && !isTablet ? ' sidebar-panel--closed' : ''}`}
    >
      <div className="sidebar-inner">

        <header className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <PenTool size={14} color="#fff" />
            </div>
            <span className="sidebar-brand-text">ÇözHocam</span>
          </div>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className={`sidebar-view-btn${libraryView === 'tree' ? ' is-active' : ''}`}
              onClick={() => setLibraryView('tree')}
              title="Ağaç görünümü"
              aria-label="Ağaç görünümü"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              className={`sidebar-view-btn${libraryView === 'grid' ? ' is-active' : ''}`}
              onClick={() => setLibraryView('grid')}
              title="Kart görünümü"
              aria-label="Kart görünümü"
            >
              <LayoutGrid size={14} />
            </button>
            <button type="button" className="sidebar-toggle-btn" onClick={onClose} aria-label="Paneli kapat">
              <Menu size={15} />
            </button>
          </div>
        </header>

        <div className="sidebar-search">
          <Search size={14} className="sidebar-search-icon" aria-hidden />
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Belge ara…"
            value={libraryQuery}
            onChange={e => setLibraryQuery(e.target.value)}
            aria-label="Kütüphanede ara"
          />
        </div>

        {recentDocIds.length > 0 && !q && (
          <section className="recent-docs">
            <div className="recent-docs-title">Son açılanlar</div>
            {recentDocIds.map(id => {
              const d = docs.find(x => x.id === id);
              if (!d) return null;
              const isActive = activeDocId === d.id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`sidebar-doc-row sidebar-doc-row--compact${isActive ? ' is-active' : ''}`}
                  onClick={() => openDocHaptic(d.id)}
                >
                  <span className="sidebar-doc-emoji" aria-hidden>📄</span>
                  <span className="sidebar-doc-label">{docDisplayName(d.name)}</span>
                </button>
              );
            })}
          </section>
        )}

        <div className="sidebar-actions">
          {showNewCourse ? (
            <div className="sidebar-new-course-form">
              <input
                ref={newCourseInputRef}
                value={newCourseName}
                onChange={e => onNewCourseNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onCreateCourse();
                  if (e.key === 'Escape') onShowNewCourse(false);
                }}
                placeholder="Ders adı..."
                className="sidebar-input"
              />
              <button type="button" className="sidebar-btn-confirm" onClick={onCreateCourse} aria-label="Oluştur">
                <Check size={13} />
              </button>
            </div>
          ) : (
            <button type="button" className="sidebar-btn-new-course" onClick={() => onShowNewCourse(true)}>
              <GraduationCap size={13} /> Ders Oluştur
            </button>
          )}
        </div>

        <div className="sidebar-tree">
          {libraryView === 'grid' ? (
            <div className="library-grid">
              {[...filteredDocs].sort((a, b) => b.createdAt - a.createdAt).map(d => {
                const isActive = activeDocId === d.id;
                const path = buildDocBreadcrumb(d, courses);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`library-card${isActive ? ' is-active' : ''}`}
                    onClick={() => openDocHaptic(d.id)}
                  >
                    <span className="library-card-emoji" aria-hidden>📄</span>
                    <span className="library-card-title">{docDisplayName(d.name)}</span>
                    {path.length > 0 && (
                      <span className="library-card-path">{path.join(' › ')}</span>
                    )}
                  </button>
                );
              })}
              {filteredDocs.length === 0 && (
                <p className="sidebar-empty">{q ? 'Sonuç bulunamadı.' : 'Henüz belge yok.'}</p>
              )}
            </div>
          ) : (
          <>
          {courses.map(course => {
            const isOpen = expanded.has(course.id) || Boolean(q);
            const courseHasMatch = course.folders.some(f => folderDocs(course.id, f.id).length > 0);
            if (q && !courseHasMatch) return null;
            return (
              <div key={course.id} className="sidebar-course-block">
                <div
                  role="button"
                  tabIndex={0}
                  className={`sidebar-course-row${isOpen ? ' is-open' : ''}`}
                  onClick={() => onToggleExpand(course.id)}
                  onKeyDown={e => { if (e.key === 'Enter') onToggleExpand(course.id); }}
                >
                  <ChevronRight size={12} className="sidebar-chevron" data-open={isOpen} />
                  <GraduationCap size={13} className="sidebar-course-icon" />
                  <span className="sidebar-course-name">{course.name}</span>
                  <button type="button" className="sidebar-icon-btn" onClick={e => onAddFolder(course.id, e)} title="Alt klasör ekle">
                    <FolderPlus size={12} />
                  </button>
                  <button type="button" className="sidebar-icon-btn" onClick={e => onRemoveLastFolder(course.id, e)} title="Son klasörü sil">
                    <FolderMinus size={12} />
                  </button>
                  <button type="button" className="sidebar-icon-btn sidebar-icon-btn--danger" onClick={e => onDeleteCourse(e, course.id)} title="Dersi sil">
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="sidebar-folders" data-open={isOpen}>
                  {course.folders.map(folder => {
                    const fDocs = folderDocs(course.id, folder.id);
                    const isDrag = dragOverFolderId === folder.id;
                    return (
                      <div key={folder.id} className="sidebar-folder-block">
                        <div
                          className={`sidebar-folder-row${isDrag ? ' is-drag-over' : ''}`}
                          onDragOver={e => { e.preventDefault(); onDragOverFolder(folder.id); }}
                          onDragLeave={() => onDragOverFolder(null)}
                          onDrop={e => {
                            e.preventDefault();
                            const docId = e.dataTransfer.getData('docId');
                            if (docId) onMoveDocToFolder(docId, course.id, folder.id);
                            onDragOverFolder(null);
                          }}
                        >
                          <FolderOpen size={12} className={isDrag ? 'sidebar-folder-icon--active' : 'sidebar-folder-icon'} />
                          <InlineEdit value={folder.name} onSave={name => onRenameFolder(course.id, folder.id, name)} />
                          <button
                            type="button"
                            className="sidebar-btn-pdf-add"
                            onClick={() => onUploadToFolder(course.id, folder.id)}
                            title="PDF Ekle"
                          >
                            <Plus size={10} /> PDF
                          </button>
                        </div>

                        {fDocs.map(d => {
                          const isActive = activeDocId === d.id;
                          return (
                            <div
                              key={d.id}
                              draggable
                              onDragStart={e => e.dataTransfer.setData('docId', d.id)}
                              className={`sidebar-doc-row sidebar-doc-row--nested${isActive ? ' is-active' : ''}`}
                              onClick={() => openDocHaptic(d.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={e => { if (e.key === 'Enter') openDocHaptic(d.id); }}
                            >
                              <span className="sidebar-doc-emoji" aria-hidden>📄</span>
                              <span className="sidebar-doc-label">{docDisplayName(d.name)}</span>
                              <button type="button" className="sidebar-doc-delete" onClick={ev => onDeleteDoc(ev, d.id)} aria-label="Sil">
                                <FileX size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {freeDocs.length > 0 && (
            <>
              <div className="sidebar-section-label">Diğer Belgeler</div>
              {freeDocs.map(d => {
                const isActive = activeDocId === d.id;
                return (
                  <div key={d.id} className="sidebar-free-doc-block">
                    <div
                      draggable
                      onDragStart={e => e.dataTransfer.setData('docId', d.id)}
                      className={`sidebar-doc-row${isActive ? ' is-active' : ''}`}
                      onClick={() => openDocHaptic(d.id)}
                    >
                      <span className="sidebar-doc-emoji" aria-hidden>📄</span>
                      <span className="sidebar-doc-label sidebar-doc-label--lg">{docDisplayName(d.name)}</span>
                      <button type="button" className="sidebar-doc-delete sidebar-doc-delete--hover" onClick={ev => onDeleteDoc(ev, d.id)} aria-label="Sil">
                        <FileX size={13} />
                      </button>
                    </div>
                    {isActive && (
                      <div className="sidebar-doc-actions">
                        <button type="button" className="sidebar-doc-action-btn" onClick={ev => onExportDoc(ev, d)}>
                          <Share2 size={11} /> Dışa Aktar
                        </button>
                        <button type="button" className="sidebar-doc-action-btn sidebar-doc-action-btn--danger" onClick={ev => onDeleteDoc(ev, d.id)}>
                          <Trash2 size={11} /> Sil
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {courses.length === 0 && freeDocs.length === 0 && (
            <div className="sidebar-empty">
              <GraduationCap size={24} opacity={0.5} />
              <span>{q ? 'Aramanızla eşleşen belge yok.' : 'Ders oluşturun veya doğrudan PDF yükleyin.'}</span>
            </div>
          )}
          </>
          )}
        </div>

        <footer className="sidebar-footer">
          <div className="sidebar-footer-row">
            <button type="button" className="sidebar-footer-btn" onClick={onShowSettings}>
              <Settings size={13} /> Ayarlar
            </button>
            <button type="button" className="sidebar-footer-btn" onClick={onImportClick} title=".coz dosyasını içe aktar">
              <Download size={13} /> İçe Aktar
            </button>
          </div>
          <PdfUploader onFileLoad={onFileLoad} compact />
        </footer>
      </div>
    </aside>
  );
};
