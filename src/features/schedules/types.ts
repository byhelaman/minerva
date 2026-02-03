
export interface Schedule {
    date: string;
    shift: string;
    branch: string;
    start_time: string;
    end_time: string;
    code: string;
    instructor: string;
    program: string;
    minutes: string;
    units: string;
    // Optional incidence fields
    status?: string;
    substitute?: string;
    type?: string;
    subtype?: string;
    description?: string;
    department?: string;
    feedback?: string;
}

export type DailyIncidence = Schedule;

export interface PublishedSchedule {
    id: string;
    published_by: string | null;
    schedule_date: string;
    entries_count: number;
    created_at: string;
    updated_at: string;
}

export interface SchedulesConfig {
    isConnected: boolean;
    schedulesFolderId: string | null;
    incidencesFileId: string | null;
    schedulesFolderName: string | null;
    incidencesFileName: string | null;
    incidencesWorksheetId: string | null;
    incidencesWorksheetName: string | null;
    incidencesTableId: string | null;
    incidencesTableName: string | null;
}
