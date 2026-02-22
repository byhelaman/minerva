import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTab } from "./tabs/AccountTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { PreferencesTab } from "./tabs/PreferencesTab";
import { ScrollArea } from "@/components/ui/scroll-area";


interface SettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden gap-6">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Make changes to your profile here. Click save when you&apos;re
                        done.
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="account" className="flex-1 min-h-0">
                    <TabsList>
                        <TabsTrigger value="account">Account</TabsTrigger>
                        <TabsTrigger value="preferences">Preferences</TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                    </TabsList>
                    <ScrollArea className="overflow-y-auto px-2 py-4 min-h-100">
                        <TabsContent value="account">
                            <AccountTab onClose={() => onOpenChange(false)} />
                        </TabsContent>
                        <TabsContent value="preferences">
                            <PreferencesTab />
                        </TabsContent>
                        <TabsContent value="security">
                            <SecurityTab />
                        </TabsContent>
                    </ScrollArea>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
