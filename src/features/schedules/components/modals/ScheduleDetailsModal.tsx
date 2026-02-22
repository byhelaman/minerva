import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { Schedule } from "../../types";
import { ScheduleInfo } from "./ScheduleInfo";

interface ScheduleDetailsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: Schedule | null;
}

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "-"}</p>
    </div>
);

export function ScheduleDetailsModal({ open, onOpenChange, schedule }: ScheduleDetailsModalProps) {
    if (!schedule) return null;

    const hasIncidence = !!schedule.type;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md gap-6">
                <DialogHeader>
                    <DialogTitle>Schedule Details</DialogTitle>
                    <DialogDescription>View details for this class.</DialogDescription>
                </DialogHeader>

                <ScheduleInfo schedule={schedule} />

                {/* Base Schedule Info */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <DetailRow label="Date" value={schedule.date} />
                    <DetailRow label="Branch" value={schedule.branch} />
                    <DetailRow label="Start Time" value={schedule.start_time} />
                    <DetailRow label="End Time" value={schedule.end_time} />
                    <DetailRow label="Instructor" value={schedule.instructor} />
                    <DetailRow label="Code" value={schedule.code} />
                    <DetailRow label="Shift" value={schedule.shift} />
                    <DetailRow label="Minutes" value={schedule.minutes} />
                </div>

                {/* Incidence Section */}
                {hasIncidence && (
                    <>
                        <Separator />
                        <DetailRow label="Incidence" value={schedule.type} />
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            <DetailRow label="Status" value={schedule.status} />
                            <DetailRow label="Subtype" value={schedule.subtype} />
                            <DetailRow label="Substitute" value={schedule.substitute} />
                            <DetailRow label="Department" value={schedule.department} />
                        </div>
                        {schedule.description && (
                            <DetailRow label="Description" value={schedule.description} />
                        )}
                    </>
                )}

                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    );
}
