import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { useAuth } from "@/components/auth-provider"

const navItems = [
    { title: "Home", href: "/" },
    { title: "Docs", href: "/docs" },
    { title: "System", href: "/system", minLevel: 80 },
    { title: "Reports", href: "/reports", permission: "reports.view" },
]

export function MainNav({
    className,
    ...props
}: React.HTMLAttributes<HTMLElement>) {
    const { profile, hasPermission } = useAuth();
    const userLevel = profile?.hierarchy_level ?? 0;

    const visibleItems = navItems.filter((item) => {
        if (item.minLevel && userLevel < item.minLevel) return false;
        if (item.permission && !hasPermission(item.permission)) return false;
        return true;
    });

    return (
        <nav
            className={cn("flex items-center space-x-1", className)}
            {...props}
        >
            {visibleItems.map((item) => (
                <Button
                    key={item.title}
                    variant="ghost"
                    size="sm"
                    className="text-sm font-medium"
                    asChild
                >
                    <Link to={item.href}>
                        {item.title}
                    </Link>
                </Button>
            ))}
        </nav>
    )
}
