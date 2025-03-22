/**
 * server.js - Enhanced WebSocket-Server for the Project-Monitoring-Dashboard
 * Version 1.3.0
 */

const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const fileManager = require('./fileManager');
const ip = require('ip');
const crypto = require('crypto');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

// Error handling for missing modules
try {
    require('ws');
    require('ip');
    require('express');
    require('crypto');
    require('express-session');
    require('cookie-parser');
    require('body-parser');
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

// Function to log events
function logEvent(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    
    // Add to log file
    fs.appendFile(LOG_FILE, logMessage, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
    
    // Also output to console
    console.log(message);
}

// Server configuration
let config;
try {
    config = fileManager.loadJsonSync(CONFIG_FILE);
} catch (error) {
    logEvent(`Error loading server configuration: ${error.message}`);
    config = {
        server: {},
        dashboard: {
            title: "IT-Projekt-Monitoring",
            subtitle: "Dashboard für IT-Abteilung"
        },
        security: {
            mode: "private",
            requireLoginForChanges: false
        }
    };
}

const serverConfig = config.server || {};
const dashboardConfig = config.dashboard || { title: "IT-Projekt-Monitoring", subtitle: "Dashboard für IT-Abteilung" };
const securityConfig = config.security || { mode: "private", requireLoginForChanges: false };

const PORT = serverConfig.port || process.env.PORT || 3000;
const HOST = serverConfig.host || '0.0.0.0';

// Generate a secret key for sessions
const sessionSecret = crypto.randomBytes(32).toString('hex');

// Create Express app
const app = express();

// Middleware setup
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session configuration
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Make static files available from the root directory
app.use(express.static(path.join(__dirname, '..')));

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

// Login POST route for authentication
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Skip authentication if mode is public
    if (securityConfig.mode === "public" || !securityConfig.requireLoginForChanges) {
        req.session.authenticated = true;
        req.session.username = "guest";
        req.session.role = "guest";
        return res.status(200).json({ success: true, message: 'Login successful' });
    }
    
    // Verify credentials
    const users = securityConfig.users || [];
    const user = users.find(u => u.username === username);
    
    if (user) {
        // Hash the provided password for comparison
        const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
        
        if (hashedPassword === user.password) {
            // Set session data
            req.session.authenticated = true;
            req.session.username = username;
            req.session.role = user.role;
            
            logEvent(`User ${username} logged in successfully`);
            return res.status(200).json({ success: true, message: 'Login successful', role: user.role });
        }
    }
    
    // Failed login
    logEvent(`Failed login attempt for username: ${username}`);
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
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
        role: req.session.role || null
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
        }
    });
});

// Main page route
app.get('/', (req, res) => {
    // If security mode is private and login is required, check authentication
    if (securityConfig.mode === "private" && securityConfig.requireLoginForChanges && 
        !(req.session && req.session.authenticated)) {
        return res.redirect('/login');
    }
    
    // Read HTML content
    let htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    
    // Send modified HTML
    res.send(htmlContent);
});

// Health check route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Create HTTP server with Express
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Keep current projects in memory
let projects = {};

// Active connections
let connections = new Set();
let authenticatedConnections = new Map(); // Map to track authenticated WebSocket connections

