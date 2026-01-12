import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CreateLinkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateLinkModal({ open, onOpenChange }: CreateLinkModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Zoom Link</DialogTitle>
                    <DialogDescription>
                        Paste program names (one per line).
                    </DialogDescription>
                </DialogHeader>
                <div className="py-6 text-center text-muted-foreground text-sm">
                    Create Zoom Link functionality coming soon.
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled>Verify</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
