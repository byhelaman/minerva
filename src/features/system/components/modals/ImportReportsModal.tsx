import { useMemo } from "react";
import { ScheduleDataTable } from "@/features/schedules/components/table/ScheduleDataTable";
import { getDataSourceColumns } from "../data-source-columns";
import { Schedule } from "@/features/schedules/utils/excel-parser";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImportReportsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: Schedule[];
    onConfirm: () => void;
}

export function ImportReportsModal({ open, onOpenChange, data, onConfirm }: ImportReportsModalProps) {
    // Initial columns
    const columns = useMemo(() => getDataSourceColumns(), []);

    if (!data) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Preview Data</DialogTitle>
                    <DialogDescription>
                        Reviewing {data.length} records to import.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 pr-2 overflow-auto">
                    <ScheduleDataTable
                        columns={columns}
                        data={data}
                        hideActions
                        hideFilters
                        hideUpload
                        hideOverlaps
                        initialPageSize={100}
                        initialColumnVisibility={{
                            shift: false,
                            end_time: false,
                            code: false,
                            minutes: false,
                            units: false,
                            substitute: false,
                            type: false,
                            subtype: false,
                            description: false,
                            department: false,
                            feedback: false,
                        }}
                    />
                </div>

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-6 w-full">
                        <span className="text-sm text-muted-foreground mr-auto">
                            Total rows: <strong className="text-foreground font-medium">{data.length}</strong>
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button onClick={() => {
                                onConfirm();
                                onOpenChange(false);
                            }}>
                                Import Data
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
