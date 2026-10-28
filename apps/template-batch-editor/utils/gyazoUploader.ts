import { getOriginalImagePath } from './originalImagePath';
/**
 * 确保 Gyazo URL 为图片直链（i.gyazo.com/xxx.png）
 * 供 Google Sheets =IMAGE() 函数直接读取渲染
 */
export function normalizeGyazoDirectUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  // 如果是 https://gyazo.com/xxx 形式，转换为 https://i.gyazo.com/xxx.png
  const gyazoMatch = trimmed.match(/^https?:\/\/gyazo\.com\/([a-zA-Z0-9]+)/);
  if (gyazoMatch && gyazoMatch[1]) {
    return `https://i.gyazo.com/${gyazoMatch[1]}.png`;
  }
  return trimmed;
}




/**
 * 将图片 URL 或文件名转为 Google Sheets =IMAGE() 缩略图公式
 */
export function toGoogleSheetsImageFormula(urlOrName?: string): string {
  if (!urlOrName) return '';
  const trimmed = urlOrName.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // Double quotes must be doubled so a URL cannot close the string and inject formula code.
    return `=IMAGE("${normalizeGyazoDirectUrl(trimmed).replace(/"/g, '""')}")`;
  }
  return trimmed;
}

export function guessMimeType(filename: string): string {
  const ext = filename?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/png';
  }
}

/**
 * 将 File 转换为 PNG 格式的 Blob
 * 现代浏览器剪贴板 API 规范要求写入位图时必须为 image/png
 * 采用 4 重逐级降级机制：createImageBitmap 原生解码 -> DOM 显存图像直接提取 -> FileReader DataURL 补全 MIME -> 经典 ObjectURL
 */
export async function fileToPngBlob(file: File, fallbackUrl?: string, reencode = false): Promise<Blob> {
  // 1. 如果原始文件已经是 image/png，直接返回
  if (!reencode && file instanceof Blob && file.size > 0 && file.type === 'image/png') {
    return file;
  }

  // 2. 方案一（首选，速度极快且免疫 DOM/MIME 解析异常）：createImageBitmap 原生多线程硬解码
  if (typeof createImageBitmap === 'function' && file) {
    try {
      const mime = file.type || guessMimeType(file.name);
      const typedBlob = file.type ? file : new Blob([file], { type: mime });
      const bitmap = await createImageBitmap(typedBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) return blob;
      }
    } catch (bitmapErr) {
      console.warn('createImageBitmap 解码失败，尝试下一级降级方案:', bitmapErr);
    }
  }

  // 3. 方案二：如果页面中已存在对应 <img> DOM 元素（直接从显存 Canvas 抓取，100% 成功率）
  if (fallbackUrl) {
    try {
      const existingImg = document.querySelector(`img[src="${fallbackUrl}"]`) as HTMLImageElement | null;
      if (existingImg && existingImg.complete && existingImg.naturalWidth > 0 && existingImg.naturalHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = existingImg.naturalWidth;
        canvas.height = existingImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(existingImg, 0, 0);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          if (blob) return blob;
        }
      }
    } catch (domErr) {
      console.warn('从 DOM 图像提取 Canvas 失败，尝试下一级降级方案:', domErr);
    }
  }

  // 4. 方案三：FileReader 转 Data URL，补全标准图片 MIME，防止 createObjectURL 空 MIME 报错
  if (file) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader 读取文件流失败'));
        const mime = file.type || guessMimeType(file.name);
        const typedBlob = file.type ? file : new Blob([file], { type: mime });
        reader.readAsDataURL(typedBlob);
      });

      const blobResult = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('无法创建 Canvas 2D 上下文'));
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(blob => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas 转换 PNG 失败'));
            }, 'image/png');
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('DataURL 图片解码失败'));
        img.src = dataUrl;
      });
      if (blobResult) return blobResult;
    } catch (readerErr) {
      console.warn('FileReader DataURL 方式转换失败，尝试经典方案:', readerErr);
    }
  }

  // 5. 方案四：经典 URL.createObjectURL 降级
  return new Promise((resolve, reject) => {
    const img = new Image();
    const targetUrl = fallbackUrl || (file ? URL.createObjectURL(file) : '');
    if (!targetUrl) return reject(new Error('未找到可用图片源'));

    const isCreatedBlob = !fallbackUrl && file;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (isCreatedBlob) URL.revokeObjectURL(targetUrl);
          return reject(new Error('无法创建 Canvas 2D 绘图上下文'));
        }
        ctx.drawImage(img, 0, 0);
        if (isCreatedBlob) URL.revokeObjectURL(targetUrl);
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas 转换 PNG 失败'));
        }, 'image/png');
      } catch (e) {
        if (isCreatedBlob) URL.revokeObjectURL(targetUrl);
        reject(e);
      }
    };
    img.onerror = () => {
      if (isCreatedBlob) URL.revokeObjectURL(targetUrl);
      reject(new Error('加载图片以转位图失败'));
    };
    img.src = targetUrl;
  });
}

