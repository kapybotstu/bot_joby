version: '3.9'
services:
  app:
    build: .
    container_name: whatsapp-bot
    environment:
      - PORT=3008
    ports:
      - "3008:3008"
    volumes:
      - ./bot_sessions:/app/bot_sessions  # Directorio persistente para sesiones
      - ./entrypoint.sh:/app/entrypoint.sh
    restart: unless-stopped