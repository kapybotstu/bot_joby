# Image size ~ 400MB
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
    # Añade esto para Firebase y FFmpeg
    libc6-compat \
    ffmpeg \
    && pnpm install \
    && pnpm run build \
    && apk del .gyp

# Copia el resto del código después de instalar dependencias
COPY . .

FROM node:21-alpine3.18 as deploy

WORKDIR /app

ARG PORT
ENV PORT=$PORT
EXPOSE $PORT

# Copia solo lo necesario para producción
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/package.json ./
COPY --from=builder /app/*-lock.yaml ./

# Instala solo dependencias de producción
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --prod --ignore-scripts \
    && rm -rf /root/.npm /root/.node-gyp

# Usa un usuario no root
USER node

CMD ["node", "./dist/app.js"]

