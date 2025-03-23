/**
 * main.js - Main script for UI interactions
 * Version 1.3.1 - Fixed event handling and authentication
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
            console.log('Authentication initialized:', authStatus);
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
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString('de-DE', options);
    }
    
    // Format time
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString('de-DE');
    }
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
                    // Show notification if available
                    if (typeof OfflineManager !== 'undefined' && 
                        typeof OfflineManager.showNotification === 'function') {
                        OfflineManager.showNotification('Authentication required to create projects', 'error');
                    }
                    
                    // Redirect to login if authentication is required
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 1500);
                    return;
                }
            }
            
            // Reset form
            const projectForm = document.getElementById('project-form');
            if (projectForm) {
                projectForm.reset();
            }
            
            const projectIdField = document.getElementById('project-id');
            if (projectIdField) {
                projectIdField.value = '';
            }
            
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) {
                modalTitle.textContent = 'New Project';
            }
            
            // Show modal
            const modal = document.getElementById('project-modal');
            if (modal) {
                modal.style.display = 'block';
            }
        });
    }

    // Event handlers for closing modals
    document.querySelectorAll('.close-modal').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
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
                steps: isNewProject ? [] : getProjectSteps(projectId)
            };
            
            if (isNewProject) {
                if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.addProject === 'function') {
                    ProjectManager.addProject(formData);
                }
                if (typeof sendWebSocketMessage === 'function') {
                    sendWebSocketMessage('add_project', formData);
                }
            } else {
                if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.updateProject === 'function') {
                    ProjectManager.updateProject(formData);
                }
                if (typeof sendWebSocketMessage === 'function') {
                    sendWebSocketMessage('update_project', formData);
                }
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
            
            // Add due date if available
            const dueDateElement = document.getElementById('step-due-date');
            if (dueDateElement && dueDateElement.value) {
                formData.dueDate = dueDateElement.value;
            }
            
            // Add priority if available
            const priorityElement = document.getElementById('step-priority');
            if (priorityElement) {
                formData.priority = priorityElement.value;
            }
            
            // Add assigned person if available
            const assignedToElement = document.getElementById('step-assigned-to');
            if (assignedToElement && assignedToElement.value) {
                formData.assignedTo = assignedToElement.value;
            }
            
            if (isNewStep) {
                if (typeof TodoManager !== 'undefined' && typeof TodoManager.addStep === 'function') {
                    TodoManager.addStep(projectId, formData);
                }
                if (typeof sendWebSocketMessage === 'function') {
                    sendWebSocketMessage('add_step', formData);
                }
            } else {
                if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateStep === 'function') {
                    TodoManager.updateStep(projectId, formData);
                }
                if (typeof sendWebSocketMessage === 'function') {
                    sendWebSocketMessage('update_step', formData);
                }
            }
            
            document.getElementById('step-modal').style.display = 'none';
        });
    }

    // Delegate events for dynamically created elements
    const projectsContainer = document.getElementById('projects-container');
    if (projectsContainer) {
        projectsContainer.addEventListener('click', handleProjectContainerClicks);
    }

    // Direkter Event-Handler für Checkbox-Klicks
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('step-checkbox')) {
            console.log("Direct checkbox click detected");
            
            // Finde Projekt und Schritt
            const stepItem = e.target.closest('.step-item');
            const projectCard = e.target.closest('.project-card');
            
            if (stepItem && projectCard && stepItem.dataset.stepId && projectCard.dataset.project) {
                const stepId = stepItem.dataset.stepId;
                const projectId = projectCard.dataset.project;
                
                console.log(`Processing direct checkbox click for step ${stepId} in project ${projectId}`);
                
                // Verhindere, dass das Event zum allgemeinen Click-Handler propagiert
                e.stopPropagation();
                
                // Prüfe Authentifizierung und toggle den Step
                if (checkAuthBeforeAction()) {
                    toggleStepCompletion(projectId, stepId);
                }
            }
        }
    });

}

// Helper function to get steps for a project
function getProjectSteps(projectId) {
    if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
        const project = ProjectManager.getProject(projectId);
        if (project && project.steps) {
            return project.steps;
        }
    }
    return [];
}

// Handles clicks within the project container (event delegation)
function handleProjectContainerClicks(e) {
    // Find the project card containing the clicked element
    const projectCard = e.target.closest('.project-card');
    if (!projectCard) return;

    const projectId = projectCard.dataset.project;
    if (!projectId) return;
    
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
        console.log("Edit step icon clicked");
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            const stepItem = e.target.closest('.step-item');
            if (stepItem && stepItem.dataset.stepId) {
                const stepId = stepItem.dataset.stepId;
                console.log(`Editing step ${stepId} in project ${projectId}`);
                editStep(projectId, stepId);
            } else {
                console.error("Could not find step item or step ID");
            }
        }
        return;
    }
    
    // Checkbox for step completion
    if (e.target.classList.contains('step-checkbox')) {
        console.log("Step checkbox clicked");
        // Check authentication if required
        if (checkAuthBeforeAction()) {
            const stepItem = e.target.closest('.step-item');
            if (stepItem && stepItem.dataset.stepId) {
                const stepId = stepItem.dataset.stepId;
                console.log(`Processing click for step ${stepId} in project ${projectId}`);
                toggleStepCompletion(projectId, stepId);
            } else {
                console.error("Could not find step item or step ID");
            }
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
    let project = null;
    
    // Get project data
    if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
        project = ProjectManager.getProject(projectId);
    }
    
    if (!project) {
        console.error(`Project with ID ${projectId} not found`);
        return;
    }
    
    console.log('Editing project:', project);
    
    // Fill form with project data
    const idField = document.getElementById('project-id');
    if (idField) {
        idField.value = projectId;
    }
    
    const titleField = document.getElementById('project-title');
    if (titleField) {
        titleField.value = project.title || '';
    }
    
    const statusField = document.getElementById('project-status');
    if (statusField) {
        statusField.value = project.status || 'on-track';
    }
    
    const progressField = document.getElementById('project-progress');
    if (progressField) {
        progressField.value = project.progress || 0;
    }
    
    const nextStepField = document.getElementById('project-next-step');
    if (nextStepField) {
        nextStepField.value = project.nextStep || '';
    }
    
    const teamField = document.getElementById('project-team');
    if (teamField) {
        teamField.value = project.team ? project.team.join(', ') : '';
    }
    
    const deadlineField = document.getElementById('project-deadline');
    if (deadlineField) {
        deadlineField.value = project.deadline || '';
    }
    
    // Adjust modal title and display
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = 'Edit Project';
    }
    
    const projectModal = document.getElementById('project-modal');
    if (projectModal) {
        projectModal.style.display = 'block';
    }
}

// Opens the modal to add a step
function addStep(projectId) {
    // Reset form
    const stepForm = document.getElementById('step-form');
    if (stepForm) {
        stepForm.reset();
    }
    
    const stepIdField = document.getElementById('step-id');
    if (stepIdField) {
        stepIdField.value = '';
    }
    
    const stepProjectIdField = document.getElementById('step-project-id');
    if (stepProjectIdField) {
        stepProjectIdField.value = projectId;
    }
    
    // Adjust modal title and display
    const stepModalTitle = document.getElementById('step-modal-title');
    if (stepModalTitle) {
        stepModalTitle.textContent = 'New Step';
    }
    
    const stepModal = document.getElementById('step-modal');
    if (stepModal) {
        stepModal.style.display = 'block';
    }
}

// Opens the modal to edit a step
function editStep(projectId, stepId) {
    let step = null;
    
    // Get step data
    if (typeof TodoManager !== 'undefined' && typeof TodoManager.getStep === 'function') {
        step = TodoManager.getStep(projectId, stepId);
    }
    
    if (!step) {
        console.error(`Step with ID ${stepId} not found in project ${projectId}`);
        return;
    }
    
    console.log('Editing step:', step);
    
    // Fill form with step data
    const idField = document.getElementById('step-id');
    if (idField) {
        idField.value = stepId;
    }
    
    const projectIdField = document.getElementById('step-project-id');
    if (projectIdField) {
        projectIdField.value = projectId;
    }
    
    const titleField = document.getElementById('step-title');
    if (titleField) {
        titleField.value = step.title || '';
    }
    
    const descriptionField = document.getElementById('step-description');
    if (descriptionField) {
        descriptionField.value = step.description || '';
    }
    
    const completedField = document.getElementById('step-completed');
    if (completedField) {
        completedField.checked = step.completed || false;
    }
    
    // Fill additional fields if available
    const dueDateField = document.getElementById('step-due-date');
    if (dueDateField && step.dueDate) {
        dueDateField.value = step.dueDate;
    }
    
    const priorityField = document.getElementById('step-priority');
    if (priorityField && step.priority) {
        priorityField.value = step.priority;
    }
    
    const assignedToField = document.getElementById('step-assigned-to');
    if (assignedToField && step.assignedTo) {
        assignedToField.value = step.assignedTo;
    }
    
    // Adjust modal title and display
    const modalTitle = document.getElementById('step-modal-title');
    if (modalTitle) {
        modalTitle.textContent = 'Edit Step';
    }
    
    const stepModal = document.getElementById('step-modal');
    if (stepModal) {
        stepModal.style.display = 'block';
    }
}

// Toggles the completion status of a step
function toggleStepCompletion(projectId, stepId) {
    console.log(`Attempting to toggle step completion for step ${stepId} in project ${projectId}`);
    
    if (!projectId || !stepId) {
        console.error("Invalid project or step ID");
        return;
    }
    
    try {
        // Get the step data
        let step = null;
        
        if (typeof TodoManager !== 'undefined' && typeof TodoManager.getStep === 'function') {
            step = TodoManager.getStep(projectId, stepId);
        } else {
            // Fallback: Try to get step directly from the ProjectManager
            const project = ProjectManager.getProject(projectId);
            if (project && project.steps) {
                step = project.steps.find(s => s.id === stepId);
            }
        }
        
        if (!step) {
            console.error(`Step ${stepId} not found in project ${projectId}`);
            return;
        }
        
        console.log("Current step state:", step);
        
        // Toggle completion status
        step.completed = !step.completed;
        
        // Update the step through TodoManager if available
        if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateStep === 'function') {
            TodoManager.updateStep(projectId, step);
        } else {
            // Fallback: Update directly in ProjectManager
            const project = ProjectManager.getProject(projectId);
            if (project && project.steps) {
                const stepIndex = project.steps.findIndex(s => s.id === stepId);
                if (stepIndex >= 0) {
                    project.steps[stepIndex] = step;
                    ProjectManager.updateProject(project);
                }
            }
        }
        
        // Update UI
        const stepElement = document.querySelector(`.step-item[data-step-id="${stepId}"]`);
        if (stepElement) {
            if (step.completed) {
                stepElement.classList.add('step-completed');
                stepElement.querySelector('.step-checkbox').setAttribute('aria-checked', 'true');
            } else {
                stepElement.classList.remove('step-completed');
                stepElement.querySelector('.step-checkbox').setAttribute('aria-checked', 'false');
            }
        }
        
        // Send WebSocket message
        if (typeof sendWebSocketMessage === 'function') {
            console.log("Sending WebSocket message for step update");
            sendWebSocketMessage('update_step', step);
        }
    } catch (error) {
        console.error("Error toggling step completion:", error);
    }
}


// Toggles the project steps display
function toggleProjectSteps(projectCard) {
    if (!projectCard) return;
    
    const stepsContainer = projectCard.querySelector('.project-steps');
    if (!stepsContainer) return;
    
    // Toggle expanded class
    projectCard.classList.toggle('expanded');
    
    // Update ARIA attributes
    const toggleIcon = projectCard.querySelector('.toggle-icon');
    if (toggleIcon) {
        const isExpanded = projectCard.classList.contains('expanded');
        toggleIcon.setAttribute('aria-expanded', isExpanded);
    }
    
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
    if (!element) return;
    
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
    if (!element) return;
    
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


/**
 * Diese einfache Lösung funktioniert oft am besten, wenn es Konflikte gibt.
 * Füge diesen Code ans Ende der Datei main.js hinzu, außerhalb
 * aller Funktionen (im globalen Scope)
 */

