export function parseAnnotatedSegments(raw: string): { annotation: string; durationSeconds?: number; text: string }[] {
  return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const match = line.match(/^([^｜|]+)[｜|](.+)$/);
    if (!match || !match[1].trim() || !match[2].trim()) throw new Error(`第 ${index + 1} 行需使用“标注｜正文”格式`);
    let text = match[2].trim();
    const durationMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:s|秒)\s*[｜|]\s*(.*)$/i);
    const durationSeconds = durationMatch ? Number(durationMatch[1]) : undefined;
    if (durationMatch) {
      if (!durationSeconds || !Number.isFinite(durationSeconds)) throw new Error(`第 ${index + 1} 行时长需大于 0 秒`);
      text = durationMatch[2].trim();
    }
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/\\"/g, '"');
    if (!text.trim()) throw new Error(`第 ${index + 1} 行正文为空`);
    return { annotation: match[1].trim(), ...(durationSeconds !== undefined ? { durationSeconds } : {}), text };
  });
}
