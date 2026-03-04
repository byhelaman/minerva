# Deprecación de Reports / Statistics / Incidencias

## Objetivo
Reducir mantenimiento y complejidad operativa, priorizando el flujo principal basado en Excel, Zoom y Pools.

## Alcance aplicado
- Se retiraron las rutas de UI `/reports` y `/statistics`.
- Se removieron los accesos de navegación a Reports y Statistics.
- Se removió la integración de Microsoft de la página `/system` (UI no visible para usuarios).
- Se eliminaron superficies de incidencias en la vista principal de schedules:
  - `Quick Status`
  - `Incidence Details`
  - edición rápida de `status` en tabla
  - paso de "Add Incidence Details" al crear un schedule
- La integración de Microsoft queda deprecada a nivel de experiencia de administración.

## Migración de base de datos
Se agrega la migración `supabase/migrations/012_deprecate_reports_statistics.sql` que realiza:
1. Limpieza de permisos `reports.view` y `reports.manage`.
2. Eliminación de RPCs exclusivas de Reports/Statistics.
3. Limpieza de datos legados de incidencias en `schedule_entries`.
4. Limpieza de configuración de incidencias en `microsoft_account`.

Adicionalmente, la migración `supabase/migrations/013_drop_incidence_columns.sql` aplica la fase drástica:
1. Elimina físicamente todas las columnas de incidencias en `schedule_entries`.
2. Actualiza la función `sanitize_schedule_entry` para operar sin esos campos.
3. Reemplaza `get_schedules_by_dates_v2` para devolver solo columnas base de horarios.

Finalmente, `supabase/migrations/014_recreate_schedule_entries_drop_microsoft.sql` aplica la fase más agresiva:
1. Elimina `microsoft_account` y objetos SQL relacionados con Microsoft.
2. Elimina y recrea `schedule_entries` desde cero con esquema base (sin incidencias).
3. Reinstala RLS, índices, triggers y RPCs de fechas sobre el nuevo esquema.

## Orden recomendado de ejecución (deprecación completa)
1. `012_deprecate_reports_statistics.sql`
2. `013_drop_incidence_columns.sql`
3. `014_recreate_schedule_entries_drop_microsoft.sql`

> Nota: `014` implica reconstrucción de tabla `schedule_entries`; asume respaldo previo.

## Estado de compatibilidad
- No se eliminaron archivos fuente de Reports/Statistics/Microsoft; se desactivaron sus entradas de UI y superficie funcional principal.
- El rollback es posible sin reconstruir módulos desde cero, pero requiere restauración de frontend + SQL.

## Guía detallada de restauración (rollback)

### Ruta rápida recomendada (one-shot)
Si necesitas restaurar rápido en DB, ejecuta primero:

`supabase/manual/restore_reports_statistics.sql`

Este script manual en un solo paso:
- recrea columnas de incidencias,
- restaura permisos `reports.*`,
- recrea RPCs de Reports/Statistics,
- restaura `get_schedules_by_dates_v2` con payload de incidencias.

Luego aplica el rollback de frontend (rutas/nav/UI) descrito abajo.

### 1) Restaurar navegación y rutas (frontend)
1. Reinsertar en `src/App.tsx`:
   - import de `ReportsPage`
   - import de `StatisticsPage`
   - rutas `/reports` y `/statistics`
2. Reinsertar en `src/components/main-nav.tsx`:
   - ítem `Reports`
   - ítem `Statistics`

### 2) Restaurar integración Microsoft en `/system`
1. En `src/features/system/components/SystemPage.tsx`:
   - volver a importar `MicrosoftIntegration`
   - volver a renderizar `<MicrosoftIntegration />` dentro de `<RequirePermission level={100}>`
2. Verificar que `src/features/system/components/MicrosoftIntegration.tsx` muestre nuevamente el flujo requerido (folder/file/table) según política del producto.

### 3) Restaurar permisos `reports.*` en base de datos
Ejecutar SQL (ajustar descripciones si cambian):

```sql
INSERT INTO public.permissions (name, description, min_role_level)
VALUES
  ('reports.view', 'View system reports', 80),
  ('reports.manage', 'Manage reports: import, delete, sync', 80)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'reports.view'),
  ('admin', 'reports.manage'),
  ('super_admin', 'reports.view'),
  ('super_admin', 'reports.manage')
ON CONFLICT (role, permission) DO NOTHING;
```

### 4) Restaurar RPCs de Reports/Statistics
Opciones:
- Reaplicar una migración de restauración que vuelva a crear funciones eliminadas en `012`.
- O recrearlas manualmente a partir de la versión previa de `supabase/migrations/008_schedules_optimization.sql`.

Funciones que deben existir nuevamente:
- `public.get_daily_stats(TEXT, TEXT)`
- `public.get_monthly_incidence_rate(TEXT, TEXT)`
- `public.get_incidence_types(TEXT, TEXT)`
- `public.get_period_comparison(TEXT, TEXT, TEXT, TEXT)`
- `public.get_branch_stats(TEXT, TEXT)`
- `public.get_schedules_report(TEXT, TEXT)`
- `public.batch_delete_schedule_entries(jsonb)`

Y sus grants:

```sql
GRANT EXECUTE ON FUNCTION public.get_daily_stats(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_incidence_rate(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incidence_types(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_comparison(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_stats(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedules_report(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_delete_schedule_entries(jsonb) TO authenticated;
```

### 5) Restaurar datos de incidencias (si fueron limpiados)
La migración `012` hace `UPDATE ... SET ... = NULL` sobre campos de incidencias en `schedule_entries`.
Si se necesita recuperar esos datos, solo es posible desde respaldo (backup/PITR/export histórico).

Si además se ejecutó `013`, primero debes volver a crear columnas de incidencias en `schedule_entries` antes de cualquier rehidratación de datos.

Si además se ejecutó `014`, debes ejecutar también la reconstrucción de `microsoft_account` (estructura + funciones) para reactivar integración Microsoft.

### 6) Restaurar configuración Microsoft de incidencias (si aplica)
`012` también limpia columnas `incidences_*` en `microsoft_account`.
Para recuperarlas:
- Reconfigurar manualmente desde UI restaurada, o
- Cargar valores desde respaldo.

### 7) Validación post-rollback
1. Ejecutar `pnpm tsc --noEmit`.
2. Validar acceso por permisos:
   - admin: Reports visible
   - super_admin: Reports + configuración Microsoft
3. Validar RPCs desde app (sin errores 404/function not found).
4. Verificar que `/reports` y `/statistics` carguen datos.

## Nota
La deprecación es intencionalmente conservadora a nivel de estructura de código para facilitar una posible reactivación futura sin reconstrucción total.
