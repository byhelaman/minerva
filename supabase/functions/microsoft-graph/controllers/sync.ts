// Controladores para operaciones de sincronización y por lotes (batch)
import { graphGet } from '../services/graph-client.ts'
import { parseCell, getColumnLetter, normalizeDate, normalizeTime, normalizeText } from '../utils/excel-helpers.ts'

export async function handleReplaceTableData(token: string, fileId: string, sheetId: string, tableId: string, values: any[][], startRange?: string) {
    if (!fileId || !tableId || !sheetId || !values) throw new Error('File ID, Table ID, Sheet ID and Values are required')

    // 1. Obtener la cantidad actual de filas de la tabla
    const oldRangeData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/range?$select=rowCount`, token).catch(() => ({ rowCount: 0 }));
    const oldRowCount = oldRangeData.rowCount || 0;

    // 2. Calcular el rango de escritura
    const numRows = values.length
    const numCols = values[0].length
    const startCell = startRange || 'B2'

    const { col: startCol, row: startRow } = parseCell(startCell)
    const endColLetter = getColumnLetter(startCol + numCols - 1)
    const endRow = startRow + numRows - 1
    const calculatedRange = `${startCell}:${endColLetter}${endRow}`

    // 3. Escribir nuevos datos
    const writeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`
    const writeRes = await fetch(writeUrl, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
    })

    if (!writeRes.ok) {
        const err = await writeRes.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Failed to write replacement data')
    }

    // 4. Redimensionar la tabla
    const resizeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/resize`
    await fetch(resizeUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRange: calculatedRange })
    })

    // 5. Limpiar filas sobrantes si la tabla anterior era más grande
    if (oldRowCount > numRows) {
        const clearStartRow = endRow + 1
        const clearEndRow = startRow + oldRowCount - 1
        const startColLetter = getColumnLetter(startCol)
        const clearRange = `${startColLetter}${clearStartRow}:${endColLetter}${clearEndRow}`

        await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${clearRange}')/clear`,
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ applyTo: 'Contents' })
            }
        )
    }

    return { success: true, count: numRows }
}

export async function handleUpsertRowsByKey(token: string, fileId: string, tableId: string, values: any[][], keyColumns: string[]) {
    if (!fileId || !tableId || !values || !keyColumns) throw new Error('File ID, Table ID, Values, and Key Columns are required')

    const headerRow = values[0] as string[];
    const inputRows = values.slice(1);

    // 1. Obtener los encabezados de columna reales de la tabla
    const colsData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/columns?$select=name`, token);
    const tableHeaders: string[] = (colsData.value || []).map((col: any) => col.name);

    // 2. Obtener las filas existentes de la tabla
    const rowsData = await graphGet(`/me/drive/items/${fileId}/workbook/tables/${tableId}/rows`, token).catch((err) => {
        if (!err.message.includes('ItemNotFound')) throw err;
        return { value: [] };
    });
    const existingRows: any[] = rowsData.value || [];

    const getKey = (row: any[], headers: string[]) => {
        return keyColumns.map((col: string) => {
            const idx = headers.indexOf(col);
            let value = idx !== -1 ? row[idx] : '';
            if (col === 'date') value = normalizeDate(value);
            else if (col === 'start_time' || col === 'end_time') value = normalizeTime(value);
            else value = normalizeText(value);
            return value;
        }).join('|');
    };

    const existingRowMap = new Map<string, { index: number, values: any[] }>();

    existingRows.forEach((row: any) => {
        const rowValues = row.values[0];
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
                const updateUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/itemAt(index=${existing.index})`;
                const updateRes = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ values: [inputRow] })
                });

                if (!updateRes.ok) {
                    const err = await updateRes.json().catch(() => ({}));
                    throw new Error(err.error?.message || 'Update failed');
                }
                updateCount++;
            } catch (err: any) {
                errors.push(`Update row at index ${existing.index}: ${err.message}`);
            }
        } else {
            try {
                const addUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/add`;
                const addRes = await fetch(addUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ values: [inputRow] })
                });

                if (!addRes.ok) {
                    const err = await addRes.json().catch(() => ({}));
                    throw new Error(err.error?.message || 'Insert failed');
                }
                insertCount++;
            } catch (err: any) {
                errors.push(`Insert new row: ${err.message}`);
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
