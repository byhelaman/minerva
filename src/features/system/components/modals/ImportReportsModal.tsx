import { useEffect, useMemo, useState } from "react";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "../data-source-columns";
import type { Schedule } from "@/features/schedules/types";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Plus, Equal, FilePenLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";
import { getScheduleKey } from "@/features/schedules/utils/overlap-utils";
import { getSchedulePrimaryKey } from "@/features/schedules/utils/string-utils";
import { validateAgainstDb, buildIssueRowKeys, type DbValidationResult } from "@/features/schedules/utils/db-validation-utils";
import { ISSUE_STYLE_GREEN, ISSUE_STYLE_AMBER, ISSUE_STYLE_BLUE, ROW_STYLE_NEW, ROW_STYLE_MODIFIED, ROW_STYLE_DUPLICATE } from "@/features/schedules/utils/issue-styles";

interface ImportReportsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: Schedule[];
    onConfirm: () => void;
}



export function ImportReportsModal({ open, onOpenChange, data, onConfirm }: ImportReportsModalProps) {
    const handleDeleteRow = (schedule: Schedule) => {
        const pk = getSchedulePrimaryKey(schedule);
        setWorkingData(prev => prev.filter(s => getSchedulePrimaryKey(s) !== pk));
    };

    const columns = useMemo(() => getDataSourceColumns(handleDeleteRow), []);
    const [isSaving, setIsSaving] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Working copy of data that the user can modify (remove rows)
    const [workingData, setWorkingData] = useState<Schedule[]>([]);

    // DB validation state
    const [dbValidation, setDbValidation] = useState<DbValidationResult>({
        newCount: 0, existingKeys: new Set(), modifiedKeys: new Set(), identicalKeys: new Set(), modifiedReasons: new Map(),
    });

    const runDbValidation = async (rows: Schedule[]) => {
        if (rows.length === 0) {
            setValidationError(null);
            setDbValidation({
                newCount: 0,
                existingKeys: new Set(),
                modifiedKeys: new Set(),
                identicalKeys: new Set(),
                modifiedReasons: new Map(),
            });
            return;
        }

        setIsValidating(true);
        setValidationError(null);
        try {
            const result = await validateAgainstDb(rows);
            setDbValidation(result);
        } catch (error) {
            console.error('DB validation failed:', error);
            setValidationError('No se pudo validar contra la base de datos. Reintenta antes de guardar.');
        } finally {
            setIsValidating(false);
        }
    };

    // Reset working data when modal opens with new data
    useEffect(() => {
        if (!open) return;

        if (data?.length > 0) {
            setWorkingData([...data]);
        } else {
            setWorkingData([]);
            setValidationError(null);
            setDbValidation({
                newCount: 0,
                existingKeys: new Set(),
                modifiedKeys: new Set(),
                identicalKeys: new Set(),
                modifiedReasons: new Map(),
            });
        }
    }, [open, data]);

    // Re-validate whenever the editable data changes while modal is open
    useEffect(() => {
        if (!open) return;
        void runDbValidation(workingData);
    }, [open, workingData]);

    const initialVisibility = {
        shift: false,
        branch: false,
        end_time: false,
        // instructor: false,
        code: false,
        minutes: false,
        units: false,
        status: false,
        substitute: false,
        description: false,
        department: false,
        feedback: false,
    };

    // Detect intra-file duplicates (same composite key appears more than once)
    const { duplicateKeys, duplicateCount } = useMemo(() => {
        const keyCounts = new Map<string, number>();
        const keyToScheduleKeys = new Map<string, Set<string>>();

        for (const s of workingData) {
            const nk = getSchedulePrimaryKey(s);
            keyCounts.set(nk, (keyCounts.get(nk) || 0) + 1);

            // Map the normalized key to all schedule keys (for row highlighting)
            if (!keyToScheduleKeys.has(nk)) keyToScheduleKeys.set(nk, new Set());
            keyToScheduleKeys.get(nk)!.add(getScheduleKey(s));
        }

        const duplicateScheduleKeys = new Set<string>();
        let count = 0;

        for (const [nk, c] of keyCounts) {
            if (c > 1) {
                count += c;
                const scheduleKeys = keyToScheduleKeys.get(nk);
                if (scheduleKeys) {
                    for (const sk of scheduleKeys) {
                        duplicateScheduleKeys.add(sk);
                    }
                }
            }
        }

        return { duplicateKeys: duplicateScheduleKeys, duplicateCount: count };
    }, [workingData]);

    // Build issue categories and row keys for the unified IssueFilter

    const externalIssueCategories = useMemo(() => {
        const cats: { key: string; label: string; count: number; icon?: React.ComponentType<{ className?: string }>; activeClassName?: string }[] = [];
        if (duplicateCount > 0) cats.push({ key: 'duplicates', label: 'Duplicados', count: duplicateCount });
        if (dbValidation.newCount > 0) cats.push({ key: 'new', label: 'New', count: dbValidation.newCount, icon: Plus, activeClassName: ISSUE_STYLE_GREEN });
        if (dbValidation.modifiedKeys.size > 0) cats.push({ key: 'modified', label: 'Modified', count: dbValidation.modifiedKeys.size, icon: FilePenLine, activeClassName: ISSUE_STYLE_AMBER });
        if (dbValidation.identicalKeys.size > 0) cats.push({ key: 'identical', label: 'Identical', count: dbValidation.identicalKeys.size, icon: Equal, activeClassName: ISSUE_STYLE_BLUE });
        return cats;
    }, [duplicateCount, dbValidation]);

    const issueRowKeys = useMemo((): Record<string, Set<string>> => {
        return buildIssueRowKeys(workingData, dbValidation, duplicateKeys, duplicateCount);
    }, [duplicateCount, duplicateKeys, workingData, dbValidation]);



    const handleSave = async () => {
        if (workingData.length === 0) {
            toast.warning("No data to save");
            return;
        }

        if (validationError) {
            toast.error("DB validation failed. Fix validation before saving.");
            return;
        }

        setIsSaving(true);
        const toastId = toast.loading("Saving data...");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const result = await scheduleEntriesService.importSchedules(workingData, user.id);

            const parts: string[] = [];
            if (result.upsertedCount > 0) parts.push(`${result.upsertedCount} saved`);
            if (result.duplicatesSkipped > 0) parts.push(`${result.duplicatesSkipped} duplicates skipped`);

            toast.success(parts.join(", ") || "Data imported", { id: toastId });
            onConfirm();
            onOpenChange(false);
        } catch (error) {
            console.error("Import failed:", error);
            toast.error("Failed to save data", { id: toastId });
        } finally {
            setIsSaving(false);
        }
    };

    if (!data) return null;

    return (
        <Dialog open={open} onOpenChange={(val) => !isSaving && onOpenChange(val)}>
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>Preview Data</DialogTitle>
                    <DialogDescription>
                        Reviewing {workingData.length} records to import.
                    </DialogDescription>
                </DialogHeader>

                {validationError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {validationError}
                    </div>
                )}

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                    <ScheduleDataTable
                        columns={columns}
                        data={workingData}
                        filterConfig={{
                            showStatus: false,
                            showBranch: false,
                            showTime: false,
                        }}
                        hideActions
                        hideUpload
                        hideOverlaps
                        getRowClassName={(row) => {
                            const key = getScheduleKey(row);
                            if (duplicateKeys.has(key)) return ROW_STYLE_DUPLICATE;
                            const pk = getSchedulePrimaryKey(row as Schedule);
                            if (dbValidation.modifiedKeys.has(pk)) return ROW_STYLE_MODIFIED;
                            if (dbValidation.identicalKeys.has(pk)) return undefined;
                            if (!dbValidation.existingKeys.has(pk) && !isValidating) return ROW_STYLE_NEW;
                            return undefined;
                        }}
                        getRowIssueTooltip={(row) => {
                            const key = getScheduleKey(row);
                            if (duplicateKeys.has(key)) {
                                const pk = getSchedulePrimaryKey(row as Schedule);
                                return `Duplicado: misma clave (${pk})`;
                            }
                            const pk = getSchedulePrimaryKey(row as Schedule);
                            if (dbValidation.modifiedKeys.has(pk)) return { type: 'mod', message: dbValidation.modifiedReasons.get(pk) || '' };
                            if (!dbValidation.existingKeys.has(pk) && !isValidating && dbValidation.existingKeys.size > 0) return 'New: registro no existe en la base de datos';
                            return undefined;
                        }}
                        initialPageSize={100}
                        initialColumnVisibility={initialVisibility}
                        externalIssueCategories={externalIssueCategories}
                        issueRowKeys={issueRowKeys}
                        hideBulkCopy
                        onBulkDelete={(rows) => {
                            const toRemove = new Set(rows);
                            setWorkingData(prev => prev.filter(s => !toRemove.has(s)));
                            toast.success(`${rows.length} row(s) removed`);
                        }}
                    />
                </div>

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-6 w-full">
                        <div className="flex items-center gap-3 mr-auto text-sm text-muted-foreground">
                            {isValidating ? (
                                <span className="text-muted-foreground">Processing...</span>
                            ) : (
                                <>
                                    {(dbValidation.newCount > 0 || dbValidation.existingKeys.size > 0) ? (
                                        <>
                                            <span>New: <strong className="text-foreground font-medium">{dbValidation.newCount}</strong></span>
                                            <span className="text-border">|</span>
                                            <span>Modified: <strong className="text-foreground font-medium">{dbValidation.modifiedKeys.size}</strong></span>
                                            <span className="text-border">|</span>
                                            <span>Identical: <strong className="text-foreground font-medium">{dbValidation.identicalKeys.size}</strong></span>
                                        </>
                                    ) : (
                                        <span>Total rows: <strong className="text-foreground font-medium">{workingData.length}</strong></span>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button disabled={isSaving || isValidating || !!validationError || workingData.length === 0 || duplicateCount > 0}>

                                        {isSaving ? (
                                            <>
                                                <Loader2 className="animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save Data"
                                        )}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="sm:max-w-100!">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Confirm import</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            You are about to import {workingData.length} records to the database.
                                            {dbValidation.modifiedKeys.size > 0 ? ` This will overwrite existing records with modifications.` : ""}
                                            {` Summary: ${dbValidation.newCount} new, ${dbValidation.modifiedKeys.size} modified, ${dbValidation.identicalKeys.size} identical, ${duplicateCount} duplicates in file.`}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleSave}>Confirm</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
