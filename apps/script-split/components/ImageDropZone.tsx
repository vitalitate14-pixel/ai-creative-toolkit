import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  X,
  Eye,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  FolderPlus,
  Copy,
  Check,
  Cloud,
  CloudUpload,
  Loader2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import {
  copyImageToClipboard
} from '../utils/gyazoUploader';

export interface AttachedImage {
  id: string;
  name: string;
  fullPath?: string;
  url: string;
  file: File;
  size: number;
  gyazoUrl?: string;
  isUploading?: boolean;
}

export type ImageBindingMode = 'per-segment' | 'per-copy';

// Natural numeric sorting with folder fullPath support: folder1/1.png, folder1/2.png, folder2/1.png
export const naturalSortImages = (images: AttachedImage[]): AttachedImage[] => {
  return [...images].sort((a, b) => {
    const pathA = a.fullPath || a.name;
    const pathB = b.fullPath || b.name;
    return pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

// 递归扫描 FileSystemEntry 获取所有子目录中的图片
async function scanEntryForImages(entry: any): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise(resolve => {
      entry.file(
        (file: File) => {
          const isImg = (file.type && file.type.startsWith('image/')) ||
            /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)$/i.test(file.name);
          if (isImg) {
            (file as any).fullPath = entry.fullPath || file.name;
            resolve([file]);
          } else {
            resolve([]);
          }
        },
        () => resolve([])
      );
    });
  }
  if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const readBatch = (): Promise<any[]> =>
      new Promise(resolve => {
        dirReader.readEntries(resolve, () => resolve([]));
      });

    let allEntries: any[] = [];
    // Chromium 每次最多只返回 100 项，需循环读取至空数组
    while (true) {
      try {
        const batch = await readBatch();
        if (!batch || batch.length === 0) break;
        allEntries = allEntries.concat(batch);
      } catch {
        break;
      }
    }
    const nested = await Promise.all(allEntries.map(e => scanEntryForImages(e)));
    return nested.flat();
  }
  return [];
}

interface ImageDropZoneProps {
  images: AttachedImage[];
  onImagesChange: (images: AttachedImage[]) => void;
  bindingMode: ImageBindingMode;
  onBindingModeChange: (mode: ImageBindingMode) => void;
  batchTemplateMode: boolean;
  totalSegmentsCount: number;
  totalCopiesCount: number;
  copiedImageIds?: Set<string>;
  onImageCopied?: (imageId: string) => void;
  onToggleImageCopied?: (imageId: string) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  variant?: 'full' | 'sidebar';
  defaultCollapsed?: boolean;
}

