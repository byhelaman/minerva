import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import type { Schedule } from "../../types";
import { Button } from "@/components/ui/button";
import { ScheduleInfo } from "./ScheduleInfo";

interface ScheduleDetailsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: Schedule | null;
}

const DetailRow = ({ label, value }: { label: string; value: string | undefined }) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm">{value || "-"}</span>
    </div>
);

export function ScheduleDetailsModal({ open, onOpenChange, schedule }: ScheduleDetailsModalProps) {
    if (!schedule) return null;

    const hasIncidence = !!schedule.type;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md gap-5">
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
                        <DetailRow label="Incidence" value={schedule.type} />

                        {/* <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Incidence</span>
                                <Badge variant="outline" className="text-xs">{schedule.type}</Badge>
                            </div> */}
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
                <DialogFooter>
                    <Button variant={"secondary"} onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
