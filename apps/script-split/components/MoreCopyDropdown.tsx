import React, { useState, useRef, useEffect } from 'react';
import {
  Copy,
  ChevronDown,
  Columns,
  Rows,
  AlignLeft,
  WrapText,
  Image as ImageIcon,
  Layers,
  Info,
  Maximize2
} from 'lucide-react';

interface MoreCopyDropdownProps {
  onCopy: (mode: any) => void;
  batchTemplateMode?: boolean;
  hasImages?: boolean;
  activeMultiPresetsCount?: number;
  includeBatchTextNumbering?: boolean;
  includeBatchPromptNumbering?: boolean;
  onShowFormatGuide: () => void;
}

export const MoreCopyDropdown: React.FC<MoreCopyDropdownProps> = ({
  onCopy,
  batchTemplateMode = false,
  hasImages = false,
  activeMultiPresetsCount = 0,
  includeBatchTextNumbering = false,
  includeBatchPromptNumbering = false,
  onShowFormatGuide
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

  const handleSelect = (mode: any) => {
    onCopy(mode);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap transition cursor-pointer shadow-xs"
        title="展开更多表格复制方式与单列模式"
      >
        <Copy className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span>更多复制</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-64 max-h-[480px] overflow-y-auto rounded-xl bg-[#0e172a] border border-slate-700 shadow-2xl shadow-black/80 z-50 py-1.5 text-xs divide-y divide-slate-800">
          {/* 逐片段常用复制 */}
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            逐片段模式 (每段占一行)
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => handleSelect('both')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Columns className="w-3.5 h-3.5 text-blue-400" />
              <span>逐片段双列 (文案 + 描述词)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('split-wrapped')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <WrapText className="w-3.5 h-3.5 text-sky-400" />
              <span>逐片段复制 (文案 + 断行文案)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('split')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
              <span>逐片段复制文案 (单列)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('filled')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <AlignLeft className="w-3.5 h-3.5 text-purple-400" />
              <span>逐片段复制描述词 (单列)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('filled-horizontal')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Rows className="w-3.5 h-3.5 text-emerald-400" />
              <span>横向复制描述词 (同一行多格)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('wrapped')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <WrapText className="w-3.5 h-3.5 text-amber-400" />
              <span>逐片段复制断行文案 (单列)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelect('split-single')}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>全部文案放入一格 (单单元格)</span>
            </button>
          </div>

          {/* 素材图片与多预设 */}
          {(hasImages || activeMultiPresetsCount > 0) && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                素材与预设列
              </div>
              <div className="py-1">
                {hasImages && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSelect('images-prompts')}
                      className="w-full text-left px-3 py-1.5 hover:bg-teal-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-teal-400" />
                      <span>复制图片公式 + 描述词双列</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelect('images-only')}
                      className="w-full text-left px-3 py-1.5 hover:bg-teal-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>仅复制图片文件名 (单列)</span>
                    </button>
                  </>
                )}
                {activeMultiPresetsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelect(hasImages ? 'multi-presets-with-images' : 'multi-presets')}
                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>复制多预设列 ({activeMultiPresetsCount}个预设{hasImages ? '+图片' : ''})</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* 批量篇章整篇模式 */}
          {batchTemplateMode && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                按整篇聚合复制 (每篇占一行)
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => handleSelect('both-by-source')}
                  className="w-full text-left px-3 py-1.5 hover:bg-violet-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Columns className="w-3.5 h-3.5 text-violet-400" />
                  <span>按整篇复制双列 (文案 + 描述词)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect('split-wrapped-by-source')}
                  className="w-full text-left px-3 py-1.5 hover:bg-violet-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <WrapText className="w-3.5 h-3.5 text-violet-400" />
                  <span>按整篇复制 (文案 + 断行文案)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect('all-by-source')}
                  className="w-full text-left px-3 py-1.5 hover:bg-violet-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Columns className="w-3.5 h-3.5 text-violet-400" />
                  <span>按整篇复制 3 列 (拆分+断行+描述词)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect('split-by-source')}
                  className="w-full text-left px-3 py-1.5 hover:bg-violet-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <AlignLeft className="w-3.5 h-3.5 text-violet-400" />
                  <span>按整篇复制文案{includeBatchTextNumbering ? ' (带编号)' : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect('filled-by-source')}
                  className="w-full text-left px-3 py-1.5 hover:bg-violet-600/15 text-slate-200 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <AlignLeft className="w-3.5 h-3.5 text-violet-400" />
                  <span>按整篇复制描述词{includeBatchPromptNumbering ? ' (带编号)' : ''}</span>
                </button>
              </div>
            </>
          )}

          {/* 格式指南 */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                onShowFormatGuide();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sky-400 hover:text-sky-300 flex items-center gap-2 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span>复制格式说明与表格示例</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
