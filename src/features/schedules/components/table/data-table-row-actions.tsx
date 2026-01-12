import { type Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Schedule } from "@schedules/utils/excel-parser";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
    onEdit?: (schedule: Schedule) => void;
}

export function DataTableRowActions({
    row,
    onDelete,
    onEdit,
}: DataTableRowActionsProps) {
    const schedule = row.original;

    return (
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
            <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem onClick={() => onEdit?.(schedule)}>
                    Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        const timeRange = `${schedule.start_time} - ${schedule.end_time}`;
                        navigator.clipboard.writeText(`${schedule.date}\n${schedule.program}\n${timeRange}`);
                        toast.success("Schedule details copied");
                    }}
                >
                    Copy details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value="confirmed">
                            <DropdownMenuRadioItem value="confirmed">Confirmed</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="tentative">Tentative</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="cancelled">Cancelled</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(schedule)}>
                    Delete
                    <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
