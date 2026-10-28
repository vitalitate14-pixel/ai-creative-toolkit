import { matchesSearchFields } from '../utils/searchFields';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildGoogleSheetsHtml, copyToClipboard } from '../utils/clipboard';

type DetachedRow = { id: string; values: string[]; image?: { id?: string; url: string; name: string; originalPath?: string } | null; sourceIndex?: number; copied?: boolean; searchText?: string };
type DetachedData = { headers: string[]; rows: DetachedRow[] };



/** Electron only: a deliberately lightweight, always-on-top delivery sheet. */
export default function DetachedImagePromptSheet() {
  const [editingCell, setEditingCell] = useState<{ id: string; column: number; value: string } | null>(null);
  const [editError, setEditError] = useState('');
  const saveCellEdit = async () => {
    if (!editingCell) return;
    const result = await (window as any).electronAPI?.editImagePromptSheetCell?.(editingCell);
    if (!result?.success) { setEditError('保存失败，请重启开发版后重试'); return; }
    setData(current => ({ ...current, rows: current.rows.map(row => row.id === editingCell.id ? { ...row, values: row.values.map((value, column) => column === editingCell.column ? editingCell.value : value) } : row) }));
    setEditingCell(null);
  };
  const lastManualCopiedRow = useRef(-1);
  const [data, setData] = useState<DetachedData>({ headers: [], rows: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const segmentLabels = useMemo(() => {
    const counters = new Map<number, number>();
    return new Map(data.rows.map(row => {
      const source = row.sourceIndex ?? 0;
      const number = (counters.get(source) || 0) + 1;
      counters.set(source, number);
      return [row.id, `片段${number}`];
    }));
  }, [data.rows]);
  const [opacity, setOpacity] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [keepExpanded, setKeepExpanded] = useState(() => localStorage.getItem('detached-image-prompt-sheet-keep-expanded') === 'true');
  const scrollPosition = useRef({ x: 0, y: 0, tableX: 0, tableY: 0 });
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    localStorage.setItem('detached-image-prompt-sheet-keep-expanded', String(keepExpanded));
    void (window as any).electronAPI?.setImagePromptSheetKeepExpanded?.(keepExpanded);
  }, [keepExpanded]);
  useLayoutEffect(() => {
    if (collapsed) return;
    const restore = () => {
      window.scrollTo(scrollPosition.current.x, scrollPosition.current.y);
      if (tableContainerRef.current) {
        tableContainerRef.current.scrollLeft = scrollPosition.current.tableX;
        tableContainerRef.current.scrollTop = scrollPosition.current.tableY;
      }
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [collapsed]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    const receive = (next: boolean) => {
      if (next) scrollPosition.current = {
        x: window.scrollX, y: window.scrollY,
        tableX: tableContainerRef.current?.scrollLeft || 0,
        tableY: tableContainerRef.current?.scrollTop || 0
      };
      setCollapsed(next);
    };
    const stop = api?.onImagePromptSheetCollapsed?.(receive);
    void api?.getImagePromptSheetCollapsed?.().then(setCollapsed);
    return () => stop?.();
  }, []);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);
  const [copiedRowIds, setCopiedRowIds] = useState<Set<string>>(new Set());
  // 复制状态按交付行记录，同一素材出现在其他分配组时不会跟着变色。
  const [copiedImageRowIds, setCopiedImageRowIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [problemRowIds, setProblemRowIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('detached-image-prompt-sheet-problem-rows') || '[]')); }
    catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem('detached-image-prompt-sheet-problem-rows', JSON.stringify([...problemRowIds]));
  }, [problemRowIds]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [fixedDeliveryCopy, setFixedDeliveryCopy] = useState(() => localStorage.getItem('detached-image-prompt-sheet-fixed-copy') !== 'false');
  // 0 表示图片组名列自动占用剩余空间。
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('detached-image-prompt-sheet-widths');
      return saved ? JSON.parse(saved) : { 1: 30, 2: 50, 3: 10, 4: 0, 5: 40 };
    } catch { return { 1: 30, 2: 50, 3: 10, 4: 0, 5: 40 }; }
  });
  // 默认交付视图：图片、图片名、空白列、图片组、最终描述词。
  const [visibleColumns, setVisibleColumns] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('detached-image-prompt-sheet-columns');
      return saved ? JSON.parse(saved) : [1, 2, 3, 4, 5];
    } catch { return [1, 2, 3, 4, 5]; }
  });
  const dragSelectionBaseRef = useRef<Set<string>>(new Set());
  const lastSelectionAnchorRef = useRef<{ row: number; column: number } | null>(null);
  const anchorRef = useRef<{ row: number; column: number } | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    const receive = (next: DetachedData) => { setData(next); setCopiedRowIds(new Set(next.rows.filter(row => row.copied).map(row => row.id))); };
    const stop = api.onImagePromptSheetData?.(receive);
    void api.imagePromptSheetReady?.().then((next: DetachedData | undefined) => next && receive(next));
    return () => stop?.();
  }, []);

  useEffect(() => {
    localStorage.setItem('detached-image-prompt-sheet-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);
  useEffect(() => {
    localStorage.setItem('detached-image-prompt-sheet-widths', JSON.stringify(columnWidths));
  }, [columnWidths]);
  useEffect(() => {
    localStorage.setItem('detached-image-prompt-sheet-fixed-copy', String(fixedDeliveryCopy));
  }, [fixedDeliveryCopy]);

  const copyGrid = async (grid: string[][]) => {
    // Quote TSV cells so embedded newlines/tabs remain inside their cell in text-only paste.
    const text = grid.map(row => row.map(value => /[\t\r\n"]/.test(value)
      ? `"${value.replace(/"/g, '""')}"` : value).join('\t')).join('\n');
    const html = buildGoogleSheetsHtml(grid);
    const api = (window as any).electronAPI;
    try {
      if (api?.clipboardWriteTable) {
        const result = await api.clipboardWriteTable(text, html);
        if (result?.success) return true;
      }
      return (await copyToClipboard(text, html)) !== 'failed';
    } catch (error) {
      console.error('独立表格复制失败', error);
      return false;
    }
  };

  const copyImage = async (row: DetachedRow) => {
    if (!row.image?.url) return;
    setCopyingImageId(row.id);
    try {
      const api = (window as any).electronAPI;
      if (!api?.copyImagePromptSheetImage) throw new Error('图片复制接口不可用，请重启桌面开发版');
      // blob URLs belong to the renderer session and cannot be fetched by the main process.
      let url = row.image.url;
      if (!row.image.originalPath && url.startsWith('blob:')) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('图片读取失败');
        const blob = await response.blob();
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('图片读取失败'));
          reader.readAsDataURL(blob);
        });
      }
      const result = await api.copyImagePromptSheetImage(url, row.image.name, row.image.originalPath);
      if (!result?.success) throw new Error(result?.error || '图片复制失败');
      setCopiedImageRowIds(current => new Set([...current, row.id]));
      lastManualCopiedRow.current = data.rows.findIndex(item => item.id === row.id);
      if (batchMode) setBatchCursors(current => ({ ...current, images: lastManualCopiedRow.current + 1 }));
      setNotice('✓ 图片已复制，可直接粘贴');
    } catch (error) {
      setNotice(`图片复制失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCopyingImageId(null);
    }
  };

  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [batchPanelExpanded, setBatchPanelExpanded] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSize, setBatchSize] = useState(4);
  const [batchStart, setBatchStart] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  useEffect(() => { setExpandedGroups(new Set()); }, [batchStart, batchSize]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchCursors, setBatchCursors] = useState({ text: 0, images: 0 });
  const [manualBatchSelection, setManualBatchSelection] = useState(false);
  const batchRows = data.rows.slice(batchCursors.text, batchCursors.text + batchSize);
  const totalBatchGroups = Math.ceil(Math.max(0, data.rows.length - batchStart) / batchSize);
  const batchGroupNumber = (cursor: number) => Math.floor(Math.max(0, cursor - batchStart) / batchSize) + 1;
  const batchGroupStart = (rowIndex: number) => rowIndex < batchStart ? -1 : batchStart + Math.floor((rowIndex - batchStart) / batchSize) * batchSize;
  const allGroupsExpanded = totalBatchGroups > 0 && Array.from({ length: totalBatchGroups }, (_, index) => batchStart + index * batchSize).every(start => expandedGroups.has(start));
  const toggleGroup = (start: number) => setExpandedGroups(current => {
    const next = new Set(current);
    if (next.has(start)) next.delete(start); else next.add(start);
    return next;
  });
  const visibleRows = useMemo(() => data.rows.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row, rowIndex }) =>
    matchesSearchFields(searchQuery, [...row.values, row.image?.name, row.searchText, `文案组${(row.sourceIndex ?? 0) + 1}`, `第${batchGroupNumber(rowIndex)}组`, segmentLabels.get(row.id)])
  ), [data.rows, searchQuery, batchStart, batchSize, segmentLabels]);
  const visibleRowIndexes = useMemo(() => new Set(visibleRows.filter(({ rowIndex }) => rowIndex < batchStart || expandedGroups.has(batchGroupStart(rowIndex))).map(item => item.rowIndex)), [visibleRows, expandedGroups, batchStart, batchSize]);

  const highlightBatch = (start: number, size = batchSize) => {
    setSelectedRowIds(new Set(data.rows.slice(start, start + size).map(row => row.id)));
    setSelectedCells(new Set(data.rows.slice(start, start + size).flatMap((_, offset) => [2, 3, 4, 5].map(column => `${start + offset}:${column}`))));
    requestAnimationFrame(() => tableContainerRef.current?.querySelector(`[data-row-index="${start}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  const selectBatch = (start: number, size = batchSize) => {
    setBatchStart(start);
    setBatchCursors({ text: start, images: start });
    setManualBatchSelection(false);
    highlightBatch(start, size);
  };
  const chosenRowIds = new Set([
    ...data.rows.filter(row => selectedRowIds.has(row.id)).map(row => row.id),
    ...data.rows.filter((_, index) => [...selectedCells].some(key => key.startsWith(`${index}:`))).map(row => row.id)
  ]);
  const toggleImageRowSelection = (row: DetachedRow, rowIndex: number) => {
    const selected = chosenRowIds.has(row.id);
    setManualBatchSelection(true);
    setSelectedRowIds(current => {
      const next = new Set(current);
      if (selected) next.delete(row.id); else next.add(row.id);
      return next;
    });
    setSelectedCells(current => {
      const next = new Set([...current].filter(key => !key.startsWith(`${rowIndex}:`)));
      if (!selected) [2, 3, 4, 5].forEach(column => next.add(`${rowIndex}:${column}`));
      return next;
    });
  };
  const [copyingSelectedImages, setCopyingSelectedImages] = useState(false);
  const copySelectedImages = async (repeatStart?: number) => {
    if (copyingSelectedImages || batchBusy) return;
    const repeating = repeatStart !== undefined;
    const automatic = !repeating && batchMode && !manualBatchSelection;
    const start = batchCursors.images;
    const targetRows = repeating ? data.rows.slice(repeatStart, repeatStart + batchSize) : automatic ? data.rows.slice(start, start + batchSize) : data.rows.filter(row => chosenRowIds.has(row.id));
    if (!targetRows.length) { setNotice('图片已复制到最后一行'); return; }
    const rows = targetRows.filter(row => row.image?.url);
    const unique = new Map<string, NonNullable<DetachedRow['image']>>();
    rows.forEach(row => { const image = row.image!; unique.set(image.id || image.url, image); });
    if (!unique.size) { setNotice('选中行没有图片'); return; }
    setCopyingSelectedImages(true);
    try {
      const api = (window as any).electronAPI;
      if (!api?.copyImagePromptSheetImages) throw new Error('请重启桌面版以加载多图复制功能');
      const images = [];
      for (const image of unique.values()) {
        let url = image.url;
        if (!image.originalPath && url.startsWith('blob:')) {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`读取图片失败：${image.name}`);
          const blob = await response.blob();
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error(`读取图片失败：${image.name}`));
            reader.readAsDataURL(blob);
          });
        }
        images.push({ url, name: image.name, originalPath: image.originalPath });
      }
      const result = await api.copyImagePromptSheetImages(images);
      if (!result?.success) throw new Error(result?.error || '多图复制失败');
      setCopiedImageRowIds(current => new Set([...current, ...rows.map(row => row.id)]));
      setNotice(`✓ 已复制 ${unique.size} 张原图（重复图片已去除）`);
      if (!batchMode && !repeating) lastManualCopiedRow.current = Math.max(...rows.map(row => data.rows.findIndex(item => item.id === row.id)));
      if (batchMode && !repeating) {
        const next = automatic ? start + targetRows.length : Math.max(...targetRows.map(row => data.rows.findIndex(item => item.id === row.id))) + 1;
        setBatchCursors(current => ({ ...current, images: next }));
        if (automatic) highlightBatch(start);
      }
      return true;
    } catch (error) {
      setNotice(`复制所选图片失败：${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally { setCopyingSelectedImages(false); }
  };

  const [groupCopyFeedback, setGroupCopyFeedback] = useState<Record<string, string>>({});
  const repeatGroupCopy = async (start: number, kind: 'images' | 'text') => {
    if (batchBusy || copyingSelectedImages) return;
    const key = `${start}:${kind}`;
    setGroupCopyFeedback(current => ({ ...current, [key]: '复制中…' }));
    let success = false;
    try { success = kind === 'images' ? Boolean(await copySelectedImages(start)) : Boolean(await repeatGroupTable(start)); }
    catch { success = false; }
    setGroupCopyFeedback(current => ({ ...current, [key]: success ? '✓ 已复制' : '复制失败，重试' }));
    window.setTimeout(() => setGroupCopyFeedback(current => { const next = { ...current }; delete next[key]; return next; }), 2000);
  };
  const repeatGroupTable = async (start: number) => {
    if (batchBusy || copyingSelectedImages) return;
    setBatchBusy(true);
    try {
      const rows = data.rows.slice(start, start + batchSize);
      const success = await copyGrid(rows.map(row => [2, 3, 4, 5].map(column => row.values[column] ?? '')));
      if (success) setCopiedRowIds(current => new Set([...current, ...rows.map(row => row.id)]));
      setNotice(success ? `✓ 已重新复制第${batchGroupNumber(start)}组表格，连续进度保持不变` : '重新复制表格失败');
      return success;
    } finally { setBatchBusy(false); }
  };

  const markProblemRows = (problem: boolean) => {
    setProblemRowIds(current => {
      const next = new Set(current);
      chosenRowIds.forEach(id => problem ? next.add(id) : next.delete(id));
      return next;
    });
    setNotice(`${problem ? '已标记' : '已取消标记'} ${chosenRowIds.size} 行问题状态`);
  };

  const copyAllCells = async () => {
    if (!visibleRows.length) return;
    const grid = fixedDeliveryCopy
      ? visibleRows.map(({ row }) => [2, 3, 4, 5].map(column => row.values[column] ?? ''))
      : [data.headers, ...visibleRows.map(({ row }) => row.values)];
    const success = await copyGrid(grid);
    setNotice(success ? `✓ 已复制${searchQuery.trim() ? '搜索结果' : '全部'} ${visibleRows.length} 行表格（${fixedDeliveryCopy ? '固定交付四列，不含表头' : '含表头'}）` : '复制全部表格失败');
  };

  const selectRange = (start: { row: number; column: number }, end: { row: number; column: number }) => {
    setManualBatchSelection(true);
    const next = new Set<string>(dragSelectionBaseRef.current);
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
      if (!visibleRowIndexes.has(row)) continue;
      for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column++) {
        if (column !== 1 && visibleColumns.includes(column)) next.add(`${row}:${column}`); // 图片直接点击复制，不混入文字表格
      }
    }
    setSelectedCells(next);
  };

  const copySelectedCells = async () => {
    if (batchMode && !manualBatchSelection) {
      if (batchBusy || copyingSelectedImages || !batchRows.length) return false;
      setBatchBusy(true);
      try {
        const success = await copyGrid(batchRows.map(row => [2, 3, 4, 5].map(column => row.values[column] ?? '')));
        if (!success) { setNotice('文字复制失败，仍停留在当前批'); return false; }
        setCopiedRowIds(current => new Set([...current, ...batchRows.map(row => row.id)]));
        setNotice(`✓ 已复制本批 ${batchRows.length} 行文字，下次文字复制从下一批开始`);
        setBatchCursors(current => ({ ...current, text: batchCursors.text + batchRows.length }));
        highlightBatch(batchCursors.text);
        return true;
      } finally { setBatchBusy(false); }
    }

    if (!selectedCells.size) return false;
    const selected = [...selectedCells].map(key => key.split(':').map(Number));
    const minRow = Math.min(...selected.map(([row]) => row));
    const maxRow = Math.max(...selected.map(([row]) => row));
    const minColumn = Math.min(...selected.map(([, column]) => column));
    const maxColumn = Math.max(...selected.map(([, column]) => column));
    const columns = fixedDeliveryCopy ? [2, 3, 4, 5]
      : visibleColumns.filter(column => column !== 1 && column >= minColumn && column <= maxColumn);
    const grid = fixedDeliveryCopy
      ? data.rows.filter((_, index) => selected.some(([row]) => row === index)).map(row => columns.map(column => row.values[column] ?? ''))
      : data.rows.slice(minRow, maxRow + 1).map((row, offset) => columns.map(column =>
        selectedCells.has(`${minRow + offset}:${column}`) ? row.values[column] ?? '' : ''));
    const copied = await copyGrid(grid);
    if (!copied) {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 1800);
      return false;
    }
    lastManualCopiedRow.current = maxRow;
    if (batchMode) setBatchCursors(current => ({ ...current, text: maxRow + 1 }));
    setCopyFailed(false);
    setCopiedRowIds(current => {
      const next = new Set(current);
      data.rows.forEach((row, rowIndex) => {
        if (row.values.some((_, column) => selectedCells.has(`${rowIndex}:${column}`))) next.add(row.id);
      });
      return next;
    });
    setCopyFeedback(true);
    window.setTimeout(() => setCopyFeedback(false), 1200);
    return true;
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select') || target?.isContentEditable) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copySelectedCells();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCells, data, fixedDeliveryCopy, batchMode, batchStart, batchSize, batchBusy, copyingSelectedImages, batchCursors, manualBatchSelection]);

  useEffect(() => (window as any).electronAPI?.onImagePromptSheetCopyShortcut?.(() => { void copySelectedCells(); }), [selectedCells, data, fixedDeliveryCopy, batchMode, batchStart, batchSize, batchBusy, copyingSelectedImages, batchCursors, manualBatchSelection]);

  if (collapsed) return <main className="flex min-h-screen items-center bg-[#0b1527] p-2 text-slate-100">
    <style>{`
      @keyframes mini-pet-float { 0%, 100% { transform: translateY(1px) rotate(-3deg); } 50% { transform: translateY(-3px) rotate(3deg); } }
      @keyframes mini-pet-blink { 0%, 42%, 46%, 100% { transform: scaleY(1); } 44% { transform: scaleY(.12); } }
      @keyframes mini-sparkle { 0%, 100% { opacity: .25; transform: translateY(2px) scale(.75); } 50% { opacity: .9; transform: translateY(-3px) scale(1); } }
      .mini-sparkle { animation: mini-sparkle 2.8s ease-in-out infinite; }
      .mini-sparkle-right { animation-delay: 1.4s; }
      .mini-pet { animation: mini-pet-float 3s ease-in-out infinite; }
      .mini-pet-eyes { transform-origin: 24px 25px; animation: mini-pet-blink 4.5s infinite; }
      @media (prefers-reduced-motion: reduce) { .mini-pet, .mini-pet-eyes, .mini-sparkle { animation: none; } }
    `}</style>
    <button type="button" onClick={() => void (window as any).electronAPI?.expandImagePromptSheet?.()} aria-label="展开图＋词交付表格" title="点击展开" className="flex w-full items-center justify-center gap-5 rounded-lg bg-[#13243b] px-2 py-1">
      <svg aria-hidden="true" viewBox="0 0 24 40" className="mini-sparkle h-9 w-5 shrink-0"><path d="M12 7l2.5 6.5L21 16l-6.5 2.5L12 25l-2.5-6.5L3 16l6.5-2.5Z" fill="#86efac" /><circle cx="5" cy="32" r="2" fill="#fcd34d" /></svg>
      <svg aria-hidden="true" viewBox="0 0 48 48" className="mini-pet h-14 w-14 shrink-0">
        <ellipse cx="24" cy="43" rx="12" ry="2" fill="#07101f" opacity=".5" />
        <path d="M24 12V7" stroke="#86efac" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="5" r="3" fill="#fbbf24" />
        <rect x="7" y="14" width="34" height="26" rx="10" fill="#86efac" />
        <rect x="11" y="18" width="26" height="17" rx="7" fill="#14382b" />
        <g className="mini-pet-eyes" fill="#dcfce7"><ellipse cx="18" cy="25" rx="2.5" ry="3" /><ellipse cx="30" cy="25" rx="2.5" ry="3" /></g>
        <path d="M21 30Q24 33 27 30" fill="none" stroke="#dcfce7" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5 23V30M43 23V30" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 24 40" className="mini-sparkle mini-sparkle-right h-9 w-5 shrink-0"><circle cx="18" cy="8" r="2" fill="#fcd34d" /><path d="M12 15l2.5 6.5L21 24l-6.5 2.5L12 33l-2.5-6.5L3 24l6.5-2.5Z" fill="#86efac" /></svg>
    </button>
  </main>;

  return <main className="min-h-screen bg-[#0b1527] p-3 text-slate-100">
    <header className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-[#13243b] px-3 py-2">
      <label className="flex items-center gap-2 text-xs text-slate-200">透明度 <input type="range" min="0.35" max="1" step="0.05" value={opacity} onChange={event => { const value = Number(event.target.value); setOpacity(value); void (window as any).electronAPI?.setImagePromptSheetOpacity?.(value); }} /> {Math.round(opacity * 100)}%</label>
      <button type="button" onClick={() => setKeepExpanded(current => !current)} className={`rounded border px-2 py-1.5 text-xs font-semibold ${keepExpanded ? 'border-amber-400 bg-amber-800 text-white' : 'border-slate-600 bg-slate-900 text-slate-300'}`}>固定显示列表：{keepExpanded ? '开' : '关'}</button>
      <button type="button" onClick={() => setFixedDeliveryCopy(current => !current)} className={`rounded border px-2 py-1.5 text-xs font-semibold ${fixedDeliveryCopy ? 'border-emerald-400 bg-emerald-800 text-white' : 'border-slate-600 bg-slate-900 text-slate-300'}`}>固定交付复制：{fixedDeliveryCopy ? '开' : '关'}</button>
      <button type="button" onClick={() => setShowColumnSettings(current => !current)} className="rounded border border-violet-500 bg-violet-950 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-900">显示列</button>


      <button type="button" onClick={() => void copyAllCells()} disabled={!visibleRows.length} className="rounded border border-emerald-400 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40">{searchQuery.trim() ? '复制搜索结果' : '复制全部表格'}</button>
      <button type="button" onClick={() => void (window as any).electronAPI?.closeImagePromptSheet?.()} className="rounded border border-amber-500 bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-900">恢复到主窗口</button>
    </header>
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="whitespace-nowrap text-violet-200" title="总行数为全部数据；组数按当前起始行和每组行数计算">总共 {data.rows.length} 行 · {totalBatchGroups} 组</span>
      <button type="button" disabled={!totalBatchGroups} aria-pressed={allGroupsExpanded} onClick={() => setExpandedGroups(allGroupsExpanded ? new Set() : new Set(Array.from({ length: totalBatchGroups }, (_, index) => batchStart + index * batchSize)))} className="rounded border border-violet-500 bg-violet-950 px-2 py-1 font-semibold text-violet-100 hover:bg-violet-900 disabled:opacity-40">{allGroupsExpanded ? '全部折叠' : '全部展开'}</button>
      <button type="button" aria-expanded={toolsExpanded} aria-controls="detached-sheet-tools" onClick={() => setToolsExpanded(value => !value)} className="rounded border border-slate-600 px-2 py-1 text-slate-300">{toolsExpanded ? '收起操作' : '展开操作'}</button>
    </div>
    <div id="detached-sheet-tools" hidden={!toolsExpanded}>
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-[#13243b] p-2">
      <input type="search" aria-label="搜索交付表格" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); anchorRef.current = null; lastSelectionAnchorRef.current = null; }} placeholder="搜索图片名字 / 文案 / 描述词 / 预设 / 组" className="min-w-0 flex-1 rounded border border-slate-500 bg-slate-950 px-3 py-2 text-xs text-white" />
      <button type="button" aria-pressed={multiSelectMode} onClick={() => setMultiSelectMode(value => !value)} className={`rounded border px-3 py-2 text-xs font-semibold ${multiSelectMode ? 'border-amber-400 bg-amber-700 text-white' : 'border-slate-500 text-slate-300'}`} title="开启后点击图片选择整行，再点取消；关闭后点击图片复制原图">多选：{multiSelectMode ? '开' : '关'}</button>
      <span className="text-xs text-slate-400">{visibleRows.length} / {data.rows.length} 行</span>
    </div>
    <button type="button" onClick={() => setBatchPanelExpanded(value => !value)} className="mb-2 rounded border border-violet-700 bg-[#132137] px-3 py-2 text-xs text-violet-200">{batchPanelExpanded ? '收起复制面板' : '展开复制面板'} · 连续分批：{batchMode ? '开' : '关'}</button>
    {batchPanelExpanded && (    <section className="mb-3 rounded-xl border border-violet-800/60 bg-[#132137] p-3 text-xs text-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={batchBusy || copyingSelectedImages} onClick={() => { const enabled = !batchMode; setBatchMode(enabled); if (enabled) { const first = data.rows.findIndex(row => chosenRowIds.has(row.id)); selectBatch(lastManualCopiedRow.current >= 0 ? Math.min(data.rows.length, lastManualCopiedRow.current + 1) : first >= 0 ? first : 0); } }} className={`shrink-0 rounded-lg border px-3 py-2 font-semibold ${batchMode ? 'border-violet-400 bg-violet-800 text-white' : 'border-slate-600 bg-slate-900'}`}>连续分批复制：{batchMode ? '开' : '关'}</button>
        <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">每组行数<input style={{ width: 68, minWidth: 68, height: 32 }} type="number" min="1" max="1000" disabled={batchBusy || copyingSelectedImages} value={batchSize} onChange={event => { const size = Math.max(1, Math.min(1000, Number(event.target.value) || 1)); setBatchSize(size); if (batchMode) selectBatch(batchStart, size); }} className="rounded border border-slate-500 bg-slate-950 px-2 text-center" /></label>
        <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">起始行<input style={{ width: 80, minWidth: 80, height: 32 }} type="number" min="1" max={Math.max(1, data.rows.length)} disabled={batchBusy || copyingSelectedImages} value={Math.min(batchStart + 1, Math.max(1, data.rows.length))} onChange={event => selectBatch(Math.max(0, Math.min(data.rows.length - 1, (Number(event.target.value) || 1) - 1)))} className="rounded border border-slate-500 bg-slate-950 px-2 text-center" /></label>
        <span className="rounded-lg bg-violet-950 px-3 py-2 font-semibold text-violet-200">共 {totalBatchGroups} 组 · {Math.max(0, data.rows.length - batchStart)} 行</span>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-slate-700 pt-3">
        <div className="flex flex-col gap-1"><button type="button" onClick={() => void copySelectedCells()} disabled={batchBusy || copyingSelectedImages || (batchMode && !manualBatchSelection ? !batchRows.length : !selectedCells.size)} className={`rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${copyFeedback ? 'border-emerald-400 bg-emerald-700 text-white' : copyFailed ? 'border-rose-400 bg-rose-800 text-white' : 'border-sky-500 bg-sky-950 text-sky-100 hover:bg-sky-900'}`}>{copyFeedback ? '✓ 已复制' : copyFailed ? '复制失败' : batchMode && !manualBatchSelection ? batchCursors.text >= data.rows.length ? '表格全部复制完成' : `复制第${batchGroupNumber(batchCursors.text)}组表格` : `复制所选 ${selectedCells.size || ''}`}</button>{batchMode && <span className="px-1 text-[11px] text-sky-200">{batchCursors.text >= data.rows.length ? '表格已全部完成' : `第${batchCursors.text + 1}–${Math.min(batchCursors.text + batchSize, data.rows.length)}行`}</span>}</div>
        <div className="flex flex-col gap-1"><button type="button" onClick={() => void copySelectedImages()} disabled={(batchMode && !manualBatchSelection ? batchCursors.images >= data.rows.length : !chosenRowIds.size) || batchBusy || copyingSelectedImages || copyingImageId !== null} className="rounded border border-sky-400 bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{copyingSelectedImages ? '正在复制图片…' : batchMode && !manualBatchSelection ? batchCursors.images >= data.rows.length ? '图片全部复制完成' : `复制第${batchGroupNumber(batchCursors.images)}组图片` : `复制所选图片 (${chosenRowIds.size} 行)`}</button>{batchMode && <span className="px-1 text-[11px] text-emerald-200">{batchCursors.images >= data.rows.length ? '图片已全部完成' : `第${batchCursors.images + 1}–${Math.min(batchCursors.images + batchSize, data.rows.length)}行`}</span>}</div>
        {batchMode && manualBatchSelection && <button onClick={() => setManualBatchSelection(false)} className="rounded border border-amber-500 px-2 py-1 text-amber-200">手动选择中 · 恢复连续复制</button>}
      </div>
    </section>)}

    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-400">已选 {chosenRowIds.size} 行 · 问题 {data.rows.filter(row => problemRowIds.has(row.id)).length} 行</span>
      <button type="button" disabled={!chosenRowIds.size} onClick={() => markProblemRows(true)} className="rounded border border-rose-500 bg-rose-950 px-2 py-1 text-rose-200 disabled:opacity-40">标记问题行</button>
      <button type="button" disabled={!chosenRowIds.size} onClick={() => markProblemRows(false)} className="rounded border border-slate-600 px-2 py-1 text-slate-300 disabled:opacity-40">取消问题标记</button>
      <button type="button" onClick={() => { setSelectedRowIds(new Set()); setSelectedCells(new Set()); }} className="rounded border border-slate-600 px-2 py-1 text-slate-300">取消选择</button>
    </div>
    </div>
    {notice && <p role="status" className={`mb-2 text-xs ${notice.includes('失败') ? 'text-rose-300' : 'text-emerald-300'}`}>{notice}</p>}
    {showColumnSettings && <div className="mb-3 rounded-lg border border-violet-800 bg-[#111b2d] px-3 py-2 text-xs text-violet-100"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2"><span className="font-bold">显示列：</span>{data.headers.map((header, column) => <label key={header} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => setVisibleColumns(current => current.includes(column) ? current.filter(item => item !== column) : [...current, column].sort((a, b) => a - b))} />{header}</label>)}</div><div className="flex flex-wrap items-center gap-3 border-t border-violet-900 pt-2"><span className="font-bold">列宽：</span>{data.headers.map((header, column) => visibleColumns.includes(column) && <label key={header} className="flex items-center gap-1.5">{header}<input type="range" min="10" max="240" step="5" disabled={column === 4 && columnWidths[4] === 0} value={columnWidths[column] || 100} onChange={event => setColumnWidths(current => ({ ...current, [column]: Number(event.target.value) }))} />{column === 4 ? <button type="button" onClick={() => setColumnWidths(current => ({ ...current, 4: current[4] === 0 ? 160 : 0 }))} className="rounded border border-violet-600 px-1 py-0.5">{columnWidths[4] === 0 ? '自动填满' : `${columnWidths[4]}px`}</button> : <span>{columnWidths[column] || 100}px</span>}</label>)}</div></div>}
    <div ref={tableContainerRef} className="overflow-auto rounded-lg border border-slate-700" onMouseUp={() => { anchorRef.current = null; }} onMouseLeave={() => { anchorRef.current = null; }}>
      {editingCell && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onMouseDown={event => event.stopPropagation()}><div className="flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-slate-500 bg-slate-900 p-5 text-white"><h3 className="font-bold">{data.headers[editingCell.column]} · 放大{[4, 5, 6].includes(editingCell.column) ? '编辑' : '查看'}</h3><textarea autoFocus readOnly={![4, 5, 6].includes(editingCell.column)} value={editingCell.value} onChange={event => setEditingCell({ ...editingCell, value: event.target.value })} className="h-[55vh] w-full resize-y rounded border border-slate-600 bg-slate-950 p-3 text-sm leading-relaxed" />{editError && <p className="text-rose-300">{editError}</p>}<div className="flex justify-end gap-2"><button onClick={() => setEditingCell(null)} className="rounded border border-slate-500 px-3 py-2">关闭</button>{[4, 5, 6].includes(editingCell.column) && <button onClick={() => void saveCellEdit()} className="rounded bg-sky-700 px-3 py-2">保存修改</button>}</div></div></div>}
      <table className="min-w-[330px] w-full table-fixed border-collapse text-xs"><colgroup><col style={{ width: 20 }} /><col style={{ width: 72 }} /><col style={{ width: 68 }} />{data.headers.map((_, column) => visibleColumns.includes(column) && <col key={column} style={columnWidths[column] ? { width: columnWidths[column] } : undefined} />)}</colgroup>
        <thead className="sticky top-0 bg-[#13243b]"><tr><th className="border border-slate-700 p-0 text-[10px]">#</th><th className="border border-slate-700 p-1 text-left">片段编号</th><th className="border border-slate-700 p-1 text-left">分配组</th>{data.headers.map((header, column) => visibleColumns.includes(column) && <th key={header} className={`border border-slate-700 text-left ${column === 3 ? 'p-0 text-[0px]' : 'p-1'}`}>{header}</th>)}</tr></thead>
        <tbody>{!visibleRows.length && <tr><td colSpan={3 + visibleColumns.length} className="p-6 text-center text-slate-400">{searchQuery.trim() ? '没有匹配的结果' : '暂无数据'}</td></tr>}{visibleRows.map(({ row, rowIndex }, visibleIndex) => { const groupStart = batchGroupStart(rowIndex); const groupExpanded = groupStart < 0 || expandedGroups.has(groupStart); const startsGroup = groupStart >= 0 && (visibleIndex === 0 || batchGroupStart(visibleRows[visibleIndex - 1].rowIndex) !== groupStart); const groupRows = startsGroup ? data.rows.slice(groupStart, groupStart + batchSize) : []; const groupImageRows = groupRows.filter(item => item.image?.url); const groupImagesCopied = groupImageRows.length > 0 && groupImageRows.every(item => copiedImageRowIds.has(item.id)); const groupTableCopied = groupRows.length > 0 && groupRows.every(item => copiedRowIds.has(item.id)); const copied = copiedRowIds.has(row.id); const imageCopied = Boolean(row.image && copiedImageRowIds.has(row.id)); const sourceTone = ['bg-sky-950/25', 'bg-violet-950/25', 'bg-cyan-950/25', 'bg-amber-950/20', 'bg-fuchsia-950/20'][(row.sourceIndex ?? 0) % 5]; const problem = problemRowIds.has(row.id); return <React.Fragment key={row.id}>{startsGroup && <tr><td colSpan={3 + visibleColumns.length} style={{ borderTop: '4px solid #a78bfa', borderBottom: 'none' }} className="bg-[#293452] px-1 py-1.5"><div className="flex flex-nowrap items-center gap-0.5 text-[11px]"><button type="button" aria-expanded={groupExpanded} aria-label={`${groupExpanded ? '折叠' : '展开'}第${batchGroupNumber(groupStart)}组`} onClick={() => toggleGroup(groupStart)} className="inline-grid shrink-0 whitespace-nowrap rounded px-0.5 py-0.5 text-right font-bold tabular-nums text-violet-200 hover:bg-violet-900/60"><span aria-hidden="true" className="invisible col-start-1 row-start-1">▶ 第{totalBatchGroups}组 · {batchStart + Math.max(0, totalBatchGroups - 1) * batchSize + 1}–{data.rows.length}行</span><span className="col-start-1 row-start-1"><span aria-hidden="true">{groupExpanded ? '▼' : '▶'} </span>第{batchGroupNumber(groupStart)}组 · {groupStart + 1}–{Math.min(groupStart + batchSize, data.rows.length)}行</span></button><button type="button" disabled={batchBusy || copyingSelectedImages} onClick={() => void repeatGroupCopy(groupStart, 'images')} className={`inline-grid shrink-0 whitespace-nowrap rounded border px-1 py-0.5 tabular-nums transition-colors disabled:opacity-40 ${groupImagesCopied ? 'border-amber-300 bg-amber-600 text-white' : 'border-emerald-600 bg-emerald-950 text-emerald-200'}`}><span aria-hidden="true" className="invisible col-start-1 row-start-1">{`✓ 重复制第${totalBatchGroups}组图片`}</span><span className="col-start-1 row-start-1" aria-live="polite">{groupCopyFeedback[`${groupStart}:images`] || `${groupImagesCopied ? '✓ ' : ''}重复制第${batchGroupNumber(groupStart)}组图片`}</span></button><button type="button" disabled={batchBusy || copyingSelectedImages} onClick={() => void repeatGroupCopy(groupStart, 'text')} className={`inline-grid shrink-0 whitespace-nowrap rounded border px-1 py-0.5 tabular-nums transition-colors disabled:opacity-40 ${groupTableCopied ? 'border-amber-300 bg-amber-600 text-white' : 'border-sky-600 bg-sky-950 text-sky-200'}`}><span aria-hidden="true" className="invisible col-start-1 row-start-1">{`✓ 重复制第${totalBatchGroups}组表格`}</span><span className="col-start-1 row-start-1" aria-live="polite">{groupCopyFeedback[`${groupStart}:text`] || `${groupTableCopied ? '✓ ' : ''}重复制第${batchGroupNumber(groupStart)}组表格`}</span></button></div></td></tr>}{groupExpanded && <tr data-row-index={rowIndex} key={row.id} className={problem ? 'bg-red-800/80' : copied ? 'bg-emerald-950/65' : sourceTone}><td className={`border border-slate-800 p-0 text-center text-[9px] ${copied ? 'font-bold text-emerald-300' : 'text-slate-400'}`}><button type="button" title="点击行号选择整行，可连续选择多行" aria-pressed={selectedRowIds.has(row.id)} onClick={event => { setManualBatchSelection(true); if (!event.ctrlKey && !event.metaKey) setSelectedCells(new Set()); setSelectedRowIds(current => { const next = new Set(current); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next; }); }} className={`w-full py-1 ${selectedRowIds.has(row.id) ? problem ? 'bg-red-700 ring-1 ring-inset ring-red-300' : 'bg-sky-700 ring-1 ring-inset ring-sky-300' : ''}`}><span className="block">{copied ? '✓' : rowIndex + 1}</span>{problem && <span className="block font-bold text-rose-300" title="问题行">!</span>}</button></td><td className="border border-slate-800 p-1 text-slate-200 whitespace-nowrap" onDoubleClick={() => void copyGrid([[segmentLabels.get(row.id) || '']])}>{segmentLabels.get(row.id)}</td><td className="border border-slate-800 p-1 whitespace-nowrap"><span className="rounded bg-violet-950/70 px-1.5 py-1 text-violet-200">{rowIndex < batchStart ? '—' : `第${batchGroupNumber(rowIndex)}组`}</span></td>{row.values.map((value, column) => {
          if (!visibleColumns.includes(column)) return null;
          const key = `${rowIndex}:${column}`;
          if (column === 1) return <td key={column} className="border border-slate-800 p-0"><button type="button" onClick={() => multiSelectMode ? toggleImageRowSelection(row, rowIndex) : void copyImage(row)} aria-pressed={multiSelectMode ? chosenRowIds.has(row.id) : undefined} disabled={!multiSelectMode && (!row.image || copyingImageId !== null || copyingSelectedImages)} title={multiSelectMode ? (chosenRowIds.has(row.id) ? '点击取消选择' : '点击选择整行') : copyingImageId === row.id ? '正在复制图片…' : '点击复制原图'} className={`h-8 w-[30px] overflow-hidden rounded border-2 bg-black ${multiSelectMode && chosenRowIds.has(row.id) ? 'border-amber-300 ring-2 ring-amber-300' : imageCopied ? 'border-emerald-400 ring-1 ring-emerald-400/60' : 'border-sky-600'}`}>{row.image && <img loading="lazy" decoding="async" src={row.image.url} alt={row.image.name} className="h-full w-full object-cover" />}</button></td>;
          const selected = selectedCells.has(key);
          const displayValue = value;
          return <td key={column} onMouseDown={event => { setManualBatchSelection(true);
            event.preventDefault();
            const additive = event.ctrlKey || event.metaKey;
            if (!additive) setSelectedRowIds(new Set());
            const point = { row: rowIndex, column };
            dragSelectionBaseRef.current = additive ? new Set(selectedCells) : new Set();
            if (event.shiftKey && lastSelectionAnchorRef.current) {
              anchorRef.current = lastSelectionAnchorRef.current;
              selectRange(lastSelectionAnchorRef.current, point);
            } else {
              anchorRef.current = point;
              lastSelectionAnchorRef.current = point;
              const next = new Set(dragSelectionBaseRef.current);
              if (additive && next.has(key)) next.delete(key); else next.add(key);
              setSelectedCells(next);
            }
          }} onMouseEnter={() => anchorRef.current && selectRange(anchorRef.current, { row: rowIndex, column })} onDoubleClick={() => { setEditError(''); setEditingCell({ id: row.id, column, value }); }} className={`cursor-cell border border-slate-800 ${column === 3 ? 'p-0 text-[0px]' : 'p-1 text-slate-200'} ${problem ? selected ? 'bg-red-700 ring-2 ring-inset ring-red-300' : 'hover:bg-red-700' : selected ? 'bg-sky-800/80 ring-2 ring-inset ring-sky-300' : 'hover:bg-sky-950/50'}`}><div className={`${column === 2 || column === 4 ? 'whitespace-nowrap text-ellipsis' : 'line-clamp-2 whitespace-pre-wrap break-words'} overflow-hidden`}>{displayValue || '—'}</div></td>;
        })}</tr>}</React.Fragment>; })}</tbody>
      </table>
    </div>
  </main>;
}
