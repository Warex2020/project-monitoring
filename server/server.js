/**
 * server.js - Enhanced WebSocket-Server for the Project-Monitoring-Dashboard
 * Version 1.4.0 - SECURITY ENHANCED
 */

const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const fileManager = require('./fileManager');
const ip = require('ip');
const crypto = require('crypto');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const helmet = require('helmet'); // Sicherheits-Header
const rateLimit = require('express-rate-limit'); // Rate Limiting
const { v4: uuidv4 } = require('uuid'); // Für sichere IDs

// Error handling for missing modules
try {
    require('ws');
    require('ip');
    require('express');
    require('crypto');
    require('express-session');
    require('cookie-parser');
    require('body-parser');
    require('helmet');
    require('express-rate-limit');
    require('uuid');
    require('cors');
} catch (error) {
    console.error('Error: Required modules not found:', error.message);
    console.error('Please run "npm install" to install all dependencies.');
    process.exit(1);
}

// Configuration files
const CONFIG_PATH = path.join(__dirname, '..', 'config');
const PROJECTS_FILE = path.join(CONFIG_PATH, 'projects.json');
const CONFIG_FILE = path.join(CONFIG_PATH, 'config.json');
const LOG_FILE = path.join(CONFIG_PATH, 'access.log');

// Asynchronous logger
const logEvent = async (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    
    try {
        await fs.appendFile(LOG_FILE, logMessage);
        // Also output to console
        console.log(message);
    } catch (err) {
        console.error('Error writing to log file:', err);
    }
};

// Server configuration
let config;
try {
    config = fileManager.loadJsonSync(CONFIG_FILE);
} catch (error) {
    console.error(`Error loading server configuration: ${error.message}`);
    config = {
        server: {},
        dashboard: {
            title: "IT-Projekt-Monitoring",
            subtitle: "Dashboard für IT-Abteilung"
        },
        security: {
            mode: "private",
            requireLoginForChanges: false,
            sessionSecret: crypto.randomBytes(32).toString('hex') // Generiere ein zufälliges Secret
        }
    };
}

const serverConfig = config.server || {};
const dashboardConfig = config.dashboard || { title: "IT-Projekt-Monitoring", subtitle: "Dashboard für IT-Abteilung" };
const securityConfig = config.security || { mode: "private", requireLoginForChanges: false };

// Ensure we have a session secret
if (!securityConfig.sessionSecret) {
    securityConfig.sessionSecret = crypto.randomBytes(32).toString('hex');
    // Save the updated config
    fileManager.saveJsonSync(CONFIG_FILE, config);
    console.log('Generated new session secret');
}

const PORT = serverConfig.port || process.env.PORT || 3420;
const HOST = serverConfig.host || '0.0.0.0';

// Create Express app
const app = express();

// Security middleware mit deaktivierter CSP
app.use(helmet({
    // CSP komplett deaktivieren
    contentSecurityPolicy: false,
    
    // Andere Sicherheitseinstellungen beibehalten
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true
    }
}));


// Rate limiting
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per IP
    standardHeaders: true,
    message: {
        success: false,
        message: 'Too many login attempts, please try again later'
    }
});

// Regular API rate limiting
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // 100 requests per IP
    standardHeaders: true,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later'
    }
});

// Middleware setup
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// File store for sessions
const FileStore = require('session-file-store')(session);

// Session configuration with file store and secure settings
app.use(session({
    store: new FileStore({
        path: './sessions',
        ttl: 86400,
        retries: 0,
        reapInterval: 3600,
        logFn: function() {}
    }),
    secret: securityConfig.sessionSecret,
    name: 'projectMonitoringSessionId', // Nicht der Standard-Name
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // In Produktion nur HTTPS
        httpOnly: true, // Nicht per JS zugreifbar
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict' // CSRF-Schutz
    }
}));

// Add this before your other middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3420', 
            'http://10.66.66.5:3420', 
            'http://127.0.0.1:3420'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Generate CSRF token for forms
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    next();
});

