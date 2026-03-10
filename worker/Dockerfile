# Stage 1: Install Chromium (cached layer)
FROM node:20-slim AS chromium-base
RUN apt-get update && \
    apt-get install -y chromium --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Stage 2: Install dependencies
FROM chromium-base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install tsx

# Stage 3: Production runner
FROM chromium-base AS runner
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY src ./src

CMD ["npx", "tsx", "src/cron.ts"]
