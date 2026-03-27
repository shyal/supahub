import { exportBytes, importBytes, save } from "./db.js";
const SYNC_META_KEY = "supahub-sync-meta";
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
export async function push() {
    const meta = getMeta();
    if (!meta.repo || !currentToken)
        return { success: false, error: "Not configured" };
    try {
        await save();
        const bytes = exportBytes();
        const base64 = uint8ToBase64(bytes);
        let sha;
        try {
            const res = await fetch(`https://api.github.com/repos/${meta.repo}/contents/${meta.path}`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                sha = data.sha;
            }
        }
        catch { }
        const body = {
            message: `sync: ${new Date().toISOString()}`,
            content: base64,
        };
        if (sha)
            body.sha = sha;
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
