export interface MicrosoftAccount {
    email: string;
    name: string;
    connected_at: string;
    schedules_folder?: { id: string; name: string };
    incidences_file?: { id: string; name: string };
    incidences_worksheet?: { id: string; name: string };
    incidences_table?: { id: string; name: string };
}

export interface FileSystemItem {
    id: string;
    name: string;
    type: 'file' | 'folder';
    date: string;
    parentId: string | null;
}
