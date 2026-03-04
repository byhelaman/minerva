import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleDataTable } from "@schedules/components/table/ScheduleDataTable";
import { DataTableColumnHeader } from "@schedules/components/table/data-table-column-header";
import { ROW_STYLE_DUPLICATE, ROW_STYLE_MODIFIED, ROW_STYLE_NEW } from "@/features/schedules/utils/issue-styles";
import { Loader2, X } from "lucide-react";
import type { PoolImportPreviewRow, PoolImportSummary } from "./pools-import-utils";

interface PoolsImportPreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rows: PoolImportPreviewRow[];
    summary: PoolImportSummary;
    isApplying: boolean;
    onConfirm: () => void;
    onRemoveRows: (ids: string[]) => void;
}

export function PoolsImportPreviewModal({
    open,
    onOpenChange,
    rows,
    summary,
    isApplying,
    onConfirm,
    onRemoveRows,
}: PoolsImportPreviewModalProps) {
    const columns = useMemo<ColumnDef<PoolImportPreviewRow>[]>(() => [
        {
            id: "select",
            size: 36,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-9">
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected()
                            || (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-0.5"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center">
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-0.5 mb-1"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: "program",
            accessorKey: "program_query",
            size: 280,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="font-medium truncate max-w-70" title={row.original.program_query}>
                    {row.original.program_query}
                </div>
            ),
        },
        {
            id: "positive_pool",
            accessorFn: (row) => row.allowed_instructors.join(", "),
            size: 240,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Positive Pool" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1 max-w-70">
                    {row.original.allowed_instructors.length === 0 ? (
                        <span className="text-muted-foreground">Any</span>
                    ) : (
                        row.original.allowed_instructors.map((name) => (
                            <Badge key={`${row.original.id}-allow-${name}`} variant="secondary">{name}</Badge>
                        ))
                    )}
                </div>
            ),
        },
        {
            id: "negative_pool",
            accessorFn: (row) => row.blocked_instructors.join(", "),
            size: 240,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Negative Pool" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1 max-w-70">
                    {row.original.blocked_instructors.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                    ) : (
                        row.original.blocked_instructors.map((name) => (
                            <Badge key={`${row.original.id}-block-${name}`} variant="outline">{name}</Badge>
                        ))
                    )}
                </div>
            ),
        },
        {
            id: "status",
            accessorFn: (row) => row.status,
            size: 130,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" className="justify-center" />
            ),
            cell: ({ row }) => {
                const status = row.original.status;
                if (status === "new") return <div className="text-center text-sm">New</div>;
                if (status === "modified") return <div className="text-center text-sm">Modified</div>;
                if (status === "identical") return <div className="text-center text-sm">Identical</div>;
                if (status === "duplicate") return <div className="text-center text-sm">Duplicate</div>;
                if (status === "ambiguous") return <div className="text-center text-sm">Ambiguous</div>;
                return <div className="text-center text-sm">Invalid</div>;
            },
        },
        {
            id: "actions",
            size: 56,
            enableSorting: false,
            cell: ({ row }) => (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Remove import row"
                    onClick={() => {
                        onRemoveRows([row.original.id]);
                    }}
                >
                    <X className="size-4" />
                </Button>
            ),
        },
    ], [onRemoveRows]);

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !isApplying && onOpenChange(nextOpen)}>
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>Preview Pool Import</DialogTitle>
                    <DialogDescription>
                        Review {rows.length} rows before applying changes.
                    </DialogDescription>
                </DialogHeader>

                <div className="text-sm text-muted-foreground">
                    <span>New: <strong className="text-foreground font-medium">{summary.newCount}</strong></span>
                    <span className="mx-2 text-border">|</span>
                    <span>Modified: <strong className="text-foreground font-medium">{summary.modifiedCount}</strong></span>
                    <span className="mx-2 text-border">|</span>
                    <span>Identical: <strong className="text-foreground font-medium">{summary.identicalCount}</strong></span>
                    <span className="mx-2 text-border">|</span>
                    <span>Conflicts: <strong className="text-foreground font-medium">{summary.unresolvedCount}</strong></span>
                </div>

                {summary.unresolvedCount > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        Resolve duplicate/invalid/ambiguous rows before importing.
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-hidden">
                    <ScheduleDataTable
                        columns={columns}
                        data={rows}
                        initialPageSize={100}
                        hideUpload
                        hideDefaultActions
                        hideOverlaps
                        hideFilters
                        hideBulkCopy
                        getRowKey={(row) => (row as PoolImportPreviewRow).id}
                        onBulkDelete={(selectedRows) => {
                            const selectedIds = (selectedRows as PoolImportPreviewRow[]).map((row) => row.id);
                            onRemoveRows(selectedIds);
                        }}
                        getRowClassName={(row) => {
                            const item = row as PoolImportPreviewRow;
                            if (item.status === "new") return ROW_STYLE_NEW;
                            if (item.status === "modified") return ROW_STYLE_MODIFIED;
                            if (item.status === "identical") return undefined;
                            return ROW_STYLE_DUPLICATE;
                        }}
                        getRowIssueTooltip={(row) => {
                            const item = row as PoolImportPreviewRow;
                            return item.reason || undefined;
                        }}
                    />
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={isApplying}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={
                            isApplying
                            || rows.length === 0
                            || summary.unresolvedCount > 0
                        }
                        onClick={onConfirm}
                    >
                        {isApplying ? (
                            <>
                                <Loader2 className="animate-spin" />
                                Applying...
                            </>
                        ) : (
                            "Apply Import"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}