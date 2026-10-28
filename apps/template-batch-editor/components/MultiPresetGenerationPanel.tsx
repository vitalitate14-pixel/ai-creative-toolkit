import React, { useState } from 'react';
import type { TemplatePreset } from '../constants/presetDefaults';
import type { GenerationPlan, GenerationOrder } from '../utils/multiPresetGeneration';

type Props = {
  presets: TemplatePreset[];
  sourceCount: number;
  segmentCount: number;
  mode: 'sequence' | 'random';
  onGenerate: (plans: GenerationPlan[], order: GenerationOrder) => void;
};

export function MultiPresetGenerationPanel({ presets, sourceCount, segmentCount, mode, onGenerate }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [order, setOrder] = useState<GenerationOrder>('segment');
  const groups = [...new Set(presets.map(preset => preset.category?.trim() || '未分类预设'))];
  const totalCopies = plans.reduce((sum, plan) => sum + plan.count, 0);
  const valid = plans.length > 0 && plans.every(plan => plan.target && Number.isInteger(plan.count) && plan.count >= 1 && plan.count <= 100);
  const patch = (id: string, change: Partial<GenerationPlan>) => setPlans(current => current.map(plan => plan.id === id ? { ...plan, ...change } : plan));
  return <section className="mb-3 rounded-lg border border-cyan-700 bg-cyan-950/20 p-2">
    <button type="button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)} className={`rounded border px-2 py-1 font-semibold ${enabled ? 'border-cyan-300 bg-cyan-700 text-white' : 'border-slate-500 text-cyan-200'}`}>多预设生成：{enabled ? '开' : '关'}</button>
    {enabled && <div className="mt-2 space-y-2">
      <p className="text-slate-300">同一文案的图和片段按多项预设分别生成。已选片段所在的整篇文案参与；未选择时处理当前窗口全部文案。</p>
      {plans.map(plan => <div key={plan.id} className="flex flex-wrap items-center gap-1 rounded border border-slate-700 p-1.5">
        <select aria-label="生成类型" value={plan.kind} onChange={event => patch(plan.id, { kind: event.target.value as GenerationPlan['kind'], target: '' })} className="max-w-full rounded bg-slate-900 p-1 text-white"><option value="preset">预设</option><option value="group">预设组</option></select>
        <select aria-label="生成预设或预设组" value={plan.target} onChange={event => patch(plan.id, { target: event.target.value })} className="min-w-0 flex-1 rounded bg-slate-900 p-1 text-white"><option value="">请选择</option>{plan.kind === 'preset' ? presets.map(preset => <option key={preset.id} value={preset.id}>{preset.category || '未分类'}｜{preset.name}</option>) : groups.map(group => <option key={group} value={group}>{group}</option>)}</select>
        <label className="flex items-center gap-1">份数<input aria-label="生成份数" type="number" min="1" max="100" value={Number.isNaN(plan.count) ? '' : plan.count} onChange={event => patch(plan.id, { count: event.target.value === '' ? NaN : Number(event.target.value) })} className="w-14 rounded bg-slate-900 p-1 text-white" /></label>
        <button type="button" onClick={() => setPlans(current => current.filter(item => item.id !== plan.id))} className="px-1 text-rose-300" aria-label="移除生成项">×</button>
      </div>)}
      <button type="button" onClick={() => setPlans(current => [...current, { id: crypto.randomUUID(), kind: 'preset', target: presets[0]?.id || '', count: 1 }])} className="rounded border border-cyan-700 px-2 py-1 text-cyan-200">＋ 添加预设 / 预设组</button>
      <label className="block">结果排列<select value={order} onChange={event => setOrder(event.target.value as GenerationOrder)} className="mt-1 block w-full rounded bg-slate-900 p-1 text-white"><option value="article">按完整文案成套</option><option value="segment">按片段排列多份结果</option></select></label>
      <p className="text-slate-400">预设组按{mode === 'sequence' ? '顺序循环' : '随机'}给各片段分配组内预设，每组每份是一整篇；可用上方按钮切换方式。</p>
      <p className="text-cyan-200">{sourceCount} 篇 · {segmentCount} 个原片段 → 每篇 {totalCopies || 0} 份，共 {segmentCount * (totalCopies || 0)} 个结果片段。生成后替换参与文案的旧结果，图片保持原分配。</p>
      <button type="button" disabled={!valid || !segmentCount} onClick={() => onGenerate(plans, order)} className="w-full rounded bg-cyan-700 px-2 py-2 font-bold text-white disabled:opacity-35">生成多预设结果</button>
    </div>}
  </section>;
}
