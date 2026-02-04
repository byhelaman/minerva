import { type Table } from "@tanstack/react-table";
import { Loader2, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableViewOptions } from "./data-table-view-options";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/RequirePermission";
import { ToolbarFilters } from "./toolbar/ToolbarFilters";
import { ToolbarActions } from "./toolbar/ToolbarActions";

interface DataTableToolbarProps<TData> {
    table: Table<TData>;
    showOverlapsOnly: boolean;
    setShowOverlapsOnly: (show: boolean) => void;
    overlapCount: number;
    onClearSchedule?: () => void;
    onUploadClick?: () => void;
    onRefresh?: () => void;
    fullData: TData[];
    hideFilters?: boolean;
    hideUpload?: boolean;
    hideActions?: boolean;
    disableRefresh?: boolean;
    statusOptions?: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }[];
    showLiveMode?: boolean;
    setShowLiveMode?: (show: boolean) => void;
    isLiveLoading?: boolean;
    activeMeetingsCount?: number;
    onPublish?: () => void;
    isPublishing?: boolean;
    canPublish?: boolean;
    showTypeFilter?: boolean;
    hideStatusFilter?: boolean;
    customActionItems?: React.ReactNode;
    hideDefaultActions?: boolean;
    showBranch?: boolean;
    showTime?: boolean;
    customFilterItems?: React.ReactNode;
}

export function DataTableToolbar<TData>({
    table,
    showOverlapsOnly,
    setShowOverlapsOnly,
    overlapCount,
    onClearSchedule,
    onUploadClick,
    onRefresh,
    fullData,
    hideFilters = false,
    hideUpload = false,
    hideActions = false,
    disableRefresh = false,
    statusOptions,
    showLiveMode = false,
    setShowLiveMode,
    isLiveLoading = false,
    activeMeetingsCount = 0,
    onPublish,
    isPublishing = false,
    canPublish = false,
    showTypeFilter = false,
    hideStatusFilter = false,
    customActionItems,
    hideDefaultActions = false,
    showBranch,
    showTime,
    customFilterItems,
}: DataTableToolbarProps<TData>) {

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 w-full">

                {/* Left Side: Filters & Upload */}
                <ToolbarFilters
                    table={table}
                    fullData={fullData}
                    showOverlapsOnly={showOverlapsOnly}
                    setShowOverlapsOnly={setShowOverlapsOnly}
                    overlapCount={overlapCount}
                    hideFilters={hideFilters}
                    hideUpload={hideUpload}
                    onUploadClick={onUploadClick}
                    showTypeFilter={showTypeFilter}
                    hideStatusFilter={hideStatusFilter}
                    statusOptions={statusOptions}
                    setShowLiveMode={setShowLiveMode}
                    showBranch={showBranch}
                    showTime={showTime}
                    customFilterItems={customFilterItems}
                />

                <div className="flex items-center gap-2">
                    {/* Live Mode Toggle */}
                    {setShowLiveMode && (
                        <RequirePermission permission="meetings.search">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowLiveMode(!showLiveMode)}
                                disabled={isLiveLoading || !fullData || fullData.length === 0}
                                className={cn(
                                    "h-8 border-dashed",
                                    showLiveMode &&
                                    "border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-600 hover:border-green-500/50 dark:border-green-500/50 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 dark:hover:text-green-400"
                                )}
                            >
                                {isLiveLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Radio className={cn("h-4 w-4", showLiveMode && "animate-pulse")} />
                                )}
                                {showLiveMode && activeMeetingsCount > 0 ? `Live (${activeMeetingsCount})` : "Live"}
                            </Button>
                        </RequirePermission>
                    )}

                    <DataTableViewOptions table={table} />

                    {onRefresh && (
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={onRefresh}
                            disabled={disableRefresh}
                        >
                            <RefreshCw />
                        </Button>
                    )}

                    {/* Right Side: Actions (Export, Save, etc) */}
                    {!hideActions && (
                        <ToolbarActions
                            table={table}
                            fullData={fullData}
                            onClearSchedule={onClearSchedule}
                            onPublish={onPublish}
                            isPublishing={isPublishing}
                            canPublish={canPublish}
                            customActionItems={customActionItems}
                            hideDefaultActions={hideDefaultActions}
                        />
                    )}
                </div>
            </div>
        </div >
    );
}
