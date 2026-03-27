import { Bell, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScheduleSyncStore } from "@/features/schedules/stores/useScheduleSyncStore";
import { useSettings } from "@/components/settings-provider";

export function NotificationBell() {
    const { notifications, markAllRead, dismissNotification } = useScheduleSyncStore();
    const { settings } = useSettings();

    if (!settings.realtimeNotifications) return null;

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <DropdownMenu onOpenChange={(open) => { if (open) markAllRead(); }}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No notifications
                    </div>
                ) : (
                    notifications.map((n) => (
                        <DropdownMenuItem key={n.id} className="flex items-start gap-3 py-3 cursor-default">
                            <div className="flex-1 min-w-0 space-y-0.5">
                                <p className={`text-sm leading-snug ${!n.read ? "font-medium" : ""}`}>
                                    New schedule published
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {n.schedule_date} · {n.entries_count} entries
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(n.received_at), { addSuffix: true, locale: enUS })}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                {!n.read && (
                                    <span className="h-2 w-2 rounded-full bg-primary" />
                                )}
                                <button
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Dismiss notification"
                                    onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
