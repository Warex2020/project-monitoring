/**
 * websocket.js - Provides WebSocket functionality for live updates
 * Version 1.3.0
 */

// WebSocket connection
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectInterval = 5000; // 5 seconds

// Connection status indicators
const connectionIndicator = document.getElementById('connection-indicator');
const connectionText = document.getElementById('connection-text');

// Establishes a WebSocket connection
function connectWebSocket() {
    // Show "Connecting..." status
    updateConnectionStatus('connecting');
    
    try {
        // Get the port from configuration if available
        const getServerPort = () => {
            try {
                // If we have a global serverConfig object
                if (window.serverConfig && window.serverConfig.port) {
                    return window.serverConfig.port;
                }
                
                // Use the current URL port or default 3420
                return window.location.port || 3420;
            } catch (error) {
                console.error('Error determining server port:', error);
                return 3420; // Fallback to configured port
            }
        };
        
        // Create WebSocket connection to server
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const host = window.location.hostname || 'localhost';
        const port = getServerPort(); // Dynamically determine the port
        
        console.log(`Establishing WebSocket connection to ${protocol}${host}:${port}...`);
        socket = new WebSocket(`${protocol}${host}:${port}`);
        
        // Event handler for successful connection
        socket.onopen = function() {
            console.log('WebSocket connection established');
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus('connected');
            
            // Send authentication status if available
            if (typeof AuthManager !== 'undefined' && typeof AuthManager.sendAuthStatus === 'function') {
                setTimeout(() => {
                    AuthManager.sendAuthStatus();
                }, 500);
            }
        };
        
        // Event handler for incoming messages
        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                
                // Special handling for synchronization responses
                if (message.type === 'sync_response' && window._syncCallback) {
                    window._syncCallback(message.data);
                    return;
                }
                
                // Special handling for authentication responses
                if (message.type === 'auth_status') {
                    console.log('Authentication status update:', message.data);
                    return;
                }
                
                // Special handling for error messages
                if (message.type === 'error') {
                    handleErrorMessage(message.data);
                    return;
                }
                
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };
        
        // Event handler for connection errors
        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            updateConnectionStatus('disconnected');
        };
        
        // Event handler for closed connection
        socket.onclose = function(event) {
            console.log('WebSocket connection closed', event.code, event.reason);
            isConnected = false;
            
            // Check if connection was closed due to access rights
            if (event.code === 1008) {
                showAccessDeniedMessage(event.reason);
                updateConnectionStatus('denied');
                return;
            }
            
            updateConnectionStatus('disconnected');
            
            // Try to restore the connection
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`Trying to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
                setTimeout(connectWebSocket, reconnectInterval);
            } else {
                console.error('Maximum number of reconnection attempts reached.');
            }
        };
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        updateConnectionStatus('disconnected');
    }
}

// Handle error messages from the server
function handleErrorMessage(error) {
    console.error('Server error:', error);
    
    // Handle authentication errors
    if (error.code === 'AUTH_REQUIRED') {
        // If Authentication Manager is available, handle the error
        if (typeof AuthManager !== 'undefined' && typeof AuthManager.handleAuthError === 'function') {
            AuthManager.handleAuthError(error);
        } else {
            // Default action: redirect to login
            window.location.href = '/login';
        }
    }
    
    // Show notification if offline manager is available
    if (typeof OfflineManager !== 'undefined' && 
        typeof OfflineManager.showNotification === 'function') {
        OfflineManager.showNotification(error.message, 'error');
    }
}

// Displays a message when access is denied
function showAccessDeniedMessage(reason) {
    // Create an overlay container for the message
    const overlay = document.createElement('div');
    overlay.className = 'access-denied-overlay';
    
    const messageBox = document.createElement('div');
    messageBox.className = 'access-denied-message';
    
    const title = document.createElement('h2');
    title.textContent = 'Access Denied';
    
    const message = document.createElement('p');
    message.textContent = 'Your IP address is not authorized to access this dashboard.';
    
    const ipInfo = document.createElement('div');
    ipInfo.className = 'ip-info';
    ipInfo.textContent = `Your IP address: ${window.location.hostname === 'localhost' ? '127.0.0.1 (localhost)' : '...loading...'}`;
    
    // Try to determine the IP address (for display only)
    fetch('https://api.ipify.org?format=json')
        .then(response => response.json())
        .then(data => {
            ipInfo.textContent = `Your IP address: ${data.ip}`;
        })
        .catch(() => {
            // Fallback if IP cannot be determined
            ipInfo.textContent = 'Your IP address could not be determined.';
        });
    
    const contactInfo = document.createElement('p');
    contactInfo.textContent = 'Please contact your administrator to request access.';
    
    // Add login option if public access is available
    if (typeof ConfigManager !== 'undefined' && 
        typeof ConfigManager.isPublicMode === 'function' && 
        ConfigManager.isPublicMode()) {
        
        const loginOption = document.createElement('p');
        loginOption.textContent = 'You can still access the dashboard in read-only mode.';
        
        const loginButton = document.createElement('button');
        loginButton.className = 'submit-button';
        loginButton.textContent = 'Continue in Read-Only Mode';
        loginButton.style.marginTop = '20px';
        loginButton.onclick = () => {
            overlay.remove();
            document.querySelector('.container').style.display = 'block';
        };
        
        messageBox.appendChild(loginOption);
        messageBox.appendChild(loginButton);
    }
    
    // Assemble everything
    messageBox.appendChild(title);
    messageBox.appendChild(message);
    messageBox.appendChild(ipInfo);
    messageBox.appendChild(contactInfo);
    overlay.appendChild(messageBox);
    
    // Attach to the document
    document.body.appendChild(overlay);
    
    // Hide standard UI
    document.querySelector('.container').style.display = 'none';
}

// Sends a message via WebSocket
function sendWebSocketMessage(type, data) {
    // Check offline mode
    if (typeof OfflineManager !== 'undefined' && OfflineManager.isOffline()) {
        console.log('Offline mode: Message will be buffered', type);
        return OfflineManager.addOfflineChange(type, data);
    }
    
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected. Message cannot be sent.');
        
        // Buffer message in offline mode if available
        if (typeof OfflineManager !== 'undefined') {
            return OfflineManager.addOfflineChange(type, data);
        }
        
        return false;
    }
    
    // Check if authentication is required for this operation
    const isWriteOperation = ['add_project', 'update_project', 'delete_project', 
                              'add_step', 'update_step', 'delete_step'].includes(type);
    
    if (isWriteOperation && 
        typeof AuthManager !== 'undefined' && 
        typeof AuthManager.isAuthRequired === 'function' && 
        typeof AuthManager.isAuthenticated === 'function') {
        
        if (AuthManager.isAuthRequired() && !AuthManager.isAuthenticated()) {
            console.warn('Authentication required for this operation');
            
            // Show notification if offline manager is available
            if (typeof OfflineManager !== 'undefined' && 
                typeof OfflineManager.showNotification === 'function') {
                OfflineManager.showNotification('Authentication required to make changes', 'error');
            }
            
            // Redirect to login
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            
            return false;
        }
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
        console.error('Error sending WebSocket message:', error);
        
        // Buffer message in offline mode if available
        if (typeof OfflineManager !== 'undefined') {
            return OfflineManager.addOfflineChange(type, data);
        }
        
        return false;
    }
}

// Processes incoming WebSocket messages
function handleWebSocketMessage(message) {
    if (!message || !message.type || !message.data) {
        console.error('Invalid WebSocket message:', message);
        return;
    }
    
    console.log('WebSocket message received:', message.type);
    
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
            // Complete synchronization of all projects
            handleProjectSync(message.data);
            break;
            
        default:
            console.warn('Unknown message type:', message.type);
    }
    
    // Update UI based on current authentication status
    if (typeof AuthManager !== 'undefined' && typeof AuthManager.updateUI === 'function') {
        AuthManager.updateUI();
    }
}

// Processes project synchronization data
function handleProjectSync(projects) {
    if (!projects) return;
    
    Object.values(projects).forEach(project => {
        ProjectManager.updateProject(project);
    });
    
    console.log('Projects synchronized:', Object.keys(projects).length);
}

// Updates the connection status display
function updateConnectionStatus(status) {
    // Remove all previous classes
    connectionIndicator.className = '';
    
    switch (status) {
        case 'connected':
            connectionIndicator.classList.add('connected');
            connectionText.textContent = 'Connected';
            break;
            
        case 'disconnected':
            connectionIndicator.classList.add('disconnected');
            connectionText.textContent = 'Disconnected';
            break;
            
        case 'connecting':
            connectionIndicator.classList.add('connecting');
            connectionText.textContent = 'Connecting...';
            break;
    }
}