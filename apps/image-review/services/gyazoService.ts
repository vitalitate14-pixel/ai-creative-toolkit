/** Local image conversion. Existing service path retained for import compatibility. */
export const base64ToFile = (base64Data: string, filename: string = 'image.png'): File | null => {
    try {
        // 检查是否是有效的 data URL
        if (!base64Data || typeof base64Data !== 'string') {
            console.error('[gyazoService] Invalid base64 data: empty or not a string',
                '\nFilename:', filename,
                '\nType:', typeof base64Data);
            console.trace('[gyazoService] Stack trace:');
            return null;
        }

        console.log('[gyazoService] base64 data length:', base64Data.length);

        // 检查并提取 base64 内容
        let base64Content: string;
        let mimeType = 'image/png';

        if (base64Data.startsWith('data:')) {
            // 使用 split 更稳健地提取
            const commaIndex = base64Data.indexOf(',');
            if (commaIndex === -1) {
                console.error('[gyazoService] Invalid data URL format: no comma found');
                return null;
            }

            const header = base64Data.substring(0, commaIndex);
            base64Content = base64Data.substring(commaIndex + 1);

            // 提取 MIME 类型
            const mimeMatch = header.match(/data:(image\/[^;]+)/);
            if (mimeMatch) {
                mimeType = mimeMatch[1];
            }
        } else {
            // 假设是纯 base64 字符串
            base64Content = base64Data;
        }

        // 移除可能的空白字符
        base64Content = base64Content.replace(/\s/g, '');

        // 验证 base64 字符串格式（简化检查）
        if (base64Content.length === 0) {
            console.error('[gyazoService] Empty base64 content after extraction',
                '\nFilename:', filename,
                '\nData length:', base64Data.length);
            console.trace('[gyazoService] Stack trace:');
            return null;
        }

        console.log('[gyazoService] Extracted base64 content length:', base64Content.length);

        const byteCharacters = atob(base64Content);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        console.log('[gyazoService] Created file, size:', byteArray.length, 'bytes');
        return new File([byteArray], filename, { type: mimeType });
    } catch (error) {
        console.error('[gyazoService] base64ToFile error:', error);
        return null;
    }
};
