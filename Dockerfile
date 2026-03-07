# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install ffmpeg for metadata embedding
RUN apk add --no-cache ffmpeg

# Copy built app and dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create music directory
RUN mkdir -p /music

# Environment variables
ENV NODE_ENV=production
ENV MUSIC_DIR=/music
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "build"]
