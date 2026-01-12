import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AssignLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AssignLinkModal({ open, onOpenChange }: AssignLinkModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        Automatic Assignment</DialogTitle>
                    <DialogDescription>
                        Review and assign meetings automatically.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 text-center text-muted-foreground text-sm">
                    Automatic Assignment functionality coming soon.
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled>Execute</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
