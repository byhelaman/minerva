import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Schedule } from "@schedules/types";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { formatDateForDisplay } from "@/lib/date-utils";
export const getHistoryColumns = (): ColumnDef<Schedule>[] => [
    {
        id: "select",
        size: 24,
        header: ({ table }) => (
            <div className="flex justify-center items-center mb-1 w-6">
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
            <div className="flex justify-center h-8 items-center">
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
        id: "time",
        size: 120,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Time" className="justify-center text-center" />
        ),
        cell: ({ row }) => (
            <div className="text-center">{row.original.start_time} – {row.original.end_time}</div>
        ),
    },
    {
        accessorKey: "branch",
        size: 120,
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
        accessorKey: "instructor",
        size: 200,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Instructor" />
        ),
        cell: ({ row }) => (
            <div className="flex justify-start">
                <div className="truncate w-45" title={String(row.getValue("instructor") || "")}>
                    {String(row.getValue("instructor") || "")}
                </div>
            </div>
        ),
    },
    {
        accessorKey: "program",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Program" />
        ),
        cell: ({ row }) => {
            return (
                <div className="flex items-center gap-2">
                    <span title={row.getValue("program")} className="truncate max-w-100">{row.getValue("program")}</span>
                </div>
            );
        },
    },
];
