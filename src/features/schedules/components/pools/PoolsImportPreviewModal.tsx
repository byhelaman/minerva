import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

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
                <div className="flex justify-center w-9">
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
            id: "branch",
            accessorKey: "branch",
            size: 120,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Branch" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-28" title={row.original.branch}>{row.original.branch}</div>
            ),
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
            id: "strict",
            accessorFn: (row) => row.hard_lock,
            size: 90,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Strict" className="justify-center" />
            ),
            cell: ({ row }) => <div className="text-center text-sm">{row.original.hard_lock ? "Yes" : "No"}</div>,
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
                    size="icon-sm"
                    aria-label="Remove import row"
                    onClick={() => {
                        setPendingDeleteIds([row.original.id]);
                    }}
                >
                    <X />
                </Button>
            ),
        },
    ], [onRemoveRows]);

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !isApplying && onOpenChange(nextOpen)}>
            <DialogContent className="max-w-7xl! max-h-[85vh] flex flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>Preview Import</DialogTitle>
                    <DialogDescription>
                        Review {rows.length} rows before applying changes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-hidden">
                    <ScheduleDataTable
                        columns={columns}
                        data={rows}
                        initialPageSize={100}
                        hideActions
                        hideUpload
                        hideDefaultActions
                        hideOverlaps
                        hideFilters
                        hideBulkCopy
                        disablePersistence
                        getRowKey={(row) => (row as PoolImportPreviewRow).id}
                        onBulkDelete={(selectedRows) => {
                            const selectedIds = (selectedRows as PoolImportPreviewRow[]).map((row) => row.id);
                            setPendingDeleteIds(selectedIds);
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

                <DialogFooter className="mt-auto flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-3 mr-auto text-sm text-muted-foreground">
                        {isApplying ? (
                            <span className="text-muted-foreground">Processing...</span>
                        ) : (
                            <>
                                <span>New: <strong className="text-foreground font-medium">{summary.newCount}</strong></span>
                                <span className="text-border">|</span>
                                <span>Modified: <strong className="text-foreground font-medium">{summary.modifiedCount}</strong></span>
                                <span className="text-border">|</span>
                                <span>Identical: <strong className="text-foreground font-medium">{summary.identicalCount}</strong></span>
                                <span className="text-border">|</span>
                                <span>Conflicts: <strong className="text-foreground font-medium">{summary.unresolvedCount}</strong></span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
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
                                "Import"
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <AlertDialog open={pendingDeleteIds.length > 0} onOpenChange={(open) => !open && setPendingDeleteIds([])}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pendingDeleteIds.length === 1 ? "Remove row?" : `Remove ${pendingDeleteIds.length} rows?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the selected row(s) from the import preview.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onRemoveRows(pendingDeleteIds);
                                setPendingDeleteIds([]);
                            }}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}