// Direkter Event-Handler für Checkboxen, der alle anderen übertrumpft
/**
 * Verbesserung im Checkbox-Click-Handler für zuverlässigeres WebSocket-Update
 * Füge diesen verbesserten Code zu deiner main.js hinzu
 */

// Verbessere den bestehenden Click-Handler mit robusterem WebSocket-Update
document.addEventListener('DOMContentLoaded', () => {
    // Warte bis alle anderen Handler geladen sind
    setTimeout(() => {
        // Direkter Event-Handler für Checkbox-Klicks
        document.addEventListener('click', (e) => {
            // Wenn eine Checkbox geklickt wurde
            if (e.target.classList.contains('step-checkbox')) {
                console.log("Direct checkbox click intercepted");
                
                // Verhindern, dass das Event weitergeleitet wird
                e.stopPropagation();
                e.preventDefault();
                
                // Finde Projekt und Schritt
                const stepItem = e.target.closest('.step-item');
                const projectCard = e.target.closest('.project-card');
                
                if (stepItem && projectCard && stepItem.dataset.stepId && projectCard.dataset.project) {
                    const stepId = stepItem.dataset.stepId;
                    const projectId = projectCard.dataset.project;
                    
                    console.log(`Direct handling: Checkbox click for step ${stepId} in project ${projectId}`);
                    
                    // Toggle Schritt-Status direkt im DOM
                    const isNowCompleted = !stepItem.classList.contains('step-completed');
                    if (isNowCompleted) {
                        stepItem.classList.add('step-completed');
                        e.target.setAttribute('aria-checked', 'true');
                    } else {
                        stepItem.classList.remove('step-completed');
                        e.target.setAttribute('aria-checked', 'false');
                    }
                    
                    // Erstelle ein Update-Objekt für den Schritt
                    let updatedStep = null;
                    
                    // Versuche zuerst, den Schritt über TodoManager zu bekommen
                    if (typeof TodoManager !== 'undefined' && typeof TodoManager.getStep === 'function') {
                        updatedStep = TodoManager.getStep(projectId, stepId);
                    }
                    
                    // Alternativ aus dem ProjectManager holen
                    if (!updatedStep && typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                        const project = ProjectManager.getProject(projectId);
                        if (project && project.steps) {
                            updatedStep = project.steps.find(s => s.id === stepId);
                        }
                    }
                    
                    if (updatedStep) {
                        // Toggle Completed-Status
                        updatedStep.completed = isNowCompleted;
                        
                        // Timestamp für Server-Update hinzufügen
                        updatedStep.updatedAt = new Date().toISOString();
                        
                        // Sicherstellen, dass projectId gesetzt ist
                        updatedStep.projectId = projectId;
                        
                        console.log("Prepared step update:", updatedStep);
                        
                        // Update über TodoManager, wenn verfügbar
                        if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateStep === 'function') {
                            TodoManager.updateStep(projectId, updatedStep);
                        }
                        
                        // Update auch direkt im ProjectManager
                        if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                            const project = ProjectManager.getProject(projectId);
                            if (project && project.steps) {
                                const stepIndex = project.steps.findIndex(s => s.id === stepId);
                                if (stepIndex >= 0) {
                                    project.steps[stepIndex] = updatedStep;
                                    
                                    // Aktualisiere das Projekt
                                    ProjectManager.updateProject(project);
                                }
                            }
                        }
                        
                        // WICHTIG: Explizites WebSocket-Update senden
                        if (typeof window.sendWebSocketMessage === 'function') {
                            console.log("Sending WebSocket update for step:", updatedStep);
                            // Sende update_step Nachricht mit dem vollständigen Schritt-Objekt
                            window.sendWebSocketMessage('update_step', updatedStep);
                        } else {
                            console.error("sendWebSocketMessage function not available!");
                        }
                    } else {
                        console.error("Could not find step data for update");
                    }
                }
            }
        }, true); // true für capturing-Phase, um vor allen anderen Handlern auszuführen
        
        console.log("Direct checkbox handler with improved WebSocket updates installed");
    }, 1000);
});