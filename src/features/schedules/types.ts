
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
    status?: string | null;
    substitute?: string | null;
    type?: string | null;
    subtype?: string | null;
    description?: string | null;
    department?: string | null;
    feedback?: string | null;
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

export interface Instructor {
    id: string;
    display_name: string;
    email: string;
}

export interface PoolRuleDayOverride {
    id: string;
    rule_id: string;
    day_of_week: number; // 1=Mon...7=Sun (ISO)
    start_time: string;  // HH:MM
    end_time: string;    // HH:MM
    allowed_instructors: string[];
    created_at: string;
}

export interface PoolRuleDayOverrideInput {
    day_of_week: number;
    start_time: string;
    end_time: string;
    allowed_instructors: string[];
}

export interface PoolRule {
    id: string;
    owner_id: string;
    branch: string;
    program_name: string;
    day_overrides: PoolRuleDayOverride[];
    allowed_instructors: string[];
    blocked_instructors: string[];
    hard_lock: boolean;
    is_active: boolean;
    has_rotation_limit: boolean;
    comments: string | null;
    created_at: string;
    updated_at: string;
}

export interface PoolRuleInput {
    branch: string;
    program_name: string;
    day_overrides?: PoolRuleDayOverrideInput[];
    allowed_instructors: string[];
    blocked_instructors: string[];
    hard_lock: boolean;
    is_active: boolean;
    has_rotation_limit?: boolean;
    comments?: string | null;
}
