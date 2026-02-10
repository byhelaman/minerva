import {
    Avatar,
    AvatarFallback,
    AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/components/auth-provider"

export function UserNav() {
    const { profile, signOut } = useAuth();
    const navigate = useNavigate();

    // Obtener iniciales del nombre o email
    const getInitials = () => {
        if (profile?.display_name) {
            return profile.display_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
        }
        if (profile?.email) {
            return profile.email.slice(0, 2).toUpperCase();
        }
        return "??";
    };

    // Manejar logout
    const handleLogout = async () => {
        await signOut();
        navigate("/login");
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-9 w-9">
                        <AvatarImage src="/avatars/03.png" alt={profile?.display_name || "User"} />
                        <AvatarFallback>{getInitials()}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm leading-none font-medium">
                            {profile?.display_name || "User"}
                        </p>
                        <p className="text-muted-foreground text-xs leading-none">
                            {profile?.email || ""}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                        <Link to="/profile">
                            Profile
                            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link to="/settings">
                            Settings
                            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                {/* <RequirePermission permission="system.manage">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link to="/system">
                            System
                        </Link>
                    </DropdownMenuItem>
                </RequirePermission>
                <RequirePermission permission="reports.view">
                    <DropdownMenuItem asChild>
                        <Link to="/reports">
                            Reports
                        </Link>
                    </DropdownMenuItem>
                </RequirePermission> */}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    Log out
                    <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
