import React, { useEffect, useState } from 'react';

export const readPageSize = (key: string, fallback: number) => {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  } catch { return fallback; }
};

export function PageSizeControl({ value, onChange, enabled = true, onToggle }: { value: number; onChange: (value: number) => void; enabled?: boolean; onToggle?: (enabled: boolean) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isSafeInteger(next) && next > 0) onChange(next);
    else setDraft(String(value));
  };
  return <div className="inline-flex items-center gap-3 whitespace-nowrap">{onToggle && <label className="inline-flex items-center gap-1"><input type="checkbox" checked={enabled} onChange={event => onToggle(event.target.checked)} />分页显示</label>}<label className="inline-flex items-center gap-2">每页
    <input disabled={!enabled} type="number" min="1" step="1" aria-label="每页片段数量" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100" />
    个
  </label></div>;
}
