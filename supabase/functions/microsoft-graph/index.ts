// Supabase Edge Function: microsoft-graph
// Interactúa con Microsoft Graph API (OneDrive)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../_shared/auth-utils.ts'

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') ?? ''
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const ALLOWED_ORIGINS = [
    'http://localhost:1420',
    'tauri://localhost',
    'http://tauri.localhost',
]

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || ''
    const isAllowed = ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
}

async function getAccessToken(supabase: ReturnType<typeof createClient>) {
    const { data: creds, error } = await supabase
        .from('microsoft_credentials_decrypted')
        .select('*')
        .single()

    if (error || !creds) throw new Error('Not connected to Microsoft')

    const expiresAt = new Date(creds.expires_at).getTime()
    const now = Date.now()

    // Refresh if expired or expiring in < 5 minutes
    if (expiresAt < now + 5 * 60 * 1000) {
        console.log('Refreshing Microsoft Token...')
        const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: MS_CLIENT_ID,
                client_secret: MS_CLIENT_SECRET,
                refresh_token: creds.refresh_token,
                grant_type: 'refresh_token',
                scope: 'offline_access User.Read Files.Read.All Files.ReadWrite.All'
            })
        })

        if (!tokenResponse.ok) {
            throw new Error('Failed to refresh token. Please reconnect.')
        }

        const tokens = await tokenResponse.json()

        // Update credentials
        const { error: updateError } = await supabase.rpc('store_microsoft_credentials', {
            p_user_id: creds.microsoft_user_id,
            p_email: creds.microsoft_email,
            p_name: creds.microsoft_name ?? creds.microsoft_email ?? '',
            p_access_token: tokens.access_token,
            p_refresh_token: tokens.refresh_token || creds.refresh_token,
            p_scope: tokens.scope,
            p_expires_in: tokens.expires_in
        });

        if (updateError) {
            console.error('Failed to persist refreshed token:', updateError);
        }

        return tokens.access_token
    }

    return creds.access_token
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        const { action, folderId, fileId, sheetId, tableId, range, name, values, keyColumns, columns, style, font, dateFilter } = await req.json()

        // Determine required permission based on action
        const readActions = ['list-children', 'list-worksheets', 'list-content', 'list-tables', 'read-table-rows'];
        // FIX: Eliminado 'append-rows' — acción no implementada
        const syncActions = ['upsert-rows-by-key', 'replace-table-data'];
        const writeActions = ['create-worksheet', 'update-range', 'upload-file', 'create-table', 'resize-table', 'format-columns', 'format-font', 'update-table-style'];

        // Verify permission based on action type
        if (syncActions.includes(action)) {
            // Sync actions can be done by reports managers or super_admin
            await verifyPermission(req, supabase, ['reports.manage', 'system.manage'])
        } else if (readActions.includes(action)) {
            // Read actions can be done by reports managers or super_admin
            await verifyPermission(req, supabase, ['reports.manage', 'system.manage'])
        } else {
            // Write operations (create, modify structure) — only super_admin
            await verifyPermission(req, supabase, 'system.manage')
        }

        // === READ ACTIONS ===

        if (action === 'list-children') {
            const token = await getAccessToken(supabase)
            const targetId = folderId || 'root'

            const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${targetId}/children?$select=id,name,lastModifiedDateTime,file,folder`
            const response = await fetch(graphUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Graph API Error')
            }

            const data = await response.json()
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'list-worksheets' || action === 'list-content') {
            if (!fileId) throw new Error('File ID is required')

            const token = await getAccessToken(supabase)

            const sheetsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets?$select=id,name,position,visibility`
            const tablesUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables?$select=id,name,showHeaders`

            const [sheetsRes, tablesRes] = await Promise.all([
                fetch(sheetsUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(tablesUrl, { headers: { 'Authorization': `Bearer ${token}` } })
            ])

            if (!sheetsRes.ok) {
                const err = await sheetsRes.json()
                if (err.error?.code === 'ItemNotFound') {
                    throw new Error('File not found or not a valid Excel workbook')
                }
                throw new Error(err.error?.message || 'Graph API Error (Sheets)')
            }

            let tables = []
            if (tablesRes.ok) {
                const tablesData = await tablesRes.json()
                tables = tablesData.value
            }

            const sheetsData = await sheetsRes.json()

            const combined = [
                ...sheetsData.value.map((s: any) => ({ ...s, type: 'sheet' })),
                ...tables.map((t: any) => ({ ...t, type: 'table' }))
            ]

            return new Response(JSON.stringify({ value: combined }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'list-tables') {
            if (!fileId) throw new Error('File ID is required')
            const token = await getAccessToken(supabase)

            let graphUrl = ''
            if (sheetId) {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables?$select=id,name,showHeaders`
            } else {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables?$select=id,name,showHeaders`
            }

            const response = await fetch(graphUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to list tables')
            }

            const data = await response.json()
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // === WRITE ACTIONS ===

        if (action === 'create-worksheet') {
            if (!fileId || !name) throw new Error('File ID and Name are required')
            const token = await getAccessToken(supabase)

            const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets`
            const response = await fetch(graphUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            })

            if (!response.ok) {
                // If already exists, we should try to get it or just ignore?
                // Check multiple error codes for "Already Exists"
                // response.clone() needed because we might read json twice
                const errClone = await response.clone().json().catch(() => ({}));
                const code = errClone.error?.code;

                if (response.status === 409 ||
                    code === 'NameAlreadyExists' ||
                    code === 'ItemAlreadyExists' ||
                    errClone.error?.message?.includes('exist')) {

                    const sheetsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets`
                    const sheetsRes = await fetch(sheetsUrl, { headers: { 'Authorization': `Bearer ${token}` } })
                    if (sheetsRes.ok) {
                        const sheets = await sheetsRes.json()
                        const existing = sheets.value.find((s: any) => s.name === name)
                        if (existing) {
                            return new Response(JSON.stringify(existing), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                        }
                    }
                }

                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to create worksheet')
            }

            const data = await response.json()
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'update-range') {
            if (!fileId || !sheetId || !values) throw new Error('File ID, Sheet ID and Values are required')

            // Validate values is a 2D array and not empty
            if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
                throw new Error('Values must be a non-empty 2D array');
            }

            const token = await getAccessToken(supabase)

            // Logic to calculate exact range dimensions
            // We expect 'range' to be the start cell (e.g., 'A1', 'B2') or default to 'A1'
            const startCell = range || 'A1';

            const numRows = values.length;
            const numCols = values[0].length;

            // Helper to get Excel Column Letter (0-based index)
            const getColumnLetter = (index: number) => {
                let letter = "";
                while (index >= 0) {
                    letter = String.fromCharCode((index % 26) + 65) + letter;
                    index = Math.floor(index / 26) - 1;
                }
                return letter;
            };

            // Helper to parsing start cell (Simple regex for "LettersDigits")
            const parseCell = (cell: string) => {
                const match = cell.match(/^([A-Z]+)([0-9]+)$/i);
                if (!match) return { col: 0, row: 1 }; // Fallback A1

                const colStr = match[1].toUpperCase();
                const row = parseInt(match[2], 10);

                let col = 0;
                for (let i = 0; i < colStr.length; i++) {
                    col = col * 26 + (colStr.charCodeAt(i) - 64);
                }
                return { col: col - 1, row }; // 0-based col, 1-based row
            };

            const { col: startCol, row: startRow } = parseCell(startCell);

            const endColIndex = startCol + numCols - 1;
            const endRow = startRow + numRows - 1;

            const endColLetter = getColumnLetter(endColIndex);

            const calculatedRange = `${startCell}:${endColLetter}${endRow}`;

            const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`

            const response = await fetch(graphUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to update range')
            }

            const data = await response.json()
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'upload-file') {
            if (!folderId || !name || !values) throw new Error('Folder ID, Name and Content (values) are required')

            const token = await getAccessToken(supabase)
            // Values here is expected to be Base64 string of the file content
            const binaryString = atob(values);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // PUT /me/drive/items/{parent-id}:/{filename}:/content
            const targetId = folderId === 'root' ? 'root' : folderId;
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

            const data = await response.json()
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'create-table') {
            if (!fileId || !sheetId || !range) throw new Error('File ID, Sheet ID and Range are required')
            const token = await getAccessToken(supabase)

            const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables/add`
            const response = await fetch(graphUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address: range, hasHeaders: true })
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                // Aggressively ignore "Already Exists" or "Conflict"
                // 409 Conflict, or specific Error Codes
                if (response.status === 409 ||
                    err.error?.code === 'ItemAlreadyExists' ||
                    err.error?.code === 'NameAlreadyExists' ||
                    err.error?.message?.includes('exist')) {

                    // Try to fetch existing table to return valid data if possible
                    try {
                        const tablesUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/tables?$select=id,name`
                        const tablesRes = await fetch(tablesUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (tablesRes.ok) {
                            const tables = await tablesRes.json();
                            // Return the first table as a best guess
                            const existing = tables.value?.[0];
                            if (existing) {
                                return new Response(JSON.stringify(existing), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                            }
                        }
                    } catch (e) {
                        // Ignore fetch error
                    }
                    // FIX: No devolver datos falsos — lanzar error descriptivo
                    throw new Error('Table may already exist but could not be retrieved')
                } else {
                    throw new Error(err.error?.message || 'Failed to create table')
                }
            }

            const data = await response.json();
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'resize-table') {
            if (!fileId || !tableId || !range) throw new Error('File ID, Table ID and Range are required')
            const token = await getAccessToken(supabase)

            const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/resize`
            const response = await fetch(graphUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetRange: range })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to resize table')
            }

            // Resize returns void (204) usually or the table? Graph API spec says 200/204
            // but we can return success
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'replace-table-data') {
            if (!fileId || !tableId || !sheetId || !values) throw new Error('File ID, Table ID, Sheet ID and Values are required')
            const token = await getAccessToken(supabase)

            // 1. Get current table row count to clear excess later if needed
            const oldRangeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/range?$select=rowCount`
            const oldRangeRes = await fetch(oldRangeUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            let oldRowCount = 0
            if (oldRangeRes.ok) {
                const oldData = await oldRangeRes.json()
                oldRowCount = oldData.rowCount || 0
            }

            // 2. Calculate write range
            const numRows = values.length
            const numCols = values[0].length
            const startCell = range || 'B2'

            const getColumnLetter = (index: number) => {
                let letter = ""
                while (index >= 0) {
                    letter = String.fromCharCode((index % 26) + 65) + letter
                    index = Math.floor(index / 26) - 1
                }
                return letter
            }

            const parseCell = (cell: string) => {
                const match = cell.match(/^([A-Z]+)([0-9]+)$/i)
                if (!match) return { col: 0, row: 1 }
                const colStr = match[1].toUpperCase()
                const row = parseInt(match[2], 10)
                let col = 0
                for (let i = 0; i < colStr.length; i++) col = col * 26 + (colStr.charCodeAt(i) - 64)
                return { col: col - 1, row }
            }

            const { col: startCol, row: startRow } = parseCell(startCell)
            const endColLetter = getColumnLetter(startCol + numCols - 1)
            const endRow = startRow + numRows - 1
            const calculatedRange = `${startCell}:${endColLetter}${endRow}`

            // 3. Write new data to worksheet
            const writeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`
            const writeRes = await fetch(writeUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            })

            if (!writeRes.ok) {
                const err = await writeRes.json().catch(() => ({}))
                throw new Error(err.error?.message || 'Failed to write replacement data')
            }

            // 4. Resize table to match new data
            const resizeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/resize`
            await fetch(resizeUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetRange: calculatedRange })
            })

            // 5. Clear leftover rows if old table was bigger
            if (oldRowCount > numRows) {
                const clearStartRow = endRow + 1
                const clearEndRow = startRow + oldRowCount - 1
                const startColLetter = getColumnLetter(startCol)
                const clearRange = `${startColLetter}${clearStartRow}:${endColLetter}${clearEndRow}`

                await fetch(
                    `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${clearRange}')/clear`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ applyTo: 'Contents' })
                    }
                )
            }

            return new Response(JSON.stringify({ success: true, count: numRows }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'read-table-rows') {
            if (!fileId || !tableId) throw new Error('File ID and Table ID are required')
            const token = await getAccessToken(supabase)

            // Helper functions for normalization (reused from upsert-rows-by-key)
            const normalizeDate = (value: any): string => {
                if (!value) return '';
                const str = String(value).trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
                const ddmmyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (ddmmyyyyMatch) {
                    const [, day, month, year] = ddmmyyyyMatch;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                const num = Number(value);
                if (!isNaN(num) && num > 25000 && num < 60000) {
                    const excelEpoch = new Date(1900, 0, 1);
                    const date = new Date(excelEpoch.getTime() + (num - 2) * 86400000);
                    return date.toISOString().substring(0, 10);
                }
                return str;
            };

            const normalizeTime = (value: any): string => {
                if (!value && value !== 0) return '';
                const num = Number(value);
                if (!isNaN(num) && num >= 0 && num < 1) {
                    const totalMinutes = Math.round(num * 24 * 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }
                const str = String(value).trim();
                if (/^\d{2}:\d{2}$/.test(str)) return str;
                if (/^\d{2}:\d{2}:\d{2}/.test(str)) return str.substring(0, 5);
                if (/^\d{1}:\d{2}/.test(str)) return '0' + str.substring(0, 4);
                return str;
            };

            const normalizeText = (value: any): string => {
                if (!value) return '';
                return String(value).trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
            };

            // 1. Get table rows
            const rowsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows`;
            const rowsRes = await fetch(rowsUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!rowsRes.ok) {
                const err = await rowsRes.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to read table rows');
            }

            const rowsData = await rowsRes.json();
            const rawRows = rowsData.value || [];

            // 2. Get table headers
            const headersUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/headerRowRange`;
            const headersRes = await fetch(headersUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            let headers: string[] = [];
            if (headersRes.ok) {
                const headersData = await headersRes.json();
                headers = (headersData.values?.[0] || []).map((h: any) => normalizeText(h).toLowerCase());
            }

            // 3. Normalize rows and apply date filter
            const dateColIndex = headers.indexOf('date');
            const normalizedRows: any[][] = [];

            for (const row of rawRows) {
                const rowValues = row.values?.[0] || [];
                const normalizedRow: any[] = [];

                for (let i = 0; i < rowValues.length; i++) {
                    const header = headers[i] || '';
                    let value = rowValues[i];

                    if (header === 'date') {
                        value = normalizeDate(value);
                    } else if (header === 'start_time' || header === 'end_time') {
                        value = normalizeTime(value);
                    } else {
                        value = normalizeText(value);
                    }

                    normalizedRow.push(value);
                }

                // Apply date filter if specified
                if (dateFilter && dateColIndex !== -1) {
                    const rowDate = normalizedRow[dateColIndex];
                    if (rowDate !== dateFilter) continue;
                }

                normalizedRows.push(normalizedRow);
            }

            return new Response(JSON.stringify({
                headers,
                rows: normalizedRows,
                rowCount: normalizedRows.length
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'upsert-rows-by-key') {
            if (!fileId || !tableId || !values || !keyColumns) throw new Error('File ID, Table ID, Values, and Key Columns are required')
            const token = await getAccessToken(supabase)

            const headerRow = values[0] as string[]; // New headers
            const inputRows = values.slice(1);

            // 1. Get actual table column headers
            const colsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/columns?$select=name`;
            const colsRes = await fetch(colsUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!colsRes.ok) {
                const err = await colsRes.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to read table columns');
            }

            const colsData = await colsRes.json();
            const tableHeaders: string[] = (colsData.value || []).map((col: any) => col.name);

            // 2. Get existing rows from table (with indices)
            const rowsUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows`;
            const rowsRes = await fetch(rowsUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            let existingRows: any[] = [];
            if (rowsRes.ok) {
                const rowsData = await rowsRes.json();
                existingRows = rowsData.value || [];
            } else {
                const err = await rowsRes.json().catch(() => ({}));
                if (err.error?.code !== 'ItemNotFound') {
                    throw new Error(err.error?.message || 'Failed to read existing rows');
                }
            }

            // Helper functions for normalization
            const normalizeDate = (value: any): string => {
                if (!value) return '';
                const str = String(value).trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
                const ddmmyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (ddmmyyyyMatch) {
                    const [, day, month, year] = ddmmyyyyMatch;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                const num = Number(value);
                if (!isNaN(num) && num > 25000 && num < 60000) {
                    const excelEpoch = new Date(1900, 0, 1);
                    const date = new Date(excelEpoch.getTime() + (num - 2) * 86400000);
                    return date.toISOString().substring(0, 10);
                }
                return str;
            };

            const normalizeTime = (value: any): string => {
                if (!value && value !== 0) return '';

                // Handle Excel decimal time format (0.333333 = 8:00 AM)
                const num = Number(value);
                if (!isNaN(num) && num >= 0 && num < 1) {
                    const totalMinutes = Math.round(num * 24 * 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                }

                // Handle string time formats
                const str = String(value).trim();
                if (/^\d{2}:\d{2}$/.test(str)) return str;
                if (/^\d{2}:\d{2}:\d{2}/.test(str)) return str.substring(0, 5);
                if (/^\d{1}:\d{2}/.test(str)) return '0' + str.substring(0, 4);
                return str;
            };

            const normalizeText = (value: any): string => {
                if (!value) return '';
                return String(value).trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
            };

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

            // 2. Build map of existing rows by key
            const existingRowMap = new Map<string, { index: number, values: any[] }>();

            existingRows.forEach((row: any) => {
                const rowValues = row.values[0]; // Graph API returns values as [[...]]
                const key = getKey(rowValues, tableHeaders); // Use TABLE headers for existing rows
                existingRowMap.set(key, { index: row.index, values: rowValues });
            });

            // 3. Process each input row: UPDATE or INSERT
            let updateCount = 0;
            let insertCount = 0;
            const errors: string[] = [];

            for (let i = 0; i < inputRows.length; i++) {
                const inputRow = inputRows[i];
                const key = getKey(inputRow, headerRow);
                const existing = existingRowMap.get(key);

                if (existing) {
                    // UPDATE: PATCH existing row using itemAt(index=N)
                    try {
                        const updateUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/itemAt(index=${existing.index})`;
                        const updateRes = await fetch(updateUrl, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
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
                    // INSERT: POST new row to /rows/add
                    try {
                        const addUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows/add`;
                        const addRes = await fetch(addUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
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

            if (errors.length > 0) {
                console.error(`Upsert completed with errors. Updated: ${updateCount}, Inserted: ${insertCount}, Errors: ${errors.length}`);
                return new Response(JSON.stringify({
                    success: false,
                    updated: updateCount,
                    inserted: insertCount,
                    errors: errors
                }), {
                    status: 207, // Multi-Status
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({
                success: true,
                updated: updateCount,
                inserted: insertCount
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'format-columns') {
            if (!fileId || !sheetId || !columns) throw new Error('File ID, Sheet ID and Columns Config required')
            const token = await getAccessToken(supabase)

            // columns expected to be { "C": 20, "D": 50 } where keys are column letters or indices?
            // Graph API: worksheet/range(address='C:C')/columnWidth
            // Or worksheet/columns(2)/columnWidth (0-indexed?) NO, columns('C') not valid directly usually.
            // Range approach is safest: range(address='C:C')

            const promises = Object.entries(columns).map(async ([colLetter, width]) => {
                // Ensure colLetter is just letter e.g. "A" -> "A:A"
                const rangeAddr = `${colLetter}:${colLetter}`;
                const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${rangeAddr}')/format`

                return fetch(url, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ columnWidth: width })
                });
            });

            await Promise.all(promises);

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'format-font') {
            if (!fileId || !font) throw new Error('File ID and Font Config required')
            const token = await getAccessToken(supabase)

            // Apply to specific range or fallback to usedRange
            let graphUrl = ''
            if (range) {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${range}')/format/font`
            } else if (tableId) {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/range/format/font`
            } else {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/usedRange/format/font`
            }

            const response = await fetch(graphUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(font)
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to update font')
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (action === 'update-table-style') {
            if (!fileId || !tableId || !style) throw new Error('File ID, Table ID and Style required')
            const token = await getAccessToken(supabase)

            const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}`
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ style: style })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to update table style')
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: corsHeaders })

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error'
        console.error('Graph Error:', message)
        return new Response(JSON.stringify({ error: message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
