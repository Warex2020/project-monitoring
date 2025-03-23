/**
 * service-worker.js - Offline-Cache und Hintergrund-Synchronisation
 * Version 1.0.0
 */

const CACHE_NAME = 'project-dashboard-cache-v1';
const DYNAMIC_CACHE = 'project-dashboard-dynamic-v1';

// Dateien, die beim Installieren des Service Workers gecacht werden sollen
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/css/styles.css',
    '/css/dark-theme.css',
    '/css/enhanced-ui.css',
    '/css/offline.css',
    '/js/main.js',
    '/js/authManager.js',
    '/js/configManager.js',
    '/js/enhancedUI.js',
    '/js/offlineManager.js',
    '/js/projectManager.js',
    '/js/todoManager.js',
    '/js/websocket.js',
    '/favicon.ico'
];

// Installation des Service Workers
self.addEventListener('install', event => {
    console.log('Service Worker wird installiert');
    
    // Cache während der Installation befüllen
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache geöffnet');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Skip Waiting sorgt dafür, dass der neue Service Worker sofort aktiviert wird
                return self.skipWaiting();
            })
    );
});

// Aktivierung des Service Workers
self.addEventListener('activate', event => {
    console.log('Service Worker aktiviert');
    
    // Alte Caches löschen
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => {
                    return name !== CACHE_NAME && name !== DYNAMIC_CACHE;
                }).map(name => {
                    console.log('Lösche alten Cache:', name);
                    return caches.delete(name);
                })
            );
        })
        .then(() => {
            // Übernimm sofort die Kontrolle über alle Clients
            return self.clients.claim();
        })
    );
});

// Netzwerkanfragen abfangen
self.addEventListener('fetch', event => {
    // Ignoriere Anfragen mit nicht unterstützten Schemas
    if (!event.request.url.startsWith('http')) {
        console.warn('Nicht unterstützte Anfrage ignoriert:', event.request.url);
        return;
    }

    // API-Anfragen und WebSocket-Verbindungen ignorieren
    if (event.request.url.includes('/api/') || 
        event.request.url.includes('ws://') || 
        event.request.url.includes('wss://')) {
        return;
    }
    
    // HTML-Seiten immer von Netzwerk laden, mit Fallback auf Cache
    if (event.request.mode === 'navigate' || 
        (event.request.method === 'GET' && 
         event.request.headers.get('accept').includes('text/html'))) {
        
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            
                            // Wenn auch im Cache nicht gefunden, Offline-Seite anzeigen
                            return caches.match('/offline.html') || 
                                   new Response('Die Seite ist offline nicht verfügbar.', {
                                       status: 503,
                                       statusText: 'Service Unavailable',
                                       headers: new Headers({
                                           'Content-Type': 'text/html'
                                       })
                                   });
                        });
                })
        );
        return;
    }
    
    // Für alle anderen Anfragen: Stale-While-Revalidate-Strategie
    // Zeige gecachte Version an, während im Hintergrund aktualisiert wird
    event.respondWith(
        caches.open(DYNAMIC_CACHE).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        // Nur Ressourcen mit http/https-Schema cachen
                        if (networkResponse.ok && event.request.method === 'GET' && 
                            event.request.url.startsWith('http')) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Netzwerkfehler, aber wir haben vielleicht eine gecachte Version
                        console.log('Lade Fallback für:', event.request.url);
                        
                        // Für Bilder einen Platzhalter laden
                        if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
                            return caches.match('/img/offline-placeholder.svg');
                        }
                    });
                
                // Gecachte Version sofort zurückgeben, wenn vorhanden
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// Hintergrund-Synchronisation
self.addEventListener('sync', event => {
    if (event.tag === 'sync-offline-changes') {
        console.log('Hintergrund-Synchronisation für offline Änderungen gestartet');
        
        event.waitUntil(
            // Sende Nachricht an Clients, um Synchronisation zu starten
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'sync-offline-changes'
                    });
                });
            })
        );
    }
});

// Push-Benachrichtigungen
self.addEventListener('push', event => {
    let notification = {
        title: 'Projektmonitor',
        body: 'Es gibt Neuigkeiten zu deinen Projekten',
        icon: '/img/logo.png',
        badge: '/img/badge.png',
        data: {}
    };
    
    try {
        if (event.data) {
            notification = {
                ...notification,
                ...JSON.parse(event.data.text())
            };
        }
    } catch (error) {
        console.error('Fehler beim Parsen der Push-Nachricht:', error);
    }
    
    event.waitUntil(
        self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: notification.icon,
            badge: notification.badge,
            data: notification.data,
            vibrate: [100, 50, 100],
            requireInteraction: false
        })
    );
});

// Klick auf Push-Benachrichtigung
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    const data = event.notification.data;
    const url = data.url || '/';
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clientList => {
            // Bereits geöffnete Fenster fokussieren
            for (const client of clientList) {
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Wenn kein Fenster geöffnet ist, neues öffnen
            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }
        })
    );
});

// Offline-Seite erstellen
const createOfflinePage = () => {
    const offlinePageContent = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - IT-Projekt-Monitoring</title>
        <style>
            /* Offline-Seiten-Stile */
        </style>
    </head>
    <body>
        <h1>Offline</h1>
        <p>Die Seite ist offline nicht verfügbar.</p>
    </body>
    </html>
    `;

    // Nur cachen, wenn die URL ein unterstütztes Schema hat
    if (self.location.protocol.startsWith('http')) {
        caches.open(CACHE_NAME).then(cache => {
            cache.put('/offline.html', new Response(offlinePageContent, {
                headers: { 'Content-Type': 'text/html' }
            }));
        }).catch(error => {
            console.error('Fehler beim Cachen der Offline-Seite:', error);
        });
    } else {
        console.warn('Offline-Seite wird nicht gecacht, da das Schema nicht unterstützt wird:', self.location.protocol);
    }
};

// Erstelle die Offline-Seite nachdem der Service Worker aktiviert wurde
self.addEventListener('activate', event => {
    event.waitUntil(createOfflinePage());
});