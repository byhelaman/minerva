import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"

import { ArrowUpRight } from "lucide-react"

const navItems = [
    { title: "Home", href: "/" },
    { title: "Docs", href: "/docs" },
    { title: "Buy me a coffee", href: "https://www.buymeacoffee.com/byhelaman", target: "_blank", icon: ArrowUpRight },
]

export function MainNav({
    className,
    ...props
}: React.HTMLAttributes<HTMLElement>) {
    return (
        <nav
            className={cn("flex items-center space-x-1", className)}
            {...props}
        >
            {navItems.map((item) => (
                <Button
                    key={item.title}
                    variant="ghost"
                    size="sm"
                    className="text-sm font-medium"
                    asChild
                >
                    <Link to={item.href} target={item.target}>
                        {item.title}
                        {item.icon && <item.icon />}
                    </Link>
                </Button>
            ))}
        </nav>
    )
}
