/**
 * websocket.js - Stellt WebSocket-Funktionalität für Live-Updates bereit
 */

// WebSocket-Verbindung
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectInterval = 5000; // 5 Sekunden

// Verbindungsstatus-Indikatoren
const connectionIndicator = document.getElementById('connection-indicator');
const connectionText = document.getElementById('connection-text');

// Stellt eine WebSocket-Verbindung her
function connectWebSocket() {
    // Zeige "Verbinde..." Status
    updateConnectionStatus('connecting');
    
    try {
        // Hole den Port aus der Konfiguration, wenn verfügbar
        const getServerPort = () => {
            try {
                // Falls wir ein globales serverConfig-Objekt haben
                if (window.serverConfig && window.serverConfig.port) {
                    return window.serverConfig.port;
                }
                
                // Verwende den aktuelle URL-Port oder Standard 3000
                return window.location.port || 3420;
            } catch (error) {
                console.error('Fehler beim Ermitteln des Server-Ports:', error);
                return 3420; // Fallback zum konfigurierten Port
            }
        };
        
        // Erstelle WebSocket-Verbindung zum Server
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const host = window.location.hostname || 'localhost';
        const port = getServerPort(); // Dynamisch den Port ermitteln
        
        console.log(`Verbindung zu WebSocket auf ${protocol}${host}:${port} wird hergestellt...`);
        socket = new WebSocket(`${protocol}${host}:${port}`);
        
        // Event-Handler für erfolgreiche Verbindung
        socket.onopen = function() {
            console.log('WebSocket-Verbindung hergestellt');
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus('connected');
        };
        
        // Event-Handler für eingehende Nachrichten
        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error);
            }
        };
        
        // Event-Handler für Verbindungsfehler
        socket.onerror = function(error) {
            console.error('WebSocket-Fehler:', error);
            updateConnectionStatus('disconnected');
        };
        
        // Event-Handler für geschlossene Verbindung
        socket.onclose = function(event) {
            console.log('WebSocket-Verbindung geschlossen', event.code, event.reason);
            isConnected = false;
            
            // Prüfe, ob die Verbindung aufgrund von Zugriffsrechten geschlossen wurde
            if (event.code === 1008) {
                showAccessDeniedMessage(event.reason);
                updateConnectionStatus('denied');
                return;
            }
            
            updateConnectionStatus('disconnected');
            
            // Versuche, die Verbindung wiederherzustellen
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Versuche erneut zu verbinden (${reconnectAttempts}/${maxReconnectAttempts})...`);
                setTimeout(connectWebSocket, reconnectInterval);
            } else {
                console.error('Maximale Anzahl an Wiederverbindungsversuchen erreicht.');
            }
        };
    } catch (error) {
        console.error('Fehler beim Verbinden mit WebSocket:', error);
        updateConnectionStatus('disconnected');
    }
}

// Zeigt eine Meldung an, wenn der Zugriff verweigert wurde
function showAccessDeniedMessage(reason) {
    // Erstelle einen Overlay-Container für die Meldung
    const overlay = document.createElement('div');
    overlay.className = 'access-denied-overlay';
    
    const messageBox = document.createElement('div');
    messageBox.className = 'access-denied-message';
    
    const title = document.createElement('h2');
    title.textContent = 'Zugriff verweigert';
    
    const message = document.createElement('p');
    message.textContent = 'Ihre IP-Adresse ist nicht für den Zugriff auf dieses Dashboard autorisiert.';
    
    const ipInfo = document.createElement('div');
    ipInfo.className = 'ip-info';
    ipInfo.textContent = `Ihre IP-Adresse: ${window.location.hostname === 'localhost' ? '127.0.0.1 (localhost)' : '...wird geladen...'}`;
    
    // Versuchen Sie, die IP-Adresse zu ermitteln (nur für die Anzeige)
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            ipInfo.textContent = `Ihre IP-Adresse: ${data.ip}`;
        })
        .catch(() => {
            // Fallback, falls die IP nicht ermittelt werden kann
            ipInfo.textContent = 'Ihre IP-Adresse konnte nicht ermittelt werden.';
        });
    
    const contactInfo = document.createElement('p');
    contactInfo.textContent = 'Bitte kontaktieren Sie Ihren Administrator, um Zugriff zu erhalten.';
    
    // Alles zusammenfügen
    messageBox.appendChild(title);
    messageBox.appendChild(message);
    messageBox.appendChild(ipInfo);
    messageBox.appendChild(contactInfo);
    overlay.appendChild(messageBox);
    
    // An das Dokument anhängen
    document.body.appendChild(overlay);
    
    // Standard-UI ausblenden
    document.querySelector('.container').style.display = 'none';
}

// Sendet eine Nachricht über WebSocket
function sendWebSocketMessage(type, data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket nicht verbunden. Nachricht kann nicht gesendet werden.');
        return false;
    }
    
    const message = {
        type: type,
        data: data,
        timestamp: Date.now()
    };
    
    try {
        socket.send(JSON.stringify(message));
        return true;
    } catch (error) {
        console.error('Fehler beim Senden der WebSocket-Nachricht:', error);
        return false;
    }
}

// Verarbeitet eingehende WebSocket-Nachrichten
function handleWebSocketMessage(message) {
    if (!message || !message.type || !message.data) {
        console.error('Ungültige WebSocket-Nachricht:', message);
        return;
    }
    
    console.log('WebSocket-Nachricht empfangen:', message.type);
    
    switch (message.type) {
        case 'add_project':
            ProjectManager.addProject(message.data);
            break;
            
        case 'update_project':
            ProjectManager.updateProject(message.data);
            break;
            
        case 'delete_project':
            ProjectManager.deleteProject(message.data.id);
            break;
            
        case 'add_step':
            TodoManager.addStep(message.data.projectId, message.data);
            break;
            
        case 'update_step':
            TodoManager.updateStep(message.data.projectId, message.data);
            break;
            
        case 'delete_step':
            TodoManager.deleteStep(message.data.projectId, message.data.id);
            break;
            
        case 'sync_projects':
            // Vollständige Synchronisierung aller Projekte
            handleProjectSync(message.data);
            break;
            
        default:
            console.warn('Unbekannter Nachrichtentyp:', message.type);
    }
}

// Verarbeitet Projekt-Synchronisierungsdaten
function handleProjectSync(projects) {
    if (!projects) return;
    
    Object.values(projects).forEach(project => {
        ProjectManager.updateProject(project);
    });
    
    console.log('Projekte synchronisiert:', Object.keys(projects).length);
}

// Aktualisiert die Anzeige des Verbindungsstatus
function updateConnectionStatus(status) {
    // Entferne alle vorherigen Klassen
    connectionIndicator.className = '';
    
    switch (status) {
        case 'connected':
            connectionIndicator.classList.add('connected');
            connectionText.textContent = 'Verbunden';
            break;
            
        case 'disconnected':
            connectionIndicator.classList.add('disconnected');
            connectionText.textContent = 'Getrennt';
            break;
            
        case 'connecting':
            connectionIndicator.classList.add('connecting');
            connectionText.textContent = 'Verbinde...';
            break;
    }
}