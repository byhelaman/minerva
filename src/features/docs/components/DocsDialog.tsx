import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Lightbulb, AlertTriangle, Info, EllipsisIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const SECTIONS = [
    { id: 'introduction', label: 'Introduction' },
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'account', label: 'Account & Security' },
    { id: 'schedules', label: 'Managing Schedules' },
    { id: 'import-export', label: 'Import & Export' },
    { id: 'conflicts', label: 'Conflict Detection' },
    { id: 'settings', label: 'Settings' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
    { id: 'faq', label: 'FAQ' },
    { id: 'support', label: 'Contact & Support' },
];

export function DocsDialog({ children, open, onOpenChange }: { children?: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) {
    const [activeSection, setActiveSection] = useState('introduction');
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        let observer: IntersectionObserver | null = null;

        const timeout = setTimeout(() => {
            const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
            if (!viewport) return;

            observer = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting) {
                            setActiveSection(entry.target.id);
                        }
                    }
                },
                { root: viewport, rootMargin: "-10% 0px -80% 0px" }
            );

            SECTIONS.forEach(({ id }) => {
                const el = document.getElementById(id);
                if (el) observer!.observe(el);
            });
        }, 100);

        return () => {
            clearTimeout(timeout);
            observer?.disconnect();
        };
    }, [open]);

    const handleScrollTo = (e: React.MouseEvent<HTMLElement>, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {children && (
                <DialogTrigger asChild>
                    {children}
                </DialogTrigger>
            )}
            <DialogContent className="max-w-5xl! flex max-h-[85vh] flex-col gap-6">
                <DialogHeader>
                    <DialogTitle>Documentation</DialogTitle>
                    <DialogDescription>
                        Find help and information about using Minerva v2.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 gap-4 border-t py-2">
                    <aside className="flex w-45 shrink-0 flex-col gap-1 p-1 pt-6">
                        <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">Sections</h3>
                        <nav className="grid gap-1">
                            {SECTIONS.map((item) => (
                                <Button
                                    key={item.id}
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleScrollTo(e, item.id)}
                                    className={`h-8 text-[0.8rem] w-fit justify-start ${activeSection === item.id
                                        ? 'bg-secondary'
                                        : 'bg-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {item.label}
                                </Button>
                            ))}
                        </nav>
                    </aside>
                    <div ref={scrollAreaRef} className="min-h-0 flex-1">
                        <ScrollArea className="h-full">
                            <div className="px-10">
                                <div className="space-y-5 pb-5">
                                    {/* Introduction */}
                                    <section id="introduction" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Introduction</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Welcome to <strong>Minerva v2</strong>, a schedule management application designed to help you
                                            organize, view, and export your scheduling data efficiently.
                                        </p>
                                        <Card className="shadow-none">
                                            <CardHeader>
                                                <CardTitle className="text-sm">✨ What can you do with Minerva?</CardTitle>
                                                <CardDescription>Key features available to manage your schedules.</CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <ul className="grid gap-2 text-sm text-muted-foreground">
                                                    <li className="flex items-center gap-2">
                                                        <Badge variant="secondary">Import</Badge>
                                                        Upload schedule data from Excel files
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Badge variant="secondary">Filter</Badge>
                                                        View and filter by date, time, branch, or instructor
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Badge variant="secondary">Detect</Badge>
                                                        Automatically identify scheduling conflicts
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Badge variant="secondary">Export</Badge>
                                                        Download data to Excel for reporting
                                                    </li>
                                                    <li className="flex items-center gap-2">
                                                        <Badge variant="secondary">Save</Badge>
                                                        Auto-save your work to prevent data loss
                                                    </li>
                                                </ul>
                                            </CardContent>
                                        </Card>
                                    </section>

                                    {/* Getting Started */}
                                    <section id="getting-started" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Getting Started</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Follow these steps to begin using Minerva:
                                        </p>
                                        <div className="grid gap-4">
                                            {[
                                                {
                                                    n: 1,
                                                    title: "Create an account or sign in",
                                                    desc: "If you're new, click \"Sign up\" on the login page. You'll receive a 6-digit verification code via email. Enter this code to activate your account."
                                                },
                                                {
                                                    n: 2,
                                                    title: "Access the Dashboard",
                                                    desc: "Once logged in, you'll land on the Management dashboard — your central hub for viewing and managing schedules."
                                                },
                                                {
                                                    n: 3,
                                                    title: "Upload your first file",
                                                    desc: "Click \"Upload Files\" to import your Excel schedule data. You can drag and drop files or browse to select them."
                                                },
                                                {
                                                    n: 4,
                                                    title: "Explore and manage",
                                                    desc: "Use the filters, search, and actions menu to work with your data. Export when ready."
                                                },
                                            ].map(({ n, title, desc }) => (
                                                <div key={n} className="flex gap-4">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-medium">
                                                        {n}
                                                    </div>
                                                    <div className="grid gap-1">
                                                        <p className="text-sm font-medium">{title}</p>
                                                        <p className="text-sm text-muted-foreground">{desc}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    {/* Account & Security */}
                                    <section id="account" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Account & Security</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Your account settings are accessible from <strong>Settings → Account</strong> and <strong>Settings → Security</strong>,
                                            opened via the user menu in the top-right corner.
                                        </p>
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold">Creating an Account</h3>
                                                    <Badge variant="outline">New Users</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Click "Sign up" on the login page and enter your email and a password (minimum 8 characters).
                                                    Check your email for a 6-digit verification code and enter it to complete registration.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Updating Your Display Name</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Open <strong>Settings → Account</strong>. Enter your new display name (2–30 characters) and click Save.
                                                    This name appears across the application.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Changing Your Password</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Go to <strong>Settings → Security</strong>. Enter your current password, then your new password
                                                    (minimum 8 characters), confirm it, and click Update Password.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold">Forgot Your Password?</h3>
                                                    <Badge variant="outline">Recovery</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Click "Forgot your password?" on the login page. Enter your email address and check your
                                                    inbox for a verification code. Enter the code to verify your identity, then create a new password.
                                                </p>
                                            </div>

                                            <Alert>
                                                <Info />
                                                <AlertTitle>Rate Limiting</AlertTitle>
                                                <AlertDescription>
                                                    For security, Minerva limits login attempts. After multiple failed attempts, you'll need
                                                    to wait before trying again.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                    </section>

                                    {/* Managing Schedules */}
                                    <section id="schedules" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Managing Schedules</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            The Management dashboard is where you view, filter, and work with your schedule data.
                                        </p>
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <h3 className="text-sm font-semibold">Understanding the Table</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Each row in the schedule table represents one entry with the following columns:
                                                </p>
                                                <div className="rounded-md border">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-25 px-4">Column</TableHead>
                                                                <TableHead>Description</TableHead>
                                                                <TableHead className="w-35 px-4">Example</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Date</code></TableCell>
                                                                <TableCell className="text-muted-foreground">The date of the schedule entry</TableCell>
                                                                <TableCell><code className="text-muted-foreground">dd/mm/yyyy</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Shift</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Morning or afternoon assignment</TableCell>
                                                                <TableCell><code className="text-muted-foreground">Support</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Branch</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Location where the activity takes place</TableCell>
                                                                <TableCell><code className="text-muted-foreground">Corporate</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Time</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Start and end time for the activity</TableCell>
                                                                <TableCell><code className="text-muted-foreground">09:00 - 10:00</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Instructor</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Person assigned to the schedule</TableCell>
                                                                <TableCell><code className="text-muted-foreground">John Doe</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Program</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Name of the class or activity</TableCell>
                                                                <TableCell><code className="text-muted-foreground">English 101</code></TableCell>
                                                            </TableRow>
                                                            <TableRow>
                                                                <TableCell className="px-4"><code className="text-primary">Status</code></TableCell>
                                                                <TableCell className="text-muted-foreground">Current incidence status of the entry</TableCell>
                                                                <TableCell><code className="text-muted-foreground">Cancelled</code></TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Filtering & Searching</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Use the search box to search across all columns. Filter by status, branch, or time using
                                                    the dropdown filters. Click the Overlaps button to show only conflicting schedules.
                                                    Click Reset to clear all filters.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Bulk Actions</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Select one or more rows using the checkboxes to reveal the floating action bar at the bottom.
                                                    From there you can copy the selected rows as plain text or as a formatted table, and delete multiple entries at once.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Row Actions</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Each row has a menu (<EllipsisIcon size={16} className="inline-block" />) with options to view details,
                                                    copy the entry, edit its incidence status, apply a quick status preset, or delete it.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Auto-Save</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    When Auto Save is enabled in <strong>Settings → Preferences</strong>, Minerva automatically saves
                                                    your schedule data locally. When you reopen the app, your previous session will be restored.
                                                </p>
                                            </div>

                                            <Alert>
                                                <Lightbulb />
                                                <AlertTitle>Tip</AlertTitle>
                                                <AlertDescription>
                                                    Enable "Actions Respect Filters" in Settings → Preferences to make Copy and Export work only on filtered data.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                    </section>

                                    {/* Import & Export */}
                                    <section id="import-export" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Import & Export</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Minerva makes it easy to work with Excel files for importing and exporting schedule data.
                                        </p>
                                        <div className="space-y-6">
                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">Importing Excel Files</CardTitle>
                                                    <CardDescription>How to upload your schedule data</CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                                                        <li>Click the <strong>Upload Files</strong> button in the toolbar</li>
                                                        <li>Drag and drop your Excel file(s) or click <strong>Browse files</strong></li>
                                                        <li>You can upload up to <strong>5 files</strong> at once</li>
                                                        <li>Click <strong>Process</strong> to import the data</li>
                                                    </ol>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">.xlsx only</Badge>
                                                        <span className="text-xs text-muted-foreground">Excel 2007+ format required</span>
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Expected Format</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Minerva can read files previously exported from the app (with headers: date, shift, branch,
                                                    start_time, end_time, code, instructor, program, minutes, units) or original schedule reports
                                                    with a specific structure.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Exporting to Excel</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Go to <strong>Actions → Export to Excel</strong> and choose where to save the file. The file will be
                                                    named with a timestamp (e.g., schedule-export-20260115-143022.xlsx).
                                                </p>
                                                <Alert>
                                                    <Lightbulb />
                                                    <AlertTitle>Tip</AlertTitle>
                                                    <AlertDescription>
                                                        Enable "Open After Export" in Settings → Preferences to automatically open the file after saving.
                                                    </AlertDescription>
                                                </Alert>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Duplicate Handling</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    When importing new files, Minerva automatically detects and ignores duplicate entries.
                                                    You'll see a notification indicating how many schedules were added and how many were skipped.
                                                </p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Conflict Detection */}
                                    <section id="conflicts" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Conflict Detection</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Minerva automatically identifies scheduling conflicts to help you avoid double-booking.
                                        </p>
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <h3 className="text-sm font-semibold">How Conflicts Are Detected</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    A conflict occurs when two or more schedules meet these conditions:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="outline">Same date</Badge>
                                                    <Badge variant="outline">Overlapping time ranges</Badge>
                                                    <Badge variant="outline">Same instructor/resource</Badge>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Visual Indicators</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Conflicting schedules are highlighted with a <span className="text-destructive font-medium">red left border</span> in
                                                    the table. When conflicts are detected, an Overlaps button appears showing the count.
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold">Viewing Only Conflicts</h3>
                                                <p className="text-sm text-muted-foreground leading-relaxed">
                                                    Click the Overlaps button to filter the table and show only conflicting entries.
                                                    Click again to show all schedules.
                                                </p>
                                            </div>

                                            <Alert>
                                                <AlertTriangle />
                                                <AlertTitle>Resolving Conflicts</AlertTitle>
                                                <AlertDescription>
                                                    To resolve a conflict, edit one of the conflicting entries (change time or date) or delete
                                                    one of them. The conflict indicator will update automatically.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                    </section>

                                    {/* Settings */}
                                    <section id="settings" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Customize Minerva from the <strong>Settings</strong> modal, accessible via the user menu in the top-right corner.
                                            Settings are organized into three tabs.
                                        </p>
                                        <div className="grid grid-cols-2 gap-6 text-sm">
                                            <div className="space-y-1">
                                                <p className="font-medium">Account</p>
                                                <p className="text-muted-foreground">
                                                    Update your display name (2–30 characters). View your assigned permissions and role.
                                                    Delete your account from the Danger Zone.
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="font-medium">Security</p>
                                                <p className="text-muted-foreground">
                                                    Change your password by verifying your current one first. Minimum 8 characters required.
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="font-medium">Appearance</p>
                                                <p className="text-muted-foreground">
                                                    Choose between Light, Dark, or System theme. Enable "Actions Respect Filters" to apply
                                                    actions only to filtered data.
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="font-medium">Notifications</p>
                                                <p className="text-muted-foreground">
                                                    Control in-app notifications for schedule updates published by other users.
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="font-medium">Automation</p>
                                                <p className="text-muted-foreground">
                                                    Enable Auto Save to save changes locally at a configurable interval. Enable "Clear Schedule on Load"
                                                    to replace existing schedules when uploading new files instead of merging.
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <p className="font-medium">Language & System</p>
                                                <p className="text-muted-foreground">
                                                    Select your preferred language (English, Español, Français). Clear local cache or check for
                                                    app updates from the System section.
                                                </p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Troubleshooting */}
                                    <section id="troubleshooting" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Troubleshooting</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Having issues? Try these solutions:
                                        </p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">Excel file won't import</CardTitle>
                                                    <CardDescription>Issues when uploading or processing Excel files.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                        <li>Ensure the file is in .xlsx format</li>
                                                        <li>Check that the file isn't corrupted</li>
                                                        <li>Verify the file structure matches the expected format</li>
                                                        <li>Try re-saving the file in Excel</li>
                                                    </ul>
                                                </CardContent>
                                            </Card>

                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">Can't log in</CardTitle>
                                                    <CardDescription>Problems accessing your account.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                        <li>Double-check email and password</li>
                                                        <li>Wait if temporarily locked out</li>
                                                        <li>Use "Forgot your password?" to reset</li>
                                                        <li>Check spam for verification emails</li>
                                                    </ul>
                                                </CardContent>
                                            </Card>

                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">Data not loading</CardTitle>
                                                    <CardDescription>Schedule data doesn't appear or takes too long.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                        <li>Check your internet connection</li>
                                                        <li>Try logging out and back in</li>
                                                        <li>Clear cache in Settings → Preferences</li>
                                                        <li>Restart the application</li>
                                                    </ul>
                                                </CardContent>
                                            </Card>

                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">Session not restored</CardTitle>
                                                    <CardDescription>Previous work doesn't load on startup.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                        <li>Ensure Auto Save is enabled in Settings</li>
                                                        <li>Session may have been manually cleared</li>
                                                        <li>Verify you're using the same account</li>
                                                    </ul>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </section>

                                    {/* FAQ */}
                                    <section id="faq" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Frequently Asked Questions</h2>
                                        <Accordion type="single" collapsible className="w-full">
                                            <AccordionItem value="item-1">
                                                <AccordionTrigger>Why can't I edit my email address?</AccordionTrigger>
                                                <AccordionContent>
                                                    Your email is tied to your account identity and is used for authentication.
                                                    For security reasons, email changes require contacting support.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-2">
                                                <AccordionTrigger>I didn't receive my verification code. What should I do?</AccordionTrigger>
                                                <AccordionContent>
                                                    Check your spam/junk folder first. If it's not there, wait a few minutes and click
                                                    Resend to get a new code. Make sure you entered the correct email address.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-3">
                                                <AccordionTrigger>Will I lose my data if I close the application?</AccordionTrigger>
                                                <AccordionContent>
                                                    If Auto Save is enabled (Settings → Preferences → Automation), your data is saved automatically.
                                                    When you reopen Minerva, your previous session will be restored.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-4">
                                                <AccordionTrigger>Can I import multiple files at once?</AccordionTrigger>
                                                <AccordionContent>
                                                    Yes! You can upload up to 5 Excel files at once. All schedules will be merged together,
                                                    and duplicates will be automatically detected and skipped.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-5">
                                                <AccordionTrigger>How do I export only filtered data?</AccordionTrigger>
                                                <AccordionContent>
                                                    Enable "Actions Respect Filters" in Settings → Preferences. Then apply your desired
                                                    filters before using Export to Excel. Only visible rows will be exported.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-6">
                                                <AccordionTrigger>Is my data secure?</AccordionTrigger>
                                                <AccordionContent>
                                                    Yes. We use industry-standard encryption and your data is stored securely on Supabase servers.
                                                    Tokens are never stored in plain text.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-7">
                                                <AccordionTrigger>What permissions do I have?</AccordionTrigger>
                                                <AccordionContent>
                                                    You can view your current permissions in <strong>Settings → Account</strong>. Your access level
                                                    determines which features are available to you.
                                                </AccordionContent>
                                            </AccordionItem>

                                            <AccordionItem value="item-8">
                                                <AccordionTrigger>How do I report a bug?</AccordionTrigger>
                                                <AccordionContent>
                                                    Click the help icon in the bottom-left corner of the screen and select "Report a Bug".
                                                    Provide a clear title and detailed description of the issue.
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </section>

                                    {/* Contact & Support */}
                                    <section id="support" className="space-y-4 py-5">
                                        <h2 className="text-xl font-semibold tracking-tight">Contact & Support</h2>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Need help or want to report an issue?
                                        </p>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">🐛 Report a Bug</CardTitle>
                                                    <CardDescription>
                                                        Open the Help Menu in the bottom-left corner of the screen and select "Report a Bug".
                                                    </CardDescription>
                                                </CardHeader>
                                            </Card>
                                            <Card className="shadow-none">
                                                <CardHeader>
                                                    <CardTitle className="text-sm">☕ Support Development</CardTitle>
                                                    <CardDescription>
                                                        If you find Minerva useful, consider supporting the developer. Visit Settings → Preferences → About.
                                                    </CardDescription>
                                                </CardHeader>
                                            </Card>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
