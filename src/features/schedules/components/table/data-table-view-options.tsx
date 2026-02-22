import { type Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DataTableViewOptionsProps<TData> {
    table: Table<TData>;
}

export function DataTableViewOptions<TData>({
    table,
}: DataTableViewOptionsProps<TData>) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto hidden h-8 lg:flex"
                >
                    <Settings2 />
                    View
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-38 p-0">
                <DropdownMenuLabel className="px-3 pt-2.5">Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="overflow-auto max-h-80 p-1 pt-0">
                    {table
                        .getAllColumns()
                        .filter(
                            (column) =>
                                typeof column.accessorFn !== "undefined" && column.getCanHide()
                        )
                        .map((column) => {
                            return (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className="capitalize"
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                >
                                    {column.id.replace(/_/g, " ")}
                                </DropdownMenuCheckboxItem>
                            );
                        })}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
