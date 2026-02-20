// Controladores para operaciones de escritura
import { graphPost, graphPatch } from '../services/graph-client.ts'
import { parseCell, getColumnLetter } from '../utils/excel-helpers.ts'
import { decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

export async function handleCreateWorksheet(token: string, fileId: string, name: string) {
    if (!fileId || !name) throw new Error('File ID and Name are required')

    const endpoint = `/me/drive/items/${fileId}/workbook/worksheets`

    try {
        return await graphPost(endpoint, token, { name })
    } catch (err: unknown) {
        // Fallback para ItemAlreadyExists (el elemento ya existe)
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('AlreadyExists') || msg.includes('exist')) {
            const sheetsRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (sheetsRes.ok) {
                const sheets = await sheetsRes.json()
                const existing = sheets.value.find((s: Record<string, unknown>) => s.name === name)
                if (existing) return existing
            }
        }
        throw err
    }
}

export async function handleUpdateRange(token: string, fileId: string, sheetId: string, values: unknown[][], range?: string) {
    if (!fileId || !sheetId || !values) throw new Error('File ID, Sheet ID and Values are required')
    if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
        throw new Error('Values must be a non-empty 2D array');
    }

    const startCell = range || 'A1'
    const numRows = values.length
    const numCols = values[0].length

    const { col: startCol, row: startRow } = parseCell(startCell)
    const endColLetter = getColumnLetter(startCol + numCols - 1)
    const endRow = startRow + numRows - 1
    const calculatedRange = `${startCell}:${endColLetter}${endRow}`

    const endpoint = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`

    return await graphPatch(endpoint, token, { values })
}

export async function handleUploadFile(token: string, folderId: string, name: string, base64Values: string) {
    if (!folderId || !name || !base64Values) throw new Error('Folder ID, Name and Content (values) are required')

    const targetId = folderId === 'root' ? 'root' : folderId;

    // Optimizando rendimiento con decodificación nativa
    const bytes = decode(base64Values);
    const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${targetId}:/${name}:/content`

    const response = await fetch(graphUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        },
        body: bytes
    })

    if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error?.message || 'Failed to upload file')
    }

    return response.json()
}

export async function handleCreateTable(token: string, fileId: string, sheetId: string, range: string) {
    if (!fileId || !sheetId || !range) throw new Error('File ID, Sheet ID and Range are required')

    const endpoint = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables/add`

    try {
        return await graphPost(endpoint, token, { address: range, hasHeaders: true })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('AlreadyExists') || msg.includes('exist')) {
            try {
                const tablesRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables?$select=id,name`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (tablesRes.ok) {
                    const tables = await tablesRes.json();
                    const existing = tables.value?.[0];
                    if (existing) return existing;
                }
            } catch {
                // Ignorar errores de fetch durante el fallback
            }
            throw new Error('Table may already exist but could not be retrieved')
        }
        throw err
    }
}

export async function handleResizeTable(token: string, fileId: string, tableId: string, range: string) {
    if (!fileId || !tableId || !range) throw new Error('File ID, Table ID and Range are required')

    const endpoint = `/me/drive/items/${fileId}/workbook/tables/${tableId}/resize`

    await graphPost(endpoint, token, { targetRange: range })
    return { success: true }
}

export async function handleFormatColumns(token: string, fileId: string, sheetId: string, columns: Record<string, number>) {
    if (!fileId || !sheetId || !columns) throw new Error('File ID, Sheet ID and Columns Config required')

    const promises = Object.entries(columns).map(async ([colLetter, width]) => {
        const rangeAddr = `${colLetter}:${colLetter}`;
        const endpoint = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${rangeAddr}')/format`
        return graphPatch(endpoint, token, { columnWidth: width });
    });

    await Promise.all(promises);
    return { success: true }
}

export async function handleFormatFont(token: string, fileId: string, sheetId: string, tableId: string, range: string, font: Record<string, unknown>) {
    if (!fileId || !font) throw new Error('File ID and Font Config required')

    let endpoint = ''
    if (range) {
        endpoint = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${range}')/format/font`
    } else if (tableId) {
        endpoint = `/me/drive/items/${fileId}/workbook/tables/${tableId}/range/format/font`
    } else {
        endpoint = `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/usedRange/format/font`
    }

    await graphPatch(endpoint, token, font)
    return { success: true }
}

export async function handleUpdateTableStyle(token: string, fileId: string, tableId: string, style: string) {
    if (!fileId || !tableId || !style) throw new Error('File ID, Table ID and Style required')

    const endpoint = `/me/drive/items/${fileId}/workbook/tables/${tableId}`
    await graphPatch(endpoint, token, { style })
    return { success: true }
}
