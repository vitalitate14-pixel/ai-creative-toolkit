import { mergeSameNamePresetGroups } from '../utils/mergePresetGroups';
import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Copy,
  Trash2,
  Edit3,
  Check,
  CheckSquare,
  Square,
  Download,
  Upload,
  X,
  FileInput,
  Sparkles,
  RotateCcw,
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  ClipboardPaste,
  Zap,
  Repeat
} from 'lucide-react';

import {
  TemplatePreset,
  CONTENT_PLACEHOLDER,
  QUOTED_CONTENT_PLACEHOLDER,
  DEFAULT_TEMPLATE_PRESETS
} from '../constants/presetDefaults';

import {
  detectAndInsertPlaceholder,
  parseGoogleSheetsPresets,
  ParsedSheetPreset
} from '../utils/sheetPresetParser';

export interface PresetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets?: TemplatePreset[];
  onSavePresets?: (presets: TemplatePreset[]) => void;
  onApplyPreset?: (preset: TemplatePreset) => void;
  currentTemplate?: string;
  multiPresetIds?: string[];
  onUpdateMultiPresetIds?: (ids: string[]) => void;
  onCycleFillPresets?: (presetIds: string[], mode: 'by-row' | 'by-source') => void;
}

export const PresetLibraryModal: React.FC<PresetLibraryModalProps> = ({
  isOpen,
  onClose,
  presets = [],
  onSavePresets,
  onApplyPreset,
  currentTemplate = '',
  multiPresetIds = [],
  onUpdateMultiPresetIds,
  onCycleFillPresets,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingPreset, setEditingPreset] = useState<TemplatePreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Google Sheets batch paste states
  const [isPastingSheet, setIsPastingSheet] = useState(false);
  const [sheetPasteRaw, setSheetPasteRaw] = useState('');
  const [sheetUseQuoted, setSheetUseQuoted] = useState(true);
  const [sheetImportMode, setSheetImportMode] = useState<'append' | 'replace'>('append');
  const [sheetCategory, setSheetCategory] = useState('表格导入');

  // Form states for create/edit
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTemplate, setFormTemplate] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    presets.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [presets]);

  const filteredPresets = useMemo(() => {
    return presets.filter(item => {
      const matchSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.template.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [presets, searchTerm, selectedCategory]);

  // Real-time parsed Google Sheets presets
  const parsedSheetPresets = useMemo(() => {
    if (!sheetPasteRaw.trim()) return [];
    return parseGoogleSheetsPresets(sheetPasteRaw, {
      autoInsertPlaceholder: true,
      useQuotedPlaceholder: sheetUseQuoted,
      defaultCategory: sheetCategory.trim() || '表格导入'
    });
  }, [sheetPasteRaw, sheetUseQuoted, sheetCategory]);

  const handleConfirmSheetImport = () => {
    if (!parsedSheetPresets.length) return;
    const toImport: TemplatePreset[] = parsedSheetPresets.map(p => ({
      id: p.id,
      name: p.name,
      template: p.template,
      category: p.category,
      updatedAt: Date.now()
    }));

    if (sheetImportMode === 'replace') {
      if (!confirm(`确定要覆盖现有预设吗？当前 ${presets.length} 个预设将被替换为 ${toImport.length} 个表格预设。`)) return;
      onSavePresets?.(toImport);
      showStatus(`已使用表格导入的 ${toImport.length} 个预设覆盖预设库`);
    } else {
      onSavePresets?.([...toImport, ...presets]);
      showStatus(`已从表格追加导入 ${toImport.length} 个预设`);
    }

    setIsPastingSheet(false);
    setSheetPasteRaw('');
  };

  const handleReadClipboardForSheet = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setSheetPasteRaw(text);
          showStatus('已读取剪贴板内容并完成解析');
          return;
        }
      }
    } catch {}
    alert('请直接在下方文本框中按 Ctrl+V 或 Cmd+V 粘贴表格内容');
  };

  const handlePasteIntoForm = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: 'name' | 'template'
  ) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;

    // Check if user copied 2 columns from Google Sheets (contains Tab \t)
    if (text.includes('\t')) {
      e.preventDefault();
      const [col1, ...rest] = text.split('\t');
      const col2 = rest.join('\t');
      if (col1.trim()) {
        setFormName(col1.trim());
      }
      if (col2.trim()) {
        const processed = detectAndInsertPlaceholder(col2.trim(), QUOTED_CONTENT_PLACEHOLDER);
        setFormTemplate(processed.template);
      }
      showStatus('已自动将第1列设为预设名称，第2列设为模板，并在首个空行/断行处插入内容块');
      return;
    }

    // If pasted directly into template and has line breaks without placeholder
    if (field === 'template' && !text.includes(CONTENT_PLACEHOLDER) && /[\r\n]/.test(text)) {
      e.preventDefault();
      const processed = detectAndInsertPlaceholder(text, QUOTED_CONTENT_PLACEHOLDER);
      const el = textareaRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = formTemplate.slice(0, start) + processed.template + formTemplate.slice(end);
        setFormTemplate(next);
      } else {
        setFormTemplate(prev => (prev ? `${prev}\n${processed.template}` : processed.template));
      }
      showStatus('已自动识别并在首个空行/断行处插入内容块');
    }
  };

  const autoDetectFirstBreakInForm = () => {
    if (!formTemplate.trim()) return;
    const processed = detectAndInsertPlaceholder(formTemplate, QUOTED_CONTENT_PLACEHOLDER);
    setFormTemplate(processed.template);
    if (processed.insertionType === 'empty-line') {
      showStatus('已在第 1 个空行处插入内容块');
    } else if (processed.insertionType === 'line-break') {
      showStatus('已在第 1 个断行换行处插入内容块');
    } else if (processed.insertionType === 'already-present') {
      showStatus('当前模板已包含内容块占位符');
    } else {
      showStatus('未检测到换行，已在末尾添加内容块');
    }
  };

  if (!isOpen) return null;

  const startCreate = () => {
    setIsPastingSheet(false);
    setEditingPreset(null);
    setFormName('');
    setFormCategory(selectedCategory !== 'all' ? selectedCategory : '通用');
    setFormTemplate(currentTemplate || `A cinematic shot, style details, character saying: ${QUOTED_CONTENT_PLACEHOLDER}`);
    setIsCreating(true);
  };

  const startEdit = (preset: TemplatePreset) => {
    setIsPastingSheet(false);
    setIsCreating(false);
    setEditingPreset(preset);
    setFormName(preset.name);
    setFormCategory(preset.category || '通用');
    setFormTemplate(preset.template);
  };

  const saveForm = () => {
    if (!formName.trim()) {
      alert('请输入预设名称');
      return;
    }
    if (!formTemplate.includes(CONTENT_PLACEHOLDER)) {
      alert(`描述词模板中必须包含 ${CONTENT_PLACEHOLDER} 占位符`);
      return;
    }

    if (editingPreset) {
      const updated = presets.map(p =>
        p.id === editingPreset.id
          ? { ...p, name: formName.trim(), category: formCategory.trim() || '通用', template: formTemplate, updatedAt: Date.now() }
          : p
      );
      onSavePresets?.(updated);
      showStatus(`已更新预设「${formName.trim()}」`);
    } else {
      const newPreset: TemplatePreset = {
        id: `preset-${Date.now()}`,
        name: formName.trim(),
        category: formCategory.trim() || '通用',
        template: formTemplate,
        updatedAt: Date.now()
      };
      onSavePresets?.([newPreset, ...presets]);
      showStatus(`已新增预设「${formName.trim()}」`);
    }

    setEditingPreset(null);
    setIsCreating(false);
  };

  const insertPlaceholderIntoForm = () => {
    const el = textareaRef.current;
    if (!el) {
      setFormTemplate(prev => prev + QUOTED_CONTENT_PLACEHOLDER);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = formTemplate.slice(0, start) + QUOTED_CONTENT_PLACEHOLDER + formTemplate.slice(end);
    setFormTemplate(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + QUOTED_CONTENT_PLACEHOLDER.length, start + QUOTED_CONTENT_PLACEHOLDER.length);
    }, 0);
  };

  const deletePreset = (id: string, name: string) => {
    if (!confirm(`确定要删除预设「${name}」吗？`)) return;
    const next = presets.filter(p => p.id !== id);
    onSavePresets?.(next);
    onUpdateMultiPresetIds?.(multiPresetIds.filter(item => item !== id));
    showStatus(`已删除预设「${name}」`);
  };

  const duplicatePreset = (preset: TemplatePreset) => {
    const duplicated: TemplatePreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      name: `${preset.name} (副本)`,
      updatedAt: Date.now()
    };
    onSavePresets?.([duplicated, ...presets]);
    showStatus(`已复制预设「${preset.name}」`);
  };

  const toggleMultiSelect = (id: string) => {
    if (multiPresetIds.includes(id)) {
      onUpdateMultiPresetIds?.(multiPresetIds.filter(item => item !== id));
    } else {
      onUpdateMultiPresetIds?.([...multiPresetIds, id]);
    }
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredPresets.map(p => p.id);
    const set = new Set([...multiPresetIds, ...allFilteredIds]);
    onUpdateMultiPresetIds?.(Array.from(set));
  };

  const clearMultiSelect = () => {
    onUpdateMultiPresetIds?.([]);
  };

  const selectedPresetCount = presets.filter(p => multiPresetIds.includes(p.id)).length;

  const invertFilteredSelection = () => {
    const next = new Set(multiPresetIds);
    filteredPresets.forEach(p => next.has(p.id) ? next.delete(p.id) : next.add(p.id));
    onUpdateMultiPresetIds?.([...next]);
  };

  const mergePresetGroups = () => {
    if (!onSavePresets) return;
    const result = mergeSameNamePresetGroups(presets);
    onSavePresets(result.presets);
    setSelectedCategory('all');
    alert(`同名预设组已合并，${result.renamed} 个重名预设已自动重命名。所有预设和原有分配均保留。`);
  };

  const deletePresets = (all: boolean) => {
    const ids = new Set(all ? presets.map(p => p.id) : multiPresetIds);
    const count = presets.filter(p => ids.has(p.id)).length;
    if (!count || !onSavePresets) return;
    if (!confirm(all
      ? `确定删除预设库中的全部 ${count} 个预设吗？包括当前搜索和分类之外的预设。`
      : `确定删除选中的 ${count} 个预设吗？`)) return;
    onSavePresets(presets.filter(p => !ids.has(p.id)));
    onUpdateMultiPresetIds?.(multiPresetIds.filter(id => !ids.has(id)));
    if (editingPreset && ids.has(editingPreset.id)) setEditingPreset(null);
    if (all) { setSelectedCategory('all'); setSearchTerm(''); }
    showStatus(`已删除 ${count} 个预设`);
  };

  const restoreDefaultPresets = () => {
    if (!confirm('是否载入官方推荐预设集？已有的同名预设将被保留。')) return;
    const existingIds = new Set(presets.map(p => p.id));
    const toAdd = DEFAULT_TEMPLATE_PRESETS.filter(p => !existingIds.has(p.id));
    const combined = [...presets, ...toAdd];
    onSavePresets?.(combined);
    showStatus(`已载入 ${toAdd.length} 个推荐预设`);
  };

  const exportPresetsJson = () => {
    const jsonStr = JSON.stringify(presets, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `描述词预设库备份_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('已导出预设库备份 JSON');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('预设文件格式不正确，必须为预设数组');
        const valid = parsed.filter(
          item => item && typeof item.name === 'string' && typeof item.template === 'string'
        ).map((item, idx) => ({
          id: item.id || `preset-import-${Date.now()}-${idx}`,
          name: item.name,
          template: item.template,
          category: item.category || '导入预设',
          updatedAt: item.updatedAt || Date.now()
        }));

        if (!valid.length) {
          alert('未能识别到有效的预设数据');
          return;
        }

        // Merge without duplicate IDs
        const map = new Map<string, TemplatePreset>();
        presets.forEach(p => map.set(p.id, p));
        valid.forEach(p => map.set(p.id, p));
        const merged = Array.from(map.values());
        onSavePresets?.(merged);
        showStatus(`成功导入 ${valid.length} 个预设`);
      } catch (err: any) {
        alert('导入失败: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Helper to render template with highlighted {{内容}}
  const renderTemplateHighlight = (template: string) => {
    if (!template.includes(CONTENT_PLACEHOLDER)) {
      return <span>{template}</span>;
    }
    const parts = template.split(CONTENT_PLACEHOLDER);
    return (
      <span>
        {parts.map((part, idx) => (
          <React.Fragment key={idx}>
            {part}
            {idx < parts.length - 1 && (
              <span className="inline-block px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {CONTENT_PLACEHOLDER}
              </span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#0f172a] text-slate-100 rounded-xl shadow-2xl border border-slate-700 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#1e293b]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">描述词预设库</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {presets.length} 个预设
                </span>
                {multiPresetIds.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                    已勾选 {multiPresetIds.length} 个并行填充
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                支持搜索、编辑与备份；勾选多个预设可一键对同一个文案组批量填充生成对应描述词
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setEditingPreset(null);
                setIsPastingSheet(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
              title="从谷歌表格批量粘贴预设（第1列预设名称，第2列预设内容，第3列分组名字）"
            >
              <FileSpreadsheet className="w-4 h-4" />
              表格批量粘贴
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              新建预设
            </button>
            <button
              type="button"
              onClick={exportPresetsJson}
              title="导出预设备份 JSON"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="导入预设 JSON 文件"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              <Upload className="w-3.5 h-3.5" />
              导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={restoreDefaultPresets}
              title="载入推荐预设"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-amber-300 text-xs font-medium transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              推荐库
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Message Notification */}
        {statusMessage && (
          <div className="px-6 py-2 bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Toolbar & Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-800 bg-[#162032] flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="搜索预设名称或描述词内容..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#0b1220] border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-sm py-0.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {cat === 'all' ? '全部' : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">已选 {selectedPresetCount} / {presets.length}</span>
            <button type="button" onClick={() => onUpdateMultiPresetIds?.(presets.map(p => p.id))} disabled={!presets.length} className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40">全选</button>
            {(searchTerm || selectedCategory !== 'all') && <button type="button" onClick={selectAllFiltered} className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white">全选当前 ({filteredPresets.length})</button>}
            <button type="button" onClick={invertFilteredSelection} disabled={!filteredPresets.length} title="反选当前搜索和分类中显示的预设" className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40">反选{searchTerm || selectedCategory !== 'all' ? '当前' : ''}</button>
            <button type="button" onClick={clearMultiSelect} disabled={!multiPresetIds.length} className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40">取消选择</button>
            <button type="button" onClick={() => deletePresets(false)} disabled={!selectedPresetCount || !onSavePresets} className="px-2.5 py-1.5 rounded border border-rose-700 bg-rose-950 text-rose-200 hover:bg-rose-900 disabled:opacity-40">删除选中 ({selectedPresetCount})</button>
            <button type="button" onClick={mergePresetGroups} disabled={!presets.length || !onSavePresets} title="合并同名组，组内重名预设自动加编号，保留原预设ID" className="px-2.5 py-1.5 rounded border border-violet-600 bg-violet-950 text-violet-200 hover:bg-violet-900 disabled:opacity-40">合并同名预设组</button>
            <button type="button" onClick={() => deletePresets(true)} disabled={!presets.length || !onSavePresets} className="px-2.5 py-1.5 rounded border border-red-600 bg-red-950 text-red-200 hover:bg-red-900 disabled:opacity-40">删除所有 ({presets.length})</button>
          </div>
        </div>

        {/* Modal Main Body (Split into Sheet Paste, Single Edit, or List Mode) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {isPastingSheet ? (
            /* Google Sheets Batch Paste Panel */
            <div className="bg-[#1e293b] border border-emerald-500/50 rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">从谷歌表格批量粘贴导入预设</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      表格格式：<strong className="text-emerald-300">第 1 列为预设名称</strong>，<strong className="text-emerald-300">第 2 列为预设内容</strong>，<strong className="text-emerald-300">第 3 列为分组名字</strong>（可留空）。系统将自动在内容的<strong className="text-amber-300">【第一个空行或断行】</strong>处注入文案占位符 <code className="text-amber-300 font-bold bg-amber-950/60 px-1 py-0.5 rounded">{QUOTED_CONTENT_PLACEHOLDER}</code>。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsPastingSheet(false); setSheetPasteRaw(''); }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  取消返回
                </button>
              </div>

              {/* Paste Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <span>在此直接粘贴从表格复制的数据 (Ctrl+V / Cmd+V)：</span>
                    {parsedSheetPresets.length > 0 && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                        已成功识别 {parsedSheetPresets.length} 条预设
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReadClipboardForSheet}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      读取剪贴板
                    </button>
                    {sheetPasteRaw && (
                      <button
                        type="button"
                        onClick={() => setSheetPasteRaw('')}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  value={sheetPasteRaw}
                  onChange={e => setSheetPasteRaw(e.target.value)}
                  rows={6}
                  placeholder={`从谷歌表格直接复制三列粘贴到这里，例如：\n电影特写\tA cinematic close-up shot of intense expression\n\nhighly detailed skin texture, 8k\t人物特写\n赛博霓虹\tCyberpunk futuristic street at rainy night\nneon light reflections, teal and orange\t氛围场景`}
                  className="w-full p-3 rounded-lg bg-[#0b1220] border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500 resize-y leading-relaxed"
                />
              </div>

              {/* Configuration Options Bar */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-[#142033] border border-slate-700/80 flex-wrap text-xs">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">占位符格式：</span>
                    <label className="inline-flex items-center gap-1 text-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="sheetQuote"
                        checked={sheetUseQuoted}
                        onChange={() => setSheetUseQuoted(true)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>带双引号 <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">"{CONTENT_PLACEHOLDER}"</code></span>
                    </label>
                    <label className="inline-flex items-center gap-1 text-slate-200 cursor-pointer ml-2">
                      <input
                        type="radio"
                        name="sheetQuote"
                        checked={!sheetUseQuoted}
                        onChange={() => setSheetUseQuoted(false)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>无引号 <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">{CONTENT_PLACEHOLDER}</code></span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">导入模式：</span>
                    <select
                      value={sheetImportMode}
                      onChange={e => setSheetImportMode(e.target.value as 'append' | 'replace')}
                      className="rounded bg-[#0b1220] border border-slate-600 text-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="append">追加到现有预设库</option>
                      <option value="replace">替换覆盖当前全部预设</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">预设分类：</span>
                    <input
                      type="text"
                      value={sheetCategory}
                      onChange={e => setSheetCategory(e.target.value)}
                      className="rounded bg-[#0b1220] border border-slate-600 text-slate-200 px-2 py-1 text-xs w-28"
                      placeholder="默认分类"
                    />
                  </div>
                </div>
              </div>

              {/* Live Parsed Preview Table */}
              {parsedSheetPresets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <span>识别预览与断行注入效果（共 {parsedSheetPresets.length} 条）</span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        — 黄色高亮部分为系统自动识别并插入文案的位置
                      </span>
                    </h5>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-[#0c1424]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-[#162238] border-b border-slate-700 text-slate-300">
                        <tr>
                          <th className="p-2.5 w-12 text-center">序号</th>
                          <th className="p-2.5 w-40">第1列：预设名称</th>
                          <th className="p-2.5 w-24">分类</th>
                          <th className="p-2.5">第2列：解析后模板（自动注入文案处）</th>
                          <th className="p-2.5 w-36 text-center">注入识别状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {parsedSheetPresets.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-2.5 text-center text-slate-500 font-mono">{idx + 1}</td>
                            <td className="p-2.5 font-semibold text-white truncate" title={item.name}>
                              {item.name}
                            </td>
                            <td className="p-2.5 text-slate-400">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700">
                                {item.category || sheetCategory}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] leading-relaxed break-words">
                              {renderTemplateHighlight(item.template)}
                            </td>
                            <td className="p-2.5 text-center">
                              {item.insertionType === 'empty-line' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  首个空行插入
                                </span>
                              )}
                              {item.insertionType === 'line-break' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                  首个换行插入
                                </span>
                              )}
                              {item.insertionType === 'already-present' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-700/60 text-slate-300 border border-slate-600">
                                  原已有占位符
                                </span>
                              )}
                              {item.insertionType === 'appended' && (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  末尾追加插入
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => { setIsPastingSheet(false); setSheetPasteRaw(''); }}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium"
                >
                  取消返回
                </button>

                <button
                  type="button"
                  disabled={parsedSheetPresets.length === 0}
                  onClick={handleConfirmSheetImport}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold shadow transition"
                >
                  <Check className="w-4 h-4" />
                  确认导入这 {parsedSheetPresets.length} 个预设
                </button>
              </div>
            </div>
          ) : (isCreating || editingPreset) ? (
            /* Create / Edit Form */
            <div className="bg-[#1e293b] border border-blue-500/50 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-bold text-white">
                    {isCreating ? '新建描述词预设' : `编辑预设: ${editingPreset?.name}`}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setEditingPreset(null); }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  取消返回
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    预设名称 * <span className="text-slate-500 font-normal">(支持直接粘贴表格行)</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    onPaste={e => handlePasteIntoForm(e, 'name')}
                    placeholder="例如：电影质感·近景特写"
                    className="w-full px-3 py-2 rounded-lg bg-[#0f172a] border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">分类标签</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="例如：电影写实 / 二次元 / 广告电商"
                    className="w-full px-3 py-2 rounded-lg bg-[#0f172a] border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    描述词模板内容 * (必须包含 {CONTENT_PLACEHOLDER})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={autoDetectFirstBreakInForm}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs font-semibold transition"
                      title="自动在第 1 个空行或断行处添加 {{内容}} 占位符"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      空行/断行设为内容块
                    </button>
                    <button
                      type="button"
                      onClick={insertPlaceholderIntoForm}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-semibold transition"
                    >
                      <FileInput className="w-3.5 h-3.5" />
                      在光标处插入 {QUOTED_CONTENT_PLACEHOLDER}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  value={formTemplate}
                  onChange={e => setFormTemplate(e.target.value)}
                  onPaste={e => handlePasteIntoForm(e, 'template')}
                  rows={5}
                  placeholder="在此输入完整的提示词模板，并将光标移动到台词/文案应该出现的位置，点击上方按钮插入内容块；粘贴时会自动将首个空行/断行转为内容块"
                  className="w-full p-3 rounded-lg bg-[#0f172a] border border-slate-700 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500 resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {formTemplate.includes(CONTENT_PLACEHOLDER) ? (
                    <span className="text-emerald-400 font-medium">✓ 已成功包含内容块 {CONTENT_PLACEHOLDER}</span>
                  ) : (
                    <span className="text-rose-400 font-medium">⚠ 缺少内容块 {CONTENT_PLACEHOLDER}，拆分文案将无法注入</span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setEditingPreset(null); }}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveForm}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition"
                >
                  保存预设
                </button>
              </div>
            </div>
          ) : null}

          {/* Preset Cards List */}
          {filteredPresets.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <Layers className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">未找到符合条件的预设</p>
              <p className="text-xs text-slate-500 mt-1">您可以点击上方“新建预设”或“推荐库”导入常用模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredPresets.map(preset => {
                const isCheckedForMulti = multiPresetIds.includes(preset.id);
                return (
                  <div
                    key={preset.id}
                    className={`rounded-xl border transition-all p-4 ${
                      isCheckedForMulti
                        ? 'border-emerald-500/60 bg-[#14233a]'
                        : 'border-slate-800 bg-[#141e30] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Multi-select checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleMultiSelect(preset.id)}
                          className="mt-0.5 text-slate-400 hover:text-emerald-400 transition"
                          title={isCheckedForMulti ? '取消勾选该预设' : '勾选该预设用于批量并行填充'}
                        >
                          {isCheckedForMulti ? (
                            <CheckSquare className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500 hover:text-slate-300" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h4 className="text-sm font-bold text-white truncate">{preset.name}</h4>
                            {preset.category && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                {preset.category}
                              </span>
                            )}
                            {isCheckedForMulti && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                已选入并行填充
                              </span>
                            )}
                          </div>

                          <div className="p-2.5 rounded-lg bg-[#0a101d] border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed break-words line-clamp-3">
                            {renderTemplateHighlight(preset.template)}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 self-center">
                        <button
                          type="button"
                          onClick={() => {
                            onApplyPreset?.(preset);
                            showStatus(`已应用「${preset.name}」为主描述词模板`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-semibold transition"
                          title="作为当前统一主模板"
                        >
                          应用模板
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(preset)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                          title="编辑预设"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicatePreset(preset)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                          title="复制为副本"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePreset(preset.id, preset.name)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                          title="删除预设"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-[#1e293b] flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>支持按住 Ctrl/Cmd 快速编辑</span>
            {multiPresetIds.length > 0 && (
              <span className="font-semibold text-emerald-400">
                · 当前已选 {multiPresetIds.length} 个预设进行并行填充
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {multiPresetIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCycleFillPresets?.(multiPresetIds, 'by-row');
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                  title="将勾选的预设按表格分镜行依次循环填充"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>循环填充到分镜行 ({multiPresetIds.length} 个)</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition"
                  title="保持勾选并启用多列并行模式"
                >
                  多列并行展示
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
