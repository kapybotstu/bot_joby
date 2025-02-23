# Builder stage
FROM node:21-alpine3.18 as builder

WORKDIR /app

# Configurar PNPM primero
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME=/usr/local/bin

# Copiar solo lo necesario para instalar dependencias
COPY package.json *-lock.yaml ./

# Instalar dependencias de compilación
RUN apk add --no-cache --virtual .gyp \
    python3 \
    make \
    g++ \
    git \
    && pnpm install \
    && pnpm run build \
    && apk del .gyp

# Copiar el resto del código
COPY . .

# Deploy stage
FROM node:21-alpine3.18 as deploy

WORKDIR /app

# Configurar puerto
ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

# Copiar desde builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from-builder /app/package.json ./
COPY --from=builder /app/*-lock.yaml ./

# Instalar producción
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --prod --ignore-scripts \
    && addgroup -g 1001 -S nodejs \
    && adduser -S -u 1001 nodejs \
    && rm -rf /root/.npm /root/.node-gyp

# Ejecutar como usuario no-root
USER nodejs

CMD ["node", "./dist/app.js"]