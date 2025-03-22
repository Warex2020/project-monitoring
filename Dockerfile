FROM node:16-alpine

WORKDIR /app

# Installiere Build-Tools für native Module
RUN apk add --no-cache python3 make g++

# Kopiere nur package.json Dateien für effizienteres Caching
COPY package*.json ./
COPY server/package*.json ./server/

# Installiere Root-Abhängigkeiten
RUN npm install --production

# Installiere Abhängigkeiten im server-Verzeichnis
WORKDIR /app/server
RUN npm install --production

# Zurück zum Hauptverzeichnis
WORKDIR /app

# Kopiere den Rest des Projekts
COPY . .

# Erstelle leere config-Verzeichnisse, falls nicht vorhanden
RUN mkdir -p config

EXPOSE 3000

# Prüfe, ob alle Module korrekt installiert wurden
RUN node -e "require('express'); require('ws'); require('ip'); console.log('Module verfügbar')"

# Starte den Server
CMD ["node", "server/server.js"]