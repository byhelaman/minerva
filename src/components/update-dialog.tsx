import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useUpdaterContext } from '@/components/updater-context';

import { useEffect, useState } from 'react';

export function UpdateDialog() {
    const {
        checkForUpdates,
        downloadAndInstall,
        closeUpdateDialog,
        update,
        isChecking,
        isDownloading,
        progress,
        error,
    } = useUpdaterContext();

    const [lastKnownUpdate, setLastKnownUpdate] = useState<typeof update>(null);

    // Check for updates on mount
    useEffect(() => {
        checkForUpdates();
    }, [checkForUpdates]);

    // Persist the update data to show it during the closing animation
    useEffect(() => {
        if (update) {
            setLastKnownUpdate(update);
        }
    }, [update]);

    const displayUpdate = update || lastKnownUpdate;
    if (!displayUpdate) return null;

    const progressPercent = progress?.total
        ? Math.round((progress.downloaded / progress.total) * 100)
        : 0;

    return (
        <AlertDialog open={!!update}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        New version available: {displayUpdate.version}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {displayUpdate.body || 'A new version is available. Do you want to update now?'}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {isDownloading && (
                    <div className="py-4">
                        <Progress value={progressPercent} />
                        <p className="text-sm text-muted-foreground mt-2 text-center">
                            Downloading... {progressPercent}%
                        </p>
                    </div>
                )}

                {error && (
                    <p className="text-sm text-destructive">{error}</p>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel
                        disabled={isDownloading}
                        onClick={closeUpdateDialog}
                    >
                        Later
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={downloadAndInstall}
                        disabled={isDownloading || isChecking}
                    >
                        {isDownloading ? 'Installing...' : 'Update now'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
