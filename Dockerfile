# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app

# Installiere Build-Tools für native Module
RUN apk add --no-cache python3 make g++

# Kopiere nur package.json Dateien für effizienteres Caching
COPY package*.json ./
COPY server/package*.json ./server/

# Installiere Root-Abhängigkeiten (npm ci ist schneller und zuverlässiger als npm install)
RUN npm ci --production

# Installiere Abhängigkeiten im server-Verzeichnis
WORKDIR /app/server
RUN npm ci --production

# Runtime Stage - Nur nötige Dateien werden übernommen
FROM node:18-alpine

WORKDIR /app

# Kopiere nur die node_modules vom Builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules

# Kopiere Projektdateien
COPY . .

# Erstelle erforderliche Verzeichnisse
RUN mkdir -p config server/sessions

# Setze Berechtigungen für sessions-Verzeichnis
RUN chmod 755 server/sessions

# Optimiere Node.js-Speichernutzung
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NODE_ENV=production

EXPOSE 3420

# Prüfe, ob alle Module korrekt installiert wurden
RUN node -e "require('express'); require('ws'); require('ip'); console.log('Module verfügbar')"

# Starte den Server
CMD ["node", "server/server.js"]