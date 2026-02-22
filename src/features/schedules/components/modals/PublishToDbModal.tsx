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
        setIsLoadingCheck(true);
        setValidationError(null);

        try {
            // 1. Validate: no date selected (happens when multiple dates are loaded)
            if (!activeDate) {
                const uniqueDates = new Set(baseSchedules.map(s => s.date));
                if (uniqueDates.size > 1) {
                    setValidationError(
                        `Cannot publish: the loaded schedules contain ${uniqueDates.size} different dates. Clear the schedule and load only one date at a time.`
                    );
                } else {
                    setValidationError("No date selected.");
                }
                return;
            }

            // 2. Validate: schedules must not contain multiple dates
            const uniqueDates = new Set(baseSchedules.map(s => s.date));
            if (uniqueDates.size > 1) {
                setValidationError(
                    `Cannot publish: the loaded schedules contain ${uniqueDates.size} different dates. Clear the schedule and load only one date at a time.`
                );
                return;
            }

            // 3. Validate Date (must be today or future)
            const dateObj = parseISODate(activeDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dateObj < today) {
                setValidationError("Cannot publish schedules for past dates.");
                return;
            }

            // 4. Validate Content
            if (baseSchedules.length === 0) {
                setValidationError("There are no schedule entries to publish.");
                return;
            }

            // 5. Check Existence
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
        } else if (result.error) {
            setValidationError(result.error);
        }
    };

    const handleOverwrite = async () => {
        const result = await publishToSupabase(true);
        if (result.success) {
            onOpenChange(false);
        } else if (result.error) {
            setValidationError(result.error);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={(val) => !isPublishing && onOpenChange(val)}>
            <AlertDialogContent className="sm:max-w-100!">
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
                                    A schedule for <strong>{formatDateForDisplay(activeDate!)}</strong> has already been published. If you proceed, it will replace the existing schedule for all users.
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
                                >
                                    {isPublishing ? <Loader2 className="animate-spin" /> : null}
                                    Continue
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
