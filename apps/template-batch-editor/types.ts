
export type CellValue = string;
export type GridData = CellValue[][];

export enum ToolType {
  SplitThree = 'SPLIT_THREE',
  SplitTwo = 'SPLIT_TWO',
  CleanBreaks = 'CLEAN_BREAKS',
  VideoPrompts = 'VIDEO_PROMPTS',
  ClearChinese = 'CLEAR_CHINESE',  // 删除选中区域内的中文内容
  AddPromptPrefix = 'ADD_PROMPT_PREFIX',  // 给每个单元格添加 prompt-序号 前缀
  SmartSplit = 'SMART_SPLIT',  // 半智能拆分：优先换行 → 冒号 → 英文句号 → 关键词
  MultiPanelPrompt = 'MULTI_PANEL_PROMPT',  // 多画面提示词：将文案自动生成多画面分割图格式
  CleanTails = 'CLEAN_TAILS',  // 清理尾部水印标签
  CleanEmojis = 'CLEAN_EMOJIS', // 清理表情符号
  AutoWrap = 'AUTO_WRAP',  // 自动断行（英文单词不断开）
  ArrangeParallel = 'ARRANGE_PARALLEL', // 排比句排列式格式化
  SplitLinesVertical = 'SPLIT_LINES_VERTICAL', // 按行拆分为多行单元格（竖向向下排列，保留引号）
}

export interface Coordinate {
  row: number;
  col: number;
}

export interface GridSelection {
  start: Coordinate;
  end: Coordinate;
}


// Maps to the visual column headers (A, B, C...)
export const COL_HEADERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

// Options for grid processing
export interface ProcessOptions {
  clearSource?: boolean;  // 拆分后是否删除原始文案
  customPrefix?: string;  // 自定义前缀（用于 AddPromptPrefix 工具）
  lineWidth?: number; // 断行宽度（用于 AutoWrap 工具）
}

// Cell styling (for background colors)
export interface CellStyle {
  bgColor?: string;  // Background color (e.g., '#FFA500' for orange)
}

// Grid styles: Map<"row,col", CellStyle>
export type GridStyles = Map<string, CellStyle>;

// Helper to create cell key
export const cellKey = (row: number, col: number): string => `${row},${col}`;

export type SplitUnit = 'words' | 'characters';
export type TemplateSplitStrategy = 'range' | 'punctuation' | 'sermon' | 'ai';

export interface TemplateSegment {
  deliveryGroupName?: string;
  annotation?: string;
  durationSeconds?: number;
  id: string;
  text: string;
  sourceIndex?: number;
  wrappedText?: string;
  presetId?: string;
  promptTemplate?: string;
  finalPrompt?: string;
  customPrompts?: Record<string, string>;
  imageId?: string; // 手动指定的图片ID，或 '__NONE__' 表示手动解除绑定
  modifiedType?: 'split' | 'merge' | 'shift' | 'edit' | 'resplit' | 'sermon'; // 变更标记：拆分、合并、文字后移、编辑文本、重新拆分、8s讲道
  modifiedAt?: number;
}

export interface BatchTemplateDraft {
  id: string;
  source: string;
  templateMode: 'global' | 'custom';
  template: string;
}

export interface SplitTabSettings {
  templateSplitStrategy: TemplateSplitStrategy;
  splitMinimum: number;
  splitMaximum: number;
  splitUnit: SplitUnit;
  lineWidth: number;
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
}

export interface SplitWorkspaceTab {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;

  // 文案与草稿
  templateSource: string;
  batchTemplateMode: boolean;
  batchTemplateDrafts: BatchTemplateDraft[];
  activeBatchDraftIndex: number;
  activeBatchSourceIndex: number | null;

  // 描述词模板与预设
  promptTemplate: string;
  sourcePromptTemplates: Record<number, string>;
  sourceImageGroupBindings?: Record<number, string>;
  perSourceTemplateMode: boolean;
  storyboardMode: boolean;
  selectedPresetId: string;
  presetName: string;
  multiPresetIds: string[];

  // 拆分参数
  splitSettings: SplitTabSettings;

  // 拆分结果片段
  templateSegments: TemplateSegment[];
  selectedSegmentIds: string[];
  segmentCarets: Record<string, number>;

  // 绑定的图片实体及模式
  attachedImages: any[]; // AttachedImage[]
  imageBindingMode: 'per-segment' | 'per-copy';

  // 作业进度标记
  copiedSegmentIds: string[];
  copiedImageIds: string[];
}

export const createDefaultWorkspaceTab = (id: string, title: string): SplitWorkspaceTab => ({
  id,
  title,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  templateSource: '',
  batchTemplateMode: true,
  batchTemplateDrafts: [
    { id: `batch-draft-${Date.now()}-1`, source: '', templateMode: 'global', template: '' }
  ],
  activeBatchDraftIndex: 0,
  activeBatchSourceIndex: null,
  promptTemplate: '内容："{{内容}}"',
  sourcePromptTemplates: {},
  sourceImageGroupBindings: {},
  perSourceTemplateMode: false,
  storyboardMode: false,
  selectedPresetId: '',
  presetName: '',
  multiPresetIds: [],
  splitSettings: {
    templateSplitStrategy: 'punctuation',
    splitMinimum: 10,
    splitMaximum: 18,
    splitUnit: 'words',
    lineWidth: 18,
    splitTolerance: 3,
    allowTolerance: true,
    keepSentences: true,
    sentencePauseOnly: true,
    quoteSplitSegments: true,
    lowercaseSplitOutput: false,
    includeBatchTextNumbering: false,
    includeBatchPromptNumbering: false,
    batchNumberStyle: 'dot',
    includeBatchEmptyLines: false
  },
  templateSegments: [],
  selectedSegmentIds: [],
  segmentCarets: {},
  attachedImages: [],
  imageBindingMode: 'per-segment',
  copiedSegmentIds: [],
  copiedImageIds: []
});
