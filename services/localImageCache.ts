/** Device-local originals; cloud project metadata never needs an image-host token. */
const DB_NAME = 'toolkit-local-images';
const STORE = 'images';
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
    if (!database) {
        database = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch(error => { database = undefined; throw error; });
    }
    return database;
}
export async function cacheLocalImage(id: string, dataUrl: string): Promise<void> {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(dataUrl, id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}
export async function readLocalImage(id: string): Promise<string | undefined> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(id);
        request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined);
        request.onerror = () => reject(request.error);
    });
}
