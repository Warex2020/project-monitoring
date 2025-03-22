# IT-Projekt-Monitoring-Dashboard

Ein modernes, interaktives Dashboard zur Überwachung von IT-Projekten mit Live-Updates und Echtzeit-Kollaboration.

## Features

- **Modernes Dark Mode Design** speziell für IT-Teams
- **Echtzeit-Updates** durch WebSocket-Verbindungen
- **Kollaborative Bearbeitung** von Projekten und Aufgaben
- **Automatische Fortschrittsberechnung** basierend auf abgeschlossenen Schritten
- **Automatischer Status** basierend auf Fortschritt und Deadline
- **Keine Datenbank erforderlich** - Daten werden in JSON-Dateien gespeichert
- **IP-basierte Zugriffsbeschränkung** für Sicherheit ohne Login
- **Responsive Design** für Desktop und Tablets

## Projektstruktur

```
project-monitoring/
├── index.html              # Hauptdatei mit der HTML-Struktur
├── css/
│   ├── styles.css          # Hauptstildatei
│   └── dark-theme.css      # Dunkles Farbschema für IT-Abteilung
├── js/
│   ├── main.js             # Hauptskript für UI-Interaktionen
│   ├── websocket.js        # WebSocket-Funktionalität für Live-Updates
│   ├── projectManager.js   # Verwaltung der Projekte (Laden, Speichern)
│   └── todoManager.js      # Verwaltung der Todos
├── config/
│   ├── projects.json       # Konfigurationsdatei für Projekte
│   └── config.json         # Allgemeine Konfiguration (IP-Einschränkungen)
└── server/
    ├── server.js           # Einfacher Node.js-WebSocket-Server
    ├── fileManager.js      # Verwaltet das Lesen/Schreiben der JSON-Dateien
    └── package.json        # Node.js-Projektdatei mit Abhängigkeiten
```

## Installation

1. Stelle sicher, dass Node.js installiert ist (Version 14+ empfohlen)
2. Repository klonen oder Dateien herunterladen
3. In das Projektverzeichnis wechseln

```bash
cd project-monitoring
```

4. Abhängigkeiten installieren

```bash
npm install
```

5. Server starten

```bash
npm start
```

6. Im Browser öffnen: `http://localhost:3000`

## Konfiguration

### IP-Beschränkung

Die Zugriffskontrolle erfolgt über IP-Adressen, die in `config/config.json` konfiguriert werden können:

```json
{
  "allowedIps": [
    "127.0.0.1",
    "::1",
    "192.168.1.0/24"
  ]
}
```

### Projekteinstellungen

Verschiedene Einstellungen können in der `config/config.json` angepasst werden, wie zum Beispiel:

- Standardmäßige Deadline-Tage
- Kritische Deadline-Schwelle
- Verfügbare Projektstatus
- UI-Einstellungen (Aktualisierungsintervall, Datumsformat, etc.)

## Verwendung

### Projekte verwalten

- **Neues Projekt erstellen**: Klicke auf den "+ Neues Projekt" Button
- **Projekt bearbeiten**: Klicke auf das Stift-Symbol in der Projektecke
- **Projektdetails anzeigen/ausblenden**: Klicke auf die Projektkarte

### Schritte verwalten

- **Schritt hinzufügen**: Klicke auf das "+"-Symbol in der Projektfußzeile
- **Schritt bearbeiten**: Klicke auf das Stift-Symbol neben dem Schritt
- **Schritt abschließen/erneut öffnen**: Klicke auf die Checkbox des Schritts

### Live-Updates

- Alle Änderungen werden automatisch an alle verbundenen Clients übertragen
- Der Verbindungsstatus wird in der rechten oberen Ecke angezeigt

## Technologien

- **Frontend**: HTML5, CSS3, JavaScript (ES6+), jQuery
- **Backend**: Node.js, WebSocket (ws)
- **Datenspeicherung**: JSON-Dateien

## Lizenz

MIT