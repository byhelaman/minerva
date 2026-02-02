
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Row } from "@tanstack/react-table";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReportRowActionsProps<TData> {
    row: Row<TData>;
}

export function ReportRowActions<TData>({
    row,
}: ReportRowActionsProps<TData>) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const data = row.original as Record<string, any>;

    // Filter internal fields like 'id'
    const displayFields = Object.entries(data).filter(([key]) => key !== 'id');

    const handleCopyAll = () => {
        const values = Object.entries(data)
            .filter(([key]) => key !== 'id')
            .map(([, value]) => value ?? '')
            .join('\t');
        navigator.clipboard.writeText(values);
        toast.success("Copied to clipboard");
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="data-[state=open]:bg-muted size-8 text-foreground"
                    >
                        <MoreHorizontal />
                        <span className="sr-only">Open menu</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-[160px]"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                        View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyAll}>
                        Copy All
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Row Details Modal */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">Row Details</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh] p-2 pr-4">
                        <div className="space-y-4">
                            {displayFields.map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground capitalize">
                                        {key.replace(/_/g, ' ')}
                                    </p>
                                    <p className="text-sm text-foreground">
                                        {value !== null && value !== undefined && value !== ''
                                            ? String(value)
                                            : <span className="text-muted-foreground/50">Empty</span>}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
