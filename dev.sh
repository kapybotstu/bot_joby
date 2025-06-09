#!/bin/bash

echo "🤖 Bot de WhatsApp - Modo Desarrollo"
echo "====================================="
echo ""
echo "¿Deseas limpiar las sesiones anteriores?"
echo "Esto generará un nuevo código QR para vincular"
echo ""
read -p "Limpiar sesiones? (s/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ss]$ ]]
then
    export CLEAN_SESSIONS=true
    echo "✅ Se limpiarán las sesiones al iniciar"
else
    export CLEAN_SESSIONS=false
    echo "📂 Se mantendrán las sesiones existentes"
fi

export NODE_ENV=development
echo ""
echo "🚀 Iniciando bot en modo desarrollo..."
echo ""

npm run dev