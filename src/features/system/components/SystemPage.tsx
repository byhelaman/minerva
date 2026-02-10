import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManageUsersModal } from "./ManageUsersModal";
import { ManageRolesModal } from "./ManageRolesModal";
import { Loader2 } from "lucide-react";
import { RequirePermission } from "@/components/RequirePermission";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { ZoomIntegration } from "@/features/system/components/ZoomIntegration";
import { MicrosoftIntegration } from "@/features/system/components/MicrosoftIntegration";
import { Label } from "@/components/ui/label";
import { ActivityLog } from "./ActivityLog";


export function SystemPage() {
    const { isAdmin } = useAuth();
    const [isManageUsersOpen, setIsManageUsersOpen] = useState(false);
    const [isManageRolesOpen, setIsManageRolesOpen] = useState(false);
    const [userCount, setUserCount] = useState<number | null>(null);
    const [isLoadingCount, setIsLoadingCount] = useState(false);

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

                    <RequirePermission level={100}>
                        <MicrosoftIntegration />
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
        </div>
    );
}
