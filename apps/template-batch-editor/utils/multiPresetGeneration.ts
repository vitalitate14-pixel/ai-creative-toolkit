import type { TemplateSegment } from '../types';
import type { TemplatePreset } from '../constants/presetDefaults';

export type GenerationPlan = { id: string; kind: 'preset' | 'group'; target: string; count: number };
export type GeneratedPresetSet = { sourceIndex: number; label: string; segments: TemplateSegment[] };
export type GenerationOrder = 'article' | 'segment';

export function generatePresetSets(
  segments: TemplateSegment[], presets: TemplatePreset[], plans: GenerationPlan[],
  imageAssignments: Record<string, string | undefined>, mode: 'sequence' | 'random',
  random = Math.random
): GeneratedPresetSet[] {
  if (!plans.length) throw new Error('请添加至少一个预设或预设组');
  const resolved = plans.map(plan => {
    if (!Number.isInteger(plan.count) || plan.count < 1 || plan.count > 100) throw new Error('每项份数需填写 1–100 的整数');
    const members = presets.filter(preset => plan.kind === 'preset' ? preset.id === plan.target : (preset.category?.trim() || '未分类预设') === plan.target);
    if (!members.length) throw new Error('所选预设或预设组已不存在，请重新选择');
    return { plan, members };
  });
  const sources = new Map<number, TemplateSegment[]>();
  segments.forEach(segment => {
    const key = segment.sourceIndex ?? 0;
    sources.set(key, [...(sources.get(key) || []), segment]);
  });
  const total = segments.length * plans.reduce((sum, plan) => sum + plan.count, 0);
  if (total > 20000) throw new Error('本次结果超过 20000 个片段，请减少份数或分批生成');
  const result: GeneratedPresetSet[] = [];
  for (const [sourceIndex, parts] of sources) {
    for (const { plan, members } of resolved) {
      for (let copy = 0; copy < plan.count; copy++) {
        result.push({
          sourceIndex,
          label: `${plan.kind === 'group' ? plan.target : members[0].name} · 第 ${copy + 1} 份`,
          segments: parts.map((segment, partIndex) => {
            const preset = members[mode === 'random' ? Math.floor(random() * members.length) : (copy * parts.length + partIndex) % members.length];
            return {
              ...segment, id: `preset-variant-${crypto.randomUUID()}`,
              imageId: imageAssignments[segment.id] ?? segment.imageId,
              presetId: preset.id, promptTemplate: preset.template,
              finalPrompt: undefined, customPrompts: undefined, deliveryGroupName: undefined,
              modifiedType: undefined, modifiedAt: undefined,
            };
          })
        });
      }
    }
  }
  return result;
}

export function arrangePresetSets(sets: GeneratedPresetSet[], order: GenerationOrder) {
  if (order === 'article') return sets.flatMap(set => set.segments);
  const maxLength = Math.max(0, ...sets.map(set => set.segments.length));
  return Array.from({ length: maxLength }, (_, index) => sets.flatMap(set => set.segments[index] ? [set.segments[index]] : [] )).flat();
}
