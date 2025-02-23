# Etapa de construcción
FROM node:21-alpine3.18 as builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME=/usr/local/bin

COPY package*.json *-lock.yaml ./

RUN apk add --no-cache --virtual .gyp \
        python3 \
        make \
        g++ \
    && apk add --no-cache git \
    && pnpm install \
    && pnpm run build \
    && apk del .gyp

# Etapa de producción
FROM node:21-alpine3.18

WORKDIR /app

ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

# Crear usuario y directorio de sesiones primero
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs && \
    mkdir -p /app/bot_sessions && \
    chown -R nodejs:nodejs /app/bot_sessions

# Copiar desde builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY package*.json ./

# Configurar producción
RUN npm cache clean --force && \
    pnpm install --production && \
    rm -rf $PNPM_HOME/.npm $PNPM_HOME/.node-gyp

USER nodejs

CMD ["node", "dist/app.js"]