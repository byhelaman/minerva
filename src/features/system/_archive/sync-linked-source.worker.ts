
export type SyncWorkerMessage = {
    type: 'SYNC';
    fileId: string;
    supabaseUrl: string;
    supabaseKey: string;
    accessToken: string;
};

export type SyncWorkerResponse =
    | { type: 'SYNC_START' }
    | { type: 'SYNC_SUCCESS'; data: Record<string, any[]>; sheets: any[]; timestamp: number }
    | { type: 'SYNC_ERROR'; error: string };

self.onmessage = async (e: MessageEvent<SyncWorkerMessage>) => {
    const { type, fileId, supabaseUrl, supabaseKey, accessToken } = e.data;

    if (type !== 'SYNC') return;

    try {
        self.postMessage({ type: 'SYNC_START' });

        const invokeFunction = async (functionName: string, body: any) => {
            const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': supabaseKey
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Function ${functionName} failed: ${error}`);
            }

            return await response.json();
        };

        // 1. Obtener Hojas
        const sheetsData = await invokeFunction('microsoft-graph', {
            action: 'list-content',
            fileId: fileId
        });

        const items = sheetsData.value as any[];
        // 2. Filtrar items relevantes (Tablas y Hojas si no hay tablas)
        // Priorizar Tablas para estructura definida
        let targetItems = items.filter(i => i.type === 'table');

        // Si no hay tablas, intentar hojas crudas
        if (targetItems.length === 0) {
            targetItems = items.filter(i => i.type === 'sheet');
        }

        if (targetItems.length === 0) {
            self.postMessage({ type: 'SYNC_SUCCESS', data: {}, sheets: [], timestamp: Date.now() });
            return;
        }

        // 3. Descargar Datos en Paralelo
        // Limitar concurrencia si fuera necesario, pero para pocas tablas Promise.all esta bien
        const results = await Promise.all(targetItems.map(async (item) => {
            try {
                const payload: any = {
                    action: 'get-range',
                    fileId: fileId
                };

                if (item.type === 'table') {
                    payload.tableId = item.id;
                } else {
                    payload.sheetId = item.id;
                }

                const rangeData = await invokeFunction('microsoft-graph', payload);
                const rawRows = rangeData.text;

                if (!rawRows || rawRows.length === 0) return null;

                // Procesar Datos
                const headers = rawRows[0].map((h: any) => String(h || "").trim());
                const dataRows = rawRows.slice(1);

                const mappedData = dataRows.map((row: any[]) => {
                    const obj: any = {};
                    headers.forEach((header: string, index: number) => {
                        if (header) {
                            obj[header] = row[index];
                        }
                    });
                    if (!obj.id) obj.id = crypto.randomUUID();
                    return obj;
                });

                return { id: item.id, data: mappedData };

            } catch (err) {
                console.error(`Failed to sync item ${item.name}`, err);
                return null;
            }
        }));

        // 4. Construir Mapa de Datos
        const allSheetsData: Record<string, any[]> = {};
        results.forEach(res => {
            if (res) {
                allSheetsData[res.id] = res.data;
            }
        });

        self.postMessage({
            type: 'SYNC_SUCCESS',
            data: allSheetsData,
            sheets: targetItems,
            timestamp: Date.now()
        });

    } catch (error: any) {
        self.postMessage({ type: 'SYNC_ERROR', error: error.message || String(error) });
    }
};
