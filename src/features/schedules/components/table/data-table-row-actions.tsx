import { useState } from "react";
import { type Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Schedule } from "@schedules/types";
import { ScheduleDetailsModal } from "../modals/ScheduleDetailsModal";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
}

export function DataTableRowActions({
    row,
    onDelete,
}: DataTableRowActionsProps) {
    const schedule = row.original;
    const [viewDetailsOpen, setViewDetailsOpen] = useState(false);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="data-[state=open]:bg-muted size-8 text-foreground"
                    >
                        <MoreHorizontal />
                        <span className="sr-only">Open menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-30"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem onClick={() => setViewDetailsOpen(true)}>
                        View details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            const timeRange = `${schedule.start_time} - ${schedule.end_time}`;
                            navigator.clipboard.writeText(`${schedule.date}\n${schedule.program}\n${timeRange}`);
                            toast.success("Details copied", {
                                description: `${schedule.program}\n${timeRange}`,
                            });
                        }}
                    >
                        Copy details
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(schedule)}>
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ScheduleDetailsModal
                open={viewDetailsOpen}
                onOpenChange={setViewDetailsOpen}
                schedule={schedule}
            />
        </>
    );
}
