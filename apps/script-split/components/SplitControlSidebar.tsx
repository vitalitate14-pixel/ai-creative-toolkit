import React, { useState } from 'react';
import {
  Mic,
  Zap,
  Sliders,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Settings,
  Quote,
  AlignLeft,
  FileText,
  ListOrdered,
  HelpCircle
} from 'lucide-react';
import { SplitUnit, TemplateSplitStrategy } from '../types';

export interface SplitControlSidebarProps {
  splitUnit: SplitUnit;
  setSplitUnit: (unit: SplitUnit) => void;
  splitMinimum: number;
  setSplitMinimum: (min: number) => void;
  splitMaximum: number;
  setSplitMaximum: (max: number) => void;
  templateSplitStrategy: TemplateSplitStrategy;
  setTemplateSplitStrategy: (strat: TemplateSplitStrategy) => void;
  keepSentences: boolean;
  setKeepSentences: (keep: boolean) => void;
  sentencePauseOnly: boolean;
  setSentencePauseOnly: (pauseOnly: boolean) => void;
  allowTolerance: boolean;
  setAllowTolerance: (allow: boolean) => void;
  splitTolerance: number;
  setSplitTolerance: (tol: number) => void;
  lineWidth: number;
  setLineWidth: (w: number) => void;
  quoteSplitSegments: boolean;
  setQuoteSplitSegments: (q: boolean) => void;
  lowercaseSplitOutput: boolean;
  setLowercaseSplitOutput: (lc: boolean) => void;
  includeBatchTextNumbering: boolean;
  setIncludeBatchTextNumbering: (val: boolean) => void;
  includeBatchPromptNumbering: boolean;
  setIncludeBatchPromptNumbering: (val: boolean) => void;
  includeBatchEmptyLines: boolean;
  setIncludeBatchEmptyLines: (val: boolean) => void;
  batchTemplateMode: boolean;
  setBatchTemplateMode: (val: boolean) => void;
  onRunSplit: () => void;
  onRun8sSermonSplit: () => void;
  onApply8sPreset: () => void;
}

