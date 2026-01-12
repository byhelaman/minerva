import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { type Schedule } from "@schedules/utils/excel-parser";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";

export const getScheduleColumns = (onDelete?: (s: Schedule) => void): ColumnDef<Schedule>[] => [
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
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Date" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[80px] mx-auto">{row.getValue("date")}</div>,
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
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Branch" />
        ),
        cell: ({ row }) => <div className="w-[100px]">{row.getValue("branch")}</div>,
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
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Start" />
        ),
        cell: ({ row }) => <div className="w-[80px]">{row.getValue("start_time")}</div>,
        // Filtro por hora: extrae la hora del tiempo (ej: "08" de "08:30")
        filterFn: (row, id, filterValues: string[]) => {
            const cellValue = row.getValue(id) as string;
            const hour = cellValue?.substring(0, 2); // Extrae "HH" de "HH:MM"
            return filterValues.includes(hour);
        },
    },
    {
        accessorKey: "end_time",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="End" />
        ),
        cell: ({ row }) => <div className="w-[80px]">{row.getValue("end_time")}</div>,
    },
    {
        accessorKey: "instructor",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Instructor" />
        ),
        cell: ({ row }) => (
            <div className="max-w-[200px] truncate font-medium">
                {row.getValue("instructor")}
            </div>
        ),
    },
    {
        accessorKey: "program",
        size: 380,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Program" />
        ),
        cell: ({ row }) => (
            <div className="max-w-[360px] truncate">
                {row.getValue("program")}
            </div>
        ),
    },
    {
        accessorKey: "minutes",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Min" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[50px] text-center">{row.getValue("minutes")}</div>,
    },
    {
        accessorKey: "units",
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Units" className="justify-center" />
        ),
        cell: ({ row }) => <div className="w-[50px] text-center">{row.getValue("units")}</div>,
    },
    {
        id: "actions",
        cell: ({ row }) => <DataTableRowActions row={row} onDelete={onDelete} />,
    },
];
