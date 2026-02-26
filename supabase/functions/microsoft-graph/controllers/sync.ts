// Controladores para operaciones de sincronización y por lotes (batch)
import { graphGet, graphPatch, graphPost } from '../services/graph-client.ts'
import { parseCell, getColumnLetter, normalizeDate, normalizeTime, normalizeText } from '../utils/excel-helpers.ts'

export async function handleReplaceTableData(token: string, fileId: string, sheetId: string, tableId: string, values: unknown[][], startRange?: string) {
    if (!fileId || !tableId || !sheetId || !values) throw new Error('File ID, Table ID, Sheet ID and Values are required')

    // 1. Obtener la cantidad actual de filas de la tabla
    const oldRangeData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/range?$select=rowCount`, token).catch(() => ({ rowCount: 0 })) as Record<string, unknown>;
    const oldRowCount = (oldRangeData.rowCount as number) || 0;

    // 2. Calcular el rango de escritura
    const numRows = values.length
    const numCols = values[0].length
    const startCell = startRange || 'B2'

    const { col: startCol, row: startRow } = parseCell(startCell)
    const endColLetter = getColumnLetter(startCol + numCols - 1)
    const endRow = startRow + numRows - 1
    const calculatedRange = `${startCell}:${endColLetter}${endRow}`

    // 3. Escribir nuevos datos
    const writeUrl = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`
    await graphPatch(writeUrl, token, { values })

    // 4. Redimensionar la tabla
    const resizeUrl = `/me/drive/items/${fileId}/workbook/tables/${tableId}/resize`
    await graphPost(resizeUrl, token, { targetRange: calculatedRange })

    // 5. Limpiar filas sobrantes si la tabla anterior era más grande
    if (oldRowCount > numRows) {
        const clearStartRow = endRow + 1
        const clearEndRow = startRow + oldRowCount - 1
        const startColLetter = getColumnLetter(startCol)
        const clearRange = `${startColLetter}${clearStartRow}:${endColLetter}${clearEndRow}`

        await graphPost(
            `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${clearRange}')/clear`,
            token,
            { applyTo: 'Contents' }
        )
    }

    return { success: true, count: numRows }
}

export async function handleUpsertRowsByKey(token: string, fileId: string, sheetId: string, tableId: string, values: unknown[][], keyColumns: string[], startRange?: string) {
    if (!fileId || !tableId || !sheetId || !values || !keyColumns) throw new Error('File ID, Sheet ID, Table ID, Values, and Key Columns are required')

    const headerRow = values[0] as string[];
    const inputRows = values.slice(1);

    // 1. Obtener los encabezados de columna reales de la tabla
    interface GraphColumn { name?: string }
    const colsData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/columns?$select=name`, token) as { value?: GraphColumn[] };
    const tableHeaders: string[] = (colsData.value || []).map((col) => col.name || '');

    interface GraphRow { index: number; values: unknown[][] }
    const rowsData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/rows`, token).catch((err) => {
        if (!(err instanceof Error) || !err.message.includes('ItemNotFound')) throw err;
        return { value: [] };
    }) as { value?: GraphRow[] };
    const existingRows: GraphRow[] = rowsData.value || [];

    const getKey = (row: unknown[], headers: string[]) => {
        return keyColumns.map((col: string) => {
            const idx = headers.indexOf(col);
            let value = idx !== -1 ? String(row[idx]) : '';
            if (col === 'date') value = normalizeDate(value);
            else if (col === 'start_time' || col === 'end_time') value = normalizeTime(value);
            else value = normalizeText(value);
            return value;
        }).join('|');
    };

    // 2. Extraer datos actuales y armar mapa en memoria para el UPSERT
    const mergedData: unknown[][] = existingRows.map(r => [...(r.values[0] || [])]);
    const existingRowMap = new Map<string, number>();

    existingRows.forEach((_row, idx) => {
        const rowValues = mergedData[idx];
        const key = getKey(rowValues, tableHeaders);
        existingRowMap.set(key, idx); // Map key to index in mergedData
    });

    let updateCount = 0;
    let insertCount = 0;

    // 3. Cruzar los registros de entrada con los datos en memoria
    for (let i = 0; i < inputRows.length; i++) {
        const inputRow = inputRows[i];
        const key = getKey(inputRow, headerRow);
        
        // Alinear la fila de input exactamente al orden de columnas actual de la tabla en Excel
        const alignedInputRow = tableHeaders.map(th => {
            const idx = headerRow.indexOf(th);
            return idx !== -1 ? inputRow[idx] : ""; 
        });

        if (existingRowMap.has(key)) {
            // Update: Overwrite the existing row in memory
            const idx = existingRowMap.get(key)!;
            mergedData[idx] = alignedInputRow;
            updateCount++;
        } else {
            // Insert: Add to the end
            mergedData.push(alignedInputRow);
            existingRowMap.set(key, mergedData.length - 1); // Protect against duplicate keys in the same payload
            insertCount++;
        }
    }

    // 4. Escribir toda la tabla consolidada de un solo golpe
    const fullValues = [tableHeaders, ...mergedData];
    await handleReplaceTableData(token, fileId, sheetId, tableId, fullValues, startRange);

    return {
        success: true,
        updated: updateCount,
        inserted: insertCount,
    };
}
