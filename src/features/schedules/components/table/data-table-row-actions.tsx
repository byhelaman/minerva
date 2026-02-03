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
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Schedule } from "@schedules/utils/excel-parser";
import { IncidenceModal } from "../modals/IncidenceModal";
import { QUICK_STATUS_PRESETS } from "@schedules/constants/incidence-presets";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
}

export function DataTableRowActions({
    row,
    onDelete,
}: DataTableRowActionsProps) {
    const schedule = row.original;
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [initialValues, setInitialValues] = useState<Record<string, string> | undefined>(undefined);

    const handleQuickStatus = (preset: typeof QUICK_STATUS_PRESETS[0]) => {
        // Convert preset to initialValues format (exclude label)
        const { label, ...values } = preset;
        setInitialValues(values);
        setDetailsOpen(true);
    };

    const handleViewDetails = () => {
        setInitialValues(undefined); // Clear initial values
        setDetailsOpen(true);
    };

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
                    className="w-[160px]"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem onClick={handleViewDetails}>
                        View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            const timeRange = `${schedule.start_time} - ${schedule.end_time}`;
                            navigator.clipboard.writeText(`${schedule.date}\n${schedule.program}\n${timeRange}`);
                            toast.success("Details copied", {
                                description: `${schedule.program} - ${timeRange}`,
                            });
                        }}
                    >
                        Copy Details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Quick Status</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-[200px]">
                            {QUICK_STATUS_PRESETS.map((preset) => (
                                <DropdownMenuItem
                                    key={preset.label}
                                    onClick={() => handleQuickStatus(preset)}
                                >
                                    {preset.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(schedule)}>
                        Delete
                        <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Incidence Modal */}
            <IncidenceModal
                open={detailsOpen}
                onOpenChange={setDetailsOpen}
                schedule={schedule}
                initialValues={initialValues}
            />
        </>
    );
}
