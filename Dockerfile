FROM node:21-alpine3.18 as deploy

WORKDIR /app

ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

# Crear usuario, grupo y directorio de sesiones
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs && \
    mkdir -p /app/bot_sessions && \
    chown -R nodejs:nodejs /app/bot_sessions

COPY --from=builder /app/assets ./assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/*.json /app/*-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@latest --activate 
ENV PNPM_HOME=/usr/local/bin

RUN npm cache clean --force && \
    pnpm install --production --ignore-scripts && \
    rm -rf $PNPM_HOME/.npm $PNPM_HOME/.node-gyp

COPY entrypoint.sh .
RUN chmod +x ./entrypoint.sh

USER nodejs

CMD ["./entrypoint.sh"]