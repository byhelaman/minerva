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
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/components/auth-provider"
import { useTheme } from "@/components/theme-provider"
import { useSettings } from "@/components/settings-provider"
import { LogOut, Settings2, Check, SwatchBook, Plus } from "lucide-react"

export function UserNav() {
    const { profile, signOut } = useAuth();
    const { theme, setTheme } = useTheme();
    const { updateSetting } = useSettings();
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
            <DropdownMenuContent className="w-40" align="end" forceMount>
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
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <SwatchBook />
                        Theme
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onSelect={() => { setTheme("light"); updateSetting("theme", "light"); }}>
                            <Check
                                className={
                                    theme === "light" ? "opacity-100" : "opacity-0"
                                }
                            />
                            Light
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { setTheme("dark"); updateSetting("theme", "dark"); }}>
                            <Check
                                className={
                                    theme === "dark" ? "opacity-100" : "opacity-0"
                                }
                            />
                            Dark
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { setTheme("system"); updateSetting("theme", "system"); }}>

                            <Check
                                className={
                                    theme === "system" ? "opacity-100" : "opacity-0"
                                }
                            />
                            System
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuGroup>
                    {/* <DropdownMenuItem asChild>
                        <Link to="/profile">
                            Profile
                            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                        </Link>
                    </DropdownMenuItem> */}
                    <DropdownMenuItem asChild>
                        <Link to="/settings">
                            <Settings2 />
                            Settings
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                    <Plus />
                    Add Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
