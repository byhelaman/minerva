# Minerva v2 — Guía de Despliegue

> Proceso completo para publicar una nueva versión de Minerva.  
> Última actualización: 2026-02-06

---

## Checklist Pre-Release

Antes de crear un release, verificar:

```bash
pnpm tsc --noEmit       # Type-check limpio (sin errores)
pnpm test:run            # Todos los tests pasan
```

Revisar que no hay cambios sin commitear:
```bash
git status
```

---

## Flujo de Lanzamiento

### 1. Actualizar Versión

Incrementar versión **en ambos archivos** (deben coincidir):

| Archivo | Campo |
|---------|-------|
| `package.json` | `"version": "X.Y.Z"` |
| `src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` |

**Convención semántica:**
- **Patch** (0.1.**Z**) — correcciones de bugs, ajustes menores
- **Minor** (0.**Y**.0) — funcionalidades nuevas, cambios no-breaking
- **Major** (**X**.0.0) — cambios breaking, reestructuraciones mayores

### 2. Crear Commit y Tag

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

> **Importante:** El tag debe tener el prefijo `v` (e.g., `v0.2.0`). El workflow de CI se activa con tags que coinciden con `v*`.

### 3. CI/CD — GitHub Actions

El workflow `.github/workflows/release.yml` se ejecuta automáticamente al pushear un tag `v*`:

```
Push tag v* → GitHub Actions
     │
     ├── Setup Node.js + pnpm
     ├── Setup Rust toolchain
     ├── Install dependencies (pnpm install)
     │
     ▼
     tauri-apps/tauri-action
     │
     ├── Build frontend (Vite)
     ├── Build backend (Cargo/Rust)
     ├── Genera instaladores:
     │   ├── MSI (Windows Installer)
     │   └── NSIS (setup.exe)
     │
     ├── Firma los binarios (TAURI_SIGNING_PRIVATE_KEY)
     │
     └── Crea/actualiza Release Draft en GitHub
```

### 4. Publicar en GitHub

1. Esperar que termine la Action (típicamente 5-10 minutos)
2. Ir a **Releases** en el repositorio
3. Encontrar el **Draft** creado por la Action
4. Editar las notas del release si es necesario
5. Hacer clic en **Publish release**

---

## Firma de Binarios

### Requisitos Locales

```
~/.tauri/minerva.key          # Clave privada de firma
~/.tauri/minerva.key.pub      # Clave pública de firma
```

### Secrets de GitHub (requeridos para CI)

| Secret | Propósito |
|--------|-----------|
| `TAURI_SIGNING_PRIVATE_KEY` | Clave privada para firmar los binarios |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña de la clave (si aplica) |

> Sin estas claves, el build de producción **fallará**.

### Generar Claves (primera vez)

```bash
pnpm tauri signer generate -w ~/.tauri/minerva.key
```

Guardar la clave pública en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

---

## Actualizaciones Automáticas

Los usuarios reciben actualizaciones automáticamente:

- **Frecuencia de verificación:** Cada 4 horas
- **Mecanismo:** Plugin `tauri-plugin-updater` consulta el endpoint de GitHub Releases
- **Experiencia:** Diálogo de actualización (`UpdateDialog.tsx`) notifica al usuario cuando hay una nueva versión disponible
- **Descarga:** Se descarga en background, se instala al reiniciar

### Configuración del Updater

En `src-tauri/tauri.conf.json`:
```jsonc
{
    "plugins": {
        "updater": {
            "pubkey": "...",  // Clave pública para verificar firma
            "endpoints": ["https://github.com/.../releases/latest/download/latest.json"]
        }
    }
}
```

---

## Artefactos de Build

Los archivos generados se encuentran en:

```
src-tauri/target/release/
├── bundle/
│   ├── msi/          # Windows Installer (.msi)
│   └── nsis/         # Install wizard (.exe)
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Build falla en CI | Verificar que las secrets de firma están configuradas |
| Tag ya existe | `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` |
| Versiones no coinciden | Asegurar que `package.json` y `tauri.conf.json` tienen la misma versión |
| Action no se trigger | Verificar que el tag tiene prefijo `v` y fue pusheado al remote |
