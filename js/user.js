/**
 * user.js - User model for the project monitoring dashboard
 * Version 1.4.0
 */

const crypto = require('crypto');
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
            active: true
        };
        
        // If local user, hash password
        if (userData.source === 'local' && userData.password) {
            newUser.passwordHash = this.hashPassword(userData.password);
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
        
        // Apply sorting
        if (options.sort) {
            const [field, direction] = options.sort.split(':');
            userList.sort((a, b) => {
                if (direction === 'desc') {
                    return a[field] > b[field] ? -1 : 1;
                }
                return a[field] > b[field] ? 1 : -1;
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
            updatedUser.passwordHash = this.hashPassword(userData.password);
            updatedUser.passwordResetRequired = userData.passwordResetRequired !== undefined 
                ? userData.passwordResetRequired 
                : false;
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
            if (!user.passwordHash || !this.verifyPassword(password, user.passwordHash)) {
                return null;
            }
        }
        
        // Record login
        await this.recordLogin(username);
        
        // Return user object without sensitive data
        return this.sanitizeUser(user);
    }
    
    /**
     * Hash a password
     * @param {string} password - Password to hash
     * @returns {string} - Hashed password
     */
    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }
    
    /**
     * Verify a password against a hash
     * @param {string} password - Password to verify
     * @param {string} hashedPassword - Hashed password
     * @returns {boolean} - Whether the password is correct
     */
    verifyPassword(password, hashedPassword) {
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
        
        return sanitized;
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
                password: 'admin', // This should be changed on first login
                roles: ['admin'],
                source: 'local',
                passwordResetRequired: true
            });
            
            console.log('Default admin user created');
        }
    }
}

// Export a singleton instance
const userModel = new UserModel();
module.exports = userModel;