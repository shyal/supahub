export declare function markDirty(): void;
export declare function isDirty(): boolean;
export interface GitHubSyncOptions {
    /** GitHub PAT for API access. */
    token: string;
    /** Repository in "owner/repo" format. */
    repo: string;
    /** File path in repo. Default: "supahub.sqlite" */
    path?: string;
}
export declare function configure(opts: GitHubSyncOptions): void;
export declare function getSyncStatus(): {
    configured: boolean;
    repo: string;
    path: string;
    lastPushAt: string | null;
    lastPullAt: string | null;
};
export declare function push(): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function pull(): Promise<{
    success: boolean;
    updated: boolean;
    error?: string;
}>;
export declare function schedulePush(): void;
export declare function setupAutoSync(): void;
