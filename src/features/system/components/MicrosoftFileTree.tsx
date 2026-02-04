import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, FileSpreadsheet, ChevronRightIcon, FolderIcon, File, Sheet, Table } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FileSystemItem, MicrosoftAccount } from "../types";

export interface FileTreeNodeProps {
    item: FileSystemItem;
    depth?: number;
    configMode: 'schedules_folder' | 'incidences_file' | null;
    account: MicrosoftAccount | null;

    // Data Maps
    folderChildren: Map<string, FileSystemItem[]>;
    fileWorksheets: Map<string, { id: string; name: string }[]>;
    worksheetTables: Map<string, { id: string; name: string }[]>;

    // Loading States
    loadingFolders: Set<string>;
    loadingFiles: Set<string>;
    loadingWorksheets: Set<string>;

    // Handlers
    onLoadFolderChildren: (id: string) => void;
    onLoadWorksheets: (id: string) => void;
    onLoadTables: (fileId: string, worksheetId: string) => void;
    onSelectLink: (item: { id: string; name: string }) => void;
    onSelectTable: (fileItem: { id: string; name: string }, worksheet: { id: string; name: string }, table: { id: string; name: string }) => void;
}

export function FileTreeNode({
    item,
    depth = 0,
    configMode,
    account,
    folderChildren,
    fileWorksheets,
    worksheetTables,
    loadingFolders,
    loadingFiles,
    loadingWorksheets,
    onLoadFolderChildren,
    onLoadWorksheets,
    onLoadTables,
    onSelectLink,
    onSelectTable
}: FileTreeNodeProps) {
    const isFolder = item.type === 'folder';
    const isExcel = item.name.toLowerCase().endsWith('.xlsx');
    const isLoading = loadingFolders.has(item.id) || loadingFiles.has(item.id);

    // Common props to pass down recursively
    const childProps = {
        configMode,
        account,
        folderChildren,
        fileWorksheets,
        worksheetTables,
        loadingFolders,
        loadingFiles,
        loadingWorksheets,
        onLoadFolderChildren,
        onLoadWorksheets,
        onLoadTables,
        onSelectLink,
        onSelectTable
    };

    // For schedules_folder mode: folders are selectable
    if (configMode === 'schedules_folder') {
        if (isFolder) {
            const isSelected = account?.schedules_folder?.id === item.id;
            return (
                <Collapsible key={item.id} onOpenChange={(open) => open && onLoadFolderChildren(item.id)}>
                    <div className="flex items-center gap-1 group">
                        <CollapsibleTrigger asChild>
                            <div
                                role="button"
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    "group hover:bg-accent hover:text-accent-foreground flex-1 justify-start transition-none w-full cursor-pointer"
                                )}
                            >
                                <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                                <FolderIcon />
                                <div className="flex items-center justify-between w-full gap-2">
                                    <span className="text-sm">{item.name}</span>
                                    {isLoading ? <Loader2 className="size-3.5 animate-spin" /> :

                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) => {
                                                if (checked) onSelectLink(item);
                                            }}
                                            className={cn(!isSelected && "opacity-0 group-hover:opacity-100")}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    }
                                </div>
                            </div>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="style-lyra:ml-4 pt-1 pl-5 w-full">
                        <div className="flex flex-col gap-1">
                            {folderChildren.get(item.id)?.map(child => (
                                <FileTreeNode key={child.id} item={child} depth={depth + 1} {...childProps} />
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            );
        } else {
            return (
                <Button
                    key={item.id}
                    variant="ghost"
                    size="sm"
                    disabled
                    className="text-foreground justify-start gap-2"
                >
                    <File />
                    <span className="truncate">{item.name}</span>
                </Button>
            );
        }
    }

    // For incidences_file mode: full tree with folders → Excel → worksheets → tables
    if (isFolder) {
        return (
            <>
                <Collapsible key={item.id} onOpenChange={(open) => open && onLoadFolderChildren(item.id)}>
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="group hover:bg-accent hover:text-accent-foreground flex-1 justify-start transition-none w-full"
                        >
                            <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                            <FolderIcon />
                            <div className="flex items-center justify-between w-full gap-2">
                                <span className="text-sm">{item.name}</span>
                                {isLoading && <Loader2 className="size-3.5 animate-spin" />}
                            </div>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="style-lyra:ml-4 pt-1 pl-5 w-full">
                        <div className="flex flex-col gap-1">
                            {folderChildren.get(item.id)?.map(child => (
                                <FileTreeNode key={child.id} item={child} depth={depth + 1} {...childProps} />
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </>
        );
    }

    if (isExcel) {
        return (
            <Collapsible key={item.id} onOpenChange={(open) => open && onLoadWorksheets(item.id)}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="group hover:bg-accent hover:text-accent-foreground flex-1 justify-start transition-none w-full"
                    >
                        <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                        <FileSpreadsheet />
                        <div className="flex items-center justify-between w-full gap-2">
                            <span className="text-sm">{item.name}</span>
                            {loadingFiles.has(item.id) && <Loader2 className="size-3.5 animate-spin" />}
                        </div>
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="style-lyra:ml-4 pt-1 pl-5 w-full">
                    <div className="flex flex-col gap-1">
                        {fileWorksheets.get(item.id)?.map(worksheet => (
                            <Collapsible key={worksheet.id} onOpenChange={(open) => open && onLoadTables(item.id, worksheet.id)}>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="group hover:bg-accent hover:text-accent-foreground flex-1 justify-start transition-none w-full"
                                    >
                                        <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                                        <Sheet />
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <span className="text-sm">{worksheet.name}</span>
                                            {loadingWorksheets.has(worksheet.id) && <Loader2 className="size-3.5 animate-spin" />}
                                        </div>
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="style-lyra:ml-4 pt-1 pl-5 w-full">
                                    <div className="flex flex-col gap-1">
                                        {worksheetTables.get(worksheet.id)?.map(table => {
                                            const isTableSelected =
                                                account?.incidences_file?.id === item.id &&
                                                account?.incidences_worksheet?.id === worksheet.id &&
                                                account?.incidences_table?.id === table.id;

                                            return (
                                                <div key={table.id} className="flex items-center gap-1 group ml-0.5">
                                                    <div
                                                        role="button"
                                                        className={cn(
                                                            buttonVariants({ variant: isTableSelected ? "secondary" : "ghost", size: "sm" }),
                                                            "group hover:bg-accent hover:text-accent-foreground flex-1 justify-start transition-none w-full cursor-pointer"
                                                        )}
                                                        onClick={() => onSelectTable(item, worksheet, table)}
                                                    >
                                                        <Table />
                                                        <div className="flex items-center justify-between w-full gap-2">
                                                            <span className="text-sm">{table.name}</span>
                                                            <Checkbox
                                                                checked={isTableSelected}
                                                                className={cn(!isTableSelected && "opacity-0 group-hover:opacity-100")}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        );
    }

    // Non-Excel files
    return (
        <Button
            key={item.id}
            variant="ghost"
            size="sm"
            disabled
            className="text-foreground justify-start gap-2"
        >
            <File />
            <span className="truncate">{item.name}</span>
        </Button>
    );
}

