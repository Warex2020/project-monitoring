/**
 * configManager.js - Manages dashboard configuration
 */

const ConfigManager = (() => {
    // Config cache
    let dashboardConfig = null;
    
    // Initialize
    const init = async () => {
        try {
            // Load dashboard configuration from API
            const response = await fetch('/api/dashboard-config');
            dashboardConfig = await response.json();
            
            // Update document title
            if (dashboardConfig.title) {
                document.title = dashboardConfig.title;
            }
            
            // Update UI with config values
            updateUI();
            
            console.log('Dashboard config loaded:', dashboardConfig);
            return dashboardConfig;
        } catch (error) {
            console.error('Error loading dashboard config:', error);
            return null;
        }
    };
    
    // Update UI elements with configuration values
    const updateUI = () => {
        if (!dashboardConfig) return;
        
        // Update header title and subtitle
        const headerTitle = document.getElementById('header-title');
        const headerSubtitle = document.getElementById('header-subtitle');
        
        if (headerTitle && dashboardConfig.title) {
            headerTitle.textContent = dashboardConfig.title;
        }
        
        if (headerSubtitle && dashboardConfig.subtitle) {
            headerSubtitle.textContent = dashboardConfig.subtitle;
        }
    };
    
    // Get the dashboard configuration
    const getConfig = () => {
        return dashboardConfig;
    };
    
    // Get a specific config value
    const getValue = (path, defaultValue = null) => {
        if (!dashboardConfig) return defaultValue;
        
        const keys = path.split('.');
        let value = dashboardConfig;
        
        for (const key of keys) {
            if (value === null || value === undefined || typeof value !== 'object') {
                return defaultValue;
            }
            
            value = value[key];
            
            if (value === undefined) {
                return defaultValue;
            }
        }
        
        return value !== undefined ? value : defaultValue;
    };
    
    // Get title
    const getTitle = () => {
        return getValue('title', 'IT-Projekt-Monitoring');
    };
    
    // Get subtitle
    const getSubtitle = () => {
        return getValue('subtitle', 'Dashboard für IT-Abteilung');
    };
    
    // Check if dashboard is in public mode
    const isPublicMode = () => {
        return getValue('security.mode', 'private') === 'public';
    };
    
    // Check if login is required for changes
    const isLoginRequired = () => {
        return getValue('security.requireLoginForChanges', false);
    };
    
    // Public API
    return {
        init,
        getConfig,
        getValue,
        getTitle,
        getSubtitle,
        isPublicMode,
        isLoginRequired
    };
})();

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize config manager
    ConfigManager.init();
});