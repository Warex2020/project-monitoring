/**
 * userManagement.js - Frontend User Management Component
 * Version 1.4.0
 */

// User Management namespace
const UserManagement = (() => {
    // Private state
    let currentUser = null;
    let users = [];
    let roles = ['admin', 'manager', 'user'];
    let userModalMode = 'create';
    let selectedUser = null;
    let isAdmin = false;
    
    // UI elements cache
    let userListContainer;
    let userModal;
    let userForm;
    let userSearchInput;
    let userFilterSelect;
    let userSortSelect;
    let ldapSyncButton;
    
    // Pagination state
    let currentPage = 1;
    let itemsPerPage = 10;
    let totalUsers = 0;
    
    /**
     * Initialize the user management component
     */
    const init = async () => {
        try {
            // Check if user is logged in
            const authStatus = await checkAuthStatus();
            if (!authStatus.authenticated) {
                redirectToLogin();
                return;
            }
            
            currentUser = authStatus.user;
            isAdmin = currentUser.roles.includes('admin');
            
            if (!isAdmin) {
                showAccessDenied();
                return;
            }
            
            // Cache UI elements
            cacheUIElements();
            
            // Add event listeners
            addEventListeners();
            
            // Load users
            await loadUsers();
            
            // Initialize the UI
            initializeUI();
            
            console.log('User Management initialized');
        } catch (error) {
            console.error('Error initializing User Management:', error);
            showError('Failed to initialize User Management');
        }
    };
    
    /**
     * Cache UI elements for performance
     */
    const cacheUIElements = () => {
        // Main containers
        userListContainer = document.getElementById('user-list-container');
        userModal = document.getElementById('user-modal');
        userForm = document.getElementById('user-form');
        
        // Controls
        userSearchInput = document.getElementById('user-search');
        userFilterSelect = document.getElementById('user-filter');
        userSortSelect = document.getElementById('user-sort');
        ldapSyncButton = document.getElementById('ldap-sync-button');
        
        // Pagination controls
        document.getElementById('pagination-prev').addEventListener('click', () => changePage(-1));
        document.getElementById('pagination-next').addEventListener('click', () => changePage(1));
    };
    
    /**
     * Add event listeners for user interaction
     */
    const addEventListeners = () => {
        // User form submission
        userForm.addEventListener('submit', handleUserFormSubmit);
        
        // Search, filter, and sort
        userSearchInput.addEventListener('input', debounce(handleSearch, 300));
        userFilterSelect.addEventListener('change', handleFilter);
        userSortSelect.addEventListener('change', handleSort);
        
        // LDAP sync button
        if (ldapSyncButton) {
            ldapSyncButton.addEventListener('click', syncLDAPUsers);
        }
        
        // Close user modal on click outside
        window.addEventListener('click', (e) => {
            if (e.target === userModal) {
                closeUserModal();
            }
        });
        
        // Close user modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && userModal.style.display === 'block') {
                closeUserModal();
            }
        });
        
        // Event delegation for user list actions
        userListContainer.addEventListener('click', handleUserListClick);
        
        // New user button
        document.getElementById('new-user-button').addEventListener('click', () => openUserModal('create'));
    };
    
    /**
     * Initialize the UI with current state
     */
    const initializeUI = () => {
        renderUserList();
        updatePagination();
    };
    
    /**
     * Load users from the API
     */
    const loadUsers = async () => {
        try {
            const params = new URLSearchParams({
                page: currentPage,
                limit: itemsPerPage,
                sort: userSortSelect ? userSortSelect.value : 'username:asc'
            });
            
            // Add filter if selected
            if (userFilterSelect && userFilterSelect.value) {
                params.append('filter', userFilterSelect.value);
            }
            
            // Add search term if provided
            if (userSearchInput && userSearchInput.value.trim()) {
                params.append('search', userSearchInput.value.trim());
            }
            
            const response = await fetch(`/api/users?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to load users');
            }
            
            const data = await response.json();
            users = data.users;
            totalUsers = data.total;
            
            return data;
        } catch (error) {
            console.error('Error loading users:', error);
            showError('Failed to load users');
            return { users: [], total: 0 };
        }
    };
    
    /**
     * Render the user list with current data
     */
    const renderUserList = () => {
        if (!userListContainer) return;
        
        // Clear current list
        userListContainer.innerHTML = '';
        
        if (users.length === 0) {
            userListContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3>No Users Found</h3>
                    <p>There are no users matching your criteria.</p>
                    <button id="new-user-empty-button" class="action-button">Add New User</button>
                </div>
            `;
            
            document.getElementById('new-user-empty-button').addEventListener('click', () => openUserModal('create'));
            return;
        }
        
        // Create table
        const table = document.createElement('table');
        table.className = 'user-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.dataset.username = user.username;
            
            // Highlight current user
            if (currentUser && user.username === currentUser.username) {
                tr.classList.add('current-user');
            }
            
            tr.innerHTML = `
                <td>${user.username}</td>
                <td>${user.firstName} ${user.lastName}</td>
                <td>${user.email || '-'}</td>
                <td>${user.roles.join(', ')}</td>
                <td>
                    <span class="user-source ${user.source}">${user.source}</span>
                </td>
                <td>
                    <span class="user-status ${user.active ? 'active' : 'inactive'}">
                        ${user.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="user-actions">
                    <button class="action-icon edit-user" title="Edit User">✏️</button>
                    ${user.username !== currentUser.username ? 
                        `<button class="action-icon delete-user" title="Delete User">🗑️</button>` : 
                        ''}
                    ${user.source === 'local' ? 
                        `<button class="action-icon reset-password" title="Reset Password">🔑</button>` : 
                        ''}
                </td>
            `;
            
            tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        userListContainer.appendChild(table);
    };
    
    /**
     * Update pagination controls
     */
    const updatePagination = () => {
        const totalPages = Math.ceil(totalUsers / itemsPerPage);
        const paginationInfo = document.getElementById('pagination-info');
        const prevButton = document.getElementById('pagination-prev');
        const nextButton = document.getElementById('pagination-next');
        
        if (paginationInfo) {
            paginationInfo.textContent = `Page ${currentPage} of ${totalPages || 1} (${totalUsers} users)`;
        }
        
        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
        }
        
        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }
    };
    
    /**
     * Change the current page
     * @param {number} direction - Page change direction (+1 or -1)
     */
    const changePage = async (direction) => {
        const newPage = currentPage + direction;
        if (newPage < 1) return;
        
        const totalPages = Math.ceil(totalUsers / itemsPerPage);
        if (newPage > totalPages) return;
        
        currentPage = newPage;
        await loadUsers();
        renderUserList();
        updatePagination();
    };
    
    /**
     * Handle user search input
     */
    const handleSearch = async () => {
        currentPage = 1; // Reset to first page on search
        await loadUsers();
        renderUserList();
        updatePagination();
    };
    
    /**
     * Handle user filter change
     */
    const handleFilter = async () => {
        currentPage = 1; // Reset to first page on filter change
        await loadUsers();
        renderUserList();
        updatePagination();
    };
    
    /**
     * Handle user sort change
     */
    const handleSort = async () => {
        await loadUsers();
        renderUserList();
    };
    
    /**
     * Handle clicks on the user list (event delegation)
     * @param {Event} e - Click event
     */
    const handleUserListClick = (e) => {
        const target = e.target;
        
        // Find closest row to get username
        const row = target.closest('tr');
        if (!row) return;
        
        const username = row.dataset.username;
        
        // Handle edit button
        if (target.classList.contains('edit-user')) {
            const user = users.find(u => u.username === username);
            if (user) {
                selectedUser = user;
                openUserModal('edit');
            }
        }
        
        // Handle delete button
        if (target.classList.contains('delete-user')) {
            const user = users.find(u => u.username === username);
            if (user) {
                selectedUser = user;
                showDeleteConfirmation(user);
            }
        }
        
        // Handle reset password button
        if (target.classList.contains('reset-password')) {
            const user = users.find(u => u.username === username);
            if (user) {
                selectedUser = user;
                showResetPasswordModal(user);
            }
        }
    };
    
    /**
     * Open the user modal in create or edit mode
     * @param {string} mode - Modal mode ('create' or 'edit')
     */
    const openUserModal = (mode) => {
        userModalMode = mode;
        
        // Set modal title
        const modalTitle = document.getElementById('user-modal-title');
        if (modalTitle) {
            modalTitle.textContent = mode === 'create' ? 'Create New User' : 'Edit User';
        }
        
        // Reset form
        userForm.reset();
        
        // Show/hide password field based on mode
        const passwordGroup = document.getElementById('password-group');
        if (passwordGroup) {
            passwordGroup.style.display = mode === 'create' ? 'block' : 'none';
        }
        
        // Show/hide source selection based on mode
        const sourceGroup = document.getElementById('source-group');
        if (sourceGroup) {
            sourceGroup.style.display = mode === 'create' ? 'block' : 'none';
        }
        
        // Populate form if in edit mode
        if (mode === 'edit' && selectedUser) {
            document.getElementById('username').value = selectedUser.username;
            document.getElementById('username').readOnly = true; // Username can't be changed in edit mode
            document.getElementById('first-name').value = selectedUser.firstName || '';
            document.getElementById('last-name').value = selectedUser.lastName || '';
            document.getElementById('email').value = selectedUser.email || '';
            document.getElementById('active').checked = selectedUser.active;
            
            // Set selected roles
            const roleCheckboxes = document.querySelectorAll('input[name="roles"]');
            roleCheckboxes.forEach(checkbox => {
                checkbox.checked = selectedUser.roles.includes(checkbox.value);
            });
        } else {
            // In create mode, username is editable
            document.getElementById('username').readOnly = false;
            
            // Default roles
            const roleCheckboxes = document.querySelectorAll('input[name="roles"]');
            roleCheckboxes.forEach(checkbox => {
                checkbox.checked = checkbox.value === 'user'; // Default to 'user' role
            });
            
            // Default active
            document.getElementById('active').checked = true;
        }
        
        // Show modal
        userModal.style.display = 'block';
        
        // Focus first field
        setTimeout(() => {
            if (mode === 'create') {
                document.getElementById('username').focus();
            } else {
                document.getElementById('first-name').focus();
            }
        }, 100);
    };
    
    /**
     * Close the user modal
     */
    const closeUserModal = () => {
        userModal.style.display = 'none';
        selectedUser = null;
    };
    
    /**
     * Handle user form submission
     * @param {Event} e - Form submit event
     */
    const handleUserFormSubmit = async (e) => {
        e.preventDefault();
        
        // Gather form data
        const formData = {
            username: document.getElementById('username').value.trim(),
            firstName: document.getElementById('first-name').value.trim(),
            lastName: document.getElementById('last-name').value.trim(),
            email: document.getElementById('email').value.trim(),
            active: document.getElementById('active').checked
        };
        
        // Get selected roles
        formData.roles = Array.from(
            document.querySelectorAll('input[name="roles"]:checked')
        ).map(input => input.value);
        
        // Add password for create mode
        if (userModalMode === 'create') {
            formData.password = document.getElementById('password').value;
            formData.source = document.querySelector('input[name="source"]:checked').value;
        }
        
        try {
            // Validate form data
            if (!formData.username) {
                throw new Error('Username is required');
            }
            
            if (userModalMode === 'create' && formData.source === 'local' && !formData.password) {
                throw new Error('Password is required for local users');
            }
            
            if (!formData.roles.length) {
                throw new Error('At least one role must be selected');
            }
            
            // Show loading indicator
            const submitButton = userForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.textContent = 'Saving...';
            submitButton.disabled = true;
            
            // Create or update user
            let response;
            if (userModalMode === 'create') {
                response = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData),
                    credentials: 'include'
                });
            } else {
                response = await fetch(`/api/users/${formData.username}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData),
                    credentials: 'include'
                });
            }
            
            // Reset button
            submitButton.textContent = originalButtonText;
            submitButton.disabled = false;
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to save user');
            }
            
            // Close modal
            closeUserModal();
            
            // Show success message
            showSuccess(userModalMode === 'create' ? 'User created successfully' : 'User updated successfully');
            
            // Reload users
            await loadUsers();
            renderUserList();
        } catch (error) {
            console.error('Error saving user:', error);
            showError(error.message || 'Failed to save user');
            
            // Reset button if needed
            const submitButton = userForm.querySelector('button[type="submit"]');
            if (submitButton.disabled) {
                submitButton.textContent = userModalMode === 'create' ? 'Create User' : 'Update User';
                submitButton.disabled = false;
            }
        }
    };
    
    /**
     * Show delete user confirmation dialog
     * @param {Object} user - User to delete
     */
    const showDeleteConfirmation = (user) => {
        if (confirm(`Are you sure you want to delete the user ${user.username}? This action cannot be undone.`)) {
            deleteUser(user.username);
        }
    };
    
    /**
     * Delete a user
     * @param {string} username - Username to delete
     */
    const deleteUser = async (username) => {
        try {
            const response = await fetch(`/api/users/${username}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete user');
            }
            
            // Show success message
            showSuccess('User deleted successfully');
            
            // Reload users
            await loadUsers();
            renderUserList();
            updatePagination();
        } catch (error) {
            console.error('Error deleting user:', error);
            showError(error.message || 'Failed to delete user');
        }
    };
    
    /**
     * Show reset password modal
     * @param {Object} user - User to reset password for
     */
    const showResetPasswordModal = (user) => {
        const newPassword = prompt(`Enter new password for user ${user.username}:`);
        
        if (newPassword) {
            resetPassword(user.username, newPassword);
        }
    };
    
    /**
     * Reset a user's password
     * @param {string} username - Username
     * @param {string} newPassword - New password
     */
    const resetPassword = async (username, newPassword) => {
        try {
            const response = await fetch(`/api/users/${username}/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: newPassword }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to reset password');
            }
            
            // Show success message
            showSuccess('Password reset successfully');
        } catch (error) {
            console.error('Error resetting password:', error);
            showError(error.message || 'Failed to reset password');
        }
    };
    
    /**
     * Sync users from LDAP
     */
    const syncLDAPUsers = async () => {
        try {
            // Show loading state
            ldapSyncButton.textContent = 'Syncing...';
            ldapSyncButton.disabled = true;
            
            const response = await fetch('/api/ldap/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            // Reset button
            ldapSyncButton.textContent = 'Sync LDAP Users';
            ldapSyncButton.disabled = false;
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to sync LDAP users');
            }
            
            const data = await response.json();
            
            // Show success message
            showSuccess(`LDAP synchronization completed: ${data.syncCount} users synchronized`);
            
            // Reload users
            await loadUsers();
            renderUserList();
            updatePagination();
        } catch (error) {
            console.error('Error syncing LDAP users:', error);
            showError(error.message || 'Failed to sync LDAP users');
            
            // Reset button if needed
            if (ldapSyncButton.disabled) {
                ldapSyncButton.textContent = 'Sync LDAP Users';
                ldapSyncButton.disabled = false;
            }
        }
    };
    
    /**
     * Check authentication status
     * @returns {Promise<Object>} Authentication status
     */
    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/api/auth/status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                return { authenticated: false };
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error checking authentication status:', error);
            return { authenticated: false };
        }
    };
    
    /**
     * Redirect to login page
     */
    const redirectToLogin = () => {
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    };
    
    /**
     * Show access denied message
     */
    const showAccessDenied = () => {
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = `
                <div class="access-denied">
                    <div class="access-denied-icon">🔒</div>
                    <h2>Access Denied</h2>
                    <p>You do not have permission to access the User Management.</p>
                    <p>Please contact an administrator if you need access.</p>
                    <a href="/" class="action-button">Back to Dashboard</a>
                </div>
            `;
        }
    };
    
    /**
     * Show success message
     * @param {string} message - Success message
     */
    const showSuccess = (message) => {
        // Implementation depends on your notification system
        if (typeof showNotification === 'function') {
            showNotification(message, 'success');
        } else {
            alert(message);
        }
    };
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    const showError = (message) => {
        // Implementation depends on your notification system
        if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            alert('Error: ' + message);
        }
    };
    
    /**
     * Debounce function to limit how often a function is called
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    const debounce = (func, wait) => {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };
    
    // Public API
    return {
        init
    };
})();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the user management page
    if (document.getElementById('user-management-page')) {
        UserManagement.init();
    }
});