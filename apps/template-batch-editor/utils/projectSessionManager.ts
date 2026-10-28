/**
 * 拆分工具完整工程记录序列化与反序列化管理器 (Project Session Manager)
 * 支持将当前文案、拆分结果、预设设置、进度标记以及图片实体完整导出为 JSON 工程文件并随时无损恢复。
 */

import { AttachedImage, ImageBindingMode } from '../components/ImageDropZone';

export interface SerializedImageRecord {
  id: string;
  name: string;
  fullPath?: string;
  size: number;
  gyazoUrl?: string;
  dataUrl?: string; // Base64 编码的图片实体数据
}

export interface SplitProjectSession {
  version: 1;
  exportTime: string;
  title: string;

  // 原始文案与篇章草稿
  templateSource: string;
  batchTemplateMode: boolean;
  batchTemplateDrafts: Array<{
    id: string;
    source: string;
    templateMode: 'global' | 'custom';
    template: string;
  }>;
  activeBatchDraftIndex: number;
  activeBatchSourceIndex?: number | null;

  // 描述词模板与预设
  promptTemplate: string;
  sourcePromptTemplates?: Record<number, string>;
  /** 多篇分镜时，每篇文案所绑定的图片组；此前遗漏导致恢复后看起来丢失配图。 */
  sourceImageGroupBindings?: Record<number, string>;
  /** 工程内自定义预设也随工程携带，避免换设备后只剩模板文本、找不到预设名称。 */
  templatePresets?: Array<{ id: string; name: string; template: string }>;
  perSourceTemplateMode: boolean;
  storyboardMode: boolean;
  multiPresetIds: string[];

  // 拆分规则参数
  splitSettings: {
    templateSplitStrategy: 'length' | 'punctuation' | 'both';
    splitMinimum: number;
    splitMaximum: number;
    splitUnit: 'chars' | 'words';
    lineWidth: number;
    wrapMode: 'smart' | 'strict';
    splitTolerance: number;
    allowTolerance: boolean;
    keepSentences: boolean;
    sentencePauseOnly: boolean;
    quoteSplitSegments: boolean;
    lowercaseSplitOutput: boolean;
    includeBatchTextNumbering?: boolean;
    includeBatchPromptNumbering?: boolean;
    batchNumberStyle?: 'dot' | 'ideographic' | 'parentheses' | 'bracket';
    includeBatchEmptyLines?: boolean;
  };

  // 拆分出来的片段行（含绑定的 imageId、finalPrompt、customPrompts 等）
  templateSegments: Array<{
    id: string;
    text: string;
    sourceIndex?: number;
    wrappedText?: string;
    promptTemplate?: string;
    finalPrompt?: string;
    customPrompts?: Record<string, string>;
    imageId?: string;
  }>;

  // 绑定的图片库
  images: SerializedImageRecord[];
  imageBindingMode: ImageBindingMode;

  // 作业状态与标记
  copiedSegmentIds: string[];
  copiedImageIds: string[];
  selectedSegmentIds: string[];

  // 多标签页工作区支持
  tabs?: any[]; // Serialized SplitWorkspaceTab[]
  activeTabId?: string;
}

export interface RestoredProjectSession extends Omit<SplitProjectSession, 'images' | 'tabs'> {
  attachedImages: AttachedImage[];
  tabs?: any[]; // Restored SplitWorkspaceTab[]
  activeTabId?: string;
}

/**
 * 将 File 对象转为 Base64 DataURL
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`无法读取图片文件: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * 将 Base64 DataURL 转回原生 File 对象
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  } catch {
    // 降级兜底：创建一个空的占位文件
    return new File([new Blob()], filename, { type: 'image/png' });
  }
}

/**
 * 导出完整拆分工程记录为 .json 文件
 */
