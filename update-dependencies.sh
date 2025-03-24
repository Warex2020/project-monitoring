#!/bin/bash
# Skript zum Aktualisieren der Abhängigkeiten auf neueste Versionen

# Farben für bessere Übersicht
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # Keine Farbe

echo -e "${GREEN}=== Prüfe auf veraltete Pakete ===${NC}"

# Prüfe, ob npm-check-updates installiert ist
if ! command -v npx &> /dev/null; then
    echo -e "${RED}npx ist nicht installiert. Bitte installiere Node.js mit npm.${NC}"
    exit 1
fi

# Hauptverzeichnis prüfen
echo -e "${YELLOW}Prüfe Pakete im Hauptverzeichnis...${NC}"
npx npm-check-updates

echo -e "\n${YELLOW}Möchtest du alle Pakete im Hauptverzeichnis aktualisieren? (j/n)${NC}"
read -r antwort

if [[ "$antwort" =~ ^[Jj]$ ]]; then
    echo -e "${GREEN}Aktualisiere package.json im Hauptverzeichnis...${NC}"
    npx npm-check-updates -u
    echo -e "${GREEN}Installiere aktualisierte Pakete...${NC}"
    npm install
else
    echo -e "${YELLOW}Aktualisierung übersprungen.${NC}"
fi

# Server-Verzeichnis prüfen, falls vorhanden
if [ -d "server" ] && [ -f "server/package.json" ]; then
    echo -e "\n${YELLOW}Prüfe Pakete im server-Verzeichnis...${NC}"
    cd server || exit
    npx npm-check-updates
    
    echo -e "\n${YELLOW}Möchtest du alle Pakete im server-Verzeichnis aktualisieren? (j/n)${NC}"
    read -r server_antwort
    
    if [[ "$server_antwort" =~ ^[Jj]$ ]]; then
        echo -e "${GREEN}Aktualisiere package.json im server-Verzeichnis...${NC}"
        npx npm-check-updates -u
        echo -e "${GREEN}Installiere aktualisierte Pakete...${NC}"
        npm install
    else
        echo -e "${YELLOW}Aktualisierung übersprungen.${NC}"
    fi
    
    cd ..
fi

# Sicherheitsüberprüfung
echo -e "\n${GREEN}=== Sicherheitsüberprüfung ===${NC}"
echo -e "${YELLOW}Prüfe auf Sicherheitslücken im Hauptverzeichnis...${NC}"
npm audit

if [ -d "server" ] && [ -f "server/package.json" ]; then
    echo -e "\n${YELLOW}Prüfe auf Sicherheitslücken im server-Verzeichnis...${NC}"
    cd server || exit
    npm audit
    cd ..
fi

echo -e "\n${GREEN}=== Aktualisierungsprozess abgeschlossen ===${NC}"
echo -e "${YELLOW}Hinweis: Nach der Aktualisierung der Abhängigkeiten solltest du einen${NC}"
echo -e "${YELLOW}Docker-Build durchführen, um die Änderungen anzuwenden:${NC}"
echo -e "${GREEN}npm run docker:build:dev${NC} oder ${GREEN}npm run docker:build:prod${NC}"