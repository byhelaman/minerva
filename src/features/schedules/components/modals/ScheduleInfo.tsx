import { Label } from "@/components/ui/label";
import { Schedule } from "../../types";

interface ScheduleInfoProps {
    schedule: Partial<Schedule> & {
        program: string;
        start_time: string;
        end_time: string;
        instructor: string;
    };
}

export function ScheduleInfo({ schedule }: ScheduleInfoProps) {
    return (
        <div className="space-y-1 border-y py-4">
            <Label className="text-xs">Schedule Info</Label>
            <p className="font-medium text-sm">{schedule.program}</p>
            <div className="flex text-sm text-muted-foreground gap-2">
                <span> {schedule.start_time} - {schedule.end_time}</span>
                <span className="text-border">|</span>
                <span>{schedule.instructor || 'No Instructor'}</span>
            </div>
        </div>
    );
}
