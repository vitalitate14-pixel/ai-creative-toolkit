export function getOriginalImagePath(image: { file?: File; originalPath?: string }): string {
  try {
    return (window as any).electronAPI?.getOriginalFilePath?.(image.file) || image.originalPath || '';
  } catch {
    return image.originalPath || '';
  }
}
