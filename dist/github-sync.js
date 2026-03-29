import { exportBytes, importBytes, save } from "./db.js";
const SYNC_META_KEY = "supahub-sync-meta";
/**
 * Dirty flag: tracks whether the local DB has been modified since the last
 * successful push or pull. Prevents stale pushes that overwrite remote changes
 * (e.g. Python script updates that the browser hasn't seen yet).
 */
let _dirty = false;
export function markDirty() {
    _dirty = true;
}
export function isDirty() {
    return _dirty;
}
function getMeta() {
    if (typeof localStorage === "undefined")
        return { repo: "", path: "supahub.sqlite", lastSha: null, lastPushAt: null, lastPullAt: null };
    try {
        const raw = localStorage.getItem(SYNC_META_KEY);
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    return { repo: "", path: "supahub.sqlite", lastSha: null, lastPushAt: null, lastPullAt: null };
}
function setMeta(meta) {
    if (typeof localStorage !== "undefined") {
        localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    }
}
let currentToken = null;
export function configure(opts) {
    currentToken = opts.token;
    const meta = getMeta();
    meta.repo = opts.repo;
    if (opts.path)
        meta.path = opts.path;
    setMeta(meta);
}
export function getSyncStatus() {
    const meta = getMeta();
    return {
        configured: !!meta.repo && !!currentToken,
        repo: meta.repo,
        path: meta.path,
        lastPushAt: meta.lastPushAt,
        lastPullAt: meta.lastPullAt,
    };
}
function headers() {
    return {
        Authorization: `token ${currentToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
}
export async function push(opts) {
    const meta = getMeta();
    if (!meta.repo || !currentToken)
        return { success: false, error: "Not configured" };
    // Skip push if nothing changed locally — prevents stale data from
    // overwriting remote changes (e.g. Python script backfills).
    if (!_dirty && !opts?.force) {
        return { success: true };
    }
    try {
        await save();
        // Fetch current remote SHA
        let remoteSha;
        try {
            const res = await fetch(`https://api.github.com/repos/${meta.repo}/contents/${meta.path}`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                remoteSha = data.sha;
            }
        }
        catch { }
        // If remote changed since our last sync and we have local changes,
        // pull first to incorporate remote updates, then re-export.
        // This prevents the browser from blindly overwriting Python script changes.
        if (remoteSha && meta.lastSha && remoteSha !== meta.lastSha) {
            console.log(`[supahub] Remote SHA changed (${meta.lastSha?.slice(0, 7)} → ${remoteSha.slice(0, 7)}), pulling before push...`);
            const pullResult = await pull();
            if (pullResult.updated) {
                // Remote data imported — re-save to merge with OPFS
                await save();
            }
            // Re-fetch SHA after pull (it may have changed)
            try {
                const res = await fetch(`https://api.github.com/repos/${meta.repo}/contents/${meta.path}`, { headers: headers() });
                if (res.ok) {
                    const data = await res.json();
                    remoteSha = data.sha;
                }
            }
            catch { }
        }
        const bytes = exportBytes();
        const base64 = uint8ToBase64(bytes);
        const body = {
            message: `sync: ${new Date().toISOString()}`,
            content: base64,
        };
        if (remoteSha)
            body.sha = remoteSha;
        const res = await fetch(`https://api.github.com/repos/${meta.repo}/contents/${meta.path}`, {
            method: "PUT",
            headers: { ...headers(), "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            return { success: false, error: `GitHub API: ${res.status} ${err}` };
        }
        const result = await res.json();
        meta.lastSha = result.content.sha;
        meta.lastPushAt = new Date().toISOString();
        setMeta(meta);
        _dirty = false;
        return { success: true };
    }
    catch (e) {
        return { success: false, error: String(e) };
    }
}
export async function pull() {
    const meta = getMeta();
    if (!meta.repo || !currentToken)
        return { success: false, updated: false, error: "Not configured" };
    try {
        const metaRes = await fetch(`https://api.github.com/repos/${meta.repo}/contents/${meta.path}`, { headers: headers() });
        if (!metaRes.ok) {
            if (metaRes.status === 404)
                return { success: true, updated: false };
            return { success: false, updated: false, error: `GitHub API: ${metaRes.status}` };
        }
        const fileData = await metaRes.json();
        if (fileData.sha === meta.lastSha)
            return { success: true, updated: false };
        const rawRes = await fetch(fileData.download_url);
        if (!rawRes.ok)
            return { success: false, updated: false, error: "Failed to download" };
        const buffer = await rawRes.arrayBuffer();
        await importBytes(new Uint8Array(buffer));
        meta.lastSha = fileData.sha;
        meta.lastPullAt = new Date().toISOString();
        setMeta(meta);
        // Don't mark dirty from pull — the imported data came from remote,
        // so there's nothing new to push back.
        _dirty = false;
        return { success: true, updated: true };
    }
    catch (e) {
        return { success: false, updated: false, error: String(e) };
    }
}
let pushTimer = null;
const PUSH_DELAY_MS = 30000;
export function schedulePush() {
    if (pushTimer)
        clearTimeout(pushTimer);
    if (!getSyncStatus().configured)
        return;
    pushTimer = setTimeout(() => {
        push();
        pushTimer = null;
    }, PUSH_DELAY_MS);
}
export function setupAutoSync() {
    if (typeof document === "undefined")
        return;
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
            push();
        }
    });
}
function uint8ToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
