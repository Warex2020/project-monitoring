# Changelog

Alle wichtigen Änderungen am IT-Projekt-Monitoring-Dashboard werden in dieser Datei dokumentiert.

## [1.4.0] - 2025-04-15

### Hinzugefügt
- Verbesserte Benutzeroberfläche (UX)
  - Moderne Projekt-Karten mit dynamischen Schatten- und Hover-Effekten
  - Sanftere Übergangsanimationen bei Filterfunktionen
  - Flüssigeres Ein- und Ausblenden mit mehrphasigen Animationen
  - Tastaturkürzel für häufig verwendete Aktionen
  - Leerer-Zustand-Anzeige, wenn keine Projekte den Filterkriterien entsprechen
- Umfassendes Benutzerverwaltungssystem
  - Admin-Dashboard für Benutzerkonten
  - Vollständige CRUD-Operationen für Benutzer
  - Rollenbasierte Zugriffssteuerung mit hierarchischen Berechtigungen
  - Benutzerprofile mit anpassbaren Einstellungen
  - Aktivitätsprotokollierung für Audit-Zwecke
  - Passwort-Richtlinien und Zurücksetzungsmechanismen
- LDAPS-Integration
  - Sichere Verbindung zu Verzeichnisdiensten über TLS/SSL
  - Authentifizierung mit Unternehmenszugangsdaten
  - Automatische Benutzersynchronisierung aus dem Verzeichnis
  - Zuordnung von LDAP-Gruppen zu Anwendungsrollen
  - Konfigurationsoberfläche für LDAP-Einstellungen
  - Attribut-Mapping und Synchronisierungsplanung
  - Hybride Authentifizierung mit lokalen Fallback-Optionen

### Verbessert
- Erweiterte Animation und visuelle Effekte
  - Kaskadierte Animationen für Kartenübergänge
  - Sanftere Ein- und Ausblendungen bei Filteraktionen
  - Verbesserte Hover-Effekte mit natürlicheren Bewegungen
  - Ripple-Effekte für Schaltflächen und Shimmer-Effekte für Fortschrittsbalken
  - Optimierte Übergänge bei Erweiterung der Projektschritte
- Responsives Layout und Grid-System
  - Verbesserte Bootstrap-Integration
  - Automatisches Layout-Neuberechnung nach Filteränderungen
  - Optimierte Darstellung auf verschiedenen Bildschirmgrößen
  - Verbesserte Touch-Steuerung für mobile Geräte
- Team-Anzeige und Benutzerpräsentation
  - Anzeige von Benutzerinitialen in Team-Avataren
  - Tooltip-Informationen für Teammitglieder
  - Verbessertes visuelles Feedback bei Benutzeraktionen

### Geändert
- Überarbeitete Filtermechanismen mit animierten Übergängen
- Erweiterte Benutzerprofil- und Authentifizierungsflüsse
- Verbesserte Darstellung des Verbindungsstatus und der Authentifizierungsinformationen
- Neue Layout-Struktur für bessere Skalierbarkeit

### Behoben
- Problem mit dem Layout beim Ausblenden abgeschlossener Projekte
- Fehler bei der Animation beim Filtern von Projekten
- Inkonsistenzen bei der Anzeige von Teammitgliedern
- Verzögerungen bei der Aktualisierung des Layouts nach Änderungen

## [1.3.0] - 2025-03-23

### Hinzugefügt
- Zentrale Konfiguration für Titel und Untertitel des Dashboards
  - Anpassbare Beschriftungen in config.json
  - Dynamisches Laden der Texte beim Start
- Flexibler Zugriffsmodus (Public/Private)
  - Öffentlicher Modus ohne IP-Beschränkungen
  - Privater Modus mit IP-Whitelist für zusätzliche Sicherheit
- Authentifizierungssystem für Änderungen
  - Möglichkeit, Login für Schreibzugriff zu erfordern
  - Read-Only-Modus für nicht authentifizierte Benutzer
  - Benutzer- und Rollenmanagement in der Konfiguration
- Login-/Logout-Funktionalität
  - Benutzerauthentifizierung über Login-Formular
  - Session-Management für persistente Anmeldungen
  - Abgesicherte API-Endpunkte

### Verbessert
- Überarbeitete Sicherheitsarchitektur
  - Feingranulare Zugriffssteuerung für Aktionen
  - Verbesserte WebSocket-Authentifizierung
- Erweiterte Konfigurationsverwaltung
  - Zentraler ConfigManager für Frontend-Zugriff
  - Cached Config für bessere Performance
- Verbesserte Benutzerfreundlichkeit
  - Status-Indikatoren für Authentifizierung
  - Dynamische Anpassung der UI basierend auf Berechtigungen

### Geändert
- Überarbeitung des Server-Codes für neue Sicherheitsfeatures
- Anpassung der Client-Logik für Authentifizierungs-Workflows
- Erweitertes Fehlerhandling für Authentifizierungsprobleme

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