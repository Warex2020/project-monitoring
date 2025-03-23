/**
 * user.js - User model for the project monitoring dashboard
 * Version 1.5.0 - SECURITY ENHANCED
 */

const bcrypt = require('bcrypt'); // Ersetzt crypto für sicheres Hashing
const path = require('path');
const fileManager = require('../server/fileManager');

// Path to users storage file
const USERS_FILE = path.join(__dirname, '../config/users.json');

class UserModel {
    constructor() {
        this.users = {};
        this.initialized = false;
    }
    
    /**
     * Initialize the user model
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            await this.loadUsers();
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing user model:', error);
            // Create empty users object if file doesn't exist
            this.users = {};
            this.initialized = true;
        }
    }
    
    /**
     * Load users from storage
     * @returns {Promise<Object>}
     */
    async loadUsers() {
        try {
            this.users = await fileManager.loadJson(USERS_FILE);
            return this.users;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create empty users object
                this.users = {};
                await this.saveUsers();
                return this.users;
            }
            throw error;
        }
    }
    
    /**
     * Save users to storage
     * @returns {Promise<void>}
     */
    async saveUsers() {
        try {
            await fileManager.saveJson(USERS_FILE, this.users);
        } catch (error) {
            console.error('Error saving users:', error);
            throw error;
        }
    }
    
    /**
     * Ensure the model is initialized
     * @returns {Promise<void>}
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    
    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} - Created user
     */
    async create(userData) {
        await this.ensureInitialized();
        
        if (!userData.username) {
            throw new Error('Username is required');
        }
        
        // Check if user already exists
        if (this.users[userData.username]) {
            throw new Error(`User '${userData.username}' already exists`);
        }
        
        // Validate email if provided
        if (userData.email && !this.isValidEmail(userData.email)) {
            throw new Error('Invalid email format');
        }
        
        // Create user object
        const newUser = {
            username: userData.username,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            roles: userData.roles || ['user'],
            source: userData.source || 'local',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            lastLogin: null,
            active: true,
            tokenVersion: 1 // Für Token-Invalidierung
        };
        
        // If local user, hash password with bcrypt
        if (userData.source === 'local' && userData.password) {
            // Passwort-Komplexität überprüfen
            if (!this.isPasswordComplex(userData.password)) {
                throw new Error('Password does not meet complexity requirements');
            }
            
            // Hash mit bcrypt
            const saltRounds = 12;
            newUser.passwordHash = await bcrypt.hash(userData.password, saltRounds);
            newUser.passwordResetRequired = userData.passwordResetRequired || false;
        }
        
        // Add user
        this.users[newUser.username] = newUser;
        
        // Save users
        await this.saveUsers();
        
        // Return user object without sensitive data
        return this.sanitizeUser(newUser);
    }
    
    /**
     * Find a user by username
     * @param {string} username - Username to find
     * @returns {Promise<Object|null>} - Found user or null
     */
    async findByUsername(username) {
        await this.ensureInitialized();
        
        const user = this.users[username];
        return user ? this.sanitizeUser(user) : null;
    }
    
    /**
     * Find a user by email
     * @param {string} email - Email to find
     * @returns {Promise<Object|null>} - Found user or null
     */
    async findByEmail(email) {
        await this.ensureInitialized();
        
        const normalizedEmail = email.toLowerCase().trim();
        
        const user = Object.values(this.users).find(
            u => u.email && u.email.toLowerCase().trim() === normalizedEmail
        );
        
        return user ? this.sanitizeUser(user) : null;
    }
    
    /**
     * Find all users
     * @param {Object} options - Query options
     * @returns {Promise<Array>} - Array of users
     */
    async findAll(options = {}) {
        await this.ensureInitialized();
        
        let userList = Object.values(this.users);
        
        // Apply filters if provided
        if (options.active !== undefined) {
            userList = userList.filter(user => user.active === options.active);
        }
        
        if (options.source) {
            userList = userList.filter(user => user.source === options.source);
        }
        
        if (options.role) {
            userList = userList.filter(user => user.roles.includes(options.role));
        }
        
        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            userList = userList.filter(user => 
                user.username.toLowerCase().includes(searchTerm) ||
                user.firstName.toLowerCase().includes(searchTerm) ||
                user.lastName.toLowerCase().includes(searchTerm) ||
                (user.email && user.email.toLowerCase().includes(searchTerm))
            );
        }
        
        // Apply sorting
        if (options.sort) {
            const [field, direction] = options.sort.split(':');
            userList.sort((a, b) => {
                const aVal = a[field] || '';
                const bVal = b[field] || '';
                
                // Normalisieren für Sortierung
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    const comp = aVal.localeCompare(bVal);
                    return direction === 'desc' ? -comp : comp;
                }
                
                if (direction === 'desc') {
                    return aVal > bVal ? -1 : 1;
                }
                return aVal > bVal ? 1 : -1;
            });
        }
        
        // Apply pagination
        if (options.limit && options.offset !== undefined) {
            userList = userList.slice(options.offset, options.offset + options.limit);
        }
        
        // Sanitize users
        return userList.map(user => this.sanitizeUser(user));
    }
    
    /**
     * Update a user
     * @param {Object} userData - User data to update
     * @returns {Promise<Object>} - Updated user
     */
    async update(userData) {
        await this.ensureInitialized();
        
        if (!userData.username) {
            throw new Error('Username is required');
        }
        
        // Check if user exists
        const existingUser = this.users[userData.username];
        if (!existingUser) {
            throw new Error(`User '${userData.username}' not found`);
        }
        
        // Validate email if provided
        if (userData.email && !this.isValidEmail(userData.email)) {
            throw new Error('Invalid email format');
        }
        
        // Update fields
        const updatedUser = {
            ...existingUser,
            firstName: userData.firstName !== undefined ? userData.firstName : existingUser.firstName,
            lastName: userData.lastName !== undefined ? userData.lastName : existingUser.lastName,
            email: userData.email !== undefined ? userData.email : existingUser.email,
            roles: userData.roles || existingUser.roles,
            active: userData.active !== undefined ? userData.active : existingUser.active,
            updated: new Date().toISOString()
        };
        
        // Update password if provided and user is local
        if (existingUser.source === 'local' && userData.password) {
            // Passwort-Komplexität überprüfen
            if (!this.isPasswordComplex(userData.password)) {
                throw new Error('Password does not meet complexity requirements');
            }
            
            // Hash mit bcrypt
            const saltRounds = 12;
            updatedUser.passwordHash = await bcrypt.hash(userData.password, saltRounds);
            updatedUser.passwordResetRequired = userData.passwordResetRequired !== undefined 
                ? userData.passwordResetRequired 
                : false;
                
            // Increment token version to invalidate existing tokens
            updatedUser.tokenVersion = (existingUser.tokenVersion || 0) + 1;
        }
        
        // Special updates for LDAP users
        if (existingUser.source === 'ldap' && userData.lastSync) {
            updatedUser.lastSync = userData.lastSync;
        }
        
        // Update user
        this.users[userData.username] = updatedUser;
        
        // Save users
        await this.saveUsers();
        
        // Return user object without sensitive data
        return this.sanitizeUser(updatedUser);
    }
    
    /**
     * Delete a user
     * @param {string} username - Username to delete
     * @returns {Promise<boolean>} - Whether deletion was successful
     */
    async delete(username) {
        await this.ensureInitialized();
        
        // Check if user exists
        if (!this.users[username]) {
            throw new Error(`User '${username}' not found`);
        }
        
        // Delete user
        delete this.users[username];
        
        // Save users
        await this.saveUsers();
        
        return true;
    }
    
    /**
     * Record a user login
     * @param {string} username - Username
     * @returns {Promise<void>}
     */
    async recordLogin(username) {
        await this.ensureInitialized();
        
        // Check if user exists
        const user = this.users[username];
        if (!user) {
            throw new Error(`User '${username}' not found`);
        }
        
        // Update last login
        user.lastLogin = new Date().toISOString();
        user.loginAttempts = 0; // Reset failed attempts on successful login
        
        // Save users
        await this.saveUsers();
    }
    
    /**
     * Record a failed login attempt
     * @param {string} username - Username
     * @returns {Promise<void>}
     */
    async recordFailedLogin(username) {
        await this.ensureInitialized();
        
        // Check if user exists
        const user = this.users[username];
        if (!user) {
            return; // Don't throw error for security reasons
        }
        
        // Update failed login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        user.lastFailedLogin = new Date().toISOString();
        
        // Lock account after too many attempts (configurable)
        const maxAttempts = 5; // This could come from config
        if (user.loginAttempts >= maxAttempts) {
            user.active = false;
            user.lockedReason = 'Too many failed login attempts';
            user.lockedAt = new Date().toISOString();
        }
        
        // Save users
        await this.saveUsers();
    }
    
    /**
     * Authenticate a user
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<Object|null>} - Authenticated user or null
     */
    async authenticate(username, password) {
        await this.ensureInitialized();
        
        // Check if user exists
        const user = this.users[username];
        if (!user) {
            return null;
        }
        
        // Check if user is active
        if (!user.active) {
            return null;
        }
        
        // For local users, verify password
        if (user.source === 'local') {
            if (!user.passwordHash) {
                return null;
            }
            
            // Check if password hash is using old format (MD5)
            if (user.passwordHash.indexOf(':') > 0) {
                // Assume old format (MD5)
                const isValid = this.verifyPasswordOld(password, user.passwordHash);
                
                if (isValid) {
                    // Upgrade to bcrypt hash if old format is still valid
                    const saltRounds = 12;
                    user.passwordHash = await bcrypt.hash(password, saltRounds);
                    await this.saveUsers();
                } else {
                    await this.recordFailedLogin(username);
                    return null;
                }
            } else {
                // Modern bcrypt format
                try {
                    const isValid = await bcrypt.compare(password, user.passwordHash);
                    if (!isValid) {
                        await this.recordFailedLogin(username);
                        return null;
                    }
                } catch (error) {
                    console.error(`Error verifying password for user ${username}:`, error);
                    return null;
                }
            }
        }
        
        // Record login
        await this.recordLogin(username);
        
        // Return user object without sensitive data
        return this.sanitizeUser(user);
    }
    
    /**
     * Hash a password with bcrypt
     * @param {string} password - Password to hash
     * @returns {Promise<string>} - Hashed password
     */
    async hashPassword(password) {
        const saltRounds = 12;
        return bcrypt.hash(password, saltRounds);
    }
    
    /**
     * Verify a password with bcrypt
     * @param {string} password - Password to verify
     * @param {string} hashedPassword - Hashed password
     * @returns {Promise<boolean>} - Whether the password is correct
     */
    async verifyPassword(password, hashedPassword) {
        return bcrypt.compare(password, hashedPassword);
    }
    
    /**
     * Legacy method to verify old format password (for backwards compatibility)
     * @param {string} password - Password to verify
     * @param {string} hashedPassword - Hashed password in old format 'salt:hash'
     * @returns {boolean} - Whether the password is correct
     */
    verifyPasswordOld(password, hashedPassword) {
        const crypto = require('crypto');
        const [salt, hash] = hashedPassword.split(':');
        const calculatedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return hash === calculatedHash;
    }
    
    /**
     * Sanitize user object for external use
     * @param {Object} user - User object
     * @returns {Object} - Sanitized user object
     */
    sanitizeUser(user) {
        // Create a copy
        const sanitized = { ...user };
        
        // Remove sensitive data
        delete sanitized.passwordHash;
        delete sanitized.loginAttempts;
        delete sanitized.lastFailedLogin;
        
        return sanitized;
    }
    
    /**
     * Validate an email address format
     * @param {string} email - Email address to validate
     * @returns {boolean} - Whether the email format is valid
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    /**
     * Check if a password meets complexity requirements
     * @param {string} password - Password to check
     * @returns {boolean} - Whether the password is complex enough
     */
    isPasswordComplex(password) {
        if (!password || password.length < 8) {
            return false;
        }
        
        // Check for at least one uppercase, one lowercase, one digit, and one special character
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasDigit = /\d/.test(password);
        const hasSpecial = /[^A-Za-z0-9]/.test(password);
        
        // Require at least 3 of the 4 complexity types
        const complexityCount = [hasUppercase, hasLowercase, hasDigit, hasSpecial]
            .filter(Boolean).length;
            
        return complexityCount >= 3;
    }
    
    /**
     * Create the default admin user if no users exist
     * @returns {Promise<void>}
     */
    async createDefaultAdminIfNeeded() {
        await this.ensureInitialized();
        
        // If there are no users, create the default admin
        if (Object.keys(this.users).length === 0) {
            await this.create({
                username: 'admin',
                firstName: 'System',
                lastName: 'Administrator',
                email: 'admin@example.com',
                password: 'Admin@123', // Komplexes Passwort als Standard
                roles: ['admin'],
                source: 'local',
                passwordResetRequired: true
            });
            
            console.log('Default admin user created');
            console.warn('DEFAULT ADMIN ACCOUNT CREATED! CHANGE PASSWORD IMMEDIATELY!');
        }
    }
    
    /**
     * Invalidate all tokens for a user
     * @param {string} username - Username
     * @returns {Promise<boolean>} - Whether invalidation was successful
     */
    async invalidateTokens(username) {
        await this.ensureInitialized();
        
        const user = this.users[username];
        if (!user) {
            throw new Error(`User '${username}' not found`);
        }
        
        // Increment token version
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        
        // Save users
        await this.saveUsers();
        
        return true;
    }
}

// Export a singleton instance
const userModel = new UserModel();
module.exports = userModel;