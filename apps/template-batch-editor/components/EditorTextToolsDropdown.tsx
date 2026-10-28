import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  ChevronDown,
  MapPin,
  Play,
  FilePlus
} from 'lucide-react';

interface EditorTextToolsDropdownProps {
  onInsertManualSplitMarker: () => void;
  onRunManualPointSplit: () => void;
  onInsertBatchSourceMarker?: () => void;
  batchTemplateMode?: boolean;
}

export const EditorTextToolsDropdown: React.FC<EditorTextToolsDropdownProps> = ({
  onInsertManualSplitMarker,
  onRunManualPointSplit,
  onInsertBatchSourceMarker,
  batchTemplateMode = false
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

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-[11px] font-medium text-slate-200 hover:text-white transition cursor-pointer shadow-xs"
        title="文案拆分与格式化工具箱"
      >
        <Wand2 className="w-3.5 h-3.5 text-sky-400" />
        <span>文本工具</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-72 rounded-xl bg-[#0f182c] border border-slate-700/80 shadow-2xl shadow-black/80 z-50 py-1 text-xs divide-y divide-slate-800">
          <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            精准手动拆分点
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => handleAction(onInsertManualSplitMarker)}
              className="w-full text-left px-3 py-2 hover:bg-cyan-500/10 text-slate-200 hover:text-cyan-300 transition flex items-start gap-2.5 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-[11px] text-cyan-200">在光标处插入拆分点</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  在光标当前位置插入 [拆分点] 标记
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleAction(onRunManualPointSplit)}
              className="w-full text-left px-3 py-2 hover:bg-emerald-500/10 text-slate-200 hover:text-emerald-300 transition flex items-start gap-2.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-[11px] text-emerald-200">按拆分点生成分镜</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  根据文案中的所有 [拆分点] 标记执行分镜生成
                </div>
              </div>
            </button>

            {batchTemplateMode && onInsertBatchSourceMarker && (
              <button
                type="button"
                onClick={() => handleAction(onInsertBatchSourceMarker)}
                className="w-full text-left px-3 py-2 hover:bg-violet-500/10 text-slate-200 hover:text-violet-300 transition flex items-start gap-2.5 cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-[11px] text-violet-200">在光标处添加下一篇</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    在批量模式下插入多篇分隔符
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
