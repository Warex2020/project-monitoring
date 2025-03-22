/**
 * server.js - Einfacher WebSocket-Server für das Projekt-Monitoring-Dashboard
 * 
 * Dieser Server stellt eine WebSocket-Verbindung für Echtzeit-Updates bereit
 * und verwaltet das Lesen/Schreiben der JSON-Konfigurationsdateien.
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const fileManager = require('./fileManager');
const ip = require('ip');

// Konfigurationsdateien
const CONFIG_PATH = path.join(__dirname, '..', 'config');
const PROJECTS_FILE = path.join(CONFIG_PATH, 'projects.json');
const CONFIG_FILE = path.join(CONFIG_PATH, 'config.json');

// Server-Konfiguration
const PORT = process.env.PORT || 3000;

// Erstelle HTTP-Server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket-Server für Projekt-Monitoring-Dashboard');
});

// Erstelle WebSocket-Server
const wss = new WebSocket.Server({ server });

// Aktuelle Projekte im Speicher halten
let projects = {};

// Aktive Verbindungen
let connections = new Set();

// Server starten
server.listen(PORT, () => {
    console.log(`Server gestartet auf http://localhost:${PORT}`);
    console.log(`Lokale IP-Adresse: http://${ip.address()}:${PORT}`);
    
    // Lade Projekte beim Start
    loadProjects();
});

// WebSocket-Verbindung
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Neue Verbindung von ${clientIp}`);
    
    // Prüfe IP-Beschränkung
    if (!isAllowedIp(clientIp)) {
        console.log(`Verbindung von ${clientIp} abgelehnt (nicht autorisiert)`);
        ws.close(1008, 'Nicht autorisierte IP-Adresse');
        return;
    }
    
    // Verbindung zur Liste der aktiven Verbindungen hinzufügen
    connections.add(ws);
    
    // Sende aktuelle Projekte an den neuen Client
    syncProjects(ws);
    
    // Eingehende Nachrichten verarbeiten
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            handleClientMessage(parsedMessage, ws);
        } catch (error) {
            console.error('Fehler beim Verarbeiten der Client-Nachricht:', error);
        }
    });
    
    // Verbindung geschlossen
    ws.on('close', () => {
        console.log(`Verbindung von ${clientIp} geschlossen`);
        connections.delete(ws);
    });
    
    // Fehlerbehandlung
    ws.on('error', (error) => {
        console.error(`WebSocket-Fehler für ${clientIp}:`, error);
        connections.delete(ws);
    });
});

// Prüft, ob eine IP-Adresse zugelassen ist
function isAllowedIp(clientIp) {
    try {
        // Lade Konfiguration
        const config = fileManager.loadJsonSync(CONFIG_FILE);
        
        // Wenn keine IP-Beschränkung konfiguriert ist oder die Liste leer ist, erlaube alle
        if (!config || !config.allowedIps || config.allowedIps.length === 0) {
            return true;
        }
        
        // Bereinige Client-IP (entferne IPv6-Prefix)
        const cleanIp = clientIp.replace(/^::ffff:/, '');
        
        // Lokale IPs immer erlauben
        if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp === '::1') {
            return true;
        }
        
        // Prüfe, ob IP in der erlaubten Liste ist
        return config.allowedIps.includes(cleanIp);
    } catch (error) {
        console.error('Fehler beim Prüfen der IP-Beschränkung:', error);
        // Im Fehlerfall erlauben (Sicherheitsrisiko, aber besser als kompletter Ausfall)
        return true;
    }
}

// Lädt Projekte aus der Konfigurationsdatei
function loadProjects() {
    fileManager.loadJson(PROJECTS_FILE)
        .then(data => {
            projects = data || {};
            console.log(`${Object.keys(projects).length} Projekte geladen`);
        })
        .catch(error => {
            console.error('Fehler beim Laden der Projekte:', error);
            // Erstelle leere Projektdatei, falls sie nicht existiert
            fileManager.saveJson(PROJECTS_FILE, {})
                .then(() => {
                    console.log('Leere Projektdatei erstellt');
                    projects = {};
                })
                .catch(err => {
                    console.error('Fehler beim Erstellen der Projektdatei:', err);
                });
        });
}

// Speichert Projekte in der Konfigurationsdatei
function saveProjects() {
    return fileManager.saveJson(PROJECTS_FILE, projects)
        .then(() => {
            console.log('Projekte gespeichert');
            return true;
        })
        .catch(error => {
            console.error('Fehler beim Speichern der Projekte:', error);
            return false;
        });
}

// Sendet eine Nachricht an alle verbundenen Clients außer dem Absender
function broadcastMessage(message, exclude = null) {
    const messageString = JSON.stringify(message);
    
    connections.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

// Sendet aktuelle Projekte an einen Client
function syncProjects(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'sync_projects',
            data: projects,
            timestamp: Date.now()
        }));
    }
}

// Verarbeitet eine Nachricht eines Clients
function handleClientMessage(message, ws) {
    if (!message || !message.type || !message.data) {
        console.error('Ungültige Client-Nachricht:', message);
        return;
    }
    
    console.log('Client-Nachricht empfangen:', message.type);
    
    switch (message.type) {
        case 'add_project':
            // Projekt hinzufügen
            if (message.data && message.data.id) {
                projects[message.data.id] = message.data;
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'update_project':
            // Projekt aktualisieren
            if (message.data && message.data.id && projects[message.data.id]) {
                projects[message.data.id] = message.data;
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'delete_project':
            // Projekt löschen
            if (message.data && message.data.id && projects[message.data.id]) {
                delete projects[message.data.id];
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'add_step':
        case 'update_step':
            // Schritt hinzufügen/aktualisieren
            if (message.data && message.data.projectId && projects[message.data.projectId]) {
                const project = projects[message.data.projectId];
                
                // Stelle sicher, dass steps existiert
                if (!project.steps) {
                    project.steps = [];
                }
                
                // Prüfe, ob der Schritt bereits existiert
                const stepIndex = project.steps.findIndex(step => step.id === message.data.id);
                
                if (stepIndex >= 0) {
                    // Schritt aktualisieren
                    project.steps[stepIndex] = message.data;
                } else {
                    // Schritt hinzufügen
                    project.steps.push(message.data);
                }
                
                // Projekt-Fortschritt aktualisieren
                updateProjectProgress(project);
                
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'delete_step':
            // Schritt löschen
            if (message.data && message.data.projectId && message.data.id && 
                projects[message.data.projectId] && projects[message.data.projectId].steps) {
                
                const project = projects[message.data.projectId];
                
                // Finde und entferne den Schritt
                const stepIndex = project.steps.findIndex(step => step.id === message.data.id);
                
                if (stepIndex >= 0) {
                    project.steps.splice(stepIndex, 1);
                    
                    // Projekt-Fortschritt aktualisieren
                    updateProjectProgress(project);
                    
                    saveProjects();
                    broadcastMessage(message, ws);
                }
            }
            break;
            
        case 'request_sync':
            // Client fordert Synchronisierung an
            syncProjects(ws);
            break;
            
        default:
            console.warn('Unbekannter Nachrichtentyp:', message.type);
    }
}

// Aktualisiert den Projektfortschritt basierend auf den Schritten
function updateProjectProgress(project) {
    if (!project || !project.steps || project.steps.length === 0) return;
    
    // Berechne Prozentsatz abgeschlossener Schritte
    const completedSteps = project.steps.filter(step => step.completed).length;
    const totalSteps = project.steps.length;
    const progressPercentage = Math.round((completedSteps / totalSteps) * 100);
    
    // Aktualisiere Projekt-Fortschritt
    project.progress = progressPercentage;
    
    // Aktualisiere Projekt-Status basierend auf Fortschritt
    updateProjectStatus(project);
    
    // Aktualisiere nächsten Schritt
    updateNextStep(project);
}

// Aktualisiert den Projektstatus basierend auf Fortschritt und Deadline
function updateProjectStatus(project) {
    if (!project) return;
    
    // Wenn alle Schritte abgeschlossen sind, setze Status auf "completed"
    if (project.progress === 100) {
        project.status = 'completed';
        return;
    }
    
    // Prüfe, ob Deadline überschritten wurde
    if (project.deadline) {
        const deadlineDate = new Date(project.deadline);
        const today = new Date();
        
        if (deadlineDate < today) {
            project.status = 'delayed';
            return;
        }
        
        // Prüfe, ob Deadline in weniger als 7 Tagen ist und Fortschritt < 70%
        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 7 && project.progress < 70) {
            project.status = 'at-risk';
            return;
        }
    }
    
    // Default: On Track
    if (project.status !== 'at-risk' && project.status !== 'delayed') {
        project.status = 'on-track';
    }
}

// Aktualisiert den nächsten Schritt für ein Projekt
function updateNextStep(project) {
    if (!project || !project.steps || project.steps.length === 0) return;
    
    // Finde den ersten nicht abgeschlossenen Schritt
    const nextStep = project.steps.find(step => !step.completed);
    
    if (nextStep) {
        project.nextStep = nextStep.title;
    } else {
        project.nextStep = 'Alle Schritte abgeschlossen';
    }
}