import { useState, useCallback, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateProgress {
    downloaded: number;
    total: number | null;
}

interface UseUpdaterReturn {
    checkForUpdates: () => Promise<Update | null>;
    downloadAndInstall: () => Promise<void>;
    closeUpdateDialog: () => void;
    update: Update | null;
    isChecking: boolean;
    isDownloading: boolean;
    progress: UpdateProgress | null;
    error: string | null;
}

export function useUpdater(): UseUpdaterReturn {
    const [update, setUpdate] = useState<Update | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkForUpdates = useCallback(async (): Promise<Update | null> => {
        setIsChecking(true);
        setError(null);
        try {
            const result = await check();
            setUpdate(result);
            return result;
        } catch (err) {
            console.error('Error checking for updates:', err);
            const msg = err instanceof Error ? err.message : 'Error checking for updates';
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsChecking(false);
        }
    }, []);

    // Polling periodic check every 4 hours
    useEffect(() => {
        const POLL_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

        const intervalId = setInterval(() => {
            // Only check if we are not already checking
            checkForUpdates();
        }, POLL_INTERVAL);

        return () => clearInterval(intervalId);
    }, [checkForUpdates]);

    const downloadAndInstall = useCallback(async () => {
        if (!update) return;

        setIsDownloading(true);
        setProgress({ downloaded: 0, total: null });
        setError(null);

        try {
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        setProgress({ downloaded: 0, total: event.data.contentLength ?? null });
                        break;
                    case 'Progress':
                        setProgress((prev) => ({
                            downloaded: (prev?.downloaded ?? 0) + event.data.chunkLength,
                            total: prev?.total ?? null,
                        }));
                        break;
                    case 'Finished':
                        break;
                }
            });

            await relaunch();
        } catch (err) {
            console.error('Error installing update:', err);
            setError(err instanceof Error ? err.message : 'Error installing update');
            setIsDownloading(false);
        }
    }, [update]);

    const closeUpdateDialog = useCallback(() => {
        setUpdate(null);
    }, []);

    return {
        checkForUpdates,
        downloadAndInstall,
        closeUpdateDialog,
        update,
        isChecking,
        isDownloading,
        progress,
        error,
    };
}
