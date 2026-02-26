import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface DataTableFloatingBarProps {
    selectedCount: number;
    onCopy?: () => void;
    onCopyAsTable?: () => void;
    onCopyAsExcel?: () => void;
    onDelete?: () => void;
    onClearSelection: () => void;
}

export function DataTableFloatingBar({
    selectedCount,
    onCopy,
    onCopyAsTable,
    onCopyAsExcel,
    onDelete,
    onClearSelection,
}: DataTableFloatingBarProps) {
    if (selectedCount === 0 || (!onCopy && !onCopyAsTable && !onCopyAsExcel && !onDelete)) return null;

    const hasCopyOptions = onCopy && (onCopyAsTable || onCopyAsExcel);

    return (
        <div className="sticky bottom-4 z-10 mx-auto w-fit flex items-center gap-2 rounded-lg border bg-background px-4 py-2 pr-3 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
                {selectedCount} selected
            </span>

            <Separator orientation="vertical" className="h-4! ml-2" />

            {hasCopyOptions ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                            <Copy />
                            Copy
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" side="top">
                        <DropdownMenuItem onSelect={onCopy}>
                            Simple text
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onCopyAsTable}>
                            Table format
                        </DropdownMenuItem>
                        {onCopyAsExcel && (
                            <DropdownMenuItem onSelect={onCopyAsExcel}>
                                To Excel
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : onCopy && (
                <Button variant="ghost" size="sm" onClick={onCopy}>
                    <Copy />
                    Copy
                </Button>
            )}

            {onDelete && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onDelete}
                >
                    <Trash2 />
                    Delete
                </Button>
            )}

            <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClearSelection}
                className="text-muted-foreground"
            >
                <X />
                <span className="sr-only">Clear selection</span>
            </Button>
        </div>
    );
}
