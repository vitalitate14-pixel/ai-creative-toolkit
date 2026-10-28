import { MultiPresetGenerationPanel } from './MultiPresetGenerationPanel';
import { generatePresetSets, type GeneratedPresetSet, type GenerationOrder, type GenerationPlan } from '../utils/multiPresetGeneration';
import { matchesSearchFields } from '../utils/searchFields';
import { PageSizeControl, readPageSize } from './PageSizeControl';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Copy, Eye, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { AttachedImage } from './ImageDropZone';
import { TemplateSegment } from '../types';
import { CONTENT_PLACEHOLDER, TemplatePreset } from '../constants/presetDefaults';

const SOURCE_CARD_COLORS = [
  { border: '#38bdf8', background: '#102c40' },
  { border: '#c084fc', background: '#2c1c42' },
  { border: '#34d399', background: '#10382e' },
  { border: '#fb923c', background: '#40291b' },
  { border: '#f472b6', background: '#3d2035' },
  { border: '#facc15', background: '#38331a' },
];

type PresetAssignments = Record<string, string | undefined>;
type PresetAssignmentState = { assignments: PresetAssignments; history: PresetAssignments[] };
type PresetAssignmentAction =
  | { type: 'assign'; update: React.SetStateAction<PresetAssignments> }
  | { type: 'reset'; assignments: PresetAssignments }
  | { type: 'undo' };

const presetAssignmentReducer = (state: PresetAssignmentState, action: PresetAssignmentAction): PresetAssignmentState => {
  if (action.type === 'reset') return { assignments: action.assignments, history: [] };
  if (action.type === 'undo') {
    if (!state.history.length) return state;
    return { assignments: state.history[state.history.length - 1], history: state.history.slice(0, -1) };
  }
  const next = typeof action.update === 'function' ? action.update(state.assignments) : action.update;
  const ids = new Set([...Object.keys(state.assignments), ...Object.keys(next)]);
  if ([...ids].every(id => state.assignments[id] === next[id])) return state;
  return { assignments: next, history: [...state.history, state.assignments] };
};

type Props = {
  isOpen: boolean;
  sourceIndex: number;
  images: AttachedImage[];
  segments: TemplateSegment[];
  /** 仅分镜模式的总分配按篇分行；单篇一图沿用原布局。 */
  groupBySource?: boolean;
  sourceImageGroupBindings?: Record<number, string>;
  imageGroups?: { key: string; images: AttachedImage[] }[];
  /** 外部自动绑定的图片也要在排列面板中回显，避免单篇一图打开后看起来为空。 */
  initialImageAssignments?: Record<string, string | undefined>;
  finalPrompts?: Record<string, string>;
  copiedSegmentIds?: Set<string>;
  onCopyImage?: (image: AttachedImage, segmentId: string) => boolean | Promise<boolean>;
  onCopyPrompt?: (prompt: string, segmentId: string, image?: AttachedImage) => boolean | Promise<boolean>;
  onCopyAllImages?: () => boolean | Promise<boolean>;
  presets: TemplatePreset[];
  onApply: (assignments: Record<string, string | undefined>) => void;
  onApplyPresetAssignments: (assignments: Record<string, string | undefined>) => void;
  onSaveProject?: (images: Record<string, string | undefined>, presets: Record<string, string | undefined>) => Promise<void>;
  onGeneratePresetSets?: (sets: GeneratedPresetSet[], order: GenerationOrder) => void;
  onAddPreset?: () => void;
  onOpenDelivery?: () => void;
  onClose: () => void;
};

