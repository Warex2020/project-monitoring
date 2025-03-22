/**
 * server.js - Einfacher WebSocket-Server für das Projekt-Monitoring-Dashboard
 * 
 * Dieser Server stellt eine WebSocket-Verbindung für Echtzeit-Updates bereit
 * und verwaltet das Lesen/Schreiben der JSON-Konfigurationsdateien.
 */

const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const fileManager = require('./fileManager');
const ip = require('ip');

// Fehlerbehandlung für fehlende Module
try {
    // Überprüfe, ob die benötigten Module vorhanden sind
    require('ws');
    require('ip');
    require('express');
} catch (error) {
    console.error('Fehler: Benötigte Module nicht gefunden:', error.message);
    console.error('Bitte führen Sie "npm install" aus, um alle Abhängigkeiten zu installieren.');
    process.exit(1);
}

// Konfigurationsdateien
const CONFIG_PATH = path.join(__dirname, '..', 'config');
const PROJECTS_FILE = path.join(CONFIG_PATH, 'projects.json');
const CONFIG_FILE = path.join(CONFIG_PATH, 'config.json');
const LOG_FILE = path.join(CONFIG_PATH, 'access.log');

// Funktion zum Protokollieren von Ereignissen
function logEvent(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    
    // Zum Log-File hinzufügen
    fs.appendFile(LOG_FILE, logMessage, (err) => {
        if (err) {
            console.error('Fehler beim Schreiben ins Log-File:', err);
        }
    });
    
    // Auch in die Konsole ausgeben
    console.log(message);
}

// Server-Konfiguration
let serverConfig;
try {
    const config = fileManager.loadJsonSync(CONFIG_FILE);
    serverConfig = config.server || {};
} catch (error) {
    logEvent(`Fehler beim Laden der Serverkonfiguration: ${error.message}`);
    serverConfig = {};
}

const PORT = serverConfig.port || process.env.PORT || 3000;
const HOST = serverConfig.host || '0.0.0.0';

// Erstelle Express-App
const app = express();

// Stelle die statischen Dateien aus dem Root-Verzeichnis zur Verfügung
app.use(express.static(path.join(__dirname, '..')));

// Route für die Hauptseite
app.get('/', (req, res) => {
    // HTML-Code auslesen
    let htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    
    // Server-Port in das HTML einfügen
    htmlContent = htmlContent.replace(
        /port: \d+/, 
        `port: ${PORT}`
    );
    
    // Geänderte HTML zurückgeben
    res.send(htmlContent);
});

// Route für Health-Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback-Route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Erstelle HTTP-Server mit Express
const server = http.createServer(app);

// Erstelle WebSocket-Server
const wss = new WebSocket.Server({ server });

// Aktuelle Projekte im Speicher halten
let projects = {};

// Aktive Verbindungen
let connections = new Set();

// Server starten
server.listen(PORT, HOST, () => {
    logEvent(`Server gestartet auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    logEvent(`Lokale IP-Adresse: http://${ip.address()}:${PORT}`);
    
    // Lade Projekte beim Start
    loadProjects();
});

// WebSocket-Verbindung
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logEvent(`Neue Verbindung von ${clientIp}`);
    
    // Prüfe IP-Beschränkung
    if (!isAllowedIp(clientIp)) {
        logEvent(`Verbindung von ${clientIp} abgelehnt (nicht autorisiert)`);
        
        // Sende eine Nachricht an den Client, bevor die Verbindung geschlossen wird
        ws.send(JSON.stringify({
            type: 'error',
            data: {
                message: 'Zugriff verweigert. Ihre IP-Adresse ist nicht autorisiert.',
                ip: clientIp
            },
            timestamp: Date.now()
        }));
        
        // Schließe die Verbindung mit einem speziellen Code
        ws.close(1008, 'Nicht autorisierte IP-Adresse');
        return;
    }
    
    // Verbindung zur Liste der aktiven Verbindungen hinzufügen
    connections.add(ws);
    logEvent(`Verbindung von ${clientIp} autorisiert und hergestellt`);
    
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
            logEvent(`Keine IP-Beschränkungen konfiguriert. Erlaube alle Verbindungen.`);
            return true;
        }
        
        // Bereinige Client-IP (entferne IPv6-Prefix)
        const cleanIp = clientIp.replace(/^::ffff:/, '');
        
        // Lokale IPs immer erlauben
        const localIps = ['127.0.0.1', 'localhost', '::1'];
        if (localIps.includes(cleanIp)) {
            logEvent(`Lokale IP ${cleanIp} erkannt. Verbindung erlaubt.`);
            return true;
        }
        
        // Prüfe, ob IP in der erlaubten Liste ist
        for (const allowedIp of config.allowedIps) {
            // Überprüfe, ob es eine CIDR-Notation ist (z.B. 192.168.1.0/24)
            if (allowedIp.includes('/')) {
                if (isIpInCidrRange(cleanIp, allowedIp)) {
                    logEvent(`IP ${cleanIp} ist in CIDR-Range ${allowedIp}. Verbindung erlaubt.`);
                    return true;
                }
            } 
            // Exakte IP-Übereinstimmung
            else if (allowedIp === cleanIp) {
                logEvent(`IP ${cleanIp} ist in der erlaubten Liste. Verbindung erlaubt.`);
                return true;
            }
        }
        
        // IP nicht in der Liste erlaubter IPs
        logEvent(`IP ${cleanIp} ist nicht autorisiert. Verbindung abgelehnt.`);
        return false;
    } catch (error) {
        logEvent(`Fehler beim Prüfen der IP-Beschränkung: ${error.message}`);
        // Im Fehlerfall erlauben (Sicherheitsrisiko, aber besser als kompletter Ausfall)
        return true;
    }
}

// Prüft, ob eine IP-Adresse in einem CIDR-Bereich liegt
function isIpInCidrRange(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);
    
    // Konvertiere IP-Adresse in Integer
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    
    // Berechne Netzwerkadresse und Broadcast-Adresse
    const shiftBits = 32 - mask;
    const netmask = ((1 << mask) - 1) << shiftBits;
    const networkAddr = rangeInt & netmask;
    const broadcastAddr = networkAddr | ((1 << shiftBits) - 1);
    
    // Prüfe, ob IP im Bereich liegt
    return ipInt >= networkAddr && ipInt <= broadcastAddr;
}

// Konvertiert eine IP-Adresse in einen Integer
function ipToInt(ip) {
    return ip.split('.')
        .reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
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