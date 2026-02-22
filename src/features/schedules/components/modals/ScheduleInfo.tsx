import { FieldLabel } from "@/components/ui/field";
import { Schedule } from "../../types";
import { cn } from "@/lib/utils";

interface ScheduleInfoProps {
    schedule: Partial<Schedule> & {
        program: string;
        start_time: string;
        end_time: string;
        instructor: string;
    };
}

export function ScheduleInfo({ schedule, className }: ScheduleInfoProps & { className?: string }) {
    return (
        <div className={cn("space-y-1 border-b pb-4", className)}>
            <FieldLabel>Schedule Info</FieldLabel>
            <p className="text-sm font-medium">{schedule.program}</p>
            <div className="flex gap-2 text-sm text-muted-foreground">
                <span>{schedule.start_time} - {schedule.end_time}</span>
                <span className="text-border">|</span>
                <span>{schedule.instructor || 'No Instructor'}</span>
            </div>
        </div>
    );
}
