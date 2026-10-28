const EDGE_SEPARATORS = /^[\s|/\\:：;；,，、—–-]+|[\s|/\\:：;；,，、—–-]+$/g;

export const removeDuplicatedChineseTranslation = (
    value: string,
    chineseText: string,
    languageCode: string
): string => {
    const translation = typeof value === 'string' ? value.trim() : '';
    const chinese = typeof chineseText === 'string' ? chineseText.trim() : '';
    if (!translation || !chinese || languageCode === 'zh') return translation;

    // Only remove a substantial, exact duplicate of the dedicated Chinese
    // field. This avoids deleting short Chinese names that legitimately occur
    // inside another language's translation.
    if (Array.from(chinese).length < 4 || !translation.includes(chinese)) return translation;
    return translation.replace(chinese, '').replace(EDGE_SEPARATORS, '').trim();
};

export const sanitizeTranslationMap = (
    translations: Record<string, string> | undefined,
    chineseText: string
): Record<string, string> | undefined => {
    if (!translations) return translations;
    return Object.fromEntries(
        Object.entries(translations).map(([code, value]) => [
            code,
            removeDuplicatedChineseTranslation(value, chineseText, code)
        ])
    );
};
