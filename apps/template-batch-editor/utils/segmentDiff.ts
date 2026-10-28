import { TemplateSegment } from '../types';

export interface SegmentDiffMetrics {
  beforeCount: number;
  afterCount: number;
  countDiff: number;
  beforeTotalChars: number;
  afterTotalChars: number;
  charDiff: number;
  isExactTextEqual: boolean;
  isSameCharCount: boolean;
}

export interface ChangedSegmentGroup {
  beforeStartIndex: number;
  beforeSegments: TemplateSegment[];
  afterStartIndex: number;
  afterSegments: TemplateSegment[];
  changeType: 'split' | 'merge' | 'edit' | 'delete' | 'insert' | 'complex';
}

export interface SegmentDiffResult {
  metrics: SegmentDiffMetrics;
  changedGroups: ChangedSegmentGroup[];
  hasChanges: boolean;
}

const normalizeTextForCount = (text: string): string => {
  return (text || '').replace(/\s+/g, '').trim();
};

/**
 * 计算两个分镜列表之间的差异与指标统计
 */
export function computeSegmentDiff(
  before: TemplateSegment[] = [],
  after: TemplateSegment[] = []
): SegmentDiffResult {
  const beforeCount = before.length;
  const afterCount = after.length;
  const countDiff = afterCount - beforeCount;

  const beforeCombined = before.map(s => s.text).join('\n');
  const afterCombined = after.map(s => s.text).join('\n');

  const beforeTotalChars = before.reduce((acc, s) => acc + (s.text || '').length, 0);
  const afterTotalChars = after.reduce((acc, s) => acc + (s.text || '').length, 0);
  const charDiff = afterTotalChars - beforeTotalChars;

  const normBefore = normalizeTextForCount(beforeCombined);
  const normAfter = normalizeTextForCount(afterCombined);
  const isExactTextEqual = normBefore === normAfter;
  const isSameCharCount = beforeTotalChars === afterTotalChars;

  const hasChanges = beforeCombined !== afterCombined || beforeCount !== afterCount;

  // 识别变更段落群组
  // 查找头部未变更段落数量
  let prefixMatch = 0;
  const minLen = Math.min(beforeCount, afterCount);
  while (prefixMatch < minLen && before[prefixMatch].text.trim() === after[prefixMatch].text.trim()) {
    prefixMatch++;
  }

  // 查找尾部未变更段落数量
  let suffixMatch = 0;
  const maxSuffix = minLen - prefixMatch;
  while (
    suffixMatch < maxSuffix &&
    before[beforeCount - 1 - suffixMatch].text.trim() === after[afterCount - 1 - suffixMatch].text.trim()
  ) {
    suffixMatch++;
  }

  const beforeChanged = before.slice(prefixMatch, beforeCount - suffixMatch);
  const afterChanged = after.slice(prefixMatch, afterCount - suffixMatch);

  const changedGroups: ChangedSegmentGroup[] = [];

  if (beforeChanged.length > 0 || afterChanged.length > 0) {
    let changeType: ChangedSegmentGroup['changeType'] = 'edit';
    if (beforeChanged.length === 1 && afterChanged.length > 1) {
      changeType = 'split'; // 1段拆成了多段
    } else if (beforeChanged.length > 1 && afterChanged.length === 1) {
      changeType = 'merge'; // 多段合并成了1段
    } else if (beforeChanged.length > 0 && afterChanged.length === 0) {
      changeType = 'delete'; // 删除了段落
    } else if (beforeChanged.length === 0 && afterChanged.length > 0) {
      changeType = 'insert'; // 插入了段落
    } else if (beforeChanged.length > 1 && afterChanged.length > 1) {
      changeType = 'complex'; // 复杂变更（如多段合并重拆）
    }

    changedGroups.push({
      beforeStartIndex: prefixMatch,
      beforeSegments: beforeChanged,
      afterStartIndex: prefixMatch,
      afterSegments: afterChanged,
      changeType
    });
  }

  return {
    metrics: {
      beforeCount,
      afterCount,
      countDiff,
      beforeTotalChars,
      afterTotalChars,
      charDiff,
      isExactTextEqual,
      isSameCharCount
    },
    changedGroups,
    hasChanges
  };
}
