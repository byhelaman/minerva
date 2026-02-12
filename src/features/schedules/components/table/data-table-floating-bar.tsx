import { Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface DataTableFloatingBarProps {
    selectedCount: number;
    onCopy?: () => void;
    onDelete?: () => void;
    onClearSelection: () => void;
}

export function DataTableFloatingBar({
    selectedCount,
    onCopy,
    onDelete,
    onClearSelection,
}: DataTableFloatingBarProps) {
    if (selectedCount === 0 || (!onCopy && !onDelete)) return null;

    return (
        <div className="sticky bottom-4 z-10 mx-auto w-fit flex items-center gap-2 rounded-lg border bg-background px-4 py-2 pr-3 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
                {selectedCount} selected
            </span>

            <Separator orientation="vertical" className="h-4! ml-2" />

            {onCopy && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCopy}
                >
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
