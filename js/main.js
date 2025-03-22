/**
 * main.js - Main script for UI interactions
 * Version 1.3.0
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Load configuration first
    await initConfig();
    
    // Initialize date and time
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Initialize event handlers
    initEventHandlers();

    // Connect to WebSocket
    connectWebSocket();

    // Check authentication status
    await initAuth();

    // Load projects
    loadProjects();
});

// Initializes the configuration
async function initConfig() {
    try {
        // Check if ConfigManager is available
        if (typeof ConfigManager !== 'undefined' && typeof ConfigManager.init === 'function') {
            const config = await ConfigManager.init();
            console.log('Configuration loaded');
            return config;
        }
        return null;
    } catch (error) {
        console.error('Error initializing configuration:', error);
        return null;
    }
}

// Initializes authentication
async function initAuth() {
    try {
        // Check if AuthManager is available
        if (typeof AuthManager !== 'undefined' && typeof AuthManager.init === 'function') {
            const authStatus = await AuthManager.init();
            console.log('Authentication initialized');
            return authStatus;
        }
        return null;
    } catch (error) {
        console.error('Error initializing authentication:', error);
        return null;
    }
}

// Updates date and time
function updateDateTime() {
    const now = new Date();
    
    // Format date
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const dateElement = document.getElementById('current-date');
    dateElement.textContent = now.toLocaleDateString('de-DE', options);
    
    // Format time
    const timeElement = document.getElementById('current-time');
    timeElement.textContent = now.toLocaleTimeString('de-DE');
}

// Initializes event handlers for UI elements
function initEventHandlers() {
    // Event handler for "New Project" button
    const addProjectBtn = document.getElementById('add-project-btn');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => {
            // Check authentication if required
            if (typeof AuthManager !== 'undefined' && 
                typeof AuthManager.isAuthRequired === 'function' && 
                typeof AuthManager.isAuthenticated === 'function') {
                
                if (AuthManager.isAuthRequired() && !AuthManager.isAuthenticated()) {
                    // Redirect to login if authentication is required
                    window.location.href = '/login';
                    return;
                }
            }
            
            // Reset form
            document.getElementById('project-form').reset();
            document.getElementById('project-id').value = '';
            document.getElementById('modal-title').textContent = 'New Project';
            
            // Show modal
            const modal = document.getElementById('project-modal');
            modal.style.display = 'block';
        });
    }

    // Event handlers for closing modals
    document.querySelectorAll('.close-modal').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        document.querySelectorAll('.modal').forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Event handler for project form
    const projectForm = document.getElementById('project-form');
    if (projectForm) {
        projectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const projectId = document.getElementById('project-id').value;
            const isNewProject = !projectId;
            
            const formData = {
                id: isNewProject ? generateUniqueId() : projectId,
                title: document.getElementById('project-title').value,
                status: document.getElementById('project-status').value,
                progress: parseInt(document.getElementById('project-progress').value),
                nextStep: document.getElementById('project-next-step').value,
                team: document.getElementById('project-team').value.split(',').map(i => i.trim()).filter(i => i),
                deadline: document.getElementById('project-deadline').value,
                steps: isNewProject ? [] : ProjectManager.getProject(projectId).steps
            };
            
            if (isNewProject) {
                ProjectManager.addProject(formData);
                sendWebSocketMessage('add_project', formData);
            } else {
                ProjectManager.updateProject(formData);
                sendWebSocketMessage('update_project', formData);
            }
            
            document.getElementById('project-modal').style.display = 'none';
        });
    }
    
    // Event handler for steps form
    const stepForm = document.getElementById('step-form');
    if (stepForm) {
        stepForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const projectId = document.getElementById('step-project-id').value;
            const stepId = document.getElementById('step-id').value;
            const isNewStep = !stepId;
            
            const formData = {
                id: isNewStep ? generateUniqueId() : stepId,
                projectId: projectId,
                title: document.getElementById('step-title').value,
                description: document.getElementById('step-description').value,
                completed: document.getElementById('step-completed').checked
            };
            
            if (isNewStep) {
                TodoManager.addStep(projectId, formData);
                sendWebSocketMessage('add_step', formData);
            } else {
                TodoManager.updateStep(projectId, formData);
                sendWebSocketMessage('update_step', formData);
            }
            
            document.getElementById('step-modal').style.display = 'none';
        });
    }

    // Delegate events for dynamically created elements
    const projectsContainer = document.getElementById('projects-container');
    if (projectsContainer) {
        projectsContainer.addEventListener('click', handleProjectContainerClicks);
    }
}

// Handles clicks within the project container (event delegation)
function handleProjectContainerClicks(e) {
    const projectCard = e.target.closest('.project-card');
    if (!projectCard) return;

    const projectId = projectCard.dataset.project;
    
    // Edit a project
    if (e.target.classList.contains('edit-icon')) {
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            editProject(projectId);
        }
        return;
    }
    
    // Add a step
    if (e.target.classList.contains('add-step-icon')) {
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            addStep(projectId);
        }
        return;
    }
    
    // Edit a step
    if (e.target.classList.contains('edit-step-icon')) {
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            const stepItem = e.target.closest('.step-item');
            const stepId = stepItem.dataset.stepId;
            editStep(projectId, stepId);
        }
        return;
    }
    
    // Checkbox for step completion
    if (e.target.classList.contains('step-checkbox')) {
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            const stepItem = e.target.closest('.step-item');
            const stepId = stepItem.dataset.stepId;
            toggleStepCompletion(projectId, stepId);
        }
        return;
    }
    
    // Toggle for project steps (only if not clicked on an action icon)
    if (!e.target.closest('.action-icons') && !e.target.closest('.step-actions')) {
        toggleProjectSteps(projectCard);
    }
}

// Checks authentication before performing an action
function checkAuthBeforeAction() {
    if (typeof AuthManager !== 'undefined' && 
        typeof AuthManager.isAuthRequired === 'function' && 
        typeof AuthManager.isAuthenticated === 'function') {
        
        if (AuthManager.isAuthRequired() && !AuthManager.isAuthenticated()) {
            // Show notification if offline manager is available
            if (typeof OfflineManager !== 'undefined' && 
                typeof OfflineManager.showNotification === 'function') {
                OfflineManager.showNotification('Authentication required to make changes', 'error');
            }
            
            // Redirect to login
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            
            return false;
        }
    }
    return true;
}

// Opens the modal to edit a project
function editProject(projectId) {
    const project = ProjectManager.getProject(projectId);
    if (!project) return;
    
    // Fill form with project data
    document.getElementById('project-id').value = projectId;
    document.getElementById('project-title').value = project.title;
    document.getElementById('project-status').value = project.status;
    document.getElementById('project-progress').value = project.progress;
    document.getElementById('project-next-step').value = project.nextStep;
    document.getElementById('project-team').value = project.team.join(', ');
    document.getElementById('project-deadline').value = project.deadline;
    
    // Adjust modal title and display
    document.getElementById('modal-title').textContent = 'Edit Project';
    document.getElementById('project-modal').style.display = 'block';
}

// Opens the modal to add a step
function addStep(projectId) {
    // Reset form
    document.getElementById('step-form').reset();
    document.getElementById('step-id').value = '';
    document.getElementById('step-project-id').value = projectId;
    
    // Adjust modal title and display
    document.getElementById('step-modal-title').textContent = 'New Step';
    document.getElementById('step-modal').style.display = 'block';
}

// Opens the modal to edit a step
function editStep(projectId, stepId) {
    const step = TodoManager.getStep(projectId, stepId);
    if (!step) return;
    
    // Fill form with step data
    document.getElementById('step-id').value = stepId;
    document.getElementById('step-project-id').value = projectId;
    document.getElementById('step-title').value = step.title;
    document.getElementById('step-description').value = step.description;
    document.getElementById('step-completed').checked = step.completed;
    
    // Adjust modal title and display
    document.getElementById('step-modal-title').textContent = 'Edit Step';
    document.getElementById('step-modal').style.display = 'block';
}

// Toggles the completion status of a step
function toggleStepCompletion(projectId, stepId) {
    const step = TodoManager.getStep(projectId, stepId);
    if (!step) return;
    
    // Invert completed status
    step.completed = !step.completed;
    
    // Update the step
    TodoManager.updateStep(projectId, step);
    
    // Send update via WebSocket
    sendWebSocketMessage('update_step', step);
}

// Toggles the project steps display
function toggleProjectSteps(projectCard) {
    const projectId = projectCard.dataset.project;
    const stepsContainer = projectCard.querySelector('.project-steps');
    
    // Toggle expanded class
    projectCard.classList.toggle('expanded');
    
    // Animated expand/collapse
    if (stepsContainer.classList.contains('active')) {
        // Collapse with animation
        stepsContainer.style.maxHeight = '0';
        stepsContainer.style.padding = '0';
        stepsContainer.style.marginTop = '0';
        
        setTimeout(() => {
            stepsContainer.classList.remove('active');
        }, 400);
    } else {
        // Expand with animation
        stepsContainer.classList.add('active');
        stepsContainer.style.maxHeight = stepsContainer.scrollHeight + 40 + 'px';
        stepsContainer.style.padding = '20px';
        stepsContainer.style.marginTop = '25px';
    }
}

// Generates a unique ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Fades out an element with smooth animation and proper grid reflow
 * @param {HTMLElement} element - Element to fade out
 */