export const ImageDropZone: React.FC<ImageDropZoneProps> = ({
  images,
  onImagesChange,
  bindingMode,
  onBindingModeChange,
  batchTemplateMode,
  totalSegmentsCount,
  totalCopiesCount,
  copiedImageIds,
  onImageCopied,
  onToggleImageCopied,
  onToast,
  variant = 'full',
  defaultCollapsed = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewHoverImage, setPreviewHoverImage] = useState<AttachedImage | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);


  const [localToast, setLocalToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const showNotification = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onToast) {
      onToast(msg, type);
    }
    setLocalToast({ msg, type });
    setTimeout(() => setLocalToast(null), 3000);
  }, [onToast]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      (f.type && f.type.startsWith('image/')) ||
      /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)$/i.test(f.name)
    );
    if (!fileArray.length) {
      showNotification('未找到有效图片文件', 'error');
      return;
    }

    const newAttached: AttachedImage[] = fileArray.map((file, idx) => ({
      id: `img-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      fullPath: (file as any).fullPath || (file as any).webkitRelativePath || file.name,
      url: URL.createObjectURL(file),
      file,
      size: file.size
    }));

    // 合并并自然排序
    const combined = [...images, ...newAttached];
    const sorted = naturalSortImages(combined);
    onImagesChange(sorted);
    showNotification(`已成功导入 ${newAttached.length} 张图片（已自然排序）`, 'success');
  }, [images, onImagesChange, showNotification]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const collectedFiles: File[] = [];

    if (items && items.length > 0) {
      const entryPromises: Promise<File[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
          if (entry) {
            entryPromises.push(scanEntryForImages(entry));
          } else {
            const f = item.getAsFile();
            if (f) collectedFiles.push(f);
          }
        }
      }
      if (entryPromises.length > 0) {
        const results = await Promise.all(entryPromises);
        collectedFiles.push(...results.flat());
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      collectedFiles.push(...Array.from(e.dataTransfer.files));
    }

    if (collectedFiles.length > 0) {
      handleFiles(collectedFiles);
    }
  };

  const removeImage = (id: string) => {
    const target = images.find(img => img.id === id);
    if (target) {
      try {
        URL.revokeObjectURL(target.url);
      } catch {}
    }
    onImagesChange(images.filter(img => img.id !== id));
  };

  const clearAllImages = () => {
    if (!confirm('确定要清空已添加的所有图片吗？')) return;
    images.forEach(img => {
      try {
        URL.revokeObjectURL(img.url);
      } catch {}
    });
    onImagesChange([]);
    showNotification('已清空全部图片');
  };

  const reSortImages = () => {
    onImagesChange(naturalSortImages(images));
    showNotification('已按文件名自然排序重排图片');
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    onImagesChange(next);
  };

  // 复制原始图片位图到系统剪贴板
  const handleCopyImage = async (img: AttachedImage, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const res = await copyImageToClipboard(img.file, img.url);
    if (res.success) {
      setCopiedId(img.id);
      setTimeout(() => setCopiedId(null), 1800);
      onImageCopied?.(img.id);
      showNotification(`✅ 原始图片位图已复制到剪贴板：${img.name}（已标记为已复制）`, 'success');
    } else {
      showNotification(`复制图片失败: ${res.error || '未知错误'}`, 'error');
    }
  };


  // Target count according to mode
  const targetCount = bindingMode === 'per-copy' ? totalCopiesCount : totalSegmentsCount;
  const countDiff = images.length - targetCount;


  if (variant === 'sidebar') {
    return (
      <div className="bg-[#0b1322] p-3 text-slate-100 flex flex-col gap-2">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
            <span>本地分镜图片</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
              {images.length}张
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition text-xs flex items-center gap-0.5 cursor-pointer"
              title={isCollapsed ? '展开图片素材库' : '收起图片素材库'}
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Action buttons & mode toggle */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="inline-flex rounded border border-slate-700 bg-slate-900/90 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => onBindingModeChange('per-segment')}
              className={`px-1.5 py-0.5 rounded font-medium transition cursor-pointer ${
                bindingMode === 'per-segment' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="一文案多图（分镜图组）"
            >
              分镜图组
            </button>
            <button
              type="button"
              onClick={() => onBindingModeChange('per-copy')}
              className={`px-1.5 py-0.5 rounded font-medium transition cursor-pointer ${
                bindingMode === 'per-copy' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="一文案一图（单篇对应）"
            >
              单篇一图
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[10px] font-semibold border border-slate-700 flex items-center gap-1 transition cursor-pointer"
              title="导入包含图片的文件夹（支持递归子目录）"
            >
              <FolderPlus className="w-3 h-3" />
              文件夹
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="选择单张或多张图片"
            >
              <FolderOpen className="w-3 h-3" />
              图片
            </button>
          </div>
        </div>

        {/* Hidden inputs for folder and files */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />

        {/* Body when not collapsed */}
        {!isCollapsed && (
          <div className="space-y-2">
            {/* Drag & drop or thumbnails grid */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`rounded-lg border border-dashed transition-all p-2 ${
                isDragging
                  ? 'border-sky-400 bg-sky-950/40'
                  : images.length === 0
                  ? 'border-slate-700 bg-[#0f172a]/60 hover:border-slate-600'
                  : 'border-slate-800 bg-[#0f172a]/80'
              }`}
            >
              {images.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="py-4 flex flex-col items-center justify-center cursor-pointer text-center"
                >
                  <Upload className="w-5 h-5 text-sky-400 mb-1 animate-bounce" />
                  <p className="text-[11px] font-bold text-slate-200">拖拽图片或文件夹到此处</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">自动按自然文件名排序</p>
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-3 gap-1.5 scrollbar-thin">
                  {images.map((img, idx) => {
                    const isItemCopied = copiedImageIds?.has(img.id);
                    return (
                      <div
                        key={img.id}
                        className={`relative group aspect-square rounded-md overflow-hidden border shadow-xs transition cursor-pointer ${
                          isItemCopied
                            ? 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-950/30'
                            : 'border-slate-700 bg-slate-900 hover:border-sky-400'
                        }`}
                        onClick={(e) => handleCopyImage(img, e)}
                        onContextMenu={(e) => handleCopyImage(img, e)}
                        title={`点击复制位图: ${img.name}`}
                      >
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        <span className="absolute top-0.5 left-0.5 px-1 rounded text-[9px] font-bold bg-black/80 text-white">
                          {idx + 1}
                        </span>
                        {/* Hover delete & upload */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                            className="p-1 rounded bg-rose-900/90 text-rose-200 hover:bg-rose-800"
                            title="删除此图"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom utilities when images exist */}
            {images.length > 0 && (
              <div className="flex items-center justify-between text-[10px] pt-1">
                <span className="text-slate-400">
                  {targetCount > 0 ? (
                    countDiff === 0 ? '✓ 数量匹配' : countDiff < 0 ? `缺 ${Math.abs(countDiff)} 张` : `多 ${countDiff} 张`
                  ) : `${images.length} 张图`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={reSortImages}
                    className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                    title="按文件名自然顺序重新排序"
                  >
                    重排
                  </button>
                  <button
                    type="button"
                    onClick={clearAllImages}
                    className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    清空
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-slate-700/80 bg-[#0c1424] p-3 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <span>本地分镜图片绑定</span>
          </div>

          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/90 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onBindingModeChange('per-segment')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                bindingMode === 'per-segment'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="一个完整文案拆分成多个片段，每个片段各匹配一张图（图组分镜对应）"
            >
              一文案多图 (分镜图组)
            </button>
            <button
              type="button"
              onClick={() => onBindingModeChange('per-copy')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                bindingMode === 'per-copy'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="每篇完整文案对应一张图片（单篇对应封面/主图）"
            >
              一文案一图 (单篇对应)
            </button>
          </div>

          {images.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                已导入 {images.length} 张图片
              </span>
              {targetCount > 0 && (
                <span
                  className={`px-2 py-0.5 rounded font-medium border ${
                    countDiff === 0
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50'
                      : countDiff < 0
                      ? 'bg-amber-950/80 text-amber-300 border-amber-600/50'
                      : 'bg-blue-950/80 text-blue-300 border-blue-600/50'
                  }`}
                >
                  {countDiff === 0
                    ? `✓ 数量完美匹配 (${images.length}/${targetCount})`
                    : countDiff < 0
                    ? `需配对 ${targetCount} 处，还缺 ${Math.abs(countDiff)} 张`
                    : `图数 (${images.length}) 超过目标 (${targetCount})`}
                </span>
              )}


              {/* Copied Count Badge */}
              {copiedImageIds && copiedImageIds.size > 0 && (
                <span className="px-2 py-0.5 rounded font-medium border bg-emerald-950/70 text-emerald-300 border-emerald-700 inline-flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  已复制: {copiedImageIds.size}/{images.length}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {images.length > 0 && (
            <>


              <button
                type="button"
                onClick={reSortImages}
                className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs transition"
                title="按文件名自然顺序重新排序 (1, 2, 10...)"
              >
                按名称重排
              </button>
              <button
                type="button"
                onClick={clearAllImages}
                className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-rose-400 hover:text-rose-300 text-xs transition"
              >
                清空图片
              </button>
            </>
          )}

          {/* Folder Ingestion Button */}
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white text-xs font-semibold shadow transition"
            title="选择文件夹（包含子文件夹）导入所有图片"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            选择文件夹
          </button>
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />

          {/* Single/Multiple Files Ingestion Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            选择图片文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Drag & Drop Canvas */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed transition-all p-3 relative ${
          isDragging
            ? 'border-sky-400 bg-sky-950/40 scale-[0.995]'
            : images.length === 0
            ? 'border-slate-700 bg-[#0f172a]/60 hover:border-slate-600'
            : 'border-slate-800 bg-[#0f172a]/80'
        }`}
      >
        {images.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="py-6 flex flex-col items-center justify-center cursor-pointer text-center"
          >
            <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-2">
              <Upload className="w-5 h-5 animate-bounce" />
            </div>
            <p className="text-xs font-bold text-slate-200">
              从本地拖拽图片文件或<span className="text-sky-400 font-extrabold underline decoration-sky-500 underline-offset-2">文件夹（支持多层子文件夹）</span>到这里
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              自动递归读取子目录并按文件名自然排序 (如 scene_1, scene_2 ... scene_10)；支持右键复制原图
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Horizontal Filmstrip */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
              {images.map((img, idx) => {
                const isItemCopied = copiedImageIds?.has(img.id);
                return (
                <div
                  key={img.id}
                  className={`relative group shrink-0 w-24 h-24 rounded-lg overflow-hidden border shadow-sm transition ${
                    isItemCopied
                      ? 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-950/30'
                      : 'border-slate-700 bg-slate-900 hover:border-sky-400'
                  }`}
                  onMouseEnter={() => setPreviewHoverImage(img)}
                  onMouseLeave={() => setPreviewHoverImage(null)}
                  onContextMenu={(e) => handleCopyImage(img, e)}
                  title="右键或点击上方按钮可快速复制原始图片位图到剪贴板"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />

                  {/* Number Badge */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/80 text-white backdrop-blur-xs">
                    {idx + 1}
                  </span>

                  {/* Copied Indicator Badge */}
                  {isItemCopied && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleImageCopied?.(img.id);
                      }}
                      className="absolute bottom-5 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-0.5 shadow backdrop-blur-xs cursor-pointer transition z-10"
                      title="已标记为已复制，点击可取消标记"
                    >
                      <Check className="w-2.5 h-2.5" />已复制
                    </span>
                  )}

                  {/* Top-right quick actions bar */}
                  <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Toggle copied button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleImageCopied?.(img.id);
                      }}
                      className={`p-1 rounded transition text-white ${
                        isItemCopied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-black/80 hover:bg-slate-700'
                      }`}
                      title={isItemCopied ? '取消已复制标记' : '手动标记为已复制'}
                    >
                      <Check className="w-3 h-3" />
                    </button>

                    {/* Copy image bitmap button */}
                    <button
                      type="button"
                      onClick={(e) => handleCopyImage(img, e)}
                      className={`p-1 rounded transition text-white ${
                        copiedId === img.id ? 'bg-emerald-600' : 'bg-black/80 hover:bg-sky-600'
                      }`}
                      title="复制原始图片位图到剪贴板（微信可直接粘贴）"
                    >
                      {copiedId === img.id ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(img.id);
                      }}
                      className="p-1 rounded bg-black/80 text-rose-300 hover:text-rose-100 hover:bg-rose-900/90 transition"
                      title="移除该图片"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Left / Right Position Shift Arrows (on hover) */}
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveImage(idx, 'left');
                      }}
                      className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/85 hover:bg-sky-600 text-white opacity-0 group-hover:opacity-100 transition shadow z-10"
                      title="向左移动一位（前移序号）"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveImage(idx, 'right');
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/85 hover:bg-sky-600 text-white opacity-0 group-hover:opacity-100 transition shadow z-10"
                      title="向右移动一位（后移序号）"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Gyazo Status Badge (bottom right or icon) */}
                  <div className="absolute bottom-5 right-1 z-10">
                    {img.gyazoUrl ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(img.gyazoUrl, '_blank');
                        }}
                        className="px-1 py-0.2 rounded bg-emerald-900/90 text-emerald-200 text-[9px] flex items-center gap-0.5 shadow cursor-pointer border border-emerald-500/60"
                        title="已有 Gyazo 链接，点击在新标签打开"
                      >
                        <Cloud className="w-2.5 h-2.5 text-emerald-300" />
                        <span>已传</span>
                      </span>
                    ) : null}
                  </div>

                  {/* File Name Bar */}
                  <div className="absolute bottom-0 inset-x-0 bg-black/85 px-1 py-0.5 text-[9px] text-slate-200 truncate text-center font-mono">
                    {img.name}
                  </div>
                </div>
              );
            })}

              {/* Add more placeholder card */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-slate-700 hover:border-sky-400 bg-slate-900/40 hover:bg-sky-950/20 flex flex-col items-center justify-center text-slate-400 hover:text-sky-300 transition"
              >
                <Upload className="w-5 h-5 mb-1" />
                <span className="text-[10px]">继续添加</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>
                提示：支持直接拖拽任意文件夹（包含多层子文件夹）。图片已按自然数字排列。右键图片或点 📋 即可直接复制原图到微信。
              </span>
              {images.some(i => i.gyazoUrl) && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  已同步开启谷歌表格 =IMAGE() 缩略图公式输出
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Local Notification banner if any */}
      {localToast && (
        <div
          className={`mt-2 px-3 py-1.5 rounded-md text-xs flex items-center justify-between transition-all ${
            localToast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-700'
              : localToast.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border border-rose-700'
              : 'bg-slate-800 text-sky-200 border border-slate-600'
          }`}
        >
          <span>{localToast.msg}</span>
          <button type="button" onClick={() => setLocalToast(null)} className="text-slate-400 hover:text-white ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Hover Floating Large Preview Popover */}
      {previewHoverImage && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none rounded-xl border border-sky-500/50 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md max-w-xs animate-in fade-in zoom-in-95">
          <img
            src={previewHoverImage.url}
            alt={previewHoverImage.name}
            className="w-56 h-56 object-contain rounded-lg bg-black/40"
          />
          <p className="mt-1.5 text-xs text-center font-mono font-medium text-slate-200 truncate">
            {previewHoverImage.name}
          </p>
          {previewHoverImage.gyazoUrl && (
            <p className="text-[10px] text-center text-emerald-400 font-mono truncate">
              {previewHoverImage.gyazoUrl}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
