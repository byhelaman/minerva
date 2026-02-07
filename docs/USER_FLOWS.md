# Minerva v2 — Flujos de Usuario

> Cada flujo documenta el recorrido del usuario, componentes involucrados, flujo de datos e interacciones con el backend.  
> Última actualización: 2026-02-06

---

## Tabla de Contenidos

1. [Autenticación](#1-autenticación)
2. [Carga y Edición de Horarios](#2-carga-y-edición-de-horarios)
3. [Publicación de Horarios](#3-publicación-de-horarios)
4. [Emparejamiento Zoom](#4-emparejamiento-zoom)
5. [Gestión de Incidencias](#5-gestión-de-incidencias)
6. [Reportes y Sincronización con OneDrive](#6-reportes-y-sincronización-con-onedrive)
7. [Administración del Sistema](#7-administración-del-sistema)
8. [Configuración de Integración (Zoom)](#8-configuración-de-integración-zoom)
9. [Configuración de Integración (Microsoft)](#9-configuración-de-integración-microsoft)

---

## 1. Autenticación

### 1.1 Login

```
El usuario abre la app
     │
     ▼
LoginPage.tsx renderiza el formulario de login
     │
     ▼
El usuario envía email + contraseña
     │
     ├── rate-limiter.ts verifica el estado de bloqueo
     │   └── Si bloqueado → muestra "Demasiados intentos" + cuenta regresiva
     │
     ▼
AuthProvider.signIn(email, password)
     │
     ├── supabase.auth.signInWithPassword()
     │   └── Supabase retorna sesión con JWT
     │
     ▼
onAuthStateChange se dispara con evento SIGNED_IN
     │
     ├── extractProfileFromSession(session)
     │   └── jwtDecode → { user_role, hierarchy_level, permissions[] }
     │
     ├── supabase.rpc('verify_user_exists', { p_user_id })
     │   └── Confirma que el usuario tiene una fila de perfil válida
     │
     ▼
Perfil establecido → isLoading = false → ProtectedRoute renderiza la app
     │
     ▼
GlobalSyncManager se ejecuta:
     ├── Sincroniza tema desde configuración
     └── Si nivel ≥ 60 → fetchZoomData()
```

**Componentes:** `LoginPage` → `AuthProvider` → `ProtectedRoute` → `GlobalSyncManager`  
**Stores/Contexto:** `AuthContext`  
**Supabase:** `auth.signInWithPassword`, RPC `verify_user_exists`

### 1.2 Registro (OTP)

```
El usuario hace clic en "Crear Cuenta" en LoginPage
     │
     ▼
SignupDialog.tsx se abre
     │
     ▼
El usuario ingresa email → AuthProvider.signUp(email, password, displayName)
     │
     ├── supabase.auth.signUp({ email, password, options: { data: { display_name } } })
     │   └── Supabase envía email con OTP
     │
     ▼
El usuario ingresa el OTP → AuthProvider.verifyOtp(email, token, "signup")
     │
     ├── supabase.auth.verifyOtp({ email, token, type: 'signup' })
     │   └── Se crea sesión con rol predeterminado "guest" (trigger handle_new_user)
     │
     ▼
Auto-login → mismo flujo que Login (paso: onAuthStateChange)
```

### 1.3 Restablecimiento de Contraseña

```
El usuario hace clic en "Olvidé mi contraseña" en LoginPage
     │
     ▼
ForgotPasswordDialog.tsx se abre
     │
     ▼
Paso 1: Email → AuthProvider.sendResetPasswordEmail(email)
     │         └── supabase.auth.resetPasswordForEmail(email)
     │
Paso 2: OTP → AuthProvider.verifyOtp(email, token, "recovery")
     │
Paso 3: Nueva contraseña → AuthProvider.updatePassword(newPassword)
              └── supabase.auth.updateUser({ password })
```

---

## 2. Carga y Edición de Horarios

### 2.1 Carga de Excel (entrada principal de datos)

```
El usuario hace clic en "Cargar" en el ScheduleDashboard
     │
     ▼
UploadModal.tsx se abre → selector de archivos (acepta .xlsx)
     │
     ▼
excel-parser.ts procesa el archivo:
     │
     ├── Detecta formato (estándar vs exportado)
     │   ├── Estándar: parsea por índices fijos de fila/columna (PARSER_CONFIG)
     │   └── Exportado: parsea por detección de encabezado
     │
     ├── Extrae array Schedule[]
     │   └── Cada fila → { date, shift, branch, start_time, end_time, code, instructor, program, minutes, units }
     │
     ├── schedule-schema.ts valida con Zod v4
     │
     ▼
useScheduleDataStore.setBaseSchedules(schedules)
     │
     ├── useScheduleUIStore.setActiveDate(schedules[0].date)
     │
     ├── Auto-guardado a archivo local:
     │   └── Tauri FS → AppLocalData/minerva_schedules_draft.json
     │
     ▼
ScheduleDataTable renderiza los datos
     │
     └── También obtiene incidencias existentes de la DB para esa fecha:
         └── scheduleEntriesService.getIncidencesByDate(date)
```

**Componentes:** `UploadModal` → `ScheduleDashboard` → `ScheduleDataTable`  
**Utilidades:** `excel-parser.ts`, `schedule-schema.ts`  
**Stores:** `useScheduleDataStore`, `useScheduleUIStore`

### 2.2 Entrada Manual de Horarios

```
El usuario hace clic en "Agregar" en el ScheduleDashboard
     │
     ▼
AddScheduleModal.tsx se abre → formulario con campos del horario
     │
     ▼
Al enviar → se agrega a useScheduleDataStore.baseSchedules
     │
     └── Se dispara auto-guardado
```

### 2.3 Auto-Guardado de Borrador

```
Cualquier cambio en baseSchedules dispara:
     │
     ├── Debounce de 5 segundos (settings.autoSaveInterval)
     │
     ▼
Escritura en Tauri FS → AppLocalData/minerva_schedules_draft.json
     │
     └── Al próximo inicio de la app:
         └── ScheduleDashboard.loadAutosave() restaura el borrador
```

---

## 3. Publicación de Horarios

### 3.1 Publicar a Supabase (DB)

```
El usuario hace clic en "Publicar" en la toolbar → PublishToDbModal se abre
     │
     ├── Verificación: ¿ya existe esta fecha?
     │   └── useScheduleSyncStore.checkIfScheduleExists(date)
     │       └── Supabase: SELECT from published_schedules WHERE schedule_date = date
     │
     ├── Si existe → confirmación "¿Sobrescribir?"
     │
     ▼
useScheduleSyncStore.publishToSupabase(overwrite)
     │
     ├── Upsert de fila en published_schedules (date, entries_count, published_by)
     │
     ├── scheduleEntriesService.publishSchedules(date, schedules)
     │   └── Supabase: UPSERT en schedule_entries
     │       Clave: (date, program, start_time, instructor)
     │       Excluidos del upsert: status, substitute, type (campos de incidencia)
     │
     ▼
Toast: "Publicado exitosamente"
     │
     └── ScheduleUpdateBanner verifica actualizaciones de versión (suscripción Realtime)
```

**Componentes:** `PublishToDbModal` → `ScheduleUpdateBanner`  
**Stores:** `useScheduleSyncStore`, `useScheduleDataStore`  
**Servicios:** `scheduleEntriesService.publishSchedules`  
**Supabase:** `published_schedules`, `schedule_entries`

---

## 4. Emparejamiento Zoom

### 4.1 Emparejamiento Automático (Web Worker)

```
El usuario tiene horarios cargados → hace clic en "Emparejar Zoom" (ícono Bot)
     │
     ▼
ScheduleDashboard → useZoomStore.runMatching(schedules)
     │
     ├── _initWorker(meetings, users)
     │   └── Crea/reutiliza Web Worker (match.worker.ts)
     │       └── Worker inicializa MatchingService con meetings + users
     │
     ├── Worker.postMessage({ type: 'MATCH_ALL', schedules })
     │
     ▼ (fuera del hilo principal)
     │
     MatchingService.matchAll(schedules):
     │
     │  Para cada horario:
     │  ├── [1] Coincidencia exacta (búsqueda en diccionario normalizado)
     │  ├── [2] Búsqueda fuzzy Fuse.js (basada en umbral)
     │  └── [3] Fallback por conjunto de tokens (puntuación por intersección)
     │
     │  Para cada candidato:
     │  ├── ScoringEngine evalúa con reglas de penalización:
     │  │   ├── topicMismatch (distancia de Levenshtein)
     │  │   ├── instructorNotHost (email del host vs nombre del instructor)
     │  │   ├── timeDrift (diferencia de hora de inicio)
     │  │   ├── programTypeMismatch (ej: TK vs FLEX)
     │  │   └── companyConflict (nombre de empresa en programa incorrecto)
     │  │
     │  └── Decisión por umbral:
     │      ├── score ≥ THRESHOLDS.assign → status: 'assigned'
     │      ├── score ≥ THRESHOLDS.suggest → status: 'ambiguous'
     │      └── en otro caso → status: 'not_found'
     │
     ▼
     Worker.postMessage({ type: 'RESULTS', results: MatchResult[] })
     │
     ├── useZoomStore.set({ matchResults })
     │
     ▼
     ScheduleDataTable renderiza estado de emparejamiento por fila
     └── StatusCell, InstructorCell muestran datos de emparejamiento
```

**Componentes:** `ScheduleDashboard` → `ScheduleDataTable` → `StatusCell`  
**Stores:** `useZoomStore`  
**Workers:** `match.worker.ts` → `MatchingService` → `ScoringEngine`

### 4.2 Resolución Manual de Conflictos

```
Una fila muestra estado "ambiguous" → el usuario hace clic en la acción de fila
     │
     ▼
SearchLinkModal.tsx se abre con lista de candidatos
     │
     ├── El usuario selecciona una reunión manualmente
     │
     ▼
useZoomStore.resolveConflict(schedule, selectedMeeting)
     │
     └── matchResult actualizado → status: 'assigned', meeting_id establecido
```

### 4.3 Operaciones por Lotes

```
Después del emparejamiento, el usuario hace clic en "Crear Reuniones" o "Asignar"
     │
     ├── CreateLinkModal → useZoomStore.createMeetings(topics[])
     │   └── Por lotes: 30 ítems/chunk, 3.5s de pausa entre chunks
     │       └── Edge Function: zoom-api (POST meetings)
     │
     ├── AssignLinkModal → useZoomStore.executeAssignments(schedules)
     │   └── Por lotes: 30 ítems/chunk, 3.5s de pausa
     │       └── Edge Function: zoom-api (PATCH meetings)
     │
     └── Barra de progreso: syncProgress (0–100)
```

---

## 5. Gestión de Incidencias

### 5.1 Registrar Incidencia

```
El usuario hace clic derecho en una fila de horario → "Registrar Incidencia"
     │
     ▼
IncidenceModal.tsx se abre → IncidenceFormContent.tsx renderiza el formulario
     │
     ├── Campos de incidencia:
     │   ├── status: "sustitución" | "cancelación" | "cobertura" | ...
     │   ├── substitute: nombre del instructor (opcional)
     │   ├── type: de incidence-presets.ts
     │   ├── subtype, description, department, feedback
     │
     ▼
useScheduleDataStore.updateIncidence(incidence)
     │
     ├── scheduleEntriesService.upsertIncidence(incidence)
     │   └── Supabase: UPSERT en schedule_entries
     │       Clave: (date, program, start_time, instructor)
     │
     └── incidencesVersion++ (dispara re-renderizado en UI)
```

### 5.2 Sincronizar Incidencias a OneDrive

```
El usuario hace clic en "Sincronizar a Excel" en la toolbar del ScheduleDashboard
     │
     ▼
microsoft-publisher.ts → publishIncidencesToExcel(incidences, config)
     │
     ├── Edge Function: microsoft-graph (acción: 'upsert-rows-by-key')
     │   └── Upsert de filas de incidencia en la tabla Excel conectada
     │
     └── Actualiza marca de tiempo synced_at en DB
```

---

## 6. Reportes y Sincronización con OneDrive

### 6.1 Ver Reportes Publicados

```
El usuario navega a /reports (requiere: permiso reports.view)
     │
     ▼
ReportsPage.tsx carga
     │
     ├── Selector de rango de fechas → predeterminado: hoy
     │
     ├── scheduleEntriesService.getSchedulesByDateRange(from, to)
     │   └── Supabase: SELECT from schedule_entries WHERE date BETWEEN from AND to
     │
     ├── mergeSchedulesWithIncidences(schedules, incidences)
     │
     ▼
ScheduleDataTable renderiza con definiciones de data-source-columns
     │
     └── Filtro: toggle "Mostrar solo incidencias"
```

### 6.2 Importar desde OneDrive

```
El usuario hace clic en "Importar" (requiere: permiso reports.manage)
     │
     ▼
ImportReportsModal.tsx se abre
     │
     ├── microsoft-import-service.ts obtiene lista de archivos de OneDrive
     │   └── Edge Function: microsoft-graph (acción: 'list-children')
     │
     ├── El usuario selecciona archivos Excel
     │
     ├── Lee datos de hojas de cálculo:
     │   └── Edge Function: microsoft-graph (acción: 'read-table-rows')
     │
     ▼
Datos parseados → scheduleEntriesService.publishSchedules(date, data)
     └── Se almacenan en tabla schedule_entries
```

### 6.3 Sincronización a OneDrive (Multi-día)

```
El usuario selecciona rango de fechas → hace clic en "Sincronizar" (requiere: reports.manage)
     │
     ├── Precondición: msConfig.isConnected = true
     │   └── useScheduleSyncStore.refreshMsConfig() verifica estado de Microsoft
     │       └── Edge Function: microsoft-auth (acción: 'status')
     │
     ▼
Para cada fecha en el rango:
     │
     ├── Obtiene horarios de la DB
     ├── microsoft-publisher publica a OneDrive
     │   └── Edge Function: microsoft-graph (acción: 'upsert-rows-by-key')
     │
     └── Actualiza marcas de tiempo synced_at
```

### 6.4 Exportar a Excel Local

```
El usuario hace clic en "Exportar" en ReportsPage
     │
     ▼
Crea workbook XLSX con la librería `xlsx`
     │
     ├── excel-styles.ts aplica formato
     │
     ▼
secureSaveFile(buffer, filename)
     │
     └── Diálogo de Tauri → el usuario elige ubicación → archivo escrito
```

---

## 7. Administración del Sistema

### 7.1 Gestión de Usuarios

```
Admin navega a /system (requiere: nivel ≥ 80)
     │
     ▼
SystemPage → tarjeta "Gestionar Usuarios" → ManageUsersModal
     │
     ├── supabase.rpc('get_user_count')
     │
     ├── Lista usuarios: Supabase desde profiles + vista user_roles
     │
     ├── Acciones:
     │   ├── Cambiar rol → supabase.rpc('update_user_role', { target_id, new_role })
     │   │   └── Aplica jerarquía: admin no puede asignar super_admin
     │   │
     │   └── Eliminar usuario → supabase.rpc('delete_user', { target_id })
     │       └── Solo si el nivel del llamador > nivel del objetivo
     │
     └── Suscripción Realtime en tabla profiles
```

### 7.2 Gestión de Roles

```
SystemPage → "Gestionar Roles" → ManageRolesModal
     │
     ├── roles/use-roles.ts hook → obtiene roles + permisos
     │
     ├── RolesList → RoleDetails → RoleDialogs
     │
     └── Operaciones CRUD en tabla roles (solo super_admin para crear/eliminar)
```

---

## 8. Configuración de Integración (Zoom)

```
Super Admin navega a /system
     │
     ▼
ZoomIntegration.tsx renderiza tarjeta de conexión (RequirePermission level={100})
     │
     ├── Conectar:
     │   └── Edge Function: zoom-auth (acción: 'init')
     │       ├── Crea estado OAuth (DB: RPC create_oauth_state)
     │       ├── Retorna URL OAuth de Zoom
     │       └── Abre URL → usuario autoriza → Zoom redirige de vuelta
     │           └── Edge Function: zoom-auth (acción: 'callback')
     │               ├── Intercambia código por tokens
     │               ├── Almacena tokens en Vault (RPC store_zoom_credentials)
     │               └── Crea fila en zoom_account
     │
     ├── Desconectar:
     │   └── Edge Function: zoom-auth (acción: 'disconnect')
     │       ├── Revoca tokens de Zoom
     │       ├── Elimina secretos de Vault (RPC delete_zoom_secrets)
     │       └── Elimina fila de zoom_account
     │
     └── Sincronizar:
         └── Edge Function: zoom-sync
             ├── Obtiene todos los usuarios de Zoom (paginado)
             ├── Obtiene todas las reuniones de Zoom (paginado)
             └── Upsert en tablas zoom_users + zoom_meetings
```

---

## 9. Configuración de Integración (Microsoft)

```
Super Admin navega a /system
     │
     ▼
MicrosoftIntegration.tsx renderiza tarjeta de conexión (RequirePermission level={100})
     │
     ├── Conectar:
     │   └── Edge Function: microsoft-auth (acción: 'init')
     │       ├── Crea estado OAuth (DB)
     │       ├── Retorna URL OAuth de Microsoft
     │       └── Abre URL → usuario autoriza → Microsoft redirige de vuelta
     │           └── Edge Function: microsoft-auth (acción: 'callback')
     │               ├── Intercambia código por tokens
     │               ├── Almacena tokens en Vault
     │               └── Crea fila en microsoft_account
     │
     ├── Configurar OneDrive:
     │   └── MicrosoftFileTree.tsx → navegar carpetas de OneDrive
     │       ├── Seleccionar "Carpeta de Horarios" → almacena folder ID
     │       └── Seleccionar "Archivo de Incidencias" → almacena IDs de archivo/hoja/tabla
     │       └── Edge Function: microsoft-graph (acción: 'list-children')
     │
     ├── Desconectar:
     │   └── Edge Function: microsoft-auth (acción: 'disconnect')
     │       ├── Elimina secretos de Vault (RPC delete_microsoft_secrets)
     │       └── Elimina fila de microsoft_account
     │
     └── Verificación de Estado:
         └── Edge Function: microsoft-auth (acción: 'status')
             └── Retorna detalles de conexión + configuración de carpetas/archivos
             └── Accesible por: reports.manage O system.manage
```

---

## Matriz de Permisos (Funcionalidad × Rol)

| Funcionalidad | viewer (10) | operator (50) | moderator (60) | admin (80) | super_admin (100) |
|---|---|---|---|---|---|
| Ver horarios | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cargar/editar horarios | ❌ | ✅ | ✅ | ✅ | ✅ |
| Publicar horarios | ❌ | ❌ | ❌ | ✅ | ✅ |
| Emparejamiento Zoom | ❌ | ❌ | ✅ | ✅ | ✅ |
| Ver reportes | ❌ | ❌ | ❌ | ✅ | ✅ |
| Importar/sincronizar reportes | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gestionar usuarios/roles | ❌ | ❌ | ❌ | ✅ | ✅ |
| Conectar integraciones | ❌ | ❌ | ❌ | ❌ | ✅ |
| Enviar reportes de bugs | ✅ | ✅ | ✅ | ✅ | ✅ |
