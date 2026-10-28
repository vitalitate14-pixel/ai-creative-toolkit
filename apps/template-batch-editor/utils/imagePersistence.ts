import type { AttachedImage } from '../components/ImageDropZone';

let database: Promise<IDBDatabase> | undefined;
const savedFiles = new WeakSet<Blob>();
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('template-batch-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}

export async function cacheWorkspaceImages(images: AttachedImage[]) {
  const pending = [...new Map(images.filter(image => image.file instanceof Blob && image.file.size > 0 && !savedFiles.has(image.file)).map(image => [image.id, image])).values()];
  if (!pending.length) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite');
    const store = transaction.objectStore('images');
    pending.forEach(image => store.put(image.file, image.id));
    transaction.oncomplete = () => { pending.forEach(image => savedFiles.add(image.file)); resolve(); };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function restoreWorkspaceImages(images: AttachedImage[]): Promise<AttachedImage[]> {
  if (!images.length) return images;
  const db = await openDatabase();
  const blobs = await new Promise<Map<string, Blob>>((resolve, reject) => {
    const result = new Map<string, Blob>();
    const transaction = db.transaction('images', 'readonly');
    const store = transaction.objectStore('images');
    images.forEach(image => {
      const request = store.get(image.id);
      request.onsuccess = () => { if (request.result instanceof Blob) result.set(image.id, request.result); };
    });
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return images.map(image => {
    if (image.file instanceof Blob && image.url) return image;
    const blob = blobs.get(image.id);
    if (!blob) return { ...image, url: image.gyazoUrl || '' };
    const file = new File([blob], image.name, { type: blob.type });
    savedFiles.add(file);
    return { ...image, file, size: file.size, url: URL.createObjectURL(file) };
  });
}
