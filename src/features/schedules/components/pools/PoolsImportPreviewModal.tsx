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
import { ROW_STYLE_DUPLICATE } from "@/features/schedules/utils/issue-styles";
import { Loader2, PlusCircle, XCircle, CheckCircle, RefreshCw, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PoolImportPreviewRow, PoolImportSummary } from "./pools-import-utils";
import { PoolCellNegative } from "./PoolCellNegative";
import { PoolCellPositive } from "./PoolCellPositive";

const MAX_VISIBLE_POOL_TAGS = 3;

const IMPORT_STATUS_OPTIONS = [
    { label: "New", value: "new", icon: PlusCircle },
    { label: "Update", value: "update", icon: RefreshCw },
    { label: "Identical", value: "identical", icon: CheckCircle },
    { label: "Invalid", value: "invalid", icon: XCircle },
];

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
    const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);

    const columns = useMemo<ColumnDef<PoolImportPreviewRow>[]>(() => [
        {
            id: "select",
            size: 24,
            header: ({ table }) => (
                <div className="flex justify-center items-center mb-1 w-6">
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
                <div className="flex justify-center w-6">
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
            size: 320,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Program" />
            ),
            cell: ({ row }) => (
                <div className="truncate max-w-75" title={row.original.program_query}>
                    {row.original.program_query}
                </div>
            ),
        },
        {
            id: "positivePool",
            header: "Positive Pool",
            cell: ({ row }) => (
                <div className="max-w-60">
                    <PoolCellPositive
                        allowedInstructors={row.original.allowed_instructors}
                        allowedInstructorsByDay={row.original.allowed_instructors_by_day ?? {}}
                        maxVisibleTags={MAX_VISIBLE_POOL_TAGS}
                    />
                </div>
            ),
        },
        {
            id: "negativePool",
            header: "Negative Pool",
            cell: ({ row }) => (
                <div className="max-w-60">
                    <PoolCellNegative
                        blockedInstructors={row.original.blocked_instructors}
                        maxVisibleTags={MAX_VISIBLE_POOL_TAGS}
                    />
                </div>
            ),
        },
        {
            id: "strict",
            accessorFn: (row) => row.hard_lock,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Strict" className="justify-center" />
            ),
            cell: ({ row }) => <div className="text-center text-sm">{row.original.hard_lock ? "Yes" : "No"}</div>,
        },
        {
            id: "rotationLimit",
            accessorFn: (row) => row.has_rotation_limit,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Rotation Limit" className="justify-center" />
            ),
            cell: ({ row }) => <div className="text-center text-sm">{row.original.has_rotation_limit ? "Yes" : "No"}</div>,
        },
        {
            id: "status",
            accessorFn: (row) => row.status,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" className="justify-center" />
            ),
            cell: ({ row }) => {
                const status = row.original.status;
                const reason = row.original.reason;

                let badge;
                if (status === "new") {
                    badge = <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20 dark:border-green-500 dark:text-green-400 cursor-pointer hover:bg-green-100 dark:hover:bg-green-500/20"><PlusCircle />New</Badge>;
                } else if (status === "update") {
                    badge = <Badge variant="outline" className="border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/20"><RefreshCw />Update</Badge>;
                } else if (status === "invalid") {
                    badge = <Badge variant="outline" className="border-destructive/50 text-destructive cursor-pointer bg-destructive/5 dark:border-destructive/50 hover:bg-destructive/10"><XCircle />Invalid</Badge>;
                } else {
                    badge = <Badge variant="outline" className="text-muted-foreground"><CheckCircle />Identical</Badge>;
                }

                if (!reason || status === "new" || status === "update" || status === "identical") {
                    return <div className="flex justify-center">{badge}</div>;
                }

                return (
                    <div className="flex justify-center">
                        <Popover modal={false}>
                            <PopoverTrigger asChild>
                                {badge}
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-80 p-0 rounded-lg z-200 pointer-events-auto"
                                onWheel={(e) => e.stopPropagation()}
                            >
                                <div className="p-4 space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-sm mb-3 text-destructive">
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </h4>
                                        <div className="space-y-3">
                                            <div className="text-xs font-medium text-muted-foreground mb-2">Reason</div>
                                            <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                                                {reason}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                );
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
    ], []);

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
                        statusOptions={IMPORT_STATUS_OPTIONS}
                        getRowKey={(row) => (row as PoolImportPreviewRow).id}
                        onBulkDelete={(selectedRows) => {
                            const selectedIds = (selectedRows as PoolImportPreviewRow[]).map((row) => row.id);
                            setPendingDeleteIds(selectedIds);
                        }}
                        getRowClassName={(row) => {
                            const item = row as PoolImportPreviewRow;
                            if (item.status === "identical" || item.status === "new" || item.status === "update") return undefined;
                            // "invalid" gets error style
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
                                <span>Update: <strong className="text-foreground font-medium">{summary.updateCount}</strong></span>
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
                                || (summary.newCount === 0 && summary.updateCount === 0)
                                || summary.unresolvedCount > 0
                            }
                            onClick={() => setConfirmApplyOpen(true)}
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
                <AlertDialogContent className="sm:max-w-100!">
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

            <AlertDialog open={confirmApplyOpen} onOpenChange={setConfirmApplyOpen}>
                <AlertDialogContent className="sm:max-w-100!">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apply Import</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to import these changes? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setConfirmApplyOpen(false);
                                onConfirm();
                            }}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}