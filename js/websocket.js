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
        // Erstelle WebSocket-Verbindung zum Server
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const host = window.location.hostname;
        const port = 3000; // Standard-Port für unseren WebSocket-Server
        
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
        socket.onclose = function() {
            console.log('WebSocket-Verbindung geschlossen');
            isConnected = false;
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