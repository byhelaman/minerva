// Supabase Edge Function: microsoft-graph
// Interactúa con Microsoft Graph API (OneDrive)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyPermission } from '../_shared/auth-utils.ts'
import { getCorsHeaders } from '../_shared/cors-utils.ts'
import { handleEdgeError } from '../_shared/error-utils.ts'

import { getAccessToken } from './services/graph-client.ts'
import * as readControllers from './controllers/read.ts'
import * as writeControllers from './controllers/write.ts'
import * as syncControllers from './controllers/sync.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        const payload = await req.json()
        const { action, folderId, fileId, sheetId, tableId, range, name, values, keyColumns, columns, style, font, dateFilter } = payload

        // Determinar el permiso requerido según la acción
        const readActions = ['list-children', 'list-worksheets', 'list-content', 'list-tables', 'read-table-rows'];
        const syncActions = ['upsert-rows-by-key', 'replace-table-data'];

        // Verificar permiso basado en el tipo de acción
        if (syncActions.includes(action) || readActions.includes(action)) {
            // Read y Sync pueden ser ejecutados por administradores de reportes o super_admin
            await verifyPermission(req, supabase, ['reports.manage', 'system.manage'])
        } else {
            // Operaciones de escritura (crear, modificar estructura) — solo super_admin
            await verifyPermission(req, supabase, 'system.manage')
        }

        const token = await getAccessToken(supabase)
        let result: any = null

        switch (action) {
            // === READ ACTIONS ===
            case 'list-children':
                result = await readControllers.handleListChildren(token, folderId)
                break
            case 'list-worksheets':
            case 'list-content':
                result = await readControllers.handleListWorksheetsAndTables(token, fileId)
                break
            case 'list-tables':
                result = await readControllers.handleListTables(token, fileId, sheetId)
                break
            case 'read-table-rows':
                result = await readControllers.handleReadTableRows(token, fileId, sheetId, tableId, dateFilter)
                break

            // === WRITE ACTIONS ===
            case 'create-worksheet':
                result = await writeControllers.handleCreateWorksheet(token, fileId, name)
                break
            case 'update-range':
                result = await writeControllers.handleUpdateRange(token, fileId, sheetId, values, range)
                break
            case 'upload-file':
                result = await writeControllers.handleUploadFile(token, folderId, name, values)
                break
            case 'create-table':
                result = await writeControllers.handleCreateTable(token, fileId, sheetId, range)
                break
            case 'resize-table':
                result = await writeControllers.handleResizeTable(token, fileId, tableId, range)
                break
            case 'format-columns':
                result = await writeControllers.handleFormatColumns(token, fileId, sheetId, columns)
                break
            case 'format-font':
                result = await writeControllers.handleFormatFont(token, fileId, sheetId, tableId, range, font)
                break
            case 'update-table-style':
                result = await writeControllers.handleUpdateTableStyle(token, fileId, tableId, style)
                break

            // === SYNC ACTIONS ===
            case 'replace-table-data':
                result = await syncControllers.handleReplaceTableData(token, fileId, sheetId, tableId, values, range)
                break
            case 'upsert-rows-by-key':
                result = await syncControllers.handleUpsertRowsByKey(token, fileId, tableId, values, keyColumns)
                break

            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: corsHeaders })
        }

        // Retornar respuesta unificada
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error: unknown) {
        return handleEdgeError(error, corsHeaders)
    }
})
