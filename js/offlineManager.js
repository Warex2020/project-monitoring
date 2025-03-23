/**
 * offlineManager.js - Verwaltet Offline-Funktionalität und Synchronisierung
 * Version 2.0.0 - Mit IndexedDB-Unterstützung für bessere Offline-Funktionalität
 */

const OfflineManager = (() => {
    // Konstanten
    const DB_NAME = 'projectMonitoringOfflineDB';
    const DB_VERSION = 1;
    const CHANGES_STORE = 'offlineChanges';
    const PROJECTS_STORE = 'offlineProjects';
    
    // IndexedDB-Referenzen
    let db = null;
    
    // Flag für den Offline-Modus
    let isOfflineMode = false;
    
    // Speichert den letzten bekannten Server-Zustand
    let lastKnownServerState = {};
    
    // DOM-Elemente
    let offlineIndicator = null;
    let offlineBadge = null;
    let syncButton = null;
    
    // Initialisiert den Offline-Manager
    const init = async () => {
        try {
            // Initialisieren der IndexedDB
            await initIndexedDB();
            
            // Offline-Status-UI initialisieren
            createOfflineUI();
            
            // Event-Listener für Online/Offline-Status
            window.addEventListener('online', handleOnlineStatusChange);
            window.addEventListener('offline', handleOnlineStatusChange);
            
            // WebSocket-Status überwachen
            window.addEventListener('websocketStatusChange', (e) => {
                if (!e.detail.isConnected && navigator.onLine) {
                    // WebSocket offline, aber Netzwerk online = Server nicht erreichbar
                    enterOfflineMode();
                }
            });
            
            // Initialen Status prüfen
            handleOnlineStatusChange();
            
            // Vorhandene gepufferte Änderungen aus der IndexedDB laden
            await loadOfflineChanges();
            
            console.log('OfflineManager erfolgreich initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung des OfflineManagers:', error);
            showNotification('Offline-Modus konnte nicht vollständig initialisiert werden.', 'error');
        }
    };
    
    /**
     * Initialisiert die IndexedDB-Datenbank
     */
    const initIndexedDB = () => {
        return new Promise((resolve, reject) => {
            // IndexedDB öffnen oder erstellen
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            // Handle Fehler
            request.onerror = (event) => {
                console.error('IndexedDB konnte nicht geöffnet werden:', event.target.error);
                reject(event.target.error);
            };
            
            // Handle Upgrade (Erstinstallation oder Version Update)
            request.onupgradeneeded = (event) => {
                console.log('Erstelle oder aktualisiere IndexedDB-Schema');
                db = event.target.result;
                
                // Object Stores erstellen
                if (!db.objectStoreNames.contains(CHANGES_STORE)) {
                    const changesStore = db.createObjectStore(CHANGES_STORE, { keyPath: 'id' });
                    changesStore.createIndex('timestamp', 'timestamp', { unique: false });
                    changesStore.createIndex('type', 'type', { unique: false });
                }
                
                if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
                    const projectsStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
                    projectsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            
            // Handle erfolgreiche Verbindung
            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('IndexedDB erfolgreich geöffnet');
                
                // Event-Handler für Verbindungsfehler
                db.onerror = (event) => {
                    console.error('IndexedDB-Fehler:', event.target.error);
                    showNotification('Datenbankfehler im Offline-Modus', 'error');
                };
                
                resolve(db);
            };
        });
    };
    
    /**
     * Erstellt UI-Elemente für den Offline-Modus
     */
    const createOfflineUI = () => {
        // Container für Offline-Anzeige
        const headerInfo = document.querySelector('.dashboard-info') || document.querySelector('.header-right');
        
        if (!headerInfo) {
            console.error('Kein Container für Offline-UI gefunden');
            return;
        }
        
        // Offline-Indicator erstellen
        offlineIndicator = document.createElement('div');
        offlineIndicator.className = 'offline-indicator';
        offlineIndicator.style.display = 'none';
        offlineIndicator.setAttribute('role', 'status'); // Für Accessibility
        offlineIndicator.setAttribute('aria-live', 'polite');
        
        // Offline-Badge für die Anzahl gepufferter Änderungen
        offlineBadge = document.createElement('span');
        offlineBadge.className = 'offline-badge';
        offlineBadge.textContent = '0';
        offlineBadge.style.display = 'none';
        offlineBadge.setAttribute('aria-label', 'Anzahl der gepufferten Änderungen');
        
        // Sync-Button für manuelles Synchronisieren
        syncButton = document.createElement('button');
        syncButton.className = 'sync-button';
        syncButton.innerHTML = '↻ Sync';
        syncButton.title = 'Änderungen synchronisieren';
        syncButton.style.display = 'none';
        syncButton.addEventListener('click', syncOfflineChanges);
        syncButton.setAttribute('aria-label', 'Änderungen mit dem Server synchronisieren');
        
        // Elemente zum Container hinzufügen
        offlineIndicator.appendChild(offlineBadge);
        headerInfo.appendChild(offlineIndicator);
        headerInfo.appendChild(syncButton);
    };
    
    /**
     * Behandelt Änderungen des Online/Offline-Status
     */
    const handleOnlineStatusChange = () => {
        const wasOffline = isOfflineMode;
        const isNetworkOffline = !navigator.onLine;
        
        if (isNetworkOffline) {
            enterOfflineMode();
        } else if (wasOffline) {
            // Nur wenn wir vorher offline waren - sonst bleibt der Status unverändert
            exitOfflineMode();
        }
    };
    
    /**
     * Aktiviert den Offline-Modus
     */
    const enterOfflineMode = () => {
        if (isOfflineMode) return; // Bereits im Offline-Modus
        
        console.log('Offline-Modus aktiviert');
        isOfflineMode = true;
        
        // UI aktualisieren
        if (offlineIndicator) {
            offlineIndicator.style.display = 'flex';
            offlineIndicator.classList.add('active');
            offlineIndicator.setAttribute('aria-label', 'Offline-Modus aktiv');
        }
        
        // Benachrichtigung anzeigen
        showNotification('Offline-Modus aktiviert. Änderungen werden lokal gespeichert.', 'warning');
        
        // Den WebSocket-Verbindungsstatus aktualisieren
        updateConnectionStatus('offline');
        
        // Speichere den aktuellen Projektzustand in der IndexedDB
        saveProjectsToIndexedDB();
        
        // Trigger ein Offline-Event für andere Komponenten
        window.dispatchEvent(new CustomEvent('offlineModeChange', { 
            detail: { offline: true } 
        }));
    };
    
    /**
     * Deaktiviert den Offline-Modus
     */
    const exitOfflineMode = async () => {
        if (!isOfflineMode) return; // Bereits online
        
        console.log('Offline-Modus deaktiviert');
        isOfflineMode = false;
        
        // UI aktualisieren
        if (offlineIndicator) {
            offlineIndicator.classList.remove('active');
            offlineIndicator.setAttribute('aria-label', 'Im Online-Modus mit gepufferten Änderungen');
            
            // Offline-Indicator nur ausblenden, wenn keine Änderungen gepuffert sind
            const changesCount = await getOfflineChangesCount();
            if (changesCount === 0) {
                offlineIndicator.style.display = 'none';
                syncButton.style.display = 'none';
            } else {
                // Sync-Button anzeigen für manuelle Synchronisierung
                syncButton.style.display = 'inline-block';
            }
        }
        
        // Benachrichtigung anzeigen
        showNotification('Online-Modus aktiviert. Synchronisiere Änderungen...', 'success');
        
        // Verbindung wiederherstellen
        if (typeof connectWebSocket === 'function') {
            connectWebSocket();
            
            // Kurze Verzögerung für die WebSocket-Verbindung
            setTimeout(() => {
                // Automatisch synchronisieren, wenn wieder online
                syncOfflineChanges();
            }, 2000);
        }
        
        // Trigger ein Online-Event für andere Komponenten
        window.dispatchEvent(new CustomEvent('offlineModeChange', { 
            detail: { offline: false } 
        }));
    };
    
    /**
     * Speichert den aktuellen Projektzustand in der IndexedDB
     */
    const saveProjectsToIndexedDB = async () => {
        if (!db) return;
        
        try {
            // ProjectManager muss verfügbar sein
            if (typeof ProjectManager === 'undefined' || !ProjectManager.getAllProjects) {
                return;
            }
            
            const projects = ProjectManager.getAllProjects();
            if (!projects) return;
            
            const transaction = db.transaction([PROJECTS_STORE], 'readwrite');
            const store = transaction.objectStore(PROJECTS_STORE);
            
            // Alle Projekte speichern
            Object.values(projects).forEach(project => {
                // Timestamp hinzufügen, wenn nicht vorhanden
                if (!project.updatedAt) {
                    project.updatedAt = new Date().toISOString();
                }
                store.put(project);
            });
            
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`${Object.keys(projects).length} Projekte in IndexedDB gespeichert`);
                    resolve();
                };
                
                transaction.onerror = (event) => {
                    console.error('Fehler beim Speichern der Projekte in IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Speichern der Projekte:', error);
        }
    };
    
    /**
     * Lädt Projekte aus der IndexedDB, wenn offline
     */
    const loadProjectsFromIndexedDB = async () => {
        if (!db) return;
        
        try {
            const transaction = db.transaction([PROJECTS_STORE], 'readonly');
            const store = transaction.objectStore(PROJECTS_STORE);
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const projects = event.target.result;
                    
                    // Projekte in ein Objekt mit ID als Schlüssel konvertieren
                    const projectsObject = {};
                    projects.forEach(project => {
                        projectsObject[project.id] = project;
                    });
                    
                    console.log(`${projects.length} Projekte aus IndexedDB geladen`);
                    resolve(projectsObject);
                };
                
                request.onerror = (event) => {
                    console.error('Fehler beim Laden der Projekte aus IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Laden der Projekte:', error);
            return {};
        }
    };
    
    /**
     * Fügt eine Änderung zum Offline-Puffer hinzu
     * @param {string} type - Typ der Änderung
     * @param {Object} data - Daten der Änderung
     * @returns {Promise<boolean>} - Ob die Änderung erfolgreich gepuffert wurde
     */
    const addOfflineChange = async (type, data) => {
        if (!db) {
            console.error('IndexedDB nicht verfügbar');
            return false;
        }
        
        try {
            console.log(`Änderung zum Offline-Puffer hinzugefügt: ${type}`);
            
            // Änderung mit Zeitstempel zum Puffer hinzufügen
            const change = {
                id: generateUniqueId(),
                type: type,
                data: data,
                timestamp: Date.now()
            };
            
            const transaction = db.transaction([CHANGES_STORE], 'readwrite');
            const store = transaction.objectStore(CHANGES_STORE);
            
            return new Promise((resolve, reject) => {
                const request = store.add(change);
                
                request.onsuccess = () => {
                    // Offline-Badge aktualisieren
                    updateOfflineBadge();
                    resolve(true);
                };
                
                request.onerror = (event) => {
                    console.error('Fehler beim Speichern der Änderung:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Hinzufügen der Offline-Änderung:', error);
            return false;
        }
    };
    
    /**
     * Lädt alle gepufferten Änderungen aus der IndexedDB
     */
    const loadOfflineChanges = async () => {
        if (!db) return [];
        
        try {
            const transaction = db.transaction([CHANGES_STORE], 'readonly');
            const store = transaction.objectStore(CHANGES_STORE);
            const index = store.index('timestamp');
            
            return new Promise((resolve, reject) => {
                const request = index.getAll();
                
                request.onsuccess = (event) => {
                    const changes = event.target.result;
                    console.log(`${changes.length} gepufferte Änderungen geladen`);
                    
                    // Offline-Badge aktualisieren
                    updateOfflineBadge(changes.length);
                    
                    resolve(changes);
                };
                
                request.onerror = (event) => {
                    console.error('Fehler beim Laden der Änderungen:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Laden der Offline-Änderungen:', error);
            return [];
        }
    };
    
    /**
     * Ermittelt die Anzahl der gepufferten Änderungen
     * @returns {Promise<number>} - Anzahl der Änderungen
     */
    const getOfflineChangesCount = async () => {
        if (!db) return 0;
        
        try {
            const transaction = db.transaction([CHANGES_STORE], 'readonly');
            const store = transaction.objectStore(CHANGES_STORE);
            
            return new Promise((resolve, reject) => {
                const countRequest = store.count();
                
                countRequest.onsuccess = () => {
                    resolve(countRequest.result);
                };
                
                countRequest.onerror = (event) => {
                    console.error('Fehler beim Zählen der Änderungen:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Ermitteln der Offline-Änderungen:', error);
            return 0;
        }
    };
    
    /**
     * Löscht eine Änderung aus dem Offline-Puffer
     * @param {string} changeId - ID der zu löschenden Änderung
     * @returns {Promise<boolean>} - Ob die Änderung erfolgreich gelöscht wurde
     */
    const removeOfflineChange = async (changeId) => {
        if (!db) return false;
        
        try {
            const transaction = db.transaction([CHANGES_STORE], 'readwrite');
            const store = transaction.objectStore(CHANGES_STORE);
            
            return new Promise((resolve, reject) => {
                const request = store.delete(changeId);
                
                request.onsuccess = () => {
                    resolve(true);
                };
                
                request.onerror = (event) => {
                    console.error('Fehler beim Löschen der Änderung:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Fehler beim Löschen der Offline-Änderung:', error);
            return false;
        }
    };
    
    /**
     * Aktualisiert die Anzeige der Anzahl gepufferter Änderungen
     * @param {number} count - Optional: Anzahl der gepufferten Änderungen
     */
    const updateOfflineBadge = async (count) => {
        if (!offlineBadge) return;
        
        // Wenn keine Anzahl übergeben wurde, ermitteln wir sie aus der Datenbank
        if (count === undefined) {
            count = await getOfflineChangesCount();
        }
        
        if (count > 0) {
            offlineBadge.textContent = count > 99 ? '99+' : count;
            offlineBadge.style.display = 'block';
            offlineBadge.setAttribute('aria-label', `${count} Änderungen warten auf Synchronisierung`);
            
            offlineIndicator.style.display = 'flex';
            syncButton.style.display = 'inline-block';
        } else {
            offlineBadge.style.display = 'none';
            
            // Offline-Indicator nur ausblenden, wenn nicht im Offline-Modus
            if (!isOfflineMode) {
                offlineIndicator.style.display = 'none';
                syncButton.style.display = 'none';
            }
        }
    };
    
    /**
     * Synchronisiert gepufferte Änderungen mit dem Server
     */
    const syncOfflineChanges = async () => {
        // Prüfen, ob überhaupt Änderungen vorhanden sind
        const changeCount = await getOfflineChangesCount();
        if (changeCount === 0) {
            console.log('Keine Änderungen zu synchronisieren vorhanden');
            return;
        }
        
        if (isOfflineMode) {
            console.log('Kann nicht synchronisieren: Offline-Modus aktiv');
            showNotification('Keine Verbindung zum Server möglich. Versuchen Sie es später erneut.', 'error');
            return;
        }
        
        if (typeof isWebSocketConnected === 'function' && !isWebSocketConnected()) {
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
        
        console.log(`Synchronisiere ${changeCount} gepufferte Änderungen`);
        showNotification(`Synchronisiere ${changeCount} Änderungen...`, 'info');
        
        // Konfliktlösung anfordern
        try {
            await requestSync();
            
            // Änderungen der Reihe nach senden
            await sendNextChange();
        } catch (error) {
            console.error('Fehler bei der Synchronisierung:', error);
            showNotification('Synchronisierung fehlgeschlagen. Bitte versuchen Sie es später erneut.', 'error');
        }
    };
    
    /**
     * Fordert den aktuellen Zustand vom Server an zur Konfliktlösung
     * @returns {Promise<void>}
     */
    const requestSync = () => {
        return new Promise((resolve, reject) => {
            // Timeout für die Serverantwort
            const timeout = setTimeout(() => {
                reject(new Error('Timeout bei der Serveranfrage'));
            }, 10000);
            
            // Anfrage an den Server senden
            try {
                // Callback für die Serverantwort registrieren
                window._syncCallback = (data) => {
                    clearTimeout(timeout);
                    lastKnownServerState = data || {};
                    resolve();
                };
                
                // Synchronisierungsanfrage senden
                if (typeof sendWebSocketMessage === 'function') {
                    sendWebSocketMessage('request_sync', {});
                } else {
                    reject(new Error('WebSocket-Funktionen nicht verfügbar'));
                }
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    };
    
    /**
     * Sendet die nächste Änderung zum Server
     * @returns {Promise<void>}
     */
    const sendNextChange = async () => {
        // Lade die älteste Änderung
        const changes = await loadOfflineChanges();
        
        if (changes.length === 0) {
            console.log('Alle Änderungen synchronisiert');
            showNotification('Synchronisierung abgeschlossen', 'success');
            
            // Offline-Badge aktualisieren
            updateOfflineBadge(0);
            return;
        }
        
        // Erste Änderung aus dem Puffer nehmen
        const change = changes[0];
        
        // Konfliktprüfung
        const hasConflict = await checkForConflict(change);
        if (hasConflict) {
            console.log(`Konflikt bei Änderung ${change.id} gefunden, wird übersprungen`);
            
            // Änderung aus dem Puffer entfernen
            await removeOfflineChange(change.id);
            
            // Nächste Änderung senden
            return sendNextChange();
        }
        
        console.log(`Sende Änderung: ${change.type} (ID: ${change.id})`);
        
        // Änderung an den Server senden
        let success = false;
        if (typeof sendWebSocketMessage === 'function') {
            success = sendWebSocketMessage(change.type, change.data);
        }
        
        if (success) {
            // Änderung aus dem Puffer entfernen
            await removeOfflineChange(change.id);
            
            // Offline-Badge aktualisieren
            updateOfflineBadge();
            
            // Kurze Pause vor der nächsten Änderung
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Nächste Änderung senden
            return sendNextChange();
        } else {
            console.error('Fehler beim Senden der Änderung');
            showNotification('Fehler bei der Synchronisierung', 'error');
        }
    };
    
    /**
     * Prüft, ob für eine Änderung ein Konflikt vorliegt
     * @param {Object} change - Die zu prüfende Änderung
     * @returns {Promise<boolean>} - Ob ein Konflikt vorliegt
     */
    const checkForConflict = async (change) => {
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
    
    /**
     * Prüft Konflikte bei Projektaktualisierungen
     * @param {Object} projectData - Projektdaten
     * @returns {boolean} - Ob ein Konflikt vorliegt
     */
    const checkProjectConflict = (projectData) => {
        // Wenn der Server-Zustand keine Projekte hat, können wir nicht vergleichen
        if (!lastKnownServerState.projects) return false;
        
        // Prüfe, ob das Projekt auf dem Server existiert
        const serverProject = lastKnownServerState.projects[projectData.id];
        if (!serverProject) {
            // Projekt existiert nicht mehr auf dem Server
            return true;
        }
        
        // Vergleiche Zeitstempel, falls vorhanden
        if (serverProject.updatedAt && projectData.updatedAt) {
            const serverTime = new Date(serverProject.updatedAt).getTime();
            const localTime = new Date(projectData.updatedAt).getTime();
            
            // Server-Version ist neuer - Konflikt
            if (serverTime > localTime) {
                return true;
            }
        }
        
        return false;
    };
    
    /**
     * Prüft Konflikte bei Schrittaktualisierungen
     * @param {Object} stepData - Schrittdaten
     * @returns {boolean} - Ob ein Konflikt vorliegt
     */
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
        
        // Vergleiche Zeitstempel, falls vorhanden
        if (serverStep.updatedAt && stepData.updatedAt) {
            const serverTime = new Date(serverStep.updatedAt).getTime();
            const localTime = new Date(stepData.updatedAt).getTime();
            
            // Server-Version ist neuer - Konflikt
            if (serverTime > localTime) {
                return true;
            }
        }
        
        return false;
    };
    
    /**
     * Prüft Konflikte bei Löschoperationen
     * @param {Object} change - Die Änderung
     * @returns {boolean} - Ob ein Konflikt vorliegt
     */
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
    
    /**
     * Generiert eine eindeutige ID
     * @returns {string} - Eindeutige ID
     */
    const generateUniqueId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    };
    
    /**
     * Den aktuellen Verbindungsstatus des WebSockets aktualisieren
     * @param {string} status - Der neue Status ('offline', 'connected', etc.)
     */
    const updateConnectionStatus = (status) => {
        if (typeof window.updateConnectionStatus === 'function') {
            window.updateConnectionStatus(status);
        }
    };
    
    /**
     * Zeigt eine Benachrichtigung an
     * @param {string} message - Die Nachricht
     * @param {string} type - Der Typ der Nachricht ('info', 'success', 'warning', 'error')
     */
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
        notification.setAttribute('role', 'alert'); // Für Accessibility
        notification.setAttribute('aria-live', 'assertive');
        
        // Schließen-Button hinzufügen
        const closeButton = document.createElement('span');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', 'Schließen');
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
    
    // Public API
    return {
        init,
        addOfflineChange,
        isOffline: () => isOfflineMode,
        syncOfflineChanges,
        enterOfflineMode,
        exitOfflineMode,
        showNotification,
        loadProjectsFromIndexedDB,
        saveProjectsToIndexedDB
    };
})();

// Initialisiere den Offline-Manager nach dem Laden des Dokuments
document.addEventListener('DOMContentLoaded', () => {
    // Warten, bis andere Skripte geladen sind
    setTimeout(() => {
        OfflineManager.init();
    }, 500);
});

// Service Worker registrieren für erweiterte Offline-Funktionalität
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.error('ServiceWorker registration failed: ', error);
            });
    });
}