import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { scheduleEntriesService } from "@/features/schedules/services/schedule-entries-service";

interface ImportReportsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: Schedule[];
    onConfirm: () => void;
}

export function ImportReportsModal({ open, onOpenChange, data, onConfirm }: ImportReportsModalProps) {
    // Initial columns
    const columns = useMemo(() => getDataSourceColumns(), []);
    const [isSaving, setIsSaving] = useState(false);

    // Filter out columns that are not relevant for preview/import
    const initialVisibility = {
        shift: false,
        branch: false,
        start_time: false,
        end_time: false,
        code: false,
        minutes: false,
        units: false,
        status: false,
        substitute: false,
        // subtype: false,
        description: false,
        department: false,
        feedback: false,
    };

    const handleSave = async () => {
        setIsSaving(true);
        const toastId = toast.loading("Saving data...");
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // Persist to Supabase (importSchedules includes incidence fields)
            await scheduleEntriesService.importSchedules(data, user.id);

            toast.success("Data imported successfully", { id: toastId });
            onConfirm(); // Trigger parent refresh
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
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Preview Data</DialogTitle>
                    <DialogDescription>
                        Reviewing {data.length} records to import.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-2">
                    <ScheduleDataTable
                        columns={columns}
                        data={data}
                        filterConfig={{
                            showStatus: false,
                            showIncidenceType: true,
                            showBranch: false,
                            showTime: false,
                        }}
                        hideActions
                        hideUpload
                        hideOverlaps
                        initialPageSize={100}
                        initialColumnVisibility={initialVisibility}
                    />
                </div>

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-6 w-full">
                        <span className="text-sm text-muted-foreground mr-auto">
                            Total rows: <strong className="text-foreground font-medium">{data.length}</strong>
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save Data"
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
