/**
 * websocket.js - Provides WebSocket functionality for live updates
 * Version 1.5.1 - ENHANCED WITH RECONNECT LOGIC AND SECURITY
 */

// WebSocket connection
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
const maxReconnectAttempts = 10;
const reconnectInterval = 3000; // 3 seconds initial interval
const maxReconnectInterval = 30000; // Max 30 seconds between attempts
let backoffFactor = 1.5; // Exponential backoff factor
let heartbeatInterval = null;

// Debounce Timer für Statusänderungen
let connectionStatusTimer = null;
let lastConnectionStatus = null; 
let pendingStatus = null;

// Authentication state
let authToken = null;
let csrfToken = null;

// UIX
let lastProjectsState = ""; // Letzter Projekte-Status für Vergleich

// Connection status indicators
let connectionIndicator;
let connectionText;

// Pending message queue for offline/disconnected mode
let pendingMessages = [];
const MAX_PENDING_MESSAGES = 100;

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    connectionIndicator = document.getElementById('connection-indicator');
    connectionText = document.getElementById('connection-text');
});

/**
 * Establishes a WebSocket connection with reconnect logic
 */
function connectWebSocket() {
    // Clear any existing reconnect timer
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

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
                
                // Use the current URL port or default to 3000
                return window.location.port || 3420;
            } catch (error) {
                console.error('Error determining server port:', error);
                return 3420; // Fallback to default port
            }
        };
        
        // Create WebSocket connection to server with proper protocol detection
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const host = window.location.hostname;
        const port = getServerPort();
        
        console.log(`Establishing WebSocket connection to ${protocol}${host}:${port}...`);

        // Log WebSocket configuration for debugging
        console.log('WebSocket configuration:');
        console.log('- Protocol:', protocol);
        console.log('- Host:', host);
        console.log('- Port:', port);
        console.log('- Complete URL:', `${protocol}${host}:${port}`);
        console.log('- Browser URL:', window.location.href);
        console.log('- Browser supports WebSockets:', 'WebSocket' in window);
        
        // Close existing socket if any
        if (socket) {
            socket.close();
        }
        
        socket = new WebSocket(`${protocol}${host}:${port}`);
        
        // Event handler for successful connection
        socket.onopen = function() {
            console.log('WebSocket connection established');
            isConnected = true;
            reconnectAttempts = 0;
            backoffFactor = 1.5; // Reset backoff factor
            updateConnectionStatus('connected');
            startHeartbeat();
            
            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('websocketStatusChange', {
                detail: { isConnected: true }
            }));
            
            // Send authentication status immediately when connection is established
            setTimeout(() => {
                sendAuthStatus();
            }, 500);
            
            // Process pending messages
            processPendingMessages();
        };
        
        // Event handler for incoming messages
        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                
                // Special handling for CSRF token
                if (message.type === 'csrf_token') {
                    csrfToken = message.data.token;
                    console.log('CSRF token received');
                    return;
                }
                
                // Special handling for synchronization responses
                if (message.type === 'sync_response' && window._syncCallback) {
                    window._syncCallback(message.data);
                    return;
                }
                
                // Special handling for authentication responses
                if (message.type === 'auth_status') {
                    console.log('Authentication status update:', message.data);
                    
                    // Store auth token if provided
                    if (message.data.token) {
                        authToken = message.data.token;
                    }

                    // AuthManager aktualisieren
                    if (typeof AuthManager !== 'undefined' && message.data.authenticated !== undefined) {
                        // Lokale Auth-Informationen mit Server-Daten aktualisieren
                        if (typeof AuthManager.updateAuthInfo === 'function') {
                            AuthManager.updateAuthInfo(message.data);
                        }
                    }
                    
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
            console.error('Network status:', navigator.onLine ? 'Online' : 'Offline');
        };
        
        // Event handler for closed connection
        socket.onclose = function(event) {
            console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}, Clean: ${event.wasClean}`);
            isConnected = false;
            stopHeartbeat(); // Heartbeat stoppen
            
            // Debug information
            console.log('Close Event:', event);
            console.log('Ready State:', socket ? socket.readyState : 'No socket');
            
            handleReconnect(event);
        };
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        updateConnectionStatus('disconnected');
        
        // Try again if possible
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            
            const backoffInterval = Math.min(
                reconnectInterval * Math.pow(backoffFactor, reconnectAttempts - 1), 
                maxReconnectInterval
            );
            
            reconnectTimer = setTimeout(connectWebSocket, backoffInterval);
        }
    }
}

/**
 * Handle error messages from the server
 * @param {Object} error - Error information
 */
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
    
    // Handle CSRF errors - refresh tokens 
    if (error.code === 'CSRF_FAILED') {
        refreshCSRFToken();
    }
    
    // Show notification if offline manager is available
    if (typeof OfflineManager !== 'undefined' && 
        typeof OfflineManager.showNotification === 'function') {
        OfflineManager.showNotification(error.message, 'error');
    }
}

/**
 * Refresh CSRF token from server
 */
async function refreshCSRFToken() {
    try {
        const response = await fetch('/api/auth-status', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.csrfToken) {
                csrfToken = data.csrfToken;
                console.log('CSRF token refreshed');
            }
        }
    } catch (error) {
        console.error('Error refreshing CSRF token:', error);
    }
}

/**
 * Displays a message when access is denied
 * @param {string} reason - Reason message
 */
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
    contactInfo.setAttribute('role', 'alert'); // Accessibility attribute
    
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
        loginButton.setAttribute('aria-label', 'Continue in read-only mode'); // Accessibility
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

/**
 * Adds a message to the pending queue
 * @param {string} type - Message type
 * @param {Object} data - Message data
 */
function addPendingMessage(type, data) {
    // Create message with timestamp
    const message = {
        type,
        data,
        timestamp: Date.now(),
        id: Date.now() + Math.random().toString(36).substring(2, 9)
    };
    
    // Add to queue
    pendingMessages.push(message);
    
    // Limit queue size
    if (pendingMessages.length > MAX_PENDING_MESSAGES) {
        pendingMessages.shift(); // Remove oldest
    }
    
    // Save in localStorage for persistence across page reloads
    try {
        localStorage.setItem('pendingWebSocketMessages', JSON.stringify(pendingMessages));
    } catch (error) {
        console.error('Error saving pending messages to localStorage:', error);
    }
    
    return message.id;
}

/**
 * Processes pending messages when connection is restored
 */
function processPendingMessages() {
    if (!isConnected || pendingMessages.length === 0) return;
    
    console.log(`Processing ${pendingMessages.length} pending messages`);
    
    // Load any saved messages from localStorage
    try {
        const savedMessages = localStorage.getItem('pendingWebSocketMessages');
        if (savedMessages) {
            const parsedMessages = JSON.parse(savedMessages);
            // Merge with current pending messages, avoiding duplicates
            const currentIds = pendingMessages.map(m => m.id);
            const newMessages = parsedMessages.filter(m => !currentIds.includes(m.id));
            pendingMessages = [...pendingMessages, ...newMessages];
        }
    } catch (error) {
        console.error('Error loading pending messages from localStorage:', error);
    }
    
    // Sort by timestamp (oldest first)
    pendingMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    // Process in batches to avoid overwhelming the server
    processBatch();
}

/**
 * Processes a batch of pending messages
 * @param {number} batchSize - Number of messages to process at once
 */
function processBatch(batchSize = 5) {
    if (!isConnected || pendingMessages.length === 0) return;
    
    const batch = pendingMessages.slice(0, batchSize);
    let successCount = 0;
    
    // Send messages
    batch.forEach(message => {
        const success = sendWebSocketMessage(message.type, message.data, false);
        if (success) {
            successCount++;
            // Remove from queue
            pendingMessages = pendingMessages.filter(m => m.id !== message.id);
        }
    });
    
    console.log(`Processed ${successCount}/${batch.length} pending messages`);
    
    // Update localStorage
    try {
        localStorage.setItem('pendingWebSocketMessages', JSON.stringify(pendingMessages));
    } catch (error) {
        console.error('Error saving pending messages to localStorage:', error);
    }
    
    // Continue with next batch if there are more messages and we successfully sent some
    if (pendingMessages.length > 0 && successCount > 0) {
        setTimeout(() => processBatch(batchSize), 1000);
    }
}

/**
 * Sends a message via WebSocket
 * @param {string} type - Message type
 * @param {Object} data - Message data
 * @param {boolean} queueIfOffline - Whether to queue the message if offline
 * @returns {boolean} - Whether the message was sent successfully
 */
function sendWebSocketMessage(type, data, queueIfOffline = true) {
    // Check offline mode
    if (typeof OfflineManager !== 'undefined' && 
        typeof OfflineManager.isOffline === 'function' &&
        OfflineManager.isOffline()) {
        console.log('Offline mode: Message will be buffered', type);
        return OfflineManager.addOfflineChange(type, data);
    }
    
    // If not connected, add to pending messages if queueIfOffline is true
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not connected. Message cannot be sent.');
        
        // Queue for later if requested
        if (queueIfOffline) {
            console.log(`Queuing message for later: ${type}`);
            addPendingMessage(type, data);
        }
        
        // Buffer message in offline mode if available
        if (typeof OfflineManager !== 'undefined' && 
            typeof OfflineManager.addOfflineChange === 'function') {
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
    
    // Add CSRF token for write operations if available
    if (isWriteOperation && csrfToken) {
        message.csrfToken = csrfToken;
    }
    
    // Add auth token if available
    if (authToken) {
        message.authToken = authToken;
    }
    
    try {
        socket.send(JSON.stringify(message));
        return true;
    } catch (error) {
        console.error('Error sending WebSocket message:', error);
        
        // Queue for later if requested
        if (queueIfOffline) {
            addPendingMessage(type, data);
        }
        
        // Buffer message in offline mode if available
        if (typeof OfflineManager !== 'undefined' && 
            typeof OfflineManager.addOfflineChange === 'function') {
            return OfflineManager.addOfflineChange(type, data);
        }
        
        return false;
    }
}

/**
 * Processes incoming WebSocket messages
 * @param {Object} message - Message to process
 */
function handleWebSocketMessage(message) {
    if (!message || !message.type) {
        console.error('Invalid WebSocket message:', message);
        return;
    }
    
    console.log('WebSocket message received:', message.type);
    
    switch (message.type) {
        case 'add_project':
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.addProject === 'function') {
                ProjectManager.addProject(message.data);
            }
            break;
            
        case 'update_project':
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.updateProject === 'function') {
                ProjectManager.updateProject(message.data);
            }
            break;
            
        case 'delete_project':
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.deleteProject === 'function') {
                ProjectManager.deleteProject(message.data.id);
            }
            break;
            
        case 'add_step':
            if (message.data && message.data.projectId) {
                console.log('Processing add_step message:', message.data);
                if (typeof TodoManager !== 'undefined' && typeof TodoManager.addStep === 'function') {
                    TodoManager.addStep(message.data.projectId, message.data);
                } else if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                    // Fallback: Update the step directly in the project
                    updateStepInProject(message.data.projectId, message.data);
                }
            }
            break;
            
        case 'update_step':
            if (message.data && message.data.projectId) {
                console.log('Processing update_step message:', message.data);
                if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateStep === 'function') {
                    TodoManager.updateStep(message.data.projectId, message.data);
                } else if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                    // Fallback: Update the step directly in the project
                    updateStepInProject(message.data.projectId, message.data);
                }
                
                // Direct UI update for immediate feedback
                updateStepUI(message.data);
            }
            break;
            
        case 'delete_step':
            if (message.data && message.data.projectId && message.data.id) {
                console.log('Processing delete_step message');
                if (typeof TodoManager !== 'undefined' && typeof TodoManager.deleteStep === 'function') {
                    TodoManager.deleteStep(message.data.projectId, message.data.id);
                } else if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                    // Fallback: Delete the step directly from the project
                    deleteStepFromProject(message.data.projectId, message.data.id);
                }
            }
            break;
            
        case 'sync_projects':
            // Full synchronization - replace all projects
            handleFullProjectSync(message.data);
            break;
            
        case 'sync_updates':
            // Incremental synchronization - only changed projects
            handleIncrementalSync(message.data);
            break;
            
        case 'sync_unchanged':
            // No changes - do nothing
            console.log('Projects unchanged, no UI update needed');
            break;
    }
    
    // Update UI based on current authentication status
    if (typeof AuthManager !== 'undefined' && typeof AuthManager.updateUI === 'function') {
        AuthManager.updateUI();
    }
}

/**
 * Helper function to update a step directly in a project
 */
function updateStepInProject(projectId, stepData) {
    console.log(`Directly updating step ${stepData.id} in project ${projectId}`);
    
    if (!projectId || !stepData || !stepData.id) {
        console.error('Invalid project or step data for update');
        return;
    }
    
    if (typeof ProjectManager === 'undefined' || typeof ProjectManager.getProject !== 'function') {
        console.error('ProjectManager not available for step update');
        return;
    }
    
    const project = ProjectManager.getProject(projectId);
    if (!project) {
        console.error(`Project ${projectId} not found`);
        return;
    }
    
    if (!project.steps) {
        project.steps = [];
    }
    
    // Find the step index
    const stepIndex = project.steps.findIndex(step => step.id === stepData.id);
    if (stepIndex >= 0) {
        // Update existing step
        // Keep created timestamp if it exists
        const createdAt = project.steps[stepIndex].createdAt;
        stepData.createdAt = createdAt || stepData.createdAt || new Date().toISOString();
        
        // Update the step
        project.steps[stepIndex] = stepData;
    } else {
        // Add new step
        if (!stepData.createdAt) {
            stepData.createdAt = new Date().toISOString();
        }
        project.steps.push(stepData);
    }
    
    // Update project in state
    ProjectManager.updateProject(project);
}

/**
 * Helper function to delete a step directly from a project
 */
function deleteStepFromProject(projectId, stepId) {
    console.log(`Directly deleting step ${stepId} from project ${projectId}`);
    
    if (!projectId || !stepId) {
        console.error('Invalid project or step ID for deletion');
        return;
    }
    
    if (typeof ProjectManager === 'undefined' || typeof ProjectManager.getProject !== 'function') {
        console.error('ProjectManager not available for step deletion');
        return;
    }
    
    const project = ProjectManager.getProject(projectId);
    if (!project || !project.steps) {
        console.error(`Project ${projectId} not found or has no steps`);
        return;
    }
    
    // Find and remove the step
    const stepIndex = project.steps.findIndex(step => step.id === stepId);
    if (stepIndex >= 0) {
        project.steps.splice(stepIndex, 1);
        
        // Update project in state
        ProjectManager.updateProject(project);
    }
}

/**
 * Direct UI update for steps
 * This is used for immediate feedback when a step is updated by other clients
 */
function updateStepUI(stepData) {
    if (!stepData || !stepData.id) {
        console.error('Invalid step data for UI update');
        return;
    }
    
    console.log(`Directly updating UI for step ${stepData.id}`);
    
    // Find the step element
    const stepElement = document.querySelector(`.step-item[data-step-id="${stepData.id}"]`);
    if (!stepElement) {
        console.log(`Step element with ID ${stepData.id} not found in DOM`);
        return;
    }
    
    // Update completed status
    const checkbox = stepElement.querySelector('.step-checkbox');
    if (checkbox) {
        checkbox.setAttribute('aria-checked', stepData.completed ? 'true' : 'false');
    }
    
    // Update title and description if changed
    const titleElement = stepElement.querySelector('.step-title');
    if (titleElement && stepData.title) {
        titleElement.textContent = stepData.title;
    }
    
    const descriptionElement = stepElement.querySelector('.step-description');
    if (descriptionElement && stepData.description) {
        descriptionElement.textContent = stepData.description;
    }
    
    // Update CSS class for completed status
    if (stepData.completed) {
        stepElement.classList.add('step-completed');
    } else {
        stepElement.classList.remove('step-completed');
    }
    
    console.log(`UI updated for step ${stepData.id}`);
}

/**
 * Processes complete project synchronization
 * @param {Object} projects - All projects
 */
function handleFullProjectSync(projects) {
    if (!projects) return;
    
    console.log('Performing full project sync with', Object.keys(projects).length, 'projects');
    
    if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.updateProject === 'function') {
        Object.values(projects).forEach(project => {
            ProjectManager.updateProject(project);
        });
    }
}

/**
 * Processes incremental project updates
 * @param {Object} data - Update data (updated and deleted projects)
 */
function handleIncrementalSync(data) {
    if (!data) return;
    
    // Process updated projects
    if (data.updated && typeof ProjectManager !== 'undefined') {
        const updatedCount = Object.keys(data.updated).length;
        if (updatedCount > 0) {
            console.log(`Processing ${updatedCount} updated projects`);
            
            Object.values(data.updated).forEach(project => {
                ProjectManager.updateProject(project);
            });
        }
    }
    
    // Process deleted projects
    if (data.deleted && data.deleted.length > 0 && typeof ProjectManager !== 'undefined') {
        console.log(`Processing ${data.deleted.length} deleted projects`);
        
        data.deleted.forEach(projectId => {
            ProjectManager.deleteProject(projectId);
        });
    }
}

/**
 * Updates the connection status display with debouncing
 * @param {string} status - Connection status
 */
function updateConnectionStatus(status) {
    if (!connectionIndicator || !connectionText) return;
    
    // Priority status transitions:
    // - Show immediately: 'offline' and 'disconnected' (critical states)
    // - Delay showing: 'connecting' and 'connected'
    
    // For critical status, show immediately
    if (status === 'offline' || status === 'disconnected') {
        clearTimeout(connectionStatusTimer);
        pendingStatus = null;
        doUpdateConnectionStatus(status);
        return;
    }
    
    // Don't show 'connecting' if already 'connected'
    if (status === 'connecting' && lastConnectionStatus === 'connected') {
        return; // Ignore brief "connecting" phases when already connected
    }
    
    // For other status updates: add delay (debounce)
    pendingStatus = status;
    
    if (connectionStatusTimer) {
        clearTimeout(connectionStatusTimer);
    }
    
    // Delay of 2 seconds for non-critical status changes
    connectionStatusTimer = setTimeout(() => {
        if (pendingStatus) {
            doUpdateConnectionStatus(pendingStatus);
            pendingStatus = null;
        }
    }, 2000);
}

/**
 * Actual UI update after debouncing
 * @param {string} status - Connection status
 */
function doUpdateConnectionStatus(status) {
    // If status is unchanged, do nothing
    if (lastConnectionStatus === status) return;
    
    // Store old status
    lastConnectionStatus = status;
    
    // Remove all previous classes
    connectionIndicator.className = '';
    
    // Longer transition for smoother transitions
    connectionIndicator.style.transition = 'all 0.8s ease';
    
    switch (status) {
        case 'connected':
            connectionIndicator.classList.add('connected');
            connectionText.textContent = 'Verbunden';
            break;
            
        case 'disconnected':
            connectionIndicator.classList.add('disconnected');
            connectionText.textContent = 'Verbindung verloren';
            break;
            
        case 'connecting':
            connectionIndicator.classList.add('connecting');
            connectionText.textContent = 'Verbindung wird hergestellt...';
            break;
            
        case 'offline':
            connectionIndicator.classList.add('offline');
            connectionText.textContent = 'Offline-Modus';
            break;
    }
    
    // For debugging
    console.log(`Connection status changed to: ${status}`);
}

/**
 * Check if WebSocket is connected
 * @returns {boolean} - Connection status
 */
function isWebSocketConnected() {
    return isConnected && socket && socket.readyState === WebSocket.OPEN;
}

/**
 * Start the heartbeat
 */
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Send native WebSocket ping frame
            socket.send(JSON.stringify({
                type: 'ping',
                timestamp: Date.now()
            }));
            console.log('WebSocket ping sent');
        }
    }, 30000); // Every 30 seconds
}

/**
 * Stop the heartbeat
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

/**
 * Handle reconnection
 */
function handleReconnect(event) {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        
        // Calculate backoff interval with jitter
        const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85 and 1.15
        const backoffInterval = Math.min(
            reconnectInterval * Math.pow(backoffFactor, reconnectAttempts - 1) * jitter, 
            maxReconnectInterval
        );
        
        console.log(`Reconnecting in ${Math.round(backoffInterval / 1000)} seconds...`);
        
        reconnectTimer = setTimeout(connectWebSocket, backoffInterval);
    } else {
        console.error('Maximum number of reconnection attempts reached.');
        updateConnectionStatus('offline');
    }
}

/**
 * Enter offline mode
 */
function enterOfflineMode() {
    console.log('Entering offline mode');
    updateConnectionStatus('offline');
    
    // Show notification or lock certain features
    if (typeof OfflineManager !== 'undefined' && 
        typeof OfflineManager.enterOfflineMode === 'function') {
        OfflineManager.enterOfflineMode();
    }
}

/**
 * Send authentication status via WebSocket
 */
function sendAuthStatus() {
    // Check if AuthManager is available
    if (typeof AuthManager !== 'undefined' && 
        typeof AuthManager.isAuthenticated === 'function') {
        
        const isAuthenticated = AuthManager.isAuthenticated();
        const username = AuthManager.getUsername ? AuthManager.getUsername() : null;
        const role = AuthManager.getUserRole ? AuthManager.getUserRole() : null;
        
        // Only send if we have a valid websocket connection
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log('Sending auth status via WebSocket:', { 
                authenticated: isAuthenticated,
                username: username
            });
            
            const message = {
                type: 'authenticate',
                data: {
                    authenticated: isAuthenticated,
                    username: username,
                    role: role,
                    sessionId: document.cookie.split(';').find(c => c.trim().startsWith('projectMonitoringSessionId='))?.split('=')[1] || null
                },
                timestamp: Date.now()
            };
            
            try {
                socket.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('Error sending auth status via WebSocket:', error);
                return false;
            }
        } else {
            console.warn('Cannot send auth status: WebSocket not connected');
            return false;
        }
    } else {
        console.warn('AuthManager not available for sending auth status');
        return false;
    }
}

// Initialize connection on page load
window.addEventListener('load', () => {
    function waitForAuthManager(callback) {
        if (typeof AuthManager !== 'undefined' && AuthManager.isInitialized) {
            callback();
        } else {
            setTimeout(() => waitForAuthManager(callback), 100);
        }
    }
    
    waitForAuthManager(() => {
        // CSRF-Token abrufen
        refreshCSRFToken();
        // Verbindung herstellen
        connectWebSocket();
    });
});

// Handle page visibility change to reconnect when user returns
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (!isConnected && socket && socket.readyState !== WebSocket.CONNECTING) {
            console.log('Page visible again, attempting to reconnect...');
            reconnectAttempts = 0; // Reset attempts
            connectWebSocket();
        }
    }
});

// Expose functions globally
window.connectWebSocket = connectWebSocket;
window.sendWebSocketMessage = sendWebSocketMessage;
window.isWebSocketConnected = isWebSocketConnected;
window.sendAuthStatus = sendAuthStatus;
window.updateConnectionStatus = updateConnectionStatus;