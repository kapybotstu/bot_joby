# 📱 Vinculación del Bot de WhatsApp

## 🔗 Cómo vincular el bot con WhatsApp

### Primera vez / Nueva vinculación

1. **Ejecutar el bot en modo desarrollo**:
   ```bash
   ./dev.sh
   ```
   
2. **Seleccionar limpiar sesiones** cuando se te pregunte (presiona 's')

3. **Esperar a que aparezca el código QR**:
   - Se guardará automáticamente en `bot.qr.png`
   - También se mostrará en la consola

4. **Escanear con WhatsApp**:
   - Abre WhatsApp en tu teléfono
   - Ve a Configuración → Dispositivos vinculados
   - Toca "Vincular dispositivo"
   - Escanea el código QR

5. **Número objetivo**: +56 9 4231 9817

### Reconexión (sesión existente)

Si ya has vinculado el bot antes:

1. **Ejecutar normalmente**:
   ```bash
   npm run dev
   ```
   
2. El bot se reconectará automáticamente usando la sesión guardada

### 🚀 En producción (Railway)

En Railway, el bot mantendrá la sesión automáticamente:

- Las sesiones se guardan en `bot_sessions/`
- No necesitas escanear el QR cada vez
- Si necesitas re-vincular, deberás acceder a los logs de Railway

### ⚠️ Solución de problemas

**Si el QR no aparece**:
- Verifica que no exista una sesión previa
- Usa `./dev.sh` y selecciona limpiar sesiones

**Si la conexión se pierde**:
- El bot intentará reconectar automáticamente
- Si falla, limpia las sesiones y vuelve a vincular

**Timeout del QR**:
- El código QR expira en 2 minutos
- Si expira, reinicia el bot para generar uno nuevo

### 📁 Archivos importantes

- `bot_sessions/` - Carpeta con los datos de sesión
- `bot.qr.png` - Imagen del código QR
- `.env` - Variables de entorno (API keys)