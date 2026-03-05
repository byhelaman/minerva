import { AssignmentRow } from "../../modals/assignment/assignment-columns";
import { Row } from "@tanstack/react-table";
import { InstructorSelector } from "../../modals/InstructorSelector";
import type { Instructor } from "@schedules/types";

interface InstructorCellProps {
    row: Row<AssignmentRow>;
    instructorsList: Instructor[];
    onInstructorChange?: (rowId: string, newInstructor: string, email: string, id: string) => void;
    onResetRow?: (rowId: string) => void;
}

export function InstructorCell({ row, instructorsList, onInstructorChange, onResetRow }: InstructorCellProps) {
    const instructor = row.getValue("instructor") as string;
    const hasPendingChange = row.original.status === "manual";
    const normalizedReason = String(row.original.reason || "").trim().toLowerCase();
    const isMeetingNotFound = row.original.status === "not_found" || normalizedReason === "meeting not found";

    const handleInstructorChange = (newInstructor: string, email: string, id: string) => {
        if (onInstructorChange) {
            onInstructorChange(row.original.id, newInstructor, email, id);
        }
    };

    return (
        <div className="w-fit">
            <InstructorSelector
                value={instructor}
                onChange={handleInstructorChange}
                onReset={hasPendingChange && onResetRow ? () => onResetRow(row.original.id) : undefined}
                instructors={instructorsList}
                disabled={isMeetingNotFound}
                className="w-45"
                popoverClassName="max-w-[220px]"
            />
        </div>
    );
}