// Make static files available from the root directory
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
    // If security mode is public or login is not required for changes, skip auth
    if (securityConfig.mode === "public" || !securityConfig.requireLoginForChanges) {
        return next();
    }
    
    // Check if user is authenticated
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // API request or page request?
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // Redirect to login page
    res.redirect('/login');
};

// Login route
app.get('/login', (req, res) => {
    // If security mode is public or login is not required, redirect to homepage
    if (securityConfig.mode === "public" || !securityConfig.requireLoginForChanges) {
        return res.redirect('/');
    }
    
    // Serve the login page
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Login POST route for authentication with rate limiting
app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    
    // Skip authentication if mode is public
    if (securityConfig.mode === "public" || !securityConfig.requireLoginForChanges) {
        req.session.authenticated = true;
        req.session.username = "guest";
        req.session.role = "guest";
        return res.status(200).json({ success: true, message: 'Login successful' });
    }
    
    try {
        // Verify credentials with time-constant comparison
        const users = securityConfig.users || [];
        const user = users.find(u => u.username === username);
        
        if (user) {
            // Hash the provided password for comparison
            const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
            
            // Time-constant comparison to prevent timing attacks
            const passwordsMatch = crypto.timingSafeEqual(
                Buffer.from(hashedPassword, 'hex'),
                Buffer.from(user.password, 'hex')
            );
            
            if (passwordsMatch) {
                // Regenerate session to prevent session fixation
                req.session.regenerate((err) => {
                    if (err) {
                        console.error('Session regeneration error:', err);
                        return res.status(500).json({ success: false, message: 'Internal server error' });
                    }
                    
                    // Set session data
                    req.session.authenticated = true;
                    req.session.username = username;
                    req.session.role = user.role;
                    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
                    
                    logEvent(`User ${username} logged in successfully`);
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Login successful', 
                        role: user.role,
                        csrfToken: req.session.csrfToken
                    });
                });
                return;
            }
        }
        
        // Failed login
        logEvent(`Failed login attempt for username: ${username}`);
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Authentication status API
app.get('/api/auth-status', (req, res) => {
    const isAuthenticated = req.session && req.session.authenticated;
    const needsAuth = securityConfig.mode === "private" && securityConfig.requireLoginForChanges;
    
    res.json({
        authenticated: isAuthenticated,
        requiresAuth: needsAuth,
        username: req.session.username || null,
        role: req.session.role || null,
        csrfToken: req.session.csrfToken || null
    });
});

// Config API - Send dashboard config to client
app.get('/api/dashboard-config', (req, res) => {
    res.json({
        title: dashboardConfig.title,
        subtitle: dashboardConfig.subtitle,
        security: {
            mode: securityConfig.mode,
            requireLoginForChanges: securityConfig.requireLoginForChanges
        },
        version: require('../package.json').version
    });
});

// API routes with rate limiting
app.use('/api', apiLimiter);

// Main page route
app.get('/', (req, res) => {
    // If security mode is private and login is required, check authentication
    if (securityConfig.mode === "private" && securityConfig.requireLoginForChanges && 
        !(req.session && req.session.authenticated)) {
        return res.redirect('/login');
    }
    
    // Read HTML content
    fs.readFile(path.join(__dirname, '..', 'index.html'), 'utf8')
        .then(htmlContent => {
            // Add CSP nonce if needed
            const nonce = crypto.randomBytes(16).toString('base64');
            htmlContent = htmlContent.replace(/<script/g, `<script nonce="${nonce}"`);
            
            // Add CSRF token
            if (req.session.csrfToken) {
                htmlContent = htmlContent.replace('</head>', `<meta name="csrf-token" content="${req.session.csrfToken}"></head>`);
            }
            
            // Send modified HTML
            res.send(htmlContent);
        })
        .catch(err => {
            console.error('Error reading index.html:', err);
            res.status(500).send('Server error');
        });
});

// Health check route
app.get('/health', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', true);
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Fallback route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Create HTTP server with Express
const server = http.createServer(app);

// Create WebSocket server with client tracking
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    // Prüfen der Herkunft der Anfrage
    verifyClient: (info) => {
        // More permissive for development
        if (process.env.NODE_ENV === 'development') {
            return true;
        }
        
        const origin = info.origin || '';
        const allowedOrigins = [
            `http://${ip.address()}:${PORT}`,
            `https://${ip.address()}:${PORT}`,
            `http://localhost:${PORT}`,
            `http://127.0.0.1:${PORT}`,
            `http://10.66.66.5:${PORT}`
        ];
        
        return allowedOrigins.some(allowedOrigin => 
            origin.startsWith(allowedOrigin)
        );
    }
});

