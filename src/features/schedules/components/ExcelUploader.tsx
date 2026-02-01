import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { parseExcelFile, Schedule } from "../utils/excel-parser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";

export function ExcelUploader() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [schedules, setSchedules] = useState<Schedule[]>([]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setIsProcessing(true);
        try {
            const promises = acceptedFiles.map((file) => parseExcelFile(file));
            const results = await Promise.all(promises);

            const allSchedules = results.flatMap(r => r.schedules);
            setSchedules(allSchedules);
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
                ".xlsx",
            ],
            "application/vnd.ms-excel": [".xls"],
        },
        multiple: true,
    });

    return (
        <div className="w-full max-w-xl mx-auto space-y-4">
            <div
                {...getRootProps()}
                className={`
          border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
          ${isDragActive
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }
        `}
            >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-2">
                    {isProcessing ? (
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    ) : (
                        <UploadCloud className="h-10 w-10 text-muted-foreground" />
                    )}
                    <p className="text-lg font-medium">
                        {isProcessing
                            ? "Processing Excel..."
                            : "Drag & drop Excel file here, or click to select"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Supports .xlsx and .xls
                    </p>
                </div>
            </div>

            {schedules.length > 0 && (
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <FileSpreadsheet className="h-8 w-8 text-green-600" />
                        <div className="flex-1">
                            <p className="font-semibold">Parsed Data Ready</p>
                            <p className="text-sm text-muted-foreground">
                                {schedules.length} rows extracted.
                            </p>
                        </div>
                        <Button variant="outline">
                            Log to Console
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
