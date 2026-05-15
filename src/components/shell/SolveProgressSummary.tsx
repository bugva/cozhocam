import React, { useMemo } from 'react';
import type { QuestionAnswerStatus } from '../../utils/db';

interface SolveProgressSummaryProps {
  questionStatus: Record<number, QuestionAnswerStatus>;
  contentKeys: number[];
}

export const SolveProgressSummary: React.FC<SolveProgressSummaryProps> = ({
  questionStatus,
  contentKeys,
}) => {
  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    for (const key of contentKeys) {
      const s = questionStatus[key];
      if (s === 'correct') correct++;
      else if (s === 'wrong') wrong++;
    }
    const marked = correct + wrong;
    const total = contentKeys.length;
    return { total, marked, correct, wrong };
  }, [questionStatus, contentKeys]);

  if (stats.total === 0) return null;

  return (
    <span className="solve-progress-summary" title="İşaretlenen sorular">
      {stats.marked > 0 ? (
        <>
          {stats.correct > 0 && <span className="solve-progress-summary--ok">{stats.correct} doğru</span>}
          {stats.correct > 0 && stats.wrong > 0 && <span className="solve-progress-summary-sep"> · </span>}
          {stats.wrong > 0 && <span className="solve-progress-summary--bad">{stats.wrong} yanlış</span>}
          <span className="solve-progress-summary-muted"> / {stats.total}</span>
        </>
      ) : (
        <span className="solve-progress-summary-muted">{stats.total} soru</span>
      )}
    </span>
  );
};
