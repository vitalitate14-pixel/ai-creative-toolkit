import React, { useState, useMemo, useRef } from 'react';
import {
  Image as ImageIcon,
  Check,
  X,
  Upload,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Cloud,
  FileImage
} from 'lucide-react';
import { AttachedImage } from './ImageDropZone';

export interface SegmentImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  segmentId: string | null;
  segmentIndex: number;
  segmentText?: string;
  sourceIndex?: number;
  allImages: AttachedImage[];
  currentImageId?: string; // 手动选定或者当前计算得出的图片 ID
  isManualOverride: boolean; // 是否是手动选择的覆盖
  onSelectImage: (segmentId: string, imageId: string) => void;
  onResetToAuto: (segmentId: string) => void;
  onUnbindImage: (segmentId: string) => void;
  onUploadNewImageForSegment: (segmentId: string, file: File) => void;
  otherSegmentsUsingImage?: Record<string, number[]>; // imageId -> 分镜序号列表
  copiedImageId?: string | null;
  onCopyImageAssignment: (imageId?: string) => void;
  onPasteImageAssignment: (segmentId: string) => void;
}

export const SegmentImagePickerModal: React.FC<SegmentImagePickerModalProps> = ({
  isOpen,
  onClose,
  segmentId,
  segmentIndex,
  segmentText = '',
  sourceIndex,
  allImages,
  currentImageId,
  isManualOverride,
  onSelectImage,
  onResetToAuto,
  onUnbindImage,
  onUploadNewImageForSegment,
  otherSegmentsUsingImage = {},
  copiedImageId,
  onCopyImageAssignment,
  onPasteImageAssignment,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return allImages;
    const q = searchQuery.toLowerCase().trim();
    return allImages.filter(img =>
      img.name.toLowerCase().includes(q) ||
      (img.fullPath && img.fullPath.toLowerCase().includes(q))
    );
  }, [allImages, searchQuery]);

  if (!isOpen || !segmentId) return null;

  const currentImage = allImages.find(img => img.id === currentImageId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onUploadNewImageForSegment(segmentId, file);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700/80 bg-[#0f172a] shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#131f38] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600/20 text-sky-400 border border-sky-500/30">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">为分镜 #{segmentIndex + 1} 选择配图</h3>
                {sourceIndex !== undefined && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
                    所属篇章 #{sourceIndex + 1}
                  </span>
                )}
                {isManualOverride && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-600/50">
                    当前为手动指定
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-lg mt-0.5" title={segmentText}>
                文案：{segmentText ? `“${segmentText}”` : '（空白分镜）'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar: Quick operations & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-[#0b1324] px-5 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Direct file upload */}
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
              title="从本地选择一张新图片，并直接绑定到当前分镜行"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>上传新图片至此分镜</span>
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              type="button"
              onClick={() => onCopyImageAssignment(currentImageId)}
              disabled={!currentImageId}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-950/70 hover:bg-violet-900 text-violet-200 text-xs border border-violet-700/60 transition disabled:opacity-40"
              title="只复制当前图片的分配关系，不复制文件；可粘贴到其它分镜"
            >
              <Copy className="w-3.5 h-3.5" />复制图片分配
            </button>
            <button
              type="button"
              onClick={() => { onPasteImageAssignment(segmentId); onClose(); }}
              disabled={!copiedImageId}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 text-xs border border-emerald-700/60 transition disabled:opacity-40"
              title="把已复制的图片分配给当前分镜；同一张图可重复使用"
            >
              <Check className="w-3.5 h-3.5" />粘贴图片分配
            </button>

            {/* Reset to Auto */}
            {isManualOverride && (
              <button
                type="button"
                onClick={() => {
                  onResetToAuto(segmentId);
                  onClose();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition"
                title="清除手动指定，恢复按列表原本顺序自动顺位匹配"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>恢复默认顺位匹配</span>
              </button>
            )}

            {/* Unbind */}
            <button
              type="button"
              onClick={() => {
                onUnbindImage(segmentId);
                onClose();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 text-xs border border-rose-800/50 transition"
              title="解除此分镜的图片关联，保持无图状态"
            >
              <X className="w-3.5 h-3.5" />
              <span>设为无图(解除绑定)</span>
            </button>
          </div>

          {/* Search box in image library */}
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索图片名或路径..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
            />
          </div>
        </div>

        {/* Body: Images Grid */}
        <div className="flex-1 overflow-y-auto p-5 max-h-[58vh] bg-[#0c1322]">
          {allImages.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 mb-3">
                <FileImage className="w-7 h-7 opacity-50" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">暂无已导入的图片库</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                你可以点击上方「上传新图片至此分镜」单独添加配图，或在主页面顶部拖拽导入整个图片文件夹。
              </p>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition"
              >
                从本地选择图片
              </button>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              没有找到匹配关键词 "{searchQuery}" 的图片
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-0.5">
                <span>从图片库中点击任意图片，即可将其绑定为分镜 #{segmentIndex + 1} 的配图：</span>
                <span className="text-[11px] font-mono">共 {filteredImages.length} 张可用图片</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredImages.map((img) => {
                  const globalImgIndex = allImages.findIndex(i => i.id === img.id);
                  const isSelected = img.id === currentImageId;
                  const usingSegments = otherSegmentsUsingImage[img.id] || [];
                  const isUsedByOthers = usingSegments.some(idx => idx !== segmentIndex);

                  return (
                    <div
                      key={img.id}
                      onClick={() => {
                        onSelectImage(segmentId, img.id);
                        onClose();
                      }}
                      className={`group relative flex flex-col rounded-lg border overflow-hidden bg-slate-900 cursor-pointer transition-all duration-150 transform hover:-translate-y-0.5 hover:shadow-lg ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/60 bg-emerald-950/20'
                          : 'border-slate-700/90 hover:border-sky-400'
                      }`}
                    >
                      {/* Thumbnail Container */}
                      <div className="relative h-32 w-full bg-slate-950 overflow-hidden flex items-center justify-center">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="max-w-full max-h-full object-contain transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />

                        {/* Order badge */}
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-white font-mono shadow backdrop-blur-xs">
                          #{globalImgIndex + 1}
                        </span>

                        {/* Gyazo Cloud badge */}
                        {img.gyazoUrl && (
                          <span className="absolute top-1 right-1 p-0.5 rounded bg-black/80 text-emerald-400 shadow" title="已同步Gyazo">
                            <Cloud className="w-2.5 h-2.5" />
                          </span>
                        )}

                        {/* Currently Selected Overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-emerald-950/40 border-2 border-emerald-500 flex flex-col items-center justify-center gap-1">
                            <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                            <span className="text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded shadow">
                              当前使用中
                            </span>
                          </div>
                        )}

                        {/* Hover Prompt */}
                        {!isSelected && (
                          <div className="absolute inset-0 bg-sky-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[11px] font-bold text-white bg-sky-600 px-2 py-1 rounded shadow">
                              选用此图
                            </span>
                          </div>
                        )}
                      </div>

                      {/* File Name & Path Info */}
                      <div className="p-1.5 flex flex-col gap-0.5 bg-slate-900/90 border-t border-slate-800">
                        <div className="text-[10px] text-slate-200 font-mono truncate" title={img.fullPath || img.name}>
                          {img.name}
                        </div>
                        {img.fullPath && img.fullPath !== img.name && (
                          <div className="text-[9px] text-slate-500 truncate" title={img.fullPath}>
                            {img.fullPath}
                          </div>
                        )}
                        {isUsedByOthers && (
                          <div className="text-[9px] text-amber-400/90 truncate mt-0.5" title={`分镜 ${usingSegments.map(i => `#${i + 1}`).join(', ')} 也在使用`}>
                            分镜 {usingSegments.map(i => `#${i + 1}`).join(',')} 使用
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#0c1424] px-5 py-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span>提示：也可以直接把桌面图片拖放到表格第一列该分镜的图片框内快速绑定</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
