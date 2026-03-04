import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManageUsersModal } from "./ManageUsersModal";
import { ManageRolesModal } from "./ManageRolesModal";
import { Check, Loader2 } from "lucide-react";
import { RequirePermission } from "@/components/RequirePermission";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { ZoomIntegration } from "@/features/system/components/ZoomIntegration";
import { Label } from "@/components/ui/label";
import { ActivityLog } from "./ActivityLog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatDateForDisplay } from "@/lib/date-utils";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { PublishedSchedule } from "@/features/schedules/types";
import { toast } from "sonner";


export function SystemPage() {
    const { isAdmin } = useAuth();
    const [isManageUsersOpen, setIsManageUsersOpen] = useState(false);
    const [isManageRolesOpen, setIsManageRolesOpen] = useState(false);
    const [userCount, setUserCount] = useState<number | null>(null);
    const [isLoadingCount, setIsLoadingCount] = useState(false);
    const [isPublishedDialogOpen, setIsPublishedDialogOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [publishedVersions, setPublishedVersions] = useState<PublishedSchedule[]>([]);
    const [selectedPublished, setSelectedPublished] = useState<PublishedSchedule | null>(null);
    const [isLoadingPublished, setIsLoadingPublished] = useState(false);
    const [isDeletingPublished, setIsDeletingPublished] = useState(false);
    const { getCloudVersions, deletePublishedScheduleByDate } = useScheduleSyncStore();

    // Obtener conteo de usuarios al montar (solo para admins)
    useEffect(() => {
        if (isAdmin()) {
            fetchUserCount();
        }
    }, []);

    const fetchUserCount = async () => {
        setIsLoadingCount(true);
        try {
            const { data, error } = await supabase.rpc('get_user_count');
            if (!error && data !== null) {
                setUserCount(data);
            }
        } catch (err) {
            console.error('Error fetching user count:', err);
        } finally {
            setIsLoadingCount(false);
        }
    };

    // Refrescar conteo cuando el modal cierra
    const handleUsersModalChange = (open: boolean) => {
        setIsManageUsersOpen(open);
        if (!open && isAdmin()) {
            fetchUserCount();
        }
    };

    const loadPublishedVersions = async () => {
        setIsLoadingPublished(true);
        try {
            const { data, error } = await getCloudVersions();
            if (error) throw new Error(error);
            setPublishedVersions(data);
            setSelectedPublished((current) => {
                if (!current) return data[0] ?? null;
                return data.find((v) => v.id === current.id) ?? data[0] ?? null;
            });
        } catch (error) {
            console.error('Error loading published schedules:', error);
            toast.error('Failed to load published schedules');
        } finally {
            setIsLoadingPublished(false);
        }
    };

    const openPublishedDialog = async () => {
        setIsPublishedDialogOpen(true);
        await loadPublishedVersions();
    };

    const handleDeletePublishedDate = async () => {
        if (!selectedPublished) return;
        setIsDeletingPublished(true);
        try {
            const { success, error } = await deletePublishedScheduleByDate(selectedPublished.schedule_date);
            if (!success) throw new Error(error || 'Failed to delete published schedule');

            toast.success(`Deleted published schedule for ${formatDateForDisplay(selectedPublished.schedule_date)}`);
            setIsDeleteConfirmOpen(false);
            await loadPublishedVersions();
        } catch (error) {
            console.error('Error deleting published schedule:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to delete published schedule');
        } finally {
            setIsDeletingPublished(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">System Administration</h1>
                <p className="text-muted-foreground text-sm">Manage users, roles, and system configuration.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 flex-1 overflow-auto min-h-0 pb-6 pr-4">
                {/* Left Column */}
                <div className="space-y-6">
                    {/* User Management */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>User Management</CardTitle>
                            <CardDescription>
                                View and manage user accounts and their roles.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <p className="font-medium text-sm">Total Users</p>
                                    <p className="text-2xl font-semibold h-8 flex items-center">
                                        {isLoadingCount ? (
                                            <Loader2 className="size-5 animate-spin" />
                                        ) : userCount !== null ? (
                                            userCount
                                        ) : (
                                            "--"
                                        )}
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleUsersModalChange(true)}>
                                    Manage Users
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Role & Permissions */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle>Roles & Permissions</CardTitle>
                            <CardDescription>
                                Configure role hierarchies and permission assignments.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <Label>Role Management</Label>
                                    <p className="text-xs text-muted-foreground">
                                        View and configure roles and their permissions.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setIsManageRolesOpen(true)}>
                                    Manage Roles
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <RequirePermission permission="schedules.manage">
                        <Card className="shadow-none">
                            <CardHeader>
                                <CardTitle>Published Schedules</CardTitle>
                                <CardDescription>
                                    Delete a specific published date before republishing that day.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="font-medium text-sm">Date Cleanup</p>
                                        <p className="text-xs text-muted-foreground">
                                            Removes the selected published date from cloud history.
                                        </p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={openPublishedDialog}>
                                        Manage Date
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </RequirePermission>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Database Status */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Database Status
                            </CardTitle>
                            <CardDescription>
                                Supabase connection and database health.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-green-500" />
                                <span className="text-sm font-medium">Connected</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Provider</span>
                                    <p className="font-medium">Supabase</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Region</span>
                                    <p className="font-medium">--</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <RequirePermission level={100}>
                        <ZoomIntegration />
                    </RequirePermission>

                    <ActivityLog />
                </div>
            </div>

            {/* Manage Users Modal */}
            <ManageUsersModal
                open={isManageUsersOpen}
                onOpenChange={handleUsersModalChange}
            />

            {/* Manage Roles Modal */}
            <ManageRolesModal
                open={isManageRolesOpen}
                onOpenChange={setIsManageRolesOpen}
            />

            <Dialog open={isPublishedDialogOpen} onOpenChange={setIsPublishedDialogOpen}>
                <DialogContent className="sm:max-w-md gap-6">
                    <DialogHeader>
                        <DialogTitle>Select Published Date</DialogTitle>
                        <DialogDescription>
                            Choose one date to delete before publishing a replacement schedule.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingPublished ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : publishedVersions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No published schedules found.</div>
                    ) : (
                        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto py-1 pr-1">
                            {publishedVersions.map((version) => (
                                <button
                                    key={version.id}
                                    onClick={() => setSelectedPublished(version)}
                                    className={cn(
                                        "flex items-center justify-between rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
                                        selectedPublished?.id === version.id
                                            ? "border-primary bg-primary/5"
                                            : "border-border hover:bg-muted/50"
                                    )}
                                >
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-medium">{formatDateForDisplay(version.schedule_date)}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {version.entries_count} entries · updated {new Date(version.updated_at).toLocaleString()}
                                        </span>
                                    </div>
                                    {selectedPublished?.id === version.id && (
                                        <Check className="h-4 w-4 text-primary shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPublishedDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={!selectedPublished || isLoadingPublished || isDeletingPublished}
                            onClick={() => setIsDeleteConfirmOpen(true)}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <AlertDialogContent className="sm:max-w-100!">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete published date?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedPublished
                                ? `This will delete all entries and the published record for ${formatDateForDisplay(selectedPublished.schedule_date)}. This action cannot be undone.`
                                : 'This action cannot be undone.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingPublished}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePublishedDate} disabled={isDeletingPublished}>
                            {isDeletingPublished ? <Loader2 className="animate-spin" /> : null}
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
