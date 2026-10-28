import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Zap, Upload, FolderOpen, Trash2, Copy, Check, Loader2, Shuffle, Search,
  Image as ImageIcon, RotateCcw, CheckSquare, Square
} from 'lucide-react';
import type { TemplatePreset } from '../constants/presetDefaults';
import { buildGoogleSheetsHtml, copyToClipboard, parseHtmlTable } from '../utils/clipboard';
import { copyImageToClipboard } from '../utils/gyazoUploader';
import { DEFAULT_GROUP_NAME_TEMPLATE, formatGroupName, migrateGroupNameTemplate } from '../utils/groupNaming';
import {
  QuickImage, QuickLayout, QuickArticleSplit, QuickPresetMode, QuickRowOrder, QuickRow,
  QUICK_CONTENT_PLACEHOLDER, buildQuickRows, buildQuickUnits, getQuickImageGroupKey,
  naturalSortQuickImages, parseQuickArticles, toTsv
} from '../utils/quickImagePrompt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  presets: TemplatePreset[];
}

const SETTINGS_KEY = 'quick-image-prompt-settings-v1';
const TEMP_PRESET_ID = '__quick_temp_template__';
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i;
/** 与主工作台共用的「图片组名字」命名模板。 */
const GROUP_NAME_TEMPLATE_KEY = 'template-batch-group-name-template';
/** 与原图＋词表格「固定交付复制」一致的四列（不含表头）。 */
const DELIVERY_HEADERS = ['图片名字', '空白列', '图片组名字', '最终描述词'];

/** 与主工作台 getImageGroupKey 相同：取最外层文件夹名。 */
const getTopFolder = (image: QuickImage) => {
  const parts = (image.fullPath || image.name).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : '未分组图片';
};

const blobUrlToDataUrl = async (url: string) => {
  if (!url.startsWith('blob:')) return url;
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
};

interface Settings {
  layout: QuickLayout;
  articleSplit: QuickArticleSplit;
  presetMode: QuickPresetMode;
  rowOrder: QuickRowOrder;
  copiesPerPreset: number;
  selectedPresetIds: string[];
  tempTemplate: string;
  tempEnabled: boolean;
  /** 有文案时是否按顺序自动配图；关闭后只使用手动分配。 */
  autoAssign: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  layout: 'per-article',
  articleSplit: 'blank',
  presetMode: 'each',
  rowOrder: 'unit',
  copiesPerPreset: 1,
  selectedPresetIds: [],
  tempTemplate: `内容："${QUICK_CONTENT_PLACEHOLDER}"`,
  tempEnabled: false,
  autoAssign: false
};

const loadSettings = (): Settings => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const isImageFile = (file: File) => file.type.startsWith('image/') || IMAGE_PATTERN.test(file.name);

async function readDroppedEntry(entry: any): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise(resolve => entry.file((file: File) => {
      (file as any).quickPath = String(entry.fullPath || file.name).replace(/^\//, '');
      resolve(isImageFile(file) ? [file] : []);
    }, () => resolve([])));
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const all: any[] = [];
    // Chromium 每次最多返回 100 项，需要循环读到空为止。
    while (true) {
      const batch: any[] = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])));
      if (!batch.length) break;
      all.push(...batch);
    }
    return (await Promise.all(all.map(readDroppedEntry))).flat();
  }
  return [];
}

