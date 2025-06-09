# Simplified Dockerfile for Railway deployment
FROM node:20-alpine

WORKDIR /app

# Install required system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies using npm (more reliable than pnpm in Docker)
RUN npm install

# Copy source code
COPY . .

# Set environment
ARG PORT=3008
ENV PORT=$PORT
EXPOSE $PORT

# Use tsx to run TypeScript directly instead of building
CMD ["npx", "tsx", "src/app.ts"]