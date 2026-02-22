/**
 * Componente del panel izquierdo que muestra la lista de roles disponibles.
 * Resalta los roles del sistema con un ícono de escudo.
 */
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { Role, isSystemRole } from "./types";
import { cn } from "@/lib/utils";

interface RolesListProps {
    roles: Role[];
    selectedRole: string | null;
    onSelectRole: (roleName: string) => void;
}

export function RolesList({ roles, selectedRole, onSelectRole }: RolesListProps) {
    return (
        <div className="flex w-45 shrink-0 flex-col gap-1 p-1">
            <ScrollArea className="overflow-auto pr-3">
                <div className="space-y-1.5 p-1">
                    {roles.map((role) => (
                        <Button
                            key={role.name}
                            variant={selectedRole === role.name ? "secondary" : "ghost"}
                            onClick={() => onSelectRole(role.name)}
                            className={cn(
                                "w-full justify-start h-auto",
                                selectedRole === role.name && "bg-accent text-accent-foreground"
                            )}
                        >
                            <div className="flex items-center gap-2 min-w-0 w-full">
                                {isSystemRole(role.name) ? (
                                    <Shield className="size-4 text-muted-foreground" />
                                ) : (
                                    <div className="size-4" />
                                )}
                                <div className="min-w-0 flex flex-col items-start gap-0.5">
                                    <span className="font-medium text-sm truncate">{role.name}</span>
                                    <span className="text-xs text-muted-foreground font-normal">Level {role.hierarchy_level}</span>
                                </div>
                            </div>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