// Start the server
server.listen(PORT, HOST, () => {
    logEvent(`Server started on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    logEvent(`Local IP address: http://${ip.address()}:${PORT}`);
    
    // Load projects on startup
    loadProjects();
});

// WebSocket connection
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logEvent(`New connection from ${clientIp}`);
    
    // Check if IP is allowed (skip if security mode is public)
    if (securityConfig.mode === "private" && !isAllowedIp(clientIp)) {
        logEvent(`Connection from ${clientIp} denied (not authorized)`);
        
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
    
    // Add connection to list of active connections
    connections.add(ws);
    logEvent(`Connection from ${clientIp} authorized and established`);
    
    // Handle authentication status for the connection
    // Extract session ID from cookies
    const cookies = req.headers.cookie;
    if (cookies) {
        const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('connect.sid='));
        if (sessionCookie) {
            const sessionId = sessionCookie.split('=')[1].trim();
            
            // Track this connection as authenticated if there's a valid session
            // (In a real app, we would verify the session from the store)
            authenticatedConnections.set(ws, { sessionId, authenticated: false });
        }
    }
    
    // Process offline synchronization requests
    ws.on('message', (message) => {
        try {
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
                
                if (authenticatedConnections.has(ws)) {
                    const connInfo = authenticatedConnections.get(ws);
                    connInfo.authenticated = authenticated;
                    authenticatedConnections.set(ws, connInfo);
                    
                    ws.send(JSON.stringify({
                        type: 'auth_status',
                        data: {
                            authenticated: authenticated
                        },
                        timestamp: Date.now()
                    }));
                }
                return;
            }
            
            // Process normal messages
            handleClientMessage(parsedMessage, ws);
        } catch (error) {
            console.error('Error processing client message:', error);
        }
    });
    
    // Send current projects to the new client
    syncProjects(ws);
    
    // Connection closed
    ws.on('close', () => {
        console.log(`Connection from ${clientIp} closed`);
        connections.delete(ws);
        authenticatedConnections.delete(ws);
    });
    
    // Error handling
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientIp}:`, error);
        connections.delete(ws);
        authenticatedConnections.delete(ws);
    });
});

// Check if an IP address is allowed
function isAllowedIp(clientIp) {
    try {
        // If security mode is public, allow all IPs
        if (securityConfig.mode === "public") {
            return true;
        }
        
        // Load configuration
        const config = fileManager.loadJsonSync(CONFIG_FILE);
        
        // If no IP restriction is configured or the list is empty, allow all
        if (!config || !config.allowedIps || config.allowedIps.length === 0) {
            logEvent(`No IP restrictions configured. Allowing all connections.`);
            return true;
        }
        
        // Clean client IP (remove IPv6 prefix)
        const cleanIp = clientIp.replace(/^::ffff:/, '');
        
        // Always allow local IPs
        const localIps = ['127.0.0.1', 'localhost', '::1'];
        if (localIps.includes(cleanIp)) {
            logEvent(`Local IP ${cleanIp} detected. Connection allowed.`);
            return true;
        }
        
        // Check if IP is in the allowed list
        for (const allowedIp of config.allowedIps) {
            // Check if it's a CIDR notation (e.g. 192.168.1.0/24)
            if (allowedIp.includes('/')) {
                if (isIpInCidrRange(cleanIp, allowedIp)) {
                    logEvent(`IP ${cleanIp} is in CIDR range ${allowedIp}. Connection allowed.`);
                    return true;
                }
            } 
            // Exact IP match
            else if (allowedIp === cleanIp) {
                logEvent(`IP ${cleanIp} is in the allowed list. Connection allowed.`);
                return true;
            }
        }
        
        // IP not in the list of allowed IPs
        logEvent(`IP ${cleanIp} is not authorized. Connection denied.`);
        return false;
    } catch (error) {
        logEvent(`Error checking IP restriction: ${error.message}`);
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
    if (authenticatedConnections.has(ws)) {
        return authenticatedConnections.get(ws).authenticated;
    }
    
    return false;
}

// The rest of the functions (loadProjects, syncProjects, handleClientMessage, etc.) remain similar
// but need to be updated to check authentication for write operations

// Load projects from configuration file
function loadProjects() {
    fileManager.loadJson(PROJECTS_FILE)
        .then(data => {
            projects = data || {};
            console.log(`${Object.keys(projects).length} projects loaded`);
        })
        .catch(error => {
            console.error('Error loading projects:', error);
            // Create empty project file if it doesn't exist
            fileManager.saveJson(PROJECTS_FILE, {})
                .then(() => {
                    console.log('Empty project file created');
                    projects = {};
                })
                .catch(err => {
                    console.error('Error creating project file:', err);
                });
        });
}

// Save projects to configuration file
function saveProjects() {
    return fileManager.saveJson(PROJECTS_FILE, projects)
        .then(() => {
            console.log('Projects saved');
            return true;
        })
        .catch(error => {
            console.error('Error saving projects:', error);
            return false;
        });
}

// Send a message to all connected clients except the sender
function broadcastMessage(message, exclude = null) {
    const messageString = JSON.stringify(message);
    
    connections.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

// Send current projects to a client
function syncProjects(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'sync_projects',
            data: projects,
            timestamp: Date.now()
        }));
    }
}

// Process a client message
function handleClientMessage(message, ws) {
    if (!message || !message.type || !message.data) {
        console.error('Invalid client message:', message);
        return;
    }
    
    console.log('Client message received:', message.type);
    
    // Check authentication for write operations
    const isWriteOperation = ['add_project', 'update_project', 'delete_project', 
                              'add_step', 'update_step', 'delete_step'].includes(message.type);
    
    if (isWriteOperation && securityConfig.requireLoginForChanges && !isClientAuthenticated(ws)) {
        // Send an authentication required error
        ws.send(JSON.stringify({
            type: 'error',
            data: {
                message: 'Authentication required to make changes',
                code: 'AUTH_REQUIRED'
            },
            timestamp: Date.now()
        }));
        return;
    }
    
    // Process the message based on its type
    switch (message.type) {
        case 'add_project':
            // Add project
            if (message.data && message.data.id) {
                projects[message.data.id] = message.data;
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'update_project':
            // Update project
            if (message.data && message.data.id && projects[message.data.id]) {
                projects[message.data.id] = message.data;
                saveProjects();
                broadcastMessage(message, ws);
            }
            break;
            
        case 'delete_project':
            // Delete project
            if (message.data && message.data.id && projects[message.data.id]) {
                delete projects[message.data.id];
                saveProjects();
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
                
                // Check if step already exists
                const stepIndex = project.steps.findIndex(step => step.id === message.data.id);
                
                if (stepIndex >= 0) {
                    // Update step
                    project.steps[stepIndex] = message.data;
                } else {
                    // Add step
                    project.steps.push(message.data);
                }
                
                // Update project progress
                updateProjectProgress(project);
                
                saveProjects();
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
                    project.steps.splice(stepIndex, 1);
                    
                    // Update project progress
                    updateProjectProgress(project);
                    
                    saveProjects();
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
}

// Convert an IP address to an integer
function ipToInt(ip) {
    return ip.split('.')
        .reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}