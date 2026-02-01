import { useEffect, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { useScheduleUIStore } from "@/features/schedules/stores/useScheduleUIStore";
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateForDisplay, parseISODate } from "@/lib/utils";

interface PublishToDbModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PublishToDbModal({ open, onOpenChange }: PublishToDbModalProps) {
    const { publishDailyChanges, publishToSupabase, checkIfScheduleExists, publishCooldownUntil } = useScheduleSyncStore();
    const { activeDate } = useScheduleUIStore();
    const { baseSchedules } = useScheduleDataStore();

    const [isPublishing, setIsPublishing] = useState(false);
    const [isLoadingCheck, setIsLoadingCheck] = useState(false);
    const [needsOverwrite, setNeedsOverwrite] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);

    // Countdown Timer Effect
    useEffect(() => {
        if (!publishCooldownUntil) {
            setCooldownRemaining(0);
            return;
        }

        const checkTimer = () => {
            const now = Date.now();
            const left = Math.ceil((publishCooldownUntil - now) / 1000);
            setCooldownRemaining(left > 0 ? left : 0);
        };

        checkTimer(); // Initial check
        const interval = setInterval(checkTimer, 1000);
        return () => clearInterval(interval);
    }, [publishCooldownUntil]);

    // Verify if schedule exists on open
    useEffect(() => {
        if (open && activeDate) {
            setNeedsOverwrite(false); // Reset state on open
            setValidationError(null);

            // ... (rest of existing logic)
            // Validate date before checking DB
            const scheduleDate = parseISODate(activeDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (scheduleDate < today) {
                setValidationError('Only future schedules can be published');
                return;
            }

            const check = async () => {
                setIsLoadingCheck(true);
                try {
                    const exists = await checkIfScheduleExists(activeDate);
                    setNeedsOverwrite(exists);
                } catch (error) {
                    console.error("Failed to check schedule existence", error);
                } finally {
                    setIsLoadingCheck(false);
                }
            };
            check();
        } else {
            // Reset state when closed
            if (!open) {
                setIsPublishing(false);
            }
        }
    }, [open, activeDate, checkIfScheduleExists]);

    const performPublish = async (overwrite: boolean) => {
        if (cooldownRemaining > 0) return; // Prevent action if cooling down

        setIsPublishing(true);
        try {
            // 1. Publish to Excel (Both fresh and overwrite need to update Excel)
            // Note: If this fails, we stop.
            await publishDailyChanges();

            // 2. Publish to Supabase
            const result = await publishToSupabase(overwrite);

            // Safety check: if we thought it was fresh but it exists (race condition)
            if (!result.success && result.exists && !overwrite) {
                setNeedsOverwrite(true);
                // Don't close, let user decide to overwrite
                return;
            }

            if (result.success) {
                onOpenChange(false);
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (error) {
            console.error("Publish flow failed", error);
            toast.error("An unexpected error occurred during publish");
        } finally {
            setIsPublishing(false);
        }
    };

    const handlePublish = () => performPublish(false);
    const handleOverwrite = () => performPublish(true);

    return (
        <AlertDialog open={open} onOpenChange={(val) => !isPublishing && onOpenChange(val)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {isLoadingCheck ? "Checking..." : (validationError ? "Cannot Publish Schedule" : (needsOverwrite ? "Schedule Already Exists" : "Publish Schedule"))}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div>
                            {isLoadingCheck ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : validationError ? (
                                <span>
                                    The schedule for <strong>{formatDateForDisplay(activeDate!)}</strong> is not a future date.
                                    <br />
                                    {validationError}
                                </span>
                            ) : needsOverwrite ? (
                                <span>
                                    A schedule for <strong>{formatDateForDisplay(activeDate!)}</strong> has already been published.
                                    <br />
                                    If you proceed, it will replace the existing schedule for all users.
                                </span>
                            ) : (
                                <>
                                    Are you sure you want to publish the schedule for <strong>{formatDateForDisplay(activeDate!)}</strong>?
                                    <br /><br />
                                    This will:
                                    <ul className="list-disc pl-5 mt-2 space-y-1">
                                        <li>Update the Excel file in OneDrive</li>
                                        <li>Save the schedule to the database</li>
                                        <li>Notify all users of the update</li>
                                    </ul>
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Total Records: {baseSchedules.length}
                                    </p>
                                </>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    {validationError ? (
                        <AlertDialogAction onClick={() => onOpenChange(false)}>
                            Close
                        </AlertDialogAction>
                    ) : (
                        <>
                            <AlertDialogCancel disabled={isPublishing} onClick={() => onOpenChange(false)}>
                                Cancel
                            </AlertDialogCancel>
                            {needsOverwrite ? (
                                <AlertDialogAction onClick={handleOverwrite} disabled={isPublishing || cooldownRemaining > 0} className="border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive">
                                    {isPublishing ? <Loader2 className="animate-spin" /> : null}
                                    {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Replace"}
                                </AlertDialogAction>
                            ) : (
                                <AlertDialogAction onClick={handlePublish} disabled={isPublishing || isLoadingCheck || cooldownRemaining > 0}>
                                    {isPublishing ? <Loader2 className="animate-spin" /> : null}
                                    {isLoadingCheck ? "Checking..." : (cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Publish")}
                                </AlertDialogAction>
                            )}
                        </>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
