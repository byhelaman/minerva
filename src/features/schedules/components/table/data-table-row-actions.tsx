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
import type { Schedule } from "@schedules/types";
import { IncidenceModal } from "../modals/IncidenceModal";
import { QUICK_STATUS_PRESETS } from "@schedules/constants/incidence-presets";

interface DataTableRowActionsProps {
    row: Row<Schedule>;
    onDelete?: (schedule: Schedule) => void;
    enableHtmlCopy?: boolean;
}

export function DataTableRowActions({
    row,
    onDelete,
    enableHtmlCopy = false,
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
                            if (!enableHtmlCopy) {
                                // Default simple copy for other pages
                                const timeRange = `${schedule.start_time} - ${schedule.end_time}`;
                                navigator.clipboard.writeText(`${schedule.date}\n${schedule.program}\n${timeRange}`);
                                toast.success("Details copied", {
                                    description: `${schedule.program} - ${timeRange}`,
                                });
                                return;
                            }

                            // Full HTML Table copy for Reports page
                            const fields = [
                                { label: "Date", value: schedule.date },
                                { label: "Branch", value: schedule.branch },
                                { label: "Start Time", value: schedule.start_time },
                                { label: "End Time", value: schedule.end_time },
                                { label: "Instructor", value: schedule.instructor },
                                { label: "Program", value: schedule.program },
                                { label: "Status", value: schedule.status || "-" },
                                { label: "Substitute", value: schedule.substitute || "-" },
                                { label: "Type", value: schedule.type || "-" },
                                { label: "Subtype", value: schedule.subtype || "-" },
                                { label: "Description", value: schedule.description || "-" },
                                { label: "Department", value: schedule.department || "-" },
                            ];

                            // Create HTML Table
                            const html = `
                                <table style="border-collapse: collapse; width: 100%;">
                                    <tbody>
                                        <tr style="width: 100%;">
                                            ${fields.map(f => `<td style="border: 1px solid #e5e7eb; padding: 4px 8px; white-space: nowrap; font-size: 12px;">${f.value}</td>`).join("")}
                                        </tr>
                                    </tbody>
                                </table>
                            `;

                            // Create Plain Text fallback
                            const text = fields.map(f => `${f.label}: ${f.value}`).join("\n");

                            // Write to clipboard
                            const blobHtml = new Blob([html], { type: "text/html" });
                            const blobText = new Blob([text], { type: "text/plain" });

                            const data = [new ClipboardItem({
                                "text/html": blobHtml,
                                "text/plain": blobText
                            })];

                            navigator.clipboard.write(data).then(() => {
                                toast.success("Details copied to clipboard as table");
                            }).catch((err) => {
                                console.error(err);
                                toast.error("Failed to copy details");
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
