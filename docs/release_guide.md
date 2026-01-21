# Guía de Despliegue - Minerva

## Flujo de Lanzamiento

### 1. Actualizar Versión
Incrementar versión en:
*   `src-tauri/tauri.conf.json`
*   `package.json`

### 2. Crear Tag y Subir
```bash
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

### 3. Publicar en GitHub
1.  Esperar que termine la Action en GitHub.
2.  Ir a **Releases**, editar el *Draft* y hacer clic en **Publish release**.

---

## Notas Importantes
*   **Firma**: Requiere claves en `~/.tauri/minerva.key` (local) y secrets `TAURI_SIGNING_PRIVATE_KEY` (GitHub).
*   **Updates**: Los usuarios reciben la actualización automáticamente (check cada 4h).
