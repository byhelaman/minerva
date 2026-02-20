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

export async function handleUpsertRowsByKey(token: string, fileId: string, tableId: string, values: unknown[][], keyColumns: string[]) {
    if (!fileId || !tableId || !values || !keyColumns) throw new Error('File ID, Table ID, Values, and Key Columns are required')

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

    const existingRowMap = new Map<string, { index: number, values: unknown[] }>();

    existingRows.forEach((row) => {
        const rowValues = row.values[0] || [];
        const key = getKey(rowValues, tableHeaders);
        existingRowMap.set(key, { index: row.index, values: rowValues });
    });

    let updateCount = 0;
    let insertCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < inputRows.length; i++) {
        const inputRow = inputRows[i];
        const key = getKey(inputRow, headerRow);
        const existing = existingRowMap.get(key);

        if (existing) {
            try {
                const updateUrl = `/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/itemAt(index=${existing.index})`;
                await graphPatch(updateUrl, token, { values: [inputRow] });
                updateCount++;
            } catch (err: unknown) {
                errors.push(`Update row at index ${existing.index}: ${err instanceof Error ? err.message : String(err)}`);
            }
        } else {
            try {
                const addUrl = `/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/add`;
                await graphPost(addUrl, token, { values: [inputRow] });
                insertCount++;
            } catch (err: unknown) {
                errors.push(`Insert new row: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    return {
        success: errors.length === 0,
        updated: updateCount,
        inserted: insertCount,
        errors: errors.length > 0 ? errors : undefined
    };
}
