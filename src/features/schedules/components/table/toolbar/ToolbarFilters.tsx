import { useMemo } from "react";
import { type Table } from "@tanstack/react-table";
import { Search, X, AlertTriangle, BadgeCheck, RefreshCw, XCircle, HelpCircle, Hand, Info, User, CalendarCheck, Wrench, MonitorCog, Clock1, Clock2, Clock3, Clock4, Clock5, Clock6, Clock7, Clock8, Clock9, Clock10, Clock11, Clock12 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { DataTableFacetedFilter } from "../data-table-faceted-filter";
import { cn } from "@/lib/utils";
import type { Schedule } from "@schedules/types";
import { RequirePermission } from "@/components/RequirePermission";

// Options definitions
const branchOptions = [
    { label: "CORPORATE", value: "CORPORATE" },
    { label: "HUB", value: "HUB" },
    { label: "LA MOLINA", value: "LA MOLINA" },
    { label: "KIDS", value: "KIDS" },
];

const defaultStatusOptions = [
    { label: "Assigned", value: "assigned", icon: BadgeCheck },
    { label: "To Update", value: "to_update", icon: RefreshCw },
    { label: "Not Found", value: "not_found", icon: XCircle },
    { label: "Ambiguous", value: "ambiguous", icon: HelpCircle },
    { label: "Manual", value: "manual", icon: Hand },
];

const incidenceTypeOptions = [
    { label: "Instructor", value: "Instructor", icon: User },
    { label: "Novedad", value: "Novedad", icon: Info },
    { label: "Programación", value: "Programación", icon: CalendarCheck },
    { label: "Servicios", value: "Servicios", icon: Wrench },
    { label: "Sistema", value: "Sistema", icon: MonitorCog },
];

// Mapeo de hora a icono de reloj (usa hora en formato 12h)
const getClockIcon = (hour: string) => {
    const h = parseInt(hour, 10);
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const icons = { 1: Clock1, 2: Clock2, 3: Clock3, 4: Clock4, 5: Clock5, 6: Clock6, 7: Clock7, 8: Clock8, 9: Clock9, 10: Clock10, 11: Clock11, 12: Clock12 };
    return icons[hour12 as keyof typeof icons] || Clock12;
};

// Opciones por defecto cuando no hay datos cargados
const defaultTimeOptions = [
    { label: "07:00", value: "07", icon: Clock7 },
    { label: "08:00", value: "08", icon: Clock8 },
    { label: "09:00", value: "09", icon: Clock9 },
    { label: "10:00", value: "10", icon: Clock10 },
    { label: "11:00", value: "11", icon: Clock11 },
    { label: "12:00", value: "12", icon: Clock12 },
    { label: "13:00", value: "13", icon: Clock1 },
    { label: "14:00", value: "14", icon: Clock2 },
    { label: "15:00", value: "15", icon: Clock3 },
    { label: "16:00", value: "16", icon: Clock4 },
    { label: "17:00", value: "17", icon: Clock5 },
    { label: "18:00", value: "18", icon: Clock6 },
    { label: "19:00", value: "19", icon: Clock7 },
    { label: "20:00", value: "20", icon: Clock8 },
    { label: "21:00", value: "21", icon: Clock9 },
];

interface ToolbarFiltersProps<TData> {
    table: Table<TData>;
    fullData: TData[];
    showOverlapsOnly: boolean;
    setShowOverlapsOnly: (show: boolean) => void;
    overlapCount: number;
    hideFilters?: boolean;
    hideUpload?: boolean;
    onUploadClick?: () => void;
    showTypeFilter?: boolean;
    hideStatusFilter?: boolean;
    statusOptions?: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[];
    setShowLiveMode?: (show: boolean) => void;
    showBranch?: boolean;
    showTime?: boolean;
    customFilterItems?: React.ReactNode;
}

export function ToolbarFilters<TData>({
    table,
    fullData,
    showOverlapsOnly,
    setShowOverlapsOnly,
    overlapCount,
    hideFilters = false,
    hideUpload = false,
    onUploadClick,
    showTypeFilter = false,
    hideStatusFilter = false,
    statusOptions = defaultStatusOptions,
    setShowLiveMode,
    showBranch,
    showTime,
    customFilterItems,
}: ToolbarFiltersProps<TData>) {
    const isFiltered =
        table.getState().columnFilters.length > 0 ||
        !!table.getState().globalFilter ||
        showOverlapsOnly;

    const isTableEmpty = !fullData || fullData.length === 0;

    // Generar opciones de hora dinámicamente desde fullData
    const timeOptions = useMemo(() => {
        const data = fullData as Schedule[];
        if (!data || data.length === 0) return defaultTimeOptions;

        const hoursSet = new Set<string>();
        data.forEach((item) => {
            const timeStr = String(item.start_time);
            const hour = timeStr.substring(0, 2);
            if (/^\d{2}$/.test(hour)) {
                hoursSet.add(hour);
            }
        });

        if (hoursSet.size === 0) return defaultTimeOptions;

        return Array.from(hoursSet)
            .sort()
            .map((hour) => ({
                label: `${hour}:00`,
                value: hour,
                icon: getClockIcon(hour),
            }));
    }, [fullData]);

    // Determine if we should show incidence type filter based on data
    const hasIncidenceData = useMemo(() => {
        const data = fullData as (Schedule & { type?: string })[];
        if (!data || data.length === 0) return false;

        return data.some((item) => item.type);
    }, [fullData]);

    const resolvedStatusOptions = useMemo(() => {
        if (statusOptions !== defaultStatusOptions) {
            return statusOptions;
        }
        return statusOptions;
    }, [statusOptions]);

    return (
        <div className="flex flex-1 items-center gap-2">
            {/* Upload Files */}
            {!hideUpload && (
                <RequirePermission permission="schedules.write">
                    <Button
                        size="sm"
                        onClick={onUploadClick}
                    >
                        Upload Files
                    </Button>
                </RequirePermission>
            )}

            {/* Search Input */}
            <InputGroup className="w-[320px]">
                <InputGroupAddon>
                    <Search className="size-4 text-muted-foreground" />
                </InputGroupAddon>
                <InputGroupInput
                    placeholder="Search..."
                    value={(table.getState().globalFilter as string) ?? ""}
                    onChange={(event) => table.setGlobalFilter(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                    {table.getFilteredRowModel().rows.length} results
                </InputGroupAddon>
            </InputGroup>

            {/* Status Filter */}
            {!hideStatusFilter && (() => {
                const statusColumn = table.getAllColumns().find(c => c.id === "status");
                return statusColumn && statusColumn.getCanFilter() ? (
                    <DataTableFacetedFilter
                        column={statusColumn}
                        title="Status"
                        options={resolvedStatusOptions}
                    />
                ) : null;
            })()}

            {/* Type Filter */}
            {(hasIncidenceData || showTypeFilter) && (() => {
                const typeColumn = table.getAllColumns().find(c => c.id === "type");
                return typeColumn && typeColumn.getCanFilter() ? (
                    <DataTableFacetedFilter
                        column={typeColumn}
                        title="Type"
                        options={incidenceTypeOptions}
                    />
                ) : null;
            })()}

            {/* Custom Filter Items (e.g. Incidences Toggle) */}
            {customFilterItems}

            {(showBranch ?? !hideFilters) && table.getColumn("branch") && (
                <DataTableFacetedFilter
                    column={table.getColumn("branch")}
                    title="Branch"
                    options={branchOptions}
                    matchMode="includes"
                    disabled={isTableEmpty}
                />
            )}

            {(showTime ?? !hideFilters) && table.getColumn("start_time") && (
                <DataTableFacetedFilter
                    column={table.getColumn("start_time")}
                    title="Time"
                    options={timeOptions}
                    matchMode="startsWith"
                    disabled={isTableEmpty}
                />
            )}

            {!hideFilters && (
                <>
                    {/* Overlaps filter */}
                    {overlapCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowOverlapsOnly(!showOverlapsOnly)}
                            className={cn(
                                "h-8 border-dashed border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                            )}
                        >
                            <AlertTriangle />
                            Overlaps
                            {showOverlapsOnly && ` (${overlapCount})`}
                        </Button>
                    )}
                </>
            )}

            {/* Reset Filter */}
            {isFiltered && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        table.resetColumnFilters();
                        table.setGlobalFilter("");
                        setShowOverlapsOnly(false);
                        setShowLiveMode?.(false);
                    }}
                >
                    Reset
                    <X />
                </Button>
            )}
        </div>
    );
}
