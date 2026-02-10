import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

export function DocsPage() {
    const [activeSection, setActiveSection] = useState('introduction');

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection(entry.target.id);
                    }
                });
            },
            { rootMargin: "-50% 0px -50% 0px" }
        );

        SECTIONS.forEach((section) => {
            const element = document.getElementById(section.id);
            if (element) {
                observer.observe(element);
            }
        });

        return () => observer.disconnect();
    }, []);

    const handleScrollTo = (e: React.MouseEvent<HTMLElement>, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)]">
            <div className="flex flex-col py-8 my-4 gap-1 flex-none">
                <h1 className="text-xl font-bold tracking-tight">Documentation</h1>
                <p className="text-muted-foreground text-sm">Learn how to use Minerva v2 effectively.</p>
            </div>

            <div className="grid gap-8 md:grid-cols-[200px_1fr] h-full overflow-hidden">
                <aside className="hidden md:flex flex-col gap-1 flex-none p-1">
                    <h3 className="text-sm font-medium text-muted-foreground px-2 mb-2">Sections</h3>
                    <nav className="grid gap-1">
                        {SECTIONS.map((item) => (
                            <Button
                                key={item.id}
                                variant="link"
                                onClick={(e) => handleScrollTo(e, item.id)}
                                className={`w-fit justify-start ${activeSection === item.id
                                    ? ''
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </nav>
                </aside>

                <div className="h-full overflow-y-auto scroll-smooth px-10 lg:px-20 xl:px-30">
                    <div className="space-y-10 pb-20">
                        {/* Introduction */}
                        <section id="introduction" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Introduction</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Welcome to <strong>Minerva v2</strong>, a schedule management application designed to help you
                                    organize, view, and export your scheduling data efficiently. Minerva provides the tools you need.
                                </p>

                                <Card className="shadow-none">
                                    <CardHeader>
                                        <CardTitle className="text-sm">✨ What can you do with Minerva? </CardTitle>
                                        <CardDescription>
                                            Key features available to manage your schedules.
                                        </CardDescription>
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
                            </div>
                        </section>

                        <Separator />

                        {/* Getting Started */}
                        <section id="getting-started" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">🚀 Getting Started</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                    Follow these steps to begin using Minerva:
                                </p>

                                <div className="grid gap-4">
                                    <div className="flex gap-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-medium">
                                            1
                                        </div>
                                        <div className="grid gap-1">
                                            <p className="text-sm font-medium">Create an account or sign in</p>
                                            <p className="text-sm text-muted-foreground">
                                                If you're new, click "Sign up" on the login page.  You'll receive a 6-digit
                                                verification code via email.  Enter this code to activate your account.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-medium">
                                            2
                                        </div>
                                        <div className="grid gap-1">
                                            <p className="text-sm font-medium">Access the Dashboard</p>
                                            <p className="text-sm text-muted-foreground">
                                                Once logged in, you'll land on the Management dashboard. This is your central hub
                                                for viewing and managing schedules.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-medium">
                                            3
                                        </div>
                                        <div className="grid gap-1">
                                            <p className="text-sm font-medium">Upload your first file</p>
                                            <p className="text-sm text-muted-foreground">
                                                Click "Upload Files" to import your Excel schedule data. You can drag and drop
                                                files or browse to select them.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-medium">
                                            4
                                        </div>
                                        <div className="grid gap-1">
                                            <p className="text-sm font-medium">Explore and manage</p>
                                            <p className="text-sm text-muted-foreground">
                                                Use the filters, search, and actions menu to work with your data. Export when ready.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* Account & Security */}
                        <section id="account" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">🛡️ Account & Security</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Your account settings can be managed from the Profile page.
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
                                            Navigate to <strong>Profile → Account Information</strong>. Enter your new display name
                                            (2-30 characters) and click Save.  This name appears across the application.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Changing Your Password</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Go to <strong>Profile → Security</strong>. Enter your current password, then your new password
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
                                            For security, Minerva limits login attempts.  After multiple failed attempts, you'll need
                                            to wait before trying again.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* Managing Schedules */}
                        <section id="schedules" className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">📅 Managing Schedules</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    The Management dashboard is where you view, filter, and work with your schedule data.
                                </p>

                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold">Understanding the Table</h3>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                Each row in the schedule table represents one entry with the following columns:
                                            </p>
                                        </div>
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-[100px] px-4">Column</TableHead>
                                                        <TableHead>Description</TableHead>
                                                        <TableHead className="w-[140px] px-4">Example</TableHead>
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
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Filtering & Searching</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Use the search box to search across all columns.  Filter by shift, branch, or time using
                                            the dropdown filters.  Click the Overlaps button to show only conflicting schedules.
                                            Click Reset to clear all filters.
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold">Actions Menu</h3>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                The Actions dropdown provides these options:
                                            </p>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                <li>Copy Instructors</li>
                                                <li>Copy Schedule</li>
                                                <li>Save Schedule</li>
                                                <li>Export to Excel</li>
                                                <li>Clear Schedule</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Row Actions</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Each row has a menu (<EllipsisIcon size={16} className="inline-block" />) with options to edit, copy details, change status, or delete
                                            the entry.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Auto-Save</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            When Auto Save is enabled in Settings, Minerva automatically saves your schedule data locally.
                                            When you reopen the app, your previous session will be restored automatically.
                                        </p>
                                    </div>

                                    <Alert>
                                        <Lightbulb />
                                        <AlertTitle>Tip</AlertTitle>
                                        <AlertDescription>
                                            Enable "Actions Respect Filters" in Settings to make Copy and Export work only on filtered data.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            </div>
                        </section>
                        <Separator />

                        {/* Import & Export */}
                        <section id="import-export" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">🔄 Import & Export</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Minerva makes it easy to work with Excel files for importing and exporting schedule data.
                                </p>

                                <div className="space-y-6">
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Importing Excel Files</CardTitle>
                                            <CardDescription>
                                                How to upload your schedule data
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                                                <li>Click the <strong>Upload Files</strong> button in the toolbar</li>
                                                <li>Drag and drop your Excel file(s) or click <strong>Browse files</strong></li>
                                                <li>You can upload up to <strong>5 files</strong> at once</li>
                                                <li>Click <strong>Process</strong> to import the data</li>
                                            </ol>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">. xlsx only</Badge>
                                                <span className="text-xs text-muted-foreground">Excel 2007+ format required</span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Expected Format</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Minerva can read files previously exported from the app (with headers:  date, shift, branch,
                                            start_time, end_time, code, instructor, program, minutes, units) or original schedule reports
                                            with specific structure.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">Exporting to Excel</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            Go to <strong>Actions → Export to Excel</strong> and choose where to save the file.  The file will be named
                                            with a timestamp (e.g., schedule-export-20260115-143022.xlsx).
                                        </p>
                                        <Alert>
                                            <Lightbulb />
                                            <AlertTitle>Tip</AlertTitle>
                                            <AlertDescription>
                                                Enable "Open After Export" in Settings to automatically open the file in Excel after saving.
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
                            </div>
                        </section>

                        <Separator />

                        {/* Conflict Detection */}
                        <section id="conflicts" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">⚡ Conflict Detection</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Minerva automatically identifies scheduling conflicts to help you avoid double-booking.
                                </p>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold">How Conflicts Are Detected</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
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
                                            Conflicting schedules are displayed in <span className="text-destructive font-medium">red text</span> in
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
                                            one of them.  The conflict indicator will update automatically.
                                        </AlertDescription>
                                    </Alert>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* Settings */}
                        <section id="settings" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">⚙️ Settings</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Customize Minerva to fit your preferences from the Settings page.
                                </p>

                                <div className="grid grid-cols-2 gap-6 text-sm">
                                    <div className="space-y-1">
                                        <p className="font-medium">Appearance</p>
                                        <p className="text-muted-foreground">
                                            Choose between Light, Dark, or System theme.  Enable "Actions Respect Filters" to apply
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
                                            Enable Auto Save to save changes locally. Enable "Clear Schedule on Load" to replace
                                            existing schedules when uploading new files (instead of merging).
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="font-medium">Storage & Export</p>
                                        <p className="text-muted-foreground">
                                            Enable "Open After Export" to automatically open exported files.
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="font-medium">Preferences</p>
                                        <p className="text-muted-foreground">
                                            Select your preferred language:  English, Español, or Français.
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="font-medium">System</p>
                                        <p className="text-muted-foreground">
                                            Clear Cache to reset local data.  Check for Updates to verify your app version.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* Troubleshooting */}
                        <section id="troubleshooting" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">🔧 Troubleshooting</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Having issues? Try these solutions:
                                </p>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Excel file won't import</CardTitle>
                                            <CardDescription>
                                                Issues when uploading or processing Excel files.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                <li>Ensure the file is in . xlsx format</li>
                                                <li>Check that the file isn't corrupted</li>
                                                <li>Verify the file structure</li>
                                                <li>Try re-saving the file in Excel</li>
                                            </ul>
                                        </CardContent>
                                    </Card>

                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Can't log in</CardTitle>
                                            <CardDescription>
                                                Problems accessing your account.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                <li>Double-check email and password</li>
                                                <li>Wait if locked out</li>
                                                <li>Use "Forgot your password?"</li>
                                                <li>Check spam for verification emails</li>
                                            </ul>
                                        </CardContent>
                                    </Card>

                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Data not loading</CardTitle>
                                            <CardDescription>
                                                Schedule data doesn't appear or takes too long.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                <li>Check your internet connection</li>
                                                <li>Try logging out and back in</li>
                                                <li>Clear Cache in Settings</li>
                                                <li>Restart the application</li>
                                            </ul>
                                        </CardContent>
                                    </Card>

                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">Session not restored</CardTitle>
                                            <CardDescription>
                                                Previous work doesn't load on startup.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                <li>Ensure Auto Save is enabled</li>
                                                <li>Session may have been cleared</li>
                                                <li>Check you're using same account</li>
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </section>

                        <Separator />

                        {/* FAQ */}
                        <section id="faq" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">❓ Frequently Asked Questions</h2>

                                <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>Why can't I edit my email address?</AccordionTrigger>
                                        <AccordionContent>
                                            Your email is tied to your account identity and is used for authentication.
                                            For security reasons, email changes require contacting support.
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-2">
                                        <AccordionTrigger>I didn't receive my verification code.  What should I do?</AccordionTrigger>
                                        <AccordionContent>
                                            Check your spam/junk folder first. If it's not there, wait a few minutes and click
                                            Resend to get a new code.  Make sure you entered the correct email address.
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-3">
                                        <AccordionTrigger>Will I lose my data if I close the application?</AccordionTrigger>
                                        <AccordionContent>
                                            If Auto Save is enabled (Settings → Automation), your data is saved automatically.
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
                                            Enable "Actions Respect Filters" in Settings → Appearance.  Then, apply your desired
                                            filters before using Export to Excel.  Only visible rows will be exported.
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-6">
                                        <AccordionTrigger>Is my data secure?</AccordionTrigger>
                                        <AccordionContent>
                                            Yes.  We use industry-standard encryption and your data is stored securely.
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-7">
                                        <AccordionTrigger>What permissions do I have?</AccordionTrigger>
                                        <AccordionContent>
                                            You can view your current permissions in Profile → Permissions. Your access level
                                            determines which features are available to you.
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-8">
                                        <AccordionTrigger>How do I report a bug?</AccordionTrigger>
                                        <AccordionContent>
                                            Click the bug icon in the bottom-left corner of the screen to open the bug report form.
                                            Provide a clear title and detailed description of the issue.
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        </section>

                        <Separator />

                        {/* Contact & Support */}
                        <section id="support" className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight mb-2">Contact & Support</h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                    Need help or want to report an issue?
                                </p>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">🐛 Report a Bug</CardTitle>
                                            <CardDescription>
                                                Use the built-in bug report form available in the bottom-left corner of the screen.
                                            </CardDescription>
                                        </CardHeader>
                                    </Card>
                                    <Card className="shadow-none">
                                        <CardHeader>
                                            <CardTitle className="text-sm">☕ Support Development</CardTitle>
                                            <CardDescription>
                                                If you find Minerva useful, consider supporting the developer. Visit Settings → About for more info.
                                            </CardDescription>
                                        </CardHeader>
                                    </Card>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}