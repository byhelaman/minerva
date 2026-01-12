import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function DocsPage() {
    const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)]">
            <div className="flex flex-col py-8 my-4 gap-1 flex-none">
                <h1 className="text-xl font-bold tracking-tight">Documentation</h1>
                <p className="text-muted-foreground">Learn how to use Minerva v2 effectively.</p>
            </div>

            <div className="grid gap-8 md:grid-cols-[200px_1fr] h-full overflow-hidden">
                <aside className="hidden md:flex flex-col gap-2 flex-none">
                    <nav className="grid gap-2.5 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                        <a
                            href="#introduction"
                            onClick={(e) => handleScrollTo(e, 'introduction')}
                            className="text-sm font-medium hover:underline text-foreground"
                        >
                            Introduction
                        </a>
                        <a
                            href="#getting-started"
                            onClick={(e) => handleScrollTo(e, 'getting-started')}
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Getting Started
                        </a>
                        <a
                            href="#schedules"
                            onClick={(e) => handleScrollTo(e, 'schedules')}
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Managing Schedules
                        </a>
                        <a
                            href="#settings"
                            onClick={(e) => handleScrollTo(e, 'settings')}
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Settings
                        </a>
                        <a
                            href="#troubleshooting"
                            onClick={(e) => handleScrollTo(e, 'troubleshooting')}
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Troubleshooting
                        </a>
                    </nav>
                </aside>

                <div className="h-full overflow-y-auto pr-6 scroll-smooth">
                    <div className="space-y-10 pb-20">
                        {/* Introduction */}
                        <section id="introduction" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Introduction</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Minerva v2 is a powerful schedule management tool designed to help you organize, resolve conflicts, and export schedule data efficiently.
                                    Built with modern web technologies, it offers a seamless experience for managing complex scheduling needs.
                                </p>
                            </div>
                        </section>

                        <Separator />

                        {/* Getting Started */}
                        <section id="getting-started" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Getting Started</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    To get started with Minerva, you'll primarily be working with the Dashboard. Here is a quick overview of the main concepts:
                                </p>
                                <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm font-medium">Schedules</CardTitle>
                                            <CardDescription className="text-xs text-muted-foreground">
                                                Individual entries representing a class, meeting, or event. These contain time, location, and assignee information.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>

                                        </CardContent>
                                    </Card>
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm font-medium">Conflicts</CardTitle>
                                            <CardDescription className="text-xs text-muted-foreground">
                                                When two schedules overlap in time and location or assignee. Minerva automatically detects these for you.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>

                                        </CardContent>
                                    </Card>
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm font-medium">Settings</CardTitle>
                                            <CardDescription className="text-xs text-muted-foreground">
                                                Configure your Minerva settings to customize your experience.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>

                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* Managing Schedules */}
                        <section id="schedules" className="space-y-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <h2 className="text-lg font-semibold tracking-tight">Managing Schedules</h2>
                                    <Badge variant="secondary">Core Feature</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    The Home page is where you view and manipulate your schedule data.
                                </p>

                                <h3 className="text-sm font-semibold mb-2">Importing Data</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Click the "Upload Files" button to import Excel files. Supported formats include .xlsx and .xls.
                                    Ensure your columns match the expected format (Date, Time, Location, etc.).
                                </p>

                                <h3 className="text-sm font-semibold mb-2">Auto Assign</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Use the "Auto Assign" feature to automatically distribute unassigned schedules to available slots or personnel based on predefined rules.
                                </p>
                            </div>
                        </section>

                        <Separator />

                        {/* Settings */}
                        <section id="settings" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Settings</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Customize your experience in the Settings page.
                                </p>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
                                    <li><strong>Appearance:</strong> Toggle between Light, Dark, or System theme.</li>
                                    <li><strong>Export Path:</strong> Choose where your schedule exports are saved by default.</li>
                                    <li><strong>Auto Save:</strong> Enable or disable automatic saving of your work to local storage.</li>
                                    <li><strong>Clear Cache:</strong> Reset the application state if you encounter issues.</li>
                                </ul>
                            </div>
                        </section>

                        <Separator />

                        {/* Troubleshooting */}
                        <section id="troubleshooting" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Troubleshooting</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    If you run into issues, try the following:
                                </p>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2 mt-2">
                                    <li>Check your internet connection if features rely on external APIs.</li>
                                    <li>Use "Clear Cache" in Settings to reset local data.</li>
                                    <li>Ensure your input Excel files are not corrupted and follow the correct format.</li>
                                </ul>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
