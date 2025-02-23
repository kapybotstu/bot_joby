# Image size ~ 350MB
FROM node:21-alpine3.18 as builder

WORKDIR /app

# Configuración PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME=/usr/local/bin

# Copia primero los archivos de configuración
COPY package.json *-lock.yaml ./

# Instala dependencias de compilación y build
RUN apk add --no-cache --virtual .gyp \
    python3 \
    make \
    g++ \
    git \
    ffmpeg \  # Solo para fluent-ffmpeg
    && pnpm install \
    && pnpm run build \
    && apk del .gyp

# Copia el resto del código
COPY . .

FROM node:21-alpine3.18 as deploy

WORKDIR /app

ARG PORT
ENV PORT=$PORT
EXPOSE $PORT

# Copia assets y build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/package.json ./
COPY --from=builder /app/*-lock.yaml ./

# Instala producción
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --prod --ignore-scripts \
    && rm -rf /root/.npm /root/.node-gyp

USER node

CMD ["node", "./dist/app.ts"]