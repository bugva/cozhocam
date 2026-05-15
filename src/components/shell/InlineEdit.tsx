import React, { useEffect, useRef, useState } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (v: string) => void;
}

export const InlineEdit: React.FC<InlineEditProps> = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <span
        className="sidebar-inline-label"
        onDoubleClick={() => { setDraft(value); setEditing(true); }}
        title="Çift tıkla → yeniden adlandır"
      >
        {value}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="sidebar-inline-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { onSave(draft.trim() || value); setEditing(false); }
        if (e.key === 'Escape') setEditing(false);
      }}
      onBlur={() => { onSave(draft.trim() || value); setEditing(false); }}
    />
  );
};
