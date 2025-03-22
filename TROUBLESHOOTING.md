# Projekt-Monitoring-Dashboard: Fehlerbehebung

Dieses Dokument bietet Hilfestellung bei häufigen Problemen, die bei der Installation und Ausführung des IT-Projekt-Monitoring-Dashboards auftreten können.

## Docker-Probleme

### Fehler: Module nicht gefunden (z.B. "Cannot find module 'ws'")

**Problem:** Der Container kann erforderliche Node.js-Module nicht finden.

**Lösungen:**

1. **Vollständigen Neuaufbau durchführen:**
   ```bash
   docker compose down
   docker system prune -f
   docker compose build --no-cache
   docker compose up -d
   ```

2. **Prüfen, ob package.json richtig ins Docker-Image kopiert wurde:**
   ```bash
   docker exec -it project-monitoring cat /app/package.json
   ```

3. **Manuelle Installation der Module im Container:**
   ```bash
   docker exec -it project-monitoring npm install ws ip express
   ```

4. **Das Hilfsskript verwenden:**
   ```bash
   bash docker-run.sh
   ```

### Fehler: Port bereits in Verwendung

**Problem:** Port 3000 wird bereits von einer anderen Anwendung verwendet.

**Lösungen:**

1. **Anderen Port verwenden:** Bearbeite die `docker-compose.yml` und ändere den Port:
   ```yaml
   ports:
     - "3001:3000"
   ```

2. **Bestehende Anwendung auf Port 3000 beenden:**
   ```bash
   # Unter Linux/Mac:
   sudo lsof -i :3000
   sudo kill <PID>
   
   # Unter Windows (PowerShell):
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

## WebSocket-Verbindungsprobleme

### Fehler: Keine Verbindung zum WebSocket-Server

**Problem:** Der Client kann keine WebSocket-Verbindung herstellen.

**Lösungen:**

1. **Überprüfen, ob der Server läuft:**
   ```bash
   docker-compose logs -f
   ```

2. **Firewall-Einstellungen prüfen:** Stelle sicher, dass Port 3000 nicht durch eine Firewall blockiert wird.

3. **IP-Beschränkungen überprüfen:** Überprüfe, ob deine IP-Adresse in der `config/config.json` in der `allowedIps`-Liste steht.

4. **Browser-Cache leeren:** Leere den Cache deines Browsers und aktualisiere die Seite.

### Fehler: Änderungen werden nicht live angezeigt

**Problem:** Änderungen an Projekten werden nicht automatisch bei allen Clients angezeigt.

**Lösungen:**

1. **WebSocket-Verbindung prüfen:** Schau im Browser-Konsolenfenster nach Fehlern.

2. **Server neustarten:**
   ```bash
   docker compose restart
   ```

3. **Config-Dateien überprüfen:** Stelle sicher, dass die `config/projects.json` nicht beschädigt ist.

## Daten-Persistenz-Probleme

### Fehler: Projekte werden nicht gespeichert

**Problem:** Nach dem Neustart des Containers sind die Projektdaten verschwunden.

**Lösungen:**

1. **Volume-Mounts prüfen:** Stelle sicher, dass der Ordner `config` korrekt gemountet ist:
   ```bash
   docker-compose exec project-monitoring ls -la /app/config
   ```

2. **Besitzrechte prüfen:** Stelle sicher, dass der Container Schreibrechte für den config-Ordner hat:
   ```bash
   sudo chown -R 1000:1000 ./config
   ```

3. **Manuelle Sicherung erstellen:** Sichere deine Daten regelmäßig:
   ```bash
   cp -r config config_backup_$(date +%Y%m%d)
   ```

## Allgemeine Tipps

### Container-Logs anzeigen

```bash
docker-compose logs -f
```

### In den Container einsteigen

```bash
docker exec -it project-monitoring /bin/sh
```

### Konfigurationsdateien direkt bearbeiten

```bash
# Öffne config.json im Texteditor
nano config/config.json

# Öffne projects.json im Texteditor
nano config/projects.json
```

### Komplette Neuinstallation

Wenn nichts anderes hilft, führe eine komplette Neuinstallation durch:

```bash
docker compose down
docker system prune -f
rm -rf node_modules
npm install
bash docker-run.sh
```

## Support erhalten

Wenn du weitere Unterstützung benötigst, erstelle ein Issue im GitHub-Repository oder kontaktiere den Administrator deines IT-Teams.