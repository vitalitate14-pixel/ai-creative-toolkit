export interface TemplatePreset {
  id: string;
  name: string;
  template: string;
  category?: string;
  updatedAt?: number;
}

export const CONTENT_PLACEHOLDER = '{{内容}}';
export const QUOTED_CONTENT_PLACEHOLDER = `"${CONTENT_PLACEHOLDER}"`;

export const DEFAULT_TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'preset-cinematic-close',
    name: '电影特写·写实人像',
    template: 'A cinematic close-up shot, intense expression, highly detailed facial features, realistic skin texture, soft dramatic studio lighting, photorealistic 8k, character speaking: "{{内容}}"',
    category: '电影写实'
  },
  {
    id: 'preset-anime-shinkai',
    name: '二次元动漫·唯美光影',
    template: 'Makoto Shinkai anime aesthetic, beautiful sky, volumetric light rays, vibrant colors, cinematic anime scenery, character saying: "{{内容}}", 4k masterpiece',
    category: '二次元'
  },
  {
    id: 'preset-3d-clay',
    name: '3D 粘土·定格动画',
    template: 'Cute handcrafted claymation style, plasticine texture, warm studio light, miniature diorama effect, playful mood, dialogue line: "{{内容}}"',
    category: '粘土3D'
  },
  {
    id: 'preset-flow-video',
    name: 'Flow / Veo 视频镜头标准',
    template: 'Cinematic video shot, steady camera movement, consistent character, clean aesthetic, photorealistic 4k, voiceover: "{{内容}}"',
    category: '视频分镜'
  },
  {
    id: 'preset-cyberpunk',
    name: '赛博朋克·霓虹夜景',
    template: 'Cyberpunk futuristic city street, rainy night, vibrant neon reflections, cinematic teal and orange lighting, sci-fi character line: "{{内容}}"',
    category: '科幻未来'
  },
  {
    id: 'preset-guofeng',
    name: '国风水墨·意境古风',
    template: 'Traditional Chinese ink wash painting aesthetic, misty mountain and tranquil atmosphere, poetic lighting, ancient scene dialogue: "{{内容}}"',
    category: '国风古韵'
  }
];
