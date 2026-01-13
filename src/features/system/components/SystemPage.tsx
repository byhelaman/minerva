import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManageUsersModal } from "./ManageUsersModal";
import { ManageRolesModal } from "./ManageRolesModal";
import { Link2, Loader2 } from "lucide-react";
import { RequirePermission } from "@/components/RequirePermission";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export function SystemPage() {
    const { t } = useTranslation();
    const { isAdmin } = useAuth();
    const [isManageUsersOpen, setIsManageUsersOpen] = useState(false);
    const [isManageRolesOpen, setIsManageRolesOpen] = useState(false);
    const [userCount, setUserCount] = useState<number | null>(null);
    const [isLoadingCount, setIsLoadingCount] = useState(false);

    // Fetch user count on mount (only for admins)
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

    // Refresh count when modal closes
    const handleUsersModalChange = (open: boolean) => {
        setIsManageUsersOpen(open);
        if (!open && isAdmin()) {
            fetchUserCount();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col py-8 my-4 gap-1">
                <h1 className="text-xl font-bold tracking-tight">System Administration</h1>
                <p className="text-muted-foreground">Manage users, roles, and system configuration.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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
                                    <p className="text-2xl font-semibold">
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
                                <div className="space-y-0.5">
                                    <p className="font-medium text-sm">Role Management</p>
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

                    {/* Zoom Integration - Super Admin only */}
                    <RequirePermission level={100}>
                        <Card className="shadow-none">
                            <CardHeader>
                                <CardTitle>{t("profile.zoom.title")}</CardTitle>
                                <CardDescription>
                                    {t("profile.zoom.desc")}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between gap-6 flex-wrap">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-gray-300" />
                                            <span className="font-medium text-sm">
                                                {t("profile.zoom.not_connected")}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {t("profile.zoom.no_account_linked")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline">
                                            <Link2 />
                                            {t("profile.zoom.connect_button")}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </RequirePermission>

                    {/* System Activity */}
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Recent Activity
                            </CardTitle>
                            <CardDescription>
                                System events and audit log.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground text-center py-8">
                                Activity log coming soon...
                            </div>
                        </CardContent>
                    </Card>
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