/** 按篇人工排图：点素材后自动填入当前分段槽位，允许重复、替换、清空。 */
export const SourceImageOrderModal: React.FC<Props> = ({ isOpen, sourceIndex, images, segments, groupBySource = false, sourceImageGroupBindings, imageGroups = [], initialImageAssignments, finalPrompts, copiedSegmentIds, onCopyImage, onCopyPrompt, onCopyAllImages, presets, onApply, onApplyPresetAssignments, onSaveProject, onGeneratePresetSets, onAddPreset, onOpenDelivery, onClose }) => {
  const showSourceRows = groupBySource && sourceIndex < 0;
  const imageById = useMemo(() => new Map(images.map(image => [image.id, image])), [images]);
  const [cardPage, setCardPage] = useState(0);
  const [cardPageSizeSetting, setCardPageSize] = useState(() => readPageSize('template-batch-card-page-size', 60));
  useEffect(() => { try { localStorage.setItem('template-batch-card-page-size', String(cardPageSizeSetting)); } catch {} }, [cardPageSizeSetting]);
  const [cardPaginationEnabled, setCardPaginationEnabled] = useState(false);
  const cardPageSize = cardPaginationEnabled ? cardPageSizeSetting : Number.MAX_SAFE_INTEGER;

  const initial = useMemo(() => Object.fromEntries(segments.map(segment => [
    segment.id,
    segment.imageId && segment.imageId !== '__NONE__' ? segment.imageId : initialImageAssignments?.[segment.id],
  ])), [segments, initialImageAssignments]);
  const [assignments, setAssignments] = useState<Record<string, string | undefined>>(initial);
  const initialPresetAssignments = useMemo(() => Object.fromEntries(segments.map(segment => [segment.id, segment.presetId || presets.find(preset => preset.template === segment.promptTemplate)?.id])), [segments, presets]);
  const [presetAssignmentState, dispatchPresetAssignment] = useReducer(presetAssignmentReducer, { assignments: initialPresetAssignments, history: [] });
  const presetAssignments = presetAssignmentState.assignments;
  const setPresetAssignments = (update: React.SetStateAction<PresetAssignments>) => dispatchPresetAssignment({ type: 'assign', update });
  const [groupCardsByPreset, setGroupCardsByPreset] = useState(false);
  const [cardPresetGroup, setCardPresetGroup] = useState<string | null>(null);
  const assignedPresetGroups = useMemo(() => {
    const presetById = new Map(presets.map(preset => [preset.id, preset]));
    const groups = new Map<string, TemplateSegment[]>();
    for (const segment of segments) {
      const preset = presetById.get(presetAssignments[segment.id] || '');
      const category = preset ? preset.category?.trim() || '未分类预设' : '统一模板 / 未分配';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(segment);
    }
    return groups;
  }, [segments, presets, presetAssignments]);
  const [cardSearch, setCardSearch] = useState('');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const candidateCards = groupCardsByPreset && cardPresetGroup !== null ? assignedPresetGroups.get(cardPresetGroup) || [] : segments;
  const displayedCards = useMemo(() => {
    const presetById = new Map(presets.map(preset => [preset.id, preset]));
    const filtered = candidateCards.filter(segment => {
      const image = imageById.get(assignments[segment.id] || '');
      const preset = presetById.get(presetAssignments[segment.id] || '');
      const prompt = preset ? preset.template.split(CONTENT_PLACEHOLDER).join(segment.text) : finalPrompts?.[segment.id];
      return matchesSearchFields(cardSearch, [image?.name, image?.fullPath, segment.text, segment.annotation,
        prompt, preset?.name, preset?.category, preset?.template, `第 ${(segment.sourceIndex ?? 0) + 1} 篇`, `文案组${(segment.sourceIndex ?? 0) + 1}`]);
    });
    // 只改变展示顺序，片段 ID 和原始索引继续用于分配、选中与保存。
    return showSourceRows ? filtered.sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0)) : filtered;
  }, [candidateCards, cardSearch, imageById, assignments, presets, presetAssignments, finalPrompts, showSourceRows]);
  const originalSegmentIndexes = useMemo(() => new Map(segments.map((segment, index) => [segment.id, index])), [segments]);
  const sourceSegmentNumbers = useMemo(() => {
    const counts = new Map<number, number>();
    return new Map(segments.map(segment => {
      const source = segment.sourceIndex ?? 0;
      const number = (counts.get(source) || 0) + 1;
      counts.set(source, number);
      return [segment.id, number];
    }));
  }, [segments]);
  const sourceAssignmentCounts = useMemo(() => {
    const counts = new Map<number, { total: number; assigned: number }>();
    segments.forEach(segment => {
      const source = segment.sourceIndex ?? 0;
      const count = counts.get(source) || { total: 0, assigned: 0 };
      count.total++;
      if (imageById.has(assignments[segment.id] || '')) count.assigned++;
      counts.set(source, count);
    });
    return counts;
  }, [segments, imageById, assignments]);
  const effectiveCardPage = Math.min(cardPage, Math.max(0, Math.ceil(displayedCards.length / cardPageSize) - 1));
  const pageCards = displayedCards.slice(effectiveCardPage * cardPageSize, (effectiveCardPage + 1) * cardPageSize);

  const savedAssignmentSignaturesRef = useRef<{ images: string; presets: string } | null>(null);
  const [, setSavedRevision] = useState(0);
  const [saveProjectWithAssignments, setSaveProjectWithAssignments] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectSaveError, setProjectSaveError] = useState('');
  const [showCloseChoice, setShowCloseChoice] = useState(false);
  // 父层在“标记已复制”等操作时会重新渲染并传入新对象；只依据内容变化同步，
  // 不能因对象引用变化把正在操作的面板重置回默认状态。
  const initialAssignmentSignature = segments.map(segment => `${segment.id}:${initial[segment.id] || ''}`).join('|');
  const initialPresetSignature = segments.map(segment => `${segment.id}:${initialPresetAssignments[segment.id] || ''}`).join('|');
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const position = showSourceRows
      ? displayedCards.findIndex(segment => segment.id === segments[activeIndex]?.id)
      : activeIndex;
    if (position >= 0) setCardPage(Math.floor(position / cardPageSize));
  }, [activeIndex, cardPageSize, showSourceRows]);
  const [previewImage, setPreviewImage] = useState<AttachedImage | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  // 默认以原滑杆最大尺寸展示，便于先看清画面；仍可缩小到 50px。
  const [cardWidth, setCardWidth] = useState(80);
  const [presetPanelWidth, setPresetPanelWidth] = useState(240);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchPresetId, setBatchPresetId] = useState('');
  const [clickToAssign, setClickToAssign] = useState(true);
  const [assetsCollapsed, setAssetsCollapsed] = useState(false);
  const [assetThumbHeight, setAssetThumbHeight] = useState(120);
  const [showWordCount, setShowWordCount] = useState(false);
  const [showSegmentText, setShowSegmentText] = useState(true);
  const [showSegmentPreset, setShowSegmentPreset] = useState(true);
  const [showSegmentFinalPrompt, setShowSegmentFinalPrompt] = useState(false);
  const [copiedImageSegmentIds, setCopiedImageSegmentIds] = useState<Set<string>>(new Set());
  const [copiedPromptSegmentIds, setCopiedPromptSegmentIds] = useState<Set<string>>(new Set());
  const [showCardFileNames, setShowCardFileNames] = useState(false);
  const [showImageNames, setShowImageNames] = useState(false);
  const [allImagesCopied, setAllImagesCopied] = useState(false);
  const [activePresetGroup, setActivePresetGroup] = useState('');
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [selectedGroupMode, setSelectedGroupMode] = useState<'sequence' | 'random'>('sequence');
  const [continuousPresetGroupAssignment, setContinuousPresetGroupAssignment] = useState(false);
  const [assignPresetToSelectedSources, setAssignPresetToSelectedSources] = useState(false);
  const [showCardActions, setShowCardActions] = useState(false);
  const [topContentCollapsed, setTopContentCollapsed] = useState(false);
  // 在“全部文案”弹窗中，文案是独立的批量分配目标；可同时选择多篇。
  const [selectedSourceIndexes, setSelectedSourceIndexes] = useState<Set<number>>(new Set());
  const presetGroups = useMemo(() => {
    const groups = new Map<string, TemplatePreset[]>();
    presets.forEach(preset => {
      const category = preset.category?.trim() || '未分组';
      groups.set(category, [...(groups.get(category) || []), preset]);
    });
    return Array.from(groups.entries());
  }, [presets]);
  const sourceIndexes = useMemo(() => Array.from(new Set(segments.map(segment => segment.sourceIndex ?? 0))).sort((a, b) => a - b), [segments]);

  useEffect(() => {
    if (isOpen) {
      savedAssignmentSignaturesRef.current = { images: JSON.stringify(initial), presets: JSON.stringify(initialPresetAssignments) };
      setShowCloseChoice(false);
      setAssignments(initial);
      dispatchPresetAssignment({ type: 'reset', assignments: initialPresetAssignments });
      setActiveIndex(0);
      setPreviewImage(null);
      setPreviewEnabled(false);
      setSelectedSegmentIds(new Set());
      setSelectedImageId(null);
      setBatchPresetId('');
      setClickToAssign(true);
      setCardSearch('');
      setMultiSelectMode(false);
      setAssetsCollapsed(false);
      setShowSegmentText(true);
      setShowSegmentPreset(true);
      setShowSegmentFinalPrompt(false);
      setCopiedImageSegmentIds(new Set());
      setCopiedPromptSegmentIds(new Set());
      setShowImageNames(false);
      setAllImagesCopied(false);
      setActivePresetGroup('');
      setShowAllPresets(false);
      setContinuousPresetGroupAssignment(false);
      setAssignPresetToSelectedSources(false);
      setShowCardActions(false);
      setTopContentCollapsed(false);
      setSelectedSourceIndexes(new Set());
    }
  }, [isOpen]);

  const generationSourceIndexes = new Set(selectedSegmentIds.size > 0
    ? segments.filter(segment => selectedSegmentIds.has(segment.id)).map(segment => segment.sourceIndex ?? 0)
    : selectedSourceIndexes.size > 0 ? [...selectedSourceIndexes] : segments.map(segment => segment.sourceIndex ?? 0));
  const generationSegments = segments.filter(segment => generationSourceIndexes.has(segment.sourceIndex ?? 0));
  const generateMultiplePresets = (plans: GenerationPlan[], order: GenerationOrder) => {
    try {
      const sets = generatePresetSets(generationSegments, presets, plans, assignments, selectedGroupMode);
      if (!sets.length) throw new Error('当前没有可生成的文案片段');
      onApply(assignments);
      onApplyPresetAssignments(presetAssignments);
      onGeneratePresetSets?.(sets, order);
    } catch (error) {
      setProjectSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const assignmentSignatures = useMemo(() => ({ images: JSON.stringify(assignments), presets: JSON.stringify(presetAssignments) }), [assignments, presetAssignments]);
  const hasUnsavedChanges = savedAssignmentSignaturesRef.current !== null && (
    savedAssignmentSignaturesRef.current.images !== assignmentSignatures.images ||
    savedAssignmentSignaturesRef.current.presets !== assignmentSignatures.presets
  );
  const saveAssignments = async (close: boolean) => {
    if (savingProject) return;
    setProjectSaveError('');
    const saved = savedAssignmentSignaturesRef.current;
    if (saved?.images !== assignmentSignatures.images) onApply(assignments);
    if (saved?.presets !== assignmentSignatures.presets) onApplyPresetAssignments(presetAssignments);
    savedAssignmentSignaturesRef.current = assignmentSignatures;
    setSavedRevision(value => value + 1);
    setShowCloseChoice(false);
    if (saveProjectWithAssignments && onSaveProject) {
      setSavingProject(true);
      try { await onSaveProject(assignments, presetAssignments); }
      catch (error) { setProjectSaveError(error instanceof Error ? error.message : String(error)); return; }
      finally { setSavingProject(false); }
    }
    if (close) onClose();
  };
  const requestClose = () => {
    if (hasUnsavedChanges) setShowCloseChoice(true);
    else onClose();
  };

  if (!isOpen) return null;
  const presetTone = (presetId?: string) => {
    if (!presetId) return 'border-slate-600 bg-[#111b2d] text-slate-200 focus:border-slate-400';
    const tones = [
      'border-violet-500 bg-violet-950/45 text-violet-100 focus:border-violet-300',
      'border-sky-500 bg-sky-950/45 text-sky-100 focus:border-sky-300',
      'border-emerald-500 bg-emerald-950/45 text-emerald-100 focus:border-emerald-300',
      'border-amber-500 bg-amber-950/45 text-amber-100 focus:border-amber-300',
      'border-rose-500 bg-rose-950/45 text-rose-100 focus:border-rose-300',
      'border-cyan-500 bg-cyan-950/45 text-cyan-100 focus:border-cyan-300',
    ];
    const index = presets.findIndex(preset => preset.id === presetId);
    return tones[Math.max(0, index) % tones.length];
  };
  const assignImage = (imageId: string, targetSource?: number) => {
    if (targetSource !== undefined) {
      const sourceSegments = segments.filter(segment => (segment.sourceIndex ?? 0) === targetSource);
      const selected = sourceSegments.filter(segment => selectedSegmentIds.has(segment.id));
      if (selected.length) {
        setAssignments(current => ({ ...current, ...Object.fromEntries(selected.map(segment => [segment.id, imageId])) }));
        return;
      }
      const target = sourceSegments.find(segment => segment.id === segments[activeIndex]?.id)
        || sourceSegments.find(segment => !assignments[segment.id]) || sourceSegments[0];
      if (!target) return;
      setAssignments(current => ({ ...current, [target.id]: imageId }));
      const next = sourceSegments[Math.min(sourceSegments.indexOf(target) + 1, sourceSegments.length - 1)];
      setActiveIndex(originalSegmentIndexes.get(next.id) ?? 0);
      return;
    }
    // 多选时，素材点击的目标就是所有已选片段；不再要求用户额外点一次“已选片段”。
    if (selectedSegmentIds.size > 0) {
      setAssignments(current => Object.fromEntries(segments.map(segment => [segment.id, selectedSegmentIds.has(segment.id) ? imageId : current[segment.id]])));
      return;
    }
    const segment = segments[activeIndex];
    if (!segment) return;
    setAssignments(current => ({ ...current, [segment.id]: imageId }));
    setActiveIndex(index => Math.min(index + 1, segments.length - 1));
  };
  const assignedCount = segments.filter(segment => assignments[segment.id]).length;
  const applyImageTo = (scope: 'all' | 'remaining' | 'selected') => {
    if (!selectedImageId) return;
    const targetIds = scope === 'all' ? segments.map(segment => segment.id)
      : scope === 'remaining' ? segments.filter(segment => !assignments[segment.id]).map(segment => segment.id)
      : Array.from(selectedSegmentIds);
    const targetIdsSet = new Set(targetIds);
    setAssignments(current => Object.fromEntries(segments.map(segment => [segment.id, targetIdsSet.has(segment.id) ? selectedImageId : current[segment.id]])));
  };
  const applyPresetTo = (scope: 'all' | 'remaining' | 'selected') => {
    const targetIds = scope === 'all' ? segments.map(segment => segment.id)
      : scope === 'remaining' ? segments.filter(segment => !presetAssignments[segment.id]).map(segment => segment.id)
      : Array.from(selectedSegmentIds);
    const targetIdsSet = new Set(targetIds);
    setPresetAssignments(current => Object.fromEntries(segments.map(segment => [segment.id, targetIdsSet.has(segment.id) ? (batchPresetId || undefined) : current[segment.id]])));
  };
  const firstSegmentIdsBySource = useMemo(() => {
    const seenSources = new Set<number>();
    return segments.filter(segment => {
      const source = segment.sourceIndex ?? 0;
      if (seenSources.has(source)) return false;
      seenSources.add(source);
      return true;
    }).map(segment => segment.id);
  }, [segments]);
  const selectFirstSegmentOfEachSource = () => {
    setSelectedSourceIndexes(new Set());
    setSelectedSegmentIds(new Set(firstSegmentIdsBySource));
  };
  const annotationSelections = useMemo(() => {
    const normalize = (value?: string) => (value || '').replace(/[\s"'“”‘’]/g, '');
    return Object.fromEntries(['睁眼', '闭眼'].map(annotation => [annotation, segments.filter(segment => normalize(segment.annotation) === annotation).map(segment => segment.id)])) as Record<string, string[]>;
  }, [segments]);
  const selectAnnotation = (annotation: string) => {
    setSelectedSourceIndexes(new Set());
    setSelectedSegmentIds(new Set(annotationSelections[annotation]));
  };
  const toggleSegmentSelection = (segmentId: string) => setSelectedSegmentIds(current => {
    const next = new Set(current);
    if (next.has(segmentId)) next.delete(segmentId); else next.add(segmentId);
    return next;
  });
  const clickSegmentCard = (segmentId: string, index: number) => {
    if (multiSelectMode) {
      setSelectedSourceIndexes(new Set());
      toggleSegmentSelection(segmentId);
    } else {
      setActiveIndex(index);
    }
  };
  const assignPresetToActive = (presetId?: string) => {
    setBatchPresetId(presetId || '');
    // 和图片一致：存在多选时，直接把被点到的预设填入所有已选片段。
    if (selectedSegmentIds.size > 0) {
      setPresetAssignments(current => Object.fromEntries(segments.map(segment => [segment.id, selectedSegmentIds.has(segment.id) ? presetId : current[segment.id]])));
      return;
    }
    // 已选择文案时，单个预设统一填充到这些文案的全部片段。
    if (sourceIndex < 0 && selectedSourceIndexes.size > 0) {
      setPresetAssignments(current => Object.fromEntries(segments.map(segment => [
        segment.id,
        selectedSourceIndexes.has(segment.sourceIndex ?? 0) ? presetId : current[segment.id],
      ])));
      return;
    }
    if (!clickToAssign) return;
    const segment = segments[activeIndex];
    if (!segment) return;
    setPresetAssignments(current => ({ ...current, [segment.id]: presetId }));
    setActiveIndex(index => Math.min(index + 1, segments.length - 1));
  };
  // 预设“分类”同时就是预设组；用于单篇一图、多片段时按片段顺序轮流分配不同描述词。
  const assignGroupToSelected = (groupPresets: TemplatePreset[], mode = selectedGroupMode) => {
    if (!groupPresets.length || !selectedSegmentIds.size) return;
    const updates: Record<string, string> = {};
    const targetSources = new Set(segments.filter(segment => selectedSegmentIds.has(segment.id)).map(segment => segment.sourceIndex ?? 0));
    const perSourceOffset = new Map<number, number>();
    let offset = 0;
    for (const segment of segments) {
      const source = segment.sourceIndex ?? 0;
      if (assignPresetToSelectedSources ? !targetSources.has(source) : !selectedSegmentIds.has(segment.id)) continue;
      // 按文案组分配时，每篇独立从第一个预设开始，且包含搜索/分页之外的同组片段。
      const position = assignPresetToSelectedSources ? perSourceOffset.get(source) || 0 : offset++;
      const index = mode === 'random' ? Math.floor(Math.random() * groupPresets.length) : position % groupPresets.length;
      perSourceOffset.set(source, position + 1);
      updates[segment.id] = groupPresets[index].id;
    }
    setPresetAssignments(current => ({ ...current, ...updates }));
  };
  const cyclePresetGroup = (groupPresets: TemplatePreset[], targetSourceIndexes?: Set<number>) => {
    if (!groupPresets.length) return;
    if (!targetSourceIndexes && selectedSegmentIds.size) { assignGroupToSelected(groupPresets, 'sequence'); return; }
    // 在“全部文案”面板中，只有明确点击了某张卡片的“选择整组”后才允许循环填充。
    const targets = targetSourceIndexes || selectedSourceIndexes;
    if (sourceIndex < 0 && targets.size === 0) return;
    setBatchPresetId(groupPresets[0].id);
    // “全部文案”中每篇都从本组第一个预设重新开始；单篇时则正常逐段循环。
    const perSourceOffset = new Map<number, number>();
    setPresetAssignments(current => Object.fromEntries(segments.map(segment => {
      const sourceKey = sourceIndex < 0 ? (segment.sourceIndex ?? 0) : 0;
      if (sourceIndex < 0 && targets.size > 0 && !targets.has(sourceKey)) {
        return [segment.id, current[segment.id]];
      }
      const offset = perSourceOffset.get(sourceKey) || 0;
      perSourceOffset.set(sourceKey, offset + 1);
      return [segment.id, groupPresets[offset % groupPresets.length].id || current[segment.id]];
    })));
  };
  const toggleSourceSelection = (index: number) => setSelectedSourceIndexes(current => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const assignPresetGroupContinuously = (groupPresets: TemplatePreset[]) => {
    const activeSegment = segments[activeIndex];
    if (!activeSegment || !groupPresets.length) return;
    const currentSourceIndex = activeSegment.sourceIndex ?? 0;
    cyclePresetGroup(groupPresets, new Set([currentSourceIndex]));
    if (sourceIndex >= 0) return;
    const currentPosition = sourceIndexes.indexOf(currentSourceIndex);
    const nextSourceIndex = sourceIndexes[currentPosition + 1];
    if (nextSourceIndex === undefined) return;
    const nextSegmentIndex = segments.findIndex(segment => (segment.sourceIndex ?? 0) === nextSourceIndex);
    if (nextSegmentIndex >= 0) setActiveIndex(nextSegmentIndex);
  };

  return (
    <div className="source-image-order-modal fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm" onClick={requestClose}>
      <div className="relative flex h-[96vh] w-[98vw] max-w-none flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0d1729] text-slate-100 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="hidden border-b border-slate-800 bg-[#0a1221] px-4 py-2.5">
          <div className={`flex items-center justify-between text-xs ${assetsCollapsed ? '' : 'mb-2'}`}><span className="font-semibold text-sky-300">图片组：点击图片分配到当前高亮分段</span><div className="flex items-center gap-3"><button type="button" onClick={() => setAssetsCollapsed(value => !value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 font-semibold text-slate-300 hover:text-white">{assetsCollapsed ? '展开图片组' : '收起图片组'}</button><button type="button" onClick={() => { setPreviewEnabled(value => !value); setPreviewImage(null); }} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold transition ${previewEnabled ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-slate-600 bg-slate-900 text-slate-400 hover:text-slate-200'}`} title="打开后，悬浮图片显示大图预览"><Eye className="h-3.5 w-3.5" />悬浮放大：{previewEnabled ? '开' : '关'}</button><span className="text-slate-500">{images.length} 张 · 已分配 {assignedCount}/{segments.length} 段</span></div></div>
          {!assetsCollapsed && <div className="flex max-h-24 gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => <button key={image.id} type="button" onClick={() => { setSelectedImageId(image.id); if (clickToAssign || selectedSegmentIds.size > 0) assignImage(image.id); }} onMouseEnter={() => previewEnabled && setPreviewImage(image)} onMouseLeave={() => setPreviewImage(null)} className={`group relative h-20 w-[45px] shrink-0 overflow-hidden rounded border bg-black hover:border-sky-400 focus:ring-2 focus:ring-sky-400 ${selectedImageId === image.id ? 'border-sky-400 ring-2 ring-sky-400/60' : 'border-slate-700'}`}><img loading="lazy" decoding="async" src={image.url} alt={image.name} className="h-full w-full object-cover" /><span className="absolute left-0.5 top-0.5 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold">#{index + 1}</span></button>)}
          </div>}
        </div>
        <style>{`
          .source-image-order-modal .source-card-group-toolbar button { height: 30px; padding: 0 10px; font-size: 12px; font-weight: 600; border-radius: 6px; white-space: nowrap; }
          .source-image-order-modal .source-results-toolbar { font-size: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
          .source-image-order-modal .source-results-toolbar div { display: contents; }
          .source-image-order-modal .source-results-toolbar .toolbar-secondary-row { display: inline-flex; align-items: center; gap: 8px; order: 5; }
          .source-image-order-modal .source-results-toolbar button[data-toolbar-type="assignment"] { order: 0; }
          .source-image-order-modal .source-results-toolbar button[data-toolbar-type="selection"] { order: 1; }
          .source-image-order-modal .source-results-toolbar button[data-toolbar-type="display"] { order: 2; }
          .source-image-order-modal .source-results-toolbar button[data-toolbar-type="group"] { order: 3; }
          .source-image-order-modal .source-results-toolbar > div > span,
          .source-image-order-modal .source-results-toolbar label,
          .source-image-order-modal .source-results-toolbar input,
          .source-image-order-modal .source-results-toolbar span { order: 4; }

          .source-image-order-modal .source-results-toolbar button { height: 30px; padding: 0 10px; font-size: 12px; font-weight: 600; line-height: 1; border-radius: 6px; white-space: nowrap; }
          .source-image-order-modal .source-results-toolbar button[aria-pressed="false"] { background: #101b2e !important; border-color: #334155 !important; color: #94a3b8 !important; box-shadow: none !important; }
          .source-image-order-modal .source-results-toolbar button[aria-pressed="true"] { background: #0e7490 !important; border-color: #22d3ee !important; color: #ecfeff !important; box-shadow: inset 0 0 0 1px rgba(34,211,238,.2) !important; }

          .source-image-order-modal .source-results-toolbar input[type="number"] { width: 64px !important; min-width: 64px !important; height: 30px !important; padding: 0 6px !important; font-size: 12px !important; }
          .source-image-order-modal .source-results-toolbar label { font-size: 12px; white-space: nowrap; }
        `}</style>
        <div className="flex min-h-0 flex-1 overflow-hidden bg-[#0a1221]">
          <aside style={{ width: presetPanelWidth, minWidth: presetPanelWidth }} className="flex min-h-0 flex-col bg-[#111b30]">
            <div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="source-preset-panel rounded-lg border border-fuchsia-700/70 bg-fuchsia-950/20 p-3 text-[11px]"><div className="mb-3 flex flex-wrap gap-2">{onAddPreset && <button type="button" onClick={onAddPreset} className="rounded border border-violet-400 bg-violet-700 px-3 py-2 font-semibold text-white">＋ 添加预设</button>}{onOpenDelivery && <button type="button" disabled={savingProject} onClick={() => { onApply(assignments); onApplyPresetAssignments(presetAssignments); onOpenDelivery(); }} className="rounded border border-sky-400 bg-sky-800 px-3 py-2 font-semibold text-white">图＋表格</button>}</div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-fuchsia-200">点击预设组分配已选片段：</span>{(['sequence', 'random'] as const).map(mode => <button key={mode} type="button" onClick={() => setSelectedGroupMode(mode)} className={`rounded border px-2 py-1 font-semibold ${selectedGroupMode === mode ? 'border-fuchsia-300 bg-fuchsia-700 text-white' : 'border-slate-600 text-slate-300'}`}>{mode === 'sequence' ? '顺序分配' : '随机分配'}</button>)}<span className="text-slate-400">顺序按卡片顺序循环；随机可重复</span></div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-bold text-fuchsia-100">预设批量分配</span>
                <button type="button" disabled={!presetAssignmentState.history.length || savingProject} onClick={() => dispatchPresetAssignment({ type: 'undo' })} className="rounded border border-amber-600 bg-amber-950 px-2 py-1 font-semibold text-amber-200 disabled:opacity-35" title="恢复上一次预设分配前的状态，可连续撤销；图片分配保持不变">撤销预设分配</button>
                <button type="button" aria-pressed={assignPresetToSelectedSources} onClick={() => setAssignPresetToSelectedSources(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${assignPresetToSelectedSources ? 'border-amber-300 bg-amber-950 text-amber-100' : 'border-slate-600 bg-slate-900 text-slate-300'}`}>按所选图片的文案组分配：{assignPresetToSelectedSources ? '开' : '关'}</button>
                <span className="text-slate-400">{assignPresetToSelectedSources ? '选中任意图片，点击预设组后会分配到所在文案组的全部片段；顺序分配时每篇从第一个预设开始。' : '点击预设组时，只给已选片段分配预设。'}</span>
                <button type="button" onClick={() => setContinuousPresetGroupAssignment(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${continuousPresetGroupAssignment ? 'border-emerald-400 bg-emerald-950 text-emerald-200' : 'border-slate-600 bg-slate-900 text-slate-300'}`}>预设组连续分配：{continuousPresetGroupAssignment ? '开' : '关'}</button>
                <button type="button" onClick={() => setShowAllPresets(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${showAllPresets ? 'border-fuchsia-300 bg-fuchsia-700 text-white' : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-fuchsia-400'}`}>显示全部预设：{showAllPresets ? '开' : '关'}</button>
                <span className="text-slate-400">也可用卡片上的“选择整组”直接选中整篇文案。</span>
              </div>
              {onGeneratePresetSets && <MultiPresetGenerationPanel presets={presets} sourceCount={generationSourceIndexes.size} segmentCount={generationSegments.length} mode={selectedGroupMode} onGenerate={generateMultiplePresets} />}
              <div className="preset-panel-body rounded-md border border-fuchsia-800/70 bg-[#10172a] p-2">
                <div className="mb-1.5 font-bold text-fuchsia-200">① 预设组（点击分配 / 筛选）</div>
                <div className="mb-3 flex flex-wrap gap-1">{presetGroups.map(([category, groupPresets]) => <button key={category} type="button" onClick={() => { setActivePresetGroup(category); if (selectedSegmentIds.size) assignGroupToSelected(groupPresets); else if (continuousPresetGroupAssignment) assignPresetGroupContinuously(groupPresets); else if (selectedSourceIndexes.size > 0) cyclePresetGroup(groupPresets); }} className={`rounded border px-2 py-1 font-semibold transition ${activePresetGroup === category ? 'border-fuchsia-300 bg-fuchsia-700 text-white' : 'border-fuchsia-800 bg-[#111b2d] text-fuchsia-100 hover:border-fuchsia-400'}`} title={selectedSegmentIds.size > 0 ? (assignPresetToSelectedSources ? `将“${category}”组分配到所选图片所在文案组的全部片段` : `将“${category}”组分配到已选片段`) : continuousPresetGroupAssignment ? `从当前卡片所属文案组开始，用“${category}”循环填充并跳到下一组` : selectedSourceIndexes.size > 0 ? `循环填充“${category}”组` : `显示“${category}”组内预设`}>{category} <span className="opacity-75">({groupPresets.length})</span></button>)}</div>
                {(() => { const selectedGroup = presetGroups.find(([category]) => category === (activePresetGroup || presetGroups[0]?.[0])); const groupPresets = selectedGroup?.[1] || []; const visiblePresets = showAllPresets ? presets : groupPresets; return <><div className="mb-1.5 font-bold text-violet-200">② {showAllPresets ? '全部预设（已忽略分组筛选）' : '组内预设（点单个预设：给当前卡片 / 已选片段分配）'}</div><div className="flex flex-wrap gap-1">{visiblePresets.map(preset => <button key={preset.id} type="button" onClick={() => assignPresetToActive(preset.id)} className={`max-w-52 rounded border px-2 py-1 font-semibold transition ${batchPresetId === preset.id ? 'border-violet-300 bg-violet-700 text-white' : 'border-violet-800 bg-[#111b2d] text-violet-100 hover:border-violet-400'}`} title={preset.name}>{preset.name}</button>)}</div></>; })()}
              </div>
              <div className="mt-2 text-slate-400">上方开关只影响点击预设组的分配范围；点单个预设仍给当前高亮片段或已勾选片段分配。</div>
            </div></div>
          </aside>
          <div role="separator" aria-label="拖动调整预设区宽度" aria-orientation="vertical" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const container = event.currentTarget.parentElement!.getBoundingClientRect(); setPresetPanelWidth(Math.max(240, Math.min(800, container.width - 280, event.clientX - container.left))); } }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} className="relative z-20 shrink-0 cursor-col-resize bg-slate-600 hover:bg-slate-400 before:absolute before:inset-y-0 before:-left-1 before:w-2 before:content-['']" style={{ width: 1, touchAction: 'none' }} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="source-results-toolbar shrink-0 z-30 border-b border-slate-700 bg-[#101a2e] p-3"><div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-300"><button type="button" data-toolbar-type="assignment" aria-pressed={clickToAssign} onClick={() => setClickToAssign(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${clickToAssign ? 'border-emerald-400 bg-emerald-950 text-emerald-200' : 'border-sky-700 bg-sky-950/40 text-sky-200'}`} title="关闭时点图片或预设只选中；开启时会立即填入当前片段并跳到下一段">点击即分配：{clickToAssign ? '开' : '关'}</button><button type="button" data-toolbar-type="selection" aria-pressed={multiSelectMode} onClick={() => setMultiSelectMode(value => !value)} className="rounded border border-amber-500 px-2 py-1 font-semibold text-amber-200" title="开启后点击卡片图片选择片段，再点取消；与图片大小和卡片操作显示无关">多选：{multiSelectMode ? '开' : '关'}</button><button type="button" data-toolbar-type="display" aria-pressed={showSegmentText} onClick={() => setShowSegmentText(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${showSegmentText ? 'border-slate-500 bg-slate-800 text-slate-200' : 'border-slate-700 bg-slate-950 text-slate-500'}`}>文案：{showSegmentText ? '显示' : '隐藏'}</button><button type="button" data-toolbar-type="display" aria-pressed={showSegmentPreset} onClick={() => setShowSegmentPreset(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${showSegmentPreset ? 'border-violet-600 bg-violet-950 text-violet-200' : 'border-slate-700 bg-slate-950 text-slate-500'}`}>预设：{showSegmentPreset ? '显示' : '隐藏'}</button><button type="button" data-toolbar-type="display" aria-pressed={showSegmentFinalPrompt} onClick={() => setShowSegmentFinalPrompt(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${showSegmentFinalPrompt ? 'border-cyan-500 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-950 text-slate-500'}`}>最终描述词：{showSegmentFinalPrompt ? '显示' : '隐藏'}</button><span className="font-semibold text-amber-200">已选 {selectedSegmentIds.size}/{segments.length}{selectedSegmentIds.size > 0 ? ' · 点图片/预设即分配' : ''}</span><button type="button" data-toolbar-type="selection" onClick={() => setSelectedSegmentIds(new Set(segments.map(segment => segment.id)))} className="rounded border border-amber-700 px-2 py-1 text-amber-200 hover:bg-amber-950">全选</button><button type="button" data-toolbar-type="selection" onClick={() => setSelectedSegmentIds(current => new Set(segments.filter(segment => !current.has(segment.id)).map(segment => segment.id)))} className="rounded border border-amber-700 px-2 py-1 text-amber-200 hover:bg-amber-950">反选</button><button type="button" data-toolbar-type="selection" onClick={selectFirstSegmentOfEachSource} disabled={!firstSegmentIdsBySource.length} className="rounded border border-amber-600 bg-amber-950/40 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-900 disabled:opacity-35" title="选择当前窗口每个文案组的第一个片段，包含未显示的分页；替换当前选择">选择每组第一个 ({firstSegmentIdsBySource.length})</button><button type="button" data-toolbar-type="selection" onClick={() => setSelectedSegmentIds(new Set())} disabled={selectedSegmentIds.size === 0} className="rounded border border-amber-700 px-2 py-1 text-amber-200 hover:bg-amber-950 disabled:opacity-35">取消选择</button>{['睁眼', '闭眼'].map(annotation => <button key={annotation} type="button" disabled={!annotationSelections[annotation].length} data-toolbar-type="selection" onClick={() => selectAnnotation(annotation)} className="rounded border border-amber-600 bg-amber-950/40 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-900 disabled:opacity-35" title="选择当前窗口所有篇章中此标注的片段，包含未显示的分页；替换当前选择">选择全部{annotation} ({annotationSelections[annotation].length})</button>)}<button type="button" data-toolbar-type="display" aria-pressed={showWordCount} onClick={() => setShowWordCount(value => !value)} className={`rounded border px-2 py-1 ${showWordCount ? 'border-slate-500 bg-slate-800 text-slate-200' : 'border-slate-700 text-slate-500'}`}>单词数：{showWordCount ? '显示' : '隐藏'}</button><span className="shrink-0 font-semibold">图卡大小</span><input type="range" min="50" max="640" step="10" value={cardWidth} onChange={event => setCardWidth(Number(event.target.value))} className="h-1.5 w-28 cursor-pointer accent-sky-500" aria-label="调整分段图片卡大小" /><span className="w-10 font-mono text-sky-300">{cardWidth}px</span></div><div className="mt-2 flex gap-2"></div><div className="mt-2 flex flex-col gap-2 border-t border-slate-700 pt-2">{displayedCards.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300"><button type="button" data-toolbar-type="display" aria-pressed={showCardFileNames} onClick={() => setShowCardFileNames(value => !value)} className={`rounded border px-2 py-1 font-semibold ${showCardFileNames ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-slate-600 text-slate-400'}`}>文件名字：{showCardFileNames ? '显示' : '隐藏'}</button><PageSizeControl enabled={cardPaginationEnabled} onToggle={enabled => { setCardPaginationEnabled(enabled); setCardPage(0); }} value={cardPageSizeSetting} onChange={next => { setCardPageSize(next); setCardPage(Math.floor(effectiveCardPage * cardPageSize / next)); }} /><button style={{ display: cardPaginationEnabled ? undefined : 'none' }} type="button" disabled={!effectiveCardPage} onClick={() => setCardPage(effectiveCardPage - 1)} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">上一页</button><span style={{ display: cardPaginationEnabled ? undefined : 'none' }}>第 {effectiveCardPage + 1} / {Math.ceil(displayedCards.length / cardPageSize)} 页 · 共 {displayedCards.length} 个片段</span><button style={{ display: cardPaginationEnabled ? undefined : 'none' }} type="button" disabled={effectiveCardPage >= Math.ceil(displayedCards.length / cardPageSize) - 1} onClick={() => setCardPage(effectiveCardPage + 1)} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">下一页</button>{!cardPaginationEnabled && <span>显示全部 · 共 {displayedCards.length} 个片段</span>}</div>}</div><label className="flex items-center gap-2">搜索<input type="search" aria-label="搜索片段卡片" value={cardSearch} onChange={event => { setCardSearch(event.target.value); setCardPage(0); }} placeholder="图片名字 / 文案 / 描述词 / 预设 / 组" className="w-72 max-w-full rounded border border-slate-500 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>{cardSearch.trim() && <span>匹配 {displayedCards.length} / {candidateCards.length} 个片段</span>}<div className="toolbar-secondary-row"><button type="button" data-toolbar-type="display" aria-pressed={showCardActions} onClick={() => setShowCardActions(value => !value)} className="rounded border border-slate-600 px-2 py-1 text-xs">卡片操作：{showCardActions ? '显示' : '隐藏'}</button><button type="button" data-toolbar-type="display" aria-pressed={!topContentCollapsed} onClick={() => setTopContentCollapsed(value => !value)} className="rounded border border-slate-600 px-2 py-1 text-xs">图片组：{topContentCollapsed ? '展开' : '收起'}</button><button data-toolbar-type="group" type="button"  aria-pressed={groupCardsByPreset} onClick={() => { setGroupCardsByPreset(value => !value); setCardPage(0); }} className={`rounded border px-3 py-2 font-semibold ${groupCardsByPreset ? 'border-violet-400 bg-violet-800 text-white' : 'border-slate-600 text-slate-300'}`}>按预设组显示：{groupCardsByPreset ? '开' : '关'}</button></div></div>
            {!topContentCollapsed && <div className="m-3 shrink-0"><section className="rounded-lg border border-sky-900/70 bg-sky-950/20 p-2.5"><div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]"><span className="font-semibold text-sky-200">图片组</span><span className="text-slate-500">{images.length} 张</span><button type="button" onClick={() => { setPreviewEnabled(value => !value); setPreviewImage(null); }} className={`rounded border px-2 py-1 font-semibold transition ${previewEnabled ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-sky-700 bg-sky-950/40 text-sky-200'}`}><Eye className="mr-1 inline h-3 w-3" />悬浮大图：{previewEnabled ? '开' : '关'}</button><button type="button" onClick={() => setShowImageNames(value => !value)} className={`rounded border px-2 py-1 font-semibold transition ${showImageNames ? 'border-sky-400 bg-sky-950 text-sky-100' : 'border-sky-700 bg-sky-950/40 text-sky-200'}`}>图片名字：{showImageNames ? '显示' : '隐藏'}</button><button type="button" disabled={!onCopyAllImages || images.length === 0} onClick={async () => { if (await onCopyAllImages?.()) setAllImagesCopied(true); }} className={`rounded border px-2 py-1 font-semibold transition disabled:opacity-35 ${allImagesCopied ? 'border-emerald-400 bg-emerald-700 text-white' : 'border-emerald-700 text-emerald-200 hover:bg-emerald-950'}`}><Copy className="mr-1 inline h-3 w-3" />{allImagesCopied ? '全部图片已复制' : '复制全部图片'}</button><div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="font-semibold text-sky-200">应用到：</span><button type="button" disabled={!selectedImageId} onClick={() => applyImageTo('all')} className="rounded border border-sky-700 px-2 py-1 text-sky-200 hover:bg-sky-900 disabled:opacity-60">全部片段</button><button type="button" disabled={!selectedImageId} onClick={() => applyImageTo('remaining')} className="rounded border border-sky-700 px-2 py-1 text-sky-200 hover:bg-sky-900 disabled:opacity-60">剩余未配图片段</button><button type="button" disabled={!selectedImageId || selectedSegmentIds.size === 0} onClick={() => applyImageTo('selected')} className="rounded border border-sky-700 px-2 py-1 text-sky-200 hover:bg-sky-900 disabled:opacity-60">已选片段 {selectedSegmentIds.size || ''}</button></div><span className="ml-auto text-sky-300">大小</span><input type="range" min="32" max="240" step="4" value={assetThumbHeight} onChange={event => setAssetThumbHeight(Number(event.target.value))} className="h-1 w-20 cursor-pointer accent-sky-500" aria-label="调整图片组缩略图大小" /></div><div className="flex gap-1.5 overflow-x-auto pb-1">{images.map(image => <div key={image.id} className="w-fit shrink-0"><button type="button" onClick={() => { setSelectedImageId(image.id); if (clickToAssign || selectedSegmentIds.size > 0) assignImage(image.id); }} onMouseEnter={() => previewEnabled && setPreviewImage(image)} onMouseLeave={() => setPreviewImage(null)} style={{ height: assetThumbHeight, width: Math.round(assetThumbHeight * 9 / 16) }} className={`group relative block overflow-hidden rounded border bg-black hover:border-sky-400 ${selectedImageId === image.id ? 'border-sky-400 ring-2 ring-sky-400/60' : 'border-slate-700'}`}><img loading="lazy" decoding="async" src={image.url} alt={image.name} className="h-full w-full object-cover" /></button>{showImageNames && <div title={image.name} style={{ width: Math.round(assetThumbHeight * 9 / 16) }} className="mt-1 truncate text-center text-[10px] text-slate-300">{image.name}</div>}</div>)}</div></section></div>}
          <div className="min-h-0 flex-1 overflow-y-auto pt-2">{groupCardsByPreset && <div className="source-card-group-toolbar sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-700 bg-[#101a2e] px-4 py-2 text-xs">{groupCardsByPreset && <><button type="button" onClick={() => { setCardPresetGroup(null); setCardPage(0); setSelectedSegmentIds(new Set()); setSelectedSourceIndexes(new Set()); }} className={`rounded border px-2 py-1 ${cardPresetGroup === null ? 'border-violet-300 bg-violet-700' : 'border-slate-600'}`} title="按文案数统计，同一篇的多个片段只计一次">全部 ({new Set(segments.map(segment => segment.sourceIndex ?? 0)).size} 篇)</button>{Array.from(assignedPresetGroups).map(([category, items]) => <button key={category} type="button" onClick={() => { setCardPresetGroup(category); setCardPage(0); setSelectedSegmentIds(new Set()); setSelectedSourceIndexes(new Set()); }} className={`rounded border px-2 py-1 ${cardPresetGroup === category ? 'border-violet-300 bg-violet-700' : 'border-slate-600'}`} title="本预设组涉及的文案数，同一篇的多个片段只计一次">{category} ({new Set(items.map(segment => segment.sourceIndex ?? 0)).size} 篇)</button>)}<button type="button" disabled={!displayedCards.length} onClick={() => { setSelectedSourceIndexes(new Set()); setSelectedSegmentIds(new Set(displayedCards.map(segment => segment.id))); }} className="rounded border border-amber-500 px-3 py-1 font-semibold text-amber-200 disabled:opacity-35">全选当前分组 ({displayedCards.length})</button></>}</div>}
          <div className="mx-4 mb-4 grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}>


          {!displayedCards.length && <p className="p-6 text-sm text-slate-400">{cardSearch.trim() ? '没有匹配的片段，请更换关键词' : '当前没有片段'}</p>}
          {pageCards.map((segment, pageIndex) => {
            const index = originalSegmentIndexes.get(segment.id) ?? 0;
            const image = imageById.get(assignments[segment.id]);
            const active = index === activeIndex;
            const sourceNumber = segment.sourceIndex ?? 0;
            const sourceColor = SOURCE_CARD_COLORS[sourceNumber % SOURCE_CARD_COLORS.length];
            const presetId = presetAssignments[segment.id] || '';
            const localPreset = presets.find(preset => preset.id === presetId);
            const localFinalPrompt = localPreset ? localPreset.template.split(CONTENT_PLACEHOLDER).join(segment.text) : finalPrompts?.[segment.id] || '';
            const isSelected = selectedSegmentIds.has(segment.id);
            const isCopied = copiedSegmentIds?.has(segment.id);
            const imageCopied = copiedImageSegmentIds.has(segment.id);
            const promptCopied = copiedPromptSegmentIds.has(segment.id);
            const copiedStatus = imageCopied && promptCopied ? '图词已复制' : imageCopied ? '图已复制' : promptCopied ? '词已复制' : isCopied ? '已复制' : '';
            const wordCount = (segment.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
            const compactCard = cardWidth < 80;
            const condensedText = cardWidth < 140;
            const imageFirstCard = cardWidth < 140;
            const startsSourceRow = showSourceRows && (pageIndex === 0 || (pageCards[pageIndex - 1].sourceIndex ?? 0) !== sourceNumber);
            const sourceCounts = sourceAssignmentCounts.get(sourceNumber);
            const sourceImages = startsSourceRow ? imageGroups.find(group => group.key === sourceImageGroupBindings?.[sourceNumber])?.images || [] : [];
            const selectedSourceSegmentCount = startsSourceRow ? segments.filter(item => (item.sourceIndex ?? 0) === sourceNumber && selectedSegmentIds.has(item.id)).length : 0;
            return <React.Fragment key={segment.id}>
              {startsSourceRow && <div data-source-row={sourceNumber} style={{ gridColumn: '1 / -1', borderColor: sourceColor.border, backgroundColor: sourceColor.background }} className="mt-3 min-w-0 rounded-lg border-l-4 px-3 py-2 text-xs first:mt-0">
                <div className="flex flex-wrap items-center gap-3">
                <strong className="text-sm text-white">文案 {sourceNumber + 1}</strong>
                <span className="text-slate-200">已配图 {sourceCounts?.assigned || 0} / {sourceCounts?.total || 0} 段</span>
                <span className="text-slate-300">{sourceImageGroupBindings?.[sourceNumber] ? `绑定图片组：${sourceImageGroupBindings[sourceNumber]}` : '未绑定图片组'}</span>
                <span className="text-slate-400">先点片段，再点下方图片分配；连续点击可依次配图</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sky-200">
                  <span>本组图片 · {sourceImages.length} 张</span>
                  {selectedSourceSegmentCount > 0
                    ? <span>点击分配给本篇已选的 {selectedSourceSegmentCount} 个片段</span>
                    : <span>{(segments[activeIndex]?.sourceIndex ?? 0) === sourceNumber ? `当前片段 #${sourceSegmentNumbers.get(segments[activeIndex]?.id) || 1}` : '点击从本篇首个未配图片段开始'}</span>}
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`文案 ${sourceNumber + 1} 的图片组`}>
                  {sourceImages.map(sourceImage => <div key={sourceImage.id} className="shrink-0" style={{ width: Math.round(assetThumbHeight * 9 / 16) }}>
                    <button type="button" title={`分配图片：${sourceImage.name}`} aria-label={`为文案 ${sourceNumber + 1} 分配图片 ${sourceImage.name}`} onClick={() => { setSelectedImageId(sourceImage.id); assignImage(sourceImage.id, sourceNumber); }} onMouseEnter={() => previewEnabled && setPreviewImage(sourceImage)} onMouseLeave={() => setPreviewImage(null)} style={{ height: assetThumbHeight }} className={`block w-full overflow-hidden rounded border bg-black hover:border-sky-300 ${selectedImageId === sourceImage.id ? 'border-sky-300 ring-2 ring-inset ring-sky-300/60' : 'border-slate-600'}`}>
                      <img loading="lazy" decoding="async" src={sourceImage.url} alt={sourceImage.name} className="h-full w-full object-cover" />
                    </button>
                    {showImageNames && <div title={sourceImage.name} className="mt-1 truncate text-center text-[10px] text-slate-300">{sourceImage.name}</div>}
                  </div>)}
                  {!sourceImages.length && <span className="py-2 text-slate-400">{sourceImageGroupBindings?.[sourceNumber] ? '绑定图片组中暂无可用图片，请检查导入素材' : '请先为本篇文案绑定图片组'}</span>}
                </div>
              </div>}
              <div data-segment-id={segment.id} onMouseEnter={() => previewEnabled && image && setPreviewImage(image)} onMouseLeave={() => setPreviewImage(null)} style={{ backgroundColor: sourceColor.background, borderColor: isSelected ? '#ffffff' : sourceColor.border, borderWidth: 0.5, boxShadow: isSelected ? '0 0 0 2px #ffffff, 0 0 8px rgba(255, 255, 255, 0.55)' : active ? '0 0 0 1.5px #ffffff' : undefined }} className={`relative overflow-hidden rounded-md border bg-[#111b2d] shadow-lg ${isSelected ? 'z-10' : 'border-slate-700 hover:border-slate-500'}`}>
              <div className={`flex items-center justify-between font-bold ${imageFirstCard ? 'absolute right-1 top-1 z-10 rounded px-1 py-0.5 text-[9px] whitespace-nowrap' : 'px-2 py-1 text-[10px]'}`} style={{ backgroundColor: sourceColor.border, color: '#08111f' }}><span>{imageFirstCard ? `${sourceNumber + 1}篇` : `第 ${sourceNumber + 1} 篇`}</span>{!imageFirstCard && (isSelected ? <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-slate-950">✓ 已选</span> : active && <span>当前</span>)}</div>
              {!imageFirstCard && showCardActions && <div className="flex items-center gap-1.5 border-t border-slate-700/70 bg-[#0b1425] px-2 py-2"><button type="button" onClick={() => toggleSegmentSelection(segment.id)} className={`rounded border px-2 py-1 text-[10px] font-bold transition ${isSelected ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-600 text-slate-300 hover:border-amber-400 hover:text-amber-100'}`}>{isSelected ? '✓ 已选片段' : '选择片段'}</button>{sourceIndex < 0 && <button type="button" onClick={() => { const groupIndex = segment.sourceIndex ?? 0; const groupIds = segments.filter(item => (item.sourceIndex ?? 0) === groupIndex).map(item => item.id); const wasSelected = selectedSourceIndexes.has(groupIndex); setSelectedSourceIndexes(current => { const next = new Set(current); if (wasSelected) next.delete(groupIndex); else next.add(groupIndex); return next; }); setSelectedSegmentIds(current => { const next = new Set(current); groupIds.forEach(id => wasSelected ? next.delete(id) : next.add(id)); return next; }); }} className={`rounded border px-2 py-1 text-[10px] font-bold ${selectedSourceIndexes.has(segment.sourceIndex ?? 0) ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-amber-700 text-amber-200 hover:bg-amber-950'}`} title="选中与这张卡片同属一篇文案的全部片段">{selectedSourceIndexes.has(segment.sourceIndex ?? 0) ? '✓ 已选整组' : '选择整组'}</button>}{image && <button type="button" onClick={() => setAssignments(current => ({ ...current, [segment.id]: undefined }))} className="ml-auto rounded border border-rose-900 px-1.5 py-1 text-rose-300 hover:bg-rose-950" title="移除此片段的图片"><Trash2 className="h-3 w-3" /></button>}</div>}
              {showCardFileNames && <div className="border-t border-slate-700/70 bg-slate-950/50 px-2 py-1.5 text-xs leading-relaxed text-sky-200 break-all" title={image?.name}>文件：{image?.name || '未分配图片'}</div>}
              {isSelected && <span className={`pointer-events-none absolute z-20 flex items-center justify-center rounded-full border-2 border-slate-950 bg-white font-black text-slate-950 shadow-lg ${imageFirstCard ? 'left-1 bottom-6 h-6 w-6 text-sm' : 'right-2 top-12 h-8 w-8 text-lg'}`} aria-label="已选片段">✓</span>}
              <button type="button" onClick={() => clickSegmentCard(segment.id, index)} aria-pressed={multiSelectMode ? isSelected : undefined} title={multiSelectMode ? (isSelected ? '点击取消选择' : '点击选择片段') : '设为当前片段'} className="block w-full text-left"><div className="relative flex aspect-[9/16] w-full items-center justify-center bg-black">{image ? <img loading="lazy" decoding="async" src={image.url} alt={image.name} className="h-full w-full object-cover" /> : <span className="px-3 text-center text-xs leading-relaxed text-slate-400">{compactCard ? '选图' : showSourceRows ? '点击后从本篇图片组选图' : '点击后从上方选图'}</span>}<span className={`absolute rounded bg-slate-950/90 font-bold text-white ${imageFirstCard ? 'left-0.5 top-0.5 px-1 py-0.5 text-[9px]' : 'left-2 top-2 px-2 py-1 text-xs'}`}>#{showSourceRows ? sourceSegmentNumbers.get(segment.id) : index + 1}</span></div>{showSegmentText && <div className={`${condensedText ? 'h-12 px-1 py-1 text-[9px] leading-tight line-clamp-3' : 'h-24 px-3 py-2 text-xs leading-relaxed line-clamp-3'} overflow-hidden border-t border-slate-700/70 text-slate-200`} title={segment.text}>{segment.text || '空片段'}</div>}</button>
              {(segment.annotation || showWordCount) && <div style={{ backgroundColor: sourceColor.background }} className={`flex flex-wrap items-center justify-between gap-1 border-t border-slate-700/70 ${imageFirstCard ? 'px-1 py-0.5 text-[9px]' : 'px-3 py-2 text-[11px]'}`}>
                {segment.annotation && <span className="rounded border border-amber-600/50 bg-amber-950/50 px-1.5 py-0.5 font-semibold text-amber-200" title={segment.annotation}>{segment.annotation}</span>}
                {showWordCount && <span className="ml-auto text-slate-400" title="仅统计片段正文中的单词，不包含标注和时长">{wordCount} 词</span>}
              </div>}
              {showSegmentPreset && <div className={`border-t border-slate-700/70 bg-[#0d1729] ${imageFirstCard ? 'px-0.5 py-1' : 'px-2 py-2'}`}><select value={presetId} onChange={event => setPresetAssignments(current => ({ ...current, [segment.id]: event.target.value || undefined }))} onClick={event => event.stopPropagation()} title={localPreset ? `${localPreset.category || '未分类预设'}｜${localPreset.name}` : '使用统一模板'} className={`w-full min-w-0 rounded border outline-none transition-colors ${imageFirstCard ? 'px-0 py-1 text-[9px]' : 'px-2 py-1.5 text-[11px]'} ${presetTone(presetId)}`}><option value="">使用统一模板</option>{presetGroups.map(([category, groupPresets]) => <optgroup key={category} label={category}>{groupPresets.map(preset => <option key={preset.id} value={preset.id}>{category}｜{preset.name}</option>)}</optgroup>)}</select></div>}
              {showSegmentFinalPrompt && <div className={`border-t border-cyan-900/60 bg-cyan-950/15 ${imageFirstCard ? 'px-1 py-1' : 'px-2 py-2'}`}><div className={`line-clamp-3 min-h-12 text-cyan-50 ${imageFirstCard ? 'text-[9px] leading-tight' : 'text-[11px] leading-relaxed'}`} title={localFinalPrompt}>{localFinalPrompt || '暂无最终描述词'}</div><div className="mt-2 flex flex-wrap gap-1"><button type="button" disabled={!image || !onCopyImage} onClick={async () => { if (image && await onCopyImage?.(image, segment.id)) setCopiedImageSegmentIds(current => new Set(current).add(segment.id)); }} className={`rounded border px-2 py-1 text-[10px] font-semibold transition disabled:opacity-35 ${imageCopied ? 'border-emerald-400 bg-emerald-700 text-white' : 'border-sky-700 text-sky-200 hover:bg-sky-950'}`}><Copy className="mr-1 inline h-3 w-3" />{imageCopied ? '图已复制' : '复制图'}</button><button type="button" disabled={!localFinalPrompt || !onCopyPrompt} onClick={async () => { if (await onCopyPrompt?.(localFinalPrompt, segment.id, image)) setCopiedPromptSegmentIds(current => new Set(current).add(segment.id)); }} className={`rounded border px-2 py-1 text-[10px] font-semibold transition disabled:opacity-35 ${promptCopied ? 'border-emerald-400 bg-emerald-700 text-white' : 'border-cyan-700 text-cyan-100 hover:bg-cyan-950'}`}><Copy className="mr-1 inline h-3 w-3" />{promptCopied ? '词已复制' : '复制词'}</button></div></div>}
              {imageFirstCard && showCardActions && <button type="button" onClick={() => toggleSegmentSelection(segment.id)} className={`absolute right-0.5 top-0.5 rounded px-1 py-0.5 text-[9px] font-bold ${isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-950/90 text-slate-300'}`}>{isSelected ? '✓' : '＋'}</button>}
              {copiedStatus && !compactCard && <span className="absolute left-2 top-9 rounded bg-emerald-600 px-1.5 py-1 text-[10px] font-bold text-white shadow">✓ {copiedStatus}</span>}
              {imageFirstCard && showCardActions && image && <button type="button" onClick={() => setAssignments(current => ({ ...current, [segment.id]: undefined }))} className="absolute right-0.5 top-6 rounded bg-rose-950/90 p-1 text-rose-300 hover:bg-rose-800" title="删除此段图片分配"><Trash2 className="h-2.5 w-2.5" /></button>}
            </div></React.Fragment>;
          })}
          </div>
          </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 bg-[#101a2e] px-5 py-3">{onSaveProject && <label className="mr-3 flex items-center gap-1 text-xs text-sky-200"><input type="checkbox" checked={saveProjectWithAssignments} disabled={savingProject} onChange={event => setSaveProjectWithAssignments(event.target.checked)} />同时保存整批工程</label>}{projectSaveError && <span className="text-xs text-rose-300">{projectSaveError}</span>}{savingProject && <span className="text-xs text-sky-200">正在打包工程…</span>}<span className={`mr-auto self-center text-xs ${hasUnsavedChanges ? 'text-amber-300' : 'text-emerald-300'}`}>{hasUnsavedChanges ? '有未保存的分配，点击保存或完成后同步' : '分配已保存'}</span><button type="button" onClick={requestClose} className="rounded-lg border border-slate-500 bg-slate-800 px-4 py-2 text-xs text-slate-200">关闭</button><button type="button" onClick={() => saveAssignments(false)} disabled={savingProject || (!hasUnsavedChanges && !saveProjectWithAssignments)} className="rounded-lg border border-sky-500 bg-sky-800 px-4 py-2 text-xs text-white disabled:opacity-40">保存</button><button type="button" disabled={savingProject} onClick={() => saveAssignments(true)} className="rounded-lg border border-emerald-500 bg-emerald-800 px-4 py-2 text-xs text-white">完成并保存</button></div>
        {showCloseChoice && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75" onClick={event => event.stopPropagation()}><div role="dialog" aria-label="未保存的分配" className="rounded-xl border border-slate-600 bg-slate-900 p-5"><p className="mb-4 text-sm text-white">分配尚未保存，如何处理？</p><div className="flex gap-2"><button type="button" onClick={() => saveAssignments(true)} className="rounded bg-emerald-700 px-3 py-2 text-xs text-white">保存并关闭</button><button type="button" onClick={onClose} className="rounded bg-rose-900 px-3 py-2 text-xs text-white">放弃修改</button><button type="button" onClick={() => setShowCloseChoice(false)} className="rounded bg-slate-700 px-3 py-2 text-xs text-white">继续编辑</button></div></div></div>}
        {previewImage && (
          <div className="pointer-events-none fixed bottom-7 right-7 z-[80] flex w-[min(42vw,560px)] flex-col rounded-xl border border-sky-400/70 bg-[#081121]/95 p-3 shadow-2xl shadow-black/80 backdrop-blur">
            <div className="mb-2 truncate text-xs font-semibold text-sky-100">原图预览 · {previewImage.name}</div>
            <div className="flex h-[min(55vh,480px)] items-center justify-center rounded-lg bg-black/80">
              <img loading="lazy" decoding="async" src={previewImage.url} alt={previewImage.name} className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
