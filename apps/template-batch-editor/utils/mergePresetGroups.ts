import type { TemplatePreset } from '../constants/presetDefaults';

export function mergeSameNamePresetGroups(presets: TemplatePreset[]) {
  const normalize = (name: string) => name.normalize('NFC').trim();
  const reserved = new Map<string, Set<string>>();
  const used = new Map<string, Set<string>>();
  presets.forEach(preset => {
    const group = normalize(preset.category || '通用') || '通用';
    if (!reserved.has(group)) reserved.set(group, new Set());
    reserved.get(group)!.add(normalize(preset.name));
  });
  let renamed = 0;
  let normalized = 0;
  const merged = presets.map(preset => {
    const category = normalize(preset.category || '通用') || '通用';
    if (!used.has(category)) used.set(category, new Set());
    const names = used.get(category)!;
    const baseName = normalize(preset.name) || '未命名预设';
    let name = baseName;
    if (names.has(name)) {
      let suffix = 2;
      do { name = `${baseName} (${suffix++})`; } while (names.has(name) || reserved.get(category)!.has(name));
      renamed++;
    }
    names.add(name);
    if (category !== preset.category) normalized++;
    return name === preset.name && category === preset.category ? preset : { ...preset, category, name, updatedAt: Date.now() };
  });
  return { presets: merged, renamed, normalized };
}