export const SplitControlSidebar: React.FC<SplitControlSidebarProps> = ({
  splitUnit,
  setSplitUnit,
  splitMinimum,
  setSplitMinimum,
  splitMaximum,
  setSplitMaximum,
  templateSplitStrategy,
  setTemplateSplitStrategy,
  keepSentences,
  setKeepSentences,
  sentencePauseOnly,
  setSentencePauseOnly,
  allowTolerance,
  setAllowTolerance,
  splitTolerance,
  setSplitTolerance,
  lineWidth,
  setLineWidth,
  quoteSplitSegments,
  setQuoteSplitSegments,
  lowercaseSplitOutput,
  setLowercaseSplitOutput,
  includeBatchTextNumbering,
  setIncludeBatchTextNumbering,
  includeBatchPromptNumbering,
  setIncludeBatchPromptNumbering,
  includeBatchEmptyLines,
  setIncludeBatchEmptyLines,
  batchTemplateMode,
  setBatchTemplateMode,
  onRunSplit,
  onRun8sSermonSplit,
  onApply8sPreset
}) => {
  const [showAdvancedExport, setShowAdvancedExport] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-3 bg-[#0d1629] text-slate-200 border-t border-slate-800">
      {/* 模块标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>拆分参数与控制</span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Control Panel</span>
      </div>

      {/* 1. 核心操作大按钮 */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRun8sSermonSplit}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-bold text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-950/40 border border-amber-300/50 transition cursor-pointer"
          title="消除所有换行、数字全转英文单词、按8秒朗读语速(16~20词)自然断句并加双引号引用"
        >
          <Mic className="w-4 h-4 text-slate-950" />
          <span>🎙️ 8秒讲道口播拆分</span>
        </button>

        <button
          type="button"
          onClick={onRunSplit}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/40 border border-blue-400/30 transition cursor-pointer"
          title="按下方设定的自定义范围与规则执行拆分"
        >
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          <span>⚡ 按设置开始拆分</span>
        </button>
      </div>

      {/* 2. 预设模式快捷切换 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2 space-y-2">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span>拆分策略</span>
          <button
            type="button"
            onClick={onApply8sPreset}
            className="text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-600/40 transition"
            title="一键应用 8 秒讲道口播标准预设 (16~20词/段，优先停顿断句)"
          >
            一键载入8s预设
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setTemplateSplitStrategy('range')}
            className={`py-1.5 px-2 rounded font-medium transition text-center ${
              templateSplitStrategy === 'range'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-[#182645] text-slate-400 hover:text-slate-200 hover:bg-[#1e3057]'
            }`}
            title="范围优先：在最小与最大数量范围内，尽量靠近最大值拆分，减少碎片段落"
          >
            范围优先 (尽量少拆)
          </button>
          <button
            type="button"
            onClick={() => setTemplateSplitStrategy('punctuation')}
            className={`py-1.5 px-2 rounded font-medium transition text-center ${
              templateSplitStrategy === 'punctuation'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'bg-[#182645] text-slate-400 hover:text-slate-200 hover:bg-[#1e3057]'
            }`}
            title="标点强制：达到最小数量后，立即在遇到标点处拆分"
          >
            标点强制 (遇标即拆)
          </button>
        </div>
      </div>

      {/* 3. 长度与单位设置 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
          <span>分段长度目标</span>
          <select
            className="border border-slate-600 rounded px-1.5 py-0.5 bg-[#182645] text-sky-300 font-medium text-[11px] outline-none"
            value={splitUnit}
            onChange={e => setSplitUnit(e.target.value as SplitUnit)}
          >
            <option value="words">按 单词数 (Words)</option>
            <option value="characters">按 字符数 (Chars)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">最小数量</span>
            <input
              type="number"
              min="1"
              value={splitMinimum}
              onChange={e => setSplitMinimum(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border border-slate-600 rounded px-2 py-1 bg-[#182645] text-slate-100 font-mono text-center outline-none focus:border-sky-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400">最大数量</span>
            <input
              type="number"
              min="1"
              value={splitMaximum}
              onChange={e => setSplitMaximum(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border border-slate-600 rounded px-2 py-1 bg-[#182645] text-slate-100 font-mono text-center outline-none focus:border-sky-400"
            />
          </div>
        </div>

        {/* 浮动容差 */}
        <div className="pt-1 flex items-center justify-between text-xs text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowTolerance}
              onChange={e => setAllowTolerance(e.target.checked)}
              className="rounded border-slate-600 text-blue-600 focus:ring-0"
            />
            <span>允许按标点浮动</span>
          </label>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-400">±</span>
            <input
              type="number"
              min="0"
              disabled={!allowTolerance}
              value={splitTolerance}
              onChange={e => setSplitTolerance(Math.max(0, Number(e.target.value) || 0))}
              className="w-12 border border-slate-600 rounded px-1.5 py-0.5 bg-[#182645] text-slate-100 font-mono text-center outline-none disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      {/* 4. 自然停顿与句读开关 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2.5 space-y-2 text-xs">
        <div className="text-[11px] font-semibold text-slate-300">标点停顿与断句</div>
        
        <label className={`flex items-center gap-2 cursor-pointer select-none ${templateSplitStrategy === 'punctuation' ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            disabled={templateSplitStrategy === 'punctuation'}
            checked={keepSentences}
            onChange={e => setKeepSentences(e.target.checked)}
            className="rounded border-slate-600 text-blue-600"
          />
          <span className="text-[11px] text-slate-300">优先按停顿标点拆分</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none" title="只在逗号、句号、问号、感叹号、分号处断句；冒号、引号、括号不断开">
          <input
            type="checkbox"
            checked={sentencePauseOnly}
            onChange={e => setSentencePauseOnly(e.target.checked)}
            className="rounded border-slate-600 text-blue-600"
          />
          <span className="text-[11px] text-slate-300">仅按句读标点拆分 (防冒号误断)</span>
        </label>
      </div>

      {/* 5. 格式与引号设置 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2.5 space-y-2 text-xs">
        <div className="text-[11px] font-semibold text-slate-300">导出格式与排版</div>

        <label className="flex items-center gap-2 cursor-pointer select-none" title="复制和导出时，为单行拆分片段自动包裹双引号">
          <input
            type="checkbox"
            checked={quoteSplitSegments}
            onChange={e => setQuoteSplitSegments(e.target.checked)}
            className="rounded border-slate-600 text-blue-600"
          />
          <span className="text-[11px] text-slate-300 flex items-center gap-1">
            <Quote className="w-3 h-3 text-cyan-400" />
            单行片段自动加双引号 <code className="text-[10px] text-cyan-300">""</code>
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowercaseSplitOutput}
            onChange={e => setLowercaseSplitOutput(e.target.checked)}
            className="rounded border-slate-600 text-blue-600"
          />
          <span className="text-[11px] text-slate-300">文案输出全小写</span>
        </label>

        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
          <span className="text-slate-400">自动断行每行字符</span>
          <input
            type="number"
            min="1"
            value={lineWidth}
            onChange={e => setLineWidth(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 border border-slate-600 rounded px-1.5 py-0.5 bg-[#182645] text-slate-100 font-mono text-center outline-none"
          />
        </div>
      </div>

      {/* 6. 高级整篇导出与批量设置（可折叠） */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setShowAdvancedExport(!showAdvancedExport)}
          className="w-full px-2.5 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-300 hover:bg-[#182645] transition cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-indigo-400" />
            <span>整篇复制与批量模式</span>
          </span>
          {showAdvancedExport ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        {showAdvancedExport && (
          <div className="p-2.5 pt-1 space-y-2 border-t border-slate-800 text-[11px] bg-[#0e172a]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={batchTemplateMode}
                onChange={e => setBatchTemplateMode(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span className="text-slate-200 font-medium">启用批量多篇文案模式</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBatchTextNumbering}
                onChange={e => setIncludeBatchTextNumbering(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span className="text-slate-300">整篇文案每段加编号 (1. 2.)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBatchPromptNumbering}
                onChange={e => setIncludeBatchPromptNumbering(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span className="text-slate-300">整篇描述词每段加编号</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBatchEmptyLines}
                onChange={e => setIncludeBatchEmptyLines(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span className="text-slate-300">整篇段落之间保留空行</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
