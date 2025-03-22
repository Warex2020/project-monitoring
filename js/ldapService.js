/**
 * ldapService.js - LDAPS Authentication and User Synchronization Service
 * Version 1.4.0
 */

const ldap = require('ldapjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const fileManager = require('./fileManager');
const User = require('../models/user');

// LDAP connection pool management
let ldapClients = [];
const MAX_POOL_SIZE = 5;

class LDAPService {
    constructor(config) {
        this.config = config || {
            url: 'ldaps://ldap.example.com:636',
            baseDN: 'dc=example,dc=com',
            bindDN: 'cn=admin,dc=example,dc=com',
            bindCredentials: 'password',
            userSearchBase: 'ou=users,dc=example,dc=com',
            userSearchFilter: '(uid={{username}})',
            groupSearchBase: 'ou=groups,dc=example,dc=com',
            groupSearchFilter: '(member={{dn}})',
            tlsOptions: {
                ca: [fs.readFileSync(path.join(__dirname, '../certs/ldap-ca.crt'))],
                rejectUnauthorized: true
            },
            userAttributes: {
                username: 'uid',
                firstName: 'givenName',
                lastName: 'sn',
                email: 'mail',
                groups: 'memberOf'
            },
            roleMapping: {
                'cn=admins,ou=groups,dc=example,dc=com': 'admin',
                'cn=managers,ou=groups,dc=example,dc=com': 'manager',
                'cn=users,ou=groups,dc=example,dc=com': 'user'
            },
            syncInterval: 86400, // 24 hours in seconds
            enabled: false
        };
        
        // Initialize the client pool if LDAP is enabled
        if (this.config.enabled) {
            this.initializePool();
        }
    }
    
    /**
     * Initialize the LDAP client pool
     */
    async initializePool() {
        try {
            for (let i = 0; i < MAX_POOL_SIZE; i++) {
                const client = ldap.createClient({
                    url: this.config.url,
                    tlsOptions: this.config.tlsOptions
                });
                
                // Promisify client methods
                client.bindAsync = promisify(client.bind).bind(client);
                client.searchAsync = promisify(client.search).bind(client);
                
                // Handle client errors and automatic reconnection
                client.on('error', (err) => {
                    console.error('LDAP client error:', err);
                    // Replace this client in the pool
                    const index = ldapClients.indexOf(client);
                    if (index !== -1) {
                        ldapClients.splice(index, 1);
                        this.addClientToPool();
                    }
                });
                
                ldapClients.push(client);
            }
            
            console.log(`LDAP client pool initialized with ${MAX_POOL_SIZE} connections`);
        } catch (error) {
            console.error('Failed to initialize LDAP client pool:', error);
            throw error;
        }
    }
    
    /**
     * Add a new client to the pool
     */
    async addClientToPool() {
        try {
            const client = ldap.createClient({
                url: this.config.url,
                tlsOptions: this.config.tlsOptions
            });
            
            // Promisify client methods
            client.bindAsync = promisify(client.bind).bind(client);
            client.searchAsync = promisify(client.search).bind(client);
            
            client.on('error', (err) => {
                console.error('LDAP client error:', err);
                const index = ldapClients.indexOf(client);
                if (index !== -1) {
                    ldapClients.splice(index, 1);
                    this.addClientToPool();
                }
            });
            
            ldapClients.push(client);
        } catch (error) {
            console.error('Failed to add new client to pool:', error);
            // Schedule retry
            setTimeout(() => this.addClientToPool(), 5000);
        }
    }
    
    /**
     * Get an available LDAP client from the pool
     */
    getClient() {
        if (ldapClients.length === 0) {
            throw new Error('No LDAP clients available in the pool');
        }
        
        // Simple round-robin selection
        const client = ldapClients.shift();
        ldapClients.push(client);
        return client;
    }
    
    /**
     * Authenticate a user against LDAP
     * @param {string} username - The username to authenticate
     * @param {string} password - The password to authenticate with
     * @returns {Promise<Object|null>} - User object if authentication successful, null otherwise
     */
    async authenticate(username, password) {
        if (!this.config.enabled) {
            console.log('LDAP authentication is disabled');
            return null;
        }
        
        try {
            const client = this.getClient();
            
            // First bind with service account
            await client.bindAsync(this.config.bindDN, this.config.bindCredentials);
            
            // Search for the user
            const userFilter = this.config.userSearchFilter.replace('{{username}}', this.escapeFilter(username));
            const searchOptions = {
                scope: 'sub',
                filter: userFilter,
                attributes: Object.values(this.config.userAttributes)
            };
            
            const searchResult = await new Promise((resolve, reject) => {
                const entries = [];
                
                client.search(this.config.userSearchBase, searchOptions, (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    res.on('searchEntry', (entry) => {
                        entries.push(entry);
                    });
                    
                    res.on('error', (err) => {
                        reject(err);
                    });
                    
                    res.on('end', (result) => {
                        if (result.status !== 0) {
                            return reject(new Error(`LDAP search ended with status ${result.status}`));
                        }
                        resolve(entries);
                    });
                });
            });
            
            if (searchResult.length === 0) {
                console.log(`User '${username}' not found in LDAP`);
                return null;
            }
            
            const userEntry = searchResult[0];
            const userDN = userEntry.objectName;
            
            // Try to bind with the user's credentials
            try {
                const userClient = ldap.createClient({
                    url: this.config.url,
                    tlsOptions: this.config.tlsOptions
                });
                
                userClient.bindAsync = promisify(userClient.bind).bind(userClient);
                
                await userClient.bindAsync(userDN, password);
                
                // If we get here, authentication was successful
                userClient.unbind();
                
                // Map LDAP attributes to user object
                const user = this.mapLdapAttributesToUser(userEntry);
                
                // Get user groups and map to roles
                const userGroups = await this.getUserGroups(client, userDN);
                user.roles = this.mapGroupsToRoles(userGroups);
                
                // Create or update user in local database
                await this.syncUserToLocalDatabase(user);
                
                return user;
            } catch (bindError) {
                console.error(`Authentication failed for user '${username}':`, bindError);
                return null;
            }
        } catch (error) {
            console.error('LDAP authentication error:', error);
            return null;
        }
    }
    
    /**
     * Get a user's groups from LDAP
     * @param {Object} client - LDAP client
     * @param {string} userDN - The user's DN
     * @returns {Promise<Array>} - Array of group DNs
     */
    async getUserGroups(client, userDN) {
        try {
            const groupFilter = this.config.groupSearchFilter.replace('{{dn}}', this.escapeFilter(userDN));
            const searchOptions = {
                scope: 'sub',
                filter: groupFilter,
                attributes: ['dn']
            };
            
            const searchResult = await new Promise((resolve, reject) => {
                const entries = [];
                
                client.search(this.config.groupSearchBase, searchOptions, (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    res.on('searchEntry', (entry) => {
                        entries.push(entry);
                    });
                    
                    res.on('error', (err) => {
                        reject(err);
                    });
                    
                    res.on('end', (result) => {
                        if (result.status !== 0) {
                            return reject(new Error(`LDAP group search ended with status ${result.status}`));
                        }
                        resolve(entries);
                    });
                });
            });
            
            return searchResult.map(entry => entry.objectName);
        } catch (error) {
            console.error('Error getting user groups:', error);
            return [];
        }
    }
    
    /**
     * Map LDAP groups to application roles
     * @param {Array} groups - Array of group DNs
     * @returns {Array} - Array of mapped role names
     */
    mapGroupsToRoles(groups) {
        const roles = new Set();
        
        // Always add 'user' role as a baseline
        roles.add('user');
        
        // Map groups to roles based on configuration
        for (const group of groups) {
            if (this.config.roleMapping[group]) {
                roles.add(this.config.roleMapping[group]);
            }
        }
        
        return Array.from(roles);
    }
    
    /**
     * Map LDAP attributes to user object
     * @param {Object} ldapEntry - LDAP entry object
     * @returns {Object} - User object
     */
    mapLdapAttributesToUser(ldapEntry) {
        const user = {
            username: '',
            firstName: '',
            lastName: '',
            email: '',
            source: 'ldap',
            roles: ['user'],
            lastSync: new Date().toISOString()
        };
        
        const attrs = ldapEntry.attributes;
        
        // Map LDAP attributes to user object
        for (const [key, ldapAttr] of Object.entries(this.config.userAttributes)) {
            if (key === 'groups') continue; // Handle groups separately
            
            const attr = attrs.find(a => a.type === ldapAttr);
            if (attr && attr.vals && attr.vals.length > 0) {
                user[key] = attr.vals[0];
            }
        }
        
        return user;
    }
    
    /**
     * Synchronize an LDAP user to the local database
     * @param {Object} user - User object
     * @returns {Promise<Object>} - Synchronized user object
     */
    async syncUserToLocalDatabase(user) {
        try {
            // Check if user already exists
            const existingUser = await User.findByUsername(user.username);
            
            if (existingUser) {
                // Update existing user
                existingUser.firstName = user.firstName;
                existingUser.lastName = user.lastName;
                existingUser.email = user.email;
                existingUser.roles = user.roles;
                existingUser.lastSync = user.lastSync;
                
                await User.update(existingUser);
                return existingUser;
            } else {
                // Create new user
                const newUser = await User.create(user);
                return newUser;
            }
        } catch (error) {
            console.error('Error synchronizing user to local database:', error);
            throw error;
        }
    }
    
    /**
     * Synchronize all users from LDAP
     * @returns {Promise<number>} - Number of users synchronized
     */
    async syncAllUsers() {
        if (!this.config.enabled) {
            console.log('LDAP is disabled, skipping user synchronization');
            return 0;
        }
        
        try {
            const client = this.getClient();
            
            // Bind with service account
            await client.bindAsync(this.config.bindDN, this.config.bindCredentials);
            
            // Search for all users
            const searchOptions = {
                scope: 'sub',
                filter: '(objectClass=person)',
                attributes: Object.values(this.config.userAttributes)
            };
            
            const searchResult = await new Promise((resolve, reject) => {
                const entries = [];
                
                client.search(this.config.userSearchBase, searchOptions, (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    res.on('searchEntry', (entry) => {
                        entries.push(entry);
                    });
                    
                    res.on('error', (err) => {
                        reject(err);
                    });
                    
                    res.on('end', (result) => {
                        if (result.status !== 0) {
                            return reject(new Error(`LDAP search ended with status ${result.status}`));
                        }
                        resolve(entries);
                    });
                });
            });
            
            console.log(`Found ${searchResult.length} users in LDAP`);
            
            // Synchronize each user
            let syncCount = 0;
            for (const entry of searchResult) {
                try {
                    const user = this.mapLdapAttributesToUser(entry);
                    
                    // Get user groups and map to roles
                    const userGroups = await this.getUserGroups(client, entry.objectName);
                    user.roles = this.mapGroupsToRoles(userGroups);
                    
                    // Sync user to local database
                    await this.syncUserToLocalDatabase(user);
                    syncCount++;
                } catch (error) {
                    console.error(`Error synchronizing user ${entry.objectName}:`, error);
                }
            }
            
            console.log(`Successfully synchronized ${syncCount} users`);
            return syncCount;
        } catch (error) {
            console.error('Error synchronizing users from LDAP:', error);
            throw error;
        }
    }
    
    /**
     * Escape special characters in LDAP filter
     * @param {string} value - Value to escape
     * @returns {string} - Escaped value
     */
    escapeFilter(value) {
        return value
            .replace(/\*/g, '\\2a')
            .replace(/\(/g, '\\28')
            .replace(/\)/g, '\\29')
            .replace(/\\/g, '\\5c')
            .replace(/\0/g, '\\00')
            .replace(/\//g, '\\2f');
    }
    
    /**
     * Test LDAP connection with current configuration
     * @returns {Promise<Object>} - Test result
     */
    async testConnection() {
        if (!this.config.enabled) {
            return {
                success: false,
                message: 'LDAP is disabled in configuration'
            };
        }
        
        try {
            const client = ldap.createClient({
                url: this.config.url,
                tlsOptions: this.config.tlsOptions
            });
            
            client.bindAsync = promisify(client.bind).bind(client);
            
            // Test binding with service account
            await client.bindAsync(this.config.bindDN, this.config.bindCredentials);
            
            // Test searching
            const searchOptions = {
                scope: 'base',
                filter: '(objectClass=*)',
                attributes: ['dn']
            };
            
            const searchResult = await new Promise((resolve, reject) => {
                client.search(this.config.baseDN, searchOptions, (err, res) => {
                    if (err) {
                        return reject(err);
                    }
                    
                    let found = false;
                    
                    res.on('searchEntry', () => {
                        found = true;
                    });
                    
                    res.on('error', (err) => {
                        reject(err);
                    });
                    
                    res.on('end', () => {
                        resolve(found);
                    });
                });
            });
            
            client.unbind();
            
            return {
                success: true,
                message: 'LDAP connection successful',
                canSearch: searchResult
            };
        } catch (error) {
            return {
                success: false,
                message: `LDAP connection failed: ${error.message}`,
                error: error.toString()
            };
        }
    }
    
    /**
     * Save LDAP configuration
     * @param {Object} config - Configuration object
     * @returns {Promise<void>}
     */
    async saveConfig(config) {
        try {
            // Merge with existing config to ensure all properties are present
            this.config = { ...this.config, ...config };
            
            // Save to configuration file
            await fileManager.saveJson('config/ldap.json', this.config);
            
            // Reinitialize client pool if enabled
            if (this.config.enabled) {
                // Close existing clients
                for (const client of ldapClients) {
                    client.unbind();
                }
                ldapClients = [];
                
                // Initialize new pool
                await this.initializePool();
            }
            
            console.log('LDAP configuration saved');
        } catch (error) {
            console.error('Error saving LDAP configuration:', error);
            throw error;
        }
    }
    
    /**
     * Load LDAP configuration
     * @returns {Promise<Object>} - Loaded configuration
     */
    async loadConfig() {
        try {
            const config = await fileManager.loadJson('config/ldap.json');
            this.config = { ...this.config, ...config };
            return this.config;
        } catch (error) {
            console.error('Error loading LDAP configuration:', error);
            // Return default config if file doesn't exist
            return this.config;
        }
    }
}

module.exports = new LDAPService();