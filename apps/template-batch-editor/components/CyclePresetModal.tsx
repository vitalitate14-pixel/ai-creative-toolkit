import React, { useState, useMemo } from 'react';
import {
  Repeat,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Layers,
  BookOpen,
  RotateCcw,
  CheckSquare,
  Square,
  Info
} from 'lucide-react';
import { TemplatePreset } from '../constants/presetDefaults';

export interface CyclePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: TemplatePreset[];
  totalSegmentsCount: number;
  selectedSegmentsCount: number;
  batchCount: number;
  onApplyCycle: (
    presetIds: string[],
    mode: 'by-row' | 'by-source',
    targetScope: 'all' | 'selected'
  ) => void;
  onResetAllToUnified: () => void;
  onOpenPresetLibrary: () => void;
}

export const CyclePresetModal: React.FC<CyclePresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  totalSegmentsCount,
  selectedSegmentsCount,
  batchCount,
  onApplyCycle,
  onResetAllToUnified,
  onOpenPresetLibrary,
}) => {
  // 选中的预设 ID 列表（有序，决定循环轮换次序）
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(() => {
    // 默认选中前 2-3 个预设（若有）
    return presets.slice(0, Math.min(3, presets.length)).map(p => p.id);
  });

  const [fillMode, setFillMode] = useState<'by-row' | 'by-source'>('by-row');
  const [targetScope, setTargetScope] = useState<'all' | 'selected'>(
    selectedSegmentsCount > 0 ? 'selected' : 'all'
  );

  if (!isOpen) return null;

  const toggleSelectPreset = (id: string) => {
    setSelectedPresetIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setSelectedPresetIds(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= selectedPresetIds.length - 1) return;
    setSelectedPresetIds(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedPresetIds(presets.map(p => p.id));
  };

  const handleClearAll = () => {
    setSelectedPresetIds([]);
  };

  const orderedSelectedPresets = selectedPresetIds
    .map(id => presets.find(p => p.id === id))
    .filter((p): p is TemplatePreset => Boolean(p));

  const handleConfirm = () => {
    if (selectedPresetIds.length === 0) return;
    onApplyCycle(selectedPresetIds, fillMode, targetScope);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0e172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#131f38] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-300 shadow">
              <Repeat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                多预设批量循环填充
                <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                  第五列预设自动轮换
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                勾选多个预设后自动按顺序循环填充到表格行，生成各具风格的最终描述词
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 scrollbar-thin">
          {/* 1. 预设选择区 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  1. 选择参与循环的预设 ({selectedPresetIds.length}/{presets.length})
                </span>
                <span className="text-[11px] text-slate-400">（按勾选次序轮流填充）</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sky-400 hover:text-sky-300 font-medium transition"
                >
                  全选
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-slate-400 hover:text-slate-200 transition"
                >
                  清空
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPresetLibrary();
                  }}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition"
                >
                  <BookOpen className="w-3 h-3" />
                  管理预设库
                </button>
              </div>
            </div>

            {presets.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 bg-[#090f1d] text-slate-400 text-xs">
                暂无预设，请先前往预设库创建或导入常用模板。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin border border-slate-800/80 rounded-xl p-2 bg-[#090f1d]">
                {presets.map(preset => {
                  const isChecked = selectedPresetIds.includes(preset.id);
                  const orderIndex = selectedPresetIds.indexOf(preset.id);
                  return (
                    <div
                      key={preset.id}
                      onClick={() => toggleSelectPreset(preset.id)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer select-none ${
                        isChecked
                          ? 'border-indigo-500/60 bg-indigo-950/30 text-white'
                          : 'border-slate-800 bg-[#0d1527] text-slate-300 hover:border-slate-700 hover:bg-[#111c33]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-indigo-400 shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400 fill-indigo-500/20" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs truncate">{preset.name}</span>
                            {preset.category && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                                {preset.category}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                            {preset.template}
                          </p>
                        </div>
                      </div>

                      {/* 顺序标记与排序按钮 */}
                      {isChecked && (
                        <div className="flex items-center gap-1.5 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center shadow">
                            {orderIndex + 1}
                          </span>
                          <button
                            type="button"
                            disabled={orderIndex === 0}
                            onClick={() => moveUp(orderIndex)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
                            title="向前调整循环顺序"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={orderIndex === selectedPresetIds.length - 1}
                            onClick={() => moveDown(orderIndex)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
                            title="向后调整循环顺序"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. 循环链条预览 */}
          {orderedSelectedPresets.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#111a30] border border-indigo-900/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>循环链条预览（将按此规律持续循环）：</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                {orderedSelectedPresets.map((p, idx) => (
                  <React.Fragment key={p.id}>
                    <span className="px-2 py-1 rounded bg-indigo-950 border border-indigo-700 text-indigo-200 font-semibold shadow-xs">
                      #{idx + 1} {p.name}
                    </span>
                    <span className="text-slate-500 font-bold">➔</span>
                  </React.Fragment>
                ))}
                <span className="px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-400 italic">
                  循环重复...
                </span>
              </div>
            </div>
          )}

          {/* 3. 填充方式与范围 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 填充模式 */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-[#090f1d] space-y-2">
              <span className="text-xs font-bold text-slate-200 block">2. 填充规则</span>
              <label className="flex items-start gap-2 cursor-pointer text-xs p-2 rounded-lg hover:bg-[#111c33] transition">
                <input
                  type="radio"
                  name="fillMode"
                  checked={fillMode === 'by-row'}
                  onChange={() => setFillMode('by-row')}
                  className="mt-0.5 text-indigo-500 focus:ring-indigo-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">按分镜行逐行循环（推荐）</div>
                  <div className="text-[11px] text-slate-400">
                    行 1 用预设 A，行 2 用预设 B，行 3 用预设 C，以此类推
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-xs p-2 rounded-lg hover:bg-[#111c33] transition">
                <input
                  type="radio"
                  name="fillMode"
                  checked={fillMode === 'by-source'}
                  onChange={() => setFillMode('by-source')}
                  className="mt-0.5 text-indigo-500 focus:ring-indigo-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">按文案/篇章整组循环</div>
                  <div className="text-[11px] text-slate-400">
                    文案 1 全部段用预设 A；文案 2 全部段用预设 B；不同篇章换预设
                  </div>
                </div>
              </label>
            </div>

            {/* 目标范围 */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-[#090f1d] space-y-2">
              <span className="text-xs font-bold text-slate-200 block">3. 应用范围</span>
              <label className="flex items-start gap-2 cursor-pointer text-xs p-2 rounded-lg hover:bg-[#111c33] transition">
                <input
                  type="radio"
                  name="targetScope"
                  checked={targetScope === 'all'}
                  onChange={() => setTargetScope('all')}
                  className="mt-0.5 text-indigo-500 focus:ring-indigo-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">应用于全部表格行</div>
                  <div className="text-[11px] text-slate-400">共 {totalSegmentsCount} 行分镜</div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 text-xs p-2 rounded-lg transition ${
                  selectedSegmentsCount > 0
                    ? 'cursor-pointer hover:bg-[#111c33]'
                    : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <input
                  type="radio"
                  name="targetScope"
                  disabled={selectedSegmentsCount === 0}
                  checked={targetScope === 'selected'}
                  onChange={() => setTargetScope('selected')}
                  className="mt-0.5 text-indigo-500 focus:ring-indigo-400"
                />
                <div>
                  <div className="font-semibold text-slate-200">
                    仅应用于当前选中的行 ({selectedSegmentsCount} 行)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedSegmentsCount > 0 ? '只对勾选的行生效' : '当前表格未勾选任何行'}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-[#131f38] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('确定要清除所有行的独立预设，全部恢复为“使用统一模板”吗？')) {
                onResetAllToUnified();
                onClose();
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition py-1.5 px-2.5 rounded hover:bg-rose-950/40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复全部使用统一模板</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium transition"
            >
              取消
            </button>
            <button
              type="button"
              disabled={selectedPresetIds.length === 0}
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition"
            >
              <Repeat className="w-4 h-4" />
              <span>立即循环填充 ({selectedPresetIds.length} 个预设)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
