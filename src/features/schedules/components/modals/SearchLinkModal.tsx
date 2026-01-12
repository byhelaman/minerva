import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SearchLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SearchLinkModal({ open, onOpenChange }: SearchLinkModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Search Meetings</DialogTitle>
                    <DialogDescription>
                        Search for existing meetings.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 text-center text-muted-foreground text-sm">
                    Search functionality coming soon.
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
