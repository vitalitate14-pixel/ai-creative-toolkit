import React from 'react';
import { AlignLeft, Columns, Copy, Image as ImageIcon, Info, Layers, Rows, WrapText } from 'lucide-react';

type Props = {
  onCopy: (mode: any) => void;
  batchTemplateMode: boolean;
  hasImages: boolean;
  activeMultiPresetsCount: number;
  onShowFormatGuide: () => void;
};

const CopyButton = ({ label, mode, onCopy }: { label: string; mode: any; onCopy: (mode: any) => void }) => (
  <button type="button" onClick={() => onCopy(mode)} className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-700 bg-[#16223d] hover:bg-[#20335e] text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap transition cursor-pointer">
    <Copy className="w-3.5 h-3.5 text-slate-400" />{label}
  </button>
);

/** 所有复制方式平铺显示，避免隐藏在下拉菜单中。 */
export const FlatCopyActions: React.FC<Props> = ({ onCopy, batchTemplateMode, hasImages, activeMultiPresetsCount, onShowFormatGuide }) => (
  <div className="flex flex-nowrap gap-2 shrink-0">
    <CopyButton label="逐片段双列（文案+描述词）" mode="both" onCopy={onCopy} />
    <CopyButton label="逐片段复制（文案+断行文案）" mode="split-wrapped" onCopy={onCopy} />
    <CopyButton label="逐片段复制文案（单列）" mode="split" onCopy={onCopy} />
    <CopyButton label="逐片段复制描述词（单列）" mode="filled" onCopy={onCopy} />
    <CopyButton label="横向复制描述词（同一行多格）" mode="filled-horizontal" onCopy={onCopy} />
    <CopyButton label="逐片段复制断行文案（单列）" mode="wrapped" onCopy={onCopy} />
    <CopyButton label="全部文案放入一格（单单元格）" mode="split-single" onCopy={onCopy} />
    {hasImages && <>
      <CopyButton label="图片名+原文+文案+描述词" mode="image-source-split-prompt" onCopy={onCopy} />
      <CopyButton label="图片+描述词" mode="images-prompts" onCopy={onCopy} />
      <CopyButton label="图片文件名" mode="images-only" onCopy={onCopy} />
      <CopyButton label="图片文件名（含后缀）" mode="image-file-names" onCopy={onCopy} />
    </>}
    {activeMultiPresetsCount > 0 && <CopyButton label={`多预设列 (${activeMultiPresetsCount})`} mode={hasImages ? 'multi-presets-with-images' : 'multi-presets'} onCopy={onCopy} />}
    {batchTemplateMode && <>
      <CopyButton label="按整篇复制双列（文案+描述词）" mode="both-by-source" onCopy={onCopy} />
      <CopyButton label="按整篇复制（文案+断行文案）" mode="split-wrapped-by-source" onCopy={onCopy} />
      <CopyButton label="按整篇复制文案+断行+描述词" mode="all-by-source" onCopy={onCopy} />
      <CopyButton label="按整篇复制文案" mode="split-by-source" onCopy={onCopy} />
      <CopyButton label="按整篇复制描述词" mode="filled-by-source" onCopy={onCopy} />
    </>}
    <button type="button" onClick={onShowFormatGuide} className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-sky-900 bg-sky-950/40 text-xs font-medium text-sky-300 hover:bg-sky-900/60 transition cursor-pointer"><Info className="w-3.5 h-3.5" />格式说明</button>
  </div>
);
