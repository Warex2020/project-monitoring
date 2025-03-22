/**
 * offlineManager.js - Verwaltet Offline-Funktionalität und Synchronisierung
 */

const OfflineManager = (() => {
    // Speicher für gepufferte Änderungen im Offline-Modus
    let offlineChanges = [];
    
    // Flag für den Offline-Modus
    let isOffline = false;
    
    // Speichert den letzten bekannten Server-Zustand
    let lastKnownServerState = {};
    
    // DOM-Elemente
    let offlineIndicator = null;
    let offlineBadge = null;
    let syncButton = null;
    
    // Initialisiert den Offline-Manager
    const init = () => {
        // Offline-Status-UI initialisieren
        createOfflineUI();
        
        // Event-Listener für Online/Offline-Status
        window.addEventListener('online', handleOnlineStatusChange);
        window.addEventListener('offline', handleOnlineStatusChange);
        
        // Initialen Status prüfen
        handleOnlineStatusChange();
        
        // Vorhandene gepufferte Änderungen aus dem localStorage laden
        loadOfflineChanges();
        
        console.log('OfflineManager initialisiert');
    };
    
    // Erstellt UI-Elemente für den Offline-Modus
    const createOfflineUI = () => {
        // Container für Offline-Anzeige
        const headerInfo = document.querySelector('.dashboard-info');
        
        // Offline-Indicator erstellen
        offlineIndicator = document.createElement('div');
        offlineIndicator.className = 'offline-indicator';
        offlineIndicator.style.display = 'none';
        
        // Offline-Badge für die Anzahl gepufferter Änderungen
        offlineBadge = document.createElement('span');
        offlineBadge.className = 'offline-badge';
        offlineBadge.textContent = '0';
        offlineBadge.style.display = 'none';
        
        // Sync-Button für manuelles Synchronisieren
        syncButton = document.createElement('button');
        syncButton.className = 'sync-button';
        syncButton.innerHTML = '↻ Sync';
        syncButton.title = 'Änderungen synchronisieren';
        syncButton.style.display = 'none';
        syncButton.addEventListener('click', syncOfflineChanges);
        
        // Elemente zum Container hinzufügen
        offlineIndicator.appendChild(offlineBadge);
        headerInfo.appendChild(offlineIndicator);
        headerInfo.appendChild(syncButton);
    };
    
    // Behandelt Änderungen des Online/Offline-Status
    const handleOnlineStatusChange = () => {
        isOffline = !navigator.onLine;
        
        if (isOffline) {
            enterOfflineMode();
        } else {
            exitOfflineMode();
        }
    };
    
    // Aktiviert den Offline-Modus
    const enterOfflineMode = () => {
        console.log('Offline-Modus aktiviert');
        isOffline = true;
        
        // UI aktualisieren
        if (offlineIndicator) {
            offlineIndicator.style.display = 'flex';
            offlineIndicator.classList.add('active');
        }
        
        // Den WebSocket-Verbindungsstatus aktualisieren
        updateConnectionStatus('offline');
    };
    
    // Deaktiviert den Offline-Modus
    const exitOfflineMode = () => {
        console.log('Offline-Modus deaktiviert');
        isOffline = false;
        
        // UI aktualisieren
        if (offlineIndicator) {
            offlineIndicator.classList.remove('active');
            
            // Offline-Indicator nur ausblenden, wenn keine Änderungen gepuffert sind
            if (offlineChanges.length === 0) {
                offlineIndicator.style.display = 'none';
                syncButton.style.display = 'none';
            } else {
                // Sync-Button anzeigen für manuelle Synchronisierung
                syncButton.style.display = 'inline-block';
            }
        }
        
        // Verbindung wiederherstellen
        if (typeof connectWebSocket === 'function') {
            connectWebSocket();
        }
        
        // Automatisch synchronisieren, wenn wieder online
        syncOfflineChanges();
    };
    
    // Fügt eine Änderung zum Offline-Puffer hinzu
    const addOfflineChange = (type, data) => {
        if (!isOffline && offlineChanges.length === 0) return false;
        
        console.log(`Änderung zum Offline-Puffer hinzugefügt: ${type}`);
        
        // Änderung mit Zeitstempel zum Puffer hinzufügen
        const change = {
            id: generateUniqueId(),
            type: type,
            data: data,
            timestamp: Date.now()
        };
        
        offlineChanges.push(change);
        
        // Offline-Badge aktualisieren
        updateOfflineBadge();
        
        // Änderungen im localStorage speichern
        saveOfflineChanges();
        
        return true;
    };
    
    // Aktualisiert die Anzeige der Anzahl gepufferter Änderungen
    const updateOfflineBadge = () => {
        if (!offlineBadge) return;
        
        const count = offlineChanges.length;
        
        if (count > 0) {
            offlineBadge.textContent = count > 99 ? '99+' : count;
            offlineBadge.style.display = 'block';
            offlineIndicator.style.display = 'flex';
            syncButton.style.display = 'inline-block';
        } else {
            offlineBadge.style.display = 'none';
            
            // Offline-Indicator nur ausblenden, wenn nicht im Offline-Modus
            if (!isOffline) {
                offlineIndicator.style.display = 'none';
                syncButton.style.display = 'none';
            }
        }
    };
    
    // Synchronisiert gepufferte Änderungen mit dem Server
    const syncOfflineChanges = () => {
        if (offlineChanges.length === 0) return;
        
        if (isOffline) {
            console.log('Kann nicht synchronisieren: Offline-Modus aktiv');
            showNotification('Keine Verbindung zum Server möglich. Versuchen Sie es später erneut.', 'error');
            return;
        }
        
        if (!isWebSocketConnected()) {
            console.log('Kann nicht synchronisieren: WebSocket nicht verbunden');
            showNotification('Verbindung zum Server wird hergestellt. Bitte warten...', 'info');
            
            // Starte die Verbindung neu und versuche es später erneut
            if (typeof connectWebSocket === 'function') {
                connectWebSocket();
                
                // Nach kurzer Verzögerung erneut versuchen
                setTimeout(() => {
                    if (isWebSocketConnected()) {
                        syncOfflineChanges();
                    }
                }, 2000);
            }
            
            return;
        }
        
        console.log(`Synchronisiere ${offlineChanges.length} gepufferte Änderungen`);
        showNotification(`Synchronisiere ${offlineChanges.length} Änderungen...`, 'info');
        
        // Konfliktlösung anfordern
        requestSync().then(() => {
            // Änderungen der Reihe nach senden
            sendNextChange();
        }).catch(error => {
            console.error('Fehler bei der Synchronisierung:', error);
            showNotification('Synchronisierung fehlgeschlagen. Bitte versuchen Sie es später erneut.', 'error');
        });
    };
    
    // Fordert den aktuellen Zustand vom Server an zur Konfliktlösung
    const requestSync = () => {
        return new Promise((resolve, reject) => {
            // Timeout für die Serverantwort
            const timeout = setTimeout(() => {
                reject(new Error('Timeout bei der Serveranfrage'));
            }, 5000);
            
            // Anfrage an den Server senden
            try {
                // Callback für die Serverantwort registrieren
                window._syncCallback = (data) => {
                    clearTimeout(timeout);
                    lastKnownServerState = data || {};
                    resolve();
                };
                
                // Synchronisierungsanfrage senden
                sendWebSocketMessage('request_sync', {});
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    };
    
    // Sendet die nächste Änderung zum Server
    const sendNextChange = () => {
        if (offlineChanges.length === 0) {
            console.log('Alle Änderungen synchronisiert');
            showNotification('Synchronisierung abgeschlossen', 'success');
            
            // Offline-Badge aktualisieren
            updateOfflineBadge();
            
            // Lokalen Speicher leeren
            clearOfflineChanges();
            return;
        }
        
        // Erste Änderung aus dem Puffer nehmen
        const change = offlineChanges[0];
        
        // Konfliktprüfung
        if (hasConflict(change)) {
            console.log(`Konflikt bei Änderung ${change.id} gefunden, wird übersprungen`);
            
            // Änderung aus dem Puffer entfernen
            offlineChanges.shift();
            
            // Nächste Änderung senden
            sendNextChange();
            return;
        }
        
        console.log(`Sende Änderung: ${change.type} (ID: ${change.id})`);
        
        // Änderung an den Server senden
        const success = sendWebSocketMessage(change.type, change.data);
        
        if (success) {
            // Änderung aus dem Puffer entfernen
            offlineChanges.shift();
            
            // Offline-Badge aktualisieren
            updateOfflineBadge();
            
            // Änderungen im localStorage speichern
            saveOfflineChanges();
            
            // Kurze Pause vor der nächsten Änderung
            setTimeout(() => {
                sendNextChange();
            }, 300);
        } else {
            console.error('Fehler beim Senden der Änderung');
            showNotification('Fehler bei der Synchronisierung', 'error');
        }
    };
    
    // Prüft, ob eine Änderung einen Konflikt mit dem Server-Zustand hat
    const hasConflict = (change) => {
        // Konfliktprüfung für verschiedene Änderungstypen
        switch (change.type) {
            case 'update_project':
                // Prüfe, ob das Projekt existiert und der letzte Änderungszeitpunkt
                return checkProjectConflict(change.data);
                
            case 'update_step':
                // Prüfe, ob der Schritt existiert und der letzte Änderungszeitpunkt
                return checkStepConflict(change.data);
                
            case 'delete_project':
            case 'delete_step':
                // Bei Löschoperationen: Prüfe, ob das Element noch existiert
                return checkDeleteConflict(change);
                
            // Für andere Operationen: kein Konflikt
            default:
                return false;
        }
    };
    
    // Prüft Konflikte bei Projektaktualisierungen
    const checkProjectConflict = (projectData) => {
        // Wenn der Server-Zustand keine Projekte hat, können wir nicht vergleichen
        if (!lastKnownServerState.projects) return false;
        
        // Prüfe, ob das Projekt auf dem Server existiert
        const serverProject = lastKnownServerState.projects[projectData.id];
        if (!serverProject) {
            // Projekt existiert nicht mehr auf dem Server
            return true;
        }
        
        // Hier könnte eine tiefere Konfliktprüfung implementiert werden
        // z.B. Vergleich von Änderungszeitstempeln oder Inhalten
        
        return false;
    };
    
    // Prüft Konflikte bei Schrittaktualisierungen
    const checkStepConflict = (stepData) => {
        // Wenn der Server-Zustand keine Projekte hat, können wir nicht vergleichen
        if (!lastKnownServerState.projects) return false;
        
        // Prüfe, ob das Projekt noch existiert
        const serverProject = lastKnownServerState.projects[stepData.projectId];
        if (!serverProject || !serverProject.steps) {
            // Projekt oder Schritte existieren nicht mehr
            return true;
        }
        
        // Prüfe, ob der Schritt noch existiert
        const serverStep = serverProject.steps.find(step => step.id === stepData.id);
        if (!serverStep) {
            // Schritt existiert nicht mehr
            return true;
        }
        
        // Hier könnte eine tiefere Konfliktprüfung implementiert werden
        
        return false;
    };
    
    // Prüft Konflikte bei Löschoperationen
    const checkDeleteConflict = (change) => {
        // Bei Löschoperationen prüfen wir, ob das Element noch existiert
        
        if (change.type === 'delete_project') {
            // Wenn der Server-Zustand keine Projekte hat, können wir nicht vergleichen
            if (!lastKnownServerState.projects) return false;
            
            // Prüfe, ob das Projekt bereits gelöscht wurde
            return !lastKnownServerState.projects[change.data.id];
        }
        
        if (change.type === 'delete_step') {
            // Wenn der Server-Zustand keine Projekte hat, können wir nicht vergleichen
            if (!lastKnownServerState.projects) return false;
            
            // Prüfe, ob das Projekt noch existiert
            const serverProject = lastKnownServerState.projects[change.data.projectId];
            if (!serverProject || !serverProject.steps) {
                // Projekt oder Schritte existieren nicht mehr
                return true;
            }
            
            // Prüfe, ob der Schritt bereits gelöscht wurde
            const serverStep = serverProject.steps.find(step => step.id === change.data.id);
            return !serverStep;
        }
        
        return false;
    };
    
    // Speichert gepufferte Änderungen im localStorage
    const saveOfflineChanges = () => {
        try {
            localStorage.setItem('offlineChanges', JSON.stringify(offlineChanges));
        } catch (error) {
            console.error('Fehler beim Speichern der Offline-Änderungen:', error);
        }
    };
    
    // Lädt gepufferte Änderungen aus dem localStorage
    const loadOfflineChanges = () => {
        try {
            const savedChanges = localStorage.getItem('offlineChanges');
            if (savedChanges) {
                offlineChanges = JSON.parse(savedChanges);
                console.log(`${offlineChanges.length} gepufferte Änderungen geladen`);
                
                // Offline-Badge aktualisieren
                updateOfflineBadge();
            }
        } catch (error) {
            console.error('Fehler beim Laden der Offline-Änderungen:', error);
            offlineChanges = [];
        }
    };
    
    // Löscht alle gepufferten Änderungen
    const clearOfflineChanges = () => {
        offlineChanges = [];
        localStorage.removeItem('offlineChanges');
    };
    
    // Prüft, ob der WebSocket verbunden ist
    const isWebSocketConnected = () => {
        return typeof socket !== 'undefined' && socket && socket.readyState === WebSocket.OPEN;
    };
    
    // Zeigt eine Benachrichtigung an
    const showNotification = (message, type = 'info') => {
        // Prüfe, ob bereits eine Benachrichtigung angezeigt wird
        let notificationContainer = document.querySelector('.notification-container');
        
        if (!notificationContainer) {
            // Container erstellen, falls nicht vorhanden
            notificationContainer = document.createElement('div');
            notificationContainer.className = 'notification-container';
            document.body.appendChild(notificationContainer);
        }
        
        // Neue Benachrichtigung erstellen
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Schließen-Button hinzufügen
        const closeButton = document.createElement('span');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '&times;';
        closeButton.onclick = () => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
                
                // Container entfernen, wenn keine Benachrichtigungen mehr vorhanden sind
                if (notificationContainer.children.length === 0) {
                    notificationContainer.remove();
                }
            }, 300);
        };
        
        notification.appendChild(closeButton);
        
        // Benachrichtigung zum Container hinzufügen
        notificationContainer.appendChild(notification);
        
        // Automatisches Ausblenden nach 5 Sekunden
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                        
                        // Container entfernen, wenn keine Benachrichtigungen mehr vorhanden sind
                        if (notificationContainer.children.length === 0) {
                            notificationContainer.remove();
                        }
                    }
                }, 300);
            }
        }, 5000);
    };
    
    // Generiert eine eindeutige ID
    const generateUniqueId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    };
    
    // Public API
    return {
        init,
        addOfflineChange,
        isOffline: () => isOffline,
        syncOfflineChanges
    };
})();

// Initialisiere den Offline-Manager nach dem Laden des Dokuments
document.addEventListener('DOMContentLoaded', () => {
    // Warten, bis andere Skripte geladen sind
    setTimeout(() => {
        OfflineManager.init();
    }, 500);
});