/**
 * 快速复制原始图片位图到系统剪切板（支持微信/PS/画图等直接粘贴）
 */
export async function copyImageToClipboard(
  file: File,
  fallbackUrl?: string,
  originalPath?: string
): Promise<{ success: boolean; error?: string }> {
  if (!(file instanceof Blob && file.size > 0) && !fallbackUrl) {
    return { success: false, error: '图片素材缺失，请点击“查找素材”重新关联原图片' };
  }
  const api = (window as any).electronAPI;
  if (api?.copyImagePromptSheetImage) {
    const resolvedPath = getOriginalImagePath({ file, originalPath });
    if (resolvedPath) {
      try { return await api.copyImagePromptSheetImage('', file?.name, resolvedPath); }
      catch (error: any) { return { success: false, error: error?.message || '原路径图片复制失败' }; }
    }
    const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('原图读取失败，文件可能已被修改或移动'));
      reader.readAsDataURL(blob);
    });
    let originalError = '';
    try {
      if (file instanceof Blob && file.size > 0) {
        const result = await api.copyImagePromptSheetImage(await readDataUrl(file), file.name);
        if (result?.success) return result;
        originalError = result?.error || '原图复制失败';
      }
    } catch (error: any) {
      originalError = error?.message || '原图读取失败';
    }
    // 原文件失效或原生解码器不支持时，从可用图片源转成 PNG 后重试。
    try {
      const png = await fileToPngBlob(file, fallbackUrl, true);
      const name = `${(file?.name || '图片').replace(/\.[^.]+$/, '')}.png`;
      return await api.copyImagePromptSheetImage(await readDataUrl(png), name);
    } catch (error: any) {
      return { success: false, error: `${originalError || error?.message || '图片读取失败'}；请尝试“查找素材”重新关联图片` };
    }
  }
  if (!navigator.clipboard || !window.ClipboardItem) {
    return { success: false, error: '当前浏览器环境不支持原生剪贴板写位图 API' };
  }
  try {
    // 在点击事件中立即请求写入，图片异步解码交给 ClipboardItem，避免丢失用户激活状态。
    const item = new ClipboardItem({ 'image/png': fileToPngBlob(file, fallbackUrl) });
    await navigator.clipboard.write([item]);
    return { success: true };
  } catch (err: any) {
    console.error('复制图片位图失败:', err);
    return { success: false, error: err?.message || '写入剪贴板失败' };
  }
}

/**
 * 尝试将「图片位图」和「最终描述词」复合写入剪贴板
 * 在富文本编辑器中可同时粘贴图文；在纯文本框中粘贴描述词；在聊天工具中粘贴图片
 */
export async function copyImageAndPromptToClipboard(
  file: File,
  promptText: string,
  gyazoUrl?: string,
  fallbackUrl?: string
): Promise<{ success: boolean; message: string }> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return { success: false, message: '浏览器不支持高级剪贴板写入' };
  }

  try {
    const pngBlob = await fileToPngBlob(file, fallbackUrl);
    const textBlob = new Blob([promptText], { type: 'text/plain' });

    const directImgUrl = gyazoUrl ? normalizeGyazoDirectUrl(gyazoUrl) : '';
    // 构建富文本 HTML
    const htmlSnippet = `
      <div style="font-family: sans-serif; line-height: 1.5;">
        ${directImgUrl ? `<img src="${directImgUrl}" alt="分镜图片" style="max-width: 320px; border-radius: 6px; display: block; margin-bottom: 8px;" />` : ''}
        <p style="margin: 0; white-space: pre-wrap;">${promptText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>
      </div>
    `.trim();
    const htmlBlob = new Blob([htmlSnippet], { type: 'text/html' });

    // 尝试写入包含 image/png + text/plain + text/html 的复合 ClipboardItem
    try {
      const compositeItem = new ClipboardItem({
        'image/png': pngBlob,
        'text/plain': textBlob,
        'text/html': htmlBlob
      });
      await navigator.clipboard.write([compositeItem]);
      return {
        success: true,
        message: '✅ 已将图片与描述词同时写入剪贴板！（富文本应用粘贴图文，纯文本框粘贴描述词）'
      };
    } catch (compoundErr) {
      console.warn('复合多类型剪贴板写入失败，降级为先复制图片位图:', compoundErr);
      // 降级：仅写入位图
      const imageItem = new ClipboardItem({ 'image/png': pngBlob });
      await navigator.clipboard.write([imageItem]);
      return {
        success: true,
        message: '✅ 原始图片位图已复制到剪切板！（复合图文格式当前浏览器受限，已优先保留图片）'
      };
    }
  } catch (err: any) {
    console.error('复制图片与描述词失败:', err);
    return {
      success: false,
      message: `复制失败: ${err?.message || '未知错误'}`
    };
  }
}
