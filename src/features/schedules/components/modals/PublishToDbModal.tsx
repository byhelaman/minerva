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
import { formatDateForDisplay, parseISODate } from "@/lib/date-utils";

interface PublishToDbModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PublishToDbModal({ open, onOpenChange }: PublishToDbModalProps) {
    const { publishToSupabase, isPublishing, checkIfScheduleExists } = useScheduleSyncStore();
    const { activeDate } = useScheduleUIStore();
    const { baseSchedules } = useScheduleDataStore();

    const [isLoadingCheck, setIsLoadingCheck] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [needsOverwrite, setNeedsOverwrite] = useState(false);

    useEffect(() => {
        if (open && activeDate) {
            // Reset state on open to prevent flash of stale state
            setNeedsOverwrite(false);
            setValidationError(null);

            checkStatus();
        }
        // Removed cleanup on close to prevent UI flash during exit animation
    }, [open, activeDate]);

    const checkStatus = async () => {
        if (!activeDate) return;

        setIsLoadingCheck(true);
        setValidationError(null);

        try {
            // 1. Validate Date (ensure not empty)
            if (!activeDate) {
                setValidationError("No date selected.");
                return;
            }

            // 2. Validate Date (must be today or future)
            const dateObj = parseISODate(activeDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dateObj < today) {
                setValidationError("Cannot publish schedules for past dates.");
                return;
            }

            // 3. Validate Content
            if (baseSchedules.length === 0) {
                setValidationError("There are no schedule entries to publish.");
                return;
            }

            // 3. Check Existence
            const exists = await checkIfScheduleExists(activeDate);
            setNeedsOverwrite(exists);

        } catch (error) {
            console.error("Check failed", error);
        } finally {
            setIsLoadingCheck(false);
        }
    };

    const handlePublish = async () => {
        const result = await publishToSupabase(false);
        if (result.success) {
            onOpenChange(false);
        } else if (result.exists) {
            setNeedsOverwrite(true);
        }
    };

    const handleOverwrite = async () => {
        const result = await publishToSupabase(true);
        if (result.success) {
            onOpenChange(false);
        }
    };

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
                                    Issue with schedule for <strong>{formatDateForDisplay(activeDate!)}</strong>:
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
                                    This action will:
                                    <ul className="list-disc pl-5 mt-2 space-y-1">
                                        <li>Save {baseSchedules.length} entries to the database</li>
                                        <li>Notify all users of the update</li>
                                    </ul>
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
                                <AlertDialogAction
                                    onClick={handleOverwrite}
                                    disabled={isPublishing}
                                    className="border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                                >
                                    {isPublishing ? <Loader2 className="animate-spin" /> : null}
                                    Replace
                                </AlertDialogAction>
                            ) : (
                                <AlertDialogAction onClick={handlePublish} disabled={isPublishing || isLoadingCheck}>
                                    {isPublishing ? <Loader2 className="animate-spin" /> : null}
                                    {isLoadingCheck ? "Checking..." : "Publish"}
                                </AlertDialogAction>
                            )}
                        </>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
