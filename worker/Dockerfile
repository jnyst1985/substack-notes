FROM node:20-slim

# Install Chromium for Puppeteer
RUN apt-get update && \
    apt-get install -y chromium --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json* ./
# Include devDependencies so tsx is available at runtime
RUN npm ci

COPY . .

CMD ["npx", "tsx", "src/cron.ts"]
