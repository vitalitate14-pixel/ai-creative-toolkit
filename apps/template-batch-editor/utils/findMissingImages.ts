import type { AttachedImage } from '../components/ImageDropZone';

export function findMissingImages(images: AttachedImage[], files: File[], refreshExisting = false) {
  const normalize = (path: string) => path.replace(/\\/g, '/').replace(/^\/+/, '');
  const byName = new Map<string, File[]>();
  files.forEach(file => byName.set(file.name, [...(byName.get(file.name) || []), file]));
  const matches = new Map<string, File>();
  let ambiguous = 0;
  for (const image of images) {
    if (!refreshExisting && image.file instanceof Blob && image.file.size > 0) continue;
    const candidates = byName.get(image.name) || [];
    const savedPath = normalize(image.fullPath || image.name);
    const exact = candidates.filter(file => {
      const path = normalize(file.webkitRelativePath || file.name);
      return path === savedPath || (savedPath.includes('/') && (path.endsWith(`/${savedPath}`) || savedPath.endsWith(`/${path}`)));
    });
    const options = exact.length ? exact : candidates;
    const sameSize = image.size ? options.filter(file => file.size === image.size) : [];
    const narrowed = options.length > 1 && sameSize.length ? sameSize : options;
    if (narrowed.length === 1) matches.set(image.id, narrowed[0]);
    else if (narrowed.length > 1) ambiguous++;
  }
  return { matches, ambiguous };
}