const fadeOutElement = (element) => {
    // Store original dimensions for smoother animation
    const originalHeight = element.offsetHeight;
    const originalWidth = element.offsetWidth;
    const originalMarginBottom = parseInt(window.getComputedStyle(element).marginBottom);
    
    // First set up the transition properties - make sure transition is longer for smoother effect
    element.style.transition = 'opacity 0.8s ease, max-height 1.2s ease, transform 1s ease, margin 1s ease, padding 1s ease';
    
    // Start the visual fade by reducing opacity first
    element.style.opacity = '0';
    element.style.transform = 'scale(0.95)';
    
    // After the initial fade starts, begin the size reduction
    setTimeout(() => {
        // Set max-height for animation (instead of height which doesn't animate well)
        element.style.maxHeight = originalHeight + 'px';
        element.style.overflow = 'hidden';
        
        // Begin the collapse animation
        setTimeout(() => {
            element.style.maxHeight = '0';
            element.style.marginBottom = '0';
            element.style.marginTop = '0';
            element.style.paddingTop = '0';
            element.style.paddingBottom = '0';
            
            // After the animation completes, set grid properties to properly remove from flow
            setTimeout(() => {
                // This properly removes the element from grid flow while maintaining
                // the ability to restore it later
                element.style.display = 'none';
                
                // Trigger grid reflow by notifying the layout system
                triggerGridReflow();
            }, 1000); // Match this with the max transition duration
        }, 100);
    }, 100);
};

