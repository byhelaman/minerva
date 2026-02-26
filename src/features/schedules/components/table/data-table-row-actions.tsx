import { useState } from "react";
import { type Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
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
import type { Schedule } from "@schedules/types";
import { IncidenceModal } from "../modals/IncidenceModal";
import { ScheduleDetailsModal } from "../modals/ScheduleDetailsModal";
import { QUICK_STATUS_PRESETS } from "@schedules/constants/incidence-presets";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
    hideIncidenceActions?: boolean;
}

export function DataTableRowActions({
    row,
    onDelete,
    hideIncidenceActions,
}: DataTableRowActionsProps) {
    const schedule = row.original;
    const { hasPermission } = useAuth();
    const canManage = hasPermission("schedules.manage");
    const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
    const [incidenceOpen, setIncidenceOpen] = useState(false);
    const [initialValues, setInitialValues] = useState<Record<string, string> | undefined>(undefined);

    const handleQuickStatus = (preset: typeof QUICK_STATUS_PRESETS[0]) => {
        const { label, ...values } = preset;
        setInitialValues(values);
        setIncidenceOpen(true);
    };

    const handleEditIncidence = () => {
        setInitialValues(undefined);
        setIncidenceOpen(true);
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
                    className="w-40"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem onClick={() => setViewDetailsOpen(true)}>
                        View Details
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
                        Copy Details
                    </DropdownMenuItem>
                    {canManage && !hideIncidenceActions && (
                        <>
                            <DropdownMenuItem onClick={handleEditIncidence}>
                                Edit Incidence
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>Quick Status</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-50">
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
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(schedule)}>
                        Delete
                        <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* View Details Modal (read-only) */}
            <ScheduleDetailsModal
                open={viewDetailsOpen}
                onOpenChange={setViewDetailsOpen}
                schedule={schedule}
            />

            {/* Incidence Modal (editable) */}
            <IncidenceModal
                open={incidenceOpen}
                onOpenChange={setIncidenceOpen}
                schedule={schedule}
                initialValues={initialValues}
            />
        </>
    );
}
