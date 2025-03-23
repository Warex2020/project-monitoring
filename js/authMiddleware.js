/**
 * authMiddleware.js - Authentication and authorization middleware
 * Version 1.5.0 - SECURITY ENHANCED
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Ersetzt crypto für sicheres Hashing
const User = require('../models/user');
const LDAPService = require('./ldapService');
const fileManager = require('./fileManager');

// Auth configuration
let config = {
    secretKey: process.env.JWT_SECRET || 'your-secret-key-change-this',
    tokenExpiration: '24h',
    refreshTokenExpiration: '7d',
    cookieName: 'authToken',
    secureCookies: process.env.NODE_ENV === 'production',
    authenticatedRoutes: ['/api/projects', '/api/users'],
    openRoutes: ['/api/auth/login', '/api/auth/logout', '/api/health'],
    adminRoutes: ['/api/admin', '/api/users'],
    managerRoutes: ['/api/projects/all'],
    saltRounds: 12, // Für bcrypt
    rateLimitWindow: 15 * 60 * 1000, // 15 Minuten
    rateLimitMaxAttempts: 5,
    csrfProtection: true
};

// Login Versuchszähler für Rate Limiting
const loginAttempts = new Map();

// Load configuration
async function loadConfig() {
    try {
        const loadedConfig = await fileManager.loadJson('config/auth.json');
        config = { ...config, ...loadedConfig };
    } catch (error) {
        console.error('Error loading auth configuration:', error);
        // Save default config if file doesn't exist
        try {
            await fileManager.saveJson('config/auth.json', config);
        } catch (saveError) {
            console.error('Error saving default auth configuration:', saveError);
        }
    }
}

// Load config when module is imported
loadConfig();

/**
 * Authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function authenticate(req, res, next) {
    // Skip authentication for open routes
    if (isOpenRoute(req.path)) {
        return next();
    }
    
    try {
        const token = getTokenFromRequest(req);
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        try {
            // Verify token
            const decoded = jwt.verify(token, config.secretKey);
            
            // Check for token expiration (belt and suspenders approach)
            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp && decoded.exp < now) {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired',
                    expired: true
                });
            }
            
            // Get user from database
            const user = await User.findByUsername(decoded.username);
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }
            
            if (!user.active) {
                return res.status(403).json({
                    success: false,
                    message: 'User account is inactive'
                });
            }
            
            // Check token version (Kann für Token-Invalidierung verwendet werden)
            if (user.tokenVersion && decoded.tokenVersion !== user.tokenVersion) {
                return res.status(401).json({
                    success: false,
                    message: 'Token invalidated',
                    expired: true
                });
            }
            
            // Attach user to request
            req.user = user;
            
            // Continue with the request
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired',
                    expired: true
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }
            
            throw error; // Re-throw unexpected errors
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
}

/**
 * Authorization middleware to check for specific roles
 * @param {Array|string} roles - Required roles
 * @returns {Function} - Express middleware
 */
function authorize(roles) {
    // Convert to array if string
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
        // User must be authenticated first
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        // Check if user has any of the required roles
        const hasRequiredRole = req.user.roles.some(role => requiredRoles.includes(role));
        
        if (!hasRequiredRole) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }
        
        // User has required role
        next();
    };
}

/**
 * Middleware to check if route requires admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireAdmin(req, res, next) {
    // Check if path is admin-only
    if (!isAdminRoute(req.path)) {
        return next();
    }
    
    // User must be authenticated first
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // Check if user has admin role
    if (!req.user.roles.includes('admin')) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    
    // User is admin
    next();
}

/**
 * Middleware to check if route requires manager or admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireManager(req, res, next) {
    // Check if path is manager-only
    if (!isManagerRoute(req.path)) {
        return next();
    }
    
    // User must be authenticated first
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // Check if user has manager or admin role
    if (!req.user.roles.includes('manager') && !req.user.roles.includes('admin')) {
        return res.status(403).json({
            success: false,
            message: 'Manager access required'
        });
    }
    
    // User is manager or admin
    next();
}

/**
 * Check if the IP is allowed to make login attempts
 * @param {string} ip - Client IP address
 * @returns {boolean} - Whether login is allowed
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - config.rateLimitWindow;
    
    // Clean up old entries
    for (const [key, data] of loginAttempts.entries()) {
        if (data.timestamp < windowStart) {
            loginAttempts.delete(key);
        }
    }
    
    // Check current IP
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, { count: 0, timestamp: now });
        return true;
    }
    
    const attempt = loginAttempts.get(ip);
    
    // Reset if outside window
    if (attempt.timestamp < windowStart) {
        loginAttempts.set(ip, { count: 0, timestamp: now });
        return true;
    }
    
    // Check if too many attempts
    if (attempt.count >= config.rateLimitMaxAttempts) {
        return false;
    }
    
    return true;
}

/**
 * Record a login attempt
 * @param {string} ip - Client IP address
 * @param {boolean} success - Whether login was successful
 */
function recordLoginAttempt(ip, success) {
    const now = Date.now();
    
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, { count: success ? 0 : 1, timestamp: now });
        return;
    }
    
    const attempt = loginAttempts.get(ip);
    
    if (success) {
        // Reset on successful login
        loginAttempts.set(ip, { count: 0, timestamp: now });
    } else {
        // Increment on failed login
        loginAttempts.set(ip, { 
            count: attempt.count + 1, 
            timestamp: now 
        });
    }
}

