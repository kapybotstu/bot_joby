# Railway Deployment - Production Ready v3
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ git

# Copy and install dependencies
COPY package.json ./
RUN npm install --production=false

# Copy source code
COPY . .

# Environment
ENV NODE_ENV=production
ENV PORT=${PORT:-3008}
EXPOSE ${PORT}

# Start application using tsx
CMD ["npx", "tsx", "src/app.ts"]