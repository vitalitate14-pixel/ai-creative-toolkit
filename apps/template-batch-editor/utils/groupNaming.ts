export const DEFAULT_GROUP_NAME_TEMPLATE = '{{图片组名字}}{{预设组名字}}-片段{{片段编号}}';
export const GROUP_NAME_FIELDS = ['图片文件夹', '图片名字', '图片组名字', '预设名字', '预设组名字', '预设组后缀', '片段编号'];
export const GROUP_NAME_PRESETS = [
  { label: '图片组名字 + 预设组名字 + 片段编号', template: '{{图片组名字}}{{预设组名字}}-片段{{片段编号}}' },
  { label: '图片名字 + 预设组名字 + 片段编号', template: '{{图片名字}}{{预设组名字}}-片段{{片段编号}}' },
  { label: '图片组名字 + 片段编号', template: '{{图片组名字}}-片段{{片段编号}}' },
  { label: '图片名字 + 片段编号', template: '{{图片名字}}-片段{{片段编号}}' },
];

// 修正之前快捷组合保存的连字符，保留用户自行编辑的其他模板。
export const migrateGroupNameTemplate = (template: string) => {
  if (template === '{{图片组名字}}-{{预设组名字}}-片段{{片段编号}}' || template === '{{图片组名字}}{{预设组后缀}}-片段{{片段编号}}') return GROUP_NAME_PRESETS[0].template;
  if (template === '{{图片名字}}-{{预设组名字}}-片段{{片段编号}}' || template === '{{图片名字}}{{预设组后缀}}-片段{{片段编号}}') return GROUP_NAME_PRESETS[1].template;
  return template;
};

export const formatGroupName = (template: string, fields: Record<string, string>) =>
  template.replace(/\{\{([^{}]+)\}\}/g, (token, field: string) => fields[field.trim()] ?? token);
