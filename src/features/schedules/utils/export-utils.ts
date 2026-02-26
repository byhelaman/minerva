import type { Schedule } from "../types";
import { formatDateForDisplay } from "@/lib/date-utils";
import { formatTimeTo12Hour } from "./time-utils";
import { normalizeString } from "./string-utils";

export function mapScheduleToExcelRow(item: Schedule) {
    return [
        formatDateForDisplay(String(item.date || "")),
        String(normalizeString(item.branch) || ""),
        formatTimeTo12Hour(item.start_time),
        formatTimeTo12Hour(item.end_time || ""),
        String(item.code || ""),
        String(item.instructor || ""),
        String(item.program || ""),
        String(item.minutes ?? "0"),
        String(item.units ?? "0"),
        String(item.status || ""),
        String(item.type || ""),
        String(item.subtype || ""),
        String(item.description || ""),
        String(item.department || ""),
        String(item.substitute || "")
    ].join("\t");
}
