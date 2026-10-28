type AssignedSegment = {
  id: string;
  text: string;
  sourceIndex?: number;
  imageId?: string;
  presetId?: string;
  promptTemplate?: string;
  customPrompts?: Record<string, string>;
};

/** 同篇内按片段位置沿用分配；新增位置不借用其他篇的分配。 */
export function retainSegmentAssignments<T extends AssignedSegment>(previous: AssignedSegment[], incoming: T[]): T[] {
  const groups = new Map<number, AssignedSegment[]>();
  previous.forEach(segment => {
    const source = segment.sourceIndex ?? 0;
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source)!.push(segment);
  });
  const positions = new Map<number, number>();
  return incoming.map(segment => {
    const source = segment.sourceIndex ?? 0;
    const position = positions.get(source) || 0;
    positions.set(source, position + 1);
    const old = groups.get(source)?.[position];
    if (!old) return segment;
    return { ...segment, imageId: old.imageId, presetId: segment.presetId ?? old.presetId, promptTemplate: segment.promptTemplate ?? old.promptTemplate, customPrompts: old.customPrompts };
  });
}
