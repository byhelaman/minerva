import * as React from "react";
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableFloatingBar } from "./data-table-floating-bar";
import { detectOverlaps, getScheduleKey } from "@schedules/utils/overlap-utils";
import type { Schedule } from "@schedules/types";
import type { IssueCategory } from "./IssueFilter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDateForDisplay } from "@/lib/date-utils";
import { mapScheduleToExcelRow } from "@schedules/utils/export-utils";
import { Blend } from "lucide-react";

interface ScheduleDataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[] | ((addStatusFilter: (status: string) => void) => ColumnDef<TData, TValue>[]);
    data: TData[];
    onUploadClick?: () => void;
    onClearSchedule?: () => void;
    onRefresh?: () => void;
    onSelectionChange?: (selectedRows: TData[]) => void;
    enableRowSelection?: boolean | ((row: TData) => boolean);
    controlledSelection?: Record<string, boolean>;
    onControlledSelectionChange?: (selection: Record<string, boolean>) => void;

    // Custom row className callback (for error highlighting, pending changes, etc.)
    getRowClassName?: (row: TData) => string | undefined;

    // Issue tooltip callback — returns reason text (shown on hover over highlighted rows)
    getRowIssueTooltip?: (row: TData) => string | { type: 'issue' | 'mod', message: React.ReactNode | string } | undefined;

    // Configuración unificada de filtros
    filterConfig?: {
        showStatus?: boolean;
        showTime?: boolean;
        showBranch?: boolean; // Futuro
    };

    // Deprecated props (mantener temporalmente para migración gradual si se desea, o eliminar si vamos "all in")
    hideFilters?: boolean;
    hideUpload?: boolean;
    hideActions?: boolean;
    hideOverlaps?: boolean;
    disableRefresh?: boolean;
    initialPageSize?: number;
    statusOptions?: { label: string; value: string; count?: number; icon?: React.ComponentType<{ className?: string }> }[];
    activeMeetingIds?: string[];
    activePrograms?: Set<string>;
    showLiveMode?: boolean;
    setShowLiveMode?: (show: boolean) => void;
    isLiveLoading?: boolean;
    liveTimeFilter?: string;
    liveDateFilter?: string;
    onPublish?: () => void;
    isPublishing?: boolean;
    canPublish?: boolean;
    initialColumnVisibility?: VisibilityState;

    // Legacy support
    showTypeFilter?: boolean;
    hideStatusFilter?: boolean;

    customActionItems?: React.ReactNode;
    customFilterItems?: React.ReactNode;
    hideDefaultActions?: boolean;
    customExportFn?: (data: TData[]) => Promise<void>;
    onAddRow?: () => void;
    onBulkDelete?: (rows: TData[]) => void;
    onBulkCopy?: (rows: TData[]) => void;
    hideBulkCopy?: boolean;

    /** Additional issue categories from parent (e.g. duplicates, modified) */
    externalIssueCategories?: IssueCategory[];
    /** Map of issue key → Set of row keys affected by that issue */
    issueRowKeys?: Record<string, Set<string>>;
    /** Optional custom row key extractor for independent data models */
    getRowKey?: (row: TData) => string;
}

