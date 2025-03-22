# Changelog

Alle wichtigen Änderungen am IT-Projekt-Monitoring-Dashboard werden in dieser Datei dokumentiert.

## [1.2.0] - 2025-03-22

### Hinzugefügt
- Drag-and-Drop-Funktionalität für Projektschritte
  - Schritte können per Drag-and-Drop neu angeordnet werden
  - Schritte können zwischen Projekten verschoben werden
  - Visuelle Rückmeldung während des Drag-Vorgangs
- Sortier- und Filterfunktionen für Projekte
  - Sortierung nach Deadline, Fortschritt oder Titel
  - Filterung nach Projektstatus
  - Option zum Ausblenden abgeschlossener Projekte
- Gantt-Chart-Ansicht für zeitliche Projektplanung
  - Visualisierung der Projektlaufzeiten
  - Anzeige von Deadlines und Fortschritt
  - Wechsel zwischen Gantt- und normaler Ansicht
- Verbesserte UI-Animationen
  - Sanfte Ein-/Ausblendeffekte
  - Optimierte Übergänge beim Auf-/Zuklappen
  - Träge Animation der Fortschrittsanzeige

### Verbessert
- Leistungsoptimierung für flüssigere Animationen
- Verbesserte visuelle Rückmeldung bei Benutzerinteraktionen
- Erweitertes Layout für Gantt-Chart-Ansicht
- Responsives Design für verschiedene Bildschirmgrößen

### Geändert
- Benutzeroberfläche um Filter- und Sortiersteuerelemente erweitert
- Projektschritte können jetzt per Drag-and-Drop neu angeordnet werden
- Verbesserte Transition-Effekte für ein moderneres Erscheinungsbild

## [1.1.0] - 2025-03-22

### Hinzugefügt
- Offline-Modus ermöglicht Arbeiten ohne Serververbindung
  - Automatische Erkennung von Netzwerkunterbrechungen
  - Lokale Speicherung von Änderungen während der Offline-Zeit
  - Intelligente Synchronisierung mit Konfliktlösung
  - Visueller Indikator für Offline-Status und gepufferte Änderungen
- Benachrichtigungssystem für Statusmeldungen
- Manueller Sync-Button für kontrollierte Synchronisierung
- Konfliktlösungsmechanismus für gleichzeitige Änderungen
- Persistente Speicherung von Offline-Änderungen zwischen Browser-Sitzungen

### Verbessert
- Träge Animation des Fortschrittsbalkens für ansprechendere visuelle Darstellung
- WebSocket-Verbindungswiederherstellung verbessert
- Fehlerbehandlung bei Netzwerkproblemen
- Bessere Statusinformationen bei Verbindungsproblemen

### Geändert
- Anpassung der Projektdarstellung für Offline/Online-Status
- Integration des Benachrichtigungssystems in die Benutzeroberfläche

### Behoben
- Problem mit sofortigem Verbindungsabbruch bei Netzwerkproblemen
- Datenverlust bei Netzwerkunterbrechungen
- Browser-Caching-Probleme bei bestimmten Änderungen

## [1.0.0] - 2025-03-22

### Erste öffentliche Version
- Modernes Dark-Mode Design für IT-Teams
- Echtzeit-Projektverfolgung mit WebSocket-Verbindung
- Fortschritts- und Status-Tracking für Projekte
- Aufgabenverwaltung mit abhakbaren Schritten
- Automatische Berechnung des Projektfortschritts
- Teamzuweisung zu Projekten
- Deadlines und visuelle Warnung bei kritischen Terminen
- Responsives Design für verschiedene Bildschirmgrößen
- IP-basierte Zugangsbeschränkung
- Aufklappbare Projektdetails mit Schritten/Aufgaben
- Konfigurierbare Server-Ports
- Flexible Bereitstellung über Docker

### Technische Features
- WebSocket-Kommunikation für Live-Updates
- Konfiguration über JSON-Dateien (keine Datenbank erforderlich)
- Docker-Container für einfache Bereitstellung
- Unterstützung von CIDR-Notation für IP-Berechtigung
- Zugriffsprotokolle für Verbindungen