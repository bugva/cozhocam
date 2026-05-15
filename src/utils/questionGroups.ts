import type { Region } from '../components/PdfViewer';
import type { CroppedItem } from './db';

/** Soru grubu: ana soru + bağlı öncüller (PDF y sırasına göre) */
export function getQuestionBlocks(regions: Region[], questionId: string): Region[] {
  const q = regions.find(r => r.id === questionId && r.type === 'question');
  if (!q) return [];
  const stems = regions
    .filter(r => r.type === 'stem' && r.parentQuestionId === questionId)
    .sort((a, b) => a.y - b.y);
  return [q, ...stems];
}

export function assignStemIndices(regions: Region[]): Region[] {
  return regions.map(r => {
    if (r.type !== 'stem' || !r.parentQuestionId) return r;
    const siblings = regions
      .filter(s => s.type === 'stem' && s.parentQuestionId === r.parentQuestionId)
      .sort((a, b) => a.y - b.y);
    const idx = siblings.findIndex(s => s.id === r.id) + 1;
    return { ...r, stemIndex: idx };
  });
}

/** Eski kayıtlar: öncülü yukarıdaki en yakın soruya bağla */
export function migrateRegions(regions: Region[]): Region[] {
  const questions = regions.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);
  let next = regions.map(r => {
    if (r.type !== 'stem' || r.parentQuestionId) return r;
    const parent = [...questions].reverse().find(q => q.y + q.h <= r.y + 1) ?? questions[0];
    if (!parent) return r;
    return { ...r, parentQuestionId: parent.id };
  });
  next = assignStemIndices(next);
  return next;
}

/** Öncül çiziminde üstteki soruyu bul */
export function inferParentQuestionId(regions: Region[], stemY: number): string | null {
  const questions = regions.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);
  const above = [...questions].reverse().find(q => q.y + q.h <= stemY + 8);
  return above?.id ?? questions[questions.length - 1]?.id ?? null;
}

/** Soru–öncül arası ve öncül–öncül arası çözüm alanlarını üret */
export function inferSolutionRegions(regions: Region[]): Region[] {
  const questions = regions.filter(r => r.type === 'question').sort((a, b) => a.y - b.y);
  const content = regions.filter(r => r.type !== 'solution');
  const solutions: Region[] = [];

  questions.forEach((q, qIdx) => {
    const blocks = getQuestionBlocks(content, q.id);
    for (let i = 0; i < blocks.length; i++) {
      const top = blocks[i];
      const bottom =
        i < blocks.length - 1
          ? blocks[i + 1]
          : qIdx < questions.length - 1
            ? questions[qIdx + 1]
            : null;
      const y0 = top.y + top.h;
      const y1 = bottom ? bottom.y : y0 + 600;
      solutions.push({
        id: `sol-${q.id}-${i}`,
        x: 0,
        y: y0,
        w: 9999,
        h: Math.max(y1 - y0, 20),
        type: 'solution',
        parentQuestionId: q.id,
        segmentIndex: i,
        afterRegionId: top.id,
      });
    }
  });

  return [...content, ...solutions];
}

export function removeQuestionCascade(regions: Region[], questionId: string): Region[] {
  return regions.filter(
    r =>
      r.id !== questionId &&
      r.parentQuestionId !== questionId,
  );
}

export type FlowEntry =
  | { kind: 'content'; item: CroppedItem; questionNumber: number; stemIndex?: number }
  | { kind: 'solution'; item: CroppedItem; questionNumber: number; segmentIndex: number };

/** Çözüm ekranı: soru → çözüm → öncül 1 → çözüm → öncül 2 … */
export function buildSolveFlow(
  questions: CroppedItem[],
  stems: CroppedItem[],
  solutions: CroppedItem[],
): FlowEntry[] {
  const sortedQ = [...questions].sort((a, b) => (a.sortY ?? 0) - (b.sortY ?? 0));
  const flow: FlowEntry[] = [];

  sortedQ.forEach((q, qi) => {
    const qNum = qi + 1;
    const qStems = stems
      .filter(s => s.questionIndex === q.questionIndex)
      .sort((a, b) => (a.sortY ?? 0) - (b.sortY ?? 0));
    const qSols = solutions
      .filter(s => s.questionIndex === q.questionIndex)
      .sort((a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0));

    flow.push({ kind: 'content', item: q, questionNumber: qNum });
    const sol0 = qSols.find(s => s.segmentIndex === 0);
    if (sol0) flow.push({ kind: 'solution', item: sol0, questionNumber: qNum, segmentIndex: 0 });

    qStems.forEach((stem, i) => {
      flow.push({
        kind: 'content',
        item: stem,
        questionNumber: qNum,
        stemIndex: stem.stemIndex ?? i + 1,
      });
      const sol = qSols.find(s => s.segmentIndex === i + 1);
      if (sol) flow.push({ kind: 'solution', item: sol, questionNumber: qNum, segmentIndex: i + 1 });
    });
  });

  return flow;
}

/** Belge modu: çözüm göster/gizle anahtarı */
export function solutionToggleKey(questionIndex: number, segmentIndex: number): number {
  return questionIndex * 1000 + segmentIndex;
}

/** Bu içerik bloğunun hemen altındaki çözüm segmenti */
export function segmentIndexAfterContent(item: CroppedItem): number | null {
  if (item.type === 'question') return 0;
  if (item.type === 'stem') return item.stemIndex ?? 1;
  return null;
}

export function solutionButtonLabel(item: CroppedItem, _questionNumber: number): string {
  const seg = segmentIndexAfterContent(item);
  if (seg === null) return 'Çözüm';
  if (item.type === 'question') return 'Çözüm';
  return `Öncül ${item.stemIndex ?? seg} cevabı`;
}

/** Belge modu: kompakt düğme metni */
export function solutionDocButtonLabel(item: CroppedItem): string {
  if (item.type === 'question') return 'Cevap';
  return `Ö${item.stemIndex ?? 1}`;
}

export function solutionPanelTitle(item: CroppedItem, questionNumber: number): string {
  const seg = segmentIndexAfterContent(item);
  if (seg === null || item.type === 'question') return `Soru ${questionNumber} — çözüm`;
  return `Soru ${questionNumber} · Öncül ${item.stemIndex ?? seg} sonrası`;
}

export function regionLabel(
  region: Region,
  questions: Region[],
): string {
  if (region.type === 'question') {
    const i = questions.findIndex(q => q.id === region.id);
    return `Soru ${i + 1}`;
  }
  if (region.type === 'stem' && region.parentQuestionId) {
    const qi = questions.findIndex(q => q.id === region.parentQuestionId);
    return `Soru ${qi + 1} · Öncül ${region.stemIndex ?? '?'}`;
  }
  if (region.type === 'solution' && region.parentQuestionId) {
    const qi = questions.findIndex(q => q.id === region.parentQuestionId);
    const seg = region.segmentIndex ?? 0;
    if (seg === 0) return `Soru ${qi + 1} · Cevap alanı`;
    return `Soru ${qi + 1} · Öncül ${seg} sonrası cevap`;
  }
  return region.type === 'stem' ? 'Öncül' : 'Çözüm';
}