export function ScheduleDataTable<TData, TValue>({
    columns,
    data,
    onClearSchedule,
    onUploadClick,
    onRefresh,
    statusOptions,
    onPublish,
    isPublishing,
    canPublish,
    ...props
}: ScheduleDataTableProps<TData, TValue>) {
    const tableContainerRef = React.useRef<HTMLDivElement>(null);

    // Use controlled selection if provided, otherwise use internal state
    const [internalSelection, setInternalSelection] = React.useState({});
    const isControlled = props.controlledSelection !== undefined;
    const rowSelection = isControlled ? props.controlledSelection! : internalSelection;
    const setRowSelection = isControlled
        ? (updater: React.SetStateAction<Record<string, boolean>>) => {
            const newValue = typeof updater === 'function' ? updater(rowSelection) : updater;
            props.onControlledSelectionChange?.(newValue);
        }
        : setInternalSelection;
    // Columna shift oculta por defecto, pero permite sobrescribir con props
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({ shift: false, type: false, ...props.initialColumnVisibility });
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
        []
    );
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = React.useState("");
    const [selectedIssueKeys, setSelectedIssueKeys] = React.useState<Set<string>>(new Set());
    const globalFilterTerms = React.useMemo(
        () => String(globalFilter)
            .split(',')
            .map((term) => term.trim().toLowerCase())
            .filter((term) => term.length > 0),
        [globalFilter]
    );

    const [pagination, setPagination] = React.useState({
        pageIndex: 0,
        pageSize: props.initialPageSize || 25,
    });

    // Aplicar/quitar filtros de tiempo y fecha cuando Live mode cambia
    React.useEffect(() => {
        if (props.showLiveMode && props.liveTimeFilter) {
            // Activar Live: aplicar filtros de hora y fecha actual
            setColumnFilters(prev => {
                const withoutTimeAndDate = prev.filter(f => f.id !== 'start_time' && f.id !== 'date');
                const newFilters = [...withoutTimeAndDate, { id: 'start_time', value: [props.liveTimeFilter] }];
                if (props.liveDateFilter) {
                    newFilters.push({ id: 'date', value: [props.liveDateFilter] });
                }
                return newFilters;
            });
        } else if (!props.showLiveMode) {
            // Desactivar Live: quitar filtros de hora y fecha
            setColumnFilters(prev => {
                const hasLiveFilters = prev.some(f => f.id === 'start_time' || f.id === 'date');
                if (hasLiveFilters) {
                    return prev.filter(f => f.id !== 'start_time' && f.id !== 'date');
                }
                return prev;
            });
        }
    }, [props.showLiveMode, props.liveTimeFilter, props.liveDateFilter]);

    // Función para agregar un status al filtro de status (solo expande filtros existentes)
    const addStatusFilter = React.useCallback((status: string) => {
        setColumnFilters(prev => {
            const statusFilter = prev.find(f => f.id === 'status');
            if (!statusFilter) return prev; // No crear filtro si no hay uno activo
            const currentValues = statusFilter.value as string[];
            if (currentValues.includes(status)) return prev;
            return prev.map(f =>
                f.id === 'status'
                    ? { ...f, value: [...currentValues, status] }
                    : f
            );
        });
    }, []);

    // Resolver columns - pueden ser una función o un array directo
    const resolvedColumns = React.useMemo(() => {
        if (typeof columns === 'function') {
            return columns(addStatusFilter);
        }
        return columns;
    }, [columns, addStatusFilter]);

    const overlapResult = React.useMemo(() => {
        if (props.hideOverlaps) {
            return {
                timeConflicts: new Set<string>(),
                duplicateClasses: new Set<string>(),
                allOverlaps: new Set<string>(),
                overlapCount: 0
            };
        }
        return detectOverlaps(data as unknown as Schedule[]);
    }, [data, props.hideOverlaps]);

    // Build unified issue categories: built-in overlaps + external categories
    const issueCategories = React.useMemo(() => {
        const cats: IssueCategory[] = [];

        // Built-in: overlaps
        if (overlapResult.overlapCount > 0) {
            cats.push({ key: 'overlaps', label: 'Overlaps', count: overlapResult.overlapCount, icon: Blend });
        }

        // External categories from parent
        if (props.externalIssueCategories) {
            cats.push(...props.externalIssueCategories);
        }

        return cats;
    }, [overlapResult, props.externalIssueCategories]);

    // Combined row keys for all issue types: built-in overlaps + external
    const allIssueRowKeys = React.useMemo(() => {
        const map: Record<string, Set<string>> = {
            overlaps: overlapResult.allOverlaps,
            ...props.issueRowKeys,
        };
        return map;
    }, [overlapResult, props.issueRowKeys]);

    // Filter data based on selected issue keys
    const tableData = React.useMemo(() => {
        if (selectedIssueKeys.size === 0) return data;

        // Collect all row keys that match any selected issue
        const matchingRowKeys = new Set<string>();
        for (const issueKey of selectedIssueKeys) {
            const rowKeys = allIssueRowKeys[issueKey];
            if (rowKeys) {
                for (const rk of rowKeys) matchingRowKeys.add(rk);
            }
        }

        return data.filter((item) => {
            const rowKey = props.getRowKey ? props.getRowKey(item) : getScheduleKey(item as unknown as Schedule);
            return matchingRowKeys.has(rowKey);
        });
    }, [data, selectedIssueKeys, allIssueRowKeys, props.getRowKey]);

    const table = useReactTable({
        data: tableData,
        columns: resolvedColumns,
        meta: {
            getRowIssueTooltip: (row: TData) => {
                // External tooltip callback takes priority
                const external = props.getRowIssueTooltip?.(row);
                if (external) return external;
                // Built-in overlap reasons
                const key = props.getRowKey ? props.getRowKey(row) : getScheduleKey(row as unknown as Schedule);
                if (overlapResult.timeConflicts.has(key)) {
                    return `Time conflict: ${(row as Schedule).instructor} has overlapping schedules at this time`;
                }
                if (overlapResult.duplicateClasses.has(key)) {
                    return `Duplicate class: this program has multiple instructors at the same time`;
                }
                return undefined;
            },
        },
        // Usar ID único por fila para row selection (recomendación oficial de TanStack)
        getRowId: (row, index) => (row as { id?: string }).id || String(index),
        state: {
            pagination,
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            globalFilter,
        },
        enableRowSelection: (() => {
            const selectionProp = props.enableRowSelection;
            if (selectionProp === undefined) return true;
            if (typeof selectionProp === 'function') {
                return (row: { original: TData }) => selectionProp(row.original);
            }
            return selectionProp;
        })(),
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
        autoResetPageIndex: true, // Resetear a página 1 cuando cambian filtros
        globalFilterFn: (row, columnId, _filterValue) => {
            const value = row.getValue(columnId);
            if (value == null) return false;
            const cellValue = String(value).toLowerCase();
            if (globalFilterTerms.length === 0) return true;
            return globalFilterTerms.some(term => cellValue.includes(term));
        },
    });

    // Guardar callback en ref para evitar re-ejecución por cambio de referencia
    const onSelectionChangeRef = React.useRef(props.onSelectionChange);
    onSelectionChangeRef.current = props.onSelectionChange;

    // Notificar al padre cuando cambia la selección
    // Note: uses table.getSelectedRowModel() instead of filtering tableData by id,
    // because Schedule rows may not have an 'id' field (rowId falls back to index string).
    const tableRef = React.useRef(table);
    tableRef.current = table;
    const selectionAnchorRowIdRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (onSelectionChangeRef.current) {
            const selectedRows = tableRef.current.getSelectedRowModel().rows.map(r => r.original);
            onSelectionChangeRef.current(selectedRows as TData[]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowSelection]);

    // Limpiar selecciones inválidas cuando tableData cambia
    const enableRowSelectionRef = React.useRef(props.enableRowSelection);
    enableRowSelectionRef.current = props.enableRowSelection;

    React.useEffect(() => {
        if (typeof enableRowSelectionRef.current !== 'function') return;
        if (Object.keys(rowSelection).length === 0) return;

        const selectionFn = enableRowSelectionRef.current;
        let hasInvalidSelection = false;

        for (const rowId of Object.keys(rowSelection)) {
            if (!rowSelection[rowId as keyof typeof rowSelection]) continue;
            const row = tableData.find(r => (r as { id?: string }).id === rowId);
            if (!row || !selectionFn(row)) {
                hasInvalidSelection = true;
                break;
            }
        }

        if (hasInvalidSelection) {
            const newSelection: Record<string, boolean> = {};
            for (const rowId of Object.keys(rowSelection)) {
                if (!rowSelection[rowId as keyof typeof rowSelection]) continue;
                const row = tableData.find(r => (r as { id?: string }).id === rowId);
                if (row && selectionFn(row)) {
                    newSelection[rowId] = true;
                }
            }
            setRowSelection(newSelection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableData]);

    const handleRowModifierSelection = React.useCallback((event: React.MouseEvent<HTMLTableRowElement>, rowId: string) => {
        if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;

        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, [role="checkbox"], [data-radix-collection-item]')) return;

        const visibleRows = table.getRowModel().rows;
        const isToggle = event.ctrlKey || event.metaKey;

        if (event.shiftKey && selectionAnchorRowIdRef.current) {
            const fromIndex = visibleRows.findIndex((r) => r.id === selectionAnchorRowIdRef.current);
            const toIndex = visibleRows.findIndex((r) => r.id === rowId);

            if (fromIndex !== -1 && toIndex !== -1) {
                const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
                const nextSelection: Record<string, boolean> = isToggle ? { ...rowSelection } : {};

                for (let index = start; index <= end; index++) {
                    nextSelection[visibleRows[index].id] = true;
                }

                setRowSelection(nextSelection);
                return;
            }
        }

        if (isToggle) {
            const isSelected = !!rowSelection[rowId as keyof typeof rowSelection];
            const nextSelection = { ...rowSelection } as Record<string, boolean>;

            if (isSelected) {
                delete nextSelection[rowId];
            } else {
                nextSelection[rowId] = true;
            }

            setRowSelection(nextSelection);
            selectionAnchorRowIdRef.current = rowId;
        }
    }, [rowSelection, setRowSelection, table]);

    const handleRowModifierMouseDown = React.useCallback((event: React.MouseEvent<HTMLTableRowElement>) => {
        if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;

        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, [role="checkbox"], [data-radix-collection-item]')) return;

        event.preventDefault();
    }, []);

    const handleBulkCopy = () => {
        const selectedRows = table.getFilteredSelectedRowModel().rows;
        const details = selectedRows.map(row => {
            const s = row.original as Record<string, unknown>;
            const timeRange = `${s.start_time} - ${s.end_time}`;
            return `${s.date}\n${s.program}\n${timeRange}`;
        }).join("\n\n");
        navigator.clipboard.writeText(details).then(() => {
            toast.success(`${selectedRows.length} rows copied`);
        }).catch(() => {
            toast.error("Failed to copy");
        });
    };

    const handleBulkCopyAsTable = () => {
        const selectedRows = table.getFilteredSelectedRowModel().rows;
        const tdStyle = "border: 1px solid #e5e7eb; padding: 2px 8px; white-space: nowrap; font-size: 10px;";
        const thStyle = `${tdStyle} font-weight: 700;`;

        const getFields = (s: Record<string, unknown>) => [
            { label: "date", value: formatDateForDisplay(String(s.date || "")) },
            { label: "branch", value: String(s.branch || "") },
            { label: "start_time", value: String(s.start_time || "") },
            { label: "end_time", value: String(s.end_time || "") },
            { label: "instructor", value: String(s.instructor || "") },
            { label: "program", value: String(s.program || "") },
            { label: "minutes", value: String(s.minutes ?? "0") },
            { label: "units", value: String(s.units ?? "0") },
            { label: "status", value: String(s.status || "") },
            { label: "substitute", value: String(s.substitute || "") },
            { label: "type", value: String(s.type || "") },
            { label: "subtype", value: String(s.subtype || "") },
            { label: "description", value: String(s.description || "") },
            { label: "department", value: String(s.department || "") },
        ];

        const headers = getFields({}).map(f => f.label);
        const htmlRows = selectedRows.map(row => {
            const fields = getFields(row.original as Record<string, unknown>);
            return `<tr>${fields.map(f => `<td style="${tdStyle}">${f.value}</td>`).join("")}</tr>`;
        });
        const html = `<table style="border-collapse: collapse; width: 100%;"><thead><tr>${headers.map(h => `<th style="${thStyle}">${h}</th>`).join("")}</tr></thead><tbody>${htmlRows.join("")}</tbody></table>`;

        const textRows = selectedRows.map(row => {
            const fields = getFields(row.original as Record<string, unknown>);
            return fields.map(f => `${f.label}: ${f.value}`).join("\n");
        });
        const text = textRows.join("\n\n");

        navigator.clipboard.write([new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
        })]).then(() => {
            toast.success(`${selectedRows.length} rows copied as table`);
        }).catch(() => {
            toast.error("Failed to copy");
        });
    };

    const handleBulkCopyAsExcel = () => {
        const selectedRows = table.getFilteredSelectedRowModel().rows;

        const rows = selectedRows.map(row => {
            return mapScheduleToExcelRow(row.original as Schedule);
        }).join("\n");

        navigator.clipboard.writeText(rows).then(() => {
            toast.success(`${selectedRows.length} rows copied for Excel`);
        }).catch(() => {
            toast.error("Failed to copy to Excel");
        });
    };

    // Memoize the faceted categories calculation to prevent severe lag during re-renders
    // To get true faceted counts, we evaluate against data that has passed all 
    // TanStack column and global filters, but BEFORE the IssueFilter exclusion applies.
    const dynamicCategories = React.useMemo(() => {
        const activeFilters = table.getState().columnFilters;

        const baseVisibleData = data.filter(item => {
            const row = item as Record<string, unknown>;

            // 1. Column filters (simplified evaluation for our specific filters: branch, status, time, type)
            for (const filter of activeFilters) {
                const cellValue = String(row[filter.id] || '');
                const filterValues = filter.value as string | string[];

                if (Array.isArray(filterValues)) {
                    if (!filterValues.includes(cellValue)) return false;
                } else if (typeof filterValues === 'string') {
                    if (!cellValue.toLowerCase().startsWith(filterValues.toLowerCase()) &&
                        !cellValue.toLowerCase().includes(filterValues.toLowerCase())) {
                        return false;
                    }
                }
            }

            // 2. Global filter
            if (globalFilterTerms.length > 0) {
                const searchableText = Object.values(row).map(v => String(v || '')).join(' ').toLowerCase();
                const matchesGlobally = globalFilterTerms.some(term => searchableText.includes(term));
                if (!matchesGlobally) return false;
            }

            return true;
        });

        // Recalculate issue counts dynamically using the base visible data
        return issueCategories.map(cat => {
            const keysForThisCategory = allIssueRowKeys[cat.key] || new Set();

            const activeCount = baseVisibleData.filter(item => {
                const rowKey = props.getRowKey ? props.getRowKey(item) : getScheduleKey(item as unknown as Schedule);
                return keysForThisCategory.has(rowKey);
            }).length;

            return { ...cat, count: activeCount };
        });
    }, [
        data,
        issueCategories,
        allIssueRowKeys,
        globalFilterTerms,
        props.getRowKey,
        table.getState().columnFilters,
        table.getState().globalFilter,
    ]);

    const rows = table.getRowModel().rows;
    const shouldVirtualize = table.getState().pagination.pageSize >= 200;
    const rowVirtualizer = useVirtualizer({
        count: shouldVirtualize ? rows.length : 0,
        getScrollElement: () => tableContainerRef.current,
        estimateSize: () => 38,
        overscan: 10,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();
    const topPadding = shouldVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
    const bottomPadding = shouldVirtualize && virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;
    const visibleRows = shouldVirtualize
        ? virtualRows
            .map((virtualRow) => rows[virtualRow.index])
            .filter((row): row is (typeof rows)[number] => row !== undefined)
        : rows;

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-4 p-1">
            {/* Toolbar with Search, Filters, and View Options */}
            <DataTableToolbar
                table={table}
                issueCategories={dynamicCategories}
                selectedIssueKeys={selectedIssueKeys}
                onIssueSelectionChange={setSelectedIssueKeys}
                hasActiveIssueFilter={selectedIssueKeys.size > 0}
                onClearSchedule={onClearSchedule}
                onUploadClick={onUploadClick}
                onRefresh={onRefresh}
                fullData={data}
                hideFilters={props.hideFilters}
                hideUpload={props.hideUpload}
                hideActions={props.hideActions}
                disableRefresh={props.disableRefresh}
                statusOptions={statusOptions}
                showLiveMode={props.showLiveMode}
                setShowLiveMode={props.setShowLiveMode}
                isLiveLoading={props.isLiveLoading}
                activeMeetingsCount={props.activePrograms?.size ?? props.activeMeetingIds?.length ?? 0}
                onPublish={onPublish}
                isPublishing={isPublishing}
                canPublish={canPublish}
                hideStatusFilter={props.filterConfig?.showStatus !== undefined ? !props.filterConfig.showStatus : props.hideStatusFilter}
                showBranch={props.filterConfig?.showBranch}
                showTime={props.filterConfig?.showTime}
                customActionItems={props.customActionItems}
                customFilterItems={props.customFilterItems}
                hideDefaultActions={props.hideDefaultActions}
                customExportFn={props.customExportFn}
                onAddRow={props.onAddRow}
            />

            {/* Table */}
            <div ref={tableContainerRef} className="flex flex-1 min-h-0 flex-col overflow-auto">
                <div className="w-max min-w-full rounded-md border">
                    <Table containerClassName="overflow-visible">
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => {
                                        return (
                                            <TableHead
                                                key={header.id}
                                                colSpan={header.colSpan}
                                                style={{
                                                    width: header.getSize() !== 150 ? header.getSize() : undefined,
                                                }}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {rows.length ? (
                                <>
                                    {shouldVirtualize && topPadding > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={table.getVisibleLeafColumns().length} style={{ height: `${topPadding}px`, padding: 0 }} />
                                        </TableRow>
                                    )}

                                    {visibleRows.map((row) => {
                                        const rowKey = getScheduleKey(row.original as Schedule);
                                        const isConflict = overlapResult.allOverlaps.has(rowKey);

                                        const original = row.original as { meeting_id?: string; meetingId?: string; program?: string };
                                        const rowMeetingId = original.meeting_id || original.meetingId;
                                        const isActiveByMeetingId = rowMeetingId && props.activeMeetingIds?.includes(rowMeetingId);
                                        const isActiveByProgram = original.program && props.activePrograms?.has(original.program);
                                        const isActive = isActiveByMeetingId || isActiveByProgram;

                                        return (
                                            <TableRow
                                                key={row.id}
                                                data-state={row.getIsSelected() && "selected"}
                                                onMouseDown={handleRowModifierMouseDown}
                                                onClick={(event) => handleRowModifierSelection(event, row.id)}
                                                className={cn(
                                                    isConflict && "bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500",
                                                    isActive && "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500",
                                                    props.getRowClassName?.(row.original)
                                                )}
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(
                                                            cell.column.columnDef.cell,
                                                            cell.getContext()
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        );
                                    })}

                                    {shouldVirtualize && bottomPadding > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={table.getVisibleLeafColumns().length} style={{ height: `${bottomPadding}px`, padding: 0 }} />
                                        </TableRow>
                                    )}
                                </>
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={resolvedColumns.length}
                                        className="h-24 text-center"
                                    >
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Floating Action Bar */}
                <DataTableFloatingBar
                    selectedCount={table.getFilteredSelectedRowModel().rows.length}
                    onCopy={props.hideBulkCopy ? undefined : (props.onBulkCopy ? () => {
                        const selectedRows = table.getFilteredSelectedRowModel().rows.map(r => r.original);
                        props.onBulkCopy!(selectedRows);
                    } : handleBulkCopy)}
                    onCopyAsTable={props.hideBulkCopy || props.onBulkCopy ? undefined : handleBulkCopyAsTable}
                    onCopyAsExcel={props.hideBulkCopy || props.onBulkCopy ? undefined : handleBulkCopyAsExcel}
                    onDelete={props.onBulkDelete ? () => {
                        // Use getSelectedRowModel (not filtered) so rows hidden by filters are also deleted
                        const selectedRows = table.getSelectedRowModel().rows.map(r => r.original);
                        props.onBulkDelete!(selectedRows);
                        table.resetRowSelection();
                    } : undefined}
                    onClearSelection={() => table.resetRowSelection()}
                />
            </div>

            {/* Pagination */}
            <DataTablePagination table={table} />
        </div>
    );
}
