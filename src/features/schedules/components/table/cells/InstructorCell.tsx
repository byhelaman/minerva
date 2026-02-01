import { AssignmentRow } from "../assignment-columns";
import { Row } from "@tanstack/react-table";
import { InstructorSelector } from "../../modals/InstructorSelector";

interface InstructorCellProps {
    row: Row<AssignmentRow>;
    instructorsList: string[];
    onInstructorChange?: (rowId: string, newInstructor: string) => void;
}

export function InstructorCell({ row, instructorsList, onInstructorChange }: InstructorCellProps) {
    const isManualMode = row.original.manualMode === true;
    const instructor = row.getValue("instructor") as string;

    const handleInstructorChange = (newInstructor: string) => {
        if (onInstructorChange) {
            onInstructorChange(row.original.id, newInstructor);
        }
    };

    return (
        <div className="w-full max-w-[180px]">
            <InstructorSelector
                value={instructor}
                onChange={handleInstructorChange}
                instructors={instructorsList}
                disabled={!isManualMode}
                className="max-w-[200px]"
            />
        </div>
    );
}
