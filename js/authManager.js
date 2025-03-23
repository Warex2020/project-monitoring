/**
 * authManager.js - Manages authentication for the dashboard
 */

const AuthManager = (() => {
    // Private state
    let isAuthenticated = false;
    let requiresAuth = false;
    let username = null;
    let role = null;
    
    // Check auth status on initialization
    const init = async () => {
        try {
            const response = await fetch('/api/auth-status');
            const data = await response.json();
            
            isAuthenticated = data.authenticated;
            requiresAuth = data.requiresAuth;
            username = data.username;
            role = data.role;
            
            // Update UI based on authentication status
            updateUI();
            
            // If WebSocket is connected, send authentication status
            if (typeof socket !== 'undefined' && socket && socket.readyState === WebSocket.OPEN) {
                sendAuthStatus();
            }
            
            console.log('Authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
            
            return data;
        } catch (error) {
            console.error('Error checking auth status:', error);
            return { authenticated: false, requiresAuth: false };
        }
    };
    
    // Send authentication status to WebSocket server
    const sendAuthStatus = () => {
        if (typeof socket !== 'undefined' && socket && socket.readyState === WebSocket.OPEN) {
            // Create a session identifier or get existing one
            let sessionId = localStorage.getItem('sessionId');
            if (!sessionId) {
                sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
                localStorage.setItem('sessionId', sessionId);
            }
            
            // Debug-Information
            console.log('Sending auth status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
            
            // Send auth status via WebSocket
            try {
                socket.send(JSON.stringify({
                    type: 'authenticate',
                    data: {
                        sessionId: sessionId,
                        authenticated: isAuthenticated
                    },
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.error('Error sending auth status:', error);
            }
        }
    };
    
    // Update UI based on authentication status
    const updateUI = () => {
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
            
            if (isAuthenticated) {
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
            if (requiresAuth && !isAuthenticated) {
                addProjectBtn.style.display = 'none';
            } else {
                addProjectBtn.style.display = 'block';
            }
        }
        
        // Update edit buttons and controls for all projects
        const editIcons = document.querySelectorAll('.edit-icon, .add-step-icon, .edit-step-icon');
        editIcons.forEach(icon => {
            if (requiresAuth && !isAuthenticated) {
                icon.style.display = 'none';
            } else {
                icon.style.display = 'block';
            }
        });
        
        // Disable step checkboxes if not authenticated
        const stepCheckboxes = document.querySelectorAll('.step-checkbox');
        stepCheckboxes.forEach(checkbox => {
            if (requiresAuth && !isAuthenticated) {
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
            // Show login dialog or redirect to login page
            window.location.href = '/login';
        }
    };
    
    // Check if user is authenticated
    const isUserAuthenticated = () => {
        return isAuthenticated;
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
        isAuthenticated: isUserAuthenticated,
        isAuthRequired,
        getUsername,
        getUserRole
    };
})();

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for other scripts to load
    setTimeout(() => {
        AuthManager.init();
    }, 500);
});