/**
 * Fades in an element with smooth animation
 * @param {HTMLElement} element - Element to fade in
 */
const fadeInElement = (element) => {
    // Make sure display is set to block/grid-item to bring back into layout flow
    element.style.display = '';
    
    // Set initial state for animation
    element.style.opacity = '0';
    element.style.maxHeight = '0';
    element.style.overflow = 'hidden';
    element.style.transform = 'scale(0.95)';
    
    // Trigger a reflow before starting animation
    void element.offsetWidth;
    
    // Set transition properties - longer durations for smoother effect
    element.style.transition = 'opacity 1s ease, max-height 1s ease, transform 1.2s ease, margin 0.8s ease, padding 0.8s ease';
    
    // Begin restoring dimensions
    requestAnimationFrame(() => {
        element.style.maxHeight = '2000px'; // Set to a value larger than any possible content
        element.style.marginBottom = '';
        element.style.marginTop = '';
        element.style.paddingTop = '';
        element.style.paddingBottom = '';
        
        // Fade in after dimensions start changing
        setTimeout(() => {
            element.style.opacity = '1';
            element.style.transform = 'scale(1)';
            
            // Clean up styles after animation completes
            setTimeout(() => {
                element.style.maxHeight = '';
                element.style.overflow = '';
                element.style.transition = '';
                
                // Trigger final grid reflow
                triggerGridReflow();
            }, 1000);
        }, 100);
    });
};

/**
 * Triggers a reflow of the grid layout
 */
const triggerGridReflow = () => {
    const projectsGrid = document.getElementById('projects-container');
    if (projectsGrid) {
        // Force a reflow by briefly modifying a layout property
        const currentStyle = projectsGrid.style.display;
        projectsGrid.style.display = 'none';
        void projectsGrid.offsetHeight; // Trigger reflow
        projectsGrid.style.display = currentStyle;
        
        // For Bootstrap grid, this extra step may help force column recalculation
        const gridItems = projectsGrid.querySelectorAll('.project-card');
        gridItems.forEach(item => {
            if (item.style.display !== 'none') {
                item.classList.remove('d-none');
            }
        });
    }
};