import React, { useState, useRef, useEffect } from 'react';
import { Copy, ChevronDown, Settings2, Check } from 'lucide-react';

interface BatchCopyConfigPopoverProps {
  includeBatchTextNumbering: boolean;
  onToggleTextNumbering: (val: boolean) => void;
  includeBatchPromptNumbering: boolean;
  onTogglePromptNumbering: (val: boolean) => void;
  batchNumberStyle: 'dot' | 'ideographic' | 'parentheses' | 'bracket';
  onChangeNumberStyle: (val: 'dot' | 'ideographic' | 'parentheses' | 'bracket') => void;
  includeBatchEmptyLines: boolean;
  onToggleEmptyLines: (val: boolean) => void;
  onCopyBySource: () => void;
}

export const BatchCopyConfigPopover: React.FC<BatchCopyConfigPopoverProps> = ({
  includeBatchTextNumbering,
  onToggleTextNumbering,
  includeBatchPromptNumbering,
  onTogglePromptNumbering,
  batchNumberStyle,
  onChangeNumberStyle,
  includeBatchEmptyLines,
  onToggleEmptyLines,
  onCopyBySource
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getNumberingSummary = () => {
    if (includeBatchTextNumbering && includeBatchPromptNumbering) return '带编号';
    if (includeBatchTextNumbering) return '文案编号';
    if (includeBatchPromptNumbering) return '描述词编号';
    return '无编号';
  };

  return (
    <div className="relative inline-flex items-stretch h-8 rounded-lg shadow-xs" ref={containerRef}>
      {/* Primary Action Button */}
      <button
        type="button"
        onClick={onCopyBySource}
        className="h-8 inline-flex items-center gap-1.5 px-3 rounded-l-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs border border-violet-400/30 whitespace-nowrap transition cursor-pointer"
        title="复制整篇表格：整篇文案聚合为一行，对应换行图片公式"
      >
        <Copy className="w-3.5 h-3.5 shrink-0" />
        <span>复制整篇表格</span>
        <span className="text-[10px] opacity-80 font-normal">({getNumberingSummary()})</span>
      </button>

      {/* Popover Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 inline-flex items-center justify-center px-2 rounded-r-lg bg-indigo-700/80 hover:bg-indigo-600 text-white text-xs border border-l-0 border-violet-400/30 whitespace-nowrap transition cursor-pointer"
        title="配置整篇复制参数 (编号、格式、空行)"
      >
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Settings Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-68 rounded-xl bg-[#0e172a] border border-slate-700 shadow-2xl shadow-black/80 z-50 p-3 text-xs divide-y divide-slate-800">
          <div className="pb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-violet-400" />
              整篇表格复制设置
            </span>
            <span className="text-[10px] text-slate-500">单元格内聚合</span>
          </div>

          <div className="py-2.5 space-y-2.5">
            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
              <span className="text-slate-300">文案段落添加编号</span>
              <input
                type="checkbox"
                checked={includeBatchTextNumbering}
                onChange={e => onToggleTextNumbering(e.target.checked)}
                className="rounded text-violet-600 bg-slate-900 border-slate-700 focus:ring-violet-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
              <span className="text-slate-300">描述词段落添加编号</span>
              <input
                type="checkbox"
                checked={includeBatchPromptNumbering}
                onChange={e => onTogglePromptNumbering(e.target.checked)}
                className="rounded text-violet-600 bg-slate-900 border-slate-700 focus:ring-violet-500 cursor-pointer"
              />
            </label>

            {(includeBatchTextNumbering || includeBatchPromptNumbering) && (
              <div className="pt-1 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">编号格式:</span>
                <select
                  value={batchNumberStyle}
                  onChange={e => onChangeNumberStyle(e.target.value as any)}
                  className="bg-[#131f3b] text-slate-200 border border-slate-700 rounded px-2 py-1 text-[11px] outline-none cursor-pointer focus:border-violet-400"
                >
                  <option value="dot">1. 2. 3.</option>
                  <option value="ideographic">1、2、3、</option>
                  <option value="parentheses">(1) (2) (3)</option>
                  <option value="bracket">[1] [2] [3]</option>
                </select>
              </div>
            )}

            <div className="pt-1 border-t border-slate-800/80">
              <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                <span className="text-slate-300">段落间保留空行</span>
                <input
                  type="checkbox"
                  checked={includeBatchEmptyLines}
                  onChange={e => onToggleEmptyLines(e.target.checked)}
                  className="rounded text-violet-600 bg-slate-900 border-slate-700 focus:ring-violet-500 cursor-pointer"
                />
              </label>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {includeBatchEmptyLines ? '段落间插入 1 行空行' : '紧凑单换行排版'}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                onCopyBySource();
                setIsOpen(false);
              }}
              className="w-full py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-center text-xs transition cursor-pointer shadow-xs"
            >
              立即复制整篇表格
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