export async function exportProjectSessionFile(
  sessionData: Omit<SplitProjectSession, 'version' | 'exportTime' | 'images'>,
  images: AttachedImage[],
  onProgress?: (current: number, total: number) => void,
  saveFile?: (json: string, filename: string) => Promise<void>
): Promise<void> {
  const totalImages = images.length;
  const serializedImages: SerializedImageRecord[] = [];

  // 并行将所有图片文件转换为 Base64，带进度反馈
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    onProgress?.(i + 1, totalImages);
    let dataUrl = '';
    try {
      if (img.file && img.file.size > 0) {
        dataUrl = await fileToDataUrl(img.file);
      }
    } catch (err) {
      console.warn(`[ProjectSessionManager] 图片转换 Base64 失败，跳过图片实体: ${img.name}`, err);
    }

    serializedImages.push({
      id: img.id,
      name: img.name,
      fullPath: img.fullPath || img.name,
      size: img.size || 0,
      gyazoUrl: img.gyazoUrl,
      dataUrl: dataUrl || undefined
    });
  }

  // 序列化所有 tabs（如果有）
  let serializedTabs: any[] | undefined = undefined;
  if (Array.isArray(sessionData.tabs) && sessionData.tabs.length > 0) {
    serializedTabs = [];
    for (const tab of sessionData.tabs) {
      const tabImages: SerializedImageRecord[] = [];
      const tabImgs = tab.attachedImages || [];
      for (let j = 0; j < tabImgs.length; j++) {
        const img = tabImgs[j];
        let dataUrl = '';
        try {
          if (img.file && img.file.size > 0) {
            dataUrl = await fileToDataUrl(img.file);
          }
        } catch (err) {
          console.warn(`[ProjectSessionManager] 标签页图片转换 Base64 失败: ${img.name}`, err);
        }
        tabImages.push({
          id: img.id,
          name: img.name,
          fullPath: img.fullPath || img.name,
          size: img.size || 0,
          gyazoUrl: img.gyazoUrl,
          dataUrl: dataUrl || undefined
        });
      }
      serializedTabs.push({
        ...tab,
        attachedImages: tabImages
      });
    }
  }

  const project: SplitProjectSession = {
    version: 1,
    exportTime: new Date().toISOString(),
    title: sessionData.title || '拆分工程',
    templateSource: sessionData.templateSource,
    batchTemplateMode: sessionData.batchTemplateMode,
    batchTemplateDrafts: sessionData.batchTemplateDrafts,
    activeBatchDraftIndex: sessionData.activeBatchDraftIndex,
    activeBatchSourceIndex: sessionData.activeBatchSourceIndex,
    promptTemplate: sessionData.promptTemplate,
    sourcePromptTemplates: sessionData.sourcePromptTemplates,
    sourceImageGroupBindings: sessionData.sourceImageGroupBindings,
    templatePresets: sessionData.templatePresets,
    perSourceTemplateMode: sessionData.perSourceTemplateMode,
    storyboardMode: sessionData.storyboardMode,
    multiPresetIds: sessionData.multiPresetIds,
    splitSettings: sessionData.splitSettings,
    templateSegments: sessionData.templateSegments,
    images: serializedImages,
    imageBindingMode: sessionData.imageBindingMode,
    copiedSegmentIds: sessionData.copiedSegmentIds,
    copiedImageIds: sessionData.copiedImageIds,
    selectedSegmentIds: sessionData.selectedSegmentIds,
    tabs: serializedTabs,
    activeTabId: sessionData.activeTabId
  };

  const jsonStr = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // 清洗文件名：去除非法字符
  const cleanTitle = (sessionData.title || '未命名文案')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .slice(0, 30);
  const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `拆分工程_${cleanTitle}_${nowStr}.aitkproj.json`;

  if (saveFile) {
    URL.revokeObjectURL(url);
    await saveFile(jsonStr, filename);
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 从 JSON 文件解析并恢复完整工程记录
 */
export async function importProjectSessionFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<RestoredProjectSession> {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取工程文件失败'));
    reader.readAsText(file, 'utf-8');
  });

  let rawData: any;
  try {
    rawData = JSON.parse(text);
  } catch {
    throw new Error('所选文件不是有效的 JSON 工程文件格式');
  }

  if (!rawData || typeof rawData !== 'object') {
    throw new Error('工程文件内容损坏或不符合规范');
  }

  // 重构图片对象 AttachedImage[]
  const rawImages = Array.isArray(rawData.images) ? rawData.images : [];
  const restoredImages: AttachedImage[] = [];

  for (let i = 0; i < rawImages.length; i++) {
    const imgData: SerializedImageRecord = rawImages[i];
    onProgress?.(i + 1, rawImages.length);

    let fileObj: File;
    let url = '';

    if (imgData.dataUrl && imgData.dataUrl.startsWith('data:')) {
      fileObj = dataUrlToFile(imgData.dataUrl, imgData.name);
      url = URL.createObjectURL(fileObj);
    } else {
      // 若无 dataUrl，用占位 Blob
      fileObj = new File([new Blob()], imgData.name, { type: 'image/png' });
      url = imgData.gyazoUrl || '';
    }

    restoredImages.push({
      id: imgData.id,
      name: imgData.name,
      fullPath: imgData.fullPath || imgData.name,
      url,
      file: fileObj,
      size: imgData.size || fileObj.size,
      gyazoUrl: imgData.gyazoUrl
    });
  }

  // 还原所有标签页（如果存在）
  let restoredTabs: any[] | undefined = undefined;
  if (Array.isArray(rawData.tabs) && rawData.tabs.length > 0) {
    restoredTabs = [];
    for (const rawTab of rawData.tabs) {
      const tabRawImages = Array.isArray(rawTab.attachedImages) ? rawTab.attachedImages : [];
      const tabRestoredImages: AttachedImage[] = [];
      for (const imgData of tabRawImages) {
        let fileObj: File;
        let url = '';
        if (imgData.dataUrl && imgData.dataUrl.startsWith('data:')) {
          fileObj = dataUrlToFile(imgData.dataUrl, imgData.name);
          url = URL.createObjectURL(fileObj);
        } else {
          fileObj = new File([new Blob()], imgData.name, { type: 'image/png' });
          url = imgData.gyazoUrl || '';
        }
        tabRestoredImages.push({
          id: imgData.id,
          name: imgData.name,
          fullPath: imgData.fullPath || imgData.name,
          url,
          file: fileObj,
          size: imgData.size || fileObj.size,
          gyazoUrl: imgData.gyazoUrl
        });
      }
      restoredTabs.push({
        ...rawTab,
        attachedImages: tabRestoredImages
      });
    }
  }

  return {
    version: 1,
    exportTime: rawData.exportTime || new Date().toISOString(),
    title: rawData.title || file.name.replace(/\.(aitkproj|json)$/i, ''),
    templateSource: rawData.templateSource || '',
    batchTemplateMode: Boolean(rawData.batchTemplateMode),
    batchTemplateDrafts: Array.isArray(rawData.batchTemplateDrafts) ? rawData.batchTemplateDrafts : [],
    activeBatchDraftIndex: typeof rawData.activeBatchDraftIndex === 'number' ? rawData.activeBatchDraftIndex : 0,
    activeBatchSourceIndex: typeof rawData.activeBatchSourceIndex === 'number' ? rawData.activeBatchSourceIndex : null,
    promptTemplate: rawData.promptTemplate || '',
    sourcePromptTemplates: rawData.sourcePromptTemplates || {},
    sourceImageGroupBindings: rawData.sourceImageGroupBindings || {},
    templatePresets: Array.isArray(rawData.templatePresets) ? rawData.templatePresets : [],
    perSourceTemplateMode: Boolean(rawData.perSourceTemplateMode),
    storyboardMode: Boolean(rawData.storyboardMode),
    multiPresetIds: Array.isArray(rawData.multiPresetIds) ? rawData.multiPresetIds : [],
    splitSettings: rawData.splitSettings || {
      templateSplitStrategy: 'length',
      splitMinimum: 15,
      splitMaximum: 30,
      splitUnit: 'chars',
      lineWidth: 25,
      wrapMode: 'smart',
      splitTolerance: 3,
      allowTolerance: true,
      keepSentences: true,
      sentencePauseOnly: true,
      quoteSplitSegments: false,
      lowercaseSplitOutput: false
    },
    templateSegments: Array.isArray(rawData.templateSegments) ? rawData.templateSegments : [],
    attachedImages: restoredImages,
    imageBindingMode: rawData.imageBindingMode === 'per-copy' ? 'per-copy' : 'per-segment',
    copiedSegmentIds: Array.isArray(rawData.copiedSegmentIds) ? rawData.copiedSegmentIds : [],
    copiedImageIds: Array.isArray(rawData.copiedImageIds) ? rawData.copiedImageIds : [],
    selectedSegmentIds: Array.isArray(rawData.selectedSegmentIds) ? rawData.selectedSegmentIds : [],
    tabs: restoredTabs,
    activeTabId: rawData.activeTabId
  };
}
