import type { TemplatePreset } from '../constants/presetDefaults';

/** 快捷图＋词：不经过拆分流程，直接由「图片 + 文案（可选）+ 预设」生成交付表格。 */

export const QUICK_CONTENT_PLACEHOLDER = '{{内容}}';
/** 与「自定义模板文案」保持一致：不提供文案时，每段内容为 0。 */
export const QUICK_ZERO_CONTENT = '0';

export interface QuickImage {
  originalPath?: string;
  id: string;
  name: string;
  fullPath: string;
  url: string;
  file: File;
}

/** per-article：单篇一图（整篇一行）；storyboard：分镜（每行文案一张图）。 */
export type QuickLayout = 'per-article' | 'storyboard';
/** blank：空行或 --- 分篇；line：每行一篇。 */
export type QuickArticleSplit = 'blank' | 'line';
/** each：每个预设各出一套；sequence：预设轮流分配；random：随机分配。 */
export type QuickPresetMode = 'each' | 'sequence' | 'random';
/** unit：同一张图的多个预设结果排在一起；preset：同一预设成套排列。 */
export type QuickRowOrder = 'unit' | 'preset';

export interface QuickUnit {
  /** 文章序号（从 0 开始） */
  article: number;
  /** 文章内片段序号（从 0 开始） */
  part: number;
  content: string;
  image?: QuickImage;
}

export interface QuickRow {
  id: string;
  unitIndex: number;
  article: number;
  part: number;
  content: string;
  image?: QuickImage;
  preset: TemplatePreset;
  /** 同一预设的第几份（从 0 开始） */
  copy: number;
  /** 预设是否为手动指定 */
  manualPreset?: boolean;
  prompt: string;
}

export const getQuickImageGroupKey = (image: QuickImage) => {
  const parts = (image.fullPath || image.name).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '未分组图片';
};

export const naturalSortQuickImages = (images: QuickImage[]) =>
  [...images].sort((a, b) => (a.fullPath || a.name).localeCompare(b.fullPath || b.name, undefined, { numeric: true, sensitivity: 'base' }));

export function parseQuickArticles(text: string, split: QuickArticleSplit): string[][] {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return [];
  if (split === 'line') {
    return normalized.split('\n').map(line => line.trim()).filter(Boolean).map(line => [line]);
  }
  return normalized
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, '\n')
    .split(/\n[ \t]*\n/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean))
    .filter(lines => lines.length > 0);
}

/** 把图片按文件夹分组；保持自然排序。 */
export function groupQuickImages(images: QuickImage[]) {
  const groups = new Map<string, QuickImage[]>();
  naturalSortQuickImages(images).forEach(image => {
    const key = getQuickImageGroupKey(image);
    groups.set(key, [...(groups.get(key) || []), image]);
  });
  return Array.from(groups.entries()).map(([key, items]) => ({ key, images: items }));
}

export interface BuildUnitsResult {
  units: QuickUnit[];
  /** 是否按「每个文件夹对应一篇文案」分配 */
  folderPerArticle: boolean;
  unusedImages: number;
  missingImages: number;
}

export function buildQuickUnits(articles: string[][], images: QuickImage[], layout: QuickLayout): BuildUnitsResult {
  const sorted = naturalSortQuickImages(images);
  // 不提供文案：每张图一行，内容为 0（与自定义模板文案一致）。
  if (!articles.length) {
    const groups = groupQuickImages(sorted);
    const units: QuickUnit[] = [];
    groups.forEach((group, article) => group.images.forEach((image, part) => units.push({ article, part, content: QUICK_ZERO_CONTENT, image })));
    return { units, folderPerArticle: groups.length > 1, unusedImages: 0, missingImages: 0 };
  }

  if (layout === 'per-article') {
    const units = articles.map((lines, article) => ({ article, part: 0, content: lines.join('\n'), image: sorted[article] }));
    return {
      units,
      folderPerArticle: false,
      unusedImages: Math.max(0, sorted.length - articles.length),
      missingImages: sorted.length ? Math.max(0, articles.length - sorted.length) : 0
    };
  }

  const groups = groupQuickImages(sorted);
  const folderPerArticle = groups.length > 1 && groups.length === articles.length;
  const units: QuickUnit[] = [];
  let flatIndex = 0;
  let used = 0;
  let missing = 0;
  articles.forEach((lines, article) => {
    lines.forEach((content, part) => {
      const image = folderPerArticle ? groups[article].images[part] : sorted[flatIndex++];
      if (image) used++;
      else if (sorted.length) missing++;
      units.push({ article, part, content, image });
    });
  });
  return { units, folderPerArticle, unusedImages: Math.max(0, sorted.length - used), missingImages: missing };
}

export const fillQuickTemplate = (template: string, content: string) => template.split(QUICK_CONTENT_PLACEHOLDER).join(content);

/** 可复现的伪随机数，避免每次重新渲染时结果都变化。 */
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildQuickRows(
  units: QuickUnit[],
  presets: TemplatePreset[],
  mode: QuickPresetMode,
  order: QuickRowOrder,
  seed: number,
  copiesPerPreset = 1,
  /** 手动指定的预设（仅「轮流 / 随机」模式生效，每个片段一行） */
  getManualPreset?: (unit: QuickUnit, unitIndex: number) => TemplatePreset | undefined
): QuickRow[] {
  if (!units.length || !presets.length) return [];
  const make = (unit: QuickUnit, unitIndex: number, preset: TemplatePreset, copy: number, manualPreset = false): QuickRow => ({
    id: `${unitIndex}|${preset.id}|${copy}`,
    unitIndex,
    article: unit.article,
    part: unit.part,
    content: unit.content,
    image: unit.image,
    preset,
    copy,
    manualPreset,
    prompt: fillQuickTemplate(preset.template, unit.content)
  });

  if (mode === 'each') {
    const copies = Math.max(1, Math.min(100, Math.floor(copiesPerPreset) || 1));
    const rows: QuickRow[] = [];
    if (order === 'unit') {
      units.forEach((unit, unitIndex) => presets.forEach(preset => {
        for (let copy = 0; copy < copies; copy++) rows.push(make(unit, unitIndex, preset, copy));
      }));
    } else {
      presets.forEach(preset => {
        for (let copy = 0; copy < copies; copy++) units.forEach((unit, unitIndex) => rows.push(make(unit, unitIndex, preset, copy)));
      });
    }
    return rows;
  }

  const random = seededRandom(seed);
  return units.map((unit, unitIndex) => {
    // 先取随机数再判断手动，保证手动改某一行时其它行的随机结果不变。
    const auto = mode === 'random' ? presets[Math.floor(random() * presets.length)] : presets[unitIndex % presets.length];
    const manual = getManualPreset?.(unit, unitIndex);
    return make(unit, unitIndex, manual ?? auto, 0, Boolean(manual));
  });
}

/** TSV 单元格中含换行/制表符/引号时加引号，保证纯文本粘贴时不串格。 */
export const toTsv = (grid: string[][]) => grid
  .map(row => row.map(value => /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join('\t'))
  .join('\n');