/**
 * Login handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function login(req, res) {
    try {
        const { username, password } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }
        
        // Check rate limiting
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({
                success: false,
                message: 'Too many login attempts. Please try again later.'
            });
        }
        
        // First try local authentication
        let user = await User.authenticate(username, password);
        
        // If local authentication fails, try LDAP if enabled
        if (!user) {
            try {
                user = await LDAPService.authenticate(username, password);
            } catch (ldapError) {
                console.error('LDAP authentication error:', ldapError);
            }
        }
        
        if (!user) {
            // Record failed attempt
            recordLoginAttempt(clientIp, false);
            
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
        
        // Record successful attempt
        recordLoginAttempt(clientIp, true);
        
        // Generate token
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        
        // Set token as cookie
        res.cookie(config.cookieName, token, {
            httpOnly: true,
            secure: config.secureCookies,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        // Update last login
        await User.recordLogin(user.username);
        
        // Return user info and refresh token
        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                roles: user.roles
            },
            refreshToken,
            passwordResetRequired: user.passwordResetRequired || false
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login error'
        });
    }
}

/**
 * Logout handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function logout(req, res) {
    // Clear auth cookie
    res.clearCookie(config.cookieName);
    
    res.status(200).json({
        success: true,
        message: 'Logout successful'
    });
}

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
function generateToken(user) {
    return jwt.sign(
        {
            username: user.username,
            roles: user.roles,
            tokenVersion: user.tokenVersion || 1
        },
        config.secretKey,
        {
            expiresIn: config.tokenExpiration
        }
    );
}

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {string} - Refresh token
 */
function generateRefreshToken(user) {
    return jwt.sign(
        {
            username: user.username,
            tokenType: 'refresh',
            tokenVersion: user.tokenVersion || 1
        },
        config.secretKey,
        {
            expiresIn: config.refreshTokenExpiration
        }
    );
}

/**
 * Refresh token handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function refreshToken(req, res) {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }
        
        try {
            // Verify refresh token
            const decoded = jwt.verify(refreshToken, config.secretKey);
            
            // Check if it's a refresh token
            if (decoded.tokenType !== 'refresh') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid refresh token'
                });
            }
            
            // Get user from database
            const user = await User.findByUsername(decoded.username);
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }
            
            if (!user.active) {
                return res.status(403).json({
                    success: false,
                    message: 'User account is inactive'
                });
            }
            
            // Check token version
            if (user.tokenVersion && decoded.tokenVersion !== user.tokenVersion) {
                return res.status(401).json({
                    success: false,
                    message: 'Token invalidated',
                    expired: true
                });
            }
            
            // Generate new token
            const token = generateToken(user);
            
            // Set token as cookie
            res.cookie(config.cookieName, token, {
                httpOnly: true,
                secure: config.secureCookies,
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
            
            // Return success
            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token expired',
                    expired: true
                });
            }
            
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Token refresh error'
        });
    }
}

/**
 * Get token from request
 * @param {Object} req - Express request object
 * @returns {string|null} - Token or null
 */
function getTokenFromRequest(req) {
    // Try to get token from cookie
    if (req.cookies && req.cookies[config.cookieName]) {
        return req.cookies[config.cookieName];
    }
    
    // Try to get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    return null;
}

/**
 * Check if route is open (doesn't require authentication)
 * @param {string} path - Request path
 * @returns {boolean} - Whether route is open
 */
function isOpenRoute(path) {
    // Exact matches
    if (config.openRoutes.includes(path)) {
        return true;
    }
    
    // Prefix matches
    return config.openRoutes.some(route => {
        return route.endsWith('*') && path.startsWith(route.slice(0, -1));
    });
}

/**
 * Check if route requires admin role
 * @param {string} path - Request path
 * @returns {boolean} - Whether route requires admin
 */
function isAdminRoute(path) {
    // Exact matches
    if (config.adminRoutes.includes(path)) {
        return true;
    }
    
    // Prefix matches
    return config.adminRoutes.some(route => {
        return route.endsWith('*') && path.startsWith(route.slice(0, -1));
    });
}

/**
 * Check if route requires manager role
 * @param {string} path - Request path
 * @returns {boolean} - Whether route requires manager
 */
function isManagerRoute(path) {
    // Exact matches
    if (config.managerRoutes.includes(path)) {
        return true;
    }
    
    // Prefix matches
    return config.managerRoutes.some(route => {
        return route.endsWith('*') && path.startsWith(route.slice(0, -1));
    });
}

/**
 * CSRF Protection middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function csrfProtection(req, res, next) {
    // Skip for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    // Skip if CSRF protection is disabled
    if (!config.csrfProtection) {
        return next();
    }
    
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const storedToken = req.session?.csrfToken;
    
    if (!csrfToken || !storedToken || csrfToken !== storedToken) {
        return res.status(403).json({
            success: false,
            message: 'CSRF token validation failed'
        });
    }
    
    next();
}

module.exports = {
    authenticate,
    authorize,
    requireAdmin,
    requireManager,
    login,
    logout,
    refreshToken,
    generateToken,
    csrfProtection,
    loadConfig
};