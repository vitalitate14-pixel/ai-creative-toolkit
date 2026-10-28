import React, { useState, useRef, useEffect } from 'react';
import { Eye, Check, SlidersHorizontal, RotateCcw } from 'lucide-react';

export interface ColumnVisibilityConfig {
  index: boolean;
  image: boolean;
  wrappedText: boolean;
  preset: boolean;
  finalPrompt: boolean;
}

export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibilityConfig = {
  index: true,
  image: true,
  wrappedText: true,
  preset: true,
  finalPrompt: true
};

interface ColumnVisibilityPopoverProps {
  visibility: ColumnVisibilityConfig;
  onChange: (next: ColumnVisibilityConfig) => void;
  hasImages?: boolean;
}

export const ColumnVisibilityPopover: React.FC<ColumnVisibilityPopoverProps> = ({
  visibility,
  onChange,
  hasImages = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
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

  const toggleColumn = (key: keyof ColumnVisibilityConfig) => {
    onChange({
      ...visibility,
      [key]: !visibility[key]
    });
  };

  const visibleCount = Object.values(visibility).filter(Boolean).length;
  const totalCount = Object.keys(visibility).length;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium whitespace-nowrap transition cursor-pointer shadow-xs ${
          visibleCount < totalCount
            ? 'bg-amber-950/70 border-amber-500/60 text-amber-200'
            : 'bg-[#14203a] hover:bg-[#1e2f52] border-slate-700/80 text-slate-300 hover:text-white'
        }`}
        title="设置表格中各列的显示或隐藏（隐藏第四列断行或第五列预设可让文案更宽敞）"
      >
        <Eye className="w-3.5 h-3.5 shrink-0 text-sky-400" />
        <span>列显示</span>
        <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-400 font-mono">
          {visibleCount}/{totalCount}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl bg-[#0e172a] border border-slate-700 shadow-2xl p-3 text-xs flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              表格列显示设置
            </span>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_COLUMN_VISIBILITY)}
              className="text-[10px] text-slate-400 hover:text-sky-300 transition flex items-center gap-0.5 cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              恢复全部
            </button>
          </div>

          {/* 快捷模式预设 */}
          <div className="flex items-center gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_COLUMN_VISIBILITY)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition cursor-pointer flex-1 text-center"
            >
              全部显示
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  index: true,
                  image: hasImages,
                  wrappedText: false,
                  preset: false,
                  finalPrompt: true
                })
              }
              className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/50 text-indigo-300 text-[10px] transition cursor-pointer flex-1 text-center font-medium"
              title="隐藏断行文案与预设列，使文案列获得极大横向空间"
            >
              ⚡ 精简聚焦模式
            </button>
          </div>

          {/* 列开关列表 */}
          <div className="space-y-1.5 py-1">
            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer select-none">
              <span className="text-slate-300">序号列</span>
              <input
                type="checkbox"
                checked={visibility.index}
                onChange={() => toggleColumn('index')}
                className="rounded text-indigo-500 focus:ring-indigo-400"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer select-none">
              <span className="text-slate-300">本地图片列</span>
              <input
                type="checkbox"
                checked={visibility.image}
                onChange={() => toggleColumn('image')}
                className="rounded text-indigo-500 focus:ring-indigo-400"
              />
            </label>

            <div className="flex items-center justify-between p-1.5 rounded bg-slate-900/60 text-slate-500">
              <span>分镜文案列</span>
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-1 py-0.2 rounded border border-indigo-800/40">
                核心始终显示
              </span>
            </div>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer select-none">
              <span className="text-slate-300">第四列：断行文案</span>
              <input
                type="checkbox"
                checked={visibility.wrappedText}
                onChange={() => toggleColumn('wrappedText')}
                className="rounded text-indigo-500 focus:ring-indigo-400"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer select-none">
              <span className="text-slate-300">第五列：预设列</span>
              <input
                type="checkbox"
                checked={visibility.preset}
                onChange={() => toggleColumn('preset')}
                className="rounded text-indigo-500 focus:ring-indigo-400"
              />
            </label>

            <label className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/60 cursor-pointer select-none">
              <span className="text-slate-300">第六列：最终描述词</span>
              <input
                type="checkbox"
                checked={visibility.finalPrompt}
                onChange={() => toggleColumn('finalPrompt')}
                className="rounded text-indigo-500 focus:ring-indigo-400"
              />
            </label>
          </div>

          <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-500">
            隐藏不常用的列后，分镜文案与描述词将自动平摊横向空间。
          </div>
        </div>
      )}
    </div>
  );
};
