import { AssignmentRow } from "../../modals/assignment/assignment-columns";
import { Row } from "@tanstack/react-table";
import { InstructorSelector } from "../../modals/InstructorSelector";
import type { Instructor } from "../../../hooks/useInstructors";

interface InstructorCellProps {
    row: Row<AssignmentRow>;
    instructorsList: Instructor[];
    onInstructorChange?: (rowId: string, newInstructor: string, email: string, id: string) => void;
}

export function InstructorCell({ row, instructorsList, onInstructorChange }: InstructorCellProps) {
    const isManualMode = row.original.manualMode === true;
    const instructor = row.getValue("instructor") as string;

    const handleInstructorChange = (newInstructor: string, email: string, id: string) => {
        if (onInstructorChange) {
            onInstructorChange(row.original.id, newInstructor, email, id);
        }
    };

    return (
        <div className="w-full max-w-[180px]">
            <InstructorSelector
                value={instructor}
                onChange={handleInstructorChange}
                instructors={instructorsList}
                disabled={!isManualMode}
                popoverClassName="max-w-[220px]"
            />
        </div>
    );
}
