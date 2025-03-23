/**
 * authManager.js - Manages authentication for the dashboard
 * Version 1.2.1 - Improved session handling and UI synchronization
 */

const AuthManager = (() => {
    // Private state
    let isAuthenticatedStatus = false;
    let requiresAuth = false;
    let username = null;
    let role = null;
    let authCheckInProgress = false;
    
    // Check auth status on initialization
    const init = async () => {
        try {
            // First check for already stored authentication
            checkStoredAuth();
            
            // Then refresh from server - important to get the latest state
            const serverAuth = await checkServerAuth();
            
            // Update local state with server state - server is the source of truth
            isAuthenticatedStatus = serverAuth.authenticated || false;
            requiresAuth = serverAuth.requiresAuth || false;
            username = serverAuth.username || null;
            role = serverAuth.role || null;
            
            // Save updated auth status to localStorage
            saveAuthStatus();
            
            // Update the UI based on current auth status
            updateUI();
            
            // Init retry mechanism for WebSocket auth sync
            initAuthSync();
            
            return {
                authenticated: isAuthenticatedStatus,
                requiresAuth: requiresAuth,
                username: username,
                role: role
            };
        } catch (error) {
            console.error('Error checking auth status:', error);
            return { authenticated: false, requiresAuth: false };
        }
    };
    
    // Check locally stored authentication state first
    const checkStoredAuth = () => {
        try {
            const storedStatus = localStorage.getItem('authStatus');
            if (storedStatus) {
                const parsed = JSON.parse(storedStatus);
                isAuthenticatedStatus = parsed.authenticated || false;
                requiresAuth = parsed.requiresAuth || false;
                username = parsed.username || null;
                role = parsed.role || null;
                
                console.log('Loaded stored auth status:', isAuthenticatedStatus ? 'Authenticated' : 'Not authenticated');
            }
        } catch (error) {
            console.error('Error loading stored auth status:', error);
        }
    };
    
    // Save authentication status to localStorage
    const saveAuthStatus = () => {
        try {
            localStorage.setItem('authStatus', JSON.stringify({
                authenticated: isAuthenticatedStatus,
                requiresAuth: requiresAuth,
                username: username,
                role: role
            }));
        } catch (error) {
            console.error('Error saving auth status:', error);
        }
    };
    
    // Initialize retry mechanism for WebSocket auth sync
    const initAuthSync = () => {
        // Check if WebSocket is connected after a short delay
        setTimeout(() => {
            if (typeof window.isWebSocketConnected === 'function' && window.isWebSocketConnected()) {
                // Send auth status if WebSocket is connected
                sendAuthStatus();
            } else {
                // Try again later
                setTimeout(initAuthSync, 2000);
            }
        }, 1000);
        
        // Also listen for WebSocket connection status changes
        window.addEventListener('websocketStatusChange', (e) => {
            if (e.detail.isConnected) {
                sendAuthStatus();
            }
        });
    };
    
    // Check authentication status from server
    const checkServerAuth = async () => {
        if (authCheckInProgress) return { 
            authenticated: isAuthenticatedStatus, 
            requiresAuth: requiresAuth,
            username: username,
            role: role
        };
        
        authCheckInProgress = true;
        
        try {
            const response = await fetch('/api/auth-status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // Important: include cookies for session auth
            });
            
            if (!response.ok) {
                throw new Error(`Failed to check auth status: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Server auth status:', data);
            
            // Update authentication state
            isAuthenticatedStatus = data.authenticated;
            requiresAuth = data.requiresAuth;
            username = data.username;
            role = data.role;
            
            // Update localStorage for persistence between page reloads
            saveAuthStatus();
            
            // Update UI based on authentication status
            updateUI();
            
            console.log('Authentication status checked from server:', isAuthenticatedStatus ? 'Authenticated' : 'Not authenticated');
            
            return data;
        } catch (error) {
            console.error('Error checking auth status from server:', error);
            return { 
                authenticated: isAuthenticatedStatus, 
                requiresAuth: requiresAuth,
                username: username,
                role: role
            };
        } finally {
            authCheckInProgress = false;
        }
    };
    
    // Send authentication status to WebSocket server
    const sendAuthStatus = () => {
        if (typeof window.sendWebSocketMessage === 'function') {
            if (window.sendWebSocketMessage('authenticate', {
                authenticated: isAuthenticatedStatus,
                username: username,
                role: role,
                sessionId: Date.now().toString(36) // Simple random ID
            })) {
                console.log('Auth status sent via WebSocket');
            } else {
                console.error('Failed to send auth status via WebSocket');
            }
        }
    };
    
    // Update UI based on authentication status
    const updateUI = () => {
        console.log('Updating UI based on auth status:', isAuthenticatedStatus ? 'Authenticated' : 'Not authenticated');
        
        // Add login/logout button to the header
        const authContainer = document.getElementById('auth-container');
        if (authContainer) {
            // Remove existing auth button if present
            const existingButton = document.getElementById('auth-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            // Create auth button
            const authButton = document.createElement('button');
            authButton.id = 'auth-button';
            authButton.className = 'action-button secondary';
            
            if (isAuthenticatedStatus) {
                authButton.textContent = `Logout${username ? ' (' + username + ')' : ''}`;
                authButton.onclick = () => {
                    window.location.href = '/logout';
                };
            } else {
                authButton.textContent = 'Login';
                authButton.onclick = () => {
                    window.location.href = '/login';
                };
            }
            
            // Add button to auth container
            authContainer.appendChild(authButton);
        }
        
        // Update action buttons visibility
        const addProjectBtn = document.getElementById('add-project-btn');
        if (addProjectBtn) {
            if (requiresAuth && !isAuthenticatedStatus) {
                addProjectBtn.style.display = 'none';
            } else {
                addProjectBtn.style.display = 'block';
            }
        }
        
        // Update edit buttons and controls for all projects
        const editIcons = document.querySelectorAll('.edit-icon, .add-step-icon, .edit-step-icon');
        editIcons.forEach(icon => {
            if (requiresAuth && !isAuthenticatedStatus) {
                icon.style.display = 'none';
            } else {
                icon.style.display = 'block';
            }
        });
        
        // Disable step checkboxes if not authenticated
        const stepCheckboxes = document.querySelectorAll('.step-checkbox');
        stepCheckboxes.forEach(checkbox => {
            if (requiresAuth && !isAuthenticatedStatus) {
                checkbox.style.pointerEvents = 'none';
                checkbox.style.opacity = '0.6';
            } else {
                checkbox.style.pointerEvents = 'auto';
                checkbox.style.opacity = '1';
            }
        });
    };
    
    // Handle authentication errors from WebSocket
    const handleAuthError = (error) => {
        if (error && error.code === 'AUTH_REQUIRED') {
            // Clear local auth state
            isAuthenticatedStatus = false;
            localStorage.removeItem('authStatus');
            
            // Update UI
            updateUI();
            
            // Show notification if available
            if (typeof OfflineManager !== 'undefined' && 
                typeof OfflineManager.showNotification === 'function') {
                OfflineManager.showNotification('Authentication required. Please log in.', 'error');
            }
            
            // Redirect to login page
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
        }
    };
    
    // Check if user is authenticated
    const isAuthenticated = () => {
        return isAuthenticatedStatus;
    };
    
    // Check if authentication is required for changes
    const isAuthRequired = () => {
        return requiresAuth;
    };
    
    // Get username
    const getUsername = () => {
        return username;
    };
    
    // Get user role
    const getUserRole = () => {
        return role;
    };
    
    // Public API
    return {
        init,
        updateUI,
        sendAuthStatus,
        handleAuthError,
        isAuthenticated,
        isAuthRequired,
        getUsername,
        getUserRole,
        checkServerAuth // Expose this for manual refreshes
    };
})();

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for other scripts to load
    setTimeout(() => {
        AuthManager.init();
    }, 500);
});