const IDB_DB_NAME = "supahub-sqlite";
const IDB_STORE = "db";
const IDB_KEY = "data";
async function getOpfsRoot() {
    try {
        if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
            return await navigator.storage.getDirectory();
        }
    }
    catch {
        // OPFS not available
    }
    return null;
}
export async function readDatabase(filename) {
    const root = await getOpfsRoot();
    if (root) {
        try {
            const fileHandle = await root.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const buffer = await file.arrayBuffer();
            return new Uint8Array(buffer);
        }
        catch {
            // File doesn't exist yet
        }
    }
    return readFromIdb();
}
export async function writeDatabase(filename, data) {
    const root = await getOpfsRoot();
    if (root) {
        try {
            const fileHandle = await root.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            return;
        }
        catch {
            // Fall through to IDB
        }
    }
    await writeToIdb(data);
}
function openIdb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function readFromIdb() {
    try {
        const db = await openIdb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    }
    catch {
        return null;
    }
}
async function writeToIdb(data) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const req = tx.objectStore(IDB_STORE).put(data, IDB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
