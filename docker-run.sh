#!/bin/bash

# Skript zum Erstellen und Starten des Docker-Containers für das Projekt-Monitoring-Dashboard

# Farben für bessere Lesbarkeit
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Projekt-Monitoring-Dashboard Docker Setup${NC}"
echo "-----------------------------------------------------------"

# Portnummer definieren (Standard: 3420)
PORT=3420

# Parameter verarbeiten
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -p|--port) PORT="$2"; shift ;;
        *) echo "Unbekannter Parameter: $1"; exit 1 ;;
    esac
    shift
done

# Prüfen, ob Docker installiert ist
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker ist nicht installiert. Bitte installieren Sie Docker und versuchen Sie es erneut.${NC}"
    exit 1
fi

# Erstellen der config-Verzeichnisse, falls sie nicht existieren
echo -e "${YELLOW}Erstelle Konfigurationsverzeichnisse...${NC}"
mkdir -p config

# Erstellen des server-Verzeichnisses, falls es nicht existiert
mkdir -p server

# Konfiguration des Ports in docker-compose.yml
echo -e "${YELLOW}Konfiguriere Port $PORT in Docker-Compose...${NC}"
sed -i "s/\"[0-9]\+:3420\"/\"$PORT:3420\"/" docker-compose.yml

# Überprüfen, ob die Konfigurationsdateien existieren, sonst Standarddateien erstellen
if [ ! -f "config/config.json" ]; then
    echo -e "${YELLOW}Erstelle Standard-Konfigurationsdatei...${NC}"
    cat > config/config.json << EOL
{
  "allowedIps": [
    "127.0.0.1",
    "::1",
    "localhost",
    "192.168.1.0/24",
    "10.0.0.0/8"
  ],
  "server": {
    "port": 3420,
    "host": "0.0.0.0"
  },
  "projectSettings": {
    "defaultDeadlineDays": 30,
    "criticalDeadlineDays": 7,
    "statuses": [
      "on-track",
      "at-risk",
      "delayed",
      "completed"
    ]
  },
  "uiSettings": {
    "refreshInterval": 10000,
    "theme": "dark",
    "dateFormat": "dd.MM.yyyy",
    "timeFormat": "HH:mm:ss",
    "showCompletedProjects": true,
    "projectsPerPage": 6
  }
}
EOL
fi

if [ ! -f "config/projects.json" ]; then
    echo -e "${YELLOW}Erstelle leere Projektdatei...${NC}"
    echo "{}" > config/projects.json
fi

# Überprüfen, ob server/package.json existiert
if [ ! -f "server/package.json" ]; then
    echo -e "${YELLOW}Erstelle server/package.json...${NC}"
    cat > server/package.json << EOL
{
  "name": "project-monitoring-server",
  "version": "1.0.0",
  "description": "Server für das IT-Projekt-Monitoring-Dashboard",
  "main": "server.js",
  "dependencies": {
    "ws": "^8.13.0",
    "ip": "^1.1.8",
    "express": "^4.18.2"
  }
}
EOL
fi

# Container stoppen und entfernen, falls er bereits existiert
echo -e "${YELLOW}Stoppe und entferne existierende Container...${NC}"
docker compose down

# Cache bereinigen (optional)
#echo -e "${YELLOW}Bereinige Docker-Cache...${NC}"
docker system prune -f

# Container neu bauen
echo -e "${YELLOW}Baue Container neu...${NC}"
docker compose build --no-cache

# Container starten
echo -e "${YELLOW}Starte Container...${NC}"
docker compose up -d

# Überprüfen, ob der Container läuft
sleep 5
if [ "$(docker ps -q -f name=project-monitoring)" ]; then
    echo -e "${GREEN}Container erfolgreich gestartet!${NC}"
    echo -e "${GREEN}Dashboard ist verfügbar unter: http://localhost:$PORT${NC}"
    
    # Container-Logs anzeigen
    echo -e "${YELLOW}Container-Logs:${NC}"
    docker compose logs
else
    echo -e "${RED}Fehler beim Starten des Containers.${NC}"
    echo -e "${YELLOW}Container-Logs:${NC}"
    docker compose logs
fi
