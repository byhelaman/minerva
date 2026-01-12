import { useCallback, useState, type DragEvent } from "react";
import { Upload, Trash2, File, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseExcelFile, Schedule } from "@schedules/utils/excel-parser";

interface FileInfo {
    file: File;
    name: string;
}

interface UploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUploadComplete: (schedules: Schedule[]) => void;
}

const MAX_FILES = 5;

export function UploadModal({
    open,
    onOpenChange,
    onUploadComplete,
}: UploadModalProps) {
    const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Validate and add files to selection
    const addFiles = useCallback(
        (newFiles: File[]) => {
            const existingNames = new Set(selectedFiles.map((f) => f.name));
            let duplicateCount = 0;
            let invalidCount = 0;

            const validNewFiles: FileInfo[] = [];

            for (const file of newFiles) {
                if (existingNames.has(file.name)) {
                    duplicateCount++;
                    continue;
                }
                if (!file.name.toLowerCase().endsWith(".xlsx")) {
                    invalidCount++;
                    continue;
                }
                validNewFiles.push({ file, name: file.name });
            }

            if (duplicateCount > 0) {
                toast.warning(`${duplicateCount} duplicate file(s) ignored`);
            }
            if (invalidCount > 0) {
                toast.error(
                    `${invalidCount} invalid file(s) rejected. Only .xlsx files allowed`
                );
            }

            const availableSlots = MAX_FILES - selectedFiles.length;
            const filesToAdd = validNewFiles.slice(0, availableSlots);

            if (validNewFiles.length > availableSlots) {
                toast.warning(
                    `Only ${availableSlots} file(s) added. Maximum ${MAX_FILES} files allowed`
                );
            }

            if (filesToAdd.length > 0) {
                setSelectedFiles((prev) => [...prev, ...filesToAdd]);
            }
        },
        [selectedFiles]
    );

    // Handle drag events
    const handleDragEnter = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isProcessing) {
                setIsDragging(true);
            }
        },
        [isProcessing]
    );

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);

            if (isProcessing) return;

            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                addFiles(files);
            }
        },
        [isProcessing, addFiles]
    );

    // Select files via input dialog
    const handleSelectFiles = useCallback(() => {
        if (selectedFiles.length >= MAX_FILES) {
            toast.error(`Maximum ${MAX_FILES} files allowed`);
            return;
        }

        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx";
        input.multiple = true;
        input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) {
                addFiles(Array.from(target.files));
            }
        };
        input.click();
    }, [selectedFiles.length, addFiles]);

    // Process files when Done is clicked
    const handleProcess = useCallback(async () => {
        if (selectedFiles.length === 0) {
            onOpenChange(false);
            return;
        }

        setIsProcessing(true);
        try {
            // Process all files in parallel
            const promises = selectedFiles.map((f) => parseExcelFile(f.file));
            const results = await Promise.all(promises);

            // Flatten arrays
            const allSchedules = results.flat();

            console.log("Parsed Schedules:", allSchedules);
            toast.success(`Successfully parsed ${allSchedules.length} schedules`);

            onUploadComplete(allSchedules);
            setSelectedFiles([]);
            onOpenChange(false);
        } catch (error) {
            console.error("Error processing files:", error);
            toast.error("Error processing files. Check console.");
        } finally {
            setIsProcessing(false);
        }
    }, [selectedFiles, onUploadComplete, onOpenChange]);

    const handleRemoveFile = useCallback((name: string) => {
        setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
    }, []);

    const handleClearAll = useCallback(() => {
        setSelectedFiles([]);
    }, []);

    const handleCancel = useCallback(() => {
        setSelectedFiles([]);
        onOpenChange(false);
    }, [onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Upload Excel Files</DialogTitle>
                    <DialogDescription>
                        Select Excel files (.xlsx only, max {MAX_FILES} files).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    {/* Dropzone-style upload area */}
                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${isDragging
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/50 hover:bg-muted/50"
                            } ${isProcessing ? "pointer-events-none opacity-50" : ""}`}
                    >
                        <div
                            className={`flex items-center justify-center rounded-full border p-3 transition-colors ${isDragging
                                ? "border-primary bg-primary/10"
                                : "border-muted-foreground/25 bg-background"
                                }`}
                        >
                            <Upload
                                className={`size-5 ${isDragging ? "text-primary" : "text-muted-foreground"
                                    }`}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-1 text-center">
                            <p className="font-medium text-sm">
                                {isDragging ? "Drop files here" : "Drag & drop files here"}
                            </p>
                            <p className="text-muted-foreground text-xs">
                                Or click to browse (.xlsx only, max {MAX_FILES} files)
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1"
                            onClick={handleSelectFiles}
                            disabled={isProcessing}
                        >
                            Browse files
                        </Button>
                    </div>

                    {/* Selected files list */}
                    {selectedFiles.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">
                                    Files ({selectedFiles.length})
                                </h4>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleClearAll}
                                    disabled={isProcessing}
                                >
                                    Remove all
                                </Button>
                            </div>
                            <div className="flex flex-col gap-2">
                                {selectedFiles.map((file) => (
                                    <div
                                        key={file.name}
                                        className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 pl-4 group"
                                    >
                                        <File className="size-4 shrink-0" />
                                        <span className="flex-1 truncate text-sm">{file.name}</span>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            onClick={() => handleRemoveFile(file.name)}
                                            disabled={isProcessing}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleProcess}
                        disabled={isProcessing || selectedFiles.length === 0}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Process"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
