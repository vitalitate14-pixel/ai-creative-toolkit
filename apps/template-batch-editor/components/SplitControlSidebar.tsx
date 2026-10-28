import React from 'react';
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
  HelpCircle,
  Binary,
  WrapText
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
  batchNumberStyle: 'dot' | 'ideographic' | 'parentheses' | 'bracket';
  setBatchNumberStyle: (val: 'dot' | 'ideographic' | 'parentheses' | 'bracket') => void;
  includeBatchEmptyLines: boolean;
  setIncludeBatchEmptyLines: (val: boolean) => void;
  batchTemplateMode: boolean;
  setBatchTemplateMode: (val: boolean) => void;
  onConvertNumbersToWords: () => void;
  onSplitByNewlines: () => void;
  onApply8sPreset: () => void;
  onOpenAiSegmentPrompt: () => void;
  aiModel: string;
  onAiModelChange: (model: string) => void;
  aiModelOptions: Array<{ value: string; label: string }>;
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
  batchNumberStyle,
  setBatchNumberStyle,
  includeBatchEmptyLines,
  setIncludeBatchEmptyLines,
  batchTemplateMode,
  setBatchTemplateMode,
  onConvertNumbersToWords,
  onSplitByNewlines,
  onApply8sPreset,
  onOpenAiSegmentPrompt,
  aiModel,
  onAiModelChange,
  aiModelOptions
}) => {
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

      {/* 1. 预设模式快捷切换 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2 space-y-2">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
          <span>拆分策略</span>
        </div>

        <div className="grid grid-cols-2 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setTemplateSplitStrategy('range')}
            data-tooltip-position="top"
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
            data-tooltip-position="top"
            className={`py-1.5 px-2 rounded font-medium transition text-center ${
              templateSplitStrategy === 'punctuation'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'bg-[#182645] text-slate-400 hover:text-slate-200 hover:bg-[#1e3057]'
            }`}
            title="标点强制：达到最小数量后，立即在遇到标点处拆分"
          >
            标点强制 (遇标即拆)
          </button>
          <button
            type="button"
            onClick={onApply8sPreset}
            data-tooltip-position="top"
            className={`py-1.5 px-2 rounded font-medium transition text-center ${
              templateSplitStrategy === 'sermon'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'bg-[#182645] text-slate-400 hover:text-slate-200 hover:bg-[#1e3057]'
            }`}
            title="口播节奏优先：清除换行、数字转英文、优先自然停顿。下方全部参数仍可继续修改。"
          >
            8 秒口播
          </button>
          <button
            type="button"
            onClick={() => setTemplateSplitStrategy('ai')}
            data-tooltip-position="top"
            className={`py-1.5 px-2 rounded font-medium transition text-center ${
              templateSplitStrategy === 'ai'
                ? 'bg-violet-600 text-white font-bold shadow-xs'
                : 'bg-[#182645] text-slate-400 hover:text-slate-200 hover:bg-[#1e3057]'
            }`}
            title="纯 AI：AI 只决定每一段在哪里结束；动态字幕断行仍按下方字符数在本地处理"
          >
            纯 AI 分段
          </button>
        </div>
        {templateSplitStrategy === 'ai' && (
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={aiModel}
              onChange={event => onAiModelChange(event.target.value)}
              className="min-w-0 rounded border border-violet-500/60 bg-[#182645] px-2 py-1.5 text-[11px] text-violet-100 outline-none focus:border-violet-300"
              title="纯 AI 分段使用的模型"
            >
              {aiModelOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              type="button"
              onClick={onOpenAiSegmentPrompt}
              className="rounded border border-violet-500/60 bg-violet-950/40 px-2 py-1.5 text-[11px] font-medium text-violet-200 hover:bg-violet-900/50 transition"
            >
              编辑 AI 分段指令
            </button>
          </div>
        )}
        <p className="text-[10px] leading-relaxed text-slate-400">
          {templateSplitStrategy === 'sermon'
            ? '口播策略会优先自然停顿、清除原换行并转换数字；已载入推荐值，但下方所有参数均可修改。'
            : templateSplitStrategy === 'ai'
              ? 'AI 只负责决定分段位置；下方的长度、断句、字幕断行和输出设置仍全部生效。'
            : '选择策略后，下方全部参数都会生效；可按实际内容自由调整。'}
        </p>
      </div>

      {/* 2. 所有会在开始拆分时生效的片段规则统一放在这里 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
          <span>拆分片段设置</span>
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

        <div className="pt-2 mt-1 border-t border-slate-800 space-y-2 text-xs">
          <div className="text-[11px] font-semibold text-slate-300">标点停顿与断句</div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepSentences}
              onChange={e => setKeepSentences(e.target.checked)}
              className="rounded border-slate-600 text-blue-600"
            />
            <span className="text-[11px] text-slate-300">优先按停顿标点拆分</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none" title="只在逗号、句号、问号、感叹号、分号处断句；冒号、引号、括号不断开" data-tooltip-position="top">
            <input
              type="checkbox"
              checked={sentencePauseOnly}
              onChange={e => setSentencePauseOnly(e.target.checked)}
              className="rounded border-slate-600 text-blue-600"
            />
            <span className="text-[11px] text-slate-300">仅按句读标点拆分 (防冒号误断)</span>
          </label>
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

        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800">
          <span className="text-slate-400">动态字幕每行字符</span>
          <input
            type="number"
            min="1"
            value={lineWidth}
            onChange={e => setLineWidth(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 border border-slate-600 rounded px-1.5 py-0.5 bg-[#182645] text-slate-100 font-mono text-center outline-none"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
          <input
            type="checkbox"
            checked={lowercaseSplitOutput}
            onChange={e => setLowercaseSplitOutput(e.target.checked)}
            className="rounded border-slate-600 text-blue-600"
          />
          <span className="text-[11px] text-slate-300">拆分结果全小写</span>
        </label>

        <div className="pt-2 border-t border-slate-800">
          <div className="mb-1.5 text-[11px] font-semibold text-slate-300">文本预处理</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onConvertNumbersToWords} className="inline-flex items-center justify-center gap-1 rounded border border-purple-500/40 bg-purple-950/40 px-2 py-1.5 text-[10px] font-medium text-purple-200 hover:bg-purple-900/60 transition" title="将原始文案中的阿拉伯数字转为英文单词" data-tooltip-position="top">
              <Binary className="w-3 h-3" /> 数字转英文
            </button>
            <button type="button" onClick={onSplitByNewlines} className="inline-flex items-center justify-center gap-1 rounded border border-sky-500/40 bg-sky-950/40 px-2 py-1.5 text-[10px] font-medium text-sky-200 hover:bg-sky-900/60 transition" title="将原始文案的每一行直接生成一个分镜段落" data-tooltip-position="top">
              <WrapText className="w-3 h-3" /> 按换行生成
            </button>
          </div>
        </div>
      </div>

      {/* 4. 复制模式与导出格式保持在同一个框内 */}
      <div className="rounded-lg border border-slate-700/80 bg-[#131f38] overflow-hidden text-xs">
        <div className="w-full px-2.5 py-2 flex items-center text-[11px] font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-indigo-400" />
            <span>复制模式与导出格式</span>
          </span>
        </div>
        <div className="p-2.5 pt-1 space-y-2 border-t border-slate-800 text-[11px] bg-[#0e172a]">
            <label className="flex items-center gap-2 cursor-pointer select-none pb-2 border-b border-slate-800" title="复制和导出时，为单行拆分片段自动包裹双引号" data-tooltip-position="top">
              <input
                type="checkbox"
                checked={quoteSplitSegments}
                onChange={e => setQuoteSplitSegments(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span className="text-slate-300 flex items-center gap-1">
                <Quote className="w-3 h-3 text-cyan-400" />
                单行片段自动加双引号 <code className="text-[10px] text-cyan-300">""</code>
              </span>
            </label>
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

            <div className="flex items-center justify-between gap-2 pl-6">
              <span className="text-slate-400">编号格式</span>
              <select
                value={batchNumberStyle}
                onChange={e => setBatchNumberStyle(e.target.value as 'dot' | 'ideographic' | 'parentheses' | 'bracket')}
                className="bg-[#182645] text-slate-200 border border-slate-600 rounded px-1.5 py-1 text-[11px] outline-none cursor-pointer"
              >
                <option value="dot">1. 2. 3.</option>
                <option value="ideographic">1、2、3、</option>
                <option value="parentheses">(1) (2) (3)</option>
                <option value="bracket">[1] [2] [3]</option>
              </select>
            </div>

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
      </div>
    </div>
  );
};
