import { getOriginalImagePath } from './utils/originalImagePath';
import { arrangePresetSets, type GeneratedPresetSet, type GenerationOrder } from './utils/multiPresetGeneration';
import { cacheWorkspaceImages, restoreWorkspaceImages } from './utils/imagePersistence';
import { CustomTemplateCopyGenerator, createZeroTemplateSource } from '../../components/CustomTemplateCopyGenerator';
import { retainSegmentAssignments } from './utils/retainAssignments';
import { parseAnnotatedSegments } from './utils/annotatedSegments';
import { PageSizeControl, readPageSize } from './components/PageSizeControl';
import { DEFAULT_GROUP_NAME_TEMPLATE, GROUP_NAME_FIELDS, GROUP_NAME_PRESETS, formatGroupName, migrateGroupNameTemplate } from './utils/groupNaming';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Columns,
  Video,
  WrapText,
  Copy,
  Check,
  Grid3X3,
  Info,
  MousePointer2,
  Languages,
  CheckSquare,
  Hash,
  Zap,
  Sparkles,
  LayoutGrid,
  Eraser,
  Combine,
  Trash2,
  AlignLeft,
  Link2,
  ListOrdered,
  Scissors,
  FileInput,
  Download,
  Maximize2,
  Undo2,
  Redo2,
  BookOpen,
  Layers,
  Eye,
  Image as ImageIcon,
  FolderOpen,
  Cloud,
  CloudUpload,
  Loader2,
  CheckCircle2,
  ArrowDownCircle,
  Filter,
  RotateCcw,
  Repeat,
  ArrowLeftRight,
  Upload,
  Save,
  FileUp,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Crosshair,
  GitCompare,
  ArrowRight,
  Settings
} from 'lucide-react';
import { SplitControlSidebar } from './components/SplitControlSidebar';
import { PresetLibraryModal } from './components/PresetLibraryModal';
import { QuickImagePromptModal } from './components/QuickImagePromptModal';
import { CyclePresetModal } from './components/CyclePresetModal';
import { SegmentImagePickerModal } from './components/SegmentImagePickerModal';
import { SourceImageOrderModal } from './components/SourceImageOrderModal';
import { WorkspaceTabBar } from './components/WorkspaceTabBar';
import { SegmentDiffModal } from './components/SegmentDiffModal';
import { AiSplitPromptModal } from './components/AiSplitPromptModal';
import {
  ColumnVisibilityPopover,
  ColumnVisibilityConfig,
  DEFAULT_COLUMN_VISIBILITY
} from './components/ColumnVisibilityPopover';
import { EditorTextToolsDropdown } from './components/EditorTextToolsDropdown';
import { FlatCopyActions } from './components/FlatCopyActions';
import {
  exportProjectSessionFile,
  importProjectSessionFile,
  RestoredProjectSession
} from './utils/projectSessionManager';
import { TemplatePreset, DEFAULT_TEMPLATE_PRESETS, BUILTIN_TEMPLATE_PRESET_IDS } from './constants/presetDefaults';
import { detectAndInsertPlaceholder } from './utils/sheetPresetParser';
import {
  toGoogleSheetsImageFormula,
  copyImageToClipboard
} from './utils/gyazoUploader';
import {
  ImageDropZone,
  AttachedImage,
  ImageBindingMode,
  naturalSortImages
} from './components/ImageDropZone';
import {
  processGrid,
  formatForClipboard,
  colToLetter,
  autoWrapText,
  parsePreSplitText,
  parseMultiScriptPreSplit,
  analyzeSheetTable,
  ParsedScriptBatchItem,
  ParseMultiScriptOptions,
  convertNumbersToEnglishWords,
  splitText8sSermon
} from './utils/processor';
import { buildGoogleSheetsHtml, buildMergedCellsHtml, copyToClipboard } from './utils/clipboard';
import { GridData, ToolType, GridSelection, ProcessOptions, GridStyles, cellKey, SplitWorkspaceTab, createDefaultWorkspaceTab } from './types';
import { Button } from './components/UIComponents';
import { SpreadsheetGrid } from './components/SpreadsheetGrid';
import type { GoogleGenAI } from '@google/genai';

interface TemplateBatchEditorAppProps {
  getAiInstance?: () => GoogleGenAI | null;
  textModel?: string;
}

const LOCAL_MODEL_KEY = 'template_batch_editor_local_model';
const SCRIPT_TOOL_STATE_KEY = 'template_batch_editor_state_v1';
const INHERIT_VALUE = '__global__';

// 信仰词汇大写保护 — 与智能翻译共享同一 localStorage key
const DEITY_TERMS_KEY = 'smart_translate_deity_terms';
const DEFAULT_DEITY_TERMS = [
  'God', 'Lord', 'Jesus', 'Christ',
  'the Lord', 'Yahweh', 'the Lord God',
  'the Lord Jesus', 'Jesus Christ',
  'the Christ of the last days', 'Almighty God',
  'He', 'Heavenly Father', 'God the Father', 'Father',
  'the Almighty God', 'the Creator', 'the Most High',
  'King of kings', 'Lord of lords', 'Redeemer',
  'the Son of God', 'the Lamb of God',
  // Tagalog (Filipino) terms
  'Diyos', 'Panginoon', 'Panginoong', 'Hesus', 'Kristo',
  'Ama sa Langit', 'Diyos Ama', 'Ama', 'Tagalikha', 'Lumikha',
  'Manunubos', 'Anak ng Diyos', 'Kordero ng Diyos',
  'Espiritu Santo', 'Banal na Espiritu', 'Panginoong Hesus',
  'Diyos na Makapangyarihan', 'Makapangyarihang Diyos',
  'Siya', 'Kanya', 'Niya'
];

const loadDeityTerms = (): string[] => {
  if (typeof localStorage === 'undefined') return DEFAULT_DEITY_TERMS;
  try {
    const raw = localStorage.getItem(DEITY_TERMS_KEY);
    if (!raw) return DEFAULT_DEITY_TERMS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_DEITY_TERMS;
  } catch {
    return DEFAULT_DEITY_TERMS;
  }
};

const saveDeityTerms = (terms: string[]) => {
  try { localStorage.setItem(DEITY_TERMS_KEY, JSON.stringify(terms)); } catch {}
};

const AI_SPLIT_PROMPT_KEY = 'template_batch_editor_ai_split_custom_prompt';
const AI_SEGMENT_PROMPT_KEY = 'template_batch_editor_ai_segment_custom_prompt';
const DEFAULT_AI_SEGMENT_PROMPT = `Remove all line breaks from the original text. Split the copy into natural spoken segments that can each be read in about 8 seconds.

Rules:
- Prefer 12–21 English words per segment; do not create a segment shorter than 12 or longer than 21 words unless the source makes it unavoidable.
- Split at natural preaching / speaking pauses. Never cut a sentence or phrase in an unnatural place.
- Prefer fewer segments when combining text remains natural and within the range.
- Do not rewrite, omit, add, or change the original wording. Convert Arabic numerals to English words only.
- Return ONLY a JSON array of strings. Each string is one segment. Do not add explanations or markdown.`;
const DEFAULT_AI_SPLIT_PROMPT = `You are a title extractor for prayer/inspirational social media posts. For each numbered text, extract ONLY the short hook/title at the very beginning.

CRITICAL RULES:
- The title is the SHORTEST possible hook, headline, greeting, or attention-grabber at the start
- Prayer greetings like "Heavenly Father", "Dear God", "Dear Lord", "Father" are titles BY THEMSELVES — do NOT include the rest of the sentence
- ALL CAPS imperative phrases like "DON'T SKIP", "READ THIS", "STOP SCROLLING" are titles BY THEMSELVES
- Numbered list headers like "6 HEART-WARMING PRAYERS" end BEFORE the colon/number
- For regular sentences, use the first sentence (up to the first period)
- Return ONLY the EXACT characters from the original text, do NOT modify anything
- Titles should be SHORT — usually 2-10 words maximum

EXAMPLES (input → expected title):
- "DON'T SKIP PSALM 46:5: \\"God is within her...\\"" → "DON'T SKIP"
- "6 HEART-WARMING PRAYERS: 1. Dear Lord, please help me grow..." → "6 HEART-WARMING PRAYERS"
- "Heavenly Father, I come to you today trusting in your love..." → "Heavenly Father"
- "PRAYER AGAINST EVIL. Dear Heavenly Father, today I come before You..." → "PRAYER AGAINST EVIL."
- "God led you to read this. Sometimes God has to break you..." → "God led you to read this."
- "Father, thank you for waking me up this morning. Before I do anything..." → "Father, thank you for waking me up this morning."
- "BEFORE YOU GO ANY FURTHER, PRAY THIS PRAYER TO GOD. See Romans 8:28..." → "BEFORE YOU GO ANY FURTHER, PRAY THIS PRAYER TO GOD."
- "Before you start your day, you must say these 3 things to God: 1. Thank You..." → "Before you start your day, you must say these 3 things to God"`;

const MODEL_OPTIONS = [
  { value: INHERIT_VALUE, label: '继承全局设置' },
  { value: 'gemini-3.8-flash', label: '🚀 gemini-3.8-flash (GA·最新旗舰)' },
  { value: 'gemini-3.7-flash', label: '⚡ gemini-3.7-flash (GA·高性能)' },
  { value: 'gemini-3.6-flash', label: '⚡ gemini-3.6-flash (GA·均衡)' },
  { value: 'gemini-3.5-flash', label: '⚡ gemini-3.5-flash (GA·经典稳定)' },
  { value: 'gemini-3.5-flash-lite', label: '⚡ gemini-3.5-flash-lite (GA·极速轻量⚡)' },
  { value: 'gemini-3.1-flash-lite', label: '⚡ gemini-3.1-flash-lite (GA·默认)' },
  { value: 'gemini-2.5-flash', label: '⚡ gemini-2.5-flash (GA)' },
  { value: 'gemini-2.5-flash-lite', label: '⚡ gemini-2.5-flash-lite (GA·最快)' },
  { value: 'gemini-2.5-pro', label: '🧠 gemini-2.5-pro (GA·强推理)' },
  { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview (Preview)' },
  { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (Preview·最新)' },
];

// Default grid size
const DEFAULT_ROWS = 10;
const DEFAULT_COLS = 20;
const LINK_VARIANT_LIMIT = 4096;
const CONTENT_PLACEHOLDER = '{{内容}}';
const QUOTED_CONTENT_PLACEHOLDER = `"${CONTENT_PLACEHOLDER}"`;
const MANUAL_SPLIT_MARKER = '⟦拆分点⟧';
const BATCH_SOURCE_MARKER = '⟦下一篇⟧';
const TEMPLATE_PRESETS_KEY = 'template_batch_editor_template_presets_v1';
const MERGED_COLUMN_COLORS = [
  '#DBEAFE',
  '#DCFCE7',
  '#FEF3C7',
  '#F3E8FF',
  '#FFE4E6',
  '#CFFAFE',
  '#EDE9FE',
  '#FFEDD5'
];

type SplitUnit = 'words' | 'characters';
type TemplateSplitStrategy = 'range' | 'punctuation' | 'sermon';
type ExpandedEditor = 'source' | 'template' | null;

const normalizeTemplateSplitText = (text: string): string => text
  .replace(/\s+/g, ' ')
  // Generated copy often omits the space after a sentence mark ("today.If").
  // For a Latin period, require an uppercase next letter to avoid splitting URLs.
  .replace(/(\.[\p{Pe}\p{Pf}"']*)(?=\p{Lu})/gu, '$1 ')
  .replace(/((?!\.)\p{Sentence_Terminal}[\p{Pe}\p{Pf}"']*)(?=\p{L})/gu, '$1 ')
  .trim();

interface TemplateSegment {
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
}

interface BatchTemplateDraft {
  id: string;
  source: string;
  templateMode: 'global' | 'custom';
  template: string;
}

const getImageGroupKey = (image: AttachedImage) => {
  const parts = (image.fullPath || image.name).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : '未分组图片';
};

export interface ScriptPalette {
  name: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  cardBorder: string;
  cardBg: string;
  rowBg: string;
  rowHover: string;
  borderLeft: string;
  dotColor: string;
  accentText: string;
}

export const SCRIPT_PALETTES: ScriptPalette[] = [
  // 0: 紫罗兰 (Violet) - 篇章 1, 7, 13...
  {
    name: 'violet',
    badgeBg: 'bg-purple-950/90',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-600/70',
    cardBorder: 'border-purple-700/50',
    cardBg: 'bg-[#0f0e24]',
    rowBg: 'bg-[#0b0c20]',
    rowHover: 'hover:bg-[#121433]',
    borderLeft: 'border-l-purple-500',
    dotColor: 'bg-purple-400',
    accentText: 'text-purple-300',
  },
  // 1: 冰青/天蓝 (Sky/Cyan) - 篇章 2, 8, 14...
  {
    name: 'cyan',
    badgeBg: 'bg-cyan-950/90',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-600/70',
    cardBorder: 'border-cyan-700/50',
    cardBg: 'bg-[#06141f]',
    rowBg: 'bg-[#06101c]',
    rowHover: 'hover:bg-[#0c1c2e]',
    borderLeft: 'border-l-cyan-500',
    dotColor: 'bg-cyan-400',
    accentText: 'text-cyan-300',
  },
  // 2: 暖金/琥珀 (Amber/Gold) - 篇章 3, 9, 15...
  {
    name: 'amber',
    badgeBg: 'bg-amber-950/90',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-600/70',
    cardBorder: 'border-amber-700/50',
    cardBg: 'bg-[#181208]',
    rowBg: 'bg-[#130e06]',
    rowHover: 'hover:bg-[#20180a]',
    borderLeft: 'border-l-amber-500',
    dotColor: 'bg-amber-400',
    accentText: 'text-amber-300',
  },
  // 3: 翡翠/茶绿 (Emerald/Teal) - 篇章 4, 10, 16...
  {
    name: 'emerald',
    badgeBg: 'bg-teal-950/90',
    badgeText: 'text-teal-300',
    badgeBorder: 'border-teal-600/70',
    cardBorder: 'border-teal-700/50',
    cardBg: 'bg-[#061714]',
    rowBg: 'bg-[#051210]',
    rowHover: 'hover:bg-[#0b211d]',
    borderLeft: 'border-l-teal-500',
    dotColor: 'bg-teal-400',
    accentText: 'text-teal-300',
  },
  // 4: 玫瑰/桃红 (Rose/Pink) - 篇章 5, 11, 17...
  {
    name: 'rose',
    badgeBg: 'bg-rose-950/90',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-600/70',
    cardBorder: 'border-rose-700/50',
    cardBg: 'bg-[#180913]',
    rowBg: 'bg-[#13070f]',
    rowHover: 'hover:bg-[#210c1a]',
    borderLeft: 'border-l-rose-500',
    dotColor: 'bg-rose-400',
    accentText: 'text-rose-300',
  },
  // 5: 钴蓝/靛青 (Blue/Indigo) - 篇章 6, 12, 18...
  {
    name: 'blue',
    badgeBg: 'bg-blue-950/90',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-600/70',
    cardBorder: 'border-blue-700/50',
    cardBg: 'bg-[#081226]',
    rowBg: 'bg-[#060e20]',
    rowHover: 'hover:bg-[#0c1836]',
    borderLeft: 'border-l-blue-500',
    dotColor: 'bg-blue-400',
    accentText: 'text-blue-300',
  },
];

export const MODIFIED_TYPE_CONFIG: Record<
  NonNullable<TemplateSegment['modifiedType']>,
  { label: string; shortLabel: string; bg: string; text: string; border: string; icon: string; rowBg: string; rowHover: string; borderLeft: string; shadow: string }
> = {
  split: {
    label: '光标拆分',
    shortLabel: '已拆分',
    bg: 'bg-sky-950/90',
    text: 'text-sky-300',
    border: 'border-sky-500/70',
    icon: '✂️',
    rowBg: 'bg-sky-950/25',
    rowHover: 'hover:bg-sky-950/35',
    borderLeft: 'border-l-sky-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(56,189,248,0.08)]'
  },
  resplit: {
    label: '重新拆分',
    shortLabel: '已重拆',
    bg: 'bg-purple-950/90',
    text: 'text-purple-300',
    border: 'border-purple-500/70',
    icon: '🔀',
    rowBg: 'bg-purple-950/25',
    rowHover: 'hover:bg-purple-950/35',
    borderLeft: 'border-l-purple-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(192,132,252,0.08)]'
  },
  shift: {
    label: '文字移动',
    shortLabel: '已移动',
    bg: 'bg-teal-950/90',
    text: 'text-teal-300',
    border: 'border-teal-500/70',
    icon: '➡️',
    rowBg: 'bg-teal-950/25',
    rowHover: 'hover:bg-teal-950/35',
    borderLeft: 'border-l-teal-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(45,212,191,0.08)]'
  },
  merge: {
    label: '段落合并',
    shortLabel: '已合并',
    bg: 'bg-indigo-950/90',
    text: 'text-indigo-300',
    border: 'border-indigo-500/70',
    icon: '🔗',
    rowBg: 'bg-indigo-950/25',
    rowHover: 'hover:bg-indigo-950/35',
    borderLeft: 'border-l-indigo-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(129,140,248,0.08)]'
  },
  edit: {
    label: '编辑文案',
    shortLabel: '已编辑',
    bg: 'bg-amber-950/90',
    text: 'text-amber-300',
    border: 'border-amber-500/70',
    icon: '✏️',
    rowBg: 'bg-amber-950/20',
    rowHover: 'hover:bg-amber-950/30',
    borderLeft: 'border-l-amber-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(251,191,36,0.06)]'
  },
  sermon: {
    label: '8s讲道拆分',
    shortLabel: '8s讲道',
    bg: 'bg-emerald-950/90',
    text: 'text-emerald-300',
    border: 'border-emerald-500/70',
    icon: '🎙️',
    rowBg: 'bg-emerald-950/20',
    rowHover: 'hover:bg-emerald-950/30',
    borderLeft: 'border-l-emerald-400',
    shadow: 'shadow-[inset_0_0_15px_rgba(16,185,129,0.08)]'
  }
};

const loadTemplatePresets = (): TemplatePreset[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_PRESETS_KEY) || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.template === 'string');
      // 清理旧版本自动附带的示例；用户自己创建的 ID 不受影响。
      const withoutBuiltins = valid.filter(item => !BUILTIN_TEMPLATE_PRESET_IDS.has(item.id));
      if (withoutBuiltins.length !== valid.length) {
        localStorage.setItem(TEMPLATE_PRESETS_KEY, JSON.stringify(withoutBuiltins));
      }
      return withoutBuiltins;
    }
    return DEFAULT_TEMPLATE_PRESETS;
  } catch {
    return DEFAULT_TEMPLATE_PRESETS;
  }
};

const countSegmentUnits = (text: string, unit: SplitUnit): number => {
  const clean = text.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
  return unit === 'characters'
    ? Array.from(clean.replace(/\s/g, '')).length
    : (normalizeTemplateSplitText(clean).match(/\S+/g) || []).length;
};

const canPartitionWithinRange = (count: number, minimum: number, maximum: number): boolean => {
  const safeMin = Math.max(1, Math.min(minimum, maximum));
  const safeMax = Math.max(safeMin, maximum);
  if (count < safeMin) return false;
  const minimumParts = Math.max(1, Math.ceil(count / safeMax));
  return count >= minimumParts * safeMin;
};

const splitIntoSentences = (text: string, sentencePauseOnly: boolean = false): string[] => {
  const normalized = normalizeTemplateSplitText(text);
  if (!normalized) return [];
  // Colons inside numeric references (for example Matthew 18:15) are not
  // pause boundaries. Temporarily protect them while locating punctuation.
  const protectedText = normalized
    .replace(/(\p{N}):(?=\s*\p{N})/gu, '$1\uE000')
    .replace(/(\p{N})：(?=\s*\p{N})/gu, '$1\uE001');
  // Unicode terminal punctuation covers multilingual sentence and pause marks.
  // Ellipsis is added explicitly because Unicode does not classify it as terminal.
  const parts = ((sentencePauseOnly
    ? protectedText.match(/[^,.!?;，。！？；、…؟،؛]+(?:[,.!?;，。！？；、…؟،؛]+[\p{Pe}\p{Pf}"']*)?|[^,.!?;，。！？；、…؟،؛]+$/gu)
    : protectedText.match(/[^\p{Terminal_Punctuation}…]+(?:[\p{Terminal_Punctuation}…]+[\p{Pe}\p{Pf}"']*)?|[^\p{Terminal_Punctuation}…]+$/gu)) || [protectedText])
    .map(item => item.replace(/\uE000/g, ':').replace(/\uE001/g, '：').trim())
    .filter(Boolean);
  const result: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    // A standalone numbered-list marker belongs to the following sentence.
    // Keeping it separate can incorrectly append "3." to the previous segment.
    if (/^\p{N}+[.)．。、]$/u.test(part) && index + 1 < parts.length) {
      result.push(`${part} ${parts[++index]}`);
    } else {
      result.push(part);
    }
  }
  return result;
};

const hardSplitText = (text: string, target: number, unit: SplitUnit): string[] => {
  if (unit === 'words') {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const partCount = Math.max(1, Math.ceil(words.length / target));
    const baseSize = Math.floor(words.length / partCount);
    let remainder = words.length % partCount;
    const result: string[] = [];
    let offset = 0;
    for (let part = 0; part < partCount; part++) {
      const size = baseSize + (remainder-- > 0 ? 1 : 0);
      result.push(words.slice(offset, offset + size).join(' '));
      offset += size;
    }
    return result;
  }
  const chars = Array.from(text.trim());
  const contentLength = chars.filter(char => !/\s/u.test(char)).length;
  const partCount = Math.max(1, Math.ceil(contentLength / target));
  const baseSize = Math.floor(contentLength / partCount);
  let remainder = contentLength % partCount;
  const result: string[] = [];
  let current = '';
  let currentCount = 0;
  let targetSize = baseSize + (remainder-- > 0 ? 1 : 0);
  for (const char of chars) {
    current += char;
    if (!/\s/u.test(char)) currentCount++;
    if (currentCount >= targetSize && result.length < partCount - 1) {
      result.push(current.trim());
      current = '';
      currentCount = 0;
      targetSize = baseSize + (remainder-- > 0 ? 1 : 0);
    }
  }
  if (current.trim()) result.push(current.trim());
  return result.filter(Boolean);
};

const autoSplitTemplateText = (
  text: string,
  minimum: number,
  maximum: number,
  unit: SplitUnit,
  keepSentences: boolean,
  tolerance: number,
  forcePunctuation: boolean = false,
  sentencePauseOnly: boolean = false
): string[] => {
  const safeMin = Math.max(1, Math.min(minimum, maximum));
  const safeMax = Math.max(safeMin, maximum);
  const floating = Math.max(0, tolerance);
  const lowerBound = safeMin;
  const upperBound = safeMax;
  const punctuationUpperBound = safeMax + floating;
  const normalized = normalizeTemplateSplitText(text);
  if (!normalized) return [];

  if (forcePunctuation) {
    const punctuationParts = splitIntoSentences(normalized, sentencePauseOnly);
    const forceMaximum = punctuationUpperBound;
    const partCounts = punctuationParts.map(part => countSegmentUnits(part, unit));
    type PunctuationPlan = { groups: string[]; gaps: number[] };
    const plans: Array<PunctuationPlan | null> = Array(punctuationParts.length + 1).fill(null);
    plans[punctuationParts.length] = { groups: [], gaps: [] };

    // Consider the whole document so a short tail does not force an otherwise
    // avoidable overlong merge. Prefer fewer, fuller groups near the maximum.
    for (let start = punctuationParts.length - 1; start >= 0; start--) {
      let count = 0;
      for (let end = start; end < punctuationParts.length; end++) {
        count += partCounts[end];
        if (count > forceMaximum) break;
        const remainder = plans[end + 1];
        if (count < safeMin || !remainder) continue;
        const candidate: PunctuationPlan = {
          groups: [punctuationParts.slice(start, end + 1).join(' '), ...remainder.groups],
          gaps: [safeMax - count, ...remainder.gaps],
        };
        const current = plans[start];
        const candidateGap = candidate.gaps.reduce((sum, gap) => sum + gap * gap, 0);
        const currentGap = current?.gaps.reduce((sum, gap) => sum + gap * gap, 0) ?? Infinity;
        if (!current
          || candidate.groups.length < current.groups.length
          || (candidate.groups.length === current.groups.length && candidateGap < currentGap)
          || (candidate.groups.length === current.groups.length && candidateGap === currentGap && candidate.gaps[0] < current.gaps[0])) {
          plans[start] = candidate;
        }
      }
    }
    if (plans[0]) return plans[0].groups.filter(Boolean);

    const result: string[] = [];
    let current = '';
    for (const part of punctuationParts) {
      const candidate = current ? `${current} ${part}` : part;
      if (countSegmentUnits(candidate, unit) <= forceMaximum) {
        current = candidate;
        continue;
      }
      if (current && countSegmentUnits(current, unit) >= safeMin) {
        result.push(current);
        current = part;
      } else {
        // No punctuation boundary can satisfy the minimum. Keep accumulating;
        // minimum length and punctuation boundaries take priority over maximum.
        current = candidate;
      }
    }
    if (current) result.push(current);

    if (result.length > 1 && countSegmentUnits(result[result.length - 1], unit) < safeMin) {
      const tail = result.pop() || '';
      result[result.length - 1] = `${result[result.length - 1]} ${tail}`.trim();
    }
    return result.filter(Boolean);
  }

  const atoms = unit === 'words'
    ? normalized.split(/\s+/).filter(Boolean)
    : (() => {
      const result: string[] = [];
      let whitespace = '';
      for (const char of Array.from(normalized)) {
        if (/\s/u.test(char)) whitespace += char;
        else {
          result.push(`${whitespace}${char}`);
          whitespace = '';
        }
      }
      if (whitespace && result.length) result[result.length - 1] += whitespace;
      return result;
    })();
  if (atoms.length <= upperBound) return [normalized];

  const minimumPartCount = Math.ceil(atoms.length / upperBound);
  const hasStrictPartition = atoms.length >= minimumPartCount * lowerBound;
  const partCount = minimumPartCount;
  const result: string[] = [];
  let offset = 0;

  const isPunctuationBoundary = (atom: string) => sentencePauseOnly
    ? /[,.!?;，。！？；、…؟،؛](?:[\p{Pe}\p{Pf}"']*)$/u.test(atom.trim())
    : /(?:\p{Terminal_Punctuation}|…)(?:[\p{Pe}\p{Pf}"']*)$/u.test(atom.trim());

  for (let partIndex = 0; partIndex < partCount; partIndex++) {
    const remaining = atoms.length - offset;
    const remainingParts = partCount - partIndex;
    let size: number;
    if (remainingParts === 1) {
      size = remaining;
    } else if (hasStrictPartition) {
      const minSize = Math.max(lowerBound, remaining - punctuationUpperBound * (remainingParts - 1));
      const maxSize = Math.min(punctuationUpperBound, remaining - lowerBound * (remainingParts - 1));
      const targetSize = Math.max(minSize, Math.min(safeMax, maxSize));
      size = targetSize;
      if (keepSentences) {
        const punctuationCandidates: number[] = [];
        for (let candidate = minSize; candidate <= maxSize; candidate++) {
          if (Math.abs(candidate - targetSize) <= floating && isPunctuationBoundary(atoms[offset + candidate - 1])) punctuationCandidates.push(candidate);
        }
        if (punctuationCandidates.length) {
          size = punctuationCandidates.sort((a, b) => Math.abs(a - targetSize) - Math.abs(b - targetSize) || b - a)[0];
        } else if (unit === 'characters') {
          const wordBoundaryCandidates: number[] = [];
          const strictMaxSize = Math.min(maxSize, safeMax);
          for (let candidate = minSize; candidate <= strictMaxSize; candidate++) {
            const nextAtom = atoms[offset + candidate];
            if (!nextAtom || /^\s/u.test(nextAtom)) wordBoundaryCandidates.push(candidate);
          }
          if (wordBoundaryCandidates.length) size = wordBoundaryCandidates.sort((a, b) => Math.abs(a - targetSize) - Math.abs(b - targetSize) || b - a)[0];
        }
      }
    } else {
      // Some totals cannot mathematically be divided into the requested range
      // (for example 19 units with a strict 10-18 range). Balance the result.
      size = Math.ceil(remaining / remainingParts);
    }
    const slice = atoms.slice(offset, offset + size);
    result.push(unit === 'words' ? slice.join(' ') : slice.join('').trim());
    offset += size;
  }
  return result.filter(Boolean);
};

interface HighlightedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  containerClassName?: string;
}

const HighlightedTextarea = React.forwardRef<HTMLTextAreaElement, HighlightedTextareaProps>(({ value, className = '', containerClassName = '', onScroll, style, ...props }, ref) => {
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const pieces = value.split(/("\{\{内容\}\}"|⟦拆分点⟧|⟦下一篇⟧|\{\{内容\}\})/g);
  return (
    <span className={`relative block w-full overflow-hidden rounded-md ${containerClassName}`}>
      <pre aria-hidden="true" className={`${className} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words m-0`} style={{ ...style, color: 'transparent', fontFamily: 'inherit', letterSpacing: 0, transform: `translate(${-scroll.left}px, ${-scroll.top}px)`, borderColor: 'transparent' }}>
        {pieces.map((piece, index) => piece === MANUAL_SPLIT_MARKER
          ? <mark key={index} style={{ backgroundColor: '#b45309', color: 'transparent', borderRadius: 3, padding: 0 }}>{piece}</mark>
          : piece === BATCH_SOURCE_MARKER
            ? <mark key={index} style={{ backgroundColor: '#6d28d9', color: 'transparent', borderRadius: 3, padding: 0 }}>{piece}</mark>
          : piece === CONTENT_PLACEHOLDER || piece === QUOTED_CONTENT_PLACEHOLDER
            ? <mark key={index} style={{ backgroundColor: '#0f766e', color: 'transparent', borderRadius: 3, padding: 0 }}>{piece}</mark>
            : <React.Fragment key={index}>{piece}</React.Fragment>)}
      </pre>
      <textarea
        {...props}
        ref={ref}
        value={value}
        className={`${className} relative z-10 bg-transparent`}
        style={{ ...style, color: '#e2e8f0', caretColor: '#f8fafc', WebkitTextFillColor: '#e2e8f0', fontFamily: 'inherit', letterSpacing: 0 }}
        onScroll={event => {
          setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
          onScroll?.(event);
        }}
      />
    </span>
  );
});
HighlightedTextarea.displayName = 'HighlightedTextarea';

interface PersistedScriptToolState {
  gridData: GridData;
  selection: GridSelection | null;
  clearSource: boolean;
  gridStyles: [string, { bgColor?: string }][];
  customPrefix: string;
  mergeCycle: number;
  mergeCellSpan: number;
  diffCols?: Record<number, number>;
  autoRowHeight?: boolean;
}

const createEmptyGrid = (): GridData =>
  Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));

const countAmbiguousLinkChars = (value: string): number => {
  return (value.match(/[lI]/g) || []).length;
};

const generateLinkVariants = (value: string): string[] => {
  const ambiguousCount = countAmbiguousLinkChars(value);
  if (ambiguousCount === 0) return [];
  if (ambiguousCount > Math.log2(LINK_VARIANT_LIMIT)) {
    throw new Error(`可疑字符过多，会生成 ${Math.pow(2, ambiguousCount).toLocaleString()} 条候选。当前上限为 ${LINK_VARIANT_LIMIT.toLocaleString()} 条。`);
  }

  const variants: string[] = [''];
  for (const ch of value) {
    if (ch !== 'l' && ch !== 'I') {
      for (let i = 0; i < variants.length; i++) {
        variants[i] += ch;
      }
      continue;
    }

    const currentLength = variants.length;
    for (let i = 0; i < currentLength; i++) {
      const prefix = variants[i];
      variants[i] = `${prefix}l`;
      variants.push(`${prefix}I`);
    }
  }

  return variants;
};

const normalizeGridData = (raw: unknown): GridData => {
  if (!Array.isArray(raw)) return createEmptyGrid();
  const rows = raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map(row => row.map(cell => (cell == null ? '' : String(cell))));
  if (rows.length === 0) return createEmptyGrid();
  return rows;
};

const normalizeSelection = (raw: unknown): GridSelection | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as {
    start?: { row?: unknown; col?: unknown };
    end?: { row?: unknown; col?: unknown };
  };
  const sr = value.start?.row;
  const sc = value.start?.col;
  const er = value.end?.row;
  const ec = value.end?.col;
  if ([sr, sc, er, ec].every(v => typeof v === 'number' && Number.isFinite(v))) {
    return {
      start: { row: sr as number, col: sc as number },
      end: { row: er as number, col: ec as number }
    };
  }
  return null;
};

const normalizeGridStyles = (raw: unknown): GridStyles => {
  if (!Array.isArray(raw)) return new Map();
  const map = new Map<string, { bgColor?: string }>();
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, style] = entry;
    if (typeof key !== 'string') continue;
    if (!style || typeof style !== 'object') continue;
    const bgColor = (style as { bgColor?: unknown }).bgColor;
    map.set(key, typeof bgColor === 'string' ? { bgColor } : {});
  }
  return map;
};

let memoryPersistedState: PersistedScriptToolState | null = null;

const loadPersistedState = (): PersistedScriptToolState | null => {
  return memoryPersistedState;
};

function TemplateBatchEditorApp({ getAiInstance, textModel = 'gemini-3-flash-preview' }: TemplateBatchEditorAppProps) {
  const [persistedState] = useState<PersistedScriptToolState | null>(() => loadPersistedState());
  // 本地模型选择（默认继承全局）
  const [localModel, setLocalModel] = useState<string>(() => {
    try { return localStorage.getItem(LOCAL_MODEL_KEY) || INHERIT_VALUE; } catch { return INHERIT_VALUE; }
  });
  const effectiveModel = localModel === INHERIT_VALUE ? textModel : localModel;
  const [gridData, setGridDataRaw] = useState<GridData>(persistedState?.gridData || createEmptyGrid());
  const [selection, setSelection] = useState<GridSelection | null>(persistedState?.selection || null);
  const [forceSelection, setForceSelection] = useState<GridSelection | null>(persistedState?.selection || null); // 用于外部触发选区
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [copyToast, setCopyToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clearSource, setClearSource] = useState<boolean>(persistedState?.clearSource ?? false); // 默认保留原文（开关关 = 保留，开关开 = 删除）
  const [gridStyles, setGridStyles] = useState<GridStyles>(new Map(persistedState?.gridStyles || [])); // 单元格样式（橙色标记）
  const gridUndoStackRef = useRef<Array<{ data: GridData; styles: GridStyles; selection: GridSelection | null }>>([]);
  const gridRedoStackRef = useRef<Array<{ data: GridData; styles: GridStyles; selection: GridSelection | null }>>([]);
  const gridDataRef = useRef(gridData);
  const gridStylesRef = useRef(gridStyles);
  const selectionRef = useRef(selection);
  const [gridHistoryVersion, setGridHistoryVersion] = useState(0);
  gridDataRef.current = gridData;
  gridStylesRef.current = gridStyles;
  selectionRef.current = selection;

  const cloneGrid = (data: GridData): GridData => data.map(row => [...row]);
  const setGridData: React.Dispatch<React.SetStateAction<GridData>> = useCallback((value) => {
    const current = gridDataRef.current;
    const next = typeof value === 'function' ? value(current) : value;
    if (next === current) return;
    gridUndoStackRef.current.push({
      data: cloneGrid(current),
      styles: new Map(gridStylesRef.current),
      selection: selectionRef.current
    });
    if (gridUndoStackRef.current.length > 40) gridUndoStackRef.current.shift();
    gridRedoStackRef.current = [];
    gridDataRef.current = next;
    setGridDataRaw(next);
    setGridHistoryVersion(version => version + 1);
  }, []);

  const undoGridChange = useCallback(() => {
    const snapshot = gridUndoStackRef.current.pop();
    if (!snapshot) return;
    gridRedoStackRef.current.push({
      data: cloneGrid(gridDataRef.current),
      styles: new Map(gridStylesRef.current),
      selection: selectionRef.current
    });
    gridDataRef.current = snapshot.data;
    gridStylesRef.current = snapshot.styles;
    selectionRef.current = snapshot.selection;
    setGridDataRaw(cloneGrid(snapshot.data));
    setGridStyles(new Map(snapshot.styles));
    setSelection(snapshot.selection);
    setForceSelection(snapshot.selection);
    setGridHistoryVersion(version => version + 1);
    setStatusMsg('已撤销上一步表格操作');
  }, []);

  const redoGridChange = useCallback(() => {
    const snapshot = gridRedoStackRef.current.pop();
    if (!snapshot) return;
    gridUndoStackRef.current.push({
      data: cloneGrid(gridDataRef.current),
      styles: new Map(gridStylesRef.current),
      selection: selectionRef.current
    });
    gridDataRef.current = snapshot.data;
    gridStylesRef.current = snapshot.styles;
    selectionRef.current = snapshot.selection;
    setGridDataRaw(cloneGrid(snapshot.data));
    setGridStyles(new Map(snapshot.styles));
    setSelection(snapshot.selection);
    setForceSelection(snapshot.selection);
    setGridHistoryVersion(version => version + 1);
    setStatusMsg('已重做表格操作');
  }, []);
  const [showPrefixModal, setShowPrefixModal] = useState(false); // 自定义前缀弹窗
  const [customPrefix, setCustomPrefix] = useState<string>(persistedState?.customPrefix || 'prompt'); // 自定义前缀内容
  const [copiedSelection, setCopiedSelection] = useState(false);
  const [aiSplitting, setAiSplitting] = useState(false);
  const [aiSegmenting, setAiSegmenting] = useState(false);
  const [showAiSegmentPromptModal, setShowAiSegmentPromptModal] = useState(false);
  const [showAiPromptModal, setShowAiPromptModal] = useState(false);
  const [aiSplitPrompt, setAiSplitPrompt] = useState<string>(() => {
    try {
      return localStorage.getItem(AI_SPLIT_PROMPT_KEY) || DEFAULT_AI_SPLIT_PROMPT;
    } catch {
      return DEFAULT_AI_SPLIT_PROMPT;
    }
  });
  const [aiSegmentPrompt, setAiSegmentPrompt] = useState<string>(() => {
    try { return localStorage.getItem(AI_SEGMENT_PROMPT_KEY) || DEFAULT_AI_SEGMENT_PROMPT; } catch { return DEFAULT_AI_SEGMENT_PROMPT; }
  });

  const handleSaveAiPrompt = (newPrompt: string) => {
    setAiSplitPrompt(newPrompt);
    try {
      localStorage.setItem(AI_SPLIT_PROMPT_KEY, newPrompt);
    } catch {}
    setStatusMsg('✅ AI 拆分指令已成功更新并保存');
  };
  const handleSaveAiSegmentPrompt = (newPrompt: string) => {
    setAiSegmentPrompt(newPrompt);
    try { localStorage.setItem(AI_SEGMENT_PROMPT_KEY, newPrompt); } catch {}
    setStatusMsg('✅ AI 分段指令已保存');
  };
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeCycle, setMergeCycle] = useState<number>(persistedState?.mergeCycle ?? 1); // 循环列数
  const [showSplitColumnModal, setShowSplitColumnModal] = useState(false); // 拆分列弹窗
  const [splitRowsPerGroup, setSplitRowsPerGroup] = useState<number>(10); // 每组行数（默认10）
  const [splitKeepSource, setSplitKeepSource] = useState<boolean>(false); // 是否保留原数据
  const [splitApplyColor, setSplitApplyColor] = useState<boolean>(true); // 是否使用颜色区分组
  const [showWrapModal, setShowWrapModal] = useState(false); // 自动断行弹窗
  const [lineWidth, setLineWidth] = useState<number>(18); // 断行宽度（默认18）
  const [showLinkVariantModal, setShowLinkVariantModal] = useState(false);
  const [linkVariantInput, setLinkVariantInput] = useState('');
  const [showMergeCellModal, setShowMergeCellModal] = useState(false);
  const [mergeCellSpan, setMergeCellSpan] = useState<number>(persistedState?.mergeCellSpan ?? 5);
  const [showDeityModal, setShowDeityModal] = useState(false);
  const [deityTerms, setDeityTerms] = useState<string[]>(() => loadDeityTerms());
  const [deityNewTerm, setDeityNewTerm] = useState('');
  const [enableAiSpellCheck] = useState(true);
  const [spellChecking, setSpellChecking] = useState(false);
  const [diffCols, setDiffCols] = useState<Record<number, number>>(persistedState?.diffCols || {});
  const [autoRowHeight, setAutoRowHeight] = useState<boolean>(persistedState?.autoRowHeight ?? false);
  // 独立工具入口直接打开模板拆分工作区；原文案加工站仍保留自己的入口与状态。
  const [showTemplateSplitter, setShowTemplateSplitter] = useState(true);
  const [showTemplateCopyGuide, setShowTemplateCopyGuide] = useState(false);
  const [templateSource, setTemplateSource] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorsCollapsed, setEditorsCollapsed] = useState(false);
  const [importAnnotatedMode, setImportAnnotatedMode] = useState(false);
  const [annotatedImportError, setAnnotatedImportError] = useState('');
  const [showImportSegmentsModal, setShowImportSegmentsModal] = useState(false); // 导入已拆分文案弹窗
  const [importSegmentsRawText, setImportSegmentsRawText] = useState(''); // 导入文案原始文本
  const [importStripQuotes, setImportStripQuotes] = useState(true); // 是否去除包裹引号
  const [importStripNumbering, setImportStripNumbering] = useState(false); // 是否去除行首序号
  const [importSkipEmptyLines, setImportSkipEmptyLines] = useState(true); // 是否跳过空行
  const [importTargetMode, setImportTargetMode] = useState<'batch' | 'tabs'>('batch'); // 导入目标：批量篇章模式 vs 独立多标签页
  const [importDirection, setImportDirection] = useState<'auto' | 'rows' | 'columns'>('auto'); // 解析方向
  // 表格内容默认全部都是文案；只有用户主动勾选才跳过首行，避免误丢第一篇。
  const [importHasHeader, setImportHasHeader] = useState(false); // 首行是否表头
  const [batchTemplateMode, setBatchTemplateMode] = useState(true);
  const [batchTemplateDrafts, setBatchTemplateDrafts] = useState<BatchTemplateDraft[]>([
    { id: 'batch-draft-1', source: '', templateMode: 'global', template: '' }
  ]);
  const [activeBatchSourceIndex, setActiveBatchSourceIndex] = useState<number | null>(null);
  const [promptTemplate, setPromptTemplate] = useState(`内容：${QUOTED_CONTENT_PLACEHOLDER}`);
  const [splitUnit, setSplitUnit] = useState<SplitUnit>('words');
  const [templateSplitStrategy, setTemplateSplitStrategy] = useState<TemplateSplitStrategy>('punctuation');
  const [splitMinimum, setSplitMinimum] = useState(10);
  const [splitMaximum, setSplitMaximum] = useState(18);
  const [keepSentences, setKeepSentences] = useState(true);
  const [sentencePauseOnly, setSentencePauseOnly] = useState(true);
  const [allowTolerance, setAllowTolerance] = useState(true);
  const [splitTolerance, setSplitTolerance] = useState(3);
  const [quoteSplitSegments, setQuoteSplitSegments] = useState(true);
  const [lowercaseSplitOutput, setLowercaseSplitOutput] = useState(false);
  const [includeBatchTextNumbering, setIncludeBatchTextNumbering] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('template_batch_editor_batch_text_numbering');
      return v !== null ? v === 'true' : false;
    } catch {
      return false;
    }
  });
  const [includeBatchPromptNumbering, setIncludeBatchPromptNumbering] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('template_batch_editor_batch_prompt_numbering');
      return v !== null ? v === 'true' : false;
    } catch {
      return false;
    }
  });
  const [batchNumberStyle, setBatchNumberStyle] = useState<'dot' | 'ideographic' | 'parentheses' | 'bracket'>(() => {
    try {
      return (localStorage.getItem('template_batch_editor_batch_number_style') as any) || 'dot';
    } catch {
      return 'dot';
    }
  });

  const [includeBatchEmptyLines, setIncludeBatchEmptyLines] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('template_batch_editor_batch_empty_lines');
      return v !== null ? v === 'true' : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('template_batch_editor_batch_text_numbering', String(includeBatchTextNumbering));
    } catch {}
  }, [includeBatchTextNumbering]);

  useEffect(() => {
    try {
      localStorage.setItem('template_batch_editor_batch_prompt_numbering', String(includeBatchPromptNumbering));
    } catch {}
  }, [includeBatchPromptNumbering]);

  useEffect(() => {
    try {
      localStorage.setItem('template_batch_editor_batch_number_style', batchNumberStyle);
    } catch {}
  }, [batchNumberStyle]);

  useEffect(() => {
    try {
      localStorage.setItem('template_batch_editor_batch_empty_lines', String(includeBatchEmptyLines));
    } catch {}
  }, [includeBatchEmptyLines]);

  const formatBatchNumber = useCallback((index: number, style: string = batchNumberStyle) => {
    const n = index + 1;
    switch (style) {
      case 'ideographic': return `${n}、`;
      case 'parentheses': return `(${n}) `;
      case 'bracket': return `[${n}] `;
      case 'dot':
      default:
        return `${n}. `;
    }
  }, [batchNumberStyle]);

  const [templateSegments, setTemplateSegments] = useState<TemplateSegment[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());

  // 表格列显示控制 (Column Visibility)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityConfig>(() => {
    try {
      const saved = localStorage.getItem('template_batch_editor_col_visibility_v1');
      if (saved) return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_COLUMN_VISIBILITY;
  });

  useEffect(() => {
    try {
      localStorage.setItem('template_batch_editor_col_visibility_v1', JSON.stringify(columnVisibility));
    } catch {}
  }, [columnVisibility]);

  // 分镜撤销 / 重做与前后对比快照系统
  interface SegmentSnapshot {
    id: string;
    actionName: string;
    timestamp: number;
    segments: TemplateSegment[];
    templateSource: string;
    batchTemplateDrafts?: BatchTemplateDraft[];
    activeBatchSourceIndex?: number | null;
    selectedSegmentIds?: string[];
  }
  const segmentUndoStackRef = useRef<SegmentSnapshot[]>([]);
  const segmentRedoStackRef = useRef<SegmentSnapshot[]>([]);
  const [canUndoSegments, setCanUndoSegments] = useState(false);
  const [canRedoSegments, setCanRedoSegments] = useState(false);
  const [lastActionToast, setLastActionToast] = useState<{
    actionName: string;
    timestamp: number;
    beforeSegments: TemplateSegment[];
    afterSegments: TemplateSegment[];
  } | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [segmentCarets, setSegmentCarets] = useState<Record<string, number>>({});
  const [templatePresets, setTemplatePresets] = useState<TemplatePreset[]>(loadTemplatePresets);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [showPresetLibraryModal, setShowPresetLibraryModal] = useState(false);
  const [showQuickImagePrompt, setShowQuickImagePrompt] = useState(false);
  const [showCyclePresetModal, setShowCyclePresetModal] = useState(false);
  const [multiPresetIds, setMultiPresetIds] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  useEffect(() => {
    // 图片导入后立即缓存，避免等待工作区防抖保存时退出丢失文件实体。
    void cacheWorkspaceImages(attachedImages).catch(error => {
      console.error('缓存本地图片失败', error);
      setStatusMsg('本地图片缓存失败，请保存工程记录备份图片');
    });
  }, [attachedImages]);
  const [imageBindingMode, setImageBindingMode] = useState<ImageBindingMode>('per-segment');
  const [imagePickerTarget, setImagePickerTarget] = useState<{
    segmentId: string;
    segmentIndex: number;
    segmentText: string;
    sourceIndex?: number;
  } | null>(null);
  // 仅复制“图片关联”，不复制图片文件；可快速粘贴给任意其它分镜，允许重复使用同一张图。
  const [copiedImageAssignmentId, setCopiedImageAssignmentId] = useState<string | null>(null);
  const [sourceImageGroupBindings, setSourceImageGroupBindings] = useState<Record<number, string>>({});
  const [groupNameTemplate, setGroupNameTemplate] = useState(() => migrateGroupNameTemplate(localStorage.getItem('template-batch-group-name-template') ?? DEFAULT_GROUP_NAME_TEMPLATE));
  useEffect(() => { localStorage.setItem('template-batch-group-name-template', groupNameTemplate); }, [groupNameTemplate]);
  const buildDeliveryGroupName = (image: AttachedImage | undefined | null, groupName: string, presetGroup: string | undefined, segmentNumber: number, presetName: string) => {
    const folder = image ? getImageGroupKey(image) : '';
    return formatGroupName(groupNameTemplate, {
      '图片文件夹': folder === '未分组图片' ? '' : folder,
      '图片名字': (image?.name || '').replace(/[-_]/g, 'z'),
      '图片组名字': groupName.replace(/[-_]*\{\{counter\}\}/g, '').replace(/[-_]/g, 'z'),
      '预设名字': presetName.replace(/[-_]/g, 'z'),
      '预设组名字': (presetGroup || '').replace(/[-_]/g, 'z'),
      '预设组后缀': (presetGroup || '').replace(/[-_]/g, 'z'),
      '片段编号': String(segmentNumber)
    });
  };
  const [openImageGroupSourceIndex, setOpenImageGroupSourceIndex] = useState<number | null>(null);
  const [imageOrderSourceIndex, setImageOrderSourceIndex] = useState<number | null>(null);
  const [showImageGroupAssignment, setShowImageGroupAssignment] = useState(false);

  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedSegmentIds, setCopiedSegmentIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ai_toolkit_copied_segment_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [copiedImageIds, setCopiedImageIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ai_toolkit_copied_image_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [filterUncopiedOnly, setFilterUncopiedOnly] = useState(false);
  const [filterModifiedOnly, setFilterModifiedOnly] = useState(false);
  // “图＋词表格”是复制交付格式的可视化工作台；单元格可多选后直接粘到 Google Sheets。
  const [showImagePromptSheet, setShowImagePromptSheet] = useState(false);
  const [selectedImagePromptCells, setSelectedImagePromptCells] = useState<Set<string>>(new Set());
  const [imagePromptContextMenu, setImagePromptContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [imagePromptExpandedCell, setImagePromptExpandedCell] = useState<{ title: string; value: string } | null>(null);
  const imagePromptDragStartRef = useRef<{ row: number; column: number } | null>(null);
  const [openSplitMenuId, setOpenSplitMenuId] = useState<string | null>(null);

  // 快速搜索与分镜文案定位状态
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [searchFilterMode, setSearchFilterMode] = useState<boolean>(false);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const prevSearchKeywordRef = useRef('');

  useEffect(() => {
    try {
      localStorage.setItem('ai_toolkit_copied_segment_ids', JSON.stringify(Array.from(copiedSegmentIds)));
    } catch {}
  }, [copiedSegmentIds]);

  useEffect(() => {
    try {
      localStorage.setItem('ai_toolkit_copied_image_ids', JSON.stringify(Array.from(copiedImageIds)));
    } catch {}
  }, [copiedImageIds]);
  const [expandedEditor, setExpandedEditor] = useState<ExpandedEditor>(null);
  const [storyboardMode, setStoryboardMode] = useState(true);
  const [perSourceTemplateMode, setPerSourceTemplateMode] = useState(false);
  const [sourcePromptTemplates, setSourcePromptTemplates] = useState<Record<number, string>>({});
  const promptTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const templateSourceRef = useRef<HTMLTextAreaElement | null>(null);
  const sourcePromptTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const batchTemplateRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const batchSourceRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const editorHistoryRef = useRef<Record<'source' | 'template', { undo: string[]; redo: string[] }>>({ source: { undo: [], redo: [] }, template: { undo: [], redo: [] } });

  const setEditorValue = (editor: 'source' | 'template', value: string, record = true) => {
    const current = editor === 'source' ? templateSource : promptTemplate;
    if (value === current) return;
    if (record) {
      const history = editorHistoryRef.current[editor];
      history.undo.push(current);
      if (history.undo.length > 100) history.undo.shift();
      history.redo = [];
    }
    editor === 'source' ? setTemplateSource(value) : setPromptTemplate(value);
  };

  const undoEditor = (editor: 'source' | 'template') => {
    const history = editorHistoryRef.current[editor];
    const previous = history.undo.pop();
    if (previous === undefined) return;
    history.redo.push(editor === 'source' ? templateSource : promptTemplate);
    setEditorValue(editor, previous, false);
  };

  const redoEditor = (editor: 'source' | 'template') => {
    const history = editorHistoryRef.current[editor];
    const next = history.redo.pop();
    if (next === undefined) return;
    history.undo.push(editor === 'source' ? templateSource : promptTemplate);
    setEditorValue(editor, next, false);
  };

  // 多标签页工作区状态 (Multi-Tab Workspace State)
  const isSwitchingTabRef = useRef(true);
  const [tabs, setTabs] = useState<SplitWorkspaceTab[]>(() => {
    try {
      const saved = localStorage.getItem('template_batch_editor_tabs_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [createDefaultWorkspaceTab('tab-1', '标签页 1')];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('template_batch_editor_active_tab_id');
      if (saved) return saved;
    } catch {}
    return 'tab-1';
  });

  // 保存当前编辑区快照
  const captureCurrentTabSnapshot = useCallback((): SplitWorkspaceTab => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    return {
      id: activeTabId,
      title: currentTab?.title || '标签页',
      createdAt: currentTab?.createdAt || Date.now(),
      updatedAt: Date.now(),
      templateSource,
      batchTemplateMode,
      batchTemplateDrafts,
      activeBatchDraftIndex: 0,
      activeBatchSourceIndex,
      promptTemplate,
      sourcePromptTemplates,
      sourceImageGroupBindings,
      perSourceTemplateMode,
      storyboardMode,
      selectedPresetId,
      presetName,
      multiPresetIds,
      splitSettings: {
        templateSplitStrategy,
        splitMinimum,
        splitMaximum,
        splitUnit,
        lineWidth,
        splitTolerance,
        allowTolerance,
        keepSentences,
        sentencePauseOnly,
        quoteSplitSegments,
        lowercaseSplitOutput,
        includeBatchTextNumbering,
        includeBatchPromptNumbering,
        batchNumberStyle,
        includeBatchEmptyLines
      },
      templateSegments,
      selectedSegmentIds: Array.from(selectedSegmentIds),
      segmentCarets,
      attachedImages,
      imageBindingMode,
      copiedSegmentIds: Array.from(copiedSegmentIds),
      copiedImageIds: Array.from(copiedImageIds)
    };
  }, [
    activeTabId,
    tabs,
    templateSource,
    batchTemplateMode,
    batchTemplateDrafts,
    activeBatchSourceIndex,
    promptTemplate,
    sourcePromptTemplates,
    sourceImageGroupBindings,
    perSourceTemplateMode,
    storyboardMode,
    selectedPresetId,
    presetName,
    multiPresetIds,
    templateSplitStrategy,
    splitMinimum,
    splitMaximum,
    splitUnit,
    lineWidth,
    splitTolerance,
    allowTolerance,
    keepSentences,
    sentencePauseOnly,
    quoteSplitSegments,
    lowercaseSplitOutput,
    includeBatchTextNumbering,
    includeBatchPromptNumbering,
    batchNumberStyle,
    includeBatchEmptyLines,
    templateSegments,
    selectedSegmentIds,
    segmentCarets,
    attachedImages,
    imageBindingMode,
    copiedSegmentIds,
    copiedImageIds
  ]);

  // 将标签页数据加载到当前编辑区激活状态
  const applyTabToActiveState = useCallback((targetTab: SplitWorkspaceTab) => {
    isSwitchingTabRef.current = true;

    setTemplateSource(targetTab.templateSource || '');
    setBatchTemplateMode(Boolean(targetTab.batchTemplateMode));
    setBatchTemplateDrafts(
      targetTab.batchTemplateDrafts && targetTab.batchTemplateDrafts.length > 0
        ? targetTab.batchTemplateDrafts
        : [{ id: `batch-draft-${Date.now()}-1`, source: '', templateMode: 'global', template: '' }]
    );
    setActiveBatchSourceIndex(targetTab.activeBatchSourceIndex ?? null);

    setPromptTemplate(targetTab.promptTemplate || `内容："${CONTENT_PLACEHOLDER}"`);
    setSourcePromptTemplates(targetTab.sourcePromptTemplates || {});
    setSourceImageGroupBindings(targetTab.sourceImageGroupBindings || {});
    setPerSourceTemplateMode(Boolean(targetTab.perSourceTemplateMode));
    setStoryboardMode(Boolean(targetTab.storyboardMode));
    setSelectedPresetId(targetTab.selectedPresetId || '');
    setPresetName(targetTab.presetName || '');
    setMultiPresetIds(targetTab.multiPresetIds || []);

    if (targetTab.splitSettings) {
      setTemplateSplitStrategy(targetTab.splitSettings.templateSplitStrategy || 'punctuation');
      setSplitMinimum(targetTab.splitSettings.splitMinimum ?? 10);
      setSplitMaximum(targetTab.splitSettings.splitMaximum ?? 18);
      setSplitUnit(targetTab.splitSettings.splitUnit || 'words');
      setLineWidth(targetTab.splitSettings.lineWidth ?? 18);
      setSplitTolerance(targetTab.splitSettings.splitTolerance ?? 3);
      setAllowTolerance(targetTab.splitSettings.allowTolerance ?? true);
      setKeepSentences(targetTab.splitSettings.keepSentences ?? true);
      setSentencePauseOnly(targetTab.splitSettings.sentencePauseOnly ?? true);
      setQuoteSplitSegments(targetTab.splitSettings.quoteSplitSegments ?? false);
      setLowercaseSplitOutput(targetTab.splitSettings.lowercaseSplitOutput ?? false);
      if (targetTab.splitSettings.includeBatchTextNumbering !== undefined) {
        setIncludeBatchTextNumbering(targetTab.splitSettings.includeBatchTextNumbering);
      }
      if (targetTab.splitSettings.includeBatchPromptNumbering !== undefined) {
        setIncludeBatchPromptNumbering(targetTab.splitSettings.includeBatchPromptNumbering);
      }
      if (targetTab.splitSettings.batchNumberStyle !== undefined) {
        setBatchNumberStyle(targetTab.splitSettings.batchNumberStyle);
      }
      if (targetTab.splitSettings.includeBatchEmptyLines !== undefined) {
        setIncludeBatchEmptyLines(targetTab.splitSettings.includeBatchEmptyLines);
      }
    }

    setTemplateSegments(targetTab.templateSegments || []);
    setSelectedSegmentIds(new Set(targetTab.selectedSegmentIds || []));
    setSegmentCarets(targetTab.segmentCarets || {});
    setAttachedImages(targetTab.attachedImages || []);
    setImageBindingMode(targetTab.imageBindingMode || 'per-segment');
    setCopiedSegmentIds(new Set(targetTab.copiedSegmentIds || []));
    setCopiedImageIds(new Set(targetTab.copiedImageIds || []));
    setSearchKeyword('');
    setHighlightedSegmentId(null);

    setTimeout(() => {
      isSwitchingTabRef.current = false;
    }, 50);
  }, []);

  // 先从本地缓存恢复 File 和有效 URL，再加载编辑区，避免空白状态覆盖工程。
  useEffect(() => {
    let canceled = false;
    const restore = async () => {
      let restoredTabs = tabs;
      try {
        restoredTabs = await Promise.all(tabs.map(async tab => ({
          ...tab, attachedImages: await restoreWorkspaceImages(tab.attachedImages || [])
        })));
      } catch (error) {
        console.error('恢复本地图片缓存失败', error);
        setStatusMsg('本地图片缓存恢复失败，请重新导入原图或工程文件');
      }
      if (canceled) return;
      setTabs(restoredTabs);
      const targetTab = restoredTabs.find(tab => tab.id === activeTabId) || restoredTabs[0];
      if (targetTab) {
        setActiveTabId(targetTab.id);
        applyTabToActiveState(targetTab);
      } else {
        isSwitchingTabRef.current = false;
      }
    };
    void restore();
    return () => { canceled = true; };
  }, [applyTabToActiveState]);

  // 标签页切换
  const handleSelectTab = useCallback((nextTabId: string) => {
    if (nextTabId === activeTabId) return;
    const currentSnapshot = captureCurrentTabSnapshot();
    const updatedTabs = tabs.map(t => t.id === activeTabId ? currentSnapshot : t);
    setTabs(updatedTabs);

    const targetTab = updatedTabs.find(t => t.id === nextTabId);
    if (targetTab) {
      setActiveTabId(nextTabId);
      applyTabToActiveState(targetTab);
    }
  }, [activeTabId, captureCurrentTabSnapshot, tabs, applyTabToActiveState]);

  // 新建标签页
  const handleCreateTab = useCallback(() => {
    const currentSnapshot = captureCurrentTabSnapshot();
    let nextNum = tabs.length + 1;
    while (tabs.some(t => t.title === `标签页 ${nextNum}`)) {
      nextNum++;
    }
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTab = createDefaultWorkspaceTab(newTabId, `标签页 ${nextNum}`);

    const nextTabs = [...tabs.map(t => t.id === activeTabId ? currentSnapshot : t), newTab];
    setTabs(nextTabs);
    setActiveTabId(newTab.id);
    applyTabToActiveState(newTab);
    setStatusMsg(`已新建标签页“${newTab.title}”`);
  }, [activeTabId, captureCurrentTabSnapshot, tabs, applyTabToActiveState]);

  // 关闭标签页
  const handleCloseTab = useCallback((targetTabId: string) => {
    const tabToClose = tabs.find(t => t.id === targetTabId);
    if (!tabToClose) return;

    // 检查是否有内容
    const hasContent = (tabToClose.templateSegments && tabToClose.templateSegments.length > 0) ||
      (tabToClose.attachedImages && tabToClose.attachedImages.length > 0) ||
      (tabToClose.templateSource && tabToClose.templateSource.trim().length > 0);

    if (hasContent) {
      const confirmDelete = window.confirm(`确定要关闭标签页“${tabToClose.title}”吗？\n该标签页下的拆分内容与绑定的图片都将被清除。`);
      if (!confirmDelete) return;
    }

    // 若只剩最后一个标签页，则重置为新的空白标签页
    if (tabs.length <= 1) {
      const resetTab = createDefaultWorkspaceTab(`tab-${Date.now()}`, '标签页 1');
      setTabs([resetTab]);
      setActiveTabId(resetTab.id);
      applyTabToActiveState(resetTab);
      setStatusMsg('已重置为新的空白标签页');
      return;
    }

    // 释放目标标签页的 blob URL
    (tabToClose.attachedImages || []).forEach(img => {
      try {
        if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      } catch {}
    });

    const targetIndex = tabs.findIndex(t => t.id === targetTabId);
    const nextTabs = tabs.filter(t => t.id !== targetTabId);
    setTabs(nextTabs);

    // 如果关闭的是当前激活标签页，自动切换到相邻标签页
    if (targetTabId === activeTabId) {
      const nextActiveIndex = Math.max(0, Math.min(targetIndex, nextTabs.length - 1));
      const nextActiveTab = nextTabs[nextActiveIndex];
      setActiveTabId(nextActiveTab.id);
      applyTabToActiveState(nextActiveTab);
    }

    setStatusMsg(`已关闭标签页“${tabToClose.title}”`);
  }, [tabs, activeTabId, applyTabToActiveState]);

  // 批量清理始终包含当前编辑区的最新快照，避免遗漏尚未同步的配图。
  const handleResetAllTabs = useCallback((deleteTabs: boolean) => {
    const message = deleteTabs
      ? `确定要删除全部 ${tabs.length} 个标签页吗？\n所有文案、描述词、拆分分镜和绑定图片都将被移除，并重新建立一个空白标签页。\n此操作不可撤销，建议先保存工程记录。`
      : `确定要清空全部 ${tabs.length} 个标签页吗？\n所有文案、描述词、拆分分镜和绑定图片都将被清空，标签页名称保留，设置恢复默认。\n此操作不可撤销，建议先保存工程记录。`;
    if (!window.confirm(message)) return;

    const currentSnapshot = captureCurrentTabSnapshot();
    const currentTabs = tabs.map(tab => tab.id === activeTabId ? currentSnapshot : tab);
    const imageUrls = new Set<string>(currentTabs.flatMap(tab =>
      (tab.attachedImages || []).map(image => image.url).filter((url): url is string =>
        typeof url === 'string' && url.startsWith('blob:')
      )
    ));

    const nextTabs = deleteTabs
      ? [createDefaultWorkspaceTab(`tab-${Date.now()}`, '标签页 1')]
      : currentTabs.map(tab => ({
          ...createDefaultWorkspaceTab(tab.id, tab.title),
          createdAt: tab.createdAt
        }));
    const nextActiveTab = nextTabs.find(tab => tab.id === activeTabId) || nextTabs[0];
    setTabs(nextTabs);
    setActiveTabId(nextActiveTab.id);
    applyTabToActiveState(nextActiveTab);
    editorHistoryRef.current = { source: { undo: [], redo: [] }, template: { undo: [], redo: [] } };
    segmentUndoStackRef.current = [];
    segmentRedoStackRef.current = [];
    setCanUndoSegments(false);
    setCanRedoSegments(false);
    setLastActionToast(null);
    setShowDiffModal(false);
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    setStatusMsg(deleteTabs ? '已删除所有标签页，并新建一个空白标签页' : `已清空全部 ${nextTabs.length} 个标签页`);
  }, [tabs, activeTabId, captureCurrentTabSnapshot, applyTabToActiveState]);

  // 重命名标签页
  const handleRenameTab = useCallback((targetTabId: string, newTitle: string) => {
    setTabs(prev => prev.map(t => t.id === targetTabId ? { ...t, title: newTitle, updatedAt: Date.now() } : t));
  }, []);

  // 复制标签页副本
  const handleDuplicateTab = useCallback((targetTabId: string) => {
    const currentSnapshot = captureCurrentTabSnapshot();
    const currentTabs = tabs.map(t => t.id === activeTabId ? currentSnapshot : t);
    const sourceTab = currentTabs.find(t => t.id === targetTabId);
    if (!sourceTab) return;

    const clonedId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const clonedTab: SplitWorkspaceTab = {
      ...JSON.parse(JSON.stringify(sourceTab)),
      id: clonedId,
      title: `${sourceTab.title} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // 保持 attachedImages 的 File/Blob 引用
      attachedImages: [...sourceTab.attachedImages]
    };

    const nextTabs = [...currentTabs, clonedTab];
    setTabs(nextTabs);
    setActiveTabId(clonedTab.id);
    applyTabToActiveState(clonedTab);
    setStatusMsg(`已创建“${sourceTab.title}”的副本`);
  }, [activeTabId, captureCurrentTabSnapshot, tabs, applyTabToActiveState]);

  // 自动将当前活跃标签页的修改同步回 tabs 数组并持久化
  useEffect(() => {
    if (isSwitchingTabRef.current) return;
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      return {
        ...t,
        updatedAt: Date.now(),
        templateSource,
        batchTemplateMode,
        batchTemplateDrafts,
        activeBatchDraftIndex: 0,
        activeBatchSourceIndex,
        promptTemplate,
        sourcePromptTemplates,
        sourceImageGroupBindings,
        perSourceTemplateMode,
        storyboardMode,
        selectedPresetId,
        presetName,
        multiPresetIds,
        splitSettings: {
          templateSplitStrategy,
          splitMinimum,
          splitMaximum,
          splitUnit,
          lineWidth,
          splitTolerance,
          allowTolerance,
          keepSentences,
          sentencePauseOnly,
          quoteSplitSegments,
          lowercaseSplitOutput,
          includeBatchTextNumbering,
          includeBatchPromptNumbering,
          batchNumberStyle,
          includeBatchEmptyLines
        },
        templateSegments,
        selectedSegmentIds: Array.from(selectedSegmentIds),
        segmentCarets,
        attachedImages,
        imageBindingMode,
        copiedSegmentIds: Array.from(copiedSegmentIds),
        copiedImageIds: Array.from(copiedImageIds)
      };
    }));
  }, [
    activeTabId,
    templateSource,
    batchTemplateMode,
    batchTemplateDrafts,
    activeBatchSourceIndex,
    promptTemplate,
    sourcePromptTemplates,
    sourceImageGroupBindings,
    perSourceTemplateMode,
    storyboardMode,
    selectedPresetId,
    presetName,
    multiPresetIds,
    templateSplitStrategy,
    splitMinimum,
    splitMaximum,
    splitUnit,
    lineWidth,
    splitTolerance,
    allowTolerance,
    keepSentences,
    sentencePauseOnly,
    quoteSplitSegments,
    lowercaseSplitOutput,
    includeBatchTextNumbering,
    includeBatchPromptNumbering,
    batchNumberStyle,
    includeBatchEmptyLines,
    templateSegments,
    selectedSegmentIds,
    segmentCarets,
    attachedImages,
    imageBindingMode,
    copiedSegmentIds,
    copiedImageIds
  ]);

  // Merge frequent interactions into one persistence write; flush on lifecycle exits.
  const pendingWorkspaceSaveRef = useRef<(() => void) | null>(null);
  const workspaceSaveRevisionRef = useRef(0);
  const workspaceSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const flush = () => {
      if (workspaceSaveTimerRef.current !== null) window.clearTimeout(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = null;
      const save = pendingWorkspaceSaveRef.current;
      pendingWorkspaceSaveRef.current = null;
      save?.();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => {
    const revision = ++workspaceSaveRevisionRef.current;
    pendingWorkspaceSaveRef.current = async () => {
      try {
        await cacheWorkspaceImages(tabs.flatMap(tab => tab.attachedImages || []));
        if (revision !== workspaceSaveRevisionRef.current) return;
        localStorage.setItem('template_batch_editor_active_tab_id', activeTabId);
        const serializableTabs = tabs.map(tab => ({
          ...tab,
          attachedImages: (tab.attachedImages || []).map(img => ({
            id: img.id, name: img.name, fullPath: img.fullPath || img.name, originalPath: getOriginalImagePath(img),
            size: img.size || 0, gyazoUrl: img.gyazoUrl
          }))
        }));
        localStorage.setItem('template_batch_editor_tabs_v1', JSON.stringify(serializableTabs));
      } catch (error) {
        console.error('保存本地工作区失败', error);
        setStatusMsg('本地自动保存失败，请使用“保存工程记录”备份当前工程');
      }
    };
    if (workspaceSaveTimerRef.current !== null) window.clearTimeout(workspaceSaveTimerRef.current);
    workspaceSaveTimerRef.current = window.setTimeout(() => {
      workspaceSaveTimerRef.current = null;
      const save = pendingWorkspaceSaveRef.current;
      pendingWorkspaceSaveRef.current = null;
      save?.();
    }, 600);
  }, [tabs, activeTabId]);

  const handleEditorShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>, editor: 'source' | 'template') => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    event.shiftKey ? redoEditor(editor) : undoEditor(editor);
  };

  // 记录分镜状态快照（用于撤销/重做与前后对比）
  const recordSegmentChange = (actionName: string): SegmentSnapshot => {
    const currentSnapshot: SegmentSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionName,
      timestamp: Date.now(),
      segments: JSON.parse(JSON.stringify(templateSegments)),
      templateSource,
      batchTemplateDrafts: JSON.parse(JSON.stringify(batchTemplateDrafts)),
      activeBatchSourceIndex,
      selectedSegmentIds: Array.from(selectedSegmentIds)
    };
    segmentUndoStackRef.current.push(currentSnapshot);
    if (segmentUndoStackRef.current.length > 50) {
      segmentUndoStackRef.current.shift();
    }
    segmentRedoStackRef.current = [];
    setCanUndoSegments(true);
    setCanRedoSegments(false);
    return currentSnapshot;
  };

  const pushActionToast = (actionName: string, beforeSegs: TemplateSegment[], afterSegs: TemplateSegment[]) => {
    setLastActionToast({
      actionName,
      timestamp: Date.now(),
      beforeSegments: beforeSegs,
      afterSegments: afterSegs
    });
  };

  // 撤销分镜修改
  const handleUndoSegments = () => {
    const prev = segmentUndoStackRef.current.pop();
    if (!prev) return;

    const currentSnapshot: SegmentSnapshot = {
      id: `snap-redo-${Date.now()}`,
      actionName: prev.actionName,
      timestamp: Date.now(),
      segments: JSON.parse(JSON.stringify(templateSegments)),
      templateSource,
      batchTemplateDrafts: JSON.parse(JSON.stringify(batchTemplateDrafts)),
      activeBatchSourceIndex,
      selectedSegmentIds: Array.from(selectedSegmentIds)
    };
    segmentRedoStackRef.current.push(currentSnapshot);

    setTemplateSegments(prev.segments);
    setTemplateSource(prev.templateSource);
    if (prev.batchTemplateDrafts) setBatchTemplateDrafts(prev.batchTemplateDrafts);
    setActiveBatchSourceIndex(prev.activeBatchSourceIndex ?? null);
    setSelectedSegmentIds(new Set(prev.selectedSegmentIds || []));

    setCanUndoSegments(segmentUndoStackRef.current.length > 0);
    setCanRedoSegments(true);
    setLastActionToast(null);
    setStatusMsg(`已撤销【${prev.actionName}】操作`);
  };

  // 重做分镜修改
  const handleRedoSegments = () => {
    const next = segmentRedoStackRef.current.pop();
    if (!next) return;

    const currentSnapshot: SegmentSnapshot = {
      id: `snap-undo-${Date.now()}`,
      actionName: next.actionName,
      timestamp: Date.now(),
      segments: JSON.parse(JSON.stringify(templateSegments)),
      templateSource,
      batchTemplateDrafts: JSON.parse(JSON.stringify(batchTemplateDrafts)),
      activeBatchSourceIndex,
      selectedSegmentIds: Array.from(selectedSegmentIds)
    };
    segmentUndoStackRef.current.push(currentSnapshot);

    setTemplateSegments(next.segments);
    setTemplateSource(next.templateSource);
    if (next.batchTemplateDrafts) setBatchTemplateDrafts(next.batchTemplateDrafts);
    setActiveBatchSourceIndex(next.activeBatchSourceIndex ?? null);
    setSelectedSegmentIds(new Set(next.selectedSegmentIds || []));

    setCanUndoSegments(true);
    setCanRedoSegments(segmentRedoStackRef.current.length > 0);
    setStatusMsg(`已重做【${next.actionName}】操作`);
  };

  // 取消本次修改（直接还原为上一步）
  const handleCancelCurrentChange = () => {
    if (lastActionToast) {
      setTemplateSegments(lastActionToast.beforeSegments);
      setLastActionToast(null);
      setStatusMsg(`已取消本次【${lastActionToast.actionName}】修改，已恢复原状`);
      return;
    }
    handleUndoSegments();
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showImportSegmentsModal || showDiffModal || showPresetLibraryModal || showCyclePresetModal) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        const activeEl = document.activeElement;
        const isEditingSourceOrTemplate = activeEl === templateSourceRef.current || activeEl === promptTemplateRef.current;
        if (isEditingSourceOrTemplate) return;

        if (e.shiftKey) {
          if (canRedoSegments) {
            e.preventDefault();
            handleRedoSegments();
          }
        } else {
          if (canUndoSegments) {
            e.preventDefault();
            handleUndoSegments();
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [canUndoSegments, canRedoSegments, showImportSegmentsModal, showDiffModal, showPresetLibraryModal, showCyclePresetModal]);

  const insertManualSplitMarker = () => {
    const textarea = templateSourceRef.current;
    const start = textarea?.selectionStart ?? templateSource.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue = `${templateSource.slice(0, start)}${MANUAL_SPLIT_MARKER}${templateSource.slice(end)}`;
    const nextCaret = start + MANUAL_SPLIT_MARKER.length;
    setEditorValue('source', nextValue);
    window.requestAnimationFrame(() => {
      templateSourceRef.current?.focus();
      templateSourceRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
    setStatusMsg(`已在光标位置添加 ${MANUAL_SPLIT_MARKER}`);
  };

  const insertBatchSourceMarker = () => {
    const textarea = templateSourceRef.current;
    const start = textarea?.selectionStart ?? templateSource.length;
    const end = textarea?.selectionEnd ?? start;
    const insertion = `${start > 0 && templateSource[start - 1] !== '\n' ? '\n' : ''}${BATCH_SOURCE_MARKER}\n`;
    const nextValue = `${templateSource.slice(0, start)}${insertion}${templateSource.slice(end)}`;
    const nextCaret = start + insertion.length;
    setEditorValue('source', nextValue);
    window.requestAnimationFrame(() => {
      templateSourceRef.current?.focus();
      templateSourceRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
    setStatusMsg(`已在光标位置添加 ${BATCH_SOURCE_MARKER}`);
  };

  // 从系统剪贴板直接读取内容到导入弹窗
  const handleReadClipboardToImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setImportSegmentsRawText(text);
        setStatusMsg('已从剪贴板读取内容');
      } else {
        setStatusMsg('剪贴板中无内容');
      }
    } catch {
      setStatusMsg('读取剪贴板受浏览器权限限制，请直接在文本框中按 Cmd+V / Ctrl+V 粘贴');
    }
  };

  const parseImportScripts = (raw: string, options: Parameters<typeof parseMultiScriptPreSplit>[1]) => {
    const scripts = parseMultiScriptPreSplit(raw, options);
    return scripts.map(script => {
      let annotated: ReturnType<typeof parseAnnotatedSegments> | undefined;
      if (importAnnotatedMode) {
        try { annotated = parseAnnotatedSegments(script.segments.join('\n')); }
        catch { return { ...script, annotated: undefined, segments: [] as string[] }; }
      }
      return { ...script, annotated, segments: annotated ? annotated.map(item => item.text) : script.segments, sourceText: annotated ? annotated.map(item => item.text).join(`\n${MANUAL_SPLIT_MARKER}\n`) : script.sourceText };
    }).filter(script => script.segments.length > 0);
  };

  // 确认从导入文本生成分镜切片（支持单篇及 Google Sheets 多篇二次加工）
  const handleConfirmImportSegments = () => {
    const parsedScripts = parseImportScripts(importSegmentsRawText, {
      stripQuotes: importStripQuotes,
      stripNumbering: importStripNumbering,
      skipEmptyLines: importSkipEmptyLines,
      direction: importDirection,
      hasHeaderRow: importHasHeader
    });

    if (parsedScripts.length === 0) {
      setStatusMsg('未识别到有效的分镜段落内容');
      return;
    }

    // 1. 如果识别到多篇文案（如从 Google Sheets 选中多个单元格）
    if (parsedScripts.length > 1) {
      if (importTargetMode === 'tabs') {
        // 多标签页模式：自动为每篇文案新建一个独立工作区标签页
        const newTabs: SplitWorkspaceTab[] = parsedScripts.map((s, idx) => {
          const tabId = `tab-imported-${Date.now()}-${idx}`;
          const baseTab = createDefaultWorkspaceTab(tabId, s.title || `篇章 ${idx + 1}`);
          const segs: TemplateSegment[] = s.segments.map((text, pIdx) => ({
            id: `imported-seg-${Date.now()}-${idx}-${pIdx}`,
            text,
            ...s.annotated?.[pIdx]
          }));
          return {
            ...baseTab,
            templateSource: s.sourceText,
            batchTemplateMode: false,
            templateSegments: segs,
            promptTemplate: s.template || promptTemplate
          };
        });

        const isCurrentEmpty = !templateSource.trim() && templateSegments.length === 0;
        let nextTabs: SplitWorkspaceTab[];
        if (isCurrentEmpty) {
          nextTabs = newTabs;
        } else {
          const currentSnap = captureCurrentTabSnapshot();
          const existing = tabs.map(t => t.id === activeTabId ? currentSnap : t);
          nextTabs = [...existing, ...newTabs];
        }
        setTabs(nextTabs);

        const firstTab = newTabs[0];
        if (firstTab) {
          setActiveTabId(firstTab.id);
          setTemplateSource(firstTab.templateSource);
          setBatchTemplateMode(false);
          setTemplateSegments(firstTab.templateSegments);
          setSelectedSegmentIds(new Set());
          if (firstTab.promptTemplate) {
            setPromptTemplate(firstTab.promptTemplate);
          }
        }

        setShowImportSegmentsModal(false);
        setImportSegmentsRawText('');
        const totalSegs = parsedScripts.reduce((acc, s) => acc + s.segments.length, 0);
        setStatusMsg(`🎉 成功导入 ${parsedScripts.length} 篇文案（共 ${totalSegs} 个分镜）并自动生成独立标签页！已切换至第 1 篇`);
        return;
      }

      // 批量篇章模式：在当前工作区批量管理
      const drafts: BatchTemplateDraft[] = parsedScripts.map((s, idx) => ({
        id: `batch-draft-${Date.now()}-${idx}`,
        source: s.sourceText,
        templateMode: s.template ? 'custom' : 'global',
        template: s.template || ''
      }));

      const newSegments: TemplateSegment[] = parsedScripts.flatMap((s, sIdx) =>
        s.segments.map((text, pIdx) => ({
          id: `imported-seg-${Date.now()}-${sIdx}-${pIdx}`,
          text,
          ...s.annotated?.[pIdx],
          sourceIndex: sIdx,
          promptTemplate: s.template
        }))
      );

      const combinedSource = parsedScripts.map(s => s.sourceText).join(`\n${BATCH_SOURCE_MARKER}\n`);

      setBatchTemplateDrafts(drafts);
      setBatchTemplateMode(true);
      if (parsedScripts.some(s => s.template)) {
        setPerSourceTemplateMode(true);
        setSourcePromptTemplates(
          Object.fromEntries(parsedScripts.map((s, idx) => [idx, s.template || promptTemplate]))
        );
      }
      const snapshot = templateSegments.length > 0 ? recordSegmentChange('批量载入分镜') : null;
      const retainedSegments = retainSegmentAssignments(templateSegments, newSegments);
    setTemplateSegments(retainedSegments);
    setCopiedSegmentIds(new Set());
      if (snapshot) pushActionToast('批量载入分镜', snapshot.segments, retainedSegments);
      setSelectedSegmentIds(new Set());
      setEditorValue('source', combinedSource);
      setActiveBatchSourceIndex(null);
      setShowImportSegmentsModal(false);
      setImportSegmentsRawText('');
      setStatusMsg(`🎉 成功在当前工作区批量载入 ${parsedScripts.length} 篇文案（共 ${newSegments.length} 个分镜）！可按篇章独立检查与出图`);
      return;
    }

    // 2. 单篇文案导入
    const single = parsedScripts[0];
    const newSegments: TemplateSegment[] = single.segments.map((text, index) => ({
      id: `imported-seg-${Date.now()}-${index}`,
      text,
      ...single.annotated?.[index]
    }));

    const snapshot = templateSegments.length > 0 ? recordSegmentChange('载入预拆分文案') : null;
    const retainedSegments = retainSegmentAssignments(templateSegments, newSegments);
    setTemplateSegments(retainedSegments);
    setCopiedSegmentIds(new Set());
    if (snapshot) pushActionToast('载入预拆分文案', snapshot.segments, retainedSegments);
    setSelectedSegmentIds(new Set());
    setEditorValue('source', single.sourceText);
    if (single.template) {
      setPromptTemplate(single.template);
    }
    setBatchTemplateMode(false);
    setShowImportSegmentsModal(false);
    setImportSegmentsRawText('');
    setStatusMsg(`✅ 成功载入 ${newSegments.length} 个分镜段落！可在下方表格中逐段检查与微调拆分点`);
  };

  // 快捷：将当前原始文案按换行直接生成分镜
  const handleSplitByNewlines = () => {
    if (!templateSource.trim()) {
      setStatusMsg('当前原始文案为空，请先输入或粘贴文案');
      return;
    }

    const parsed = parsePreSplitText(templateSource, {
      stripQuotes: true,
      stripNumbering: false,
      skipEmptyLines: true
    });

    if (parsed.length === 0) {
      setStatusMsg('未能识别出有效段落');
      return;
    }

    const newSegments: TemplateSegment[] = parsed.map((text, index) => ({
      id: `newline-seg-${Date.now()}-${index}`,
      text
    }));

    const newSource = parsed.join(`\n${MANUAL_SPLIT_MARKER}\n`);
    const snapshot = templateSegments.length > 0 ? recordSegmentChange('按换行直接生成') : null;
    const retainedSegments = retainSegmentAssignments(templateSegments, newSegments);
    setTemplateSegments(retainedSegments);
    setCopiedSegmentIds(new Set());
    if (snapshot) pushActionToast('按换行直接生成', snapshot.segments, retainedSegments);
    setSelectedSegmentIds(new Set());
    setEditorValue('source', newSource);
    setStatusMsg(`✅ 已按换行直接生成 ${newSegments.length} 个分镜段落！可在下方表格中检查与微调`);
  };

  // 8秒讲道口播拆分：一键消除换行、数字转英文单词、按8s自然语速(约16-20词)自然断句并加双引号引用
  const handle8sSermonSplit = () => {
    const sources = batchTemplateMode
      ? batchTemplateDrafts.map(item => item.source.trim()).filter(Boolean)
      : [templateSource.trim()].filter(Boolean);
    if (sources.length === 0) {
      setStatusMsg('当前原始文案为空，请先输入或粘贴文案');
      return;
    }

    const sermonPartsBySource = sources.map(source => splitText8sSermon(source, {
      quote: quoteSplitSegments,
      maxWords: splitUnit === 'words' ? splitMaximum : 20,
      minWords: splitUnit === 'words' ? splitMinimum : 14,
      maxChars: splitUnit === 'characters' ? splitMaximum : 32,
      minChars: splitUnit === 'characters' ? splitMinimum : 22
    }));
    if (sermonPartsBySource.every(parts => parts.length === 0)) {
      setStatusMsg('未能识别出有效段落');
      return;
    }

    const now = Date.now();
    const newSegments: TemplateSegment[] = sermonPartsBySource.flatMap((parts, sourceIndex) =>
      parts.map((text, partIndex) => ({
        id: `sermon-${now}-${sourceIndex}-${partIndex}`,
        text,
        sourceIndex: batchTemplateMode ? sourceIndex : undefined,
        modifiedType: 'sermon' as const,
        modifiedAt: now
      }))
    );
    const snapshot = templateSegments.length > 0 ? recordSegmentChange('8秒讲道口播拆分') : null;
    const retainedSegments = retainSegmentAssignments(templateSegments, newSegments);
    setTemplateSegments(retainedSegments);
    setCopiedSegmentIds(new Set());
    if (snapshot) pushActionToast('8秒讲道口播拆分', snapshot.segments, retainedSegments);
    setSelectedSegmentIds(new Set());
    // 批量时必须保留每篇原文，不能用处理后的分段结果覆盖合并输入框。
    if (!batchTemplateMode) {
      setEditorValue('source', sermonPartsBySource[0].join(`\n${MANUAL_SPLIT_MARKER}\n`));
    } else {
      setActiveBatchSourceIndex(0);
    }
    setStatusMsg(`✅ 8秒口播已分别拆分 ${sources.length} 篇文案，共生成 ${newSegments.length} 段；每篇原文和编号均已保留。`);
  };

  // 纯 AI 分段：只把“在哪里断段”交给 AI；字幕断行仍由本地的动态字幕设置处理。
  const handlePureAiSegmentSplit = async () => {
    const validBatchDrafts = batchTemplateDrafts.filter(item => item.source.trim());
    const sources = batchTemplateMode ? validBatchDrafts.map(item => item.source.trim()) : [templateSource.trim()];
    if (!sources.length || !sources[0]) {
      setStatusMsg('请先输入需要拆分的原始文案');
      return;
    }
    setAiSegmenting(true);
    try {
      const ai = getAiInstance?.();
      if (!ai) throw new Error('请先在右上角 API 密钥设置中保存可用的 Google AI Studio Key');
      const generatedBySource: TemplateSegment[] = [];
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        setStatusMsg(`AI 正在分段第 ${sourceIndex + 1}/${sources.length} 篇文案…`);
        const cleanSource = convertNumbersToEnglishWords(sources[sourceIndex]).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        let response: any;
        let lastError: any;
        // Google 会在模型高峰期返回 503；这不是 Key 错，短暂重试即可恢复。
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            // 与“智能翻译”完全一致地走流式接口：同一 Key 下，Google 对普通请求与
            // 流式请求的容量调度不同；这里收齐流式文本后再解析 JSON 分段结果。
            const responseStream = await ai.models.generateContentStream({
              model: effectiveModel,
              contents: `${aiSegmentPrompt.trim()}\n\nOriginal text:\n${cleanSource}`
            });
            let fullText = '';
            for await (const chunk of responseStream) {
              fullText += chunk.text || '';
            }
            response = { text: fullText };
            break;
          } catch (error: any) {
            lastError = error;
            const message = String(error?.message || '');
            const isTemporaryOverload = message.includes('503') || message.includes('UNAVAILABLE') || message.includes('high demand');
            const isRateLimited = message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota exceeded');
            // 429 按 Google 返回的 retry delay 等一次，避免无意义地连续撞额度。
            if (isRateLimited && attempt === 0) {
              const retrySeconds = Number(message.match(/(?:retry in|retryDelay[^0-9]*)(\d+(?:\.\d+)?)\s*s/i)?.[1] || 35);
              const waitSeconds = Math.min(Math.max(Math.ceil(retrySeconds) + 1, 2), 60);
              setStatusMsg(`当前模型额度已满，${waitSeconds} 秒后自动重试…`);
              await new Promise(resolve => window.setTimeout(resolve, waitSeconds * 1000));
              continue;
            }
            if (!isTemporaryOverload || attempt === 2) throw error;
            setStatusMsg(`模型暂时繁忙，正在重试（${attempt + 1}/2）…`);
            await new Promise(resolve => window.setTimeout(resolve, (attempt + 1) * 1200));
          }
        }
        if (!response) throw lastError || new Error('AI 未返回结果');
        const resultText = ((response as any).text || '').trim();
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error(`第 ${sourceIndex + 1} 篇没有返回分段列表`);
        const parts = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parts) || !parts.length || parts.some(part => typeof part !== 'string' || !part.trim())) {
          throw new Error(`第 ${sourceIndex + 1} 篇返回的分段格式不正确`);
        }
        const now = Date.now();
        parts.forEach((text: string, partIndex: number) => generatedBySource.push({
          id: `ai-segment-${now}-${sourceIndex}-${partIndex}`,
          text: text.trim(),
          sourceIndex,
          modifiedType: 'sermon',
          modifiedAt: now
        }));
      }
      const snapshot = templateSegments.length > 0 ? recordSegmentChange('纯 AI 分段') : null;
      setTemplateSegments(generatedBySource);
      if (snapshot) pushActionToast('纯 AI 分段', snapshot.segments, generatedBySource);
      setActiveBatchSourceIndex(batchTemplateMode ? 0 : null);
      setSelectedSegmentIds(new Set());
      setStatusMsg(`✅ 纯 AI 分段完成：共生成 ${generatedBySource.length} 段；动态字幕断行仍按当前设置处理。`);
    } catch (error: any) {
      setStatusMsg(`AI 分段失败：${error?.message || '请稍后重试'}`);
    } finally {
      setAiSegmenting(false);
    }
  };

  // 将文案中的所有阿拉伯数字全部转换为英文单词
  const handleConvertNumbersToWords = () => {
    if (!templateSource.trim()) {
      setStatusMsg('当前原始文案为空，请先输入或粘贴文案');
      return;
    }
    const converted = convertNumbersToEnglishWords(templateSource);
    if (converted === templateSource) {
      setStatusMsg('文案中未发现需要转换的阿拉伯数字');
      return;
    }
    setEditorValue('source', converted);
    setStatusMsg('✅ 已将文案中的所有阿拉伯数字（含章节编号、序数词、百分比、金额等）全部转为英文单词！');
  };

  // 一键应用 8 秒讲道口播拆分标准参数预设
  const apply8sSermonPreset = () => {
    setSplitUnit('words');
    setSplitMinimum(16);
    setSplitMaximum(20);
    setTemplateSplitStrategy('sermon');
    setKeepSentences(true);
    setSentencePauseOnly(true);
    setAllowTolerance(false);
    setQuoteSplitSegments(true);
    setStatusMsg('🎙️ 已应用【8秒讲道口播】参数预设（16-20词/段，优先停顿断句，单行自动加引号）');
  };

  const handleTemplateSourcePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData('text/html');
    if (!html || !/<t[dh]\b/i.test(html)) return;
    const documentFragment = new DOMParser().parseFromString(html, 'text/html');
    const readCell = (cell: Element) => {
        const clone = cell.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('div, p').forEach(block => {
          if (block.nextSibling) block.append('\n');
        });
        return (clone.textContent || '')
          .replace(/\r\n?/g, '\n')
          .replace(/\u00a0/g, ' ')
          .replace(/^\n+|\n+$/g, '');
    };
    const pastedRows = Array.from(documentFragment.querySelectorAll('tr'))
      .map(row => Array.from(row.querySelectorAll('td')).map(readCell))
      .filter(row => row.some(cell => cell.trim().length > 0));
    const cells = pastedRows.flat().filter(cell => cell.trim().length > 0);
    if (cells.length < 2 && pastedRows.length < 2) return;

    event.preventDefault();
    const drafts = pastedRows
      .filter(row => (row[0] || '').trim())
      .map((row, index): BatchTemplateDraft => ({
        id: `batch-draft-${Date.now()}-${index}`,
        source: row[0],
        templateMode: (row[1] || '').trim() ? 'custom' : 'global',
        template: row[1] || ''
      }));
    setBatchTemplateDrafts(drafts);
    setEditorValue('source', drafts.map(item => item.source).join(`\n${BATCH_SOURCE_MARKER}\n`));
    setBatchTemplateMode(true);
    setStatusMsg(pastedRows.some(row => (row[1] || '').trim())
      ? `已识别 ${drafts.length} 篇文案及对应描述词模板`
      : `已识别 ${drafts.length} 篇文案，默认使用统一模板`);
  };

  const handleBatchDescriptionPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>, startIndex: number) => {
    const html = event.clipboardData.getData('text/html');
    if (!html || !/<td\b/i.test(html)) return;
    const documentFragment = new DOMParser().parseFromString(html, 'text/html');
    const readCell = (cell: Element) => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      clone.querySelectorAll('div, p').forEach(block => {
        if (block.nextSibling) block.append('\n');
      });
      return (clone.textContent || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
    };
    const tableRows = Array.from(documentFragment.querySelectorAll('tr'))
      .map(row => Array.from(row.querySelectorAll('td')).map(readCell))
      .filter(row => row.some(cell => cell.trim()));
    const descriptions = tableRows.length === 1
      ? tableRows[0].filter(cell => cell.trim())
      : tableRows.map(row => row[0] || '').filter(cell => cell.trim());
    if (descriptions.length < 2) return;

    event.preventDefault();
    setBatchTemplateDrafts(current => {
      const next = [...current];
      descriptions.forEach((template, offset) => {
        const index = startIndex + offset;
        if (next[index]) next[index] = { ...next[index], templateMode: 'custom', template };
        else next.push({ id: `batch-draft-${Date.now()}-${index}`, source: '', templateMode: 'custom', template });
      });
      return next;
    });
    setStatusMsg(`已从第 ${startIndex + 1} 行开始批量填入 ${descriptions.length} 个描述词模板`);
  };

  const updateBatchTemplateDraft = (id: string, patch: Partial<BatchTemplateDraft>) => {
    setBatchTemplateDrafts(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const addBatchTemplateDraft = () => {
    setBatchTemplateDrafts(items => [...items, { id: `batch-draft-${Date.now()}`, source: '', templateMode: 'global', template: '' }]);
  };

  const insertZeroTemplateDrafts = (segmentsPerArticle: number, articleCount: number) => {
    const source = createZeroTemplateSource(segmentsPerArticle, MANUAL_SPLIT_MARKER);
    const drafts: BatchTemplateDraft[] = Array.from({ length: articleCount }, () => ({
      id: `batch-draft-${crypto.randomUUID()}`,
      source,
      templateMode: 'global',
      template: ''
    }));
    let existingDrafts = batchTemplateDrafts;
    if (!batchTemplateMode && templateSource.trim() && existingDrafts.length === 1 && !existingDrafts[0].source.trim()) {
      existingDrafts = [{ ...existingDrafts[0], source: templateSource }];
    }
    const nextDrafts = existingDrafts.length === 1 && !existingDrafts[0].source.trim() && existingDrafts[0].templateMode === 'global' && !existingDrafts[0].template.trim()
      ? [{ ...drafts[0], id: existingDrafts[0].id }, ...drafts.slice(1)]
      : [...existingDrafts, ...drafts];
    const populatedSources = new Set(templateSegments.map(segment => segment.sourceIndex ?? 0));
    const generated: TemplateSegment[] = [];
    const templates: Record<number, string> = {};
    // 直接生成新文案的片段，也补齐之前已插入但尚未拆分的 0 模板。
    nextDrafts.filter(draft => draft.source.trim()).forEach((draft, sourceIndex) => {
      if (populatedSources.has(sourceIndex)) return;
      const parts = draft.source.split(MANUAL_SPLIT_MARKER).map(text => text.trim()).filter(Boolean);
      if (!parts.length || !parts.every(text => text === '0')) return;
      const template = draft.templateMode === 'custom' ? draft.template : promptTemplate;
      templates[sourceIndex] = template;
      parts.forEach(text => generated.push({ id: `zero-segment-${crypto.randomUUID()}`, text, sourceIndex, promptTemplate: template }));
    });
    setBatchTemplateMode(true);
    setEditorsCollapsed(false);
    setBatchTemplateDrafts(nextDrafts);
    setTemplateSegments(current => [...current, ...generated]);
    setSourcePromptTemplates(current => ({ ...current, ...templates }));
    setActiveBatchSourceIndex(null);
    setSelectedSegmentIds(new Set());
    setSearchKeyword('');
    setSearchFilterMode(false);
    setFilterUncopiedOnly(false);
    setFilterModifiedOnly(false);
    setStatusMsg(`已插入 ${articleCount} 篇模板文案，每篇 ${segmentsPerArticle} 段；下方已生成 ${generated.length} 个内容为 0 的片段（含补齐的历史模板）`);
  };

  const applyGeneratedPresetSets = (sets: GeneratedPresetSet[], order: GenerationOrder) => {
    recordSegmentChange('生成多预设结果');
    const drafts = batchTemplateDrafts.filter(draft => draft.source.trim());
    const bindings = { ...sourceImageGroupBindings };
    const templates = { ...sourcePromptTemplates };
    const generatedBySource = new Map<number, GeneratedPresetSet[]>();
    const usedSources = new Set<number>();
    let nextSourceIndex = Math.max(drafts.length, ...templateSegments.map(segment => (segment.sourceIndex ?? 0) + 1));
    for (const set of sets) {
      const source = set.sourceIndex;
      const first = !usedSources.has(source);
      usedSources.add(source);
      const targetSource = first ? source : nextSourceIndex++;
      const originalDraft = drafts[source];
      const sourceText = originalDraft?.source || getSegmentSourceText(source);
      const draft: BatchTemplateDraft = {
        ...(originalDraft || { source: sourceText, templateMode: 'global', template: '' }),
        id: first && originalDraft ? originalDraft.id : `batch-draft-${crypto.randomUUID()}`,
      };
      drafts[targetSource] = draft;
      if (bindings[source]) bindings[targetSource] = bindings[source];
      templates[targetSource] = set.segments[0]?.promptTemplate || promptTemplate;
      const generated = { ...set, sourceIndex: targetSource, segments: set.segments.map(segment => ({ ...segment, sourceIndex: targetSource })) };
      generatedBySource.set(source, [...(generatedBySource.get(source) || []), generated]);
    }
    // 每个原文案的第一份沿用原索引，额外份数形成独立文案组；保留其他文案。
    setTemplateSegments(current => {
      const emitted = new Set<number>();
      return current.flatMap(segment => {
        const source = segment.sourceIndex ?? 0;
        const generated = generatedBySource.get(source);
        if (!generated) return [segment];
        if (emitted.has(source)) return [];
        emitted.add(source);
        return arrangePresetSets(generated, order);
      });
    });
    setBatchTemplateDrafts(drafts);
    setSourceImageGroupBindings(bindings);
    setSourcePromptTemplates(templates);
    setBatchTemplateMode(true);
    setStoryboardMode(true);
    setPerSourceTemplateMode(false);
    setActiveBatchSourceIndex(null);
    setSelectedSegmentIds(new Set());
    setSearchKeyword('');
    setSearchFilterMode(false);
    setFilterUncopiedOnly(false);
    setFilterModifiedOnly(false);
    setImageOrderSourceIndex(null);
    setStatusMsg(`已生成 ${sets.length} 套文案、${sets.reduce((sum, set) => sum + set.segments.length, 0)} 个片段结果；图片沿用原分配，可在图＋表格中交付`);
  };

  const removeBatchTemplateDraft = (id: string) => {
    setBatchTemplateDrafts(items => items.length === 1 ? [{ ...items[0], source: '', templateMode: 'global', template: '' }] : items.filter(item => item.id !== id));
  };

  const clearBatchTemplateDrafts = () => {
    setBatchTemplateDrafts([{ id: `batch-draft-${Date.now()}`, source: '', templateMode: 'global', template: '' }]);
    setTemplateSegments([]);
    setSelectedSegmentIds(new Set());
    setActiveBatchSourceIndex(null);
    setStatusMsg('已清空全部批量文案，统一描述词模板已保留');
  };

  const insertBatchDraftPlaceholder = (draft: BatchTemplateDraft) => {
    const currentTemplate = draft.templateMode === 'custom' ? draft.template : promptTemplate;
    const textarea = batchTemplateRefs.current[draft.id];
    const start = textarea?.selectionStart ?? currentTemplate.length;
    const end = textarea?.selectionEnd ?? start;
    const nextTemplate = `${currentTemplate.slice(0, start)}${QUOTED_CONTENT_PLACEHOLDER}${currentTemplate.slice(end)}`;
    updateBatchTemplateDraft(draft.id, { templateMode: 'custom', template: nextTemplate });
    const nextCaret = start + QUOTED_CONTENT_PLACEHOLDER.length;
    window.requestAnimationFrame(() => {
      batchTemplateRefs.current[draft.id]?.focus();
      batchTemplateRefs.current[draft.id]?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertBatchDraftSplitMarker = (draft: BatchTemplateDraft) => {
    const textarea = batchSourceRefs.current[draft.id];
    const start = textarea?.selectionStart ?? draft.source.length;
    const end = textarea?.selectionEnd ?? start;
    updateBatchTemplateDraft(draft.id, { source: `${draft.source.slice(0, start)}${MANUAL_SPLIT_MARKER}${draft.source.slice(end)}` });
    const nextCaret = start + MANUAL_SPLIT_MARKER.length;
    window.requestAnimationFrame(() => {
      batchSourceRefs.current[draft.id]?.focus();
      batchSourceRefs.current[draft.id]?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const persistTemplatePresets = (presets: TemplatePreset[]) => {
    setTemplatePresets(presets);
    try { localStorage.setItem(TEMPLATE_PRESETS_KEY, JSON.stringify(presets)); } catch {}
  };

  const saveTemplatePreset = () => {
    const name = presetName.trim();
    if (!name) return setStatusMsg('请先输入预设名称');
    if (!promptTemplate.trim()) return setStatusMsg('完整描述词模板不能为空');
    const existing = templatePresets.find(item => item.name === name);
    const preset: TemplatePreset = { ...existing, id: existing?.id || `${Date.now()}`, name, template: promptTemplate };
    const next = existing ? templatePresets.map(item => item.id === existing.id ? preset : item) : [...templatePresets, preset];
    persistTemplatePresets(next);
    setSelectedPresetId(preset.id);
    setStatusMsg(existing ? `已更新预设“${name}”` : `已保存预设“${name}”`);
  };

  const loadTemplatePreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = templatePresets.find(item => item.id === id);
    if (!preset) return;
    setEditorValue('template', preset.template);
    setPresetName(preset.name);
    setStatusMsg(`已载入预设“${preset.name}”`);
  };

  const deleteTemplatePreset = () => {
    const preset = templatePresets.find(item => item.id === selectedPresetId);
    if (!preset) return setStatusMsg('请先选择要删除的预设');
    persistTemplatePresets(templatePresets.filter(item => item.id !== selectedPresetId));
    setSelectedPresetId('');
    setPresetName('');
    setStatusMsg(`已删除预设“${preset.name}”`);
  };

  const handleSavePresetFromLibrary = (presetData: Omit<TemplatePreset, 'id'>, editId?: string) => {
    let next: TemplatePreset[];
    if (editId) {
      next = templatePresets.map(p => p.id === editId ? { ...presetData, id: editId } : p);
      setStatusMsg(`已更新预设“${presetData.name}”`);
    } else {
      const newId = `preset-${Date.now()}`;
      next = [...templatePresets, { ...presetData, id: newId }];
      setStatusMsg(`已新增预设“${presetData.name}”`);
    }
    persistTemplatePresets(next);
  };

  const handleDeletePresetFromLibrary = (id: string) => {
    const next = templatePresets.filter(p => p.id !== id);
    persistTemplatePresets(next);
    if (selectedPresetId === id) setSelectedPresetId('');
    setMultiPresetIds(prev => prev.filter(x => x !== id));
    setStatusMsg('已删除预设');
  };

  const handleImportPresetsFromLibrary = (imported: TemplatePreset[]) => {
    persistTemplatePresets(imported);
    setStatusMsg(`已成功导入 ${imported.length} 个预设`);
  };

  const applyCyclePresets = (
    presetIds: string[],
    mode: 'by-row' | 'by-source' = 'by-row',
    targetScope: 'all' | 'selected' = 'all'
  ) => {
    if (presetIds.length === 0) {
      showToastNotification('⚠️ 请至少勾选一个预设进行循环填充');
      return;
    }
    const selectedPresets = presetIds
      .map(id => templatePresets.find(p => p.id === id))
      .filter((p): p is TemplatePreset => Boolean(p));
    if (selectedPresets.length === 0) {
      showToastNotification('⚠️ 未找到选中的有效预设');
      return;
    }

    // 循环填充是逐分镜预设分配，必须切到分镜模式，否则第六列会继续使用统一/每篇模板。
    setStoryboardMode(true);
    setPerSourceTemplateMode(false);
    const onlySelected = targetScope === 'selected' && selectedSegmentIds.size > 0;

    setTemplateSegments(prev => {
      let rowIndex = 0;
      return prev.map(seg => {
        if (onlySelected && !selectedSegmentIds.has(seg.id)) {
          return seg;
        }

        let chosenPreset: TemplatePreset;
        if (mode === 'by-source') {
          const sourceIdx = seg.sourceIndex ?? 0;
          chosenPreset = selectedPresets[sourceIdx % selectedPresets.length];
        } else {
          chosenPreset = selectedPresets[rowIndex % selectedPresets.length];
          rowIndex++;
        }

        return {
          ...seg,
          presetId: chosenPreset.id,
          promptTemplate: chosenPreset.template,
          finalPrompt: undefined, // 清空缓存，触发重新生成
        };
      });
    });

    showToastNotification(
      `✅ 已将 ${selectedPresets.length} 个预设按【${mode === 'by-source' ? '篇章循环' : '逐行循环'}】填充到分镜！`
    );
  };

  const resetAllSegmentsToUnifiedPreset = () => {
    setTemplateSegments(prev => prev.map(seg => ({
      ...seg,
      presetId: undefined,
      promptTemplate: undefined,
      finalPrompt: undefined,
    })));
    showToastNotification('✅ 已将所有分镜行恢复为“使用统一模板”');
  };

  const insertContentPlaceholder = () => {
    const textarea = promptTemplateRef.current;
    const start = textarea?.selectionStart ?? promptTemplate.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue = `${promptTemplate.slice(0, start)}${QUOTED_CONTENT_PLACEHOLDER}${promptTemplate.slice(end)}`;
    const nextCaret = start + QUOTED_CONTENT_PLACEHOLDER.length;
    setEditorValue('template', nextValue);
    window.requestAnimationFrame(() => {
      promptTemplateRef.current?.focus();
      promptTemplateRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
    setStatusMsg(`已在光标位置插入 ${QUOTED_CONTENT_PLACEHOLDER}`);
  };

  const fillPromptTemplate = (content: string, template = promptTemplate) => template.split(CONTENT_PLACEHOLDER).join(content);
  const getEffectiveSegmentTemplate = (segment: TemplateSegment) => storyboardMode
    ? segment.promptTemplate ?? promptTemplate
    : perSourceTemplateMode
      ? sourcePromptTemplates[segment.sourceIndex ?? 0] ?? promptTemplate
      : promptTemplate;
  const getSegmentFinalPrompt = (segment: TemplateSegment) => segment.finalPrompt ?? fillPromptTemplate(
    lowercaseSplitOutput ? segment.text.toLocaleLowerCase() : segment.text,
    getEffectiveSegmentTemplate(segment)
  );
  const deliveryNamingSegments = React.useMemo(() => {
    const references = new Map<number, TemplateSegment>();
    const counts = new Map<number, number>();
    for (const segment of templateSegments) {
      const source = segment.sourceIndex ?? 0;
      const count = (counts.get(source) ?? 0) + 1;
      counts.set(source, count);
      // 整篇命名统一以第二段为准；只有一段的文案使用唯一片段。
      if (count <= 2) references.set(source, segment);
    }
    return references;
  }, [templateSegments]);
  const getDeliveryPresetGroup = (segment: TemplateSegment) => {
    const reference = deliveryNamingSegments.get(segment.sourceIndex ?? 0) ?? segment;
    const preset = templatePresets.find(preset => preset.id === reference.presetId)
      ?? templatePresets.find(preset => preset.template === (reference.promptTemplate ?? getEffectiveSegmentTemplate(reference)));
    return preset?.category?.trim();
  };
  const getDeliveryPresetName = (segment: TemplateSegment) => {
    const preset = templatePresets.find(preset => preset.id === segment.presetId)
      ?? templatePresets.find(preset => preset.template === getEffectiveSegmentTemplate(segment));
    return preset?.name || '';
  };

  const activeMultiPresets = React.useMemo(() => {
    return multiPresetIds
      .map(id => templatePresets.find(p => p.id === id))
      .filter((p): p is TemplatePreset => Boolean(p));
  }, [multiPresetIds, templatePresets]);
  const imageGroups = React.useMemo(() => {
    const groups = new Map<string, AttachedImage[]>();
    attachedImages.forEach(image => {
      const key = getImageGroupKey(image);
      groups.set(key, [...(groups.get(key) || []), image]);
    });
    return Array.from(groups.entries()).map(([key, images]) => ({ key, images: naturalSortImages(images) }));
  }, [attachedImages]);

  // 单篇文案只有一个图片组时，直接完成绑定；不需要用户再进入批量分配弹窗。
  useEffect(() => {
    if (batchTemplateMode || imageGroups.length !== 1 || sourceImageGroupBindings[0]) return;
    setSourceImageGroupBindings(current => current[0] ? current : { ...current, 0: imageGroups[0].key });
  }, [batchTemplateMode, imageGroups, sourceImageGroupBindings]);

  const handleAttachedImagesChange = (nextImages: AttachedImage[]) => {
    const nextIds = new Set(nextImages.map(image => image.id));
    const nextGroups = new Set(nextImages.map(getImageGroupKey));
    setAttachedImages(nextImages);
    setTemplateSegments(current => current.map(segment => {
      if (!nextImages.length || (segment.imageId && segment.imageId !== '__NONE__' && !nextIds.has(segment.imageId))) {
        return { ...segment, imageId: undefined };
      }
      return segment;
    }));
    setSourceImageGroupBindings(current => Object.fromEntries(Object.entries(current).filter(([, group]) => nextGroups.has(group))));
    setCopiedImageIds(current => new Set([...current].filter(id => nextIds.has(id))));
    if (!nextImages.length) {
      setCopiedSegmentIds(new Set());
      setCopiedImageAssignmentId(null);
      setImageOrderSourceIndex(null);
      setImagePickerTarget(null);
      setShowImageGroupAssignment(false);
    }
  };

  const handleImageBindingModeChange = (mode: ImageBindingMode) => {
    if (mode === imageBindingMode) return;
    setImageBindingMode(mode);
    // A mode change explicitly replaces manual assignments, including manual empty slots.
    setTemplateSegments(current => current.map(segment => ({ ...segment, imageId: undefined })));
    setCopiedSegmentIds(new Set());
    setCopiedImageIds(new Set());
    setImageOrderSourceIndex(null);
    setStatusMsg(mode === 'per-copy' ? '已按单篇一图重新分配：每篇文案的全部片段使用同一张图' : '已切换分镜图组，请重新分配图片');
  };

  const imageById = React.useMemo(() => new Map(attachedImages.map(image => [image.id, image])), [attachedImages]);
  const segmentRenderIndex = React.useMemo(() => {
    const positions = new Map<string, number>();
    const groups = new Map<number, TemplateSegment[]>();
    templateSegments.forEach((segment, index) => {
      positions.set(segment.id, index);
      const source = segment.sourceIndex ?? 0;
      const group = groups.get(source) || [];
      group.push(segment);
      groups.set(source, group);
    });
    return { positions, groups };
  }, [templateSegments]);
  const [segmentListPage, setSegmentListPage] = useState(0);
  const [segmentPageSizeSetting, setSegmentPageSize] = useState(() => readPageSize('template-batch-segment-page-size', 80));
  useEffect(() => { try { localStorage.setItem('template-batch-segment-page-size', String(segmentPageSizeSetting)); } catch {} }, [segmentPageSizeSetting]);
  const [segmentPaginationEnabled, setSegmentPaginationEnabled] = useState(false);
  const segmentPageSize = segmentPaginationEnabled ? segmentPageSizeSetting : Number.MAX_SAFE_INTEGER;

  const getSegmentImage = (segment: TemplateSegment, segmentIndex: number): AttachedImage | undefined => {
    if (segment.imageId === '__NONE__') {
      return undefined;
    }
    if (segment.imageId) {
      const found = imageById.get(segment.imageId);
      if (found) return found;
    }
    if (!attachedImages.length) return undefined;
    // 批量分镜图组采用“先选图片组、再手动分配”的流程。图片刚导入时不再
    // 按顺位自动占用分段行，避免在用户还没为每篇选择图片组前产生错误分配。
    if (batchTemplateMode && imageBindingMode === 'per-segment') {
      return undefined;
    }
    if (imageBindingMode === 'per-copy') {
      const copyIndex = segment.sourceIndex ?? 0;
      return attachedImages[copyIndex];
    } else {
      return attachedImages[segmentIndex];
    }
  };

  const getSegmentPromptForPreset = (segment: TemplateSegment, preset: TemplatePreset): string => {
    if (segment.customPrompts?.[preset.id] !== undefined) {
      return segment.customPrompts[preset.id];
    }
    const text = lowercaseSplitOutput ? segment.text.toLocaleLowerCase() : segment.text;
    return fillPromptTemplate(text, preset.template);
  };
  const getSegmentWrappedText = (segment: TemplateSegment) => segment.wrappedText ?? autoWrapText(segment.text, lineWidth);
  // 自动断行后的内容不加引号，避免复制到表格或下游工具时把换行片段当作带引号字符串。
  // 若文本本身已带双引号，不重复添加
  const quoteSegmentOutput = (text: string) => {
    const trimmed = text.trim();
    if (!quoteSplitSegments || /[\r\n]/.test(trimmed)) return trimmed;
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) return trimmed;
    return `"${trimmed}"`;
  };
  const getSegmentPlainOutputText = (segment: TemplateSegment) =>
    (lowercaseSplitOutput ? segment.text.toLocaleLowerCase() : segment.text).trim();
  const getSegmentOutputText = (segment: TemplateSegment) => quoteSegmentOutput(getSegmentPlainOutputText(segment));
  const getSegmentWrappedOutput = (segment: TemplateSegment) => quoteSegmentOutput(getSegmentWrappedText(segment));
  const getSegmentSourceText = (sourceIndex?: number): string => {
    const idx = sourceIndex ?? 0;
    if (batchTemplateMode) {
      return batchTemplateDrafts[idx]?.source || templateSource;
    }
    return templateSource;
  };

  const getSegmentPresetName = (segment: TemplateSegment): string => {
    const currentTemplate = segment.promptTemplate ?? (
      batchTemplateMode && (segment.sourceIndex !== undefined)
        ? sourcePromptTemplates[segment.sourceIndex] ?? promptTemplate
        : promptTemplate
    );
    const matched = templatePresets.find(p => p.template === currentTemplate);
    return matched ? matched.name : '默认/自定义模板';
  };

  const showToastNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg(message);
    setCopyToast({ type, message });
  };

  const markSegmentCopied = (segmentId: string, imageId?: string) => {
    setCopiedSegmentIds(prev => new Set(prev).add(segmentId));
    if (imageId) {
      setCopiedImageIds(prev => new Set(prev).add(imageId));
    }
  };

  const toggleSegmentCopied = (segmentId: string, imageId?: string) => {
    setCopiedSegmentIds(prev => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
    if (imageId) {
      setCopiedImageIds(prev => {
        const next = new Set(prev);
        if (next.has(imageId)) next.delete(imageId);
        else next.add(imageId);
        return next;
      });
    }
  };

  const resetAllCopiedMarks = () => {
    if (!confirm('确定要清空所有已复制标记吗？')) return;
    setCopiedSegmentIds(new Set());
    setCopiedImageIds(new Set());
    showToastNotification('已重置所有复制标记');
  };

  const scrollToNextUncopied = () => {
    const nextUncopied = visibleTemplateSegments.find(item => !copiedSegmentIds.has(item.id));
    if (!nextUncopied) {
      showToastNotification('🎉 所有分镜均已复制完成！');
      return;
    }
    const position = displayedTemplateSegments.findIndex(item => item.id === nextUncopied.id);
    if (position >= 0) setSegmentListPage(Math.floor(position / segmentPageSize));
    window.setTimeout(() => {
    const el = document.getElementById(`segment-row-${nextUncopied.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-amber-400');
      setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400'), 1500);
      showToastNotification(`已定位至下一个未复制分镜 #${visibleTemplateSegments.findIndex(i => i.id === nextUncopied.id) + 1}`);
    }
    }, 80);
  };

  const handleCopySegmentImage = async (img: AttachedImage, segmentId?: string) => {
    const res = await copyImageToClipboard(img.file, img.url, img.originalPath);
    if (res.success) {
      if (segmentId) markSegmentCopied(segmentId, img.id);
      showToastNotification(`✅ 原始图片位图已复制到剪切板：${img.name}（已自动标记为已复制）`);
    } else {
      showToastNotification(`复制图片失败: ${res.error || '未知错误'}`, 'error');
    }
    return res.success;
  };

  const handleCopyAllAttachedImages = async () => {
    if (!attachedImages.length || !navigator.clipboard || !window.ClipboardItem) {
      showToastNotification('当前浏览器不支持一次复制多张图片', 'error');
      return false;
    }
    try {
      const dataUrls = await Promise.all(attachedImages.map(image => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`读取图片失败：${image.name}`));
        reader.readAsDataURL(image.file);
      })));
      const html = `<div>${attachedImages.map((image, index) => `<img loading="lazy" decoding="async" src="${dataUrls[index]}" alt="${image.name.replace(/"/g, '&quot;')}" style="display:block;max-width:100%;margin:0 0 12px;" />`).join('')}</div>`;
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([attachedImages.map(image => image.name).join('\n')], { type: 'text/plain' })
      })]);
      setCopiedImageIds(current => new Set([...current, ...attachedImages.map(image => image.id)]));
      showToastNotification(`✅ 已复制全部 ${attachedImages.length} 张图片，可直接粘贴`);
      return true;
    } catch (error: any) {
      showToastNotification(`复制全部图片失败：${error?.message || '剪贴板不支持多图内容'}`, 'error');
      return false;
    }
  };


  const batchSourceIndexes = Array.from(new Set(templateSegments.map(item => item.sourceIndex ?? 0))).sort((a, b) => a - b);
  const visibleTemplateSegments = batchTemplateMode && activeBatchSourceIndex !== null
    ? templateSegments.filter(item => (item.sourceIndex ?? 0) === activeBatchSourceIndex)
    : templateSegments;

  // 快速搜索匹配计算 (匹配分镜序号、篇章编号、文案原文、拆分文本、断行文本、描述词、绑定的图片名)
  const matchedSegmentIds = React.useMemo(() => {
    const rawQ = searchKeyword.trim();
    if (!rawQ) return [];
    const q = rawQ.toLowerCase();

    // 匹配分镜序号：支持 "12", "#12", "第12", "第12条", "第12段", "12段", "12条", "12句"
    const numMatch = rawQ.match(/^(?:#|第)?(\d+)(?:段|条|句)?$/i);
    const targetRowNum = numMatch ? parseInt(numMatch[1], 10) : null;

    // 匹配明确篇章：支持 "篇2", "第2篇", "篇章2", "篇章#2", "p2"
    const sourceMatch = rawQ.match(/^(?:篇|篇章|p)#?(\d+)$/i) || rawQ.match(/^第(\d+)篇$/i);
    const targetSourceNum = sourceMatch ? parseInt(sourceMatch[1], 10) : null;

    // 匹配篇章-分镜组合：如 "2-3", "篇2-3", "2-3段", "篇2-第3段"
    const comboMatch = rawQ.match(/^(?:篇|篇章|p)?(\d+)[-–—#第](\d+)(?:段|条|句)?$/i);
    const comboSource = comboMatch ? parseInt(comboMatch[1], 10) : null;
    const comboRank = comboMatch ? parseInt(comboMatch[2], 10) : null;

    // 计算每个 source 的 rank 映射表
    const sourceRankMap = new Map<string, number>();
    const sourceCounts = new Map<number, number>();
    templateSegments.forEach(item => {
      const sIdx = item.sourceIndex ?? 0;
      const count = (sourceCounts.get(sIdx) || 0) + 1;
      sourceCounts.set(sIdx, count);
      sourceRankMap.set(item.id, count);
    });

    return templateSegments
      .map((item, idx) => {
        const globalNum = idx + 1;
        const sourceIdx = (item.sourceIndex ?? 0) + 1;
        const rankInSource = sourceRankMap.get(item.id) ?? 1;

        // 1. 如果搜索组合 "篇2-3" 或 "2-3"
        if (comboSource !== null && comboRank !== null) {
          if (sourceIdx === comboSource && rankInSource === comboRank) {
            return item.id;
          }
        }

        // 2. 如果搜索明确篇章如 "篇2", "第2篇"
        if (targetSourceNum !== null && sourceIdx === targetSourceNum) {
          return item.id;
        }

        // 3. 如果搜索纯数字或 #12，精准命中分镜行编号
        if (targetRowNum !== null && globalNum === targetRowNum) {
          return item.id;
        }

        // 4. 内容模糊匹配 (文案原文、拆分文本、断行文本、描述词、绑定的图片名)
        const text = item.text.toLowerCase();
        const wrapped = (item.wrappedText || '').toLowerCase();
        const prompt = getSegmentFinalPrompt(item).toLowerCase();
        const sourceText = getSegmentSourceText(item.sourceIndex).toLowerCase();
        const boundImg = getSegmentImage(item, idx);
        const imgName = (boundImg?.name || '').toLowerCase();

        let customPromptsText = '';
        if (item.customPrompts) {
          customPromptsText = Object.values(item.customPrompts).join(' ').toLowerCase();
        }

        if (
          text.includes(q) ||
          wrapped.includes(q) ||
          prompt.includes(q) ||
          sourceText.includes(q) ||
          imgName.includes(q) ||
          customPromptsText.includes(q)
        ) {
          return item.id;
        }

        return null;
      })
      .filter((id): id is string => Boolean(id));
  }, [searchKeyword, templateSegments, lowercaseSplitOutput, promptTemplate, sourcePromptTemplates, attachedImages, imageBindingMode]);

  const displayedTemplateSegments = React.useMemo(() => {
    let list = visibleTemplateSegments;
    if (filterUncopiedOnly) {
      list = list.filter(item => !copiedSegmentIds.has(item.id));
    }
    if (filterModifiedOnly) {
      list = list.filter(item => Boolean(item.modifiedType));
    }
    if (searchFilterMode && searchKeyword.trim()) {
      const matchSet = new Set(matchedSegmentIds);
      list = list.filter(item => matchSet.has(item.id));
    }
    return list;
  }, [visibleTemplateSegments, filterUncopiedOnly, filterModifiedOnly, copiedSegmentIds, searchFilterMode, searchKeyword, matchedSegmentIds]);

  useEffect(() => {
    if (!highlightedSegmentId) return;
    const position = displayedTemplateSegments.findIndex(segment => segment.id === highlightedSegmentId);
    if (position >= 0) setSegmentListPage(Math.floor(position / segmentPageSize));
  }, [highlightedSegmentId, displayedTemplateSegments, segmentPageSize]);

  const modifiedSegmentsCount = React.useMemo(() => {
    return visibleTemplateSegments.filter(item => Boolean(item.modifiedType)).length;
  }, [visibleTemplateSegments]);

  const handleClearModifiedFlags = () => {
    setTemplateSegments(items => items.map(s => ({ ...s, modifiedType: undefined, modifiedAt: undefined })));
    setStatusMsg('已清除所有修改高亮标记');
  };

  const scrollToSegment = useCallback((segmentId: string) => {
    const targetSeg = templateSegments.find(s => s.id === segmentId);
    if (targetSeg && batchTemplateMode && activeBatchSourceIndex !== null) {
      if ((targetSeg.sourceIndex ?? 0) !== activeBatchSourceIndex) {
        setActiveBatchSourceIndex(null);
      }
    }
    if (filterUncopiedOnly && copiedSegmentIds.has(segmentId)) {
      setFilterUncopiedOnly(false);
    }
    if (filterModifiedOnly && !targetSeg?.modifiedType) {
      setFilterModifiedOnly(false);
    }
    setHighlightedSegmentId(segmentId);
    window.requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`segment-row-${segmentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 60);
    });
  }, [templateSegments, batchTemplateMode, activeBatchSourceIndex, filterUncopiedOnly, filterModifiedOnly, copiedSegmentIds]);

  const handleNextMatch = useCallback(() => {
    if (!matchedSegmentIds.length) return;
    const currentSafe = (activeMatchIndex >= 0 && activeMatchIndex < matchedSegmentIds.length) ? activeMatchIndex : 0;
    const nextIdx = (currentSafe + 1) % matchedSegmentIds.length;
    setActiveMatchIndex(nextIdx);
    scrollToSegment(matchedSegmentIds[nextIdx]);
  }, [matchedSegmentIds, activeMatchIndex, scrollToSegment]);

  const handlePrevMatch = useCallback(() => {
    if (!matchedSegmentIds.length) return;
    const currentSafe = (activeMatchIndex >= 0 && activeMatchIndex < matchedSegmentIds.length) ? activeMatchIndex : 0;
    const prevIdx = (currentSafe - 1 + matchedSegmentIds.length) % matchedSegmentIds.length;
    setActiveMatchIndex(prevIdx);
    scrollToSegment(matchedSegmentIds[prevIdx]);
  }, [matchedSegmentIds, activeMatchIndex, scrollToSegment]);

  useEffect(() => {
    if (prevSearchKeywordRef.current !== searchKeyword) {
      prevSearchKeywordRef.current = searchKeyword;
      if (matchedSegmentIds.length > 0) {
        setActiveMatchIndex(0);
        scrollToSegment(matchedSegmentIds[0]);
      } else {
        setActiveMatchIndex(0);
        setHighlightedSegmentId(null);
      }
    }
  }, [searchKeyword, matchedSegmentIds, scrollToSegment]);

  // 高亮搜索命中文字辅助方法
  const highlightMatchText = useCallback((text: string, query: string) => {
    if (!query.trim() || !text) return text;
    const q = query.trim();
    if (/^#?\d+$/.test(q)) return text;

    try {
      const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      if (parts.length <= 1) return text;

      return (
        <>
          {parts.map((part, i) =>
            regex.test(part) ? (
              <mark key={i} className="bg-amber-400/40 text-amber-200 font-bold px-0.5 rounded shadow-xs">
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </>
      );
    } catch {
      return text;
    }
  }, []);

  // 在每行的完整原文中标出该行对应的拆分片段。优先精确匹配；换行不同
  // 时使用可跨空白字符的匹配，避免因为原文排版而无法定位。
  const highlightSourceSegment = useCallback((sourceText: string, segmentText: string, query: string) => {
    if (!sourceText || !segmentText.trim()) return highlightMatchText(sourceText, query);

    const candidates = [
      segmentText.trim(),
      segmentText.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim(),
    ].filter(Boolean);

    let match: { index: number; length: number } | null = null;
    for (const candidate of candidates) {
      const exactIndex = sourceText.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
      if (exactIndex >= 0) {
        match = { index: exactIndex, length: candidate.length };
        break;
      }

      // 拆分时会把原文的换行收为一个空格，因此不能只靠逐字完全相等。
      // 这里建立“去除所有空白”的原文位置表，仍然能回到真实原文字符范围。
      const sourceChars: string[] = [];
      const sourcePositions: number[] = [];
      Array.from(sourceText).forEach((char, index) => {
        if (!/\s/.test(char)) {
          sourceChars.push(char.toLocaleLowerCase());
          sourcePositions.push(index);
        }
      });
      const compactCandidate = Array.from(candidate)
        .filter(char => !/\s/.test(char))
        .join('')
        .toLocaleLowerCase();
      const compactIndex = sourceChars.join('').indexOf(compactCandidate);
      if (compactIndex >= 0 && compactCandidate.length > 0) {
        const start = sourcePositions[compactIndex];
        const end = sourcePositions[compactIndex + compactCandidate.length - 1];
        if (start !== undefined && end !== undefined) {
          match = { index: start, length: end - start + 1 };
          break;
        }
      }

      // 数字转英文后，例如原文“8s / 3:16 / $50”会变成“eight… / three
      // sixteen / fifty dollars”。为每个转换出的字符保留原数字的坐标，
      // 这样命中后仍可在未被修改的原文上准确高亮。
      const expandedChars: string[] = [];
      const expandedPositions: number[] = [];
      const appendWithPosition = (value: string, positionOffset: number) => {
        Array.from(value).forEach((char, charIndex) => {
          expandedChars.push(char.toLocaleLowerCase());
          expandedPositions.push(positionOffset + charIndex);
        });
      };
      const numericPattern = /\$?\d[\d,.:/%-]*(?:st|nd|rd|th)?/gi;
      let sourceCursor = 0;
      let numericPart: RegExpExecArray | null;
      while ((numericPart = numericPattern.exec(sourceText)) !== null) {
        appendWithPosition(sourceText.slice(sourceCursor, numericPart.index), sourceCursor);
        const convertedNumber = convertNumbersToEnglishWords(numericPart[0]);
        Array.from(convertedNumber).forEach(char => {
          expandedChars.push(char.toLocaleLowerCase());
          expandedPositions.push(numericPart!.index);
        });
        sourceCursor = numericPart.index + numericPart[0].length;
      }
      appendWithPosition(sourceText.slice(sourceCursor), sourceCursor);
      const compactExpanded = expandedChars
        .map((char, index) => ({ char, index }))
        .filter(item => !/\s/.test(item.char));
      const expandedIndex = compactExpanded.map(item => item.char).join('').indexOf(compactCandidate);
      if (expandedIndex >= 0 && compactCandidate.length > 0) {
        const startEntry = compactExpanded[expandedIndex];
        const endEntry = compactExpanded[expandedIndex + compactCandidate.length - 1];
        if (startEntry && endEntry) {
          const start = expandedPositions[startEntry.index];
          const end = expandedPositions[endEntry.index];
          if (start !== undefined && end !== undefined) {
            match = { index: Math.min(start, end), length: Math.abs(end - start) + 1 };
            break;
          }
        }
      }

      try {
        const flexiblePattern = candidate
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\s+/g, '\\s+');
        const flexibleMatch = new RegExp(flexiblePattern, 'i').exec(sourceText);
        if (flexibleMatch?.index !== undefined) {
          match = { index: flexibleMatch.index, length: flexibleMatch[0].length };
          break;
        }
      } catch {
        // 文案包含无法构造正则的特殊字符时，保留普通原文显示。
      }
    }

    if (!match) return highlightMatchText(sourceText, query);
    const before = sourceText.slice(0, match.index);
    const active = sourceText.slice(match.index, match.index + match.length);
    const after = sourceText.slice(match.index + match.length);
    return (
      <>
        {highlightMatchText(before, query)}
        <mark
          data-current-source-segment="true"
          className="bg-emerald-400/25 text-emerald-100 ring-1 ring-emerald-400/80 rounded px-0.5 font-semibold shadow-[0_0_10px_rgba(52,211,153,0.35)]"
        >
          {active}
        </mark>
        {highlightMatchText(after, query)}
      </>
    );
  }, [highlightMatchText]);

  const totalVisibleCount = visibleTemplateSegments.length;
  const copiedVisibleCount = visibleTemplateSegments.filter(item => copiedSegmentIds.has(item.id)).length;
  const progressPercent = totalVisibleCount > 0 ? Math.round((copiedVisibleCount / totalVisibleCount) * 100) : 0;

  const updateSourcePromptTemplate = (sourceIndex: number, template: string) => {
    setSourcePromptTemplates(current => ({ ...current, [sourceIndex]: template }));
    setTemplateSegments(items => items.map(item => (item.sourceIndex ?? 0) === sourceIndex ? { ...item, finalPrompt: undefined } : item));
  };

  const insertSourceContentPlaceholder = (sourceIndex: number) => {
    const currentTemplate = sourcePromptTemplates[sourceIndex] ?? promptTemplate;
    const textarea = sourcePromptTemplateRef.current;
    const start = textarea?.selectionStart ?? currentTemplate.length;
    const end = textarea?.selectionEnd ?? start;
    const nextTemplate = `${currentTemplate.slice(0, start)}${QUOTED_CONTENT_PLACEHOLDER}${currentTemplate.slice(end)}`;
    updateSourcePromptTemplate(sourceIndex, nextTemplate);
    const nextCaret = start + QUOTED_CONTENT_PLACEHOLDER.length;
    window.requestAnimationFrame(() => {
      sourcePromptTemplateRef.current?.focus();
      sourcePromptTemplateRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
    setStatusMsg(`已在文案 ${sourceIndex + 1} 的光标位置插入内容块`);
  };

  const runTemplateSplit = () => {
    if (templateSplitStrategy === 'sermon') {
      handle8sSermonSplit();
      return;
    }
    if (templateSplitStrategy === 'ai') {
      void handlePureAiSegmentSplit();
      return;
    }
    const validBatchDrafts = batchTemplateDrafts.filter(item => item.source.trim());
    if (batchTemplateMode ? !validBatchDrafts.length : !templateSource.trim()) {
      setStatusMsg('请先输入需要拆分的原始文案');
      return;
    }
    if (!promptTemplate.includes(CONTENT_PLACEHOLDER)) {
      setStatusMsg(`描述词模板中必须包含 ${CONTENT_PLACEHOLDER} 内容块`);
      return;
    }
    const invalidTemplateIndex = batchTemplateMode
      ? validBatchDrafts.findIndex(item => !(item.templateMode === 'custom' ? item.template : promptTemplate).includes(CONTENT_PLACEHOLDER))
      : -1;
    if (invalidTemplateIndex >= 0) {
      setStatusMsg(`文案 ${invalidTemplateIndex + 1} 的描述词模板缺少 ${CONTENT_PLACEHOLDER} 内容块`);
      return;
    }
    const sourceSnapshot = templateSource;
    const sources = batchTemplateMode
      ? validBatchDrafts.map(item => item.source.trim())
      : [sourceSnapshot];
    const impossibleSourceIndex = templateSplitStrategy === 'range'
      ? sources.findIndex(source => !source.includes(MANUAL_SPLIT_MARKER) && !canPartitionWithinRange(countSegmentUnits(source, splitUnit), splitMinimum, splitMaximum))
      : sources.findIndex(source => !source.includes(MANUAL_SPLIT_MARKER) && countSegmentUnits(source, splitUnit) < Math.min(splitMinimum, splitMaximum));
    if (impossibleSourceIndex >= 0) {
      const count = countSegmentUnits(sources[impossibleSourceIndex], splitUnit);
      setStatusMsg(`文案 ${impossibleSourceIndex + 1} 共 ${count} ${splitUnit === 'words' ? '个单词' : '个字符'}，无法满足最小数量 ${Math.min(splitMinimum, splitMaximum)}；请调整范围或补充文案`);
      return;
    }
    let manualMarkerCount = 0;
    const segments = sources.flatMap((source, sourceIndex) => {
      const manualBlocks = source.split(MANUAL_SPLIT_MARKER);
      manualMarkerCount += Math.max(0, manualBlocks.length - 1);
      const parts = manualBlocks.length > 1
        ? manualBlocks.map(block => block.trim()).filter(Boolean)
        : autoSplitTemplateText(source, splitMinimum, splitMaximum, splitUnit, keepSentences, allowTolerance ? splitTolerance : 0, templateSplitStrategy === 'punctuation', sentencePauseOnly).filter(Boolean);
      return parts.map((text, partIndex) => ({ id: `${Date.now()}-${sourceIndex}-${partIndex}`, text, sourceIndex }));
    });
    const snapshot = templateSegments.length > 0 ? recordSegmentChange('开始拆分') : null;
    const retainedSegments = retainSegmentAssignments(templateSegments, segments);
    setTemplateSegments(retainedSegments);
    setCopiedSegmentIds(new Set());
    if (snapshot) pushActionToast('开始拆分', snapshot.segments, retainedSegments);
    if (batchTemplateMode) {
      const templates = Object.fromEntries(validBatchDrafts.map((item, sourceIndex) => [sourceIndex, item.templateMode === 'custom' ? item.template : promptTemplate]));
      setSourcePromptTemplates(templates);
      // 拆分后默认使用分镜模式，保证每段选择的预设会直接参与最终描述词生成。
      setPerSourceTemplateMode(false);
      setStoryboardMode(true);
    }
    setActiveBatchSourceIndex(batchTemplateMode ? 0 : null);
    setSelectedSegmentIds(new Set());
    // Generating results must never mutate the source editor or remove its manual markers.
    setTemplateSource(sourceSnapshot);
    setStatusMsg(batchTemplateMode
      ? `已按篇处理 ${sources.length} 篇文案，共生成 ${segments.length} 段${manualMarkerCount ? `，包含 ${manualMarkerCount} 个手动拆分点` : ''}`
      : manualMarkerCount
        ? `已严格按照 ${manualMarkerCount} 个手动拆分点生成 ${segments.length} 段，未执行自动拆分`
        : `已自动拆分为 ${segments.length} 段，可继续批量编辑`);
  };

  const runManualPointSplit = () => {
    if (batchTemplateMode) {
      runTemplateSplit();
      return;
    }
    if (!templateSource.trim()) {
      setStatusMsg('请先输入文案，并在需要拆分的位置添加拆分点');
      return;
    }
    if (!promptTemplate.includes(CONTENT_PLACEHOLDER)) {
      setStatusMsg(`描述词模板中必须包含 ${CONTENT_PLACEHOLDER} 内容块`);
      return;
    }
    if (!templateSource.includes(MANUAL_SPLIT_MARKER)) {
      setStatusMsg(`请先把光标放到拆分位置，并添加 ${MANUAL_SPLIT_MARKER}`);
      return;
    }
    const parts = templateSource.split(MANUAL_SPLIT_MARKER).map(item => item.trim()).filter(Boolean);
    const newSegs = parts.map((text, index) => ({ id: `${Date.now()}-manual-${index}`, text }));
    const snapshot = templateSegments.length > 0 ? recordSegmentChange('按拆分点生成') : null;
    setTemplateSegments(newSegs);
    if (snapshot) pushActionToast('按拆分点生成', snapshot.segments, newSegs);
    setSelectedSegmentIds(new Set());
    setTemplateSource(templateSource);
    setStatusMsg(`已严格按照 ${parts.length - 1} 个手动拆分点生成 ${parts.length} 段`);
  };

  const updateTemplateSegment = (id: string, text: string) => {
    setTemplateSegments(items => items.map(item => {
      if (item.id !== id) return item;
      if (item.text === text) return item;
      return {
        ...item,
        text,
        wrappedText: undefined,
        modifiedType: item.modifiedType ? item.modifiedType : 'edit',
        modifiedAt: Date.now()
      };
    }));
  };

  const updateSegmentFields = (id: string, patch: Partial<TemplateSegment>) => {
    setTemplateSegments(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const handleSelectImageForSegment = (segmentId: string, imageId: string) => {
    updateSegmentFields(segmentId, { imageId });
    const img = attachedImages.find(i => i.id === imageId);
    setStatusMsg(`已为分镜指定图片: ${img?.name || imageId}`);
  };

  const handleCopyImageAssignment = (imageId?: string) => {
    if (!imageId || imageId === '__NONE__') {
      setStatusMsg('当前分镜没有可复制的图片分配');
      return;
    }
    setCopiedImageAssignmentId(imageId);
    const image = attachedImages.find(item => item.id === imageId);
    setStatusMsg(`已复制图片分配：${image?.name || '图片'}；可粘贴到其它分镜`);
  };

  const handlePasteImageAssignment = (segmentId: string) => {
    if (!copiedImageAssignmentId) {
      setStatusMsg('请先在一个已配图的分镜中点击“复制图片分配”');
      return;
    }
    updateSegmentFields(segmentId, { imageId: copiedImageAssignmentId });
    const image = attachedImages.find(item => item.id === copiedImageAssignmentId);
    setStatusMsg(`已粘贴图片分配：${image?.name || '图片'}（可重复使用）`);
  };

  const handleResetSegmentImageToAuto = (segmentId: string) => {
    updateSegmentFields(segmentId, { imageId: undefined });
    setStatusMsg('已恢复默认自动顺位配图');
  };

  const handleUnbindSegmentImage = (segmentId: string) => {
    updateSegmentFields(segmentId, { imageId: '__NONE__' });
    setStatusMsg('已解除该分镜的图片绑定');
  };

  const handleUploadNewImageForSegment = (segmentId: string, file: File) => {
    const newImage: AttachedImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      fullPath: file.name,
      url: URL.createObjectURL(file),
      file,
      size: file.size,
    };
    setAttachedImages(prev => [...prev, newImage]);
    updateSegmentFields(segmentId, { imageId: newImage.id });
    setStatusMsg(`已上传新图片并绑定到分镜: ${file.name}`);
  };

  const handleDropImageOnSegmentRow = (segmentId: string, file: File) => {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|svg|avif|heic)$/i.test(file.name)) {
      setStatusMsg('请拖入有效的图片文件');
      return;
    }
    handleUploadNewImageForSegment(segmentId, file);
  };

  const otherSegmentsUsingImage = React.useMemo(() => {
    const map: Record<string, number[]> = {};
    templateSegments.forEach((seg, idx) => {
      const img = getSegmentImage(seg, idx);
      if (img) {
        if (!map[img.id]) map[img.id] = [];
        map[img.id].push(idx);
      }
    });
    return map;
  }, [templateSegments, attachedImages, imageBindingMode]);

  const replaceSegmentWithParts = (
    id: string,
    parts: string[],
    actionName: string = '拆分段落',
    modifiedType: TemplateSegment['modifiedType'] = 'split'
  ) => {
    const index = templateSegments.findIndex(item => item.id === id);
    if (index < 0) return;
    const snapshot = recordSegmentChange(actionName);
    const source = templateSegments[index];
    const now = Date.now();
    const replacements = parts.filter(Boolean).map((text, partIndex) => ({
      id: `${now}-${partIndex}`,
      text,
      sourceIndex: source.sourceIndex,
      promptTemplate: source.promptTemplate,
      modifiedType,
      modifiedAt: now
    }));
    const next = [...templateSegments.slice(0, index), ...replacements, ...templateSegments.slice(index + 1)];
    setTemplateSegments(next);
    setSelectedSegmentIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    pushActionToast(actionName, snapshot.segments, next);
  };

  // 直接在光标所在位置一键切分为两段（无需插入拆分标记）
  const splitSegmentAtCaretDirectly = (id: string) => {
    const segment = templateSegments.find(item => item.id === id);
    if (!segment) return;
    const caret = segmentCarets[id];
    if (caret === undefined || caret <= 0 || caret >= segment.text.length) {
      setStatusMsg('请先把光标放到该段内部需要切分的位置');
      return;
    }
    const before = segment.text.slice(0, caret).trim();
    const after = segment.text.slice(caret).trim();
    if (!before || !after) {
      setStatusMsg('光标前后都必须有文字才能拆分');
      return;
    }
    replaceSegmentWithParts(id, [before, after], '光标一键拆分', 'split');
    setStatusMsg(`已在光标处将第 ${templateSegments.indexOf(segment) + 1} 段直接拆为 2 段`);
  };

  // 直接与下一段合并为一段
  const mergeWithNextSegment = (id: string) => {
    const index = templateSegments.findIndex(item => item.id === id);
    if (index < 0 || index >= templateSegments.length - 1) {
      setStatusMsg('最后一段没有下一段可合并');
      return;
    }
    const current = templateSegments[index];
    const next = templateSegments[index + 1];
    if (current.sourceIndex !== next.sourceIndex) {
      setStatusMsg('已到文案末尾，不能跨篇合并');
      return;
    }
    const snapshot = recordSegmentChange('合并下段');
    const mergedText = `${current.text.trim()} ${next.text.trim()}`.trim();
    const now = Date.now();
    const mergedSeg: TemplateSegment = {
      ...current,
      text: mergedText,
      wrappedText: undefined,
      finalPrompt: undefined,
      modifiedType: 'merge',
      modifiedAt: now
    };
    const nextSegments = [...templateSegments.slice(0, index), mergedSeg, ...templateSegments.slice(index + 2)];
    setTemplateSegments(nextSegments);
    setSelectedSegmentIds(prev => { const s = new Set(prev); s.delete(id); s.delete(next.id); return s; });
    pushActionToast('合并下段', snapshot.segments, nextSegments);
    setStatusMsg(`已将第 ${index + 1} 段与第 ${index + 2} 段合并`);
  };

  // 删除单段（支持撤销恢复）
  const handleDeleteSegment = (id: string) => {
    if (templateSegments.length <= 1) {
      setStatusMsg('分镜至少需保留 1 段');
      return;
    }
    const index = templateSegments.findIndex(item => item.id === id);
    if (index < 0) return;
    const snapshot = recordSegmentChange('删除段落');
    const nextSegments = templateSegments.filter(item => item.id !== id);
    setTemplateSegments(nextSegments);
    setSelectedSegmentIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    pushActionToast('删除段落', snapshot.segments, nextSegments);
    setStatusMsg(`已删除第 ${index + 1} 段`);
  };

  const autoSplitCurrentSegment = (id: string) => {
    const segment = templateSegments.find(item => item.id === id);
    if (!segment) return;
    const cleanText = segment.text.split(MANUAL_SPLIT_MARKER).join(' ');
    const parts = autoSplitTemplateText(cleanText, splitMinimum, splitMaximum, splitUnit, keepSentences, allowTolerance ? splitTolerance : 0, templateSplitStrategy === 'punctuation', sentencePauseOnly);
    if (parts.length < 2) return setStatusMsg('当前段按现有设置无需继续拆分');
    replaceSegmentWithParts(id, parts, '自动拆分本段', 'resplit');
    setStatusMsg(`已按当前设置将第 ${templateSegments.indexOf(segment) + 1} 段拆分为 ${parts.length} 段`);
  };

  const insertMarkerIntoSegment = (id: string) => {
    const segment = templateSegments.find(item => item.id === id);
    if (!segment) return;
    const caret = segmentCarets[id];
    if (caret === undefined || caret < 0 || caret > segment.text.length) return setStatusMsg('请先把光标放到该段需要拆分的位置');
    updateTemplateSegment(id, `${segment.text.slice(0, caret)}${MANUAL_SPLIT_MARKER}${segment.text.slice(caret)}`);
    setSegmentCarets(prev => ({ ...prev, [id]: caret + MANUAL_SPLIT_MARKER.length }));
    setStatusMsg('已在当前段光标位置插入拆分点');
  };

  const splitCurrentSegmentAtMarkers = (id: string) => {
    const segment = templateSegments.find(item => item.id === id);
    if (!segment?.text.includes(MANUAL_SPLIT_MARKER)) return setStatusMsg('当前段没有手动拆分点');
    const parts = segment.text.split(MANUAL_SPLIT_MARKER).map(text => text.trim()).filter(Boolean);
    replaceSegmentWithParts(id, parts, '按拆分点拆分', 'resplit');
    setStatusMsg(`已按手动拆分点将当前段拆分为 ${parts.length} 段`);
  };

  const moveRemainderToNextSegment = (id: string, redistribute: boolean) => {
    const index = templateSegments.findIndex(item => item.id === id);
    if (index < 0 || index >= templateSegments.length - 1) return setStatusMsg('最后一段没有下一段可接收文字');
    const segment = templateSegments[index];
    const caret = segmentCarets[id];
    if (caret === undefined || caret <= 0 || caret >= segment.text.length) return setStatusMsg('请先把光标放在当前段内部需要断开的位置');
    const before = segment.text.slice(0, caret).trim();
    const remainder = segment.text.slice(caret).trim();
    if (!before || !remainder) return setStatusMsg('光标前后都必须有文字');
    const nextSegment = templateSegments[index + 1];
    if (segment.sourceIndex !== nextSegment.sourceIndex) return setStatusMsg('已到当前文案末尾，不能把内容移入下一篇文案');
    const snapshot = recordSegmentChange('后移剩余文字');
    const combinedNext = `${remainder} ${nextSegment.text.trim()}`.trim();
    const allowedMax = Math.max(splitMinimum, splitMaximum);
    const redistributed = redistribute && countSegmentUnits(combinedNext, splitUnit) > allowedMax
      ? autoSplitTemplateText(combinedNext, splitMinimum, splitMaximum, splitUnit, keepSentences, allowTolerance ? splitTolerance : 0, templateSplitStrategy === 'punctuation', sentencePauseOnly)
      : [combinedNext];
    const now = Date.now();
    const nextReplacements: TemplateSegment[] = redistributed.map((text, partIndex) => ({
      id: partIndex === 0 ? nextSegment.id : `${now}-cascade-${partIndex}`,
      text,
      sourceIndex: nextSegment.sourceIndex,
      promptTemplate: nextSegment.promptTemplate,
      modifiedType: 'shift',
      modifiedAt: now
    }));
    const nextSegments = [
      ...templateSegments.slice(0, index),
      { ...segment, text: before, finalPrompt: undefined, wrappedText: undefined, modifiedType: 'shift', modifiedAt: now },
      ...nextReplacements,
      ...templateSegments.slice(index + 2)
    ];
    setTemplateSegments(nextSegments);
    pushActionToast('后移剩余文字', snapshot.segments, nextSegments);
    setStatusMsg(redistributed.length > 1
      ? `已将光标后的文字移到下一段，并因超出范围自动重排为 ${redistributed.length} 段`
      : redistribute
        ? `已将第 ${index + 1} 段光标后的文字并入下一段，当前无需继续重排`
        : `已仅移动到第 ${index + 2} 段，未自动重新拆分`);
  };

  const mergeNextAndResplit = (id: string) => {
    const index = templateSegments.findIndex(item => item.id === id);
    if (index < 0 || index >= templateSegments.length - 1) return setStatusMsg('最后一段无法与下一段合并');
    const current = templateSegments[index];
    const next = templateSegments[index + 1];
    if (current.sourceIndex !== next.sourceIndex) return setStatusMsg('不能跨两篇文案合并重拆');
    const snapshot = recordSegmentChange('合并下段重拆');
    const mergedText = `${current.text.trim()} ${next.text.trim()}`.trim();
    const parts = autoSplitTemplateText(mergedText, splitMinimum, splitMaximum, splitUnit, keepSentences, allowTolerance ? splitTolerance : 0, templateSplitStrategy === 'punctuation', sentencePauseOnly);
    const now = Date.now();
    const replacements: TemplateSegment[] = parts.map((text, partIndex) => ({
      id: `${now}-resplit-${partIndex}`,
      text,
      sourceIndex: current.sourceIndex,
      promptTemplate: current.promptTemplate,
      modifiedType: 'resplit',
      modifiedAt: now
    }));
    const nextSegments = [...templateSegments.slice(0, index), ...replacements, ...templateSegments.slice(index + 2)];
    setTemplateSegments(nextSegments);
    setSelectedSegmentIds(new Set());
    pushActionToast('合并下段重拆', snapshot.segments, nextSegments);
    setStatusMsg(`已合并第 ${index + 1}、${index + 2} 段并重新拆分为 ${parts.length} 段`);
  };

  const mergeSelectedTemplateSegments = () => {
    const indexes = templateSegments.map((item, index) => selectedSegmentIds.has(item.id) ? index : -1).filter(index => index >= 0);
    if (indexes.length < 2) {
      setStatusMsg('请至少选择两个相邻段落进行合并');
      return;
    }
    if (indexes.some((index, i) => i > 0 && index !== indexes[i - 1] + 1)) {
      setStatusMsg('只能合并连续相邻的段落');
      return;
    }
    const first = indexes[0];
    const last = indexes[indexes.length - 1];
    const selectedSources = new Set(templateSegments.slice(first, last + 1).map(item => item.sourceIndex ?? 0));
    if (selectedSources.size > 1) return setStatusMsg('不能跨两篇文案批量合并');
    const snapshot = recordSegmentChange('批量合并');
    const now = Date.now();
    const merged: TemplateSegment = {
      id: `${now}-merged`,
      text: templateSegments.slice(first, last + 1).map(item => item.text.trim()).filter(Boolean).join(' '),
      sourceIndex: templateSegments[first].sourceIndex,
      modifiedType: 'merge',
      modifiedAt: now
    };
    const nextSegments = [...templateSegments.slice(0, first), merged, ...templateSegments.slice(last + 1)];
    setTemplateSegments(nextSegments);
    setSelectedSegmentIds(new Set([merged.id]));
    pushActionToast('批量合并', snapshot.segments, nextSegments);
    setStatusMsg(`已合并 ${indexes.length} 个段落`);
  };

  const splitSelectedAtCarets = () => {
    let splitCount = 0;
    const next: TemplateSegment[] = [];
    const now = Date.now();
    for (const item of templateSegments) {
      if (!selectedSegmentIds.has(item.id)) {
        next.push(item);
        continue;
      }
      const caret = segmentCarets[item.id];
      if (!caret || caret >= item.text.length) {
        next.push(item);
        continue;
      }
      const before = item.text.slice(0, caret).trim();
      const after = item.text.slice(caret).trim();
      if (!before || !after) {
        next.push(item);
        continue;
      }
      next.push(
        { id: `${now}-${splitCount}-a`, text: before, sourceIndex: item.sourceIndex, promptTemplate: item.promptTemplate, modifiedType: 'split', modifiedAt: now },
        { id: `${now}-${splitCount}-b`, text: after, sourceIndex: item.sourceIndex, promptTemplate: item.promptTemplate, modifiedType: 'split', modifiedAt: now }
      );
      splitCount++;
    }
    if (!splitCount) {
      setStatusMsg('请选中段落，并先把光标放在需要拆分的位置');
      return;
    }
    const snapshot = recordSegmentChange('光标批量拆分');
    setTemplateSegments(next);
    setSelectedSegmentIds(new Set());
    pushActionToast('光标批量拆分', snapshot.segments, next);
    setStatusMsg(`已按光标位置拆分 ${splitCount} 个段落`);
  };

  const copyTemplateResults = async (
    mode:
      | 'six-columns-per-segment'
      | 'six-columns-by-source'
      | 'both'
      | 'both-with-images'
      | 'images-prompts'
      | 'images-only'
      | 'image-file-names'
      | 'image-source-split-prompt'
      | 'image-name-group-prompt'
      | 'multi-presets'
      | 'multi-presets-with-images'
      | 'split-wrapped'
      | 'filled'
      | 'filled-horizontal'
      | 'wrapped'
      | 'split'
      | 'split-single'
      | 'split-by-source'
      | 'filled-by-source'
      | 'wrapped-by-source'
      | 'both-by-source'
      | 'split-wrapped-by-source'
      | 'all-by-source' = 'six-columns-per-segment'
  ) => {
    const chosen = selectedSegmentIds.size ? templateSegments.filter(item => selectedSegmentIds.has(item.id)) : visibleTemplateSegments;
    if (!chosen.length) return setStatusMsg('没有可复制的拆分结果');
    const groupedBySource = chosen.reduce<Map<number, TemplateSegment[]>>((groups, item) => {
      const sourceIndex = item.sourceIndex ?? 0;
      groups.set(sourceIndex, [...(groups.get(sourceIndex) || []), item]);
      return groups;
    }, new Map());

    const batchDelimiter = includeBatchEmptyLines ? '\n\n' : '\n';

    const cleanSegmentLines = (str: string) => {
      if (includeBatchEmptyLines) return str;
      return str.replace(/\n\s*\n+/g, '\n');
    };

    const formatSegmentText = (it: TemplateSegment, i: number) => {
      const prefix = includeBatchTextNumbering ? formatBatchNumber(i) : '';
      return `${prefix}${cleanSegmentLines(getSegmentOutputText(it))}`;
    };

    const formatSegmentWrapped = (it: TemplateSegment, i: number) => {
      const prefix = includeBatchTextNumbering ? formatBatchNumber(i) : '';
      return `${prefix}${cleanSegmentLines(getSegmentWrappedOutput(it))}`;
    };

    const formatSegmentPrompt = (it: TemplateSegment, i: number) => {
      const prefix = includeBatchPromptNumbering ? formatBatchNumber(i) : '';
      return `${prefix}${cleanSegmentLines(getSegmentFinalPrompt(it).trim())}`;
    };

    const numberPrompts = (items: TemplateSegment[]) => items
      .map((item, index) => formatSegmentPrompt(item, index))
      .join(batchDelimiter);

    const getImageCol = (item: TemplateSegment, idx: number): string => {
      const globalIdx = templateSegments.findIndex(s => s.id === item.id);
      const img = getSegmentImage(item, globalIdx >= 0 ? globalIdx : idx);
      if (!img) return '';
      return img.gyazoUrl ? toGoogleSheetsImageFormula(img.gyazoUrl) : img.name;
    };

    const getImageFileName = (item: TemplateSegment, idx: number): string => {
      const globalIdx = templateSegments.findIndex(s => s.id === item.id);
      return getSegmentImage(item, globalIdx >= 0 ? globalIdx : idx)?.name || '';
    };

    let grid: GridData;
    if (mode === 'six-columns-per-segment' || mode === 'both-with-images') {
      grid = chosen.map((item, idx) => [
        getImageCol(item, idx),
        getSegmentSourceText(item.sourceIndex),
        getSegmentOutputText(item),
        getSegmentWrappedOutput(item),
        getSegmentPresetName(item),
        getSegmentFinalPrompt(item)
      ]);
    } else if (mode === 'six-columns-by-source') {
      grid = Array.from(groupedBySource.entries()).map(([sourceIndex, items]) => {
        let imagesCell = '';
        if (imageBindingMode === 'per-copy') {
          const img = attachedImages[sourceIndex];
          imagesCell = img ? (img.gyazoUrl ? toGoogleSheetsImageFormula(img.gyazoUrl) : img.name) : '';
        } else {
          const imgList = items.map((it, i) => {
            const gIdx = templateSegments.findIndex(s => s.id === it.id);
            const img = getSegmentImage(it, gIdx >= 0 ? gIdx : i);
            return img ? (img.gyazoUrl ? toGoogleSheetsImageFormula(img.gyazoUrl) : img.name) : '';
          }).filter(Boolean);
          imagesCell = imgList.join('\n');
        }

        const sourceText = getSegmentSourceText(sourceIndex);
        const splitText = items.map((it, i) => formatSegmentText(it, i)).join(batchDelimiter);
        const wrappedText = items.map((it, i) => formatSegmentWrapped(it, i)).join(batchDelimiter);
        const presetName = getSegmentPresetName(items[0]);
        const prompts = items.map((it, i) => formatSegmentPrompt(it, i)).join(batchDelimiter);

        return [
          imagesCell,
          sourceText,
          splitText,
          wrappedText,
          presetName,
          prompts
        ];
      });
    } else if (mode === 'multi-presets') {
      grid = chosen.map(item => [
        getSegmentOutputText(item),
        ...activeMultiPresets.map(p => getSegmentPromptForPreset(item, p))
      ]);
    } else if (mode === 'multi-presets-with-images') {
      grid = chosen.map((item, idx) => [
        getImageCol(item, idx),
        getSegmentOutputText(item),
        ...activeMultiPresets.map(p => getSegmentPromptForPreset(item, p))
      ]);
    } else if (mode === 'images-prompts') {
      grid = chosen.map((item, idx) => [
        getImageCol(item, idx),
        getSegmentFinalPrompt(item)
      ]);
    } else if (mode === 'image-source-split-prompt') {
      // 方便直接粘贴到表格：图片本地文件名（保留后缀）+ 原文 + 分段文案 + 描述词。
      grid = chosen.map((item, idx) => [
        getImageFileName(item, idx),
        getSegmentSourceText(item.sourceIndex),
        getSegmentOutputText(item),
        getSegmentFinalPrompt(item)
      ]);
    } else if (mode === 'image-name-group-prompt') {
      // 特殊交付格式：每篇首行附整篇自动断行文案，再输出图片、图片组与描述词。
      const seenSourceIndexes = new Set<number>();
      grid = chosen.map((item, idx) => {
        const globalIdx = templateSegments.findIndex(segment => segment.id === item.id);
        const image = getSegmentImage(item, globalIdx >= 0 ? globalIdx : idx);
        const sourceIndex = item.sourceIndex ?? 0;
        const isFirstCopiedSegmentOfSource = !seenSourceIndexes.has(sourceIndex);
        seenSourceIndexes.add(sourceIndex);
        const sourceWrappedText = isFirstCopiedSegmentOfSource
          ? templateSegments
            .filter(segment => (segment.sourceIndex ?? 0) === sourceIndex)
            .map((segment, segmentIndex) => formatSegmentWrapped(segment, segmentIndex))
            .join(batchDelimiter)
          : '';
        // 单图循环 / 单图整篇，以及没有目录信息的“未分组图片”，第三列直接使用实际图片文件名。
        const boundGroupName = sourceImageGroupBindings[sourceIndex];
        const rawImageGroupName = imageBindingMode === 'per-copy' || boundGroupName === '未分组图片'
          ? image?.name || getImageFileName(item, idx)
          : boundGroupName || (image ? getImageGroupKey(image) : '');
        // 用单图文件名作为组名时，文件扩展名不属于业务组名，不能带入“片段”交付名。
        const imageGroupName = rawImageGroupName.replace(/\.(?:jpe?g|png|webp|gif|heic|bmp|avif)$/i, '');
        const sourceSegmentIndex = templateSegments
          .filter(segment => (segment.sourceIndex ?? 0) === sourceIndex)
          .findIndex(segment => segment.id === item.id) + 1;
        // 整篇交付名统一读取该文案第二段的预设组；未分组预设不增加字段。
        const presetGroupName = getDeliveryPresetGroup(item);
        const imageGroupNameWithCounter = buildDeliveryGroupName(image, imageGroupName, presetGroupName, sourceSegmentIndex, getDeliveryPresetName(item));
        return [
          sourceWrappedText,
          getImageFileName(item, idx),
          '',
          imageGroupNameWithCounter,
          getSegmentFinalPrompt(item),
          getSegmentOutputText(item)
        ];
      });
    } else if (mode === 'images-only') {
      grid = chosen.map((item, idx) => [
        getImageCol(item, idx)
      ]);
    } else if (mode === 'image-file-names') {
      grid = chosen.map((item, idx) => [
        getImageFileName(item, idx)
      ]);
    } else if (mode === 'split-single') {
      grid = [[chosen.map(it => cleanSegmentLines(getSegmentOutputText(it))).join(batchDelimiter)]];
    } else if (mode === 'filled-horizontal') {
      grid = batchTemplateMode
        ? Array.from(groupedBySource.values()).map(items => items.map(item => getSegmentFinalPrompt(item)))
        : [chosen.map(item => getSegmentFinalPrompt(item))];
    } else if (mode === 'split-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [items.map((it, i) => formatSegmentText(it, i)).join(batchDelimiter)]);
    } else if (mode === 'filled-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [items.map((it, i) => formatSegmentPrompt(it, i)).join(batchDelimiter)]);
    } else if (mode === 'wrapped-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [items.map((it, i) => formatSegmentWrapped(it, i)).join(batchDelimiter)]);
    } else if (mode === 'both-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [
        items.map((it, i) => formatSegmentText(it, i)).join(batchDelimiter),
        items.map((it, i) => formatSegmentPrompt(it, i)).join(batchDelimiter)
      ]);
    } else if (mode === 'split-wrapped-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [
        items.map((it, i) => formatSegmentText(it, i)).join(batchDelimiter),
        items.map((it, i) => formatSegmentWrapped(it, i)).join(batchDelimiter)
      ]);
    } else if (mode === 'all-by-source') {
      grid = Array.from(groupedBySource.values()).map(items => [
        items.map((it, i) => formatSegmentText(it, i)).join(batchDelimiter),
        items.map((it, i) => formatSegmentWrapped(it, i)).join(batchDelimiter),
        items.map((it, i) => formatSegmentPrompt(it, i)).join(batchDelimiter)
      ]);
    } else {
      grid = chosen.map((item, idx) => mode === 'filled'
        ? [getSegmentFinalPrompt(item)]
        : mode === 'wrapped'
          ? [getSegmentWrappedOutput(item)]
        : mode === 'split-wrapped'
          ? [getSegmentOutputText(item), getSegmentWrappedOutput(item)]
        : mode === 'split'
          ? [getSegmentOutputText(item)]
          : attachedImages.length > 0
            ? [getImageCol(item, idx), getSegmentOutputText(item), getSegmentFinalPrompt(item)]
            : [getSegmentOutputText(item), getSegmentFinalPrompt(item)]
      );
    }

    // 两个主“六列表格”复制入口始终把列名带在首行，粘贴回 Google Sheets 时可直接辨认字段。
    const includeSixColumnHeader = mode === 'six-columns-per-segment' || mode === 'six-columns-by-source';
    const clipboardGrid: GridData = includeSixColumnHeader
      ? [[
        '图',
        '原始文案',
        '拆分文案',
        '断行文案',
        '预设',
        '最终描述词'
      ], ...grid]
      : mode === 'image-name-group-prompt'
        ? [['整篇自动断行文案', '图片名字', '', '图片组名字', '最终描述词', '拆分文案'], ...grid]
        : grid;
    // 复制回表格时，同一篇文案使用同一种浅色背景，方便在 Sheets / Excel 中核对。
    const clipboardRowSources = mode === 'six-columns-by-source'
      ? Array.from(groupedBySource.keys())
      : mode === 'six-columns-per-segment' || mode === 'image-name-group-prompt'
        ? chosen.map(item => item.sourceIndex ?? 0)
        : [];
    const clipboardHeaderRows = includeSixColumnHeader || mode === 'image-name-group-prompt' ? 1 : 0;
    const sourceRowColors = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#cffafe', '#ffedd5', '#e0f2fe'];
    const clipboardStyles: GridStyles | undefined = clipboardRowSources.length
      ? new Map(clipboardRowSources.flatMap((sourceIndex, rowIndex) => clipboardGrid[rowIndex + clipboardHeaderRows]
        .map((_, columnIndex) => [cellKey(rowIndex + clipboardHeaderRows, columnIndex), { bgColor: sourceRowColors[sourceIndex % sourceRowColors.length] }] as const)))
      : undefined;
    const html = buildGoogleSheetsHtml(clipboardGrid, { styles: clipboardStyles });
    // Quoted TSV keeps embedded newlines inside one spreadsheet cell when the
    // browser falls back from rich HTML clipboard data to plain text.
    const quoteTsvCell = (cell: string) => /[\t\r\n"]/.test(cell)
      ? `"${cell.replace(/"/g, '""')}"`
      : cell;
    const text = clipboardGrid.map(row => row.map(quoteTsvCell).join('\t')).join('\n');
    const result = await copyToClipboard(text, html);

    const numInfo = includeBatchTextNumbering && includeBatchPromptNumbering
      ? '（文案与描述词带编号）'
      : includeBatchTextNumbering
      ? '（文案带编号）'
      : includeBatchPromptNumbering
      ? '（描述词带编号）'
      : '（无编号）';

    const modeLabel = mode === 'six-columns-per-segment'
      ? '六列结果（图+原始文案+拆分文案+断行文案+预设+最终描述词）'
      : mode === 'six-columns-by-source'
      ? `整篇六列聚合${numInfo}`
      : mode === 'multi-presets'
      ? `多预设结果（${activeMultiPresets.length} 列描述词）`
      : mode === 'multi-presets-with-images'
      ? `全信息（图片+文案+${activeMultiPresets.length}列描述词）`
      : mode === 'both-with-images'
      ? '六列完整结果（图+原始文案+拆分文案+断行文案+预设+描述词）'
      : mode === 'images-prompts'
      ? '双列结果（图片+描述词）'
      : mode === 'image-source-split-prompt'
      ? '四列结果（图片文件名+原文+分段文案+描述词）'
      : mode === 'image-name-group-prompt'
      ? '六列交付（整篇自动断行文案+图片名字+空列+图片组名字+最终描述词+拆分文案）'
      : mode === 'images-only'
      ? '单列图片（含公式）'
      : mode === 'image-file-names'
      ? '单列图片文件名（含后缀）'
      : mode === 'filled'
      ? '单列完整描述词'
      : mode === 'filled-horizontal'
        ? batchTemplateMode ? '横向完整描述词（每篇一行）' : '横向完整描述词'
      : mode === 'wrapped'
        ? '逐片段自动断行文案'
      : mode === 'split-wrapped'
        ? '逐片段文案与断行双列结果'
      : mode === 'split'
        ? '逐格拆分文案'
        : mode === 'split-single'
          ? `单格拆分文案（${includeBatchEmptyLines ? '片段间空一行' : '无空行'}）`
          : mode === 'split-by-source'
            ? `按文案分格结果${includeBatchTextNumbering ? '（带编号）' : '（无编号）'}`
            : mode === 'filled-by-source'
              ? `按整篇归组的完整描述词${includeBatchPromptNumbering ? '（带编号）' : '（无编号）'}`
              : mode === 'both-by-source'
                ? `按整篇归组的双列结果${numInfo}`
                : mode === 'wrapped-by-source'
                  ? `按整篇归组的自动断行文案${includeBatchTextNumbering ? '（带编号）' : '（无编号）'}`
                  : mode === 'split-wrapped-by-source'
                    ? `按整篇归组的文案与断行双列结果${includeBatchTextNumbering ? '（带编号）' : '（无编号）'}`
                    : mode === 'all-by-source'
                      ? `按整篇归组的文案、断行与描述词三列结果${numInfo}`
                      : attachedImages.length > 0 ? '六列结果（含图片）' : '双列结果';
    const copiedCount = mode.endsWith('-by-source') ? groupedBySource.size : chosen.length;
    const feedback = result === 'failed'
      ? '复制失败，请检查浏览器剪贴板权限'
      : `复制成功：${copiedCount} 条${modeLabel}`;
    setStatusMsg(feedback);
    setCopyToast({ type: result === 'failed' ? 'error' : 'success', message: feedback });
  };

  const [imagePromptSheetDetached, setImagePromptSheetDetached] = useState(false);
  const imagePromptSheetRows = React.useMemo(() => {
    if (!showImagePromptSheet && !imagePromptSheetDetached) return [];
    const globalIndexes = new Map(templateSegments.map((segment, index) => [segment.id, index]));
    const sourceSegments = new Map<number, TemplateSegment[]>();
    const segmentNumbers = new Map<string, number>();
    templateSegments.forEach(segment => {
      const source = segment.sourceIndex ?? 0;
      const group = sourceSegments.get(source) || [];
      group.push(segment);
      sourceSegments.set(source, group);
      segmentNumbers.set(segment.id, group.length);
    });
    const seenSourceIndexes = new Set<number>();
    return displayedTemplateSegments.map((item, index) => {
      const globalIndex = globalIndexes.get(item.id) ?? -1;
      const image = getSegmentImage(item, globalIndex >= 0 ? globalIndex : index);
      const sourceIndex = item.sourceIndex ?? 0;
      const isFirstInSource = !seenSourceIndexes.has(sourceIndex);
      seenSourceIndexes.add(sourceIndex);
      const sourceWrapped = isFirstInSource
        ? (sourceSegments.get(sourceIndex) || [])
          .map((segment, segmentIndex) => getSegmentWrappedOutput(segment)).join(includeBatchEmptyLines ? '\n\n' : '\n')
        : '';
      const boundGroupName = sourceImageGroupBindings[sourceIndex];
      const rawBaseGroupName = imageBindingMode === 'per-copy' || boundGroupName === '未分组图片'
        ? image?.name || ''
        : boundGroupName || (image ? getImageGroupKey(image) : '');
      const baseGroupName = rawBaseGroupName.replace(/\.(?:jpe?g|png|webp|gif|heic|bmp|avif)$/i, '');
      const segmentNumber = segmentNumbers.get(item.id) || 1;
      const presetGroupName = getDeliveryPresetGroup(item);
      const groupName = item.deliveryGroupName ?? buildDeliveryGroupName(image, baseGroupName, presetGroupName, segmentNumber, getDeliveryPresetName(item));
      return {
        id: item.id,
        segment: item,
        globalIndex,
        image,
        searchText: [image?.fullPath, boundGroupName, getDeliveryPresetGroup(item), templatePresets.find(preset => preset.id === item.presetId)?.category].filter(Boolean).join('\n'),
        values: [
          sourceWrapped,
          image?.gyazoUrl ? toGoogleSheetsImageFormula(image.gyazoUrl) : image?.name || '',
          image?.name || '',
          '',
          groupName,
          getSegmentFinalPrompt(item),
          getSegmentOutputText(item),
          getSegmentPresetName(item)
        ]
      };
    });
  }, [showImagePromptSheet, imagePromptSheetDetached, displayedTemplateSegments, templateSegments, attachedImages, imageBindingMode,
    batchTemplateMode, sourceImageGroupBindings, includeBatchEmptyLines, templatePresets,
    groupNameTemplate, storyboardMode, perSourceTemplateMode, sourcePromptTemplates,
    promptTemplate, lowercaseSplitOutput, quoteSplitSegments, lineWidth]);
  const getImagePromptSheetRows = () => imagePromptSheetRows;
  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onImagePromptSheetRestore?.(() => {
      setImagePromptSheetDetached(false);
      setShowImagePromptSheet(true);
    });
  }, []);
  useEffect(() => {
    if (!imagePromptSheetDetached) return;
    void (window as any).electronAPI?.publishImagePromptSheetData?.({
      headers: ['整篇自动断行文案', '图片', '图片名字', '空白列', '图片组名字', '最终描述词', '拆分文案', '预设（可换）'],
      rows: imagePromptSheetRows.map(row => ({ id: row.id, values: row.values, searchText: row.searchText,
        image: row.image ? { id: row.image.id, url: row.image.url, name: row.image.name, originalPath: getOriginalImagePath(row.image) } : null,
        sourceIndex: row.segment.sourceIndex ?? 0, copied: copiedSegmentIds.has(row.id) }))
    });
  }, [imagePromptSheetDetached, imagePromptSheetRows, copiedSegmentIds]);


  useEffect(() => (window as any).electronAPI?.onImagePromptSheetEdit?.((edit: { id: string; column: number; value: string }) => {
    setTemplateSegments(current => current.map(segment => segment.id !== edit.id ? segment : edit.column === 4 ? { ...segment, deliveryGroupName: edit.value } : edit.column === 5 ? { ...segment, finalPrompt: edit.value } : edit.column === 6 ? { ...segment, text: edit.value, finalPrompt: undefined } : segment));
  }), []);

  const copyImagePromptSheetCells = async (copyAll = false) => {
    const rows = getImagePromptSheetRows();
    const chosenRows = copyAll ? rows : rows.filter(row => row.values.some((_, column) => selectedImagePromptCells.has(`${row.id}:${column}`)));
    if (!chosenRows.length) return setStatusMsg('请先点击选择要复制的单元格');
    // 手动选格时按“实际选择到的列”紧凑输出，不保留原表里未选列的空占位。
    const selectedColumns = copyAll ? rows[0]?.values.map((_, column) => column) || [] : Array.from(new Set(
      Array.from(selectedImagePromptCells).map(key => Number(key.slice(key.lastIndexOf(':') + 1)))
    )).sort((a, b) => a - b);
    const grid = chosenRows.map(row => selectedColumns.map(column =>
      copyAll || selectedImagePromptCells.has(`${row.id}:${column}`) ? row.values[column] : ''
    ));
    const headers = ['整篇自动断行文案', '图片', '图片名字', '空白列', '图片组名字', '最终描述词', '拆分文案', '预设'];
    const outputGrid = copyAll ? [headers, ...grid] : grid;
    const result = await copyToClipboard(outputGrid.map(row => row.join('\t')).join('\n'), buildGoogleSheetsHtml(outputGrid));
    if (result === 'failed') return setStatusMsg('复制失败，请检查浏览器剪贴板权限');
    if (!copyAll) {
      setCopiedSegmentIds(current => new Set([...current, ...chosenRows.map(row => row.id)]));
      setCopiedImageIds(current => new Set([...current, ...chosenRows.flatMap(row => row.image ? [row.image.id] : [])]));
    }
    setStatusMsg(`已复制 ${chosenRows.length} 行${copyAll ? '图＋词表格（含表头）' : '所选单元格'}，可粘贴到 Google 表格`);
  };

  // 图＋词弹窗模拟表格软件的复制快捷键：Mac 用 ⌘C，Windows 用 Ctrl+C。
  useEffect(() => {
    const handleImagePromptSheetCopy = (event: KeyboardEvent) => {
      if (!showImagePromptSheet || selectedImagePromptCells.size === 0) return;
      if (event.key.toLowerCase() !== 'c' || (!event.metaKey && !event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      void copyImagePromptSheetCells(false);
    };
    window.addEventListener('keydown', handleImagePromptSheetCopy);
    return () => window.removeEventListener('keydown', handleImagePromptSheetCopy);
  }, [showImagePromptSheet, selectedImagePromptCells]);

  const exportTemplateResults = () => {
    if (!templateSegments.length) return setStatusMsg('没有可导出的拆分结果');
    const headers = [
      '序号',
      '第一列_图',
      '第二列_原始文案',
      '第三列_拆分文案',
      '第四列_断行文案',
      '第五列_预设',
      '第六列_最终描述词'
    ];

    const rows = [
      headers.join('\t'),
      ...templateSegments.map((item, index) => {
        const globalIdx = templateSegments.findIndex(s => s.id === item.id);
        const img = getSegmentImage(item, globalIdx >= 0 ? globalIdx : index);
        const imgVal = img ? (img.gyazoUrl ? toGoogleSheetsImageFormula(img.gyazoUrl) : img.name) : '';
        const cols = [
          `${index + 1}`,
          imgVal.replace(/\t/g, ' '),
          getSegmentSourceText(item.sourceIndex).replace(/\t/g, ' '),
          getSegmentOutputText(item).replace(/\t/g, ' '),
          getSegmentWrappedOutput(item).replace(/\t/g, ' '),
          getSegmentPresetName(item).replace(/\t/g, ' '),
          getSegmentFinalPrompt(item).replace(/\t/g, ' ')
        ];
        return cols.join('\t');
      })
    ];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `模板拆分六列结果_${Date.now()}.tsv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ===== 完整拆分工程记录导出与恢复 =====
  const handleExportProjectSession = async () => {
    if (!templateSegments.length && !templateSource.trim() && !batchTemplateDrafts.length && tabs.every(t => !t.templateSegments?.length && !t.templateSource?.trim())) {
      setStatusMsg('当前没有可导出的拆分文案或分镜内容');
      return;
    }

    try {
      setIsExportingProject(true);
      setStatusMsg('正在打包导出多标签页工程记录（含各标签页离线图片实体）...');

      const currentSnapshot = captureCurrentTabSnapshot();
      const allTabs = tabs.map(t => t.id === activeTabId ? currentSnapshot : t);

      // 收集全部标签页中的所有图片（去重）
      const allImagesMap = new Map<string, AttachedImage>();
      allTabs.forEach(t => {
        (t.attachedImages || []).forEach(img => {
          if (!allImagesMap.has(img.id)) allImagesMap.set(img.id, img);
        });
      });
      const allImagesList = Array.from(allImagesMap.values());

      let firstText = templateSource.trim();
      if (batchTemplateMode && batchTemplateDrafts.length > 0) {
        firstText = batchTemplateDrafts[0].source.trim();
      }
      const title = currentSnapshot.title || (firstText ? firstText.split(/[\r\n]+/)[0].slice(0, 20) : '拆分项目');

      await exportProjectSessionFile(
        {
          title,
          ...currentSnapshot,
          templatePresets,
          tabs: allTabs,
          activeTabId
        },
        allImagesList,
        (current, total) => {
          setStatusMsg(`正在打包离线图片: ${current}/${total}...`);
        }
      );

      setStatusMsg(`已成功保存并导出工程文件（含 ${allTabs.length} 个标签页，${allImagesList.length} 张图片实体）`);
    } catch (err: any) {
      console.error('Export project failed', err);
      setStatusMsg(`导出工程失败: ${err.message || '未知错误'}`);
    } finally {
      setIsExportingProject(false);
    }
  };

  const handleImportProjectSession = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be re-selected if needed
    e.target.value = '';

    if (templateSegments.length > 0 || templateSource.trim()) {
      const confirmOverwrite = window.confirm(
        '导入新工程将完整恢复其所有的文案、分镜行、图片与设置。\n当前编辑区的内容将被覆盖，确定要继续导入吗？'
      );
      if (!confirmOverwrite) return;
    }

    try {
      setIsImportingProject(true);
      setStatusMsg('正在解析工程文件并还原离线图片资源...');

      const restored: RestoredProjectSession = await importProjectSessionFile(file, (curr, tot) => {
        setStatusMsg(`正在还原工程图片: ${curr}/${tot}...`);
      });

      // Revoke old object URLs before replacing
      attachedImages.forEach(img => {
        try {
          if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
        } catch {}
      });

      // 工程文件携带的预设优先恢复，并同步到本机预设库；旧工程没有该字段时保持本机库不变。
      if (restored.templatePresets && restored.templatePresets.length > 0) {
        setTemplatePresets(restored.templatePresets);
        persistTemplatePresets(restored.templatePresets);
      }

      if (restored.tabs && restored.tabs.length > 0) {
        setTabs(restored.tabs);
        const targetId = restored.activeTabId && restored.tabs.some((t: any) => t.id === restored.activeTabId)
          ? restored.activeTabId
          : restored.tabs[0].id;
        setActiveTabId(targetId);
        const targetTab = restored.tabs.find((t: any) => t.id === targetId) || restored.tabs[0];
        applyTabToActiveState(targetTab);

        let totalSegs = 0;
        let totalImgs = 0;
        restored.tabs.forEach((t: any) => {
          totalSegs += (t.templateSegments || []).length;
          totalImgs += (t.attachedImages || []).length;
        });

        setStatusMsg(`🎉 成功恢复工程！共还原 ${restored.tabs.length} 个标签页（包含 ${totalSegs} 个分镜，${totalImgs} 张配图）`);
      } else {
        // 单工程文件兼容还原
        setTemplateSource(restored.templateSource);
        setBatchTemplateMode(restored.batchTemplateMode);
        setBatchTemplateDrafts(restored.batchTemplateDrafts || []);
        setActiveBatchSourceIndex(restored.activeBatchSourceIndex ?? null);

        setPromptTemplate(restored.promptTemplate);
        setSourcePromptTemplates(restored.sourcePromptTemplates || {});
        setSourceImageGroupBindings(restored.sourceImageGroupBindings || {});
        setPerSourceTemplateMode(restored.perSourceTemplateMode);
        setStoryboardMode(restored.storyboardMode);
        setMultiPresetIds(restored.multiPresetIds || []);

        if (restored.splitSettings) {
          setTemplateSplitStrategy(restored.splitSettings.templateSplitStrategy);
          setSplitMinimum(restored.splitSettings.splitMinimum);
          setSplitMaximum(restored.splitSettings.splitMaximum);
          setSplitUnit(restored.splitSettings.splitUnit);
          setLineWidth(restored.splitSettings.lineWidth);
          setWrapMode(restored.splitSettings.wrapMode);
          setSplitTolerance(restored.splitSettings.splitTolerance);
          setAllowTolerance(restored.splitSettings.allowTolerance);
          setKeepSentences(restored.splitSettings.keepSentences);
          setSentencePauseOnly(restored.splitSettings.sentencePauseOnly);
          setQuoteSplitSegments(restored.splitSettings.quoteSplitSegments);
          setLowercaseSplitOutput(restored.splitSettings.lowercaseSplitOutput);
          if (restored.splitSettings.includeBatchTextNumbering !== undefined) {
            setIncludeBatchTextNumbering(restored.splitSettings.includeBatchTextNumbering);
          }
          if (restored.splitSettings.includeBatchPromptNumbering !== undefined) {
            setIncludeBatchPromptNumbering(restored.splitSettings.includeBatchPromptNumbering);
          }
          if (restored.splitSettings.batchNumberStyle !== undefined) {
            setBatchNumberStyle(restored.splitSettings.batchNumberStyle);
          }
          if (restored.splitSettings.includeBatchEmptyLines !== undefined) {
            setIncludeBatchEmptyLines(restored.splitSettings.includeBatchEmptyLines);
          }
        }

        setTemplateSegments(restored.templateSegments || []);
        setAttachedImages(restored.attachedImages || []);
        setImageBindingMode(restored.imageBindingMode || 'per-segment');

        const nextCopiedSegs = new Set(restored.copiedSegmentIds || []);
        setCopiedSegmentIds(nextCopiedSegs);
        try {
          localStorage.setItem('ai_toolkit_copied_segment_ids', JSON.stringify(Array.from(nextCopiedSegs)));
        } catch {}

        const nextCopiedImgs = new Set(restored.copiedImageIds || []);
        setCopiedImageIds(nextCopiedImgs);
        try {
          localStorage.setItem('ai_toolkit_copied_image_ids', JSON.stringify(Array.from(nextCopiedImgs)));
        } catch {}

        setSelectedSegmentIds(new Set(restored.selectedSegmentIds || []));

        const legacyTab: SplitWorkspaceTab = {
          id: 'tab-1',
          title: restored.title || '标签页 1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          templateSource: restored.templateSource,
          batchTemplateMode: restored.batchTemplateMode,
          batchTemplateDrafts: restored.batchTemplateDrafts,
          activeBatchDraftIndex: 0,
          activeBatchSourceIndex: restored.activeBatchSourceIndex ?? null,
          promptTemplate: restored.promptTemplate,
          sourcePromptTemplates: restored.sourcePromptTemplates || {},
          sourceImageGroupBindings: restored.sourceImageGroupBindings || {},
          perSourceTemplateMode: restored.perSourceTemplateMode,
          storyboardMode: restored.storyboardMode,
          selectedPresetId: '',
          presetName: '',
          multiPresetIds: restored.multiPresetIds || [],
          splitSettings: restored.splitSettings as any,
          templateSegments: restored.templateSegments || [],
          selectedSegmentIds: restored.selectedSegmentIds || [],
          segmentCarets: {},
          attachedImages: restored.attachedImages || [],
          imageBindingMode: restored.imageBindingMode || 'per-segment',
          copiedSegmentIds: restored.copiedSegmentIds || [],
          copiedImageIds: restored.copiedImageIds || []
        };
        setTabs([legacyTab]);
        setActiveTabId('tab-1');

        setStatusMsg(`🎉 成功恢复工程！共还原 ${restored.templateSegments.length} 个分镜，${restored.attachedImages.length} 张配图`);
      }
    } catch (err: any) {
      console.error('Import project failed', err);
      alert(`导入工程失败: ${err.message || '文件损坏或格式不兼容'}`);
      setStatusMsg(`导入工程失败: ${err.message || '文件损坏'}`);
    } finally {
      setIsImportingProject(false);
    }
  };

  // ===== 合并行内容：多列合并为一列（顿号分隔）=====
  const handleMergeRowContent = () => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要合并的区域');
      return;
    }
    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);
    const totalCols = maxC - minC + 1;
    if (totalCols < 2) {
      setStatusMsg('至少需要选中 2 列才能合并');
      return;
    }

    const newGrid = gridData.map(row => [...row]);
    let mergedCount = 0;

    for (let r = minR; r <= maxR; r++) {
      const parts: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = (newGrid[r]?.[c] || '').trim();
        if (val) parts.push(val);
      }
      if (parts.length === 0) continue;

      // Write merged content to first column
      newGrid[r][minC] = parts.join('、');
      // Clear remaining columns
      for (let c = minC + 1; c <= maxC; c++) {
        newGrid[r][c] = '';
      }
      mergedCount++;
    }

    setGridData(newGrid);

    // Update selection to first column only
    const newSel = {
      start: { row: minR, col: minC },
      end: { row: maxR, col: minC }
    };
    setForceSelection(newSel);
    setSelection(newSel);

    setStatusMsg(`✅ 已将 ${totalCols} 列合并为 1 列（${colToLetter(minC)}），共处理 ${mergedCount} 行，用「、」分隔`);
  };

  // ===== 合并列：将所有列按循环数合并 =====
  const handleMergeColumns = () => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要合并的区域');
      return;
    }
    setShowMergeModal(true);
  };

  // ===== 拆分列：将选区按行数横向分列 =====
  const handleSplitColumns = () => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要拆分的区域或列');
      return;
    }
    setShowSplitColumnModal(true);
  };

  const getFirstSelectedText = (): string => {
    if (!selection) return '';
    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const value = gridData[r]?.[c]?.trim();
        if (value) return value;
      }
    }
    return '';
  };

  const handleOpenLinkVariantModal = () => {
    const selectedText = getFirstSelectedText();
    setLinkVariantInput(selectedText);
    setShowLinkVariantModal(true);
    if (!selectedText) {
      setStatusMsg('请输入链接，或先选中一个包含链接的单元格');
    }
  };

  const handleGenerateLinkVariants = () => {
    const source = linkVariantInput.trim();
    if (!source) {
      setStatusMsg('请输入需要枚举的链接');
      return;
    }

    try {
      const variants = generateLinkVariants(source);
      if (variants.length === 0) {
        setStatusMsg('链接中没有找到小写 l 或大写 I');
        return;
      }

      const anchorRow = selection ? Math.min(selection.start.row, selection.end.row) : 0;
      const anchorCol = selection ? Math.min(selection.start.col, selection.end.col) : 0;
      const targetCol = anchorCol + 1;
      const nextGrid = gridData.map(row => [...row]);
      const minCols = Math.max(DEFAULT_COLS, targetCol + 1, nextGrid[0]?.length || 0);

      while (nextGrid.length < anchorRow + variants.length) {
        nextGrid.push(Array(minCols).fill(''));
      }

      for (let r = 0; r < nextGrid.length; r++) {
        if (!nextGrid[r]) nextGrid[r] = [];
        while (nextGrid[r].length < minCols) nextGrid[r].push('');
      }

      variants.forEach((variant, idx) => {
        nextGrid[anchorRow + idx][targetCol] = variant;
      });

      const newSelection = {
        start: { row: anchorRow, col: targetCol },
        end: { row: anchorRow + variants.length - 1, col: targetCol }
      };

      setGridData(nextGrid);
      setForceSelection(newSelection);
      setSelection(newSelection);
      setShowLinkVariantModal(false);
      setStatusMsg(`已生成 ${variants.length} 个链接候选，结果在 ${colToLetter(targetCol)}${anchorRow + 1}:${colToLetter(targetCol)}${anchorRow + variants.length}`);
    } catch (err: any) {
      setStatusMsg(err?.message || '链接枚举失败');
    }
  };

  // ===== 信仰词汇大写保护：纯脚本检查 =====
  const handleOpenDeityModal = () => {
    setDeityTerms(loadDeityTerms()); // 每次打开从 localStorage 刷新
    setShowDeityModal(true);
  };

  const handleAddDeityTerm = () => {
    const val = deityNewTerm.trim();
    if (!val) return;
    const newTerms = val.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const merged = Array.from(new Set([...deityTerms, ...newTerms]));
    setDeityTerms(merged);
    saveDeityTerms(merged);
    setDeityNewTerm('');
  };

  const handleRemoveDeityTerm = (term: string) => {
    const updated = deityTerms.filter(t => t !== term);
    setDeityTerms(updated);
    saveDeityTerms(updated);
  };

  const handleResetDeityTerms = () => {
    setDeityTerms(DEFAULT_DEITY_TERMS);
    saveDeityTerms(DEFAULT_DEITY_TERMS);
  };

  const doDeityCapitalizationCheck = async () => {
    setShowDeityModal(false);
    if (!selection) {
      setStatusMsg('请先用鼠标框选要检查的单元格区域');
      return;
    }

    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);

    const W = maxC - minC + 1;
    const resultColOffset = W;
    const feedbackColOffset = W * 2;
    const maxRequiredCol = maxC + feedbackColOffset;

    setDiffCols(prev => {
      const next = { ...prev };
      for (let c = minC; c <= maxC; c++) {
        next[c] = c + resultColOffset;
      }
      return next;
    });

    setAutoRowHeight(true);

    const newGrid = gridData.map(row => [...row]);
    const newStyles = new Map(gridStyles);

    // 确保每行有足够的列
    for (let r = 0; r < newGrid.length; r++) {
      while (newGrid[r].length <= maxRequiredCol) {
        newGrid[r].push('');
      }
    }

    if (!getAiInstance || !getAiInstance()) {
      setStatusMsg(`⚠️ AI 检测未运行 (未配置 API Key)`);
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (newGrid[r]?.[c]?.trim()) {
            newGrid[r][c + resultColOffset] = '';
            newGrid[r][c + feedbackColOffset] = '⚠️ 需配置 API Key 运行 AI 检查';
          }
        }
      }
      setGridData(newGrid);
      return;
    }
    const ai = getAiInstance()!;
    let modelToUse = effectiveModel;
    let autoUpgradeMsg = '';
    if (modelToUse.toLowerCase().includes('lite') || modelToUse === 'gemini-3.1-flash-lite') {
      modelToUse = 'gemini-3.8-flash';
      autoUpgradeMsg = ' (检测到 Lite 模型，已自动升级至 3.8-flash 以确保效果)';
    }

    setSpellChecking(true);
    setStatusMsg(`🔍 AI 智能检测中...${autoUpgradeMsg}`);

    try {
      // 收集需要检查的单元格（直接使用选区内的原文）
      const cellsToCheck: { row: number; col: number; text: string }[] = [];
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const val = newGrid[r]?.[c] || '';
          if (val.trim()) {
            cellsToCheck.push({ row: r, col: c, text: val });
          } else {
            newGrid[r][c + resultColOffset] = '';
            newGrid[r][c + feedbackColOffset] = '';
          }
        }
      }

      if (cellsToCheck.length === 0) {
        setStatusMsg('选区内没有内容');
        setSpellChecking(false);
        return;
      }

      const BATCH_SIZE = 20;
      let spellFixCount = 0;
      const latestGrid = newGrid.map(row => [...row]);
      const latestStyles = new Map(newStyles);

      for (let batchStart = 0; batchStart < cellsToCheck.length; batchStart += BATCH_SIZE) {
        const batch = cellsToCheck.slice(batchStart, batchStart + BATCH_SIZE);
        setStatusMsg(`🔍 AI 智能检测中... (${batchStart}/${cellsToCheck.length})`);

        try {
          const pronounsList = ['he', 'him', 'his', 'you', 'your', 'siya', 'kanya', 'niya', 'kayo', 'iyo', 'mo', 'ka', 'ninyo', 'sila', 'kila', 'kaniya'];
          const properDeityTerms = deityTerms.filter(t => !pronounsList.includes(t.toLowerCase()));
          const textsJson = batch.map((c, i) => `[${i}] ${c.text}`).join('\n---\n');
          const prompt = `You are a professional proofreader specializing in prayer/inspirational social media content in multiple languages (especially English and Tagalog/Filipino). For each numbered text below, fix ALL spelling, grammar, punctuation, and capitalization errors while preserving the original meaning, tone, and language of the text.

FIX THESE ERROR TYPES across English and Tagalog:
1. SPELLING & TYPOS: e.g., "Whoe" → "Whoever", "recieve" → "receive", Tagalog typos like "mahalin" / "pananampalataya" typos.
2. RELIGIOUS PROPER NOUNS: e.g., "Our Lady of Lords" → "Our Lady of Lourdes", "Pslam" → "Psalm", Tagalog names like "Hesukristo", "Diyos".
3. SPEECH-TO-TEXT ARTIFACTS: e.g., "our men" → "Amen", "nor Jesus" → "In Jesus' name" (reconstruct garbled phrases from voice transcription)
4. MISSING PUNCTUATION: Add periods between run-on sentences. Add proper sentence capitalization.
5. GRAMMAR & WORD CORRECTION: Fix verb tenses, subject-verb agreement, and word confusion.
6. NUMBERING SEQUENCE: "First...Second...Second" → "First...Second...Third"
7. BROKEN SENTENCES: Fix garbled sentence boundaries.
8. PRONOUN & PROPER NOUN CAPITALIZATION FOR DEITY:
   - PROPER NOUNS: Capitalize all proper nouns referring to Deity. Specific words list: [${properDeityTerms.join(', ')}].
   - PRONOUNS (CONTEXT-DEPENDENT): ONLY capitalize pronouns (e.g., He, Him, His, You, Your, Siya, Kanya, Niya) if they DIRECTLY refer to God, Jesus Christ, or the Holy Spirit.
   - AVOID OVER-CAPITALIZATION: DO NOT capitalize pronouns when they refer to the reader/audience or other human beings / biblical characters / prophets.
     * Examples:
       - "God is already working for you and your family" → "you" and "your" refer to the reader (human). They MUST remain lowercase: "you", "your". (Capitalizing to "You" or "Your" is a CRITICAL ERROR).
       - "Joseph was once in a pit, but he was lifted up" → "he" refers to Joseph (human). It MUST remain lowercase: "he". (Capitalizing to "He" is a CRITICAL ERROR).
       - "Daniel was in danger, but he was protected" → "he" refers to Daniel (human). It MUST remain lowercase: "he". (Capitalizing to "He" is a CRITICAL ERROR).
       - "Moses led them, but he doubted" → "he" refers to Moses (human). It MUST remain lowercase: "he".
     * Only capitalize when referring directly to God, e.g., "God is good, He is always there" (He = God), or "We worship You, Lord" (You = Lord).
     * If a pronoun refers to any human, reader, or biblical character, KEEP IT LOWERCASE.
9. AMEN FORMATTING: Wrap standalone "Amen" in quotes (e.g. write "Amen", say "Amen") when referred to as something to type/say.
10. LANGUAGE CONSISTENCY: Keep Tagalog text in Tagalog, English in English. Do NOT translate the text, only correct its errors in its source language.

CRITICAL RULES:
- Keep the language of each text exactly as it is (English stays English, Tagalog stays Tagalog). Do NOT translate between languages!
- Fix ALL errors you find, not just spelling.
- Keep the devotional/prayer tone intact.
- Do NOT add or remove content beyond fixes.
- If a text has no errors, return it EXACTLY as-is.
- Return the COMPLETE corrected text for each entry.

Texts:
${textsJson}

Return ONLY a JSON array of corrected strings: ["corrected1", "corrected2", ...]`;

          const response = await ai.models.generateContent({
            model: modelToUse,
            contents: prompt,
          });

          const resultText = (response as any).text || '';
          const jsonMatch = resultText.match(/\[[\s\S]*\]/);
          if (!jsonMatch) {
            throw new Error('AI返回格式解析失败');
          }

          const corrected: string[] = JSON.parse(jsonMatch[0]);
          for (let i = 0; i < batch.length && i < corrected.length; i++) {
            const cell = batch[i];
            const original = cell.text;
            const fixed = corrected[i];

            latestGrid[cell.row][cell.col + resultColOffset] = fixed || original;
            if (fixed && fixed !== original) {
              spellFixCount++;
              // 修正后单元格浅紫色高亮显示结果单元格
              latestStyles.set(cellKey(cell.row, cell.col + resultColOffset), { bgColor: '#c4b5fd' });
              latestGrid[cell.row][cell.col + feedbackColOffset] = '🤖 AI已修正';
            } else {
              latestGrid[cell.row][cell.col + feedbackColOffset] = '✅';
            }
          }
        } catch (batchErr) {
          // 单个 batch 出错，在该 batch 所有单元格反馈中标注异常
          for (const cell of batch) {
            latestGrid[cell.row][cell.col + feedbackColOffset] = '⚠️ AI 检查失败，请重试';
          }
        }
      }

      setGridData(latestGrid);
      setGridStyles(latestStyles);
      setStatusMsg(`✅ AI 智能检测完成，已修正 ${spellFixCount} 个单元格（结果见 ${colToLetter(minC + resultColOffset)} 列，反馈见 ${colToLetter(minC + feedbackColOffset)} 列）`);
    } catch (err: any) {
      setStatusMsg(`⚠️ AI 智能检测失败: ${err.message || '未知错误'}`);
      const failedGrid = newGrid.map(row => [...row]);
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (failedGrid[r]?.[c]?.trim()) {
            failedGrid[r][c + feedbackColOffset] = '⚠️ AI 检查失败，请重试';
          }
        }
      }
      setGridData(failedGrid);
    } finally {
      setSpellChecking(false);
    }
  };

  // ===== 合并单元格：生成 colspan 格式并复制到剪贴板 =====
  const handleOpenMergeCellModal = () => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要处理的单元格区域');
      return;
    }
    setShowMergeCellModal(true);
  };

  const doMergeCellGenerate = async () => {
    setShowMergeCellModal(false);
    if (!selection) return;

    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);
    const totalCols = maxC - minC + 1;
    const totalRows = maxR - minR + 1;
    const span = Math.max(1, mergeCellSpan);

    // 收集选区数据
    const sourceGrid: string[][] = [];
    for (let r = minR; r <= maxR; r++) {
      const row: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        row.push(gridData[r]?.[c] || '');
      }
      sourceGrid.push(row);
    }

    // 写入表格：每个值占 span 列（第一个写值，后面填空）
    const newGrid = gridData.map(row => [...row]);
    const expandedCols = totalCols * span;
    const targetStartCol = maxC + 1; // 写到选区右侧

    // 确保每行有足够的列
    for (let r = 0; r < newGrid.length; r++) {
      while (newGrid[r].length < targetStartCol + expandedCols) {
        newGrid[r].push('');
      }
    }
    // 确保有足够的行
    while (newGrid.length < minR + totalRows) {
      newGrid.push(Array(targetStartCol + expandedCols).fill(''));
    }

    for (let r = 0; r < sourceGrid.length; r++) {
      const targetRow = minR + r;
      for (let c = 0; c < sourceGrid[r].length; c++) {
        const targetCol = targetStartCol + c * span;
        // 确保行有足够的列
        while (newGrid[targetRow].length < targetCol + span) {
          newGrid[targetRow].push('');
        }
        // 第一个单元格写值
        newGrid[targetRow][targetCol] = sourceGrid[r][c];
        // 后续单元格填空（模拟合并效果）
        for (let s = 1; s < span; s++) {
          newGrid[targetRow][targetCol + s] = '';
        }
      }
    }

    setGridData(newGrid);

    // 更新选区到新生成的区域
    const newSelection = {
      start: { row: minR, col: targetStartCol },
      end: { row: minR + totalRows - 1, col: targetStartCol + expandedCols - 1 }
    };
    setForceSelection(newSelection);
    setSelection(newSelection);

    // 生成 colspan HTML 并复制到剪贴板
    const mergedHtml = buildMergedCellsHtml(sourceGrid, span);
    const textLines = sourceGrid.map(row => {
      return row.map(cell => {
        // 纯文本：每个值后面跟 (span-1) 个 tab
        const tabs = '\t'.repeat(span - 1);
        return cell + tabs;
      }).join('\t');
    }).join('\n');

    const result = await copyToClipboard(textLines, mergedHtml);
    const copyMsg = result === 'rich' ? '（已复制到剪贴板，可直接粘贴到 Google Sheets）' 
                  : result === 'text' ? '（已复制纯文本）' : '';

    setStatusMsg(`✅ 已生成合并单元格格式：${totalRows} 行 × ${totalCols} 列，每值跨 ${span} 列 → 总宽 ${expandedCols} 列 ${copyMsg}`);
  };

  const doMergeColumns = () => {
    setShowMergeModal(false);
    if (!selection) return;

    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);
    const totalCols = maxC - minC + 1;
    const totalRows = maxR - minR + 1;
    const cycle = Math.max(1, Math.min(mergeCycle, totalCols));

    if (totalCols <= cycle) {
      setStatusMsg(`选区只有 ${totalCols} 列，不需要合并（循环列数 = ${cycle}）`);
      return;
    }

    // 计算有多少组
    const groupCount = Math.ceil(totalCols / cycle);

    // 收集每组的行数据
    const mergedRows: string[][] = [];
    const mergedRowSourceCols: number[][] = [];
    for (let g = 0; g < groupCount; g++) {
      const startCol = minC + g * cycle;
      for (let r = minR; r <= maxR; r++) {
        const row: string[] = [];
        const sourceCols: number[] = [];
        let hasContent = false;
        for (let c = 0; c < cycle; c++) {
          const actualCol = startCol + c;
          const val = actualCol <= maxC ? (gridData[r]?.[actualCol] || '') : '';
          row.push(val);
          sourceCols.push(actualCol);
          if (val.trim()) hasContent = true;
        }
        if (hasContent) {
          mergedRows.push(row);
          mergedRowSourceCols.push(sourceCols);
        }
      }
    }

    // 构建新的 grid
    const newGrid = gridData.map(row => [...row]);

    // 先清空选区
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (newGrid[r]) newGrid[r][c] = '';
      }
    }

    // 确保有足够的行
    const neededRows = minR + mergedRows.length;
    while (newGrid.length < neededRows) {
      newGrid.push(Array(newGrid[0]?.length || DEFAULT_COLS).fill(''));
    }

    // 写入合并后的数据
    for (let i = 0; i < mergedRows.length; i++) {
      const targetRow = minR + i;
      for (let c = 0; c < cycle; c++) {
        if (!newGrid[targetRow]) newGrid[targetRow] = Array(newGrid[0]?.length || DEFAULT_COLS).fill('');
        newGrid[targetRow][minC + c] = mergedRows[i][c] || '';
      }
    }

    setGridData(newGrid);

    // Color by the original source column, not the stacked target column, so
    // cells from different source columns remain distinguishable after merge.
    const newStyles = new Map(gridStyles);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        newStyles.delete(cellKey(r, c));
      }
    }
    for (let i = 0; i < mergedRows.length; i++) {
      const targetRow = minR + i;
      for (let c = 0; c < cycle; c++) {
        const targetCol = minC + c;
        if ((mergedRows[i][c] || '').trim()) {
          const sourceCol = mergedRowSourceCols[i][c];
          newStyles.set(cellKey(targetRow, targetCol), {
            bgColor: MERGED_COLUMN_COLORS[(sourceCol - minC) % MERGED_COLUMN_COLORS.length]
          });
        } else {
          newStyles.delete(cellKey(targetRow, targetCol));
        }
      }
    }
    setGridStyles(newStyles);

    // 更新选区
    const newSelection = {
      start: { row: minR, col: minC },
      end: { row: minR + mergedRows.length - 1, col: minC + cycle - 1 }
    };
    setForceSelection(newSelection);
    setSelection(newSelection);

    const colStr = Array.from({ length: cycle }, (_, i) => colToLetter(minC + i)).join(', ');
    setStatusMsg(`✅ 已将 ${totalCols} 列（${groupCount} 组 × ${cycle} 列）合并为 ${mergedRows.length} 行，结果在列: ${colStr}；每列已使用不同颜色标记，复制时可保留`);
  };

  // ===== 拆分列：将选区按每N行一组横向排列为多列 =====
  const doSplitColumns = () => {
    setShowSplitColumnModal(false);
    if (!selection) return;

    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);
    const totalRows = maxR - minR + 1;
    const totalCols = maxC - minC + 1;
    const rowsPerGroup = Math.max(1, splitRowsPerGroup);

    if (totalRows <= rowsPerGroup) {
      setStatusMsg(`选区共 ${totalRows} 行，未超过单组行数 (${rowsPerGroup})，无需拆分`);
      return;
    }

    const groupCount = Math.ceil(totalRows / rowsPerGroup);
    const totalGeneratedCols = groupCount * totalCols;
    const targetStartRow = minR;
    const targetStartCol = splitKeepSource ? (maxC + 1) : minC;
    const maxRequiredCol = targetStartCol + totalGeneratedCols - 1;

    const newGrid = gridData.map(row => [...row]);
    const newStyles = new Map(gridStyles);

    // 确保有足够的行与列
    const neededRows = targetStartRow + rowsPerGroup;
    while (newGrid.length < neededRows) {
      newGrid.push(Array(Math.max(DEFAULT_COLS, maxRequiredCol + 1)).fill(''));
    }
    for (let r = 0; r < newGrid.length; r++) {
      while (newGrid[r].length <= maxRequiredCol) {
        newGrid[r].push('');
      }
    }

    // 如果是不保留原数据（就地覆盖展开），先清空原选区在 rowsPerGroup 之后的冗余行
    if (!splitKeepSource) {
      for (let r = minR + rowsPerGroup; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (newGrid[r]) newGrid[r][c] = '';
          newStyles.delete(cellKey(r, c));
        }
      }
    }

    // 逐组横向排列写入数据
    for (let g = 0; g < groupCount; g++) {
      const groupColStart = targetStartCol + g * totalCols;
      const groupBgColor = MERGED_COLUMN_COLORS[g % MERGED_COLUMN_COLORS.length];

      for (let rOffset = 0; rOffset < rowsPerGroup; rOffset++) {
        const srcRow = minR + g * rowsPerGroup + rOffset;
        const dstRow = targetStartRow + rOffset;

        for (let cOffset = 0; cOffset < totalCols; cOffset++) {
          const srcCol = minC + cOffset;
          const dstCol = groupColStart + cOffset;
          const val = (srcRow <= maxR) ? (gridData[srcRow]?.[srcCol] || '') : '';

          if (!newGrid[dstRow]) {
            newGrid[dstRow] = Array(maxRequiredCol + 1).fill('');
          }
          newGrid[dstRow][dstCol] = val;

          if (splitApplyColor && val.trim()) {
            newStyles.set(cellKey(dstRow, dstCol), { bgColor: groupBgColor });
          } else if (!val.trim()) {
            newStyles.delete(cellKey(dstRow, dstCol));
          }
        }
      }
    }

    setGridData(newGrid);
    setGridStyles(newStyles);

    // 更新选区为新生成的区域
    const newSelection = {
      start: { row: targetStartRow, col: targetStartCol },
      end: { row: targetStartRow + Math.min(rowsPerGroup, totalRows) - 1, col: maxRequiredCol }
    };
    setForceSelection(newSelection);
    setSelection(newSelection);

    const startColLetter = colToLetter(targetStartCol);
    const endColLetter = colToLetter(maxRequiredCol);
    setStatusMsg(`✅ 已将 ${totalRows} 行按每 ${rowsPerGroup} 行一组，横向拆分排列为 ${groupCount} 组（共 ${totalGeneratedCols} 列，列范围: ${startColLetter} ~ ${endColLetter}）`);
  };

  // AI 智能拆分：用 Gemini 识别标题，substring 截取原文保证零修改；自动平移避让已有列
  const handleAiSplit = async () => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要处理的单元格区域');
      return;
    }
    if (!getAiInstance) {
      setStatusMsg('AI 功能需要配置 API Key');
      return;
    }
    const ai = getAiInstance();
    if (!ai) {
      setStatusMsg('请先在设置中配置 API Key');
      return;
    }

    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);

    // Collect non-empty cells
    const cells: { row: number; col: number; text: string }[] = [];
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        const val = gridData[r]?.[c] || '';
        if (val.trim()) cells.push({ row: r, col: c, text: val });
      }
    }
    if (cells.length === 0) {
      setStatusMsg('选区内没有内容');
      return;
    }

    setAiSplitting(true);

    try {
      const BATCH_SIZE = 20;
      const splitResults = new Map<string, { title: string; content: string }>();
      let processedCount = 0;

      for (let batchStart = 0; batchStart < cells.length; batchStart += BATCH_SIZE) {
        const batch = cells.slice(batchStart, batchStart + BATCH_SIZE);
        setStatusMsg(`AI 正在分析提取标题... (${processedCount}/${cells.length})`);

        const textsJson = batch.map((c, i) => `[${i}] ${c.text.substring(0, 500)}`).join('\n---\n');
        const promptInstruction = (aiSplitPrompt || DEFAULT_AI_SPLIT_PROMPT).trim();
        const prompt = `${promptInstruction}

Texts:
${textsJson}

Return ONLY a JSON array of title strings: ["title1", "title2", ...]`;

        const response = await ai.models.generateContent({
          model: effectiveModel,
          contents: prompt,
        });

        const resultText = (response as any).text || '';
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error(`AI 返回格式异常 (批次 ${Math.floor(batchStart / BATCH_SIZE) + 1})`);

        const titles: string[] = JSON.parse(jsonMatch[0]);

        for (let i = 0; i < batch.length && i < titles.length; i++) {
          const cell = batch[i];
          const aiTitle = titles[i];
          const originalText = cell.text;

          const titleIdx = originalText.indexOf(aiTitle);
          let title: string;
          let content: string;

          if (titleIdx === 0 && aiTitle.length < originalText.length) {
            let splitPos = aiTitle.length;
            // If a colon follows the title, include it in the title
            const afterTitle = originalText.substring(splitPos);
            const colonMatch = afterTitle.match(/^[\s]*([:：])/);
            if (colonMatch) {
              splitPos += colonMatch[0].length;
            }
            title = originalText.substring(0, splitPos).trim();
            content = originalText.substring(splitPos).trim();
          } else {
            const lowerIdx = originalText.toLowerCase().indexOf(aiTitle.toLowerCase());
            if (lowerIdx === 0 && aiTitle.length < originalText.length) {
              let splitPos = aiTitle.length;
              // If a colon follows the title, include it in the title
              const afterTitle = originalText.substring(splitPos);
              const colonMatch = afterTitle.match(/^[\s]*([:：])/);
              if (colonMatch) {
                splitPos += colonMatch[0].length;
              }
              title = originalText.substring(0, splitPos).trim();
              content = originalText.substring(splitPos).trim();
            } else {
              const periodMatch = originalText.match(/^(.+?[.!?])\s+(.+)$/s);
              if (periodMatch) {
                title = periodMatch[1].trim();
                content = periodMatch[2].trim();
              } else {
                title = originalText;
                content = '';
              }
            }
          }

          splitResults.set(`${cell.row},${cell.col}`, { title, content });
        }

        processedCount += batch.length;
      }

      // Safe column insertion & shift to protect existing content on the right
      const newGrid = gridData.map(row => [...row]);
      const columnInsertions: { at: number; count: number }[] = [];
      const updatedCols: number[] = [];

      // Sort source columns from right to left so inserting doesn't offset subsequent sources
      const sourceColumnsWithContent = Array.from(new Set(cells.map(c => c.col))).sort((a, b) => b - a);

      for (const srcCol of sourceColumnsWithContent) {
        // Find if next columns have data
        const maxColumnCount = Math.max(0, ...newGrid.map(row => row.length));
        let nextOccupiedCol = -1;
        for (let c = srcCol + 1; c < maxColumnCount; c++) {
          if (newGrid.some(row => (row[c] || '').trim() !== '')) {
            nextOccupiedCol = c;
            break;
          }
        }

        if (nextOccupiedCol >= 0) {
          const availableEmptyCols = nextOccupiedCol - srcCol - 1;
          const missingCols = Math.max(0, 2 - availableEmptyCols);
          if (missingCols > 0) {
            newGrid.forEach(row => row.splice(nextOccupiedCol, 0, ...Array(missingCols).fill('')));
            for (let index = 0; index < updatedCols.length; index++) {
              if (updatedCols[index] >= nextOccupiedCol) updatedCols[index] += missingCols;
            }
            columnInsertions.push({ at: nextOccupiedCol, count: missingCols });
          }
        }

        // Write title & content into srcCol + 1 and srcCol + 2
        for (let r = minR; r <= maxR; r++) {
          const res = splitResults.get(`${r},${srcCol}`);
          if (res) {
            while (newGrid[r].length <= srcCol + 2) newGrid[r].push('');
            newGrid[r][srcCol + 1] = res.title;
            newGrid[r][srcCol + 2] = res.content;
            if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
            if (!updatedCols.includes(srcCol + 2)) updatedCols.push(srcCol + 2);
          }
        }
      }

      const shiftColumn = (originalCol: number) => columnInsertions.reduce(
        (col, insertion) => col >= insertion.at ? col + insertion.count : col,
        originalCol
      );

      // If clearSource is active, delete the original text
      if (clearSource) {
        for (const srcCol of sourceColumnsWithContent) {
          const shiftedCol = shiftColumn(srcCol);
          for (let r = minR; r <= maxR; r++) {
            if (newGrid[r]) {
              newGrid[r][shiftedCol] = '';
            }
          }
          if (!updatedCols.includes(shiftedCol)) updatedCols.push(shiftedCol);
        }
      }

      // Update styles: shift existing styles & highlight source columns
      const shiftedStyles = new Map<string, { bgColor?: string }>();
      gridStyles.forEach((style, key) => {
        const [rowText, colText] = key.split(',');
        const row = Number(rowText);
        const col = Number(colText);
        shiftedStyles.set(cellKey(row, shiftColumn(col)), style);
      });

      if (!clearSource) {
        for (const cell of cells) {
          shiftedStyles.set(cellKey(cell.row, shiftColumn(cell.col)), { bgColor: '#FFA500' });
        }
      } else {
        for (const cell of cells) {
          shiftedStyles.delete(cellKey(cell.row, shiftColumn(cell.col)));
        }
      }

      setGridStyles(shiftedStyles);
      setGridData(newGrid);

      const colsStr = updatedCols.filter(c => c >= 0).sort((a, b) => a - b).map(c => colToLetter(c)).join(', ');
      const shiftNotice = columnInsertions.length > 0 ? '（已自动避让插入列，右侧内容已向右平移）' : '';
      const clearNotice = clearSource ? ' (已删除原始文案)' : '';
      setStatusMsg(`AI 拆分完成！已处理 ${cells.length} 个单元格，结果在列: ${colsStr}${shiftNotice}${clearNotice}`);
    } catch (err: any) {
      setStatusMsg(`AI 拆分失败: ${err.message || '未知错误'}`);
    } finally {
      setAiSplitting(false);
    }
  };

  // 持久化关键状态：切换页面返回时保留文案拆分内容
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const payload: PersistedScriptToolState = {
          gridData,
          selection,
          clearSource,
          gridStyles: Array.from(gridStyles.entries()),
          customPrefix,
          mergeCycle,
          mergeCellSpan,
          diffCols,
          autoRowHeight
        };
        memoryPersistedState = payload;
      } catch {
        // ignore errors
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [gridData, selection, clearSource, gridStyles, customPrefix, mergeCycle, mergeCellSpan, diffCols, autoRowHeight]);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  useEffect(() => {
    const handleGridHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      if (event.shiftKey) redoGridChange();
      else undoGridChange();
    };
    window.addEventListener('keydown', handleGridHistoryShortcut);
    return () => window.removeEventListener('keydown', handleGridHistoryShortcut);
  }, [redoGridChange, undoGridChange]);

  // 实际处理函数
  const doProcess = (tool: ToolType, prefix?: string) => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要处理的单元格区域');
      return;
    }

    // clearSource: false = 保留原文（默认）, true = 删除原文
    const options: ProcessOptions = { clearSource, customPrefix: prefix, lineWidth };
    const { newGrid, updatedCols, columnInsertions } = processGrid(gridData, selection, tool, options);
    setGridData(newGrid);
    const shiftColumn = (originalCol: number) => columnInsertions.reduce(
      (col, insertion) => col >= insertion.at ? col + insertion.count : col,
      originalCol
    );
    const shiftedStyles = new Map<string, { bgColor?: string }>();
    gridStyles.forEach((style, key) => {
      const [rowText, colText] = key.split(',');
      const row = Number(rowText);
      const col = Number(colText);
      shiftedStyles.set(cellKey(row, shiftColumn(col)), style);
    });

    // 标记原列为橙色（拆分操作时，且保留原文）
    // 只有保留原文时才标记，因为删除原文后颜色没有意义
    if ((tool === ToolType.SplitThree || tool === ToolType.SplitTwo || tool === ToolType.SmartSplit) && !clearSource) {
      const minR = Math.min(selection.start.row, selection.end.row);
      const maxR = Math.max(selection.start.row, selection.end.row);
      const minC = Math.min(selection.start.col, selection.end.col);
      const maxC = Math.max(selection.start.col, selection.end.col);

      const newStyles = new Map(shiftedStyles);
      // 标记有内容的原列为橙色
      for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
          const val = gridData[r]?.[c] || '';
          if (val.trim()) {
            newStyles.set(cellKey(r, shiftColumn(c)), { bgColor: '#FFA500' }); // 橙色
          }
        }
      }
      setGridStyles(newStyles);
    } else if (clearSource) {
      // 如果删除原文，清除原列的颜色标记
      const minR = Math.min(selection.start.row, selection.end.row);
      const maxR = Math.max(selection.start.row, selection.end.row);
      const minC = Math.min(selection.start.col, selection.end.col);
      const maxC = Math.max(selection.start.col, selection.end.col);

      const newStyles = new Map(shiftedStyles);
      for (let c = minC; c <= maxC; c++) {
        for (let r = minR; r <= maxR; r++) {
          newStyles.delete(cellKey(r, shiftColumn(c)));
        }
      }
      setGridStyles(newStyles);
    } else if (columnInsertions.length > 0) {
      setGridStyles(shiftedStyles);
    }

    // 根据工具类型显示不同的提示
    let toolMsg = '';
    if (tool === ToolType.ClearChinese) {
      // Parse stats from updatedCols (negative values are stats)
      let deletedCount = 0;
      let punctuationOnlyCount = 0;
      const realCols: number[] = [];

      for (const col of updatedCols) {
        if (col <= -2000) {
          punctuationOnlyCount = -(col + 2000);
        } else if (col <= -1000) {
          deletedCount = -(col + 1000);
        } else {
          realCols.push(col);
        }
      }

      let msg = `已删除 ${deletedCount} 个含中文汉字的单元格`;
      if (punctuationOnlyCount > 0) {
        msg += `（另有 ${punctuationOnlyCount} 个单元格仅含中文标点，已保留）`;
      }
      if (deletedCount === 0 && punctuationOnlyCount === 0) {
        msg = '选区内没有找到中文内容';
      }
      toolMsg = msg;
    } else if (tool === ToolType.AddPromptPrefix) {
      // Parse stats from updatedCols
      let totalAdded = 0;
      for (const col of updatedCols) {
        if (col <= -3000 && col > -4000) {
          totalAdded = -(col + 3000);
        }
      }
      const prefixUsed = prefix || 'prompt';
      toolMsg = `已为 ${totalAdded} 个单元格添加 ${prefixUsed}- 前缀`;
    } else if (tool === ToolType.MultiPanelPrompt) {
      // Parse panel count from updatedCols
      let panelCount = 0;
      for (const col of updatedCols) {
        if (col <= -4000) {
          panelCount = -(col + 4000);
        }
      }
      const colsStr = updatedCols.filter(c => c >= 0).map(c => colToLetter(c)).join(', ');
      toolMsg = panelCount > 0
        ? `已生成 ${panelCount} 画面分割图提示词，结果在列: ${colsStr}`
        : `选区内没有找到内容`;
    } else if (tool === ToolType.CleanTails) {
      let cleanedCount = 0;
      for (const col of updatedCols) {
        if (col <= -5000 && col > -6000) {
          cleanedCount = -(col + 5000);
        }
      }
      toolMsg = cleanedCount > 0
        ? `已清理 ${cleanedCount} 个单元格的尾部标签/水印`
        : `选区内没有发现需要清理的尾部标签/水印`;
    } else if (tool === ToolType.CleanEmojis) {
      let cleanedCount = 0;
      for (const col of updatedCols) {
        if (col <= -6000 && col > -7000) {
          cleanedCount = -(col + 6000);
        }
      }
      toolMsg = cleanedCount > 0
        ? `已清理 ${cleanedCount} 个单元格中的表情符号`
        : `选区内没有发现表情符号`;
    } else {
      const colsStr = updatedCols.filter(c => c >= 0).map(c => colToLetter(c)).join(', ');
      const clearMsg = clearSource ? ' (已删除原文案)' : '';
      const insertedCount = columnInsertions.reduce((sum, insertion) => sum + insertion.count, 0);
      const insertMsg = insertedCount > 0 ? `，已自动补充 ${insertedCount} 列防止覆盖` : '';
      toolMsg = `已处理选区，结果更新于列: ${colsStr}${insertMsg}${clearMsg}`;
    }
    setStatusMsg(toolMsg);
  };

  // 入口函数：对于 AddPromptPrefix / AutoWrap 显示弹窗，其他工具直接处理
  const handleProcess = (tool: ToolType) => {
    if (!selection) {
      setStatusMsg('请先用鼠标框选要处理的单元格区域');
      return;
    }
    if (tool === ToolType.AddPromptPrefix) {
      setShowPrefixModal(true);
    } else if (tool === ToolType.AutoWrap) {
      setShowWrapModal(true);
    } else {
      doProcess(tool);
    }
  };

  // 确认添加前缀
  const handleConfirmPrefix = () => {
    setShowPrefixModal(false);
    doProcess(ToolType.AddPromptPrefix, customPrefix);
  };

  // 确认自动断行
  const handleConfirmWrap = () => {
    setShowWrapModal(false);
    doProcess(ToolType.AutoWrap);
  };

  const getContentBounds = (
    minR: number,
    maxR: number,
    minC: number,
    maxC: number
  ): { minR: number; maxR: number; minC: number; maxC: number } | null => {
    let found = false;
    let contentMinR = maxR;
    let contentMaxR = minR;
    let contentMinC = maxC;
    let contentMaxC = minC;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (gridData[r]?.[c]?.trim()) {
          found = true;
          contentMinR = Math.min(contentMinR, r);
          contentMaxR = Math.max(contentMaxR, r);
          contentMinC = Math.min(contentMinC, c);
          contentMaxC = Math.max(contentMaxC, c);
        }
      }
    }

    if (!found) return null;
    return { minR: contentMinR, maxR: contentMaxR, minC: contentMinC, maxC: contentMaxC };
  };

  const copyRange = async (
    range: { minR: number; maxR: number; minC: number; maxC: number } | null,
    mode: 'all' | 'selection'
  ) => {
    if (!range) {
      setStatusMsg(mode === 'all' ? '没有可复制的内容' : '选区内没有可复制的内容');
      return;
    }

    const subGrid: GridData = [];
    for (let r = range.minR; r <= range.maxR; r++) {
      const row: string[] = [];
      for (let c = range.minC; c <= range.maxC; c++) {
        row.push(gridData[r]?.[c] || '');
      }
      subGrid.push(row);
    }

    const text = formatForClipboard(subGrid);
    const html = buildGoogleSheetsHtml(subGrid, {
      styles: gridStyles,
      rowOffset: range.minR,
      colOffset: range.minC,
      includeEmptyRows: false
    });

    const result = await copyToClipboard(text, html);
    if (result === 'rich') {
      if (mode === 'all') {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopiedSelection(true);
        setTimeout(() => setCopiedSelection(false), 2000);
      }
      setStatusMsg(`已复制内容: ${colToLetter(range.minC)}${range.minR + 1}:${colToLetter(range.maxC)}${range.maxR + 1}`);
      return;
    }

    if (result === 'text') {
      if (mode === 'all') {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopiedSelection(true);
        setTimeout(() => setCopiedSelection(false), 2000);
      }
      setStatusMsg(`已复制（纯文本）: ${colToLetter(range.minC)}${range.minR + 1}:${colToLetter(range.maxC)}${range.maxR + 1}`);
      return;
    }

    setStatusMsg('复制失败');
  };

  const handleCopyAll = async () => {
    const maxR = Math.max(0, gridData.length - 1);
    const maxC = Math.max(0, ...gridData.map(row => Math.max(0, (row?.length || 0) - 1)));
    const contentBounds = getContentBounds(0, maxR, 0, maxC);
    await copyRange(contentBounds, 'all');
  };

  const handleCopySelection = async () => {
    if (!selection) {
      setStatusMsg('请先框选要复制的区域');
      return;
    }
    const minR = Math.min(selection.start.row, selection.end.row);
    const maxR = Math.max(selection.start.row, selection.end.row);
    const minC = Math.min(selection.start.col, selection.end.col);
    const maxC = Math.max(selection.start.col, selection.end.col);
    const contentBounds = getContentBounds(minR, maxR, minC, maxC);
    await copyRange(contentBounds, 'selection');
  };

  const handleSelectAll = () => {
    // Select all cells with content
    let maxRow = 0;
    let maxCol = 0;
    for (let r = 0; r < gridData.length; r++) {
      for (let c = 0; c < (gridData[r]?.length || 0); c++) {
        if (gridData[r][c]?.trim()) {
          maxRow = Math.max(maxRow, r);
          maxCol = Math.max(maxCol, c);
        }
      }
    }
    const newSelection = {
      start: { row: 0, col: 0 },
      end: { row: maxRow, col: maxCol }
    };
    setForceSelection(newSelection); // 触发子组件更新
    setSelection(newSelection); // 同步父组件状态
    setStatusMsg(`已选中全部内容: A1:${colToLetter(maxCol)}${maxRow + 1}`);
  };

  const handleClearGrid = () => {
    const nextGrid =
      gridData.length > 0
        ? gridData.map(row => row.map(() => ''))
        : createEmptyGrid();
    setGridData(nextGrid);
    setGridStyles(new Map());
    setDiffCols({});
    setSelection(null);
    setForceSelection(null);
    setCopied(false);
    setCopiedSelection(false);
    setStatusMsg('已清空表格文字与背景标记（保留表格结构）');
  };

  const getSelectionLabel = () => {
    if (!selection) return null;
    const minR = Math.min(selection.start.row, selection.end.row) + 1;
    const maxR = Math.max(selection.start.row, selection.end.row) + 1;
    const minC = colToLetter(Math.min(selection.start.col, selection.end.col));
    const maxC = colToLetter(Math.max(selection.start.col, selection.end.col));

    if (minR === maxR && minC === maxC) return `${minC}${minR}`;
    return `${minC}${minR}:${maxC}${maxR}`;
  };
  const compareFirstTwoColumns = useCallback(() => {
    const normalizeForCompare = (value: unknown) => String(value ?? '')
      .replace(/[\s\u00A0\u200B\uFEFF]+/g, '')
      .trim();
    let compared = 0;
    let different = 0;
    setGridData(current => current.map(row => {
      const next = [...row];
      while (next.length < 3) next.push('');
      const left = normalizeForCompare(next[0]);
      const right = normalizeForCompare(next[1]);
      if (!left && !right) {
        next[2] = '';
      } else {
        compared++;
        const same = left === right;
        if (!same) different++;
        next[2] = same ? '相同' : '不同';
      }
      return next;
    }));
    setStatusMsg(`已比对 A、B 两列：${compared} 行，${different} 行不同（已忽略空格和断行）`);
  }, [setGridData]);
  const canUndoGrid = gridHistoryVersion >= 0 && gridUndoStackRef.current.length > 0;
  const canRedoGrid = gridHistoryVersion >= 0 && gridRedoStackRef.current.length > 0;

  return (
    <div className="script-tool-app tool-container" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0', minHeight: '100vh' }}>
      {copyToast && typeof document !== 'undefined' && createPortal(
        <div className={`fixed bottom-6 left-1/2 z-[9999] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-md border px-5 py-3 text-sm font-medium text-white shadow-2xl ${copyToast.type === 'success' ? 'border-emerald-300 bg-emerald-600' : 'border-red-300 bg-red-600'}`} role="status">
          {copyToast.type === 'success' ? <Check className="h-5 w-5 shrink-0" /> : <Info className="h-5 w-5 shrink-0" />}
          <span>{copyToast.message}</span>
        </div>,
        document.body
      )}
      {/* Toolbar */}
      <header className="hidden" style={{ overflow: 'visible' }}>
        <div className="flex flex-col gap-3">

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-[#107c41] p-1.5 rounded text-white shadow-sm">
                <Grid3X3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-medium text-slate-800 leading-tight">文案加工站</h1>
                <p className="text-[10px] text-slate-500">类 Google Sheets 编辑器</p>
              </div>
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] text-slate-600">
                <MousePointer2 className="w-3.5 h-3.5" />
                <span>选区：</span>
                <span className="font-medium text-slate-700">{selection ? getSelectionLabel() : '未选择'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                <Button variant="secondary" onClick={undoGridChange} disabled={!canUndoGrid} title="撤销上一步表格操作（Ctrl/Cmd+Z）" className="inline-flex items-center justify-center" style={{ width: '2rem', height: '2rem', flex: '0 0 2rem', padding: 0 }}>
                  <Undo2 className="h-4 w-4 shrink-0" />
                </Button>
                <Button variant="secondary" onClick={redoGridChange} disabled={!canRedoGrid} title="重做表格操作（Ctrl/Cmd+Shift+Z）" className="inline-flex items-center justify-center" style={{ width: '2rem', height: '2rem', flex: '0 0 2rem', padding: 0 }}>
                  <Redo2 className="h-4 w-4 shrink-0" />
                </Button>
                <Button variant="primary" onClick={handleSelectAll} className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white border-transparent text-xs whitespace-nowrap px-3 py-1.5 leading-none transition-all hover:shadow-md hover:shadow-blue-500/35">
                  <CheckSquare className="w-3.5 h-3.5 mr-1" />
                  选中全部
                </Button>
                <Button variant="primary" onClick={handleCopyAll} className="inline-flex items-center justify-center bg-[#107c41] hover:bg-[#0b6a37] text-white border-transparent text-xs whitespace-nowrap px-3 py-1.5 leading-none transition-all hover:shadow-md hover:shadow-emerald-500/35">
                  {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied ? '已复制' : '复制全部'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCopySelection}
                  disabled={!selection}
                  className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white border-transparent text-xs whitespace-nowrap px-3 py-1.5 leading-none transition-all hover:shadow-md hover:shadow-cyan-500/25 disabled:opacity-100 disabled:bg-slate-800 disabled:text-slate-400 disabled:border-slate-700 disabled:shadow-none"
                >
                  {copiedSelection ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedSelection ? '已复制' : '复制选中'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleClearGrid}
                  className="inline-flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white border-transparent text-xs whitespace-nowrap px-3 py-1.5 leading-none transition-all hover:shadow-md hover:shadow-slate-500/25"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  清空表格
                </Button>
                <Button
                  variant="primary"
                  onClick={compareFirstTwoColumns}
                  title="比较 A、B 两列，忽略空格、换行和制表符，结果写入 C 列"
                  className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white border-transparent text-xs whitespace-nowrap px-3 py-1.5 leading-none"
                >
                  <Check className="w-3.5 h-3.5 mr-1" /> 对比 A/B → C
                </Button>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-xs text-slate-500">删除原文</span>
                <button
                  onClick={() => setClearSource(!clearSource)}
                  data-tip={clearSource ? '拆分后删除原始文案' : '拆分后保留原始文案（默认）'}
                  className={`tooltip-bottom relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${clearSource ? 'bg-red-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${clearSource ? 'switch-on' : 'switch-off'}`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-xs text-slate-500">自动行高</span>
                <button
                  onClick={() => setAutoRowHeight(!autoRowHeight)}
                  data-tip={autoRowHeight ? '点击关闭自动行高撑开' : '点击开启内容自动撑开行高'}
                  className={`tooltip-bottom relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRowHeight ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoRowHeight ? 'switch-on' : 'switch-off'}`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <ToolButton
              icon={<Columns className="w-4 h-4" />}
              label="拆分三段 (标/内/尾)"
              tooltip="把选区按 标题/正文/尾句 三列拆分到新列"
              onClick={() => handleProcess(ToolType.SplitThree)}
              disabled={!selection}
            />
            <ToolButton
              icon={<div className="flex gap-0.5 scale-75"><div className="w-1 h-4 bg-current rounded-sm"></div><div className="w-1 h-4 bg-current rounded-sm"></div></div>}
              label="拆分两段 (标/内)"
              tooltip="把选区按 标题/正文 两列拆分到新列"
              onClick={() => handleProcess(ToolType.SplitTwo)}
              disabled={!selection}
            />
            <ToolButton
              icon={<Zap className="w-4 h-4" />}
              label="半智能拆分"
              tooltip="半智能拆分标题：优先换行 → 冒号 → 祈祷关键词(Dear God等) → 英文句号"
              onClick={() => handleProcess(ToolType.SmartSplit)}
              disabled={!selection}
            />
            <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900/80">
              <button
                type="button"
                onClick={handleAiSplit}
                disabled={!selection || aiSplitting || !getAiInstance}
                data-tip="AI 智能识别标题并安全平移插入列，100%保留原文（需要 API Key）"
                className={`
                  tooltip-bottom inline-flex items-center gap-1 px-2 py-1 transition-colors text-xs font-semibold whitespace-nowrap leading-none
                  rounded-l-md
                  ${(!selection || aiSplitting || !getAiInstance)
                    ? 'cursor-not-allowed text-slate-500'
                    : 'text-slate-200 hover:bg-emerald-900/25 hover:text-emerald-200'
                  }
                `}
              >
                <Sparkles className="w-4 h-4" />
                <span>{aiSplitting ? 'AI 分析中...' : '🤖 AI 拆分'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAiPromptModal(true)}
                data-tip="配置 AI 拆分提示词指令 (Prompt)"
                className="tooltip-bottom px-1.5 py-1 text-slate-400 hover:text-emerald-300 hover:bg-emerald-900/30 border-l border-slate-700/80 transition-colors rounded-r-md flex items-center justify-center"
                title="配置 AI 拆分提示词指令"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
            <ToolButton
              icon={<WrapText className="w-4 h-4" />}
              label="清理换行"
              tooltip="清除多余换行，按句号转换为一行一句"
              onClick={() => handleProcess(ToolType.CleanBreaks)}
              disabled={!selection}
            />
            <ToolButton
              icon={<ListOrdered className="w-4 h-4" />}
              label="排比句排列"
              tooltip="自动提取并排列带序号/英文序数的排比句（保留前言和结尾的原始换行）"
              onClick={() => handleProcess(ToolType.ArrangeParallel)}
              disabled={!selection}
            />
            <ToolButton
              icon={<Video className="w-4 h-4" />}
              label="视频提示词"
              tooltip="将选区内容统一格式化为视频提示词模板"
              onClick={() => handleProcess(ToolType.VideoPrompts)}
              disabled={!selection}
            />
            <ToolButton
              icon={<LayoutGrid className="w-4 h-4" />}
              label="多画面提示词"
              tooltip="将每个单元格内容生成多画面分割图描述格式（画面1、画面2...）"
              onClick={() => handleProcess(ToolType.MultiPanelPrompt)}
              disabled={!selection}
            />
            <ToolButton
              icon={<Eraser className="w-4 h-4" />}
              label="清理尾部"
              tooltip="自动清理结尾的 @某人 标签或 Veo 等水印单词"
              onClick={() => handleProcess(ToolType.CleanTails)}
              disabled={!selection}
            />
            <ToolButton
              // Use a text emoji as an icon
              icon={<span className="w-4 h-4 inline-flex items-center justify-center text-sm">🧹</span>}
              label="清理表情"
              tooltip="自动删除文本中的 emoji 表情图标和特殊符号"
              onClick={() => handleProcess(ToolType.CleanEmojis)}
              disabled={!selection}
            />
            <ToolButton
              icon={<AlignLeft className="w-4 h-4" />}
              label="自动断行"
              tooltip="按最高 18 个字符智能断行排版，保留英语单词完整"
              onClick={() => handleProcess(ToolType.AutoWrap)}
              disabled={!selection}
            />
            <ToolButton
              icon={<FileInput className="w-4 h-4" />}
              label="模板拆分"
              tooltip="按单词或字符拆分文案，并自动填充到描述词模板的内容块"
              onClick={() => setShowTemplateSplitter(true)}
            />
            <ToolButton
              icon={<Languages className="w-4 h-4" />}
              label="删除中文"
              tooltip="删除选中区域内包含中文的单元格（保留纯外文）"
              onClick={() => handleProcess(ToolType.ClearChinese)}
              disabled={!selection}
            />
            <ToolButton
              icon={<Hash className="w-4 h-4" />}
              label="Opal 序号"
              tooltip="给每个单元格内容前面添加 prompt-序号（用于 Opal 自动化）"
              onClick={() => handleProcess(ToolType.AddPromptPrefix)}
              disabled={!selection}
            />
            <ToolButton
              icon={<Combine className="w-4 h-4" />}
              label="合并列"
              tooltip="将多列数据按循环数合并（如3列一循环：D-F并入A-C下方）"
              onClick={handleMergeColumns}
              disabled={!selection}
            />
            <ToolButton
              icon={<Columns className="w-4 h-4" />}
              label="拆分列"
              tooltip="将选区按指定行数分组，横向拆分排列为多列（如500行按每10行一组横向拆为50列）"
              onClick={handleSplitColumns}
              disabled={!selection}
            />
            <ToolButton
              icon={<span className="w-4 h-4 inline-flex items-center justify-center text-xs font-bold">→1</span>}
              label="多列合一"
              tooltip="将选区每行的多列内容合并到第一列，用顿号（、）分隔"
              onClick={handleMergeRowContent}
              disabled={!selection}
            />
            <ToolButton
              icon={<Link2 className="w-4 h-4" />}
              label="链接枚举"
              tooltip="枚举链接里小写 l 与大写 I 的所有可能组合，结果写入右侧一列"
              onClick={handleOpenLinkVariantModal}
            />
            <ToolButton
              icon={<span className="w-4 h-4 inline-flex items-center justify-center text-xs font-bold">⊞</span>}
              label="合并单元格"
              tooltip="将选区每列数据生成合并单元格格式（跨N列），结果写入右侧并自动复制到剪贴板"
              onClick={handleOpenMergeCellModal}
              disabled={!selection}
            />
            <ToolButton
              icon={<span className="w-4 h-4 inline-flex items-center justify-center text-xs font-bold">✝</span>}
              label="文案检查修正"
              tooltip="检查信仰词汇大写与拼写错误，在右侧生成修正结果与反馈报告，可自定义大写词汇列表"
              onClick={handleOpenDeityModal}
              disabled={!selection}
            />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 bg-white">
              <span className="text-xs font-medium text-slate-600">AI模型:</span>
              <select
                value={localModel}
                onChange={e => {
                  const v = e.target.value;
                  setLocalModel(v);
                  try { localStorage.setItem(LOCAL_MODEL_KEY, v); } catch {}
                }}
                className="text-xs border border-slate-300 rounded px-1.5 py-1 bg-white text-slate-700"
                style={{ maxWidth: '220px' }}
              >
                {MODEL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.value === INHERIT_VALUE ? `${o.label} (${textModel})` : o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Status Bar / Hints */}
        <div className="mt-1 flex items-center justify-between text-xs">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${statusMsg || selection ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'}`}>
            {selection ? <MousePointer2 className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
            <span className="font-medium">
              {statusMsg || (selection
                ? `当前选区：${getSelectionLabel()}。点击上方工具处理选区。`
                : '提示：支持 Ctrl+C 复制，Delete 删除，Ctrl+V 粘贴。拖拽可框选区域。')}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="hidden" style={{ minHeight: 0 }}>
        <SpreadsheetGrid
          data={gridData}
          onChange={setGridData}
          onSelectionChange={setSelection}
          externalSelection={forceSelection}
          cellStyles={gridStyles}
          diffColumns={diffCols}
          autoRowHeight={autoRowHeight}
        />
      </main>

      {showTemplateSplitter && (
        <div className="prefix-modal-overlay" style={{ position: 'static', minHeight: '100vh', alignItems: 'stretch', overflow: 'hidden', padding: 0, backgroundColor: '#080e1b' }}>
          <div className="bg-[#0b1329] text-slate-100 flex flex-col" style={{ width: '100%', height: '100vh', minHeight: '750px' }}>
            <div className="px-6 py-3.5 border-b border-slate-800 bg-[#111c38] flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">模板拆分与批量编辑</h3>
                  {activeMultiPresets.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                      已启用 {activeMultiPresets.length} 个预设并行填充
                    </span>
                  )}
                  {attachedImages.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-950/80 text-sky-300 border border-sky-500/40">
                      已绑定 {attachedImages.length} 张图片
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">内容块默认插入为 {QUOTED_CONTENT_PLACEHOLDER}，可放在描述词的任意位置；支持从本地拖入图片按文件名排序自动匹配</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportProjectSession}
                  disabled={isExportingProject}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-200 bg-emerald-900/90 hover:bg-emerald-800 border border-emerald-500/60 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="将当前文案、拆分分镜、所有离线图片实体、预设与作业进度完整打包导出为工程文件（方便下次恢复）"
                >
                  {isExportingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>保存工程记录</span>
                </button>

                <button
                  type="button"
                  onClick={() => projectFileInputRef.current?.click()}
                  disabled={isImportingProject}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-sky-200 bg-sky-900/90 hover:bg-sky-800 border border-sky-500/60 shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="从本地电脑导入之前保存的工程文件，完全还原所有文案、分镜、图片与设置"
                >
                  {isImportingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                  <span>恢复工程记录</span>
                </button>

                <input
                  ref={projectFileInputRef}
                  type="file"
                  accept=".json,.aitkproj,.aitk"
                  className="hidden"
                  onChange={handleImportProjectSession}
                />

                <button
                  type="button"
                  onClick={() => setShowQuickImagePrompt(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-sm transition cursor-pointer"
                  title="放图 + 贴文案（可不填）+ 选预设，直接生成图＋词表格，不影响当前工作区"
                >
                  <Zap className="w-4 h-4" />
                  快捷图＋词
                </button>
                <button
                  type="button"
                  onClick={() => setShowPresetLibraryModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm transition cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  预设库 ({templatePresets.length})
                </button>
                <span className="px-2.5 py-1 text-xs font-medium text-slate-500">独立工作台</span>
              </div>
            </div>

            {/* 独立多标签页控制栏 */}
            <WorkspaceTabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={handleSelectTab}
              onCreateTab={handleCreateTab}
              onCloseTab={handleCloseTab}
              onRenameTab={handleRenameTab}
              onDuplicateTab={handleDuplicateTab}
              onClearAllTabs={() => handleResetAllTabs(false)}
              onDeleteAllTabs={() => handleResetAllTabs(true)}
            />

            {/* 左右分栏工作台主容器 */}
            <div className="flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden">
              {/* 左侧设置面板：所有拆分规则集中在此处，素材管理作为附属能力保留 */}
              {sidebarCollapsed ? (
                <div className="w-11 shrink-0 border-r border-slate-800 bg-[#0a1222] flex flex-col items-center py-3 gap-3 select-none">
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(false)}
                    className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="展开左侧素材与参数面板"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="text-[11px] font-semibold text-slate-500 tracking-widest flex items-center gap-1.5 mt-2 [writing-mode:vertical-rl]">
                    <Sliders className="w-3.5 h-3.5 text-blue-400 rotate-90" />
                    素材与参数
                  </div>
                  {attachedImages.length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-300 border border-blue-700/60 text-[10px] flex items-center justify-center font-bold">
                      {attachedImages.length}
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-80 xl:w-88 shrink-0 border-r border-slate-800 bg-[#0a1222] flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
                  {/* 折叠收起标题栏 */}
                  <div className="px-3 py-2.5 border-b border-slate-800/80 flex items-center justify-between bg-[#0e172a] shrink-0 sticky top-0 z-10">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      <span>拆分设置面板</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSidebarCollapsed(true)}
                      className="px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex items-center gap-1 text-[11px] font-medium border border-transparent hover:border-slate-700"
                      title="折叠侧边栏，获得最大分镜表格视野"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>收起</span>
                    </button>
                  </div>

                  {/* 1. 素材图片区 (variant="sidebar") */}
                  <ImageDropZone
                    variant="sidebar"
                    images={attachedImages}
                    onImagesChange={handleAttachedImagesChange}
                    bindingMode={imageBindingMode}
                    onBindingModeChange={handleImageBindingModeChange}
                    batchTemplateMode={batchTemplateMode}
                    totalSegmentsCount={templateSegments.length}
                    totalCopiesCount={batchTemplateMode ? batchTemplateDrafts.length : 1}
                    copiedImageIds={copiedImageIds}
                    onImageCopied={(imgId) => {
                      setCopiedImageIds(prev => new Set(prev).add(imgId));
                    }}
                    onToggleImageCopied={(imgId) => {
                      setCopiedImageIds(prev => {
                        const next = new Set(prev);
                        if (next.has(imgId)) next.delete(imgId);
                        else next.add(imgId);
                        return next;
                      });
                    }}
                    onAssignDocuments={() => imageBindingMode === 'per-copy' ? setImageOrderSourceIndex(-1) : setShowImageGroupAssignment(true)}
                  />

                  {/* 2. 拆分参数与操作面板 (SplitControlSidebar) */}
                  <div className="shrink-0 border-b border-slate-800 px-3 pt-3">
                    <CustomTemplateCopyGenerator onInsert={insertZeroTemplateDrafts} />
                  </div>
                  <SplitControlSidebar
                    templateSplitStrategy={templateSplitStrategy}
                    setTemplateSplitStrategy={setTemplateSplitStrategy}
                    splitUnit={splitUnit}
                    setSplitUnit={setSplitUnit}
                    splitMinimum={splitMinimum}
                    setSplitMinimum={setSplitMinimum}
                    splitMaximum={splitMaximum}
                    setSplitMaximum={setSplitMaximum}
                    keepSentences={keepSentences}
                    setKeepSentences={setKeepSentences}
                    sentencePauseOnly={sentencePauseOnly}
                    setSentencePauseOnly={setSentencePauseOnly}
                    allowTolerance={allowTolerance}
                    setAllowTolerance={setAllowTolerance}
                    splitTolerance={splitTolerance}
                    setSplitTolerance={setSplitTolerance}
                    lineWidth={lineWidth}
                    setLineWidth={setLineWidth}
                    quoteSplitSegments={quoteSplitSegments}
                    setQuoteSplitSegments={setQuoteSplitSegments}
                    lowercaseSplitOutput={lowercaseSplitOutput}
                    setLowercaseSplitOutput={setLowercaseSplitOutput}
                    includeBatchTextNumbering={includeBatchTextNumbering}
                    setIncludeBatchTextNumbering={setIncludeBatchTextNumbering}
                    includeBatchPromptNumbering={includeBatchPromptNumbering}
                    setIncludeBatchPromptNumbering={setIncludeBatchPromptNumbering}
                    batchNumberStyle={batchNumberStyle}
                    setBatchNumberStyle={setBatchNumberStyle}
                    includeBatchEmptyLines={includeBatchEmptyLines}
                    setIncludeBatchEmptyLines={setIncludeBatchEmptyLines}
                    batchTemplateMode={batchTemplateMode}
                    setBatchTemplateMode={(enabled) => {
                      setBatchTemplateMode(enabled);
                      if (enabled && templateSource.trim() && batchTemplateDrafts.length === 1 && !batchTemplateDrafts[0].source.trim()) {
                        setBatchTemplateDrafts([{ ...batchTemplateDrafts[0], source: templateSource }]);
                      }
                      if (!enabled) {
                        setPerSourceTemplateMode(false);
                        setActiveBatchSourceIndex(null);
                      }
                    }}
                    onConvertNumbersToWords={handleConvertNumbersToWords}
                    onSplitByNewlines={handleSplitByNewlines}
                    onApply8sPreset={apply8sSermonPreset}
                    onOpenAiSegmentPrompt={() => setShowAiSegmentPromptModal(true)}
                    aiModel={localModel}
                    onAiModelChange={(model) => {
                      setLocalModel(model);
                      try { localStorage.setItem(LOCAL_MODEL_KEY, model); } catch {}
                    }}
                    aiModelOptions={MODEL_OPTIONS.map(option => ({
                      value: option.value,
                      label: option.value === INHERIT_VALUE ? `${option.label} (${textModel})` : option.label
                    }))}
                  />
                </div>
              )}

              {/* 右侧主工作区：文案编辑 + 分镜表格 */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto bg-[#080e1b]">
                {/* 文案与模板折叠控制栏 */}
                <div className="px-4 py-1.5 border-b border-slate-800 bg-[#0c1426] flex items-center justify-between text-xs text-slate-400 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">
                      {batchTemplateMode ? '批量文案与描述词' : '文案与描述词模板'}
                    </span>
                    {templateSource.trim() && (
                      <span className="text-[11px] text-slate-400">
                        ({templateSource.length} 字 / 约 {templateSource.split(/\s+/).filter(Boolean).length} 词)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditorsCollapsed(prev => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
                    title={editorsCollapsed ? '展开文案与模板编辑框' : '收起文案区，为分镜表格留出更多可视空间'}
                  >
                    {editorsCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-sky-400" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{editorsCollapsed ? '展开编辑框' : '收起编辑框'}</span>
                  </button>
                </div>

                <div className={`${editorsCollapsed || batchTemplateMode ? 'hidden' : 'grid'} p-4 border-b border-slate-800 bg-[#0d172e] grid-cols-1 xl:grid-cols-2 gap-4 shrink-0`}>
              <label className="rounded-xl border border-slate-700/80 bg-[#101d36] p-3 text-xs font-medium text-slate-300 shadow-sm">
                <span className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-200">{batchTemplateMode ? '批量原始文案' : '原始文案'}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportSegmentsModal(true);

                      }}
                      className="rounded border border-emerald-500/50 bg-emerald-950/70 hover:bg-emerald-900/90 px-2.5 py-1 text-[11px] font-bold text-emerald-200 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                      title="从谷歌表格 (Google Sheets) 粘贴多行单元格或已拆分分镜，支持同时载入多篇并自动清洗引号进行二次加工"
                    >
                      <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
                      表格导入 / 粘贴
                    </button>
                    <EditorTextToolsDropdown
                      onInsertManualSplitMarker={insertManualSplitMarker}
                      onRunManualPointSplit={runManualPointSplit}
                      onInsertBatchSourceMarker={insertBatchSourceMarker}
                      batchTemplateMode={batchTemplateMode}
                    />
                    <button
                      type="button"
                      onClick={() => { setEditorValue('source', ''); setTemplateSegments([]); setStatusMsg('已清空原始文案，描述词模板已保留'); }}
                      className="rounded border border-slate-700 bg-slate-800/80 hover:bg-rose-950/60 hover:border-rose-700/50 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-rose-300 transition cursor-pointer"
                      title="清空原始文案输入框"
                    >
                      清空
                    </button>
                    <div className="inline-flex items-center rounded border border-slate-700 bg-slate-800/80 overflow-hidden">
                      <button type="button" title="撤销" onClick={() => undoEditor('source')} className="p-1 text-slate-400 hover:text-white transition"><Undo2 className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-3 bg-slate-700" />
                      <button type="button" title="重做" onClick={() => redoEditor('source')} className="p-1 text-slate-400 hover:text-white transition"><Redo2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <button type="button" onClick={() => setExpandedEditor('source')} title="双击或点击放大编辑" className="text-slate-400 hover:text-white p-1 transition"><Maximize2 className="w-3.5 h-3.5" /></button>
                  </span>
                </span>
                <HighlightedTextarea ref={templateSourceRef} onDoubleClick={() => setExpandedEditor('source')} onKeyDown={e => handleEditorShortcut(e, 'source')} onPaste={handleTemplateSourcePaste} className="mt-1 w-full min-h-28 border border-slate-700 bg-[#131f3b] text-slate-100 placeholder:text-slate-500 rounded-md p-2 text-sm resize-y outline-none focus:border-sky-500" value={templateSource} onChange={e => setEditorValue('source', e.target.value)} placeholder={batchTemplateMode ? '可直接从谷歌表格粘贴：一个单元格作为一篇文案' : `输入完整文案；手动拆分点会显示为 ${MANUAL_SPLIT_MARKER}`} title="双击放大编辑" />
                <span className="mt-1 block text-[11px] font-normal text-slate-400">从谷歌表格粘贴多个单元格时，会自动开启批量模式，并保留单元格内部换行与空行。</span>
              </label>
              <label className="rounded-xl border border-indigo-500/30 bg-[#101d36] p-3 text-xs font-medium text-slate-300 shadow-sm">
                <span className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-200">完整描述词模板</span>
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={insertContentPlaceholder}
                      className="inline-flex items-center gap-1 rounded border border-indigo-500/40 bg-indigo-950/60 hover:bg-indigo-900/80 px-2 py-1 text-[11px] font-medium text-indigo-300 transition cursor-pointer"
                      title="在光标处插入 {{内容}} 占位符"
                    >
                      <FileInput className="w-3.5 h-3.5 text-indigo-400" />
                      + 插入内容块
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!promptTemplate.trim()) return;
                        const res = detectAndInsertPlaceholder(promptTemplate, QUOTED_CONTENT_PLACEHOLDER);
                        setEditorValue('template', res.template);
                        setStatusMsg(res.insertionType === 'already-present' ? '当前模板已包含内容块' : '已自动在首个空行/断行处插入内容块');
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 transition cursor-pointer"
                      title="自动识别第 1 个空行或断行，插入 {{内容}}"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      自动设内容块
                    </button>
                    <div className="inline-flex items-center rounded border border-slate-700 bg-slate-800/80 overflow-hidden">
                      <button type="button" title="撤销" onClick={() => undoEditor('template')} className="p-1 text-slate-400 hover:text-white transition"><Undo2 className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-3 bg-slate-700" />
                      <button type="button" title="重做" onClick={() => redoEditor('template')} className="p-1 text-slate-400 hover:text-white transition"><Redo2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <button type="button" onClick={() => setExpandedEditor('template')} title="双击或点击放大编辑" className="text-slate-400 hover:text-white p-1 transition"><Maximize2 className="w-3.5 h-3.5" /></button>
                  </span>
                </span>
                <HighlightedTextarea
                  ref={promptTemplateRef}
                  onDoubleClick={() => setExpandedEditor('template')}
                  onKeyDown={e => handleEditorShortcut(e, 'template')}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    if (!text) return;
                    if (text.includes('\t')) {
                      const [col1, ...rest] = text.split('\t');
                      const col2 = rest.join('\t');
                      if (col1.trim() && !presetName) setPresetName(col1.trim());
                      if (col2.trim()) {
                        e.preventDefault();
                        const res = detectAndInsertPlaceholder(col2.trim(), QUOTED_CONTENT_PLACEHOLDER);
                        setEditorValue('template', res.template);
                        setStatusMsg('已自动填入第1列名称与第2列模板，并在首个空行/断行处插入内容块');
                        return;
                      }
                    }
                    if (!text.includes(CONTENT_PLACEHOLDER) && /[\r\n]/.test(text)) {
                      e.preventDefault();
                      const res = detectAndInsertPlaceholder(text, QUOTED_CONTENT_PLACEHOLDER);
                      const textarea = promptTemplateRef.current;
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const next = promptTemplate.slice(0, start) + res.template + promptTemplate.slice(end);
                        setEditorValue('template', next);
                      } else {
                        setEditorValue('template', res.template);
                      }
                      setStatusMsg('已自动在首个空行/断行处插入内容块');
                    }
                  }}
                  className="mt-1 w-full min-h-28 border border-slate-700 bg-[#131f3b] text-slate-100 placeholder:text-slate-500 rounded-md p-2 text-sm resize-y outline-none focus:border-indigo-500"
                  value={promptTemplate}
                  onChange={e => setEditorValue('template', e.target.value)}
                  placeholder="粘贴完整描述词，把光标放到文案应出现的位置，再点击插入内容块；支持直接粘贴谷歌表格（第1列名称，第2列内容）"
                  title="双击放大编辑"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <button
                      type="button"
                      onClick={() => setShowPresetLibraryModal(true)}
                      className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#0d9488]/80 hover:bg-[#0d9488] border border-teal-500/50 text-white text-xs font-semibold shadow-xs transition shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      预设库
                    </button>
                    <select
                      className="h-8 border border-slate-700 rounded-lg px-2.5 text-xs bg-[#131f3b] text-slate-200 outline-none focus:border-sky-500 flex-1 max-w-[200px]"
                      value={selectedPresetId}
                      onChange={e => loadTemplatePreset(e.target.value)}
                    >
                      <option value="">快速切换预设...</option>
                      {templatePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                    {activeMultiPresets.length > 0 ? (
                      <span className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium shrink-0 whitespace-nowrap">
                        <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        已启用 {activeMultiPresets.length} 个预设
                        <button type="button" onClick={() => setMultiPresetIds([])} className="ml-1 text-slate-400 hover:text-white" title="清除多预设">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPresetLibraryModal(true)}
                        className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/80 text-xs text-sky-400 hover:text-sky-300 font-medium shrink-0 cursor-pointer whitespace-nowrap transition"
                        title="勾选多个预设进行批量填充"
                      >
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        多预设批量填充
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      className="h-8 w-28 border border-slate-700 rounded-lg px-2.5 text-xs bg-[#131f3b] text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500"
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="预设名称..."
                    />
                    <button
                      type="button"
                      onClick={saveTemplatePreset}
                      className="h-8 inline-flex items-center justify-center px-3 rounded-lg text-xs font-semibold whitespace-nowrap bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500/70 shadow-xs transition cursor-pointer"
                    >
                      保存
                    </button>
                    {selectedPresetId && (
                      <button
                        type="button"
                        onClick={deleteTemplatePreset}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800 transition cursor-pointer shadow-xs"
                        title="删除当前选中的预设"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              </label>
            </div>

            {batchTemplateMode && !editorsCollapsed && (
              <div className="border-b border-slate-600 bg-[#101d32] p-4 text-slate-100 shrink-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="mr-auto"><div className="text-sm font-semibold">批量文案与描述词</div><div className="mt-0.5 text-[11px] text-slate-400">可从谷歌表格粘贴一列文案，或粘贴“文案 + 描述词”两列</div></div>
                  <button
                    type="button"
                    onClick={() => setShowImportSegmentsModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-500/50 text-emerald-200 text-xs font-bold shadow-xs transition cursor-pointer"
                    title="从表格粘贴多篇文案、文案+描述词，或已拆分的片段"
                  >
                    <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
                    表格导入 / 粘贴
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPresetLibraryModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    预设库
                  </button>
                  <select className="rounded-lg border border-slate-500 px-2 py-2 text-xs" style={{ backgroundColor: '#0f1e36', color: '#e2e8f0', colorScheme: 'dark' }} value={selectedPresetId} onChange={e => loadTemplatePreset(e.target.value)}><option value="">选择统一描述词预设</option>{templatePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
                  <button type="button" onClick={addBatchTemplateDraft} className="rounded border border-blue-400 bg-blue-700 px-3 py-2 text-xs font-medium text-white">添加一篇文案</button>
                  <button type="button" onClick={clearBatchTemplateDrafts} className="rounded border border-red-400 bg-red-900 px-3 py-2 text-xs font-medium text-red-100">清空全部文案</button>
                </div>
                <div className="mb-3 grid grid-cols-1 gap-2 rounded border border-slate-600 bg-[#17253b] p-3 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
                  <div><div className="text-xs font-semibold text-blue-200">统一描述词模板</div><div className="mt-1 text-[11px] text-slate-400">每行默认继承，也可改为自定义</div></div>
                  <HighlightedTextarea ref={promptTemplateRef} onKeyDown={e => handleEditorShortcut(e, 'template')} className="min-h-20 w-full resize-y rounded border border-slate-500 p-2 text-sm" value={promptTemplate} onChange={e => setEditorValue('template', e.target.value)} placeholder="输入统一描述词模板" />
                  <button type="button" onClick={insertContentPlaceholder} className="self-start rounded border border-blue-400 bg-blue-700 px-3 py-2 text-xs text-white">在光标处插入内容块</button>
                </div>
                <div className="overflow-auto rounded border border-slate-600 max-h-[340px]">
                  <table className="w-full min-w-[980px] border-collapse table-fixed text-sm">
                    <thead className="bg-[#0b1628] sticky top-0 z-10"><tr><th className="w-14 border-b border-r border-slate-600 p-2">序号</th><th className="w-[43%] border-b border-r border-slate-600 p-2 text-left">原始文案</th><th className="border-b border-r border-slate-600 p-2 text-left">描述词模板与文案位置</th><th className="w-28 border-b border-slate-600 p-2">操作</th></tr></thead>
                    <tbody>
                      {batchTemplateDrafts.map((draft, index) => {
                        const effectiveTemplate = draft.templateMode === 'custom' ? draft.template : promptTemplate;
                        return <tr key={draft.id} className="bg-[#17253b] align-top">
                          <td className="border-b border-r border-slate-600 p-3 text-center text-slate-400">{index + 1}</td>
                          <td className="border-b border-r border-slate-600 p-3">
                            <textarea ref={element => { batchSourceRefs.current[draft.id] = element; }} onPaste={handleTemplateSourcePaste} className="min-h-32 w-full resize-y rounded border border-slate-500 bg-[#0b1628] p-3 text-sm text-slate-100 outline-none focus:border-blue-400" value={draft.source} onChange={event => updateBatchTemplateDraft(draft.id, { source: event.target.value })} placeholder={index === 0 ? '可直接在此粘贴谷歌表格的多个单元格' : `输入第 ${index + 1} 篇文案`} />
                            <button type="button" onClick={() => insertBatchDraftSplitMarker(draft)} className="mt-2 rounded border border-amber-500 bg-amber-900 px-2 py-1 text-[11px] text-amber-100">在光标处添加拆分点</button>
                            {imageGroups.length > 0 && (
                              <div className="mt-2">
                                {(() => {
                                  const selectedGroup = imageGroups.find(group => group.key === sourceImageGroupBindings[index]);
                                  return <button type="button" onClick={() => setOpenImageGroupSourceIndex(current => current === index ? null : index)} className="inline-flex max-w-full items-center gap-1.5 rounded border border-sky-500/60 bg-sky-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-900 transition">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  {selectedGroup?.images[0] && <span className="h-7 w-10 shrink-0 rounded bg-black flex items-center justify-center overflow-hidden"><img loading="lazy" decoding="async" src={selectedGroup.images[0].url} alt="" className="max-h-full max-w-full object-contain" /></span>}
                                  <span className="truncate">{selectedGroup ? `图片组：${selectedGroup.key}（${selectedGroup.images.length} 张）` : '为本篇选择图片组'}</span>
                                </button>;
                                })()}
                                {openImageGroupSourceIndex === index && (
                                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-600 bg-[#0b1628] p-2">
                                    {imageGroups.map(group => {
                                      const boundTo = Object.entries(sourceImageGroupBindings).filter(([, key]) => key === group.key).map(([sourceIndex]) => Number(sourceIndex) + 1);
                                      return <button key={group.key} type="button" onClick={() => { setSourceImageGroupBindings(current => ({ ...current, [index]: group.key })); setOpenImageGroupSourceIndex(null); setStatusMsg(`文案 ${index + 1} 已绑定图片组「${group.key}」，可在分镜行点“换图”手动选择并重复使用`); }} className={`flex min-w-0 items-center gap-2 rounded border p-1.5 text-left transition ${sourceImageGroupBindings[index] === group.key ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-700 bg-slate-900 hover:border-sky-400'}`}>
                                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded bg-black flex items-center justify-center"><img loading="lazy" decoding="async" src={group.images[0]?.url} alt={group.key} className="max-h-full max-w-full object-contain" /></div>
                                        <span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-slate-200">{group.key}</span><span className="block text-[10px] text-slate-500">{group.images.length} 张 · 可重复使用</span>{boundTo.length > 0 && <span className="block mt-0.5 text-[9px] text-amber-300">已被文案 {boundTo.join('、')} 选择</span>}</span>
                                      </button>;
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-r border-slate-600 p-3">
                            <div className="mb-2 flex flex-wrap gap-2">
                              <select className="rounded border border-slate-500 px-2 py-1.5 text-xs" style={{ backgroundColor: '#0f1e36', color: '#e2e8f0', colorScheme: 'dark' }} value={draft.templateMode} onChange={event => updateBatchTemplateDraft(draft.id, { templateMode: event.target.value as 'global' | 'custom', template: event.target.value === 'custom' ? (draft.template || promptTemplate) : draft.template })}><option value="global">使用统一模板</option><option value="custom">该篇自定义模板</option></select>
                              <select className="rounded border border-slate-500 px-2 py-1.5 text-xs" style={{ backgroundColor: '#0f1e36', color: '#e2e8f0', colorScheme: 'dark' }} value={draft.templateMode === 'custom' ? templatePresets.find(preset => preset.template === draft.template)?.id || '' : ''} onChange={event => { const preset = templatePresets.find(item => item.id === event.target.value); if (preset) updateBatchTemplateDraft(draft.id, { templateMode: 'custom', template: preset.template }); }}><option value="">为该篇选择预设</option>{templatePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
                              <button type="button" onClick={() => insertBatchDraftPlaceholder(draft)} className="rounded border border-violet-400 bg-violet-800 px-2 py-1.5 text-xs text-violet-100">在光标处插入内容块</button>
                            </div>
                            <textarea ref={element => { batchTemplateRefs.current[draft.id] = element; }} onPaste={event => handleBatchDescriptionPaste(event, index)} readOnly={draft.templateMode === 'global'} className={`min-h-24 w-full resize-y rounded border p-3 text-sm outline-none ${draft.templateMode === 'global' ? 'border-slate-600 bg-[#111c2e] text-slate-400' : 'border-slate-500 bg-[#0b1628] text-slate-100 focus:border-violet-400'}`} value={effectiveTemplate} onChange={event => updateBatchTemplateDraft(draft.id, { template: event.target.value })} />
                            <div className={`mt-1 text-[11px] ${effectiveTemplate.includes(CONTENT_PLACEHOLDER) ? 'text-slate-400' : 'font-medium text-red-400'}`}>{draft.templateMode === 'global' ? '当前继承上方统一模板；可直接粘贴谷歌表格的一列描述词' : effectiveTemplate.includes(CONTENT_PLACEHOLDER) ? `已设置 ${CONTENT_PLACEHOLDER} 文案位置；支持从当前行批量粘贴描述词` : `缺少 ${CONTENT_PLACEHOLDER} 内容块`}</div>
                          </td>
                          <td className="border-b border-slate-600 p-3 text-center"><button type="button" onClick={() => removeBatchTemplateDraft(draft.id)} className="inline-flex items-center gap-1 rounded border border-red-500 bg-red-900 px-2 py-2 text-[11px] text-red-100" title="删除该篇"><Trash2 className="h-3.5 w-3.5" />删除本篇</button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}


            {!editorsCollapsed && (
              <div className="border-b border-slate-800 bg-[#0d172e] px-4 pb-4 shrink-0">
                <button
                  type="button"
                  onClick={runTemplateSplit}
                  disabled={aiSegmenting}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/40 border transition ${aiSegmenting ? 'cursor-wait bg-violet-700 border-violet-400/40' : 'cursor-pointer bg-blue-600 hover:bg-blue-500 border-blue-400/40'}`}
                  title="按左侧选择的策略和参数，开始处理上方输入的文案"
                >
                  <Zap className="w-4 h-4 text-yellow-300" />
                  {aiSegmenting ? 'AI 正在分段…' : templateSplitStrategy === 'sermon' ? '开始 8 秒口播拆分' : templateSplitStrategy === 'ai' ? '开始纯 AI 分段' : '按设置开始拆分'}
                </button>
                {templateSplitStrategy === 'ai' && (
                  <div className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${statusMsg.startsWith('AI 分段失败') || statusMsg.includes('API Key') ? 'border-rose-500/40 bg-rose-950/35 text-rose-200' : aiSegmenting ? 'border-violet-500/40 bg-violet-950/35 text-violet-200' : 'border-slate-700 bg-[#111d33] text-slate-400'}`}>
                    {aiSegmenting ? 'AI 正在处理，请稍候…' : statusMsg || '点击后会在这里显示 AI 的执行进度或错误原因。'}
                  </div>
                )}
              </div>
            )}

            {batchTemplateMode && templateSegments.length > 0 && (
              <div className="border-b border-slate-800 bg-[#0d172e] px-4 pt-2 shrink-0">
                <div className="flex items-end gap-1 overflow-x-auto">
                  <button type="button" onClick={() => { setActiveBatchSourceIndex(null); setSelectedSegmentIds(new Set()); }} className={`shrink-0 border border-b-0 px-3 py-2 text-xs font-medium transition ${activeBatchSourceIndex === null ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-[#16223e] text-slate-300 hover:bg-[#1f3158]'}`}>全部结果 <span className="ml-1 opacity-75">{templateSegments.length}</span></button>
                    <button
                      type="button"
                      onClick={() => { setActiveBatchSourceIndex(null); setSelectedSegmentIds(new Set()); setImageOrderSourceIndex(-1); }}
                      disabled={attachedImages.length === 0}
                      className="shrink-0 rounded-t border border-b-0 border-violet-700 bg-violet-950/50 px-3 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-35"
                      title="查看全部文案，统一调整每个片段的图片与预设"
                    >
                      总分配 · 图片与预设
                    </button>
                  {batchSourceIndexes.map(sourceIndex => {
                    const segmentCount = templateSegments.filter(item => (item.sourceIndex ?? 0) === sourceIndex).length;
                    const active = activeBatchSourceIndex === sourceIndex;
                    const pal = SCRIPT_PALETTES[sourceIndex % SCRIPT_PALETTES.length];
                    return (
                      <div key={sourceIndex} className={`shrink-0 flex items-stretch border border-b-0 rounded-t transition ${
                        active ? `${pal.badgeBg} ${pal.badgeText} border-b-2 border-b-white` : 'border-slate-700 bg-[#16223e] text-slate-300'
                      }`}>
                        <button
                          type="button"
                          onClick={() => { setActiveBatchSourceIndex(sourceIndex); setSelectedSegmentIds(new Set()); }}
                          className={`px-3 py-2 text-xs font-medium transition flex items-center gap-1.5 ${
                          active
                            ? 'font-bold'
                            : 'hover:bg-[#1f3158]'
                        }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${pal.dotColor}`} />
                          文案 {sourceIndex + 1}
                          <span className="ml-1 opacity-75">{segmentCount} 段</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActiveBatchSourceIndex(sourceIndex); setSelectedSegmentIds(new Set()); setImageOrderSourceIndex(sourceIndex); }}
                          disabled={attachedImages.length === 0}
                          className={`border-l px-2 py-1.5 text-[11px] font-bold transition ${active ? 'border-white/25 text-violet-100 hover:bg-violet-900/40' : 'border-slate-700 text-violet-300 hover:bg-[#1f3158]'} disabled:cursor-not-allowed disabled:opacity-35`}
                          title={attachedImages.length > 0 ? `按文案 ${sourceIndex + 1} 的分段编号排序和分配图片` : '请先导入图片，再按本篇分段编号排序'}
                        >
                          排序图片
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {batchTemplateMode && perSourceTemplateMode && templateSegments.length > 0 && (
              <div className="border-b border-violet-800/50 bg-[#111c34] px-4 py-3 shrink-0">
                {activeBatchSourceIndex === null ? (
                  <div className="text-sm text-slate-300">请点击上方“文案 1、文案 2……”标签，分别设置每篇的描述词模板和内容块位置。</div>
                ) : (() => {
                  const sourceIndex = activeBatchSourceIndex;
                  const sourceTemplate = sourcePromptTemplates[sourceIndex] ?? promptTemplate;
                  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <div className="mb-2 text-sm font-semibold text-violet-200">文案 {sourceIndex + 1} 的描述词模板</div>
                      <select className="w-full rounded border border-slate-600 px-2 py-2 text-xs" style={{ backgroundColor: '#131f3b', color: '#e2e8f0', colorScheme: 'dark' }} value={templatePresets.find(preset => preset.template === sourceTemplate)?.id || ''} onChange={event => { const preset = templatePresets.find(item => item.id === event.target.value); if (preset) updateSourcePromptTemplate(sourceIndex, preset.template); }}>
                        <option value="">选择该文案的描述词预设</option>
                        {templatePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                      </select>
                      <button type="button" onClick={() => insertSourceContentPlaceholder(sourceIndex)} className="mt-2 w-full rounded border border-violet-500 bg-violet-800 hover:bg-violet-700 px-3 py-2 text-xs font-medium text-white transition">在光标处插入内容块</button>
                      <button type="button" onClick={() => updateSourcePromptTemplate(sourceIndex, promptTemplate)} className="mt-2 w-full rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition">恢复为统一模板</button>
                    </div>
                    <div>
                      <textarea ref={sourcePromptTemplateRef} className="min-h-28 w-full resize-y rounded border border-slate-700 bg-[#090f21] p-3 text-sm text-slate-100 outline-none focus:border-violet-400" value={sourceTemplate} onChange={event => updateSourcePromptTemplate(sourceIndex, event.target.value)} placeholder={`编辑文案 ${sourceIndex + 1} 的完整描述词模板`} />
                      <div className={`mt-1 text-[11px] ${sourceTemplate.includes(CONTENT_PLACEHOLDER) ? 'text-slate-400' : 'font-medium text-rose-400'}`}>{sourceTemplate.includes(CONTENT_PLACEHOLDER) ? `内容块 ${CONTENT_PLACEHOLDER} 已设置，可直接拖动光标重新插入` : `当前模板缺少 ${CONTENT_PLACEHOLDER}，请在文案应出现的位置插入`}</div>
                    </div>
                  </div>;
                })()}
              </div>
            )}

            {/* 结果面板：复制、导出、筛选和分镜表格统一归属 */}
            <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0b1427] flex items-center gap-2 shrink-0">
              <div className="w-1 h-4 rounded-full bg-emerald-400" />
              <div>
                <h4 className="text-xs font-bold text-slate-100">结果面板</h4>
                <p className="text-[10px] text-slate-500">查看、编辑、复制或导出拆分后的内容</p>
              </div>
            </div>

            {/* 核心操作主工具栏 (专业紧凑单行) */}
            <div className="px-4 py-2 border-b border-slate-800 bg-[#101c36] flex items-center justify-between gap-3 flex-nowrap overflow-x-auto shrink-0 scrollbar-thin">
              {/* 左侧：分镜/统一模板切换 + 核心表格复制 + 更多复制 + 导出 */}
              <div className="flex items-center gap-2 flex-nowrap shrink-0">
                {/* 模板与分镜模式切换 */}
                <div className="h-8 inline-flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-inner p-0.5">
                  <button
                    type="button"
                    onClick={() => { setStoryboardMode(false); setPerSourceTemplateMode(false); setTemplateSegments(items => items.map(item => ({ ...item, finalPrompt: undefined }))); }}
                    className={`h-full px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition cursor-pointer flex items-center ${!storyboardMode && !perSourceTemplateMode ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    统一模板
                  </button>
                  {batchTemplateMode && (
                    <button
                      type="button"
                      onClick={() => { setStoryboardMode(false); setPerSourceTemplateMode(true); setTemplateSegments(items => items.map(item => ({ ...item, finalPrompt: undefined }))); }}
                      className={`h-full px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition cursor-pointer flex items-center ${perSourceTemplateMode ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      每篇模板
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setStoryboardMode(true); setPerSourceTemplateMode(false); setTemplateSegments(items => items.map(item => ({ ...item, finalPrompt: undefined }))); }}
                    className={`h-full px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition cursor-pointer flex items-center ${storyboardMode ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    分镜模式
                  </button>
                </div>

                {!batchTemplateMode && (
                  <button
                    type="button"
                    disabled={attachedImages.length === 0 || templateSegments.length === 0}
                    onClick={() => { setSelectedSegmentIds(new Set()); setImageOrderSourceIndex(0); }}
                    className="h-8 inline-flex items-center gap-1.5 rounded-lg border border-violet-500/70 bg-violet-950/50 px-3 text-xs font-semibold text-violet-100 transition hover:bg-violet-900 disabled:cursor-not-allowed disabled:opacity-35"
                    title="为单篇文案逐段分配图片与描述词预设"
                  >
                    排序图片与预设
                  </button>
                )}

                <div className="h-4 w-px bg-slate-700/80 mx-0.5" />

                {/* 核心高亮复制：复制 6 列表格 (逐行模式) */}
                <button
                  type="button"
                  title="严格复制 6 列：第1列图(=IMAGE公式)、第2列原始文案、第3列拆分文案、第4列断行文案、第5列预设、第6列最终描述词"
                  onClick={() => copyTemplateResults('six-columns-per-segment')}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white text-xs font-semibold shadow-xs border border-blue-400/30 whitespace-nowrap transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>复制 6 列表格</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyTemplateResults('six-columns-by-source')}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs border border-violet-400/30 whitespace-nowrap transition cursor-pointer"
                  title="复制整篇表格；编号和空行格式由左侧“复制模式与导出格式”统一控制"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>复制整篇表格</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyTemplateResults('image-name-group-prompt')}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-xs border border-emerald-400/30 whitespace-nowrap transition cursor-pointer"
                  title="特殊六列复制：整篇自动断行文案、图片名字、空白列、图片组（文件夹）名字、最终描述词、拆分文案；含表头"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>复制图片组+描述词</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setShowImagePromptSheet(value => !value); setSelectedImagePromptCells(new Set()); }}
                  className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap transition cursor-pointer ${showImagePromptSheet ? 'border-emerald-300 bg-emerald-600 text-white' : 'border-emerald-600/60 bg-emerald-950/45 text-emerald-200 hover:bg-emerald-900/60'}`}
                  title="打开可选择单元格、复制图片和描述词的交付表格"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  图+词表格
                </button>

                <FlatCopyActions
                  onCopy={copyTemplateResults}
                  batchTemplateMode={batchTemplateMode}
                  hasImages={attachedImages.length > 0}
                  activeMultiPresetsCount={activeMultiPresets.length}
                  onShowFormatGuide={() => setShowTemplateCopyGuide(true)}
                />

                {/* 导出 TSV */}
                <button
                  type="button"
                  onClick={exportTemplateResults}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#16223d] hover:bg-[#20335e] text-slate-300 hover:text-white border border-slate-700/80 text-xs font-medium whitespace-nowrap transition cursor-pointer shadow-xs"
                  title="导出为 TSV 格式制表符分隔文件"
                >
                  <Download className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span>导出 TSV</span>
                </button>
              </div>


              <div className="flex items-center gap-2 shrink-0">
                {/* 选中项操作 (合并 / 拆分) */}
                {selectedSegmentIds.size > 0 && (
                  <div className="h-8 inline-flex items-center gap-1 px-2 rounded-lg bg-slate-800/90 border border-slate-700 shadow-xs">
                    <span className="text-[11px] text-slate-400 mr-0.5">已选 {selectedSegmentIds.size}:</span>
                    <button
                      type="button"
                      onClick={mergeSelectedTemplateSegments}
                      disabled={selectedSegmentIds.size < 2}
                      className="h-6 px-2 rounded hover:bg-slate-700 text-slate-200 text-xs font-medium disabled:opacity-40 transition flex items-center gap-1 cursor-pointer"
                      title="合并选中的分镜"
                    >
                      <Combine className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>合并</span>
                    </button>
                    <button
                      type="button"
                      onClick={splitSelectedAtCarets}
                      className="h-6 px-2 rounded hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                      title="在光标处批量拆分"
                    >
                      <Scissors className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>拆分</span>
                    </button>
                  </div>
                )}


                {/* 列显示控制弹层 */}
                <ColumnVisibilityPopover
                  visibility={columnVisibility}
                  onChange={setColumnVisibility}
                  hasImages={attachedImages.length > 0}
                />

                {/* 撤销 / 重做 */}
                <div className="h-8 inline-flex items-center border border-slate-700 rounded-lg overflow-hidden bg-[#101c36] shadow-xs">
                  <button
                    type="button"
                    title="撤销分镜修改 (快捷键: ⌘Z)"
                    onClick={handleUndoSegments}
                    disabled={!canUndoSegments}
                    className={`h-full px-2.5 text-xs font-medium transition flex items-center justify-center border-r border-slate-700/80 cursor-pointer ${
                      canUndoSegments ? 'text-amber-300 hover:bg-[#1c2e56]' : 'text-slate-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Undo2 className="w-3.5 h-3.5 shrink-0" />
                  </button>
                  <button
                    type="button"
                    title="重做分镜修改 (快捷键: ⇧⌘Z)"
                    onClick={handleRedoSegments}
                    disabled={!canRedoSegments}
                    className={`h-full px-2.5 text-xs font-medium transition flex items-center justify-center cursor-pointer ${
                      canRedoSegments ? 'text-amber-300 hover:bg-[#1c2e56]' : 'text-slate-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Redo2 className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>

                {/* 对比修改按钮 */}
                {(lastActionToast || canUndoSegments) && (
                  <button
                    type="button"
                    title="查看当前修改与修改前的详细差异"
                    onClick={() => setShowDiffModal(true)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/60 transition shadow-xs cursor-pointer"
                  >
                    <GitCompare className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                  </button>
                )}

                {sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(false)}
                    className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap transition cursor-pointer shadow-xs"
                    title="展开左侧素材与参数面板"
                  >
                    <Sliders className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                    <span>素材面板</span>
                    {attachedImages.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 bg-blue-900/80 text-blue-200 rounded-full text-[10px] font-bold">
                        {attachedImages.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* 复制进度、筛选与搜索导航栏 (紧凑单行设计) */}
            <div className="px-4 py-2 bg-[#091122] text-slate-100 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 text-xs shadow-inner shrink-0">
              {/* 左侧：复制进度 + 定位 + 筛选标签 */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 进度微章 */}
                <div className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg bg-[#131f3b] border border-slate-700/80 shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-300">
                    已复制: <strong className="text-emerald-400 font-bold">{copiedVisibleCount}</strong>/{totalVisibleCount}
                    <span className="text-slate-400 ml-1">({progressPercent}%)</span>
                  </span>
                  <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 定位下一个未复制按钮 */}
                {totalVisibleCount > copiedVisibleCount && (
                  <button
                    type="button"
                    onClick={scrollToNextUncopied}
                    className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold whitespace-nowrap transition cursor-pointer shadow-xs"
                    title="定位到下一个未复制的分镜"
                  >
                    <ArrowDownCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>定位未复制</span>
                  </button>
                )}

                {/* 仅看未复制筛选开关 */}
                <button
                  type="button"
                  onClick={() => setFilterUncopiedOnly(prev => !prev)}
                  className={`h-8 inline-flex items-center gap-1 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer border whitespace-nowrap shadow-xs ${
                    filterUncopiedOnly
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold'
                      : 'bg-[#131f3b] text-slate-300 hover:text-white border-slate-700'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>仅未复制 ({totalVisibleCount - copiedVisibleCount})</span>
                </button>

                {/* 仅看已修改筛选开关 */}
                {modifiedSegmentsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterModifiedOnly(prev => !prev)}
                    className={`h-8 inline-flex items-center gap-1 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer border whitespace-nowrap shadow-xs ${
                      filterModifiedOnly
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                        : 'bg-[#131f3b] text-slate-300 hover:text-white border-slate-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>已修改 ({modifiedSegmentsCount})</span>
                  </button>
                )}

                {/* 批量标记所选 */}
                {selectedSegmentIds.size > 0 && (
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCopiedSegmentIds(prev => {
                          const next = new Set(prev);
                          selectedSegmentIds.forEach(id => next.add(id));
                          return next;
                        });
                        showToastNotification(`已将选中的 ${selectedSegmentIds.size} 项批量标记为已复制`);
                      }}
                      className="h-8 inline-flex items-center px-2.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-white text-xs font-medium transition cursor-pointer border border-emerald-600/50 whitespace-nowrap shadow-xs"
                    >
                      ✓ 标记已选({selectedSegmentIds.size})为已复制
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCopiedSegmentIds(prev => {
                          const next = new Set(prev);
                          selectedSegmentIds.forEach(id => next.delete(id));
                          return next;
                        });
                        showToastNotification(`已取消选中 ${selectedSegmentIds.size} 项的已复制标记`);
                      }}
                      className="h-8 inline-flex items-center px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer border border-slate-700 whitespace-nowrap shadow-xs"
                    >
                      取消标记
                    </button>
                  </div>
                )}
              </div>

              {/* 右侧：紧凑搜索框 + 匹配计数导航 + 段落统计 + 重置按钮 */}
              <div className="flex items-center gap-2 ml-auto">
                {/* 紧凑搜索框 */}
                <div className="relative flex items-center h-8 group">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-sky-400">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={e => setSearchKeyword(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (e.shiftKey) handlePrevMatch();
                        else handleNextMatch();
                      } else if (e.key === 'Escape') {
                        setSearchKeyword('');
                        setHighlightedSegmentId(null);
                        setSearchFilterMode(false);
                      }
                    }}
                    placeholder="搜索分镜/文案/行号..."
                    className="h-8 w-52 focus:w-68 transition-all duration-200 pl-8 pr-6 bg-[#070d1c] text-slate-100 placeholder-slate-500 rounded-lg border border-slate-700 focus:border-sky-500 text-xs outline-none"
                  />
                  {searchKeyword && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchKeyword('');
                        setHighlightedSegmentId(null);
                        setSearchFilterMode(false);
                      }}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 匹配导航 */}
                {searchKeyword.trim() && (
                  matchedSegmentIds.length > 0 ? (
                    <div className="h-8 inline-flex items-center gap-0.5 bg-[#131f3b] border border-slate-700 rounded-lg px-2 text-xs">
                      <span className="font-mono text-amber-400 font-bold mr-1">
                        {activeMatchIndex + 1}/{matchedSegmentIds.length}
                      </span>
                      <button type="button" onClick={handlePrevMatch} className="p-0.5 hover:text-white text-slate-400 cursor-pointer" title="上一个 (Shift+Enter)"><ChevronUp className="w-3 h-3" /></button>
                      <button type="button" onClick={handleNextMatch} className="p-0.5 hover:text-white text-slate-400 cursor-pointer" title="下一个 (Enter)"><ChevronDown className="w-3 h-3" /></button>
                      <button
                        type="button"
                        onClick={() => setSearchFilterMode(prev => !prev)}
                        className={`ml-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${searchFilterMode ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                        title="仅看匹配项"
                      >
                        仅看
                      </button>
                    </div>
                  ) : (
                    <span className="h-8 inline-flex items-center text-[10px] text-rose-400 bg-rose-950/60 px-2 rounded-lg border border-rose-800/60">
                      无匹配
                    </span>
                  )
                )}

                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline whitespace-nowrap">
                  当前 {displayedTemplateSegments.length} / 共 {visibleTemplateSegments.length} 段
                </span>

                <button
                  type="button"
                  onClick={resetAllCopiedMarks}
                  className="h-8 w-8 inline-flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-[#131f3b] rounded-lg transition cursor-pointer"
                  title="重置所有分镜的复制标记"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 撤销/取消本次修改与对比提示条 */}
            {lastActionToast && (
              <div className="mx-4 mt-2.5 mb-1 px-3.5 py-2 rounded-lg bg-[#141b36] border border-indigo-500/50 shadow-md flex items-center justify-between gap-3 text-xs shrink-0">
                <div className="flex items-center gap-2 text-indigo-100 flex-wrap">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px]">
                    ✓
                  </span>
                  <span>
                    已执行【<strong className="text-amber-300 font-semibold">{lastActionToast.actionName}</strong>】
                  </span>
                  <span className="text-slate-400 text-[11px] hidden sm:inline">
                    (共 {lastActionToast.afterSegments.length} 段)
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCancelCurrentChange}
                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition shadow-sm cursor-pointer"
                    title="撤销并取消本次修改，恢复原状"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    取消本次修改
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiffModal(true)}
                    className="px-2.5 py-1 rounded bg-indigo-900/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/50 text-xs flex items-center gap-1 transition cursor-pointer"
                    title="查看修改前与修改后的段落、字数详细对比"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    对比修改前后
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastActionToast(null)}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-indigo-900/50 transition cursor-pointer"
                    title="关闭提示"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {showImagePromptSheet && (() => {
              const rows = getImagePromptSheetRows();
              const headers = ['整篇自动断行文案', '图片', '图片名字', '空白列', '图片组名字', '最终描述词', '拆分文案', '预设（可换）'];
              // 名字列随当前数据中最长的名字收缩/扩展，避免固定大列造成横向浪费。
              const calculateNameColumnWidth = (column: number, header: string, min: number, max: number) => {
                const longest = Math.max(header.length, ...rows.map(row => (row.values[column] || '').length));
                return Math.min(max, Math.max(min, longest * 9 + 30));
              };
              const imageNameColumnWidth = calculateNameColumnWidth(2, '图片名字', 150, 460);
              const groupNameColumnWidth = calculateNameColumnWidth(4, '图片组名字', 170, 520);
              const imagePromptSheetWidth = 56 + 28 + 40 + imageNameColumnWidth + 24 + groupNameColumnWidth + 136 + 48 + 224 + 160;
              const selectableColumns = new Set([2, 3, 4, 5]);
              const selectRange = (start: { row: number; column: number }, end: { row: number; column: number }) => {
                const next = new Set<string>();
                const minRow = Math.min(start.row, end.row);
                const maxRow = Math.max(start.row, end.row);
                const minColumn = Math.min(start.column, end.column);
                const maxColumn = Math.max(start.column, end.column);
                for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
                  for (let column = minColumn; column <= maxColumn; column++) {
                    if (selectableColumns.has(column)) next.add(`${rows[rowIndex].id}:${column}`);
                  }
                }
                setSelectedImagePromptCells(next);
              };
              const beginCellSelection = (event: React.MouseEvent, row: number, column: number) => {
                if (event.button !== 0 || !selectableColumns.has(column)) return;
                event.preventDefault();
                imagePromptDragStartRef.current = { row, column };
                selectRange({ row, column }, { row, column });
              };
              const extendCellSelection = (row: number, column: number) => {
                if (imagePromptDragStartRef.current) selectRange(imagePromptDragStartRef.current, { row, column });
              };
              return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => { setShowImagePromptSheet(false); setImagePromptContextMenu(null); }}><section className="flex h-[92vh] w-[96vw] max-w-[1900px] flex-col overflow-hidden rounded-xl border border-slate-600 bg-[#0b1527] shadow-2xl" onClick={event => event.stopPropagation()}>
                <div className="border-b border-slate-700 bg-[#13243b] px-5 py-3"><div className="flex items-start justify-between gap-3"><div><h4 className="text-base font-bold text-emerald-200">图＋词交付表格</h4><p className="mt-0.5 text-[11px] text-slate-400">按住鼠标拖过单元格即可框选连续区域；可按 ⌘C（Mac）/ Ctrl+C 复制，去 Google 表格按 ⌘V / Ctrl+V 粘贴。直接点击图片即可复制原图。</p></div><div className="flex items-center gap-2"><button type="button" onClick={async () => { const api = (window as any).electronAPI; if (!api?.openImagePromptSheet) return showToastNotification('独立浮窗仅支持桌面版 Electron', 'error'); await api.publishImagePromptSheetData({ headers, rows: rows.map(row => ({ id: row.id, values: row.values, searchText: row.searchText, image: row.image ? { id: row.image.id, url: row.image.url, name: row.image.name, originalPath: getOriginalImagePath(row.image) } : null, sourceIndex: row.segment.sourceIndex ?? 0, copied: copiedSegmentIds.has(row.id) })) }); const result = await api.openImagePromptSheet(); if (!result?.success) return showToastNotification(result?.error || '打开独立窗口失败', 'error'); setShowImagePromptSheet(false); setImagePromptSheetDetached(true); showToastNotification('已打开置顶独立表格窗口，主窗口可继续操作'); }} className="rounded border border-sky-500 bg-sky-950 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900">脱离为独立窗口</button><button type="button" onClick={() => setShowImagePromptSheet(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></div></div>
                  <div className="mt-3 rounded border border-slate-600 bg-slate-950/40 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="命名快捷组合">
                      <span className="text-[11px] font-semibold text-sky-200">快捷组合</span>
                      {GROUP_NAME_PRESETS.map(preset => <button key={preset.template} type="button" aria-pressed={groupNameTemplate === preset.template} onClick={() => setGroupNameTemplate(preset.template)} className={`rounded border px-2 py-1 text-[11px] transition ${groupNameTemplate === preset.template ? 'border-emerald-400 bg-emerald-800 text-white' : 'border-sky-800 bg-sky-950/40 text-sky-200 hover:border-sky-400 hover:bg-sky-900'}`}>{preset.label}</button>)}
                    </div>
                    <label className="block text-xs font-semibold text-sky-200">图片组名字 · 自定义命名模板
                      <input value={groupNameTemplate} onChange={event => setGroupNameTemplate(event.target.value)} className="mt-2 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-white" placeholder="自定义文字-片段{{片段编号}}" />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">{GROUP_NAME_FIELDS.map(field => <button type="button" key={field} onClick={() => setGroupNameTemplate(current => current + `{{${field}}}`)} className="rounded border border-sky-800 px-2 py-1 text-[11px] text-sky-200">+ {field}</button>)}<button type="button" onClick={() => setGroupNameTemplate(DEFAULT_GROUP_NAME_TEMPLATE)} className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300">恢复默认</button></div>
                    <p className="mt-2 text-[11px] text-slate-400">可任意组合文字和字段，例如：{'{{图片名字}}'}{'{{预设名字}}'}-片段{'{{片段编号}}'}。名字直接拼接，不额外添加 z；图片名字、图片组名字、预设名字与预设组名字中已有的 -、_ 会转换为 z，保留片段前的 -。预设名字使用当前片段的预设名称，未匹配预设时为空。每篇的预设组字段统一以第二个片段为准；只有一段时使用该段。</p>
                    <p className="mt-1 text-xs text-emerald-300">预览：{rows[0]?.values[4] || '暂无数据'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-emerald-300">已选 {selectedImagePromptCells.size} 格</span><button type="button" onClick={() => copyImagePromptSheetCells(false)} disabled={selectedImagePromptCells.size === 0} className="rounded border border-sky-500 bg-sky-950 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900 disabled:opacity-35">复制所选单元格</button><button type="button" onClick={() => copyImagePromptSheetCells(true)} className="rounded border border-emerald-500 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">复制全部表格</button><button type="button" onClick={() => setSelectedImagePromptCells(new Set())} className="rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">取消选择</button></div>
                </div>
                <div className="m-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-700" onContextMenu={event => { if (selectedImagePromptCells.size === 0) return; event.preventDefault(); setImagePromptContextMenu({ x: event.clientX, y: event.clientY }); }}>
                  <table className="table-fixed border-collapse text-xs select-none" style={{ width: imagePromptSheetWidth }} onMouseUp={() => { imagePromptDragStartRef.current = null; }} onMouseLeave={() => { imagePromptDragStartRef.current = null; }}>
                    <colgroup><col className="w-14" /><col className="w-7" /><col className="w-10" /><col style={{ width: imageNameColumnWidth }} /><col className="w-6" /><col style={{ width: groupNameColumnWidth }} /><col className="w-[8.5rem]" /><col className="w-12" /><col className="w-56" /><col className="w-40" /></colgroup>
                    <thead className="sticky top-0 z-10 bg-[#13243b] text-slate-100"><tr><th className="w-12 border border-slate-700 p-2">#</th>{headers.map(header => <th key={header} className="border border-slate-700 p-2 text-left font-semibold">{header}</th>)}<th className="border border-slate-700 p-2 text-center">操作</th></tr></thead>
                    <tbody>{rows.map((row, rowIndex) => <tr key={row.id} className={`h-10 ${copiedSegmentIds.has(row.id) ? 'bg-emerald-950/35' : rowIndex % 2 ? 'bg-[#0b172a]' : 'bg-[#0d1c31]'}`}><td className="border border-slate-800 p-1 text-center font-mono text-[10px] text-slate-400">{copiedSegmentIds.has(row.id) ? <span className="font-bold text-emerald-300">✓ 已复制</span> : `#${rowIndex + 1}`}</td>{row.values.map((value, column) => {
                      const key = `${row.id}:${column}`;
                      const selected = selectedImagePromptCells.has(key);
                      if (column === 1) return <td key={key} className="border border-slate-800 p-1 align-middle"><button type="button" onClick={() => row.image && void handleCopySegmentImage(row.image, row.id)} disabled={!row.image} title="点击复制原图到剪贴板" className="h-8 w-6 overflow-hidden rounded border border-sky-700 bg-black transition hover:border-sky-300 hover:ring-2 hover:ring-sky-400/50 disabled:opacity-35">{row.image ? <img loading="lazy" decoding="async" src={row.image.url} alt={row.image.name} className="h-full w-full object-cover" draggable={false} /> : null}</button></td>;
                      if (column === 7) return <td key={key} className="border border-slate-800 p-1 align-middle"><select value={row.segment.presetId || templatePresets.find(preset => preset.template === (row.segment.promptTemplate ?? getEffectiveSegmentTemplate(row.segment)))?.id || ''} onChange={event => { const preset = templatePresets.find(item => item.id === event.target.value); setStoryboardMode(true); setPerSourceTemplateMode(false); setTemplateSegments(current => current.map(segment => segment.id === row.id ? { ...segment, presetId: preset?.id, promptTemplate: preset?.template, finalPrompt: undefined } : segment)); }} className="w-full rounded border border-violet-600 bg-[#111b2d] px-1 py-1 text-[10px] text-violet-100 outline-none"><option value="">使用统一模板</option>{templatePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></td>;
                      const selectable = selectableColumns.has(column);
                      return <td key={key} onMouseDown={event => beginCellSelection(event, rowIndex, column)} onMouseEnter={() => extendCellSelection(rowIndex, column)} onDoubleClick={() => setImagePromptExpandedCell({ title: headers[column], value })} className={`${selectable ? 'cursor-cell' : ''} border border-slate-800 p-1 align-top ${selected ? 'bg-sky-900/70 ring-2 ring-inset ring-sky-300' : selectable ? 'hover:bg-sky-950/30' : ''}`}><div className="h-8 overflow-hidden whitespace-pre-wrap break-words text-left text-[11px] leading-4 text-slate-200 line-clamp-2">{value || <span className="text-slate-600">—</span>}</div></td>;
                    })}<td className="border border-slate-800 p-1 align-middle text-center"><div className="flex items-center justify-center gap-1"><button type="button" onClick={async () => { const rowValues = row.values.filter((_, column) => column !== 0 && column !== 1); const result = await copyToClipboard(rowValues.join('\t'), buildGoogleSheetsHtml([rowValues])); if (result === 'failed') return showToastNotification('复制本行失败，请检查浏览器剪贴板权限', 'error'); markSegmentCopied(row.id, row.image?.id); showToastNotification('✅ 已复制当前行（不含图片与整篇断行文案）'); }} className="rounded border border-emerald-500 bg-emerald-950 px-1.5 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-800">复制本行</button><button type="button" onClick={() => setImagePickerTarget({ segmentId: row.id, segmentIndex: row.globalIndex >= 0 ? row.globalIndex : rowIndex, segmentText: row.segment.text, sourceIndex: row.segment.sourceIndex })} className="rounded border border-amber-600 px-1.5 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-950">换图</button></div></td></tr>)}</tbody>
                  </table>
                </div>
                {imagePromptContextMenu && <div className="fixed z-[100] w-44 overflow-hidden rounded-lg border border-slate-600 bg-[#14213b] py-1 shadow-2xl" style={{ left: imagePromptContextMenu.x, top: imagePromptContextMenu.y }} onMouseLeave={() => setImagePromptContextMenu(null)}><button type="button" onClick={() => { void copyImagePromptSheetCells(false); setImagePromptContextMenu(null); }} className="block w-full px-3 py-2 text-left text-xs font-semibold text-sky-200 hover:bg-sky-900">复制所选单元格</button><button type="button" onClick={() => { setSelectedImagePromptCells(new Set()); setImagePromptContextMenu(null); }} className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800">取消选择</button></div>}
                {imagePromptExpandedCell && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={() => setImagePromptExpandedCell(null)}><div className="flex max-h-[75vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-[#101c31] shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><h5 className="font-bold text-sky-100">{imagePromptExpandedCell.title}</h5><button type="button" onClick={() => setImagePromptExpandedCell(null)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button></div><div className="overflow-auto whitespace-pre-wrap p-4 text-sm leading-7 text-slate-100">{imagePromptExpandedCell.value || '—'}</div></div></div>}
              </section></div>;
            })()}

            {(() => {
              const visibleColumnCount =
                (columnVisibility.index ? 1 : 0) +
                (columnVisibility.image ? 1 : 0) +
                1 +
                1 +
                (columnVisibility.wrappedText ? 1 : 0) +
                (columnVisibility.preset ? 1 : 0) +
                (columnVisibility.finalPrompt ? (activeMultiPresets.length > 0 ? activeMultiPresets.length : 1) : 0) +
                1;

              return (
                <div className="p-4 pb-5 bg-[#090f21] overflow-x-auto shrink-0 min-w-0" title="表格空间不足时可按住 Shift + 滚轮，或拖动底部横向滚动条查看全部列">
                  <table className="w-full border-collapse bg-[#0d172e] text-sm table-fixed min-w-[1560px] border border-slate-800">
                    <thead className="sticky top-0 bg-[#16223e] z-10 text-xs text-slate-200 shadow-md">
                      <tr>
                        {columnVisibility.index && (
                          <th className="border border-slate-700/80 p-2 w-14 text-center bg-[#16223e]">
                            <input
                              type="checkbox"
                              checked={displayedTemplateSegments.length > 0 && displayedTemplateSegments.every(item => selectedSegmentIds.has(item.id))}
                              onChange={e => setSelectedSegmentIds(prev => {
                                const next = new Set(prev);
                                displayedTemplateSegments.forEach(item => e.target.checked ? next.add(item.id) : next.delete(item.id));
                                return next;
                              })}
                            />
                          </th>
                        )}
                        {/* 第一列：图 */}
                        {columnVisibility.image && (
                          <th className="border border-slate-700/80 p-2 w-36 text-center bg-[#131f3b] text-emerald-400 font-bold">
                            <div className="flex items-center justify-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                              <span>第一列：图</span>
                            </div>
                          </th>
                        )}
                        {/* 第二列：原始文案 */}
                        <th className="border border-slate-700/80 p-2 w-[260px] text-left bg-[#131f3b] font-bold text-slate-200">
                          <div className="flex items-center justify-between">
                            <span>第二列：原始文案</span>
                            {batchTemplateMode && (
                              <span className="text-[10px] font-normal text-sky-400 bg-sky-950/70 px-1.5 py-0.5 rounded border border-sky-700/60">
                                按文案色彩区分
                              </span>
                            )}
                          </div>
                        </th>
                        {/* 第三列：拆分文案 */}
                        <th className="border border-slate-700/80 p-2 w-[360px] text-left bg-[#131f3b] font-bold text-slate-200">
                          第三列：拆分文案
                        </th>
                        {/* 第四列：断行文案 */}
                        {columnVisibility.wrappedText && (
                          <th className="border border-slate-700/80 p-2 w-[300px] text-left bg-[#131f3b] font-bold text-slate-200">
                            第四列：断行文案
                          </th>
                        )}
                        {/* 第五列：预设 */}
                        {columnVisibility.preset && (
                          <th className="border border-slate-700/80 p-2 w-[250px] text-left bg-[#131f3b] font-bold text-slate-200">
                            <div className="flex items-center justify-between">
                              <span>第五列：预设</span>
                              <button
                                type="button"
                                onClick={() => setShowCyclePresetModal(true)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold transition cursor-pointer shadow-xs"
                                title="选择多个预设批量循环填充到分镜行"
                              >
                                <Repeat className="w-3 h-3 text-indigo-200" />
                                <span>循环填充</span>
                              </button>
                            </div>
                          </th>
                        )}
                        {/* 第六列：最终描述词 */}
                        {columnVisibility.finalPrompt && (
                          activeMultiPresets.length > 0 ? (
                            activeMultiPresets.map(preset => (
                              <th key={preset.id} className="border border-slate-700/80 p-2 w-[380px] text-left bg-[#131f3b] font-bold text-indigo-300">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-indigo-300 truncate" title={preset.name}>
                                    预设: {preset.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setMultiPresetIds(prev => prev.filter(id => id !== preset.id))}
                                    className="text-[11px] text-slate-400 hover:text-rose-400 font-bold px-1"
                                    title="取消多列展示"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </th>
                            ))
                          ) : (
                            <th className="border border-slate-700/80 p-2 w-[380px] text-left bg-[#131f3b] font-bold text-indigo-300">
                              <div className="flex items-center justify-between">
                                <span>第六列：最终描述词</span>
                                <span className="text-[10px] font-normal text-indigo-400">（可编辑）</span>
                              </div>
                            </th>
                          )
                        )}
                        {/* 操作列 */}
                        <th className="border border-slate-700/80 p-2 w-14 text-center text-slate-400 font-normal bg-[#131f3b]">
                          操作
                        </th>
                      </tr>
                    </thead>
                <tbody>
                  {displayedTemplateSegments.length > 0 && <tr><td colSpan={30} className="bg-slate-900 px-3 py-2 text-xs text-slate-300"><div className="flex flex-wrap items-center gap-3"><PageSizeControl enabled={segmentPaginationEnabled} onToggle={enabled => { setSegmentPaginationEnabled(enabled); setSegmentListPage(0); }} value={segmentPageSizeSetting} onChange={next => { setSegmentPageSize(next); setSegmentListPage(Math.floor(Math.min(segmentListPage, Math.max(0, Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1)) * segmentPageSize / next)); }} /><button style={{ display: segmentPaginationEnabled ? undefined : 'none' }} type="button" disabled={segmentListPage === 0} onClick={() => setSegmentListPage(page => Math.max(0, page - 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">上一页</button><span style={{ display: segmentPaginationEnabled ? undefined : 'none' }}>第 {Math.min(segmentListPage, Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1) + 1} / {Math.ceil(displayedTemplateSegments.length / segmentPageSize)} 页 · 共 {displayedTemplateSegments.length} 个片段</span><button style={{ display: segmentPaginationEnabled ? undefined : 'none' }} type="button" disabled={segmentListPage >= Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1} onClick={() => setSegmentListPage(page => Math.min(Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1, page + 1))} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">下一页</button>{!segmentPaginationEnabled && <span>显示全部 · 共 {displayedTemplateSegments.length} 个片段</span>}</div></td></tr>}
                  {displayedTemplateSegments.slice(Math.min(segmentListPage, Math.max(0, Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1)) * segmentPageSize, (Math.min(segmentListPage, Math.max(0, Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1)) + 1) * segmentPageSize).map((item, pageIndex) => {
                    const index = Math.min(segmentListPage, Math.max(0, Math.ceil(displayedTemplateSegments.length / segmentPageSize) - 1)) * segmentPageSize + pageIndex;
                    const globalIndex = segmentRenderIndex.positions.get(item.id) ?? -1;
                    const nextSegment = templateSegments[globalIndex + 1];
                    const hasNextInSameSource = Boolean(nextSegment && (nextSegment.sourceIndex ?? 0) === (item.sourceIndex ?? 0));
                    const count = countSegmentUnits(item.text, splitUnit);
                    const lowerBound = Math.max(1, Math.min(splitMinimum, splitMaximum));
                    const upperBound = Math.max(splitMinimum, splitMaximum) + (allowTolerance ? splitTolerance : 0);
                    const outOfRange = count < lowerBound || count > upperBound;
                    const rangeWarning = templateSplitStrategy === 'punctuation' && count > upperBound
                      ? ' · 超过最大值'
                      : ' · 超出范围';
                    const boundImage = getSegmentImage(item, globalIndex >= 0 ? globalIndex : index);
                    const isCopied = copiedSegmentIds.has(item.id);

                    const sourceIdx = item.sourceIndex ?? 0;
                    const palette = SCRIPT_PALETTES[sourceIdx % SCRIPT_PALETTES.length];
                    const segmentsInSameSource = segmentRenderIndex.groups.get(sourceIdx) || [];
                    const rankInSource = segmentsInSameSource.findIndex(s => s.id === item.id) + 1;
                    const totalInSource = segmentsInSameSource.length;

                    const prevItem = index > 0 ? displayedTemplateSegments[index - 1] : null;
                    const isFirstInSourceGroup = index === 0 || (prevItem && (prevItem.sourceIndex ?? 0) !== sourceIdx);

                    const isCurrentMatch = highlightedSegmentId === item.id;
                    const isMatched = searchKeyword.trim().length > 0 && matchedSegmentIds.includes(item.id);

                    return (
                      <tr
                        key={item.id}
                        id={`segment-row-${item.id}`}
                        className={`transition-all duration-200 border-b border-slate-800/90 ${
                          isFirstInSourceGroup && index > 0 ? 'border-t-2 border-t-slate-500/80 shadow-[0_-2px_4px_rgba(0,0,0,0.5)]' : ''
                        } ${
                          isCurrentMatch
                            ? 'ring-2 ring-amber-400 bg-amber-950/45 shadow-[0_0_25px_rgba(251,191,36,0.35)] z-10 relative'
                            : isMatched
                            ? 'bg-amber-950/20 border-l-4 border-l-amber-500/80'
                            : selectedSegmentIds.has(item.id)
                            ? 'bg-blue-950/30 hover:bg-blue-950/40 border-l-4 border-l-blue-500'
                            : item.modifiedType && MODIFIED_TYPE_CONFIG[item.modifiedType]
                            ? `${MODIFIED_TYPE_CONFIG[item.modifiedType].rowBg} ${MODIFIED_TYPE_CONFIG[item.modifiedType].rowHover} border-l-4 ${MODIFIED_TYPE_CONFIG[item.modifiedType].borderLeft} ${MODIFIED_TYPE_CONFIG[item.modifiedType].shadow}`
                            : isCopied
                            ? 'bg-emerald-950/20 hover:bg-emerald-950/30 border-l-4 border-l-emerald-500'
                            : `${palette.rowBg} ${palette.rowHover} border-l-4 ${palette.borderLeft}`
                        }`}
                      >
                        {/* Checkbox / Index */}
                        {columnVisibility.index && (
                          <td className="border border-slate-800 p-2 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={selectedSegmentIds.has(item.id)}
                              onChange={e => setSelectedSegmentIds(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(item.id) : next.delete(item.id);
                                return next;
                              })}
                              className="rounded text-blue-500 focus:ring-blue-400 cursor-pointer"
                            />
                            <div className="mt-1 text-[10px] font-mono flex flex-col items-center justify-center gap-0.5">
                              <div className="flex items-center justify-center gap-1">
                                {isCopied ? <Check className="w-3 h-3 text-emerald-400 inline" /> : null}
                                <span className={isCurrentMatch ? 'text-amber-300 font-bold' : isCopied ? 'text-emerald-400 font-bold' : isMatched ? 'text-amber-200' : 'text-slate-400'}>
                                  #{globalIndex >= 0 ? globalIndex + 1 : index + 1}
                                </span>
                                {batchTemplateMode && isFirstInSourceGroup && (
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${palette.dotColor} shrink-0`}
                                    title={`所属文案：篇章 #${sourceIdx + 1}`}
                                  />
                                )}
                              </div>
                              {isCurrentMatch ? (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-400 text-slate-950 text-[9px] font-extrabold shadow-sm animate-pulse">
                                  <Crosshair className="w-2.5 h-2.5" /> 定位
                                </span>
                              ) : isMatched ? (
                                <span className="text-[9px] text-amber-400/80 font-semibold">命中</span>
                              ) : null}
                              {item.modifiedType && MODIFIED_TYPE_CONFIG[item.modifiedType] && (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold border ${MODIFIED_TYPE_CONFIG[item.modifiedType].bg} ${MODIFIED_TYPE_CONFIG[item.modifiedType].text} ${MODIFIED_TYPE_CONFIG[item.modifiedType].border}`}
                                  title={`该段经过：${MODIFIED_TYPE_CONFIG[item.modifiedType].label}`}
                                >
                                  <span>{MODIFIED_TYPE_CONFIG[item.modifiedType].icon}</span>
                                  <span>{MODIFIED_TYPE_CONFIG[item.modifiedType].shortLabel}</span>
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 第一列：图 */}
                        {columnVisibility.image && (
                          <td
                          className="border border-slate-800 p-2 align-top text-center"
                          onDragOver={e => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              handleDropImageOnSegmentRow(item.id, e.dataTransfer.files[0]);
                            }
                          }}
                        >
                          {boundImage ? (
                            <div className="flex flex-col items-center gap-1">
                              <div
                                className={`relative group w-24 h-20 rounded-md border overflow-hidden bg-slate-950 flex items-center justify-center shadow-sm cursor-pointer transition ${
                                  isCopied ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-slate-700 hover:border-slate-500'
                                }`}
                                onContextMenu={e => {
                                  e.preventDefault();
                                  handleCopySegmentImage(boundImage, item.id);
                                }}
                                title="右键或悬浮点击复制原始图片（自动标记）"
                              >
                                <img loading="lazy" decoding="async" src={boundImage.url} alt={boundImage.name} className="max-w-full max-h-full object-contain" />
                                <span className="absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-bold bg-black/80 text-white">
                                  #{index + 1}
                                </span>
                                {item.imageId && item.imageId !== '__NONE__' && (
                                  <span className="absolute top-0.5 right-0.5 px-1 rounded text-[7px] font-bold bg-amber-600 text-white flex items-center shadow" title="已手动指定此分镜图片">
                                    自选
                                  </span>
                                )}
                                {isCopied && !(item.imageId && item.imageId !== '__NONE__') && (
                                  <span className="absolute top-0.5 right-0.5 px-1 rounded text-[8px] font-bold bg-emerald-600 text-white flex items-center shadow">
                                    ✓
                                  </span>
                                )}
                                {boundImage.gyazoUrl && (
                                  <span className="absolute bottom-0.5 right-0.5 text-emerald-400 bg-black/80 rounded p-0.5" title="已上传Gyazo缩略图公式">
                                    <Cloud className="w-2.5 h-2.5" />
                                  </span>
                                )}
                                <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleCopySegmentImage(boundImage, item.id)}
                                    className="text-white text-[10px] bg-sky-600 hover:bg-sky-500 p-1 rounded"
                                    title="复制图片位图"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setImagePickerTarget({
                                        segmentId: item.id,
                                        segmentIndex: globalIndex >= 0 ? globalIndex : index,
                                        segmentText: item.text,
                                        sourceIndex: item.sourceIndex,
                                      });
                                    }}
                                    className="text-white text-[10px] bg-amber-600 hover:bg-amber-500 p-1 rounded"
                                    title="挑选/更换此分镜的图片"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                  </button>
                                  <a
                                    href={boundImage.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-white text-[10px] bg-black/70 hover:bg-black/90 p-1 rounded"
                                    title="预览大图"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>

                              <div className="flex items-center justify-center gap-1 w-full px-0.5">
                                <span className={`text-[10px] font-mono max-w-[70px] truncate ${
                                  searchKeyword.trim() && boundImage.name.toLowerCase().includes(searchKeyword.trim().toLowerCase())
                                    ? 'text-amber-300 font-bold bg-amber-950/80 px-1 rounded'
                                    : 'text-slate-400'
                                }`} title={boundImage.name}>
                                  {boundImage.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImagePickerTarget({
                                      segmentId: item.id,
                                      segmentIndex: globalIndex >= 0 ? globalIndex : index,
                                      segmentText: item.text,
                                      sourceIndex: item.sourceIndex,
                                    });
                                  }}
                                  className="text-[9px] text-sky-400 hover:text-sky-300 underline underline-offset-1 shrink-0 cursor-pointer"
                                  title="更换分镜配图"
                                >
                                  换图
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyImageAssignment(boundImage.id)}
                                  className="text-[9px] text-violet-300 hover:text-violet-100 underline underline-offset-1 shrink-0 cursor-pointer"
                                  title="复制本行图片分配，可粘贴到其它分镜"
                                >
                                  复制分配
                                </button>
                                {copiedImageAssignmentId && (
                                  <button
                                    type="button"
                                    onClick={() => handlePasteImageAssignment(item.id)}
                                    className="text-[9px] text-emerald-300 hover:text-emerald-100 underline underline-offset-1 shrink-0 cursor-pointer"
                                    title="将已复制的图片分配粘贴到本行；允许重复使用同一张图"
                                  >
                                    粘贴分配
                                  </button>
                                )}
                              </div>

                              {/* 状态与快速复制胶囊 */}
                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => toggleSegmentCopied(item.id, boundImage.id)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer font-medium ${
                                    isCopied
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/80'
                                      : 'bg-[#14203a] text-slate-400 border border-slate-700 hover:text-slate-200'
                                  }`}
                                  title={isCopied ? "点击取消已复制标记" : "点击标记为已复制"}
                                >
                                  {isCopied ? '已复制' : '待复制'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopySegmentImage(boundImage, item.id)}
                                  className="px-1.5 py-0.5 rounded bg-[#14203a] hover:bg-[#1d2f54] text-slate-300 text-[10px] border border-slate-700 transition cursor-pointer"
                                  title="快速复制原始图片位图"
                                >
                                  复制图
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await copyToClipboard(getSegmentFinalPrompt(item));
                                    markSegmentCopied(item.id, boundImage.id);
                                    showToastNotification('✅ 已复制最终描述词（已标记）');
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-[10px] border border-indigo-700/60 transition cursor-pointer"
                                  title="复制本分镜的最终描述词"
                                >
                                  复制词
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setImagePickerTarget({
                                  segmentId: item.id,
                                  segmentIndex: globalIndex >= 0 ? globalIndex : index,
                                  segmentText: item.text,
                                  sourceIndex: item.sourceIndex,
                                });
                              }}
                              className="py-3 px-1.5 flex flex-col items-center justify-center text-slate-400 hover:text-sky-300 border border-dashed border-slate-700 hover:border-sky-500 rounded-lg bg-slate-900/40 hover:bg-sky-950/20 cursor-pointer transition group/drop"
                              title="点击为该分镜选择或上传图片，亦可直接拖拽图片文件到此"
                            >
                              <ImageIcon className="w-5 h-5 opacity-40 group-hover/drop:opacity-90 group-hover/drop:scale-110 mb-1 transition text-sky-400" />
                              <span className="text-[10px] font-medium text-slate-300 group-hover/drop:text-sky-300">
                                选图 / 上传
                              </span>
                              <span className="text-[8px] text-slate-500">可拖入图片</span>
                              {copiedImageAssignmentId && (
                                <button
                                  type="button"
                                  onClick={event => { event.stopPropagation(); handlePasteImageAssignment(item.id); }}
                                  className="mt-1 rounded border border-emerald-700 bg-emerald-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 hover:bg-emerald-900"
                                  title="把已复制的图片分配粘贴到本分镜"
                                >
                                  粘贴图片分配
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}

                        {/* 第二列：原始文案 */}
                        <td className="border border-slate-800 p-2 align-top">
                          <div className="flex flex-col h-full">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                {batchTemplateMode && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${palette.badgeBg} ${palette.badgeText} border ${palette.badgeBorder} flex items-center gap-1 shadow-sm`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${palette.dotColor}`} />
                                    篇章 #{sourceIdx + 1}
                                  </span>
                                )}
                                {batchTemplateMode && totalInSource > 1 && (
                                  <span className={`text-[10px] font-mono font-medium ${palette.accentText} bg-black/40 px-1.5 py-0.5 rounded border border-white/10`}>
                                    段 {rankInSource}/{totalInSource}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {getSegmentSourceText(item.sourceIndex).length} 字
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const viewer = document.getElementById(`source-viewer-${item.id}`);
                                    const currentSegment = viewer?.querySelector<HTMLElement>('[data-current-source-segment="true"]');
                                    if (viewer && currentSegment) {
                                      viewer.scrollTop = Math.max(0, currentSegment.offsetTop - (viewer.clientHeight - currentSegment.offsetHeight) / 2);
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded border border-emerald-700/70 bg-emerald-950/50 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/60 transition cursor-pointer"
                                  title="在完整原文中定位本行拆分片段"
                                >
                                  定位片段
                                </button>
                              </div>
                            </div>
                            <div
                              id={`source-viewer-${item.id}`}
                              className={`h-32 p-2 rounded ${palette.cardBg} border ${palette.cardBorder} text-xs text-slate-200 leading-relaxed overflow-y-auto whitespace-pre-wrap select-text font-sans shadow-inner scrollbar-thin`}
                              title={`完整原始文案（篇章 #${sourceIdx + 1}）`}
                              ref={node => {
                                if (!node) return;
                                requestAnimationFrame(() => {
                                  const currentSegment = node.querySelector<HTMLElement>('[data-current-source-segment="true"]');
                                  if (currentSegment) {
                                    // 只移动这一格原文自己的滚动条，结果表不会因此跳动。
                                    node.scrollTop = Math.max(0, currentSegment.offsetTop - (node.clientHeight - currentSegment.offsetHeight) / 2);
                                  }
                                });
                              }}
                            >
                              {getSegmentSourceText(item.sourceIndex) ? (
                                highlightSourceSegment(getSegmentSourceText(item.sourceIndex), item.text, searchKeyword)
                              ) : (
                                <span className="text-slate-600 italic">（无原始文案）</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 第三列：拆分文案 */}
                        <td className="border border-slate-800 p-2 align-top">
                          {item.annotation && <label className="mb-1 flex items-center gap-2 text-[11px] text-amber-300">片段标注<input value={item.annotation} onChange={event => updateSegmentFields(item.id, { annotation: event.target.value })} className="w-24 rounded border border-amber-700 bg-amber-950 px-2 py-1" /></label>}
                          {item.durationSeconds !== undefined && <label className="mb-1 flex items-center gap-2 text-[11px] text-amber-300">时长<input type="number" min="0.1" step="0.1" value={item.durationSeconds} onChange={event => { const value = Number(event.target.value); if (value > 0) updateSegmentFields(item.id, { durationSeconds: value }); }} className="w-20 rounded border border-amber-700 bg-amber-950 px-2 py-1" />秒</label>}
                          <textarea
                            className="w-full h-32 min-h-32 border border-slate-700/80 rounded p-2 resize-none text-xs leading-relaxed bg-[#070d1c] text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                            value={item.text}
                            onChange={e => updateTemplateSegment(item.id, e.target.value)}
                            onSelect={e => {
                              const caret = e.currentTarget.selectionStart;
                              setSegmentCarets(prev => ({ ...prev, [item.id]: caret }));
                            }}
                          />
                          {(quoteSplitSegments || lowercaseSplitOutput) && (
                            <div className="mt-1 rounded border border-cyan-800/60 bg-cyan-950/40 px-2 py-0.5 text-[11px] leading-tight text-cyan-200 truncate">
                              <span className="text-cyan-400 mr-1 font-semibold">输出:</span>
                              {getSegmentOutputText(item)}
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono text-[11px] ${outOfRange ? 'text-amber-400 font-medium' : 'text-slate-400'}`}>
                                {count} {splitUnit === 'words' ? '词' : '字'}{outOfRange ? rangeWarning : ''}
                              </span>
                              {searchKeyword.trim() && item.text.toLowerCase().includes(searchKeyword.trim().toLowerCase()) && (
                                <span className="px-1 py-0.2 text-[9px] font-bold rounded bg-amber-950/80 border border-amber-600/70 text-amber-300">
                                  命中拆分
                                </span>
                              )}
                              {item.modifiedType && MODIFIED_TYPE_CONFIG[item.modifiedType] && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border shadow-xs ${MODIFIED_TYPE_CONFIG[item.modifiedType].bg} ${MODIFIED_TYPE_CONFIG[item.modifiedType].text} ${MODIFIED_TYPE_CONFIG[item.modifiedType].border}`}
                                  title={`此段落变动：${MODIFIED_TYPE_CONFIG[item.modifiedType].label}${item.modifiedAt ? ` (${new Date(item.modifiedAt).toLocaleTimeString()})` : ''}`}
                                >
                                  <span>{MODIFIED_TYPE_CONFIG[item.modifiedType].icon}</span>
                                  <span>{MODIFIED_TYPE_CONFIG[item.modifiedType].label}</span>
                                </span>
                              )}
                            </div>

                            {/* 行内高频微调操作：一键直达，不占额外高度 */}
                            <div className="flex items-center gap-1 shrink-0 flex-wrap">
                              <button
                                type="button"
                                onClick={() => splitSegmentAtCaretDirectly(item.id)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-950/90 hover:bg-blue-800 text-blue-200 border border-blue-600/70 transition cursor-pointer text-[10px] font-medium shadow-xs"
                                title="光标点中文案后，点击直接在光标处一键切分为两段"
                              >
                                <Scissors className="w-2.5 h-2.5 text-blue-400" />
                                <span>光标拆分</span>
                              </button>

                              {hasNextInSameSource && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => mergeWithNextSegment(item.id)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-950/90 hover:bg-violet-800 text-violet-200 border border-violet-600/70 transition cursor-pointer text-[10px] font-medium shadow-xs"
                                    title="将当前段与下一段直接合并"
                                  >
                                    <Combine className="w-2.5 h-2.5 text-violet-400" />
                                    <span>合并下段</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => moveRemainderToNextSegment(item.id, false)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-950/90 hover:bg-cyan-800 text-cyan-200 border border-cyan-600/70 transition cursor-pointer text-[10px] font-medium shadow-xs"
                                    title="光标点中文案后，将光标后的多余文字后移到下一段"
                                  >
                                    <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
                                    <span>后移</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => autoSplitCurrentSegment(item.id)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600/70 transition cursor-pointer text-[10px] shadow-xs"
                                title="按当前设置字数范围重新拆分本段"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                <span>重拆</span>
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 第四列：断行文案 */}
                        {columnVisibility.wrappedText && (
                          <td className="border border-slate-800 p-2 align-top">
                            <textarea
                              className="w-full h-32 min-h-32 border border-slate-700/80 rounded p-2 resize-none text-xs leading-relaxed bg-[#070d1c] text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                              value={getSegmentWrappedText(item)}
                              onChange={e => updateSegmentFields(item.id, { wrappedText: e.target.value })}
                            />
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span>目标 {lineWidth} 字符/行</span>
                              <button
                                type="button"
                                onClick={() => updateSegmentFields(item.id, { wrappedText: undefined })}
                                className="text-sky-400 hover:text-sky-300 transition hover:underline cursor-pointer"
                              >
                                恢复自动
                              </button>
                            </div>
                          </td>
                        )}

                        {/* 第五列：预设 */}
                        {columnVisibility.preset && (
                          <td className="border border-slate-800 p-2 align-top">
                            <div className="flex flex-col gap-1.5">
                              <select
                                className="w-full border border-slate-700/80 rounded px-2 py-1.5 text-xs bg-[#070d1c] text-slate-200 outline-none focus:border-indigo-500 transition"
                                value={item.presetId || templatePresets.find(preset => preset.template === (item.promptTemplate ?? getEffectiveSegmentTemplate(item)))?.id || ''}
                                onChange={e => {
                                  const preset = templatePresets.find(p => p.id === e.target.value);
                                  // 从主表格直接选择预设，也应立即进入分镜模式并影响最终描述词。
                                  setStoryboardMode(true);
                                  setPerSourceTemplateMode(false);
                                  if (preset) {
                                    updateSegmentFields(item.id, { presetId: preset.id, promptTemplate: preset.template, finalPrompt: undefined });
                                  } else {
                                    updateSegmentFields(item.id, { presetId: undefined, promptTemplate: undefined, finalPrompt: undefined });
                                  }
                                }}
                              >
                                <option value="">🌐 使用统一模板</option>
                                {templatePresets.map(preset => (
                                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                                ))}
                              </select>
                              {item.promptTemplate && (
                                <div className="flex items-center justify-between text-[10px] text-indigo-400">
                                  <span className="bg-indigo-950/70 border border-indigo-800/60 px-1.5 py-0.5 rounded">自定义预设</span>
                                  <button
                                    type="button"
                                    onClick={() => updateSegmentFields(item.id, { presetId: undefined, promptTemplate: undefined, finalPrompt: undefined })}
                                    className="text-slate-400 hover:text-slate-200 cursor-pointer"
                                  >
                                    恢复统一
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* 第六列：最终描述词 */}
                        {columnVisibility.finalPrompt && (
                          activeMultiPresets.length > 0 ? (
                            activeMultiPresets.map(preset => {
                              const promptVal = getSegmentPromptForPreset(item, preset);
                              const hasCustom = item.customPrompts?.[preset.id] !== undefined;
                              return (
                                <td key={preset.id} className="border border-slate-800 p-2 align-top">
                                  <textarea
                                    className="w-full h-32 min-h-32 border border-slate-700/80 rounded p-2 resize-none text-xs leading-relaxed bg-[#070d1c] text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                                    value={promptVal}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setTemplateSegments(prev => prev.map(seg => {
                                        if (seg.id !== item.id) return seg;
                                        return {
                                          ...seg,
                                          customPrompts: {
                                            ...(seg.customPrompts || {}),
                                            [preset.id]: val
                                          }
                                        };
                                      }));
                                    }}
                                  />
                                  <div className="mt-1.5 flex justify-between items-center text-[11px]">
                                    <span className="text-indigo-400 font-medium truncate max-w-[100px]">{preset.name}</span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await copyToClipboard(promptVal);
                                          markSegmentCopied(item.id, boundImage?.id);
                                          showToastNotification(`✅ 已复制【${preset.name}】描述词（已标记）`);
                                        }}
                                        className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-0.5 transition cursor-pointer"
                                        title="复制该预设描述词并标记"
                                      >
                                        <Copy className="w-2.5 h-2.5" />
                                        复制
                                      </button>
                                      {hasCustom && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setTemplateSegments(prev => prev.map(seg => {
                                              if (seg.id !== item.id) return seg;
                                              const nextPrompts = { ...(seg.customPrompts || {}) };
                                              delete nextPrompts[preset.id];
                                              return { ...seg, customPrompts: nextPrompts };
                                            }));
                                          }}
                                          className="text-slate-500 hover:text-slate-400 text-[10px]"
                                        >
                                          恢复自动
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              );
                            })
                          ) : (
                            <td className="border border-slate-800 p-2 align-top">
                              <textarea
                                className="w-full h-32 min-h-32 border border-slate-700/80 rounded p-2 resize-none text-xs leading-relaxed bg-[#070d1c] text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                                value={getSegmentFinalPrompt(item)}
                                onChange={e => updateSegmentFields(item.id, { finalPrompt: e.target.value })}
                              />
                              <div className="mt-1.5 flex justify-between items-center text-[11px]">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await copyToClipboard(getSegmentFinalPrompt(item));
                                    markSegmentCopied(item.id, boundImage?.id);
                                    showToastNotification('✅ 已复制最终描述词（已标记）');
                                  }}
                                  className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 transition cursor-pointer"
                                  title="复制描述词并自动标记为已复制"
                                >
                                  <Copy className="w-3 h-3" />
                                  复制描述词
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateSegmentFields(item.id, { finalPrompt: undefined })}
                                  className="text-slate-500 hover:text-slate-400 text-[10px] transition cursor-pointer"
                                >
                                  恢复自动
                                </button>
                              </div>
                            </td>
                          )
                        )}

                        {/* 操作列 */}
                        <td className="border border-slate-800 p-2 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(item.id)}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                            title="删除该段（支持撤销）"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filterUncopiedOnly && displayedTemplateSegments.length === 0 && visibleTemplateSegments.length > 0 && (
                    <tr>
                      <td
                        colSpan={visibleColumnCount}
                        className="p-8 text-center bg-emerald-950/30 border border-emerald-800/60 rounded-lg"
                      >
                        <div className="max-w-md mx-auto flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full bg-emerald-900/60 flex items-center justify-center text-emerald-400 mb-2 shadow-inner border border-emerald-600/40">
                            <CheckCircle2 className="w-7 h-7" />
                          </div>
                          <h4 className="text-base font-bold text-emerald-300">🎉 所有分镜均已复制完成！</h4>
                          <p className="text-xs text-emerald-400/90 mt-1 mb-3">
                            当前列表中的全部 {visibleTemplateSegments.length} 个分镜均已成功标记为已复制。
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFilterUncopiedOnly(false)}
                              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                            >
                              查看完整表格
                            </button>
                            <button
                              type="button"
                              onClick={resetAllCopiedMarks}
                              className="px-3 py-1.5 rounded-md bg-[#182645] border border-slate-700 hover:bg-[#20335e] text-slate-200 text-xs font-medium transition cursor-pointer"
                            >
                              重置标记
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filterModifiedOnly && displayedTemplateSegments.length === 0 && visibleTemplateSegments.length > 0 && (
                    <tr>
                      <td
                        colSpan={visibleColumnCount}
                        className="p-8 text-center bg-slate-900/60 border border-slate-700/60 rounded-lg"
                      >
                        <div className="max-w-md mx-auto flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-amber-400 mb-2 shadow-inner border border-slate-600/40">
                            <Sparkles className="w-6 h-6" />
                          </div>
                          <h4 className="text-base font-bold text-slate-200">当前没有已修改的分镜段落</h4>
                          <p className="text-xs text-slate-400 mt-1 mb-3">
                            在拆分、重拆、移动文字、合并或手动编辑文本后，被调整过的段落会自动高亮并归类在此。
                          </p>
                          <button
                            type="button"
                            onClick={() => setFilterModifiedOnly(false)}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                          >
                            查看全部段落
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!templateSegments.length && (
                    <tr>
                      <td
                        colSpan={visibleColumnCount}
                        className="border border-slate-800 py-12 text-center text-slate-500"
                      >
                        设置文案和模板后点击“开始拆分”
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}

              </div>
            </div>

            {showTemplateCopyGuide && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-5" onClick={() => setShowTemplateCopyGuide(false)}>
                <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-md border border-slate-500 bg-[#14233a] text-slate-100 shadow-2xl" onClick={event => event.stopPropagation()}>
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-600 bg-[#14233a] px-5 py-3">
                    <div><h4 className="text-base font-semibold">复制到表格后的格式</h4><p className="mt-0.5 text-xs text-slate-400">每个蓝色方格代表谷歌表格中的一个单元格</p></div>
                    <button type="button" onClick={() => setShowTemplateCopyGuide(false)} className="rounded border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs text-white">关闭</button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                    {[
                      ['逐片段复制文案', '每个拆分片段占一行一格', [['文案1 · 片段1'], ['文案1 · 片段2'], ['文案2 · 片段1']]],
                      ['逐片段复制描述词', '每个片段的最终描述词占一行一格', [['片段1完整描述词'], ['片段2完整描述词']]],
                      ['横向复制描述词', '每个描述词一格，全部排在同一行', [['描述词1', '描述词2', '描述词3']]],
                      ['逐片段复制双列', '每个片段占一行，文案和描述词分两列', [['片段1文案', '片段1完整描述词'], ['片段2文案', '片段2完整描述词']]],
                      ['按整篇复制文案', '每篇原文占一格，该篇各片段在格内空一行', [['文案1片段1\n\n文案1片段2'], ['文案2片段1\n\n文案2片段2']]],
                      ['按整篇复制描述词', '每篇原文的全部描述词带编号放在一格内', [['1. 文案1描述词1\n\n2. 文案1描述词2'], ['1. 文案2描述词1\n\n2. 文案2描述词2']]],
                      ['按整篇复制双列', '每篇原文占一行，全部文案和描述词分两列', [['文案1所有片段', '文案1所有描述词'], ['文案2所有片段', '文案2所有描述词']]],
                      ['按整篇复制文案+断行+描述词', '每篇占一行，依次粘贴为三列', [['文案1所有片段', '文案1断行结果', '1. 文案1描述词1\n\n2. 文案1描述词2']]],
                      ['全部文案放入一格', '所有已选或全部片段放进同一个单元格', [['片段1\n\n片段2\n\n片段3']]]
                    ].map(([title, description, rows]) => (
                      <section key={title as string} className="border border-slate-600 bg-[#0e1b30] p-3">
                        <h5 className="text-sm font-semibold text-slate-100">{title as string}</h5>
                        <p className="mb-2 mt-1 text-xs text-slate-400">{description as string}</p>
                        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(...(rows as string[][]).map(row => row.length))}, minmax(120px, 1fr))` }}>
                          {(rows as string[][]).flatMap((row, rowIndex) => row.map((cell, cellIndex) => <div key={`${rowIndex}-${cellIndex}`} className="whitespace-pre-wrap border border-blue-400 bg-blue-950 px-2 py-1.5 text-[11px] text-blue-100">{cell}</div>))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className="border-t border-slate-600 px-5 py-3 text-xs text-slate-300">已勾选片段时只复制勾选结果；没有勾选时复制全部结果。“按整篇”会把选中片段按它们所属的原文重新归组；可通过工具栏上的“整篇设置”自定义文案或描述词是否添加编号、编号样式（1. / 1、 / (1) / [1]）以及是否保留空行（默认无空行紧凑排版）。</div>
                </div>
              </div>
            )}

            {expandedEditor && (
              <div className="absolute inset-0 z-30 flex flex-col bg-[#101d32]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-slate-600 px-5 py-3">
                  <div className="text-sm font-semibold text-slate-100">{expandedEditor === 'source' ? '放大编辑：原始文案' : '放大编辑：完整描述词模板'}</div>
                  <div className="flex items-center gap-2">
                    <button type="button" title="撤销" onClick={() => undoEditor(expandedEditor)} className="rounded border border-slate-500 bg-slate-800 p-1.5 text-slate-200"><Undo2 className="w-4 h-4" /></button>
                    <button type="button" title="重做" onClick={() => redoEditor(expandedEditor)} className="rounded border border-slate-500 bg-slate-800 p-1.5 text-slate-200"><Redo2 className="w-4 h-4" /></button>
                    {expandedEditor === 'source' && <button type="button" onClick={insertManualSplitMarker} className="inline-flex items-center gap-1 rounded border border-cyan-400 bg-cyan-900 px-3 py-1.5 text-xs font-medium text-cyan-100"><Scissors className="w-3.5 h-3.5" />在光标处添加拆分点</button>}
                    {expandedEditor === 'source' && batchTemplateMode && <button type="button" onClick={insertBatchSourceMarker} className="inline-flex items-center gap-1 rounded border border-violet-400 bg-violet-900 px-3 py-1.5 text-xs font-medium text-violet-100">在光标处添加下一篇</button>}
                    {expandedEditor === 'source' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShowImportSegmentsModal(true);

                          }}
                          className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-emerald-950/80 px-3 py-1.5 text-xs font-bold text-emerald-200 cursor-pointer hover:bg-emerald-900 transition"
                        >
                          <Grid3X3 className="w-3.5 h-3.5" />
                          从表格导入 / 已拆分粘贴
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handle8sSermonSplit();
                            setExpandedEditor(null);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-950/80 px-3 py-1.5 text-xs font-bold text-amber-200 cursor-pointer hover:bg-amber-900 transition"
                          title="【8秒讲道口播拆分】消除所有换行、数字转英文、按8s自然语速(16-20词)断句并加引号引用"
                        >
                          🎙️ 8秒讲道拆分
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSplitByNewlines();
                            setExpandedEditor(null);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-sky-400 bg-sky-900 px-3 py-1.5 text-xs font-medium text-sky-100 cursor-pointer"
                        >
                          按换行生成
                        </button>
                      </>
                    )}
                    {expandedEditor === 'source' && <button type="button" onClick={() => { runManualPointSplit(); setExpandedEditor(null); }} className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-emerald-900 px-3 py-1.5 text-xs font-medium text-emerald-100">按拆分点生成</button>}
                    {expandedEditor === 'template' && <button type="button" onClick={insertContentPlaceholder} className="inline-flex items-center gap-1 rounded border border-blue-400 bg-blue-900 px-3 py-1.5 text-xs font-medium text-blue-100"><FileInput className="w-3.5 h-3.5" />在光标处插入内容块</button>}
                    <button type="button" onClick={() => setExpandedEditor(null)} className="rounded border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-medium text-white">完成并关闭</button>
                  </div>
                </div>
                <HighlightedTextarea
                  ref={expandedEditor === 'template' ? promptTemplateRef : templateSourceRef}
                  autoFocus
                  containerClassName="flex-1 min-h-0 m-4"
                  className="absolute inset-0 w-full h-full resize-none rounded-md border border-slate-500 bg-[#0b1628] p-4 text-base leading-7 outline-none focus:border-blue-400"
                  value={expandedEditor === 'source' ? templateSource : promptTemplate}
                  onChange={e => setEditorValue(expandedEditor, e.target.value)}
                  onPaste={expandedEditor === 'source' ? handleTemplateSourcePaste : undefined}
                  onKeyDown={e => handleEditorShortcut(e, expandedEditor)}
                  placeholder={expandedEditor === 'source' ? '输入需要拆分的完整文案' : '粘贴完整描述词，把光标放到文案应出现的位置'}
                />
              </div>
            )}

            <QuickImagePromptModal
              isOpen={showQuickImagePrompt}
              onClose={() => setShowQuickImagePrompt(false)}
              presets={templatePresets}
            />

            <PresetLibraryModal
              isOpen={showPresetLibraryModal}
              onClose={() => setShowPresetLibraryModal(false)}
              presets={templatePresets}
              onSavePresets={(nextPresets) => {
                persistTemplatePresets(nextPresets);
                setStatusMsg(`已更新预设库，共 ${nextPresets.length} 个预设`);
              }}
              onApplyPreset={(preset) => {
                setEditorValue('template', preset.template);
                setSelectedPresetId(preset.id);
                setPresetName(preset.name);
                setStatusMsg(`已载入预设“${preset.name}”`);
              }}
              currentTemplate={promptTemplate}
              multiPresetIds={multiPresetIds}
              onUpdateMultiPresetIds={(ids) => setMultiPresetIds(ids)}
              onCycleFillPresets={(ids, mode) => applyCyclePresets(ids, mode, 'all')}
            />

            <CyclePresetModal
              isOpen={showCyclePresetModal}
              onClose={() => setShowCyclePresetModal(false)}
              presets={templatePresets}
              totalSegmentsCount={templateSegments.length}
              selectedSegmentsCount={selectedSegmentIds.size}
              batchCount={batchSourceIndexes.length || 1}
              onApplyCycle={applyCyclePresets}
              onResetAllToUnified={resetAllSegmentsToUnifiedPreset}
              onOpenPresetLibrary={() => setShowPresetLibraryModal(true)}
            />

            {showImageGroupAssignment && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowImageGroupAssignment(false)}>
                <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0d1729] text-slate-100 shadow-2xl" onClick={event => event.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-slate-700 bg-[#13203a] px-5 py-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold"><ImageIcon className="h-5 w-5 text-violet-300" />分配图片组给文案</h3>
                      <p className="mt-0.5 text-xs text-slate-400">每篇文案选择一个图片组；同一组可重复分配给多篇。分配后，在下方“文案 N”标签点“排序图片”逐段安排。</p>
                    </div>
                    <button type="button" onClick={() => setShowImageGroupAssignment(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="overflow-y-auto p-5">
                    {batchSourceIndexes.map(sourceIndex => {
                      const selectedKey = sourceImageGroupBindings[sourceIndex];
                      const sourceText = (batchTemplateDrafts[sourceIndex]?.source || templateSegments.find(segment => (segment.sourceIndex ?? 0) === sourceIndex)?.text || '').replace(MANUAL_SPLIT_MARKER, ' ').replace(/\s+/g, ' ').trim();
                      return <section key={sourceIndex} className="mb-4 rounded-xl border border-slate-700 bg-[#101a2f] p-4 last:mb-0">
                        <div className="mb-3 flex items-start justify-between gap-4"><div><div className="font-bold text-slate-100">文案 {sourceIndex + 1}</div><div className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400 line-clamp-2">{sourceText || '暂无文案内容'}</div></div>{selectedKey && <button type="button" onClick={() => setSourceImageGroupBindings(current => { const next = { ...current }; delete next[sourceIndex]; return next; })} className="shrink-0 rounded border border-rose-700/70 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950/50">解除分配</button>}</div>
                        <div className="flex gap-3 overflow-x-auto pb-1">
                          {imageGroups.map(group => {
                            const selected = selectedKey === group.key;
                            const assignedSources = Object.entries(sourceImageGroupBindings)
                              .filter(([, groupKey]) => groupKey === group.key)
                              .map(([assignedSourceIndex]) => Number(assignedSourceIndex) + 1)
                              .sort((a, b) => a - b);
                            return <button key={group.key} type="button" onClick={() => setSourceImageGroupBindings(current => ({ ...current, [sourceIndex]: group.key }))} className={`flex w-56 shrink-0 flex-col rounded-lg border p-2 text-left transition ${selected ? 'border-emerald-400 bg-emerald-950/35 ring-1 ring-emerald-400/50' : 'border-slate-700 bg-[#0a1221] hover:border-violet-400'}`}>
                              <div className="flex h-28 w-[63px] items-center justify-center rounded bg-black"><img loading="lazy" decoding="async" src={group.images[0]?.url} alt={group.key} className="h-full w-full object-cover" /></div>
                              <span className="mt-2 w-full whitespace-normal break-all text-[11px] font-semibold leading-relaxed text-slate-200">{group.key}</span><span className="mt-0.5 text-[10px] text-slate-500">{group.images.length} 张 · 可重复</span>
                              {assignedSources.length > 0 && <span className="mt-1 rounded bg-emerald-950/70 px-1.5 py-1 text-[10px] font-semibold leading-snug text-emerald-200">已分配：文案 {assignedSources.join('、')}</span>}
                            </button>;
                          })}
                        </div>
                      </section>;
                    })}
                  </div>
                  <div className="flex justify-end border-t border-slate-800 bg-[#101a2e] px-5 py-3"><button type="button" onClick={() => { setShowImageGroupAssignment(false); setStatusMsg('图片组分配已保存；请在对应“文案”标签点“排序图片”继续逐段分配'); }} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500">完成分配</button></div>
                </div>
              </div>
            )}

            {imageOrderSourceIndex !== null && (
              <SourceImageOrderModal
                onGeneratePresetSets={applyGeneratedPresetSets}
                onAddPreset={() => setShowPresetLibraryModal(true)}
                onOpenDelivery={() => { setImageOrderSourceIndex(null); setShowImagePromptSheet(true); }}
                isOpen
                sourceIndex={imageOrderSourceIndex}
                groupBySource={imageBindingMode === 'per-segment'}
                sourceImageGroupBindings={sourceImageGroupBindings}
                imageGroups={imageGroups}
                images={imageBindingMode === 'per-copy'
                  ? attachedImages
                  : imageGroups.find(group => group.key === sourceImageGroupBindings[imageOrderSourceIndex])?.images || attachedImages}
                segments={templateSegments.filter(segment => imageOrderSourceIndex < 0 || (segment.sourceIndex ?? 0) === imageOrderSourceIndex)}
                initialImageAssignments={Object.fromEntries(templateSegments
                  .filter(segment => imageOrderSourceIndex < 0 || (segment.sourceIndex ?? 0) === imageOrderSourceIndex)
                  .map((segment, index) => {
                    const globalIndex = templateSegments.findIndex(item => item.id === segment.id);
                    return [segment.id, getSegmentImage(segment, globalIndex >= 0 ? globalIndex : index)?.id];
                  }))}
                finalPrompts={Object.fromEntries(templateSegments
                  .filter(segment => imageOrderSourceIndex < 0 || (segment.sourceIndex ?? 0) === imageOrderSourceIndex)
                  .map(segment => [segment.id, getSegmentFinalPrompt(segment)]))}
                copiedSegmentIds={copiedSegmentIds}
                presets={templatePresets}
                onCopyImage={(image, segmentId) => handleCopySegmentImage(image, segmentId)}
                onCopyAllImages={handleCopyAllAttachedImages}
                onCopyPrompt={async (prompt, segmentId, image) => {
                  const result = await copyToClipboard(prompt);
                  if (result === 'failed') {
                    showToastNotification('复制描述词失败，请检查浏览器剪贴板权限', 'error');
                    return false;
                  }
                  markSegmentCopied(segmentId, image?.id);
                  showToastNotification('✅ 已复制最终描述词（已标记）');
                  return true;
                }}
                onClose={() => setImageOrderSourceIndex(null)}
                onSaveProject={async (imageAssignments, presetAssignments) => {
                  const snapshot = captureCurrentTabSnapshot();
                  const presetById = new Map(templatePresets.map(preset => [preset.id, preset]));
                  const presetsChanged = snapshot.templateSegments.some(segment => Object.prototype.hasOwnProperty.call(presetAssignments, segment.id) && (segment.presetId !== presetAssignments[segment.id] || segment.promptTemplate !== presetById.get(presetAssignments[segment.id] || '')?.template));
                  snapshot.templateSegments = snapshot.templateSegments.map(segment => ({
                    ...segment,
                    ...(Object.prototype.hasOwnProperty.call(imageAssignments, segment.id) ? { imageId: imageAssignments[segment.id] } : {}),
                    ...(Object.prototype.hasOwnProperty.call(presetAssignments, segment.id) && (segment.presetId !== presetAssignments[segment.id] || segment.promptTemplate !== presetById.get(presetAssignments[segment.id] || '')?.template)
                      ? { presetId: presetAssignments[segment.id], promptTemplate: presetById.get(presetAssignments[segment.id] || '')?.template, finalPrompt: undefined } : {})
                  }));
                  if (presetsChanged) { snapshot.storyboardMode = true; snapshot.perSourceTemplateMode = false; }
                  const api = (window as any).electronAPI;
                  const paths = attachedImages.map(image => { try { return api?.getOriginalFilePath?.(image.file) || ''; } catch { return ''; } });
                  await exportProjectSessionFile({ ...snapshot, templatePresets, tabs: [snapshot], activeTabId }, attachedImages, undefined,
                    api?.saveSplitProjectFile ? async (json, filename) => {
                      const result = await api.saveSplitProjectFile({ json, filename, imagePaths: paths });
                      if (!result?.success) throw new Error(result?.canceled ? '已取消工程文件保存；分配已同步到当前页面' : result?.error || '保存工程失败');
                      setStatusMsg(`整批工程已保存：${result.path}`);
                    } : undefined);
                }}
                onApply={assignments => {
                  setTemplateSegments(current => {
                    let changed = false;
                    const next = current.map(segment => {
                      if (!Object.prototype.hasOwnProperty.call(assignments, segment.id) || segment.imageId === assignments[segment.id]) return segment;
                      changed = true;
                      return { ...segment, imageId: assignments[segment.id] };
                    });
                    return changed ? next : current;
                  });
                  setStatusMsg(imageOrderSourceIndex < 0 ? '已保存全部文案的图片与预设排列' : `已保存文案 ${imageOrderSourceIndex + 1} 的图片排序`);
                }}
                onApplyPresetAssignments={assignments => {
                  setStoryboardMode(true);
                  setPerSourceTemplateMode(false);
                  const presetById = new Map(templatePresets.map(preset => [preset.id, preset]));
                  setTemplateSegments(current => {
                    let changed = false;
                    const next = current.map(segment => {
                      if (!Object.prototype.hasOwnProperty.call(assignments, segment.id)) return segment;
                      const template = presetById.get(assignments[segment.id] || '')?.template;
                      if (segment.promptTemplate === template && segment.presetId === assignments[segment.id]) return segment;
                      changed = true;
                      return { ...segment, presetId: assignments[segment.id], promptTemplate: template, finalPrompt: undefined };
                    });
                    return changed ? next : current;
                  });
                }}
              />
            )}

            {imagePickerTarget && (
              <SegmentImagePickerModal
                isOpen={Boolean(imagePickerTarget)}
                onClose={() => setImagePickerTarget(null)}
                segmentId={imagePickerTarget.segmentId}
                segmentIndex={imagePickerTarget.segmentIndex}
                segmentText={imagePickerTarget.segmentText}
                sourceIndex={imagePickerTarget.sourceIndex}
                allImages={(() => {
                  const groupKey = imagePickerTarget.sourceIndex !== undefined ? sourceImageGroupBindings[imagePickerTarget.sourceIndex] : undefined;
                  return groupKey ? attachedImages.filter(image => getImageGroupKey(image) === groupKey) : attachedImages;
                })()}
                currentImageId={(() => {
                  const seg = templateSegments.find(s => s.id === imagePickerTarget.segmentId);
                  if (!seg) return undefined;
                  const bound = getSegmentImage(seg, imagePickerTarget.segmentIndex);
                  return bound?.id;
                })()}
                isManualOverride={(() => {
                  const seg = templateSegments.find(s => s.id === imagePickerTarget.segmentId);
                  return Boolean(seg?.imageId && seg.imageId !== '__NONE__');
                })()}
                onSelectImage={handleSelectImageForSegment}
                onResetToAuto={handleResetSegmentImageToAuto}
                onUnbindImage={handleUnbindSegmentImage}
                onUploadNewImageForSegment={handleUploadNewImageForSegment}
                otherSegmentsUsingImage={otherSegmentsUsingImage}
                copiedImageId={copiedImageAssignmentId}
                onCopyImageAssignment={handleCopyImageAssignment}
                onPasteImageAssignment={handlePasteImageAssignment}
              />
            )}
          </div>
        </div>
      )}

      {/* 自定义前缀弹窗 */}
      {showPrefixModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowPrefixModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title">添加序号前缀</h3>
            <p className="prefix-modal-desc">
              输入要添加的前缀内容。例如输入 "prompt"，将生成 prompt-1、prompt-2...
            </p>
            <input
              type="text"
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value)}
              placeholder="输入前缀，如: prompt, step, item"
              className="prefix-modal-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customPrefix.trim()) {
                  handleConfirmPrefix();
                }
              }}
              autoFocus
            />
            <div className="prefix-modal-actions">
              <button
                onClick={() => setShowPrefixModal(false)}
                className="prefix-modal-btn-cancel"
              >
                取消
              </button>
              <button
                onClick={handleConfirmPrefix}
                disabled={!customPrefix.trim()}
                className={`prefix-modal-btn-confirm ${!customPrefix.trim() ? 'disabled' : ''}`}
              >
                确定添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自动断行设置弹窗 */}
      {showWrapModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowWrapModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title">自动断行设置</h3>
            <p className="prefix-modal-desc">
              设置每行最大字符数。英语单词不会被截断，遇到 <b>: . ? !</b> 标点时自动换行。
              <br />• 默认 <b>18</b> 个字符（适合字幕排版）
              <br />• 较短的值（如 12~15）适合竖屏短视频
              <br />• 较长的值（如 25~30）适合横屏/正常阅读
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span className="text-sm text-slate-600">每行字符数：</span>
              <input
                type="number"
                min={5}
                max={100}
                value={lineWidth}
                onChange={(e) => setLineWidth(Math.max(5, parseInt(e.target.value) || 18))}
                className="prefix-modal-input"
                style={{ width: '80px', textAlign: 'center' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmWrap(); }}
                autoFocus
              />
            </div>
            <div className="prefix-modal-actions">
              <button
                onClick={() => setShowWrapModal(false)}
                className="prefix-modal-btn-cancel"
              >
                取消
              </button>
              <button
                onClick={handleConfirmWrap}
                className="prefix-modal-btn-confirm"
              >
                确定断行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 链接 l/I 枚举弹窗 */}
      {showLinkVariantModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowLinkVariantModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title">链接 l / I 枚举</h3>
            <p className="prefix-modal-desc">
              粘贴看不清的链接，工具会把其中的小写 <b>l</b> 和大写 <b>I</b> 生成所有组合。
              结果会写入当前选区右侧一列，每行一个候选链接。
              <br />当前最多生成 <b>{LINK_VARIANT_LIMIT.toLocaleString()}</b> 条，避免浏览器卡死。
            </p>
            <textarea
              value={linkVariantInput}
              onChange={(e) => setLinkVariantInput(e.target.value)}
              placeholder="粘贴链接，例如：https://example.com/aIl..."
              className="prefix-modal-input"
              rows={4}
              style={{ width: '100%', minHeight: 110, resize: 'vertical', textAlign: 'left' }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleGenerateLinkVariants();
                }
              }}
              autoFocus
            />
            <div className="text-xs text-slate-500" style={{ marginTop: '-4px', marginBottom: '12px' }}>
              已识别 {countAmbiguousLinkChars(linkVariantInput)} 个可疑字符，预计生成 {countAmbiguousLinkChars(linkVariantInput) > 0 ? Math.pow(2, countAmbiguousLinkChars(linkVariantInput)).toLocaleString() : 0} 条。
            </div>
            <div className="prefix-modal-actions">
              <button
                onClick={() => setShowLinkVariantModal(false)}
                className="prefix-modal-btn-cancel"
              >
                取消
              </button>
              <button
                onClick={handleGenerateLinkVariants}
                disabled={!linkVariantInput.trim()}
                className={`prefix-modal-btn-confirm ${!linkVariantInput.trim() ? 'disabled' : ''}`}
              >
                生成候选
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 合并列弹窗 */}
      {showMergeModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowMergeModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title">合并列</h3>
            <p className="prefix-modal-desc">
              设置循环列数。例如：
              <br />• 设为 <b>1</b>：所有列合并到第一列（纵向堆叠）
              <br />• 设为 <b>3</b>：每 3 列为一组，后续组追加到前 3 列下方
              <br />
              <br />选区共 <b>{selection ? Math.abs(selection.end.col - selection.start.col) + 1 : 0}</b> 列，
              将分为 <b>{selection ? Math.ceil((Math.abs(selection.end.col - selection.start.col) + 1) / Math.max(1, mergeCycle)) : 0}</b> 组
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span className="text-sm text-slate-600">循环列数：</span>
              <input
                type="number"
                min={1}
                max={selection ? Math.abs(selection.end.col - selection.start.col) + 1 : 100}
                value={mergeCycle}
                onChange={(e) => setMergeCycle(Math.max(1, parseInt(e.target.value) || 1))}
                className="prefix-modal-input"
                style={{ width: '80px', textAlign: 'center' }}
                onKeyDown={(e) => { if (e.key === 'Enter') doMergeColumns(); }}
                autoFocus
              />
              <span className="text-xs text-slate-400">列为一组</span>
            </div>
            <div className="prefix-modal-actions">
              <button onClick={() => setShowMergeModal(false)} className="prefix-modal-btn-cancel">取消</button>
              <button onClick={doMergeColumns} className="prefix-modal-btn-confirm">确定合并</button>
            </div>
          </div>
        </div>
      )}

      {/* 拆分列弹窗 */}
      {showSplitColumnModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowSplitColumnModal(false)}>
          <div className="prefix-modal-content" style={{ width: '440px', maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title flex items-center gap-2">
              <Columns className="w-5 h-5 text-blue-500" />
              <span>拆分列 (按行数横向分列)</span>
            </h3>
            <p className="prefix-modal-desc">
              将所选区域按指定行数分组，按顺序横向排列成多列。
              <br />• 例如：一列有 500 行，设为 <b>10</b> 行一组，将横向拆分为 <b>50</b> 列并排。
            </p>

            {selection && (
              <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>当前选区范围：</span>
                  <span className="font-semibold text-slate-800">
                    行 {Math.min(selection.start.row, selection.end.row) + 1} ~ {Math.max(selection.start.row, selection.end.row) + 1}
                    （共 {Math.abs(selection.end.row - selection.start.row) + 1} 行，{Math.abs(selection.end.col - selection.start.col) + 1} 列）
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>预计拆分结果：</span>
                  <span className="font-semibold text-blue-600">
                    {Math.ceil((Math.abs(selection.end.row - selection.start.row) + 1) / Math.max(1, splitRowsPerGroup))} 组
                    （横向生成 {Math.ceil((Math.abs(selection.end.row - selection.start.row) + 1) / Math.max(1, splitRowsPerGroup)) * (Math.abs(selection.end.col - selection.start.col) + 1)} 列，每列最多 {Math.max(1, splitRowsPerGroup)} 行）
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span className="text-sm font-medium text-slate-700">每组行数：</span>
              <input
                type="number"
                min={1}
                max={selection ? Math.abs(selection.end.row - selection.start.row) + 1 : 10000}
                value={splitRowsPerGroup}
                onChange={(e) => setSplitRowsPerGroup(Math.max(1, parseInt(e.target.value) || 1))}
                className="prefix-modal-input"
                style={{ width: '80px', textAlign: 'center' }}
                onKeyDown={(e) => { if (e.key === 'Enter') doSplitColumns(); }}
                autoFocus
              />
              <span className="text-xs text-slate-500">行为一组</span>

              <div className="flex items-center gap-1 ml-auto">
                {[10, 20, 50, 100].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setSplitRowsPerGroup(cnt)}
                    className={`px-1.5 py-0.5 text-xs rounded border transition cursor-pointer ${splitRowsPerGroup === cnt ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'}`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 mb-4 text-xs text-slate-600">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={splitKeepSource}
                  onChange={(e) => setSplitKeepSource(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>保留原数据（在选区右侧新列中生成）</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={splitApplyColor}
                  onChange={(e) => setSplitApplyColor(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>各组使用不同背景色区分（方便辨识）</span>
              </label>
            </div>

            <div className="prefix-modal-actions">
              <button onClick={() => setShowSplitColumnModal(false)} className="prefix-modal-btn-cancel">取消</button>
              <button onClick={doSplitColumns} className="prefix-modal-btn-confirm">确定拆分</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入已拆分文案 (支持从 Google Sheets / 表格粘贴二次加工) 弹窗 */}
      {showImportSegmentsModal && (() => {
        const sheetAnalysis = analyzeSheetTable(importSegmentsRawText, {
          direction: importDirection,
          hasHeaderRow: importHasHeader
        });
        const parsedScripts = parseImportScripts(importSegmentsRawText, {
          stripQuotes: importStripQuotes,
          stripNumbering: importStripNumbering,
          skipEmptyLines: importSkipEmptyLines,
          direction: importDirection,
          hasHeaderRow: importHasHeader
        });
        const annotatedCount = parsedScripts.reduce((sum, script) => sum + script.segments.length, 0);
        const annotatedError = importAnnotatedMode && importSegmentsRawText.trim() && !parsedScripts.length ? '未识别到有效标注片段，请检查“标注｜正文”格式' : '';
        const totalSegCount = parsedScripts.reduce((acc, s) => acc + s.segments.length, 0);

        return (
          <div className="prefix-modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '5vh', backgroundColor: 'rgba(5, 10, 20, 0.88)', backdropFilter: 'blur(8px)' }} onClick={() => setShowImportSegmentsModal(false)}>
            <div
              className="bg-[#0e172a] text-slate-100 rounded-xl shadow-2xl border border-slate-700/80 p-5 flex flex-col gap-3.5"
              style={{ width: 'min(94vw, 740px)', maxHeight: '90vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                    <Grid3X3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>从谷歌表格 (Google Sheets) 粘贴 · 导入已拆分文案</span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-normal">支持多篇同时导入</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">直接粘贴从 Google Sheets / Excel 复制的单元格或整列，自动识别多篇文案、清洗引号并生成分镜卡片二次加工</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportSegmentsModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-950/30 p-3 text-xs cursor-pointer">
                <input type="checkbox" checked={importAnnotatedMode} onChange={event => { setImportAnnotatedMode(event.target.checked); setAnnotatedImportError(''); }} />
                标注片段模式：每行“睁眼｜正文”或“闭眼｜正文”，也支持“睁眼｜8s｜正文”，标注和时长单独保存
              </label>
              {importAnnotatedMode && <p className="text-xs text-violet-200">已识别 {annotatedCount} 个标注片段。按下方所选载入方式保留篇章分组，不再二次拆分。</p>}
              {importAnnotatedMode && (annotatedError || annotatedImportError) && <p className="text-xs text-rose-300">{annotatedError || annotatedImportError}</p>}
              {/* 输入文本区 */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>粘贴 Google Sheets 内容或已拆好的分镜文本：</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReadClipboardToImport}
                      className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/50 text-[11px] font-medium text-indigo-200 transition cursor-pointer flex items-center gap-1 shadow-xs"
                      title="读取当前电脑剪贴板中的内容"
                    >
                      <Copy className="w-3 h-3 text-indigo-400" />
                      从剪贴板读取
                    </button>
                    {importSegmentsRawText && (
                      <button
                        type="button"
                        onClick={() => setImportSegmentsRawText('')}
                        className="text-[11px] text-rose-400 hover:text-rose-300 transition cursor-pointer"
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={importSegmentsRawText}
                  onChange={e => { setImportSegmentsRawText(e.target.value); setAnnotatedImportError(''); }}
                  placeholder={'在此直接按 Cmd+V / Ctrl+V 粘贴从 Google Sheets 复制的内容...\n\n支持多种 Google Sheets 粘贴场景：\n1. 选中单列多行单元格复制（每个单元格内有多行分镜） -> 自动识别为多篇独立文案！\n2. 选中两列表格复制（第1列篇章标题/序号，第2列多行分镜文案，第3列提示词模版）\n3. 选中单篇文案的多行分镜段落（每行一段）\n4. 包含引号、序号或空行的分镜文案，将自动进行智能清洗'}
                  className="w-full h-40 border border-slate-700 bg-[#131f3b] text-slate-100 placeholder:text-slate-500 rounded-lg p-3 text-xs font-mono resize-y outline-none focus:border-indigo-500 leading-5"
                  autoFocus
                />
              </div>

              {/* 表格结构检测横幅 */}
              {sheetAnalysis.isTable && (
                <div className="px-3 py-2.5 rounded-lg bg-slate-900/90 border border-indigo-500/30 text-xs flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-indigo-200">
                    <span className="font-semibold flex items-center gap-1 text-white">
                      <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
                      已识别表格规格：
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-[11px] border border-indigo-800/60">
                      {sheetAnalysis.rowCount} 行 × {sheetAnalysis.colCount} 列
                    </span>
                    {sheetAnalysis.colCount > 1 && (
                      <span className="text-[11px] text-slate-400">
                        (匹配到文案列：第 {sheetAnalysis.scriptColIndex + 1} 列{sheetAnalysis.headers[sheetAnalysis.scriptColIndex] ? `【${sheetAnalysis.headers[sheetAnalysis.scriptColIndex]}】` : ''})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {sheetAnalysis.rowCount > 1 && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none hover:text-white">
                        <input
                          type="checkbox"
                          checked={importHasHeader}
                          onChange={e => setImportHasHeader(e.target.checked)}
                          className="rounded text-indigo-500"
                        />
                        <span>首行作为表头跳过</span>
                      </label>
                    )}

                    {sheetAnalysis.colCount > 1 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <span>方向:</span>
                        <select
                          value={importDirection}
                          onChange={e => setImportDirection(e.target.value as any)}
                          className="bg-slate-800 text-slate-200 rounded px-1.5 py-0.5 border border-slate-700 text-[11px] outline-none"
                        >
                          <option value="auto">自动判定</option>
                          <option value="rows">每行一篇</option>
                          <option value="columns">每列一篇</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 智能清洗选项 */}
              <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none hover:text-white">
                    <input
                      type="checkbox"
                      checked={importStripQuotes}
                      onChange={e => setImportStripQuotes(e.target.checked)}
                      className="rounded text-indigo-500 focus:ring-indigo-400"
                    />
                    <span>去除外层双引号 <span className="text-slate-500 text-[11px]">(Google Sheets 复制自带)</span></span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none hover:text-white">
                    <input
                      type="checkbox"
                      checked={importStripNumbering}
                      onChange={e => setImportStripNumbering(e.target.checked)}
                      className="rounded text-indigo-500 focus:ring-indigo-400"
                    />
                    <span>去除行首序号 <span className="text-slate-500 text-[11px]">(如 1. / 1、 / [1])</span></span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none hover:text-white">
                    <input
                      type="checkbox"
                      checked={importSkipEmptyLines}
                      onChange={e => setImportSkipEmptyLines(e.target.checked)}
                      className="rounded text-indigo-500 focus:ring-indigo-400"
                    />
                    <span>跳过空行</span>
                  </label>
                </div>
              </div>

              {/* 多篇文案载入方式选择卡片（识别到 >1 篇文案时呈现） */}
              {parsedScripts.length > 1 && (
                <div className="p-3.5 rounded-lg bg-gradient-to-r from-indigo-950/70 via-slate-900 to-violet-950/70 border border-indigo-500/40 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-200">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>已识别到 {parsedScripts.length} 篇独立文案（共 {totalSegCount} 个分镜段落），请选择载入方式：</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <label
                      onClick={() => setImportTargetMode('batch')}
                      className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 select-none ${
                        importTargetMode === 'batch'
                          ? 'bg-indigo-600/25 border-indigo-400 text-white shadow-md'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <input
                          type="radio"
                          name="importTargetMode"
                          checked={importTargetMode === 'batch'}
                          onChange={() => setImportTargetMode('batch')}
                          className="text-indigo-500 cursor-pointer"
                        />
                        <span className="text-white">批量篇章模式 (推荐)</span>
                      </div>
                      <span className="text-[11px] text-slate-300 pl-6 leading-relaxed">
                        在当前工作区按 <b>篇章 #1、#2...</b> 统一排版与管理，可在同一个分镜表格中逐篇检查、调整拆分点并批量出图。
                      </span>
                    </label>

                    <label
                      onClick={() => setImportTargetMode('tabs')}
                      className={`p-3 rounded-lg border cursor-pointer transition flex flex-col gap-1 select-none ${
                        importTargetMode === 'tabs'
                          ? 'bg-indigo-600/25 border-indigo-400 text-white shadow-md'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <input
                          type="radio"
                          name="importTargetMode"
                          checked={importTargetMode === 'tabs'}
                          onChange={() => setImportTargetMode('tabs')}
                          className="text-indigo-500 cursor-pointer"
                        />
                        <span className="text-white">自动新建独立标签页</span>
                      </div>
                      <span className="text-[11px] text-slate-300 pl-6 leading-relaxed">
                        为这 <b>{parsedScripts.length} 篇文案</b> 分别自动新建 <b>{parsedScripts.length} 个工作区标签页</b>，各篇文案、图片独立隔离控制。
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* 实时解析预览 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>解析预览：</span>
                    {parsedScripts.length > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-200 font-bold font-mono">
                        {parsedScripts.length > 1
                          ? `${parsedScripts.length} 篇文案 · 共 ${totalSegCount} 个分镜段落`
                          : `1 篇文案 · 共 ${parsedScripts[0].segments.length} 个分镜段落`}
                      </span>
                    ) : (
                      <span className="text-slate-500">等待输入...</span>
                    )}
                  </span>
                  {parsedScripts.length > 0 && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      载入后自动生成分镜卡片，可逐段调整拆分点、插入图片与套用提示词
                    </span>
                  )}
                </div>

                {parsedScripts.length > 0 ? (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-800 bg-[#091122] p-2.5 space-y-2 text-xs">
                    {parsedScripts.length > 1 ? (
                      // 多篇预览
                      parsedScripts.slice(0, 5).map((script, sIdx) => (
                        <div key={sIdx} className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 space-y-1">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-[11px]">
                            <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-mono">
                                #{sIdx + 1}
                              </span>
                              <span>{script.title}</span>
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {script.segments.length} 个分镜段落
                              {script.template && <span className="ml-2 text-violet-400">· 带专属模版</span>}
                            </span>
                          </div>
                          <div className="space-y-1 pt-0.5">
                            {script.segments.slice(0, 2).map((seg, segIdx) => (
                              <div key={segIdx} className="flex items-start gap-1.5 text-slate-300 text-[11px]">
                                <span className="text-slate-500 font-mono text-[10px] shrink-0">{segIdx + 1}.</span>
                                <span className="truncate flex-1 font-mono">{seg}</span>
                              </div>
                            ))}
                            {script.segments.length > 2 && (
                              <div className="text-[10px] text-slate-500 pl-3">
                                ... 以及后续 {script.segments.length - 2} 个段落
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      // 单篇预览
                      parsedScripts[0].segments.slice(0, 6).map((line, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-1.5 rounded bg-slate-800/40 text-slate-200">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-mono font-bold shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="truncate flex-1 font-mono text-[11px]">{line}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{line.length} 字符</span>
                        </div>
                      ))
                    )}
                    {parsedScripts.length > 5 && (
                      <div className="text-center text-[11px] text-slate-400 py-1 font-medium">
                        ... 还有其他 {parsedScripts.length - 5} 篇文案将在载入时全部导入
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-5 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                    <Grid3X3 className="w-5 h-5 text-slate-600" />
                    <span>请在上方粘贴从 Google Sheets 复制的分镜文案</span>
                    <span className="text-[11px] text-slate-600">支持一次选中多个单元格同时粘贴导入</span>
                  </div>
                )}
              </div>

              {/* 底部按钮栏 */}
              <div className="flex items-center justify-between pt-2.5 border-t border-slate-800 mt-1">
                <span className="text-[11px] text-slate-500">
                  {parsedScripts.length > 0 && `准备载入：${parsedScripts.length} 篇文案 · ${totalSegCount} 个分镜卡片`}
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowImportSegmentsModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImportSegments}
                    disabled={importAnnotatedMode ? annotatedCount === 0 : parsedScripts.length === 0}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none transition shadow-md shadow-indigo-950/40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {parsedScripts.length > 1
                      ? `确认载入 ${parsedScripts.length} 篇文案（共 ${totalSegCount} 分镜）`
                      : `确认载入 ${parsedScripts[0]?.segments.length || 0} 个分镜段落`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 合并单元格弹窗 */}
      {showMergeCellModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowMergeCellModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="prefix-modal-title">合并单元格</h3>
            <p className="prefix-modal-desc">
              将选区每列数据生成 Google Sheets 合并单元格格式。
              <br />• 每个值跨 <b>N</b> 列（合并单元格效果）
              <br />• 结果写入选区右侧，同时自动复制到剪贴板
              <br />• 粘贴到 Google Sheets 时会显示为真正的合并单元格
              <br />
              <br />选区共 <b>{selection ? Math.abs(selection.end.col - selection.start.col) + 1 : 0}</b> 列 × <b>{selection ? Math.abs(selection.end.row - selection.start.row) + 1 : 0}</b> 行，
              合并后总宽 = <b>{selection ? (Math.abs(selection.end.col - selection.start.col) + 1) * Math.max(1, mergeCellSpan) : 0}</b> 列
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span className="text-sm text-slate-600">每值跨列数：</span>
              <input
                type="number"
                min={1}
                max={50}
                value={mergeCellSpan}
                onChange={(e) => setMergeCellSpan(Math.max(1, parseInt(e.target.value) || 1))}
                className="prefix-modal-input"
                style={{ width: '80px', textAlign: 'center' }}
                onKeyDown={(e) => { if (e.key === 'Enter') doMergeCellGenerate(); }}
                autoFocus
              />
              <span className="text-xs text-slate-400">列</span>
            </div>
            <div className="prefix-modal-actions">
              <button onClick={() => setShowMergeCellModal(false)} className="prefix-modal-btn-cancel">取消</button>
              <button onClick={doMergeCellGenerate} className="prefix-modal-btn-confirm">确定生成</button>
            </div>
          </div>
        </div>
      )}

      {/* 信仰词汇大写保护弹窗 */}
      {showDeityModal && (
        <div className="prefix-modal-overlay" onClick={() => setShowDeityModal(false)}>
          <div className="prefix-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <h3 className="prefix-modal-title">✝️ 文案检查修正</h3>
            <p className="prefix-modal-desc">
              采用纯 AI 语义理解检查并修正选区内信仰词汇的大写、拼写与代词指代，并在右侧生成修正结果与反馈报告。
              <br />点击词汇可删除，输入框回车可添加（支持逗号分隔批量添加）。
            </p>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '6px',
              padding: '10px', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: '8px',
              maxHeight: '200px', overflowY: 'auto',
              marginBottom: '10px'
            }}>
              {deityTerms.map(term => (
                <div key={term} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '3px 10px', background: '#e0f2fe',
                  border: '1px solid #7dd3fc', borderRadius: '14px',
                  fontSize: '12px', color: '#0c4a6e', cursor: 'pointer'
                }}
                  onClick={() => handleRemoveDeityTerm(term)}
                  title="点击删除"
                >
                  <span>{term}</span>
                  <span style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: '2px' }}>×</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <input
                type="text"
                value={deityNewTerm}
                onChange={(e) => setDeityNewTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddDeityTerm(); }}
                placeholder="输入新词汇（支持逗号分隔批量添加）..."
                className="prefix-modal-input"
                style={{ flex: 1 }}
                autoFocus
              />
              <button onClick={handleAddDeityTerm} className="prefix-modal-btn-confirm" style={{ padding: '6px 12px' }}>添加</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={handleResetDeityTerms}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                >
                  ↺ 恢复默认词汇
                </button>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#a78bfa' }} title="代词与名词将交由 AI 语义分析进行大写和纠错，已取消本地正则匹配以防误杀">
                  🤖 纯 AI 智能检测已启用 (无本地正则误判)
                </span>
              </div>
              <div className="prefix-modal-actions">
                <button onClick={() => setShowDeityModal(false)} className="prefix-modal-btn-cancel">取消</button>
                <button onClick={doDeityCapitalizationCheck} className="prefix-modal-btn-confirm" disabled={spellChecking}>
                  {spellChecking ? '检查中...' : '执行检查'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改前后对比弹窗 */}
      <SegmentDiffModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        actionName={lastActionToast?.actionName || (segmentUndoStackRef.current.length > 0 ? segmentUndoStackRef.current[segmentUndoStackRef.current.length - 1].actionName : '本次修改')}
        beforeSegments={lastActionToast?.beforeSegments || (segmentUndoStackRef.current.length > 0 ? segmentUndoStackRef.current[segmentUndoStackRef.current.length - 1].segments : [])}
        afterSegments={templateSegments}
        onRevert={() => {
          handleCancelCurrentChange();
          setShowDiffModal(false);
        }}
        onKeep={() => {
          setShowDiffModal(false);
        }}
      />

      {/* AI 拆分提示词指令配置弹窗 */}
      <AiSplitPromptModal
        isOpen={showAiPromptModal}
        onClose={() => setShowAiPromptModal(false)}
        prompt={aiSplitPrompt}
        defaultPrompt={DEFAULT_AI_SPLIT_PROMPT}
        onSave={handleSaveAiPrompt}
      />
      <AiSplitPromptModal
        isOpen={showAiSegmentPromptModal}
        onClose={() => setShowAiSegmentPromptModal(false)}
        prompt={aiSegmentPrompt}
        defaultPrompt={DEFAULT_AI_SEGMENT_PROMPT}
        onSave={handleSaveAiSegmentPrompt}
        title="纯 AI 分段指令"
        description="和“文案改写 → 标准改写”一样：原文加指令交给 AI。这里 AI 只决定每段在哪里结束。"
        placeholder="输入 AI 分段规则…"
        tipContent={<><strong>这里的规则只管分段：</strong><ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300"><li>AI 返回一段一项的列表；不负责动态字幕断行。</li><li>“动态字幕每行字符”仍按左侧设置在本地处理。</li><li>你可以直接改成自己的 8 秒口播要求。</li></ul></>}
      />
    </div>
  );
}

const ToolButton: React.FC<{ icon: React.ReactNode; label: string; tooltip?: string; onClick: () => void; disabled?: boolean }> = ({ icon, label, tooltip, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    data-tip={tooltip || label}
    className={`
      tooltip-bottom inline-flex items-center gap-1 px-2 py-1 transition-colors text-xs font-semibold whitespace-nowrap leading-none
      border rounded-md
      ${disabled
        ? 'cursor-not-allowed text-slate-500 border-slate-700 bg-slate-800/90'
        : 'text-slate-200 border-slate-700 bg-slate-900/80 hover:bg-emerald-900/25 hover:text-emerald-200 hover:border-emerald-500/60 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
      }
    `}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default TemplateBatchEditorApp;
