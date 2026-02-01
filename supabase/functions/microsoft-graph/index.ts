// Supabase Edge Function: microsoft-graph
// Interactúa con Microsoft Graph API (OneDrive)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../_shared/auth-utils.ts'

const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID')!
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET')!
const MS_REDIRECT_URI = Deno.env.get('MS_REDIRECT_URI')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    }
}

async function getAccessToken(supabase: any) {
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
        await supabase.rpc('store_microsoft_credentials', {
            p_user_id: creds.microsoft_user_id,
            p_email: creds.microsoft_email,
            p_name: null, // Don't update name on refresh to avoid graph call
            p_access_token: tokens.access_token,
            p_refresh_token: tokens.refresh_token || creds.refresh_token, // Sometimes refresh token doesn't rotate
            p_scope: tokens.scope,
            p_expires_in: tokens.expires_in
        })

        return tokens.access_token
    }

    return creds.access_token
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        await verifyPermission(req, supabase, 'system.manage')

        const { action, folderId, fileId, sheetId, tableId, range, name, values, keyColumns, columns, style } = await req.json()

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

        if (action === 'get-range') {
            if (!fileId) throw new Error('File ID is required')
            if (!sheetId && !tableId) throw new Error('Sheet ID or Table ID is required')

            const token = await getAccessToken(supabase)
            let graphUrl = ''

            if (tableId) {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/range`
            } else {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/`
                if (range) {
                    graphUrl += `range(address='${range}')`
                } else {
                    graphUrl += `usedRange`
                }
            }

            graphUrl += `?$select=address,columnCount,rowCount,text`

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

        if (action === 'append-row') {
            if (!fileId || (!tableId && !sheetId) || !values) throw new Error('File ID, Table/Sheet ID and Values are required')
            const token = await getAccessToken(supabase)

            let graphUrl = ''
            // Prefer Table Append if tableId is given (structured)
            if (tableId) {
                graphUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/rows`
            } else {
                // If only sheetId, we can't easily "append" without knowing the last row.
                // But for pure tables, usually we use table endpoints.
                // If it's just a raw sheet, we might need to find the last used row first.
                // For Incidences, we strongly recommend using a Pivot Table or ListObject (Table).
                // Let's assume Table for now as it's cleaner.
                throw new Error('Append Row currently requires a Table ID')
            }

            const response = await fetch(graphUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values }) // Array of arrays
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error?.message || 'Failed to append row')
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
                    // Fallback: Return dummy success
                    return new Response(JSON.stringify({ id: 'existing_table_ignored', name: 'Table1' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    })
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

        if (action === 'upsert-rows-by-key') {
            if (!fileId || (!tableId && !sheetId) || !values || !keyColumns) throw new Error('File ID, Table/Sheet ID, Values, and Key Columns are required')
            const token = await getAccessToken(supabase)

            // 1. Get existing data
            let rangeUrl = '';
            if (tableId) {
                rangeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/tables/${tableId}/range?$select=values`
            } else {
                rangeUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/usedRange?$select=values`
            }

            const rangeRes = await fetch(rangeUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            })

            let existingValues: any[] = [];
            if (rangeRes.ok) {
                const rangeData = await rangeRes.json();
                existingValues = rangeData.values || [];
            } else {
                // If 404 ItemNotFound, it means table or range empty/doesn't exist. 
                // We treat it as empty and proceed to create/fill.
                // If other error, we log but maybe still try? No, likely fatal if permission etc.
                const err = await rangeRes.json().catch(() => ({}));
                if (err.error?.code !== 'ItemNotFound') {
                    // Only throw if NOT ItemNotFound
                    throw new Error(err.error?.message || 'Failed to read existing data for upsert');
                }
            }

            // If empty, just write everything (or if only headers)
            if (existingValues.length <= 1) {
                // If truly empty, we can just write the data.
            }

            const headerRow = values[0] as string[]; // New headers
            const inputRows = values.slice(1);

            const existingHeaders = existingValues[0] as string[];
            const existingRows = existingValues.slice(1);

            // Map hash key -> row index
            // We assume headers match or we rely on column Index. 
            // Better to rely on valid mapping. For now assume same schema.

            const getKey = (row: any[]) => {
                return keyColumns.map((col: string) => {
                    const idx = headerRow.indexOf(col);
                    return idx !== -1 ? String(row[idx]) : '';
                }).join('|');
            };

            const existingMap = new Map<string, any[]>();
            existingRows.forEach((row: any[]) => {
                const key = getKey(row);
                if (key) existingMap.set(key, row);
            });

            // Upsert Logic
            inputRows.forEach((newRow: any[]) => {
                const key = getKey(newRow);
                // Always overwrite/update with new data if key matches, or add if not
                existingMap.set(key, newRow);
            });

            // Reconstruct Table Data
            // We want to preserve order? Or just dump map?
            // If we want to preserve order of existing non-touched items, we might need a better structure.
            // But Map preserves insertion order in JS mostly.
            // Requirement: "Upsert" usually implies updating in place or appending.
            // Simple approach: Convert Map values back to array. 
            // Note: This effectively "moves" updated rows to their new position if we just iterate map, 
            // or we can iterate original existingRows to keep order and update, then append new.

            const mergedRows: any[] = [];
            const processedKeys = new Set<string>();

            // 1. Update existing in-place (preserve order)
            existingRows.forEach((row: any[]) => {
                const key = getKey(row);
                if (existingMap.has(key)) {
                    mergedRows.push(existingMap.get(key));
                    processedKeys.add(key);
                } else {
                    // Should not happen as we checked has(key) from map built from existing
                    mergedRows.push(row);
                }
            });

            // 2. Append new items
            inputRows.forEach((row: any[]) => {
                const key = getKey(row);
                if (!processedKeys.has(key)) {
                    mergedRows.push(row);
                }
            });

            const finalValues = [headerRow, ...mergedRows];

            // Write back entire range
            // We reuse update-range logic basically but calculated here
            // Need to calculate range dimensions
            const numRows = finalValues.length;
            const numCols = finalValues[0].length;

            // Helper for Column Letter
            const getColumnLetter = (index: number) => {
                let letter = "";
                while (index >= 0) {
                    letter = String.fromCharCode((index % 26) + 65) + letter;
                    index = Math.floor(index / 26) - 1;
                }
                return letter;
            };

            // Assuming Start Cell B2 (Hardcoded for this specific logic or passed param?)
            // Ideally passthrough. Let's assume passed in 'range' param (start cell)
            const startCell = range || 'A1';

            // ... (Same parsing logic as update-range) ... 
            const parseCell = (cell: string) => {
                const match = cell.match(/^([A-Z]+)([0-9]+)$/i);
                if (!match) return { col: 0, row: 1 };
                const colStr = match[1].toUpperCase();
                const row = parseInt(match[2], 10);
                let col = 0;
                for (let i = 0; i < colStr.length; i++) col = col * 26 + (colStr.charCodeAt(i) - 64);
                return { col: col - 1, row };
            };
            const { col: startCol, row: startRow } = parseCell(startCell);
            const endColLetter = getColumnLetter(startCol + numCols - 1);
            const endRow = startRow + numRows - 1;
            const calculatedRange = `${startCell}:${endColLetter}${endRow}`;

            const updateUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${calculatedRange}')`

            const updateRes = await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: finalValues })
            })

            if (!updateRes.ok) {
                // If 404, maybe table deleted? 
                const err = await updateRes.json().catch(() => ({}))

                if (updateRes.status === 404 || err.error?.code === 'ItemNotFound') {
                    // We can't write, but we don't want 500.
                    // Maybe return success: false?
                    throw new Error(`Sync Error: Table not found during write. Please try again.`)
                }

                throw new Error(err.error?.message || 'Failed to write upserted data')
            }

            return new Response(JSON.stringify({ success: true, count: finalValues.length }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
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
                const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/workbook/worksheets/${sheetId}/range(address='${rangeAddr}')/format/columnWidth`

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

    } catch (error: any) {
        console.error('Graph Error', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
