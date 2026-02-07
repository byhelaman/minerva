import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, Bug, UserPlus, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, type Locale } from "date-fns";
import { es, enUS, fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";

// — Tipos —

type ActivityType = "schedule_published" | "bug_report" | "user_joined";

interface ActivityItem {
    id: string;
    type: ActivityType;
    description: string;
    actor: string;
    timestamp: string;
}

const DATE_LOCALES: Record<string, Locale> = { es, en: enUS, fr };

const ACTIVITY_ICONS: Record<ActivityType, typeof CalendarCheck> = {
    schedule_published: CalendarCheck,
    bug_report: Bug,
    user_joined: UserPlus,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
    schedule_published: "text-blue-500",
    bug_report: "text-amber-500",
    user_joined: "text-emerald-500",
};

const LIMIT = 15;

// — Helpers —

/** Obtiene display_name de perfiles para un conjunto de UUIDs */
async function fetchProfileNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;

    const unique = [...new Set(ids)];
    const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", unique);

    if (data) {
        for (const p of data) {
            map.set(p.id, p.display_name ?? p.email);
        }
    }
    return map;
}

// — Componente —

export function ActivityLog() {
    const { i18n } = useTranslation();
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchActivity = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);

        try {
            // 1. Consultar las 3 fuentes en paralelo
            const [schedulesRes, bugsRes, usersRes] = await Promise.all([
                supabase
                    .from("published_schedules")
                    .select("id, schedule_date, entries_count, created_at, published_by")
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),

                supabase
                    .from("bug_reports")
                    .select("id, title, status, created_at, user_id")
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),

                supabase
                    .from("profiles")
                    .select("id, display_name, email, created_at")
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),
            ]);

            // 2. Recopilar IDs de usuario para obtener nombres
            const userIds: string[] = [];
            if (schedulesRes.data) {
                for (const r of schedulesRes.data) {
                    if (r.published_by) userIds.push(r.published_by);
                }
            }
            if (bugsRes.data) {
                for (const r of bugsRes.data) {
                    if (r.user_id) userIds.push(r.user_id);
                }
            }

            const names = await fetchProfileNames(userIds);

            // 3. Construir la lista unificada
            const activities: ActivityItem[] = [];

            if (schedulesRes.data) {
                for (const row of schedulesRes.data) {
                    activities.push({
                        id: `sched-${row.id}`,
                        type: "schedule_published",
                        description: `Published schedule for ${row.schedule_date} (${row.entries_count ?? 0} entries)`,
                        actor: row.published_by ? (names.get(row.published_by) ?? "Unknown") : "System",
                        timestamp: row.created_at,
                    });
                }
            }

            if (bugsRes.data) {
                for (const row of bugsRes.data) {
                    activities.push({
                        id: `bug-${row.id}`,
                        type: "bug_report",
                        description: `Bug report: ${row.title} [${row.status}]`,
                        actor: row.user_id ? (names.get(row.user_id) ?? "Unknown") : "Anonymous",
                        timestamp: row.created_at,
                    });
                }
            }

            if (usersRes.data) {
                for (const row of usersRes.data) {
                    activities.push({
                        id: `user-${row.id}`,
                        type: "user_joined",
                        description: "New user registered",
                        actor: row.display_name ?? row.email,
                        timestamp: row.created_at,
                    });
                }
            }

            // 4. Ordenar por fecha descendente y limitar
            activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setItems(activities.slice(0, LIMIT));
        } catch (err) {
            console.error("Failed to fetch activity log:", err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchActivity();
    }, [fetchActivity]);

    const locale = DATE_LOCALES[i18n.language] ?? enUS;

    return (
        <Card className="shadow-none">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            Recent Activity
                        </CardTitle>
                        <CardDescription>
                            System events and audit log.
                        </CardDescription>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => fetchActivity(true)}
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <Skeleton className="size-8 rounded-full shrink-0" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-3.5 w-3/4" />
                                    <Skeleton className="h-3 w-1/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                        No recent activity.
                    </div>
                ) : (
                    <ScrollArea className="h-[320px] -mr-3 pr-3">
                        <div className="space-y-1">
                            {items.map((item) => {
                                const Icon = ACTIVITY_ICONS[item.type];
                                const color = ACTIVITY_COLORS[item.type];
                                const timeAgo = formatDistanceToNow(new Date(item.timestamp), {
                                    addSuffix: true,
                                    locale,
                                });

                                return (
                                    <div
                                        key={item.id}
                                        className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ${color}`}>
                                            <Icon className="size-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm leading-snug truncate">
                                                {item.description}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {item.actor} · {timeAgo}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}
