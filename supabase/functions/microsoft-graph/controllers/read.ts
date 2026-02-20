// Controladores para operaciones de lectura
import { graphGet } from '../services/graph-client.ts'

export async function handleListChildren(token: string, folderId?: string) {
    const targetId = folderId || 'root'
    const endpoint = `/me/drive/items/${targetId}/children?$select=id,name,lastModifiedDateTime,file,folder`
    return await graphGet(endpoint, token)
}

export async function handleListWorksheetsAndTables(token: string, fileId: string) {
    if (!fileId) throw new Error('File ID is required')

    const sheetsEndpoint = `/me/drive/items/${fileId}/workbook/worksheets?$select=id,name,position,visibility`
    const tablesEndpoint = `/me/drive/items/${fileId}/workbook/tables?$select=id,name,showHeaders`

    const [sheetsData, tablesData] = await Promise.all([
        graphGet(sheetsEndpoint, token).catch((err) => {
            if (err.message.includes('ItemNotFound')) {
                throw new Error('File not found or not a valid Excel workbook')
            }
            throw err
        }),
        graphGet(tablesEndpoint, token).catch(() => ({ value: [] })) // Las tablas podrían fallar o no existir
    ])

    const combined = [
        ...sheetsData.value.map((s: any) => ({ ...s, type: 'sheet' })),
        ...(tablesData.value || []).map((t: any) => ({ ...t, type: 'table' }))
    ]

    return { value: combined }
}

export async function handleListTables(token: string, fileId: string, sheetId?: string) {
    if (!fileId) throw new Error('File ID is required')

    const endpoint = sheetId
        ? `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables?$select=id,name,showHeaders`
        : `/me/drive/items/${fileId}/workbook/tables?$select=id,name,showHeaders`

    return await graphGet(endpoint, token)
}

import { normalizeDate, normalizeTime, normalizeText } from '../utils/excel-helpers.ts'

export async function handleReadTableRows(token: string, fileId: string, sheetId: string | undefined, tableId: string, dateFilter?: string) {
    if (!fileId || !tableId) throw new Error('File ID and Table ID are required')

    // Acceder a la tabla a nivel de libro de trabajo (workbook) o de hoja (worksheet) dependiendo de si se proporciona sheetId
    const tableBaseEndpoint = sheetId
        ? `/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables/${tableId}`
        : `/me/drive/items/${fileId}/workbook/tables/${tableId}`

    // 1. Obtener encabezados para mapear la semántica de las columnas y devolverlos al cliente
    const headerEndpoint = `${tableBaseEndpoint}/headerRowRange`
    const headerData = await graphGet(headerEndpoint, token)

    // Graph devuelve los valores en un array 2D, usualmente una sola fila para los encabezados
    const rawHeaders = headerData.values && headerData.values.length > 0 ? headerData.values[0] : []
    const headers = rawHeaders.map((h: any) => normalizeText(h).toLowerCase())

    const dateColIndex = headers.findIndex((h: string) => h === 'date' || h === 'fecha')

    // 2. Obtener el cuerpo de los datos (filas)
    const bodyEndpoint = `${tableBaseEndpoint}/dataBodyRange`
    let bodyData;
    try {
        bodyData = await graphGet(bodyEndpoint, token)
    } catch (e: any) {
        // Las tablas vacías a menudo lanzan ItemNotFound para dataBodyRange
        if (e.message && e.message.includes('ItemNotFound')) {
            return { headers, rows: [] }
        }
        throw e
    }

    const rows = bodyData.values || []

    // 3. Mapear y normalizar cada celda basándose en su encabezado de columna
    let normalizedRows = rows.map((row: any[]) => {
        return row.map((cell: any, index: number) => {
            const header = headers[index] || ''
            if (header === 'date' || header === 'fecha') return normalizeDate(cell)
            if (header.includes('time') || header === 'hora') return normalizeTime(cell)
            return normalizeText(cell)
        })
    })

    // 4. Aplicar filtro de formato de fecha si se proporciona
    if (dateFilter && dateColIndex !== -1) {
        normalizedRows = normalizedRows.filter((row: any[]) => {
            return row[dateColIndex] === dateFilter
        })
    }

    return { headers, rows: normalizedRows }
}
