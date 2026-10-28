export interface TemplatePreset {
  id: string;
  name: string;
  template: string;
  category?: string;
  updatedAt?: number;
}

export const CONTENT_PLACEHOLDER = '{{内容}}';
export const QUOTED_CONTENT_PLACEHOLDER = `"${CONTENT_PLACEHOLDER}"`;

/** 以前随工具附带的示例预设。仅用于清理旧本地数据，不再显示或重新写入。 */
export const BUILTIN_TEMPLATE_PRESET_IDS = new Set([
  'preset-cinematic-close',
  'preset-anime-shinkai',
  'preset-3d-clay',
  'preset-flow-video',
  'preset-cyberpunk',
  'preset-guofeng'
]);

/** 新预设库从空白开始，用户自行创建和保存。 */
export const DEFAULT_TEMPLATE_PRESETS: TemplatePreset[] = [];
