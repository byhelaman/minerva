import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { Schedule } from "@schedules/types";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { formatDateForDisplay } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useScheduleDataStore } from "@/features/schedules/stores/useScheduleDataStore";

export const getScheduleColumns = (
    onDelete?: (s: Schedule) => void,
    canManage: boolean = false,
): ColumnDef<Schedule>[] => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-8">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-[2px]"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-[2px] mb-1"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "date",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" className="justify-center" />
            ),
            cell: ({ row }) => <div className="w-[80px] mx-auto">{formatDateForDisplay(row.getValue("date"))}</div>,
        },
        {
            accessorKey: "shift",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Shift" />
            ),
            cell: ({ row }) => <div className="w-[100px]">{row.getValue("shift")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "branch",
            size: 140,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Branch" />
            ),
            cell: ({ row }) => <div>{row.getValue("branch")}</div>,
            // Filtro con coincidencia parcial:
            // - "CORPORATE" coincide con "CORPORATE" y "CORPORATE/KIDS"
            // - "KIDS" coincide con cualquier branch que contenga "KIDS"
            filterFn: (row, id, filterValues: string[]) => {
                const cellValue = row.getValue(id) as string;
                return filterValues.some((filter) => cellValue.includes(filter));
            },
        },
        {
            accessorKey: "start_time",
            size: 130,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Time" className="justify-center" />
            ),
            cell: ({ row }) => (
                <div className="mx-auto text-center">
                    {row.getValue("start_time")} - {row.original.end_time}
                </div>
            ),
            // Filtro por hora: extrae la hora del tiempo (ej: "08" de "08:30")
            filterFn: (row, id, filterValues: string[]) => {
                const cellValue = row.getValue(id) as string;
                const hour = cellValue?.substring(0, 2); // Extrae "HH" de "HH:MM"
                return filterValues.includes(hour);
            },
        },
        {
            accessorKey: "instructor",
            size: 200,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Instructor" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-40">{row.getValue("instructor")}</div>
            ),
        },
        {
            accessorKey: "program",
            size: 400,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    {row.original.type && (
                        <Badge variant="outline" className="border-orange-500/50 text-orange-600 bg-orange-500/10 dark:text-orange-400 hover:bg-orange-500/20">
                            <AlertCircle />
                            {row.original.type}
                        </Badge>
                    )}
                    <span className="truncate max-w-100">{row.getValue("program")}</span>
                </div>
            ),
        },
        {
            accessorKey: "minutes",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Mins" className="justify-center" />
            ),
            cell: ({ row }) => <div className="w-12.5 mx-auto text-center">{row.getValue("minutes")}</div>,
        },
        {
            accessorKey: "units",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Units" className="justify-center" />
            ),
            cell: ({ row }) => <div className="w-12.5 mx-auto text-center">{row.getValue("units")}</div>,
        },
        {
            id: "status",
            size: 70,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" className="justify-center" />
            ),
            cell: ({ row }) => {
                const schedule = row.original;
                const isYes = schedule.status === "Yes";

                const handleToggle = async (checked: boolean) => {
                    const { updateIncidence } = useScheduleDataStore.getState();
                    try {
                        await updateIncidence({
                            ...schedule,
                            status: checked ? "Yes" : "No",
                        });
                    } catch (error: unknown) {
                        const msg = error instanceof Error ? error.message : "";
                        if (msg === "SCHEDULE_NOT_PUBLISHED") {
                            toast.error("Schedule not in database", { description: "Publish the schedule first to mark class status" });
                        } else {
                            toast.error("Failed to update status");
                        }
                    }
                };

                return (
                    <div className="flex justify-center">
                        <Switch
                            checked={isYes}
                            onCheckedChange={handleToggle}
                            disabled={!canManage}
                            className="h-5 w-9 [&_span[data-slot=switch-thumb]]:size-4 [&_span[data-slot=switch-thumb]]:data-[state=checked]:translate-x-4"
                        />
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: true,
        },
        {
            id: "actions",
            cell: ({ row }) => <DataTableRowActions row={row} onDelete={onDelete} />,
        },
    ];
