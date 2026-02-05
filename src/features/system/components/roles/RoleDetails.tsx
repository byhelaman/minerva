/**
 * Panel derecho que muestra detalles del rol y sus permisos.
 * Para roles personalizados: muestra checkboxes para alternar permisos.
 * Para roles del sistema: muestra badges de permisos de solo lectura.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock, FilePenLine, Trash2, Shield } from "lucide-react";
import { Role, Permission, isSystemRole } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RoleDetailsProps {
    role: Role;
    permissions: Permission[];
    rolePermissions: string[];
    isLoadingPerms: boolean;
    isSavingPerm: string | null;
    canEditPermissions: boolean;
    canModify: boolean;
    onTogglePermission: (permName: string, hasPermission: boolean) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function RoleDetails({
    role,
    permissions,
    rolePermissions,
    isLoadingPerms,
    isSavingPerm,
    canEditPermissions,
    canModify,
    onTogglePermission,
    onEdit,
    onDelete,
}: RoleDetailsProps) {
    return (
        <Card className="shadow-none flex-1 bg-muted/30">
            <CardHeader className="grid grid-rows-1">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-lg">{role.name}</CardTitle>
                            {isSystemRole(role.name) && (
                                <Lock className="size-3.5 text-muted-foreground" />
                            )}
                        </div>
                        <CardDescription>{role.description}</CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                        Level {role.hierarchy_level}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-xs font-medium text-muted-foreground mb-3">
                    PERMISSIONS ({rolePermissions.length})
                </p>
                {isLoadingPerms ? (
                    <div className="flex items-center justify-center py-4 h-[300px]">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                ) : canEditPermissions ? (
                    <ScrollArea>
                        <div className="grid grid-cols-2 gap-1 h-[300px]">
                            {permissions.map((perm) => {
                                const hasPerm = rolePermissions.includes(perm.name);
                                const isSaving = isSavingPerm === perm.name;
                                return (
                                    <div
                                        key={perm.name}
                                        className="flex items-start gap-3 text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-md"
                                        onClick={() => !isSaving && onTogglePermission(perm.name, hasPerm)}
                                    >
                                        <Checkbox
                                            checked={hasPerm}
                                            disabled={isSaving}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <span className="font-mono text-sm">{perm.name}</span>
                                            <p className="text-muted-foreground text-xs">
                                                {perm.description}
                                            </p>
                                        </div>
                                        {isSaving && (
                                            <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                ) : (
                    <ScrollArea>
                        <div className="space-y-2 h-[300px]">
                            {rolePermissions.map((permName) => {
                                const perm = permissions.find(p => p.name === permName);
                                return (
                                    <div key={permName} className="flex items-start gap-2 text-sm">
                                        <Badge variant="outline" className="text-xs shrink-0 font-mono">
                                            {permName}
                                        </Badge>
                                        {perm && (
                                            <span className="text-muted-foreground text-xs pt-0.5">
                                                {perm.description}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                            {rolePermissions.length === 0 && (
                                <p className="text-muted-foreground text-xs italic">
                                    No permissions assigned
                                </p>
                            )}
                        </div>
                    </ScrollArea>

                )}
            </CardContent>
            {canModify && (
                <CardFooter className="gap-2 pt-4 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onEdit}
                    >
                        <FilePenLine />
                        Edit
                    </Button>
                    {!isSystemRole(role.name) && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onDelete}
                            className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive dark:hover:border-destructive/50 dark:focus-visible:ring-destructive/20 dark:focus-visible:border-destructive"
                        >
                            <Trash2 />
                            Delete
                        </Button>
                    )}
                </CardFooter>
            )}
        </Card>
    );
}

/** Placeholder mostrado cuando no hay ningún rol seleccionado */
export function RoleDetailsEmpty() {
    return (
        <Card className="shadow-none flex-1 bg-muted/30">
            <CardContent className="flex items-center justify-center h-full min-h-[300px]">
                <div className="text-center text-muted-foreground">
                    <Shield className="size-12 mx-auto mb-4 opacity-20" />
                    <p className="text-sm">Select a role to view details</p>
                </div>
            </CardContent>
        </Card>
    );
}
