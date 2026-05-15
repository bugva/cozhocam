import React from 'react';
import { X, List } from 'lucide-react';
import type { Region } from '../PdfViewer';
import type { PageLayout } from '../../utils/pdfCrop';

interface RegionListPanelProps {
  open: boolean;
  onClose: () => void;
  regions: Region[];
  pageLayouts?: PageLayout[];
  activeQuestionId: string | null;
  onSelect: (region: Region) => void;
}

function labelFor(r: Region, qIndex: number): string {
  if (r.type === 'question') return `Soru ${qIndex + 1}`;
  if (r.type === 'stem') return `Öncül ${r.stemIndex ?? 1}`;
  return 'Çözüm alanı';
}

function pageForRegion(region: Region, layouts: PageLayout[]): number | null {
  const pg = layouts.find(p => region.y >= p.offsetY && region.y < p.offsetY + p.height);
  return pg?.pageNum ?? null;
}

export const RegionListPanel: React.FC<RegionListPanelProps> = ({
  open,
  onClose,
  regions,
  pageLayouts = [],
  activeQuestionId,
  onSelect,
}) => {
  const questions = regions.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);
  const qIdToNum = new Map(questions.map((q, i) => [q.id, i]));

  const items = regions
    .filter(r => r.type === 'question' || r.type === 'stem')
    .sort((a, b) => a.y - b.y);

  if (!open) return null;

  return (
    <>
      <button type="button" className="region-panel-backdrop" onClick={onClose} aria-label="Kapat" />
      <aside className="region-list-panel" role="dialog" aria-label="Sorular listesi">
        <header className="region-list-panel-header">
          <List size={16} />
          <span>Sorular</span>
          <button type="button" className="region-list-panel-close" onClick={onClose} aria-label="Kapat">
            <X size={16} />
          </button>
        </header>
        <ul className="region-list-panel-list">
          {items.length === 0 && (
            <li className="region-list-panel-empty">Henüz alan yok. PDF üzerinde çizin.</li>
          )}
          {items.map(r => {
            const qIdx = r.type === 'question' ? (qIdToNum.get(r.id) ?? 0) : (qIdToNum.get(r.parentQuestionId ?? '') ?? 0);
            const isActive = r.id === activeQuestionId || r.parentQuestionId === activeQuestionId;
            const pageNum = pageLayouts.length > 0 ? pageForRegion(r, pageLayouts) : null;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`region-list-item${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelect(r)}
                >
                  <span className={`region-list-dot region-list-dot--${r.type}`} />
                  <span className="region-list-item-body">
                    <span className="region-list-item-label">{labelFor(r, qIdx)}</span>
                    {pageNum != null && (
                      <span className="region-list-meta">s.{pageNum}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
};