// Active connections with authentication status
const connections = new Map();  // WebSocket -> { clientInfo }

// Keep current projects in memory
let projects = {};

// Start the server
server.listen(PORT, HOST, () => {
    logEvent(`Server started on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    logEvent(`Local IP address: http://${ip.address()}:${PORT}`);
    
    // Load projects on startup
    loadProjects();
});

// WebSocket connection
wss.on('connection', async (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`WebSocket connection established from ${clientIp}`);
    await logEvent(`New connection from ${clientIp}`);

    // Generate a unique ID for this connection
    const connectionId = uuidv4();
    
    // Store connection info
    connections.set(ws, { 
        id: connectionId,
        ip: clientIp,
        authenticated: false,
        connectedAt: new Date(),
        lastActivity: new Date()
    });
    
    // Check if IP is allowed (skip if security mode is public)
    if (securityConfig.mode === "private" && !await isAllowedIp(clientIp)) {
        await logEvent(`Connection from ${clientIp} denied (not authorized)`);
        
        // Send a message to the client before closing the connection
        ws.send(JSON.stringify({
            type: 'error',
            data: {
                message: 'Access denied. Your IP address is not authorized.',
                ip: clientIp
            },
            timestamp: Date.now()
        }));
        
        // Close the connection with a special code
        ws.close(1008, 'Unauthorized IP address');
        return;
    }
    
    await logEvent(`Connection from ${clientIp} authorized and established`);
    
    // Handle authentication status for the connection
    // Extract session ID from cookies
    const cookies = req.headers.cookie;
    if (cookies) {
        const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('projectMonitoringSessionId='));
        if (sessionCookie) {
            const sessionId = sessionCookie.split('=')[1].trim();
            
            // Store session ID with connection
            const connInfo = connections.get(ws);
            connInfo.sessionId = sessionId;
            connections.set(ws, connInfo);
        }
    }
    
    // Process messages from client
    ws.on('message', async (message) => {
        try {
            const connInfo = connections.get(ws);
            connInfo.lastActivity = new Date();
            connections.set(ws, connInfo);
            
            const parsedMessage = JSON.parse(message);
            
            // Special handler for sync requests
            if (parsedMessage.type === 'request_sync') {
                // Send current state for synchronization
                ws.send(JSON.stringify({
                    type: 'sync_response',
                    data: {
                        projects: projects
                    },
                    timestamp: Date.now()
                }));
                return;
            }
            
            // Special handler for authentication
            if (parsedMessage.type === 'authenticate') {
                const sessionId = parsedMessage.data.sessionId;
                const authenticated = parsedMessage.data.authenticated;
                
                const connInfo = connections.get(ws);
                connInfo.authenticated = authenticated;
                connInfo.sessionId = sessionId;
                connections.set(ws, connInfo);
                
                ws.send(JSON.stringify({
                    type: 'auth_status',
                    data: {
                        authenticated: authenticated
                    },
                    timestamp: Date.now()
                }));
                return;
            }
            
            // Process normal messages
            await handleClientMessage(parsedMessage, ws);
        } catch (error) {
            console.error('Error processing client message:', error);
        }
    });
    
    // Send current projects to the new client
    syncProjects(ws);
    
    // Connection closed
    ws.on('close', (code, reason) => {
        console.log(`Connection from ${clientIp} closed with code ${code} and reason: ${reason || 'No reason provided'}`);
        connections.delete(ws);
    });
    
    // Error handling
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientIp}:`, error);
        connections.delete(ws);
    });
});

// Check if an IP address is allowed
async function isAllowedIp(clientIp) {
    try {
        // If security mode is public, allow all IPs
        if (securityConfig.mode === "public") {
            return true;
        }
        
        // Reload configuration to get the most current settings
        try {
            config = await fileManager.loadJson(CONFIG_FILE);
        } catch (err) {
            // Fallback zur aktuellen Konfiguration, wenn Lesen fehlschlägt
            console.warn('Could not reload config file, using current config');
        }
        
        // If no IP restriction is configured or the list is empty, allow all
        if (!config || !config.allowedIps || config.allowedIps.length === 0) {
            await logEvent(`No IP restrictions configured. Allowing all connections.`);
            return true;
        }
        
        // Clean client IP (remove IPv6 prefix)
        const cleanIp = clientIp.replace(/^::ffff:/, '');
        
        // Always allow local IPs
        const localIps = ['127.0.0.1', 'localhost', '::1'];
        if (localIps.includes(cleanIp)) {
            await logEvent(`Local IP ${cleanIp} detected. Connection allowed.`);
            return true;
        }
        
        // Check if IP is in the allowed list
        for (const allowedIp of config.allowedIps) {
            // Check if it's a CIDR notation (e.g. 192.168.1.0/24)
            if (allowedIp.includes('/')) {
                if (isIpInCidrRange(cleanIp, allowedIp)) {
                    await logEvent(`IP ${cleanIp} is in CIDR range ${allowedIp}. Connection allowed.`);
                    return true;
                }
            } 
            // Exact IP match
            else if (allowedIp === cleanIp) {
                await logEvent(`IP ${cleanIp} is in the allowed list. Connection allowed.`);
                return true;
            }
        }
        
        // IP not in the list of allowed IPs
        await logEvent(`IP ${cleanIp} is not authorized. Connection denied.`);
        return false;
    } catch (error) {
        await logEvent(`Error checking IP restriction: ${error.message}`);
        // Allow in case of error (security risk, but better than complete failure)
        return true;
    }
}

// Check if a client is authenticated for making changes
function isClientAuthenticated(ws) {
    // If login is not required for changes, all clients are "authenticated"
    if (!securityConfig.requireLoginForChanges) {
        return true;
    }
    
    // Check client authentication status
    if (connections.has(ws)) {
        return connections.get(ws).authenticated;
    }
    
    return false;
}

// Load projects from configuration file
async function loadProjects() {
    try {
        const data = await fileManager.loadJson(PROJECTS_FILE);
        if (data) {
            projects = data;
            console.log(`${Object.keys(projects).length} projects loaded`);
        } else {
            // Create empty project data if none exists
            projects = {};
            console.log('No projects found. Starting with empty project list.');
            await saveProjects();
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        // Create empty project file if it doesn't exist
        try {
            projects = {};
            await fileManager.saveJson(PROJECTS_FILE, {});
            console.log('Empty project file created');
        } catch (err) {
            console.error('Error creating project file:', err);
        }
    }
}

// Save projects to configuration file
async function saveProjects() {
    try {
        await fileManager.saveJson(PROJECTS_FILE, projects);
        console.log('Projects saved');
        return true;
    } catch (error) {
        console.error('Error saving projects:', error);
        return false;
    }
}

// Create a backup of the projects file
async function backupProjects() {
    try {
        const backupPath = `${PROJECTS_FILE}.backup-${Date.now()}`;
        await fs.copyFile(PROJECTS_FILE, backupPath);
        console.log(`Projects backup created: ${backupPath}`);
        
        // Delete old backups (keep last 5)
        const dirPath = path.dirname(PROJECTS_FILE);
        const files = await fs.readdir(dirPath);
        
        const backups = files
            .filter(file => file.startsWith('projects.json.backup-'))
            .map(file => path.join(dirPath, file))
            .sort();
            
        // Delete older backups, keeping only the last 5
        if (backups.length > 5) {
            for (let i = 0; i < backups.length - 5; i++) {
                await fs.unlink(backups[i]);
                console.log(`Deleted old backup: ${backups[i]}`);
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error creating projects backup:', error);
        return false;
    }
}

// Send a message to all connected clients except the sender
function broadcastMessage(message, exclude = null) {
    const messageString = JSON.stringify(message);
    
    connections.forEach((info, client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            try {
                // Speichere das letzte bekannte Projekt für diesen Client
                if (message.type === 'update_project' && message.data && message.data.id) {
                    if (!info.knownProjects) info.knownProjects = {};
                    info.knownProjects[message.data.id] = calculateProjectHash(message.data);
                }
                
                client.send(messageString);
            } catch (err) {
                console.error('Error sending broadcast message:', err);
            }
        }
    });
}

// Send current projects to a client
// Send current projects to a client
function syncProjects(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    try {
        const clientInfo = connections.get(ws);
        if (!clientInfo) return;
        
        // Erst initiale Sync-Anfrage
        if (!clientInfo.knownProjects) {
            clientInfo.knownProjects = {};
            
            // Sende alle Projekte beim ersten Mal
            ws.send(JSON.stringify({
                type: 'sync_projects',
                data: projects,
                timestamp: Date.now()
            }));
            
            // Speichere Hash für jedes Projekt
            for (const [id, project] of Object.entries(projects)) {
                clientInfo.knownProjects[id] = calculateProjectHash(project);
            }
            
            return;
        }
        
        // Inkrementelles Update - nur geänderte Projekte senden
        const updatedProjects = {};
        let updateCount = 0;
        
        for (const [id, project] of Object.entries(projects)) {
            const currentHash = calculateProjectHash(project);
            
            // Wenn das Projekt neu ist oder sich geändert hat
            if (!clientInfo.knownProjects[id] || clientInfo.knownProjects[id] !== currentHash) {
                updatedProjects[id] = project;
                clientInfo.knownProjects[id] = currentHash;
                updateCount++;
            }
        }
        
        // Prüfen, ob Projekte gelöscht wurden
        const deletedProjects = [];
        for (const id in clientInfo.knownProjects) {
            if (!projects[id]) {
                deletedProjects.push(id);
                delete clientInfo.knownProjects[id];
            }
        }
        
        // Nur senden, wenn es Änderungen gibt
        if (updateCount > 0 || deletedProjects.length > 0) {
            ws.send(JSON.stringify({
                type: 'sync_updates',
                data: {
                    updated: updatedProjects,
                    deleted: deletedProjects
                },
                timestamp: Date.now()
            }));
            
            console.log(`Sent incremental update: ${updateCount} updated, ${deletedProjects.length} deleted`);
        } else {
            ws.send(JSON.stringify({
                type: 'sync_unchanged',
                timestamp: Date.now()
            }));
            
            console.log('No project changes detected, sent unchanged notification');
        }
    } catch (err) {
        console.error('Error sending projects sync:', err);
    }
}

// Berechnet einen Hash für ein einzelnes Projekt
function calculateProjectHash(project) {
    try {
        const json = JSON.stringify(project);
        let hash = 0;
        
        for (let i = 0; i < json.length; i++) {
            const char = json.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Konvertiere zu 32bit Integer
        }
        
        return hash.toString(36);
    } catch (error) {
        return Date.now().toString(36); // Fallback
    }
}

// Berechne einen Hash/Fingerprint von Projekten
function calculateProjectsHash(projects) {
    // Einfache Hash-Berechnung durch JSON-String und Hashing
    try {
        const projectsJson = JSON.stringify(projects);
        
        // Erstelle einfachen Hash (fnv1a)
        let hash = 0x811c9dc5; // FNV offset basis
        for (let i = 0; i < projectsJson.length; i++) {
            hash ^= projectsJson.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        
        // Formatiere als Hex-String
        return (hash >>> 0).toString(16);
    } catch (error) {
        console.error('Error calculating projects hash:', error);
        // Fallback: Timestamp als "Hash" verwenden
        return Date.now().toString(16);
    }
}


// Process a client message
async function handleClientMessage(message, ws) {
    // Grundlegende Nachrichtenprüfung
    if (!message || !message.type) {
        console.error('Invalid client message (missing type):', message);
        return;
    }
    
    console.log('Client message received:', message.type);
    
    // Spezielle Behandlung für Ping-Nachrichten
    if (message.type === 'ping') {
        // Aktualisiere lastActivity-Zeitstempel
        if (connections.has(ws)) {
            const connInfo = connections.get(ws);
            connInfo.lastActivity = new Date();
            connections.set(ws, connInfo);
        }
        
        // Sende Pong-Antwort
        ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
        }));
        return;
    }
    
    // Spezielle Behandlung für Authentifizierungsnachrichten
    if (message.type === 'authenticate') {
        const sessionId = message.data?.sessionId;
        const authenticated = message.data?.authenticated;
        
        const connInfo = connections.get(ws);
        if (connInfo) {
            connInfo.authenticated = authenticated;
            connInfo.sessionId = sessionId;
            connections.set(ws, connInfo);
        }
        
        // Bestätigung senden
        ws.send(JSON.stringify({
            type: 'auth_status',
            data: {
                authenticated: authenticated
            },
            timestamp: Date.now()
        }));
        return;
    }
    
    // Für Synchronized-Anfragen
    if (message.type === 'request_sync') {
        syncProjects(ws);
        return;
    }
    
    // Für alle anderen Operationen prüfen wir, ob data vorhanden ist
    if (!message.data) {
        console.error('Invalid client message (missing data):', message);
        return;
    }
    
    // Rest der Funktion unverändert...
    // Check authentication for write operations
    const isWriteOperation = ['add_project', 'update_project', 'delete_project', 
                              'add_step', 'update_step', 'delete_step'].includes(message.type);
    
    // Process the message based on its type
    try {
        switch (message.type) {
            case 'add_project':
                // Create a project with unique ID
                if (message.data) {
                    if (!message.data.id) {
                        message.data.id = generateUniqueId();
                    }
                    
                    // Validate project data
                    if (!isValidProject(message.data)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: {
                                message: 'Invalid project data',
                                code: 'VALIDATION_ERROR'
                            },
                            timestamp: Date.now()
                        }));
                        return;
                    }
                    
                    // Add created timestamp
                    message.data.createdAt = new Date().toISOString();
                    
                    // Add project
                    projects[message.data.id] = message.data;
                    
                    // Create backup before saving
                    await backupProjects();
                    
                    // Save projects
                    await saveProjects();
                    
                    // Broadcast to all clients
                    broadcastMessage(message, ws);
                }
                break;
                
            case 'update_project':
                // Update existing project
                if (message.data && message.data.id && projects[message.data.id]) {
                    // Validate project data
                    if (!isValidProject(message.data)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: {
                                message: 'Invalid project data',
                                code: 'VALIDATION_ERROR'
                            },
                            timestamp: Date.now()
                        }));
                        return;
                    }
                    
                    // Preserve creation timestamp
                    const createdAt = projects[message.data.id].createdAt;
                    
                    // Add updated timestamp
                    message.data.updatedAt = new Date().toISOString();
                    message.data.createdAt = createdAt;
                    
                    // Update project
                    projects[message.data.id] = message.data;
                    
                    // Save projects
                    await saveProjects();
                    
                    // Broadcast to all clients
                    broadcastMessage(message, ws);
                }
                break;
                
            case 'delete_project':
                // Delete project
                if (message.data && message.data.id && projects[message.data.id]) {
                    // Create backup before deletion
                    await backupProjects();
                    
                    // Delete project
                    delete projects[message.data.id];
                    
                    // Save projects
                    await saveProjects();
                    
                    // Broadcast to all clients
                    broadcastMessage(message, ws);
                }
                break;
                
            case 'add_step':
            case 'update_step':
                // Add/update step
                if (message.data && message.data.projectId && projects[message.data.projectId]) {
                    const project = projects[message.data.projectId];
                    
                    // Make sure steps exists
                    if (!project.steps) {
                        project.steps = [];
                    }
                    
                    // Validate step data
                    if (!isValidStep(message.data)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: {
                                message: 'Invalid step data',
                                code: 'VALIDATION_ERROR'
                            },
                            timestamp: Date.now()
                        }));
                        return;
                    }
                    
                    // Create a unique ID if not provided
                    if (!message.data.id) {
                        message.data.id = generateUniqueId();
                    }
                    
                    // Add timestamps
                    message.data.updatedAt = new Date().toISOString();
                    
                    // Check if step already exists
                    const stepIndex = project.steps.findIndex(step => step.id === message.data.id);
                    
                    if (stepIndex >= 0) {
                        // Preserve creation timestamp
                        const createdAt = project.steps[stepIndex].createdAt;
                        message.data.createdAt = createdAt;
                        
                        // Update step
                        project.steps[stepIndex] = message.data;
                    } else {
                        // Add creation timestamp for new step
                        message.data.createdAt = new Date().toISOString();
                        
                        // Add step
                        project.steps.push(message.data);
                    }
                    
                    // Update project progress
                    updateProjectProgress(project);
                    
                    // Save projects
                    await saveProjects();
                    
                    // Broadcast to all clients
                    broadcastMessage(message, ws);
                }
                break;
                
            case 'delete_step':
                // Delete step
                if (message.data && message.data.projectId && message.data.id && 
                    projects[message.data.projectId] && projects[message.data.projectId].steps) {
                    
                    const project = projects[message.data.projectId];
                    
                    // Find and remove the step
                    const stepIndex = project.steps.findIndex(step => step.id === message.data.id);
                    
                    if (stepIndex >= 0) {
                        // Create backup before deletion
                        await backupProjects();
                        
                        // Remove step
                        project.steps.splice(stepIndex, 1);
                        
                        // Update project progress
                        updateProjectProgress(project);
                        
                        // Save projects
                        await saveProjects();
                        
                        // Broadcast to all clients
                        broadcastMessage(message, ws);
                    }
                }
                break;
                
            case 'request_sync':
                // Client requests synchronization
                syncProjects(ws);
                break;
                
            default:
                console.warn('Unknown message type:', message.type);
        }
    } catch (error) {
        console.error(`Error processing ${message.type} message:`, error);
        
        // Send error to client
        ws.send(JSON.stringify({
            type: 'error',
            data: {
                message: `Error processing your request: ${error.message}`,
                code: 'SERVER_ERROR'
            },
            timestamp: Date.now()
        }));
    }
}

// Validate project data
function isValidProject(project) {
    // Required fields
    if (!project.title) {
        return false;
    }
    
    // Valid status
    const validStatuses = ['on-track', 'at-risk', 'delayed', 'completed'];
    if (!validStatuses.includes(project.status)) {
        return false;
    }
    
    // Valid progress (0-100)
    if (typeof project.progress !== 'number' || project.progress < 0 || project.progress > 100) {
        return false;
    }
    
    // Deadline format (if present)
    if (project.deadline) {
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!datePattern.test(project.deadline)) {
            return false;
        }
    }
// Team members (if present) must be an array
if (project.team && !Array.isArray(project.team)) {
    return false;
}

return true;
}

// Validate step data
function isValidStep(step) {
// Required fields
if (!step.title || !step.projectId) {
    return false;
}

// Completed status must be boolean
if (typeof step.completed !== 'boolean') {
    return false;
}

return true;
}

// Generate a unique ID
function generateUniqueId() {
return uuidv4();
}

// Update project progress based on steps
function updateProjectProgress(project) {
if (!project || !project.steps || project.steps.length === 0) return;

// Calculate percentage of completed steps
const completedSteps = project.steps.filter(step => step.completed).length;
const totalSteps = project.steps.length;
const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

// Update project progress
project.progress = progressPercentage;

// Update project status based on progress
updateProjectStatus(project);

// Update next step
updateNextStep(project);
}

// Update project status based on progress and deadline
function updateProjectStatus(project) {
if (!project) return;

// If all steps are completed, set status to "completed"
if (project.progress === 100) {
    project.status = 'completed';
    return;
}

// Check if deadline has passed
if (project.deadline) {
    const deadlineDate = new Date(project.deadline);
    const today = new Date();
    
    if (deadlineDate < today) {
        project.status = 'delayed';
        return;
    }
    
    // Check if deadline is less than 7 days away and progress < 70%
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7 && project.progress < 70) {
        project.status = 'at-risk';
        return;
    }
}

// Default: On Track
if (project.status !== 'at-risk' && project.status !== 'delayed') {
    project.status = 'on-track';
}
}

// Update next step for a project
function updateNextStep(project) {
if (!project || !project.steps || project.steps.length === 0) return;

// Find the first incomplete step
const nextStep = project.steps.find(step => !step.completed);

if (nextStep) {
    project.nextStep = nextStep.title;
} else {
    project.nextStep = 'All steps completed';
}
}

// Check if an IP is in a CIDR range
function isIpInCidrRange(ip, cidr) {
try {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);
    
    // Convert IP address to integer
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    
    // Calculate network address and broadcast address
    const shiftBits = 32 - mask;
    const netmask = ((1 << mask) - 1) << shiftBits;
    const networkAddr = rangeInt & netmask;
    const broadcastAddr = networkAddr | ((1 << shiftBits) - 1);
    
    // Check if IP is in range
    return ipInt >= networkAddr && ipInt <= broadcastAddr;
} catch (error) {
    console.error('Error checking CIDR range:', error);
    return false;
}
}

// Convert an IP address to an integer
function ipToInt(ip) {
try {
    return ip.split('.')
        .reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
} catch (error) {
    console.error('Error converting IP to int:', error);
    return 0;
}
}

// Periodic cleanup of inactive connections
setInterval(() => {
const now = new Date();
const inactiveTimeout = 30 * 60 * 1000; // 30 minutes

connections.forEach((info, client) => {
    if (now - info.lastActivity > inactiveTimeout) {
        // Close inactive connection
        console.log(`Closing inactive connection from ${info.ip}`);
        client.close(1000, 'Inactivity timeout');
        connections.delete(client);
    }
});
}, 5 * 60 * 1000); // Check every 5 minutes

// Create a complete backup of all projects daily
setInterval(async () => {
try {
    const backupPath = path.join(CONFIG_PATH, 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupPath, `projects-backup-${timestamp}.json`);
    
    // Create backups directory if it doesn't exist
    await fs.mkdir(backupPath, { recursive: true });
    
    // Copy current projects file
    const projectsData = await fs.readFile(PROJECTS_FILE, 'utf8');
    await fs.writeFile(backupFile, projectsData);
    
    console.log(`Daily backup created: ${backupFile}`);
    
    // Delete backups older than 30 days
    const files = await fs.readdir(backupPath);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    for (const file of files) {
        if (file.startsWith('projects-backup-')) {
            const filePath = path.join(backupPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.mtime < thirtyDaysAgo) {
                await fs.unlink(filePath);
                console.log(`Deleted old backup: ${filePath}`);
            }
        }
    }
} catch (error) {
    console.error('Error creating daily backup:', error);
}
}, 24 * 60 * 60 * 1000); // Run once a day

// Export for testing
module.exports = { app, server, wss };