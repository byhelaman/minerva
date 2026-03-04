import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Schedule } from "@schedules/types";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { formatDateForDisplay } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const getScheduleColumns = (
    onDelete?: (s: Schedule) => void,
): ColumnDef<Schedule>[] => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-9">
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
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" className="justify-center" />
            ),
            cell: ({ row }) => <div className="text-center">{formatDateForDisplay(row.getValue("date"))}</div>,
        },
        {
            accessorKey: "shift",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Shift" />
            ),
            cell: ({ row }) => <div className="w-25">{row.getValue("shift")}</div>,
            filterFn: (row, id, value) => {
                return value.includes(row.getValue(id));
            },
        },
        {
            accessorKey: "branch",
            size: 100,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Branch" />
            ),
            cell: ({ row }) => <div>{row.getValue("branch")}</div>,
            filterFn: (row, id, filterValues: string[]) => {
                const cellValue = row.getValue(id) as string;
                return filterValues.some((filter) => cellValue.includes(filter));
            },
        },
        {
            accessorKey: "start_time",
            size: 130,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Interval" className="justify-center" />
            ),
            cell: ({ row }) => (
                <div className="text-center">
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
            accessorKey: "code",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Code" />
            ),
            cell: ({ row }) => (
                <div>{row.getValue("code")}</div>
            ),
        },
        {
            accessorKey: "instructor",
            size: 200,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Instructor" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-45">{row.getValue("instructor")}</div>
            ),
        },
        {
            accessorKey: "program",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row, table }) => {
                const issueTooltip = (table.options.meta as { getRowIssueTooltip?: (row: Schedule) => string | undefined })?.getRowIssueTooltip?.(row.original);
                return (
                    <div className="flex items-center gap-2">
                        {issueTooltip && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Badge variant="outline" className="cursor-pointer">
                                        <Info />
                                        Issue
                                    </Badge>
                                </PopoverTrigger>
                                <PopoverContent side="bottom" align="start" className="text-xs w-60">
                                    {issueTooltip}
                                </PopoverContent>
                            </Popover>
                        )}
                        <span title={row.getValue("program")}>{row.getValue("program")}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: "minutes",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Mins" className="justify-center" />
            ),
            cell: ({ row }) => <div className="w-12 mx-auto text-center">{row.getValue("minutes")}</div>,
        },
        {
            accessorKey: "units",
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Units" className="justify-center" />
            ),
            cell: ({ row }) => <div className="w-12 mx-auto text-center">{row.getValue("units")}</div>,
        },
        {
            id: "actions",
            cell: ({ row }) => <DataTableRowActions row={row} onDelete={onDelete} />,
        },
    ];
