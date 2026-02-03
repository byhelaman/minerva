import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { type Schedule } from "@/features/schedules/utils/excel-parser";
import { DataTableColumnHeader } from "@/features/schedules/components/table/data-table-column-header";
import { DataTableRowActions } from "@/features/schedules/components/table/data-table-row-actions";
import { formatDateForDisplay } from "@/lib/utils";

export const getDataSourceColumns = (onDelete?: (s: Schedule) => void): ColumnDef<Schedule>[] => [
    {
        id: "select",
        size: 36,
        header: ({ table }) => (
            <div className="flex justify-center items-center mb-1">
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
            <DataTableColumnHeader column={column} title="date" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[100px] text-center">
            {formatDateForDisplay(row.getValue("date"))}
        </div>,
    },
    {
        accessorKey: "shift",
        size: 100,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="shift" />
        ),
        cell: ({ row }) => <div className="w-[100px]">{row.getValue("shift")}</div>,
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
    },
    {
        accessorKey: "branch",
        size: 120,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="branch" />
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
            <DataTableColumnHeader column={column} title="time" className="justify-center" />
        ),
        cell: ({ row }) => (
            <div className="w-[120px] mx-auto text-center">
                {row.getValue("start_time")} - {row.original.end_time}
            </div>
        ),
    },
    {
        accessorKey: "end_time",
        size: 100,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="end time" />
        ),
        cell: ({ row }) => <div className="text-center">{row.getValue("end_time")}</div>,
    },
    {
        accessorKey: "code",
        size: 100,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="code" />
        ),
        cell: ({ row }) => <div className="text-center">{row.getValue("code")}</div>,
    },
    {
        accessorKey: "instructor",
        size: 200,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="instructor" />
        ),
        cell: ({ row }) => (
            <div className="truncate w-[180px]" title={row.getValue("instructor")}>{row.getValue("instructor")}</div>
        ),
    },
    {
        accessorKey: "program",
        size: 400,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="program" />
        ),
        cell: ({ row }) => (
            <div className="truncate max-w-[380px]" title={row.getValue("program")}>
                {row.getValue("program")}
            </div>
        ),
    },
    {
        accessorKey: "minutes",
        size: 70,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="mins" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[50px] text-center">{row.getValue("minutes")}</div>,
    },
    {
        accessorKey: "units",
        size: 70,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="units" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[50px] text-center">{row.getValue("units")}</div>,
    },
    {
        accessorKey: "status",
        size: 80,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="status" />
        ),
        cell: ({ row }) => (
            <div className="text-center">{row.getValue("status")}</div>
        ),
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
    },
    {
        accessorKey: "substitute",
        size: 150,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="substitute" />
        ),
        cell: ({ row }) => <div>{row.getValue("substitute")}</div>,
    },
    {
        accessorKey: "type",
        size: 150,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="type" />
        ),
        cell: ({ row }) => <div>{row.getValue("type")}</div>,
        filterFn: (row, id, value) => {
            return value.includes(row.getValue(id));
        },
    },
    {
        accessorKey: "subtype",
        size: 100,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="subtype" />
        ),
        cell: ({ row }) => <div className="text-center">{row.getValue("subtype")}</div>,
    },
    {
        accessorKey: "description",
        size: 500,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="description" />
        ),
        cell: ({ row }) => (
            <div className="truncate max-w-[480px]">{row.getValue("description")}</div>
        )
    },
    {
        accessorKey: "department",
        size: 150,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="department" />
        ),
        cell: ({ row }) => <div>{row.getValue("department")}</div>,
    },
    {
        accessorKey: "feedback",
        size: 200,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="feedback" />
        ),
        cell: ({ row }) => <div className="truncate" title={row.getValue("feedback")}>{row.getValue("feedback")}</div>,
    },
    {
        id: "actions",
        size: 50,
        cell: ({ row }) => <DataTableRowActions row={row} onDelete={onDelete} />,
    },
];
