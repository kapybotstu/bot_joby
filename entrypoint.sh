#!/bin/sh
set -e

# Asegurar permisos en el directorio de sesiones
chown -R nodejs:nodejs /app/bot_sessions

# Iniciar aplicación
exec npm start