const Segmented = <T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (value: T) => void }) => (
  <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-700">
    {options.map(option => (
      <button
        key={option.value}
        type="button"
        title={option.title}
        onClick={() => onChange(option.value)}
        className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${value === option.value ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export function QuickImagePromptModal({ isOpen, onClose, presets }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const patchSettings = (patch: Partial<Settings>) => setSettings(current => ({ ...current, ...patch }));
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 存储满时忽略 */ }
  }, [settings]);

  const [images, setImages] = useState<QuickImage[]>([]);
  const [copyText, setCopyText] = useState('');
  const [presetSearch, setPresetSearch] = useState('');
  const [seed, setSeed] = useState(() => Date.now());
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [groupOverrides, setGroupOverrides] = useState<Record<string, string>>({});
  const [copiedRowIds, setCopiedRowIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCopyingImages, setIsCopyingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => () => imagesRef.current.forEach(image => URL.revokeObjectURL(image.url)), []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const escapeRef = useRef<() => void>(onClose);
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') escapeRef.current(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // ===== 图片 =====
  const addFiles = useCallback((files: File[]) => {
    const accepted = files.filter(isImageFile);
    if (!accepted.length) return setNotice({ type: 'error', text: '没有识别到图片文件' });
    setImages(current => {
      const known = new Set(current.map(image => `${image.fullPath}|${image.file.size}`));
      const added: QuickImage[] = [];
      accepted.forEach(file => {
        const fullPath = (file as any).quickPath || (file as any).webkitRelativePath || file.name;
        const key = `${fullPath}|${file.size}`;
        if (known.has(key)) return;
        known.add(key);
        added.push({ id: `quick-img-${crypto.randomUUID()}`, name: file.name, fullPath, url: URL.createObjectURL(file), file });
      });
      return naturalSortQuickImages([...current, ...added]);
    });
  }, []);

  const removeImage = (id: string) => setImages(current => {
    const target = current.find(image => image.id === id);
    if (target) URL.revokeObjectURL(target.url);
    return current.filter(image => image.id !== id);
  });

  const clearImages = () => {
    images.forEach(image => URL.revokeObjectURL(image.url));
    setImages([]);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const items = Array.from(event.dataTransfer.items || []);
    const entries = items.map(item => (item as any).webkitGetAsEntry?.()).filter(Boolean);
    const files = entries.length
      ? (await Promise.all(entries.map(readDroppedEntry))).flat()
      : Array.from(event.dataTransfer.files || []);
    addFiles(files);
  };

  // ===== 文案 =====
  const handleCopyPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData('text/html');
    if (!html || !/<table/i.test(html)) return;
    const cells = parseHtmlTable(html).flat().map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 2) return;
    // 从表格粘贴时，每个单元格作为一篇；单元格内部的空行合并，避免被误判为分篇。
    event.preventDefault();
    const text = cells.map(cell => cell.replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, '\n')).join('\n\n');
    setCopyText(current => current.trim() ? `${current.trimEnd()}\n\n${text}` : text);
    patchSettings({ articleSplit: 'blank' });
    setNotice({ type: 'info', text: `已从表格粘贴 ${cells.length} 篇文案（每格一篇）` });
  };

  // ===== 预设 =====
  const presetGroups = useMemo(() => {
    const keyword = presetSearch.trim().toLowerCase();
    const groups = new Map<string, TemplatePreset[]>();
    presets.forEach(preset => {
      const category = preset.category?.trim() || '未分类预设';
      if (keyword && !`${category}\n${preset.name}\n${preset.template}`.toLowerCase().includes(keyword)) return;
      groups.set(category, [...(groups.get(category) || []), preset]);
    });
    return Array.from(groups.entries());
  }, [presets, presetSearch]);

  const selectedSet = useMemo(() => new Set(settings.selectedPresetIds), [settings.selectedPresetIds]);
  const togglePreset = (id: string) => patchSettings({
    selectedPresetIds: selectedSet.has(id) ? settings.selectedPresetIds.filter(item => item !== id) : [...settings.selectedPresetIds, id]
  });
  const toggleGroup = (members: TemplatePreset[]) => {
    const allSelected = members.every(preset => selectedSet.has(preset.id));
    const memberIds = new Set(members.map(preset => preset.id));
    patchSettings({
      selectedPresetIds: allSelected
        ? settings.selectedPresetIds.filter(id => !memberIds.has(id))
        : [...settings.selectedPresetIds, ...members.map(preset => preset.id).filter(id => !selectedSet.has(id))]
    });
  };

  const activePresets = useMemo(() => {
    const list = settings.selectedPresetIds
      .map(id => presets.find(preset => preset.id === id))
      .filter((preset): preset is TemplatePreset => Boolean(preset));
    if (settings.tempEnabled && settings.tempTemplate.trim()) {
      list.push({ id: TEMP_PRESET_ID, name: '临时模板', template: settings.tempTemplate, category: '临时' });
    }
    return list;
  }, [settings.selectedPresetIds, settings.tempEnabled, settings.tempTemplate, presets]);

  // ===== 生成 =====
  const articles = useMemo(() => parseQuickArticles(copyText, settings.articleSplit), [copyText, settings.articleSplit]);
  const unitResult = useMemo(() => buildQuickUnits(articles, images, settings.layout), [articles, images, settings.layout]);

  // ===== 手动配图：先选中右侧某行，再点左侧图片，自动跳到下一行 =====
  const [imageAssignments, setImageAssignments] = useState<Record<string, string>>({});
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const imageById = useMemo(() => new Map(images.map(image => [image.id, image])), [images]);
  const manualOnly = articles.length > 0 && !settings.autoAssign;
  const unitKey = (unit: { article: number; part: number }) => `${unit.article}-${unit.part}`;
  const units = useMemo(() => unitResult.units.map(unit => {
    const assigned = imageAssignments[unitKey(unit)];
    if (assigned === '__NONE__') return { ...unit, image: undefined };
    const image = assigned ? imageById.get(assigned) : undefined;
    if (image) return { ...unit, image };
    return manualOnly ? { ...unit, image: undefined } : unit;
  }), [unitResult.units, imageAssignments, imageById, manualOnly]);
  const imageUsage = useMemo(() => {
    const usage = new Map<string, number>();
    units.forEach(unit => { if (unit.image) usage.set(unit.image.id, (usage.get(unit.image.id) || 0) + 1); });
    return usage;
  }, [units]);
  const unassignedCount = images.length ? units.filter(unit => !unit.image).length : 0;
  const unusedImageCount = images.filter(image => !imageUsage.has(image.id)).length;
  const manualCount = Object.keys(imageAssignments).length;

  useEffect(() => {
    if (activeUnit !== null && activeUnit >= units.length) setActiveUnit(null);
  }, [activeUnit, units.length]);
  useEffect(() => {
    if (activeUnit === null) return;
    tableRef.current?.querySelector(`[data-quick-unit="${activeUnit}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeUnit]);

  const assignImage = (imageId: string) => {
    if (!units.length) return setNotice({ type: 'info', text: '先粘贴文案，右侧出现行后再分配图片' });
    const target = activeUnit ?? units.findIndex(unit => !unit.image);
    if (target < 0) return setNotice({ type: 'info', text: '所有片段都已配图；要换图请先点右侧对应的行' });
    setImageAssignments(current => ({ ...current, [unitKey(units[target])]: imageId }));
    setActiveUnit(target + 1 < units.length ? target + 1 : null);
  };
  const unassignUnit = (unitIndex: number) => {
    const unit = units[unitIndex];
    if (unit) setImageAssignments(current => ({ ...current, [unitKey(unit)]: '__NONE__' }));
  };
  escapeRef.current = () => { if (activeUnit !== null) setActiveUnit(null); else onClose(); };

  // ===== 手动分配预设：和图片一样，先选中行再点预设名，自动跳到下一行 =====
  const [presetAssignments, setPresetAssignments] = useState<Record<string, string>>({});
  const presetById = useMemo(() => new Map([...presets, ...activePresets].map(preset => [preset.id, preset])), [presets, activePresets]);
  // 只有一个预设且一份时，按「每片段一行」处理，这样才能逐行手动指定。
  const effectiveMode: QuickPresetMode = activePresets.length > 1
    ? settings.presetMode
    : settings.copiesPerPreset > 1 ? 'each' : 'sequence';
  const presetManualCount = Object.keys(presetAssignments).length;
  const assignPreset = (presetId: string) => {
    if (!units.length) return setNotice({ type: 'info', text: '先放图或粘贴文案，右侧出现行后再分配预设' });
    if (activeUnit === null) return;
    const patch: Partial<Settings> = {};
    if (effectiveMode === 'each') {
      patch.presetMode = 'sequence';
      patch.copiesPerPreset = 1;
      setNotice({ type: 'info', text: '已切换为「轮流分配」（每个片段一行），手动指定优先' });
    }
    // 未勾选任何预设时，把第一个手动选的预设加入备选，保证右侧能生成结果。
    if (!activePresets.length) patch.selectedPresetIds = [presetId];
    if (Object.keys(patch).length) patchSettings(patch);
    setPresetAssignments(current => ({ ...current, [unitKey(units[activeUnit])]: presetId }));
    setActiveUnit(activeUnit + 1 < units.length ? activeUnit + 1 : null);
  };
  const clearPresetAssignment = (unitIndex: number) => {
    const unit = units[unitIndex];
    if (unit) setPresetAssignments(current => { const next = { ...current }; delete next[unitKey(unit)]; return next; });
  };

  const rows = useMemo(
    () => buildQuickRows(units, activePresets, effectiveMode, settings.rowOrder, seed, settings.copiesPerPreset,
      unit => { const id = presetAssignments[unitKey(unit)]; return id ? presetById.get(id) : undefined; }),
    [units, activePresets, effectiveMode, settings.rowOrder, seed, settings.copiesPerPreset, presetAssignments, presetById]
  );
  const presetUsage = useMemo(() => {
    const usage = new Map<string, number>();
    rows.forEach(row => usage.set(row.preset.id, (usage.get(row.preset.id) || 0) + 1));
    return usage;
  }, [rows]);
  const getPrompt = (row: QuickRow) => promptOverrides[row.id] ?? row.prompt;
  const hasFolders = images.some(image => getQuickImageGroupKey(image) !== '未分组图片');
  const missingPlaceholder = activePresets.filter(preset => !preset.template.includes(QUICK_CONTENT_PLACEHOLDER));

  // ===== 图片组名字：与主工作台图＋词表格同一套命名规则 =====
  const groupNameTemplate = useMemo(() => {
    try { return migrateGroupNameTemplate(localStorage.getItem(GROUP_NAME_TEMPLATE_KEY) ?? DEFAULT_GROUP_NAME_TEMPLATE); } catch { return DEFAULT_GROUP_NAME_TEMPLATE; }
    // 每次打开弹窗重新读取，保持与主工作台设置同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const autoGroupNames = useMemo(() => {
    // 主工作台整篇命名以「第二段」的预设组为准；只有一段时用唯一片段。
    const setKey = (row: QuickRow) => effectiveMode === 'each' ? `${row.article}|${row.preset.id}|${row.copy}` : `${row.article}`;
    const references = new Map<string, QuickRow>();
    rows.forEach(row => {
      const key = setKey(row);
      const current = references.get(key);
      if (!current || (current.part !== 1 && row.part === 1)) references.set(key, row);
    });
    const singleImagePerArticle = articles.length > 0 && settings.layout === 'per-article';
    return new Map(rows.map(row => {
      const image = row.image;
      const folder = image ? getTopFolder(image) : '';
      const rawBase = !image ? '' : singleImagePerArticle || folder === '未分组图片' ? image.name : folder;
      const baseGroupName = rawBase.replace(IMAGE_PATTERN, '');
      const presetGroup = references.get(setKey(row))?.preset.category?.trim() || '';
      const name = formatGroupName(groupNameTemplate, {
        '图片文件夹': folder === '未分组图片' ? '' : folder,
        '图片名字': (image?.name || '').replace(/[-_]/g, 'z'),
        '图片组名字': baseGroupName.replace(/[-_]*\{\{counter\}\}/g, '').replace(/[-_]/g, 'z'),
        '预设名字': row.preset.name.replace(/[-_]/g, 'z'),
        '预设组名字': presetGroup.replace(/[-_]/g, 'z'),
        '预设组后缀': presetGroup.replace(/[-_]/g, 'z'),
        '片段编号': String(row.part + 1)
      });
      return [row.id, name];
    }));
  }, [rows, settings.presetMode, settings.layout, articles.length, groupNameTemplate]);
  const getGroupName = (row: QuickRow) => groupOverrides[row.id] ?? autoGroupNames.get(row.id) ?? '';
  const getDeliveryValues = (row: QuickRow) => [row.image?.name || '', '', getGroupName(row), getPrompt(row)];

  const writeTable = async (grid: string[][]) => {
    const text = toTsv(grid);
    const html = buildGoogleSheetsHtml(grid);
    const api = (window as any).electronAPI;
    try {
      if (api?.clipboardWriteTable) {
        const result = await api.clipboardWriteTable(text, html);
        if (result?.success) return true;
      }
      return (await copyToClipboard(text, html)) !== 'failed';
    } catch {
      return false;
    }
  };

  /** 固定交付复制：图片名字｜空白列｜图片组名字｜最终描述词，不含表头。 */
  const copyRows = async (target: QuickRow[], label = '') => {
    if (!target.length) return setNotice({ type: 'error', text: '没有可复制的结果' });
    const ok = await writeTable(target.map(getDeliveryValues));
    if (!ok) return setNotice({ type: 'error', text: '复制失败，请检查剪贴板权限' });
    setCopiedRowIds(current => new Set([...current, ...target.map(row => row.id)]));
    setNotice({ type: 'success', text: `已复制 ${target.length} 行文字${label}（图片名字｜空白列｜图片组名字｜最终描述词）` });
  };

  const selectedRows = rows.filter(row => selectedRowIds.has(row.id));
  const copyTarget = selectedRows.length ? selectedRows : rows;

  /** 与原表格一致：复制所选行的原图，重复图片只复制一次。 */
  const copyImages = async (target: QuickRow[]) => {
    const unique = new Map<string, QuickImage>();
    target.forEach(row => { if (row.image) unique.set(row.image.id, row.image); });
    if (!unique.size) return setNotice({ type: 'error', text: '所选行没有图片' });
    setIsCopyingImages(true);
    try {
      const api = (window as any).electronAPI;
      if (unique.size === 1) {
        const image = [...unique.values()][0];
        const result = await copyImageToClipboard(image.file, image.url, image.originalPath);
        if (!result.success) throw new Error(result.error || '图片复制失败');
      } else {
        if (!api?.copyImagePromptSheetImages) throw new Error('多图复制需要在桌面版中使用');
        const payload = [];
        for (const image of unique.values()) payload.push({ url: await blobUrlToDataUrl(image.url), name: image.name });
        const result = await api.copyImagePromptSheetImages(payload);
        if (!result?.success) throw new Error(result?.error || '多图复制失败');
      }
      setNotice({ type: 'success', text: `已复制 ${unique.size} 张原图${target.length > unique.size ? '（重复图片已去除）' : ''}` });
    } catch (error) {
      setNotice({ type: 'error', text: `复制图片失败：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setIsCopyingImages(false);
    }
  };

  const copyRowImage = async (row: QuickRow) => {
    if (!row.image) return;
    const result = await copyImageToClipboard(row.image.file, row.image.url, row.image.originalPath);
    if (!result.success) return setNotice({ type: 'error', text: result.error || '图片复制失败' });
    setCopiedRowIds(current => new Set(current).add(row.id));
    setNotice({ type: 'success', text: `已复制图片 ${row.image.name}` });
  };

  const copyRowPrompt = async (row: QuickRow) => {
    const result = await copyToClipboard(getPrompt(row));
    if (result === 'failed') return setNotice({ type: 'error', text: '复制失败' });
    setCopiedRowIds(current => new Set(current).add(row.id));
    setNotice({ type: 'success', text: '已复制描述词' });
  };

  const allSelected = rows.length > 0 && rows.every(row => selectedRowIds.has(row.id));
  const toggleRow = (id: string) => setSelectedRowIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const resetAll = () => {
    setImageAssignments({});
    setPresetAssignments({});
    setActiveUnit(null);
    clearImages();
    setCopyText('');
    setPromptOverrides({});
    setGroupOverrides({});
    setCopiedRowIds(new Set());
    setSelectedRowIds(new Set());
  };

  const summary = (() => {
    if (!unitResult.units.length) return '添加图片或文案后，右侧会实时生成结果';
    const base = articles.length
      ? `${articles.length} 篇文案 · ${unitResult.units.length} 个${settings.layout === 'storyboard' ? '分镜片段' : '单篇'}`
      : `${images.length} 张图（自定义文案：内容为 0）`;
    return `${base} × ${activePresets.length || 0} 个预设 → ${rows.length} 行结果`;
  })();

  // 保持挂载：关闭后再打开仍保留图片、文案和已复制进度。
  return (
    <div className={`fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm items-center justify-center p-4 ${isOpen ? 'flex' : 'hidden'}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="relative flex h-full max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0b1322] shadow-[0_0_60px_rgba(245,158,11,0.12)]">
        {/* 头部 */}
        <div className="flex items-center gap-3 border-b border-slate-800 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300"><Zap className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">快捷图＋词</h2>
            <p className="text-[11px] text-slate-400">放图 → 贴文案（可不填）→ 选预设，直接得到图＋词表格。独立于工作区，不影响现有拆分数据。</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={resetAll} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer" title="清空图片、文案与复制进度（保留预设选择与设置）">
              <RotateCcw className="h-3.5 w-3.5" />清空
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer" aria-label="关闭"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧：输入 */}
          <div className="flex w-[440px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-4 text-xs text-slate-300">
            {/* 1. 图片 */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">1</span>
                <span className="font-semibold text-slate-100">图片</span>
                <span className="text-slate-500">{images.length ? `${images.length} 张` : '可选'}</span>
                {images.length > 0 && (
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={clearImages} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300 cursor-pointer" title="清空图片"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              <div
                onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed p-3 transition ${isDragging ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900/40'}`}
              >
                {images.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-3 text-center text-slate-500">
                    <ImageIcon className="h-6 w-6" />
                    <span>拖入图片或文件夹（多个文件夹 = 多篇分镜）</span>
                  </div>
                ) : (
                  <>
                  {units.length > 0 && (
                    <div className={`mb-2 rounded-md px-2 py-1.5 text-[11px] ${activeUnit !== null ? 'border border-amber-500/60 bg-amber-500/10 text-amber-200' : 'bg-slate-800/60 text-slate-400'}`}>
                      {activeUnit !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">正在给【第 {units[activeUnit]?.article + 1} 篇{settings.layout === 'storyboard' || !articles.length ? ` · 片段 ${units[activeUnit]?.part + 1}` : ''}】选图，点图即分配并跳到下一行</span>
                          <button type="button" onClick={() => setActiveUnit(null)} className="shrink-0 text-amber-300/80 hover:text-white cursor-pointer">取消</button>
                        </div>
                      ) : unassignedCount > 0
                        ? `点图片会从第一个空位开始挨个分配（还有 ${unassignedCount} 个未配图）；也可以先点右侧某一行`
                        : '全部已配图。要换图：先点右侧对应行，再点这里的图'}
                    </div>
                  )}
                  <div className="grid max-h-64 grid-cols-6 gap-1.5 overflow-y-auto pr-1">
                    {images.map((image, index) => {
                      const used = imageUsage.get(image.id) || 0;
                      return (
                      <div key={image.id} onClick={() => assignImage(image.id)} className={`group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-md border bg-black transition hover:ring-2 hover:ring-amber-400 ${used ? 'border-emerald-500/70' : 'border-slate-700'}`} title={`${image.fullPath}\n点击分配到${activeUnit !== null ? '当前行' : '第一个空位'}`}>
                        <img src={image.url} alt={image.name} className={`h-full w-full object-cover ${used ? '' : 'opacity-90'}`} loading="lazy" />
                        <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[9px] text-white">{index + 1}</span>
                        {used > 0 && <span className="absolute bottom-0.5 right-0.5 rounded bg-emerald-600 px-1 text-[9px] font-bold text-white" title={`已用于 ${used} 个片段`}>×{used}</span>}
                        <button type="button" onClick={event => { event.stopPropagation(); removeImage(image.id); }} className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 p-0.5 text-white hover:bg-rose-600 group-hover:block cursor-pointer" aria-label="移除图片"><X className="h-3 w-3" /></button>
                      </div>
                      );
                    })}
                  </div>
                  </>
                )}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-600 bg-slate-800 py-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"><Upload className="h-3.5 w-3.5" />选择图片</button>
                  <button type="button" onClick={() => folderInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-600 bg-slate-800 py-1.5 text-slate-200 hover:bg-slate-700 cursor-pointer"><FolderOpen className="h-3.5 w-3.5" />选择文件夹</button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
                <input ref={folderInputRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
              </div>
            </section>

            {/* 2. 文案 */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">2</span>
                <span className="font-semibold text-slate-100">文案</span>
                <span className="text-slate-500">{articles.length ? `${articles.length} 篇` : '不填 = 自定义文案（内容为 0）'}</span>
              </div>
              <textarea
                value={copyText}
                onChange={event => setCopyText(event.target.value)}
                onPaste={handleCopyPaste}
                rows={7}
                placeholder={'空行或 --- 分隔多篇；分镜模式下每一行是一个片段。\n也可以直接从 Google 表格粘贴一列（每格一篇）。\n\n留空：每张图一行，内容为 0。'}
                className="w-full resize-y rounded-lg border border-slate-700 bg-[#070d18] p-2.5 text-xs leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
              {articles.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-slate-400">分篇</span>
                    <Segmented value={settings.articleSplit} onChange={value => patchSettings({ articleSplit: value })} options={[
                      { value: 'blank', label: '空行 / --- 分篇' },
                      { value: 'line', label: '每行一篇' }
                    ]} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-slate-400">配图</span>
                    <Segmented value={settings.layout} onChange={value => patchSettings({ layout: value })} options={[
                      { value: 'per-article', label: '单篇一图', title: '每篇文案整体作为一行，对应一张图' },
                      { value: 'storyboard', label: '分镜（每行一图）', title: '每篇里的每一行是一个片段，各对应一张图；多个文件夹时按文件夹对应各篇' }
                    ]} />
                  </div>
                  {images.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pl-16">
                      <label className="flex cursor-pointer items-center gap-1 text-slate-300" title="开启：没有手动分配的片段按顺序自动配图；关闭：只用手动分配">
                        <input type="checkbox" checked={settings.autoAssign} onChange={event => patchSettings({ autoAssign: event.target.checked })} className="accent-amber-500" />
                        自动按顺序配图
                      </label>
                      {manualCount > 0 && (
                        <button type="button" onClick={() => { setImageAssignments({}); setActiveUnit(null); }} className="text-[11px] text-slate-500 hover:text-rose-300 cursor-pointer">清除手动分配（{manualCount}）</button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {(unusedImageCount > 0 || unassignedCount > 0 || (unitResult.folderPerArticle && !manualOnly)) && (
                <div className="mt-2 space-y-1 text-[11px]">
                  {unitResult.folderPerArticle && !manualOnly && <p className="text-emerald-300">✓ 已按文件夹对应各篇（{articles.length || images.length} 组）</p>}
                  {unassignedCount > 0 && <p className="text-amber-300">⚠ 有 {unassignedCount} 个片段还没有配图</p>}
                  {unusedImageCount > 0 && <p className="text-slate-400">· 有 {unusedImageCount} 张图片未被使用</p>}
                  {settings.layout === 'storyboard' && hasFolders && !unitResult.folderPerArticle && articles.length > 0 && !manualOnly && (
                    <p className="text-slate-500">文件夹数与文案篇数不一致，已按顺序平铺分配</p>
                  )}
                </div>
              )}
            </section>

            {/* 3. 预设 */}
            <section className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">3</span>
                <span className="font-semibold text-slate-100">预设</span>
                <span className="text-slate-500">已选 {activePresets.length}</span>
                <div className="ml-auto flex items-center gap-2">
                  {presetManualCount > 0 && (
                    <button type="button" onClick={() => setPresetAssignments({})} className="text-[11px] text-slate-500 hover:text-rose-300 cursor-pointer">清除手动预设（{presetManualCount}）</button>
                  )}
                  {settings.selectedPresetIds.length > 0 && (
                    <button type="button" onClick={() => patchSettings({ selectedPresetIds: [] })} className="text-[11px] text-slate-500 hover:text-slate-200 cursor-pointer">清除勾选</button>
                  )}
                </div>
              </div>
              {units.length > 0 && (
                <div className={`mb-2 rounded-md px-2 py-1.5 text-[11px] ${activeUnit !== null ? 'border border-amber-500/60 bg-amber-500/10 text-amber-200' : 'bg-slate-800/60 text-slate-400'}`}>
                  {activeUnit !== null
                    ? `正在给【第 ${units[activeUnit]?.article + 1} 篇${settings.layout === 'storyboard' || !articles.length ? ` · 片段 ${units[activeUnit]?.part + 1}` : ''}】选预设：点预设名即分配并跳到下一行`
                    : '勾选 = 参与轮流/随机分配；先点右侧某行，再点预设名 = 手动指定'}
                </div>
              )}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input value={presetSearch} onChange={event => setPresetSearch(event.target.value)} placeholder="搜索预设名称 / 分组 / 内容" className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60" />
              </div>
              <div className="max-h-[52vh] min-h-[240px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/40">
                {presetGroups.length === 0 && <p className="p-3 text-center text-slate-500">{presets.length ? '没有匹配的预设' : '预设库为空，可先在「预设库」里创建，或使用下方临时模板'}</p>}
                {presetGroups.map(([category, members]) => {
                  const groupAll = members.every(preset => selectedSet.has(preset.id));
                  const groupSome = !groupAll && members.some(preset => selectedSet.has(preset.id));
                  return (
                    <div key={category} className="border-b border-slate-800 last:border-0">
                      <button type="button" onClick={() => toggleGroup(members)} className="flex w-full items-center gap-2 bg-slate-800/50 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer" title="整组选择：配合「轮流 / 随机」即为预设组">
                        {groupAll ? <CheckSquare className="h-3.5 w-3.5 text-amber-400" /> : <Square className={`h-3.5 w-3.5 ${groupSome ? 'text-amber-400/60' : 'text-slate-500'}`} />}
                        {category}<span className="font-normal text-slate-500">（{members.length}）</span>
                      </button>
                      {members.map(preset => {
                        const used = presetUsage.get(preset.id) || 0;
                        const checked = selectedSet.has(preset.id);
                        return (
                          <div key={preset.id} className={`group flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/60 ${activeUnit !== null ? 'hover:ring-1 hover:ring-inset hover:ring-amber-400/60' : ''}`} title={preset.template}>
                            <input type="checkbox" checked={checked} onChange={() => togglePreset(preset.id)} className="accent-amber-500 cursor-pointer" />
                            <button
                              type="button"
                              onClick={() => activeUnit !== null ? assignPreset(preset.id) : togglePreset(preset.id)}
                              className={`min-w-0 flex-1 truncate text-left text-xs cursor-pointer ${activeUnit !== null ? 'text-amber-100 hover:text-white' : checked ? 'text-amber-200' : 'text-slate-300'}`}
                            >
                              {preset.name}
                            </button>
                            {used > 0 && <span className="shrink-0 rounded bg-emerald-700/80 px-1 text-[10px] font-bold text-white" title={`当前用于 ${used} 行`}>×{used}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-slate-300">
                <input type="checkbox" checked={settings.tempEnabled} onChange={event => patchSettings({ tempEnabled: event.target.checked })} className="accent-amber-500" />
                使用临时模板（不保存到预设库）
              </label>
              {settings.tempEnabled && (
                <textarea value={settings.tempTemplate} onChange={event => patchSettings({ tempTemplate: event.target.value })} rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-[#070d18] p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500/60" placeholder={`用 ${QUICK_CONTENT_PLACEHOLDER} 表示文案位置`} />
              )}
              {missingPlaceholder.length > 0 && (articles.length > 0) && (
                <p className="mt-1 text-[11px] text-amber-300">⚠ {missingPlaceholder.map(preset => preset.name).join('、')} 不含 {QUICK_CONTENT_PLACEHOLDER}，文案不会被填入</p>
              )}

              {activePresets.length > 1 && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-slate-400">多预设</span>
                    <Segmented value={settings.presetMode} onChange={value => patchSettings({ presetMode: value })} options={[
                      { value: 'each', label: '每个各出一套', title: '每张图 × 每个预设，各生成一行' },
                      { value: 'sequence', label: '轮流分配', title: '第 1 张图用第 1 个预设，第 2 张用第 2 个……循环' },
                      { value: 'random', label: '随机分配', title: '每张图随机分配一个已选预设' }
                    ]} />
                  </div>
                  {settings.presetMode === 'each' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-slate-400">排列</span>
                        <Segmented value={settings.rowOrder} onChange={value => patchSettings({ rowOrder: value })} options={[
                          { value: 'unit', label: '同图结果相邻' },
                          { value: 'preset', label: '按预设成套' }
                        ]} />
                      </div>
                      <label className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-slate-400">每个份数</span>
                        <input type="number" min={1} max={100} value={settings.copiesPerPreset} onChange={event => patchSettings({ copiesPerPreset: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" />
                      </label>
                    </>
                  )}
                  {settings.presetMode === 'random' && (
                    <button type="button" onClick={() => setSeed(Date.now())} className="inline-flex items-center gap-1 rounded border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/10 cursor-pointer"><Shuffle className="h-3.5 w-3.5" />重新随机</button>
                  )}
                </div>
              )}
              {activePresets.length === 1 && settings.presetMode === 'each' && (
                <label className="mt-2 flex items-center gap-2">
                  <span className="text-slate-400">每张图份数</span>
                  <input type="number" min={1} max={100} value={settings.copiesPerPreset} onChange={event => patchSettings({ copiesPerPreset: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" />
                </label>
              )}
            </section>
          </div>

          {/* 右侧：结果表格 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5 text-xs">
              <span className="font-medium text-slate-200">{summary}</span>
              <span className="ml-auto text-[11px] text-slate-500">复制格式与原图＋词表格「固定交付复制」一致：{DELIVERY_HEADERS.join('｜')}（无表头）</span>
            </div>
            <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
              <button type="button" disabled={!rows.length} onClick={() => copyRows(copyTarget, selectedRows.length ? '（所选）' : '')} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-400 disabled:opacity-40 cursor-pointer">
                <Copy className="h-3.5 w-3.5" />复制文字{selectedRows.length ? `（${selectedRows.length} 行）` : '（全部）'}
              </button>
              <button type="button" disabled={!rows.length || isCopyingImages} onClick={() => copyImages(copyTarget)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-slate-800 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-slate-700 disabled:opacity-40 cursor-pointer">
                {isCopyingImages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}复制图片{selectedRows.length ? `（${selectedRows.length} 行）` : '（全部）'}
              </button>
              {(Object.keys(promptOverrides).length + Object.keys(groupOverrides).length) > 0 && (
                <button type="button" onClick={() => { setPromptOverrides({}); setGroupOverrides({}); }} className="text-[11px] text-slate-500 hover:text-slate-200 cursor-pointer">撤销全部手改（{Object.keys(promptOverrides).length + Object.keys(groupOverrides).length}）</button>
              )}
              {copiedRowIds.size > 0 && (
                <button type="button" onClick={() => setCopiedRowIds(new Set())} className="text-[11px] text-slate-500 hover:text-slate-200 cursor-pointer">清除已复制标记</button>
              )}
              <span className="ml-auto text-[11px] text-slate-500">勾选行只复制部分；图片组名字和描述词可直接修改</span>
            </div>

            <div ref={tableRef} className="min-h-0 flex-1 overflow-auto">
              {rows.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
                  <Zap className="h-8 w-8 text-amber-500/40" />
                  {!unitResult.units.length ? '先在左侧放入图片或粘贴文案' : '请在左侧选择至少一个预设（或启用临时模板）'}
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[#101a2c] text-[11px] text-slate-400">
                    <tr>
                      <th className="w-8 border-b border-slate-800 px-2 py-2">
                        <input type="checkbox" checked={allSelected} onChange={() => setSelectedRowIds(allSelected ? new Set() : new Set(rows.map(row => row.id)))} className="accent-amber-500" />
                      </th>
                      <th className="w-10 border-b border-slate-800 px-2 py-2 text-left">#</th>
                      <th className="w-20 border-b border-slate-800 px-2 py-2 text-left">图片</th>
                      <th className="w-36 border-b border-slate-800 px-2 py-2 text-left">图片名字</th>
                      <th className="w-48 border-b border-slate-800 px-2 py-2 text-left">图片组名字</th>
                      <th className="min-w-[320px] border-b border-slate-800 px-2 py-2 text-left">最终描述词</th>
                      <th className="w-44 border-b border-slate-800 px-2 py-2 text-left">文案 · 预设</th>
                      <th className="w-20 border-b border-slate-800 px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const copied = copiedRowIds.has(row.id);
                      const edited = promptOverrides[row.id] !== undefined;
                      const newArticle = index > 0 && rows[index - 1].article !== row.article && settings.rowOrder === 'unit';
                      return (
                        <tr
                          key={row.id}
                          data-quick-unit={row.unitIndex}
                          onClick={event => {
                            if ((event.target as HTMLElement).closest('textarea, input, button')) return;
                            setActiveUnit(current => current === row.unitIndex ? null : row.unitIndex);
                          }}
                          className={`align-top cursor-pointer transition ${row.unitIndex === activeUnit ? 'bg-amber-500/15 outline outline-1 -outline-offset-1 outline-amber-400/70' : copied ? 'bg-emerald-950/25' : 'hover:bg-slate-800/30'} ${newArticle ? 'border-t-2 border-t-amber-500/30' : ''}`}
                        >
                          <td className="border-b border-slate-800/70 px-2 py-2 text-center">
                            <input type="checkbox" checked={selectedRowIds.has(row.id)} onChange={() => toggleRow(row.id)} className="accent-amber-500" />
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2 text-slate-500">
                            {index + 1}
                            {copied && <Check className="mt-1 h-3.5 w-3.5 text-emerald-400" />}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2">
                            {row.image ? (
                              <div className="group relative h-[96px] w-[54px]">
                                <button type="button" onClick={() => setActiveUnit(current => current === row.unitIndex ? null : row.unitIndex)} className={`relative block h-[96px] w-[54px] overflow-hidden rounded-md border bg-black cursor-pointer ${row.unitIndex === activeUnit ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-700'}`} title={`${row.image.fullPath}\n点击后在左侧点图更换`}>
                                  <img src={row.image.url} alt={row.image.name} className="h-full w-full object-cover" loading="lazy" />
                                  <span className="absolute inset-0 hidden items-center justify-center bg-black/60 text-[10px] text-white group-hover:flex">换图</span>
                                </button>
                                <button type="button" onClick={() => unassignUnit(row.unitIndex)} className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-slate-900 p-0.5 text-slate-300 ring-1 ring-slate-600 hover:bg-rose-600 hover:text-white group-hover:block cursor-pointer" title="取消此片段的配图"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setActiveUnit(current => current === row.unitIndex ? null : row.unitIndex)} className={`flex h-[96px] w-[54px] items-center justify-center rounded-md border border-dashed text-[10px] cursor-pointer ${row.unitIndex === activeUnit ? 'border-amber-400 bg-amber-500/10 text-amber-200' : 'border-slate-600 text-slate-500 hover:border-amber-400/70 hover:text-amber-200'}`}>
                                {images.length ? '点我选图' : '无图'}
                              </button>
                            )}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2 break-all text-slate-300">
                            {row.image?.name || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2">
                            <input
                              value={getGroupName(row)}
                              onChange={event => setGroupOverrides(current => ({ ...current, [row.id]: event.target.value }))}
                              className={`w-full rounded-md border bg-[#070d18] px-1.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500/60 ${groupOverrides[row.id] !== undefined ? 'border-amber-500/50' : 'border-slate-800'}`}
                            />
                            {groupOverrides[row.id] !== undefined && (
                              <button type="button" onClick={() => setGroupOverrides(current => { const next = { ...current }; delete next[row.id]; return next; })} className="text-[10px] text-amber-300/80 hover:text-amber-200 cursor-pointer">已手改 · 还原</button>
                            )}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2">
                            <textarea
                              value={getPrompt(row)}
                              onChange={event => setPromptOverrides(current => ({ ...current, [row.id]: event.target.value }))}
                              rows={3}
                              className={`w-full resize-y rounded-md border bg-[#070d18] p-1.5 text-xs leading-relaxed text-slate-100 focus:outline-none focus:border-amber-500/60 ${edited ? 'border-amber-500/50' : 'border-slate-800'}`}
                            />
                            {edited && (
                              <button type="button" onClick={() => setPromptOverrides(current => { const next = { ...current }; delete next[row.id]; return next; })} className="text-[10px] text-amber-300/80 hover:text-amber-200 cursor-pointer">已手改 · 还原</button>
                            )}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2">
                            <div className="mb-0.5 text-[10px] text-slate-500">第 {row.article + 1} 篇{settings.layout === 'storyboard' || !articles.length ? ` · 片段 ${row.part + 1}` : ''}</div>
                            <div className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-slate-300">{row.content}</div>
                            <div className="mt-1 flex items-start gap-1">
                              <span className="text-amber-200">{row.preset.name}</span>
                              {row.manualPreset && (
                                <button type="button" onClick={() => clearPresetAssignment(row.unitIndex)} className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300 hover:bg-rose-600 hover:text-white cursor-pointer" title="已手动指定，点击恢复自动分配">手动 ×</button>
                              )}
                            </div>
                            {row.preset.category && <div className="text-[10px] text-slate-500">{row.preset.category}</div>}
                          </td>
                          <td className="border-b border-slate-800/70 px-2 py-2">
                            <div className="flex flex-col gap-1">
                              <button type="button" onClick={() => copyRows([row])} className="rounded border border-amber-600/40 px-1.5 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/10 cursor-pointer">复制文字</button>
                              {row.image && <button type="button" onClick={() => copyRowImage(row)} className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">复制图</button>}
                              <button type="button" onClick={() => copyRowPrompt(row)} className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">只复制词</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {notice && (
          <div className={`pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-medium shadow-lg ${notice.type === 'error' ? 'bg-rose-600 text-white' : notice.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-100'}`}>
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}
