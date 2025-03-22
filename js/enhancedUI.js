/**
 * enhancedUI.js - Enhanced UI functions for the dashboard
 * Version 1.3.0 - Bootstrap Integration
 */

const EnhancedUI = (() => {
    // Caching DOM elements
    let projectsContainer = null;
    let filterSelect = null;
    let sortSelect = null;
    let ganttViewButton = null;
    let hideCompletedCheckbox = null;
    
    // State
    let isDragging = false;
    let draggedElement = null;
    let hideCompleted = false;
    let currentSort = {field: 'deadline', direction: 'asc'};
    let currentFilter = null;
    
    // Initializes enhanced UI functions
    const init = () => {
        // Cache DOM elements
        projectsContainer = document.getElementById('projects-container');
        filterSelect = document.getElementById('project-filter');
        sortSelect = document.getElementById('project-sort');
        ganttViewButton = document.getElementById('gantt-view-btn');
        hideCompletedCheckbox = document.getElementById('hide-completed');
        
        // Add event listeners
        addEventListeners();
        
        // Apply initial sorting
        applySort();
        
        console.log('EnhancedUI initialized with Bootstrap integration');
    };

    // Adds event listeners for drag-and-drop and other interactions
    const addEventListeners = () => {
        // Event listeners for filter/sort controls
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                currentFilter = filterSelect.value;
                applyFilter();
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                const [field, direction] = sortSelect.value.split('-');
                currentSort = {field, direction};
                applySort();
            });
        }
        
        if (hideCompletedCheckbox) {
            hideCompletedCheckbox.addEventListener('change', () => {
                hideCompleted = hideCompletedCheckbox.checked;
                applyHideCompleted();
            });
        }
        
        if (ganttViewButton) {
            ganttViewButton.addEventListener('click', toggleGanttView);
        }
        
        // Delegated event listener for drag-and-drop
        if (projectsContainer) {
            projectsContainer.addEventListener('mousedown', handleDragStart);
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('mouseup', handleDragEnd);
            
            // Add touch events for mobile devices
            projectsContainer.addEventListener('touchstart', handleTouchStart, {passive: false});
            document.addEventListener('touchmove', handleTouchMove, {passive: false});
            document.addEventListener('touchend', handleTouchEnd);
        }
        
        // Watch for DOM changes to initialize drag-and-drop for new elements
        if (projectsContainer) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        initDraggableItems();
                    }
                });
            });
            
            observer.observe(projectsContainer, { childList: true, subtree: true });
            
            // Initialize drag-and-drop for existing elements
            initDraggableItems();
        }
    };
    
    // Initialize drag-and-drop for project steps
    const initDraggableItems = () => {
        // Make all project steps draggable
        document.querySelectorAll('.step-item').forEach(stepItem => {
            if (!stepItem.getAttribute('draggable')) {
                stepItem.setAttribute('draggable', 'true');
                
                // Visual feedback for drag-and-drop
                stepItem.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', stepItem.dataset.stepId);
                    stepItem.classList.add('dragging');
                });
                
                stepItem.addEventListener('dragend', () => {
                    stepItem.classList.remove('dragging');
                });
            }
        });
        
        // Make all projects drop targets
        document.querySelectorAll('.project-steps').forEach(stepsContainer => {
            stepsContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const dragTarget = getDragTarget(e.clientY, stepsContainer);
                resetDropTargets();
                
                if (dragTarget) {
                    dragTarget.classList.add('drop-target');
                }
            });
            
            stepsContainer.addEventListener('dragleave', () => {
                resetDropTargets();
            });
            
            stepsContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                const stepId = e.dataTransfer.getData('text/plain');
                const dragTarget = getDragTarget(e.clientY, stepsContainer);
                
                if (dragTarget && stepId) {
                    handleStepDrop(stepId, dragTarget, stepsContainer);
                }
                
                resetDropTargets();
            });
        });
    };
    
    // Handler for drag start (mouse)
    const handleDragStart = (e) => {
        // Only steps are draggable, not the projects themselves
        const stepItem = e.target.closest('.step-item');
        if (!stepItem) return;
        
        // Prevent text selection during drag
        e.preventDefault();
        
        isDragging = true;
        draggedElement = stepItem;
        
        // Visual feedback
        stepItem.classList.add('dragging');
        
        // Store cursor position within the element
        const rect = stepItem.getBoundingClientRect();
        stepItem.dragOffsetX = e.clientX - rect.left;
        stepItem.dragOffsetY = e.clientY - rect.top;
        
        // Create ghost drag element
        const clone = stepItem.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.opacity = '0.5';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '1000';
        clone.style.width = rect.width + 'px';
        clone.id = 'drag-ghost';
        
        document.body.appendChild(clone);
        
        // Update ghost position
        updateDragGhostPosition(e.clientX, e.clientY);
    };
    
    // Handler for touch start (touch devices)
    const handleTouchStart = (e) => {
        const stepItem = e.target.closest('.step-item');
        if (!stepItem) return;
        
        // Only for steps, not for projects
        if (stepItem) {
            e.preventDefault(); // Prevent scrolling
            
            const touch = e.touches[0];
            
            isDragging = true;
            draggedElement = stepItem;
            
            // Visual feedback
            stepItem.classList.add('dragging');
            
            // Store touch position within the element
            const rect = stepItem.getBoundingClientRect();
            stepItem.dragOffsetX = touch.clientX - rect.left;
            stepItem.dragOffsetY = touch.clientY - rect.top;
            
            // Create ghost drag element
            const clone = stepItem.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.opacity = '0.5';
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '1000';
            clone.style.width = rect.width + 'px';
            clone.id = 'drag-ghost';
            
            document.body.appendChild(clone);
            
            // Update ghost position
            updateDragGhostPosition(touch.clientX, touch.clientY);
        }
    };
    
    // Handler for drag move (mouse)
    const handleDragMove = (e) => {
        if (!isDragging || !draggedElement) return;
        
        updateDragGhostPosition(e.clientX, e.clientY);
        
        // Find the target container under the cursor
        const dropContainer = getDropContainerAtPoint(e.clientX, e.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(e.clientY, dropContainer);
            
            // Reset visual feedback
            resetDropTargets();
            
            // Visual feedback for current target
            if (dragTarget) {
                dragTarget.classList.add('drop-target');
            }
        } else {
            resetDropTargets();
        }
    };
    
    // Handler for touch move (touch devices)
    const handleTouchMove = (e) => {
        if (!isDragging || !draggedElement) return;
        
        e.preventDefault(); // Prevent scrolling
        
        const touch = e.touches[0];
        
        updateDragGhostPosition(touch.clientX, touch.clientY);
        
        // Find the target container under the touch point
        const dropContainer = getDropContainerAtPoint(touch.clientX, touch.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(touch.clientY, dropContainer);
            
            // Reset visual feedback
            resetDropTargets();
            
            // Visual feedback for current target
            if (dragTarget) {
                dragTarget.classList.add('drop-target');
            }
        } else {
            resetDropTargets();
        }
    };
    
    // Handler for drag end (mouse)
    const handleDragEnd = (e) => {
        if (!isDragging) return;
        
        // Find the target container under the cursor
        const dropContainer = getDropContainerAtPoint(e.clientX, e.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(e.clientY, dropContainer);
            
            if (dragTarget && draggedElement) {
                // Process the drop
                handleStepDrop(draggedElement.dataset.stepId, dragTarget, dropContainer);
            }
        }
        
        // Clean up the drag state
        cleanupDrag();
    };
    
    // Handler for touch end (touch devices)
    const handleTouchEnd = (e) => {
        if (!isDragging) return;
        
        // When touch event ends, it may not have coordinates
        // Use the last known touch point or end the drag
        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            
            // Find the target container under the last touch point
            const dropContainer = getDropContainerAtPoint(touch.clientX, touch.clientY);
            if (dropContainer) {
                const dragTarget = getDragTarget(touch.clientY, dropContainer);
                
                if (dragTarget && draggedElement) {
                    // Process the drop
                    handleStepDrop(draggedElement.dataset.stepId, dragTarget, dropContainer);
                }
            }
        }
        
        // Clean up the drag state
        cleanupDrag();
    };
    
    // Updates the position of the drag ghost element
    const updateDragGhostPosition = (clientX, clientY) => {
        const ghostElement = document.getElementById('drag-ghost');
        if (ghostElement && draggedElement) {
            ghostElement.style.left = (clientX - draggedElement.dragOffsetX) + 'px';
            ghostElement.style.top = (clientY - draggedElement.dragOffsetY) + 'px';
        }
    };
    
    // Finds the drop container under the specified point
    const getDropContainerAtPoint = (x, y) => {
        const elements = document.elementsFromPoint(x, y);
        
        // Look for the first .project-steps element in the list
        for (const element of elements) {
            if (element.closest('.project-steps')) {
                return element.closest('.project-steps');
            }
        }
        
        return null;
    };
    
    // Finds the drag target based on Y position
    const getDragTarget = (clientY, container) => {
        const stepItems = Array.from(container.querySelectorAll('.step-item:not(.dragging)'));
        
        if (stepItems.length === 0) {
            // Container is empty, target is the container itself
            return container;
        }
        
        return stepItems.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = clientY - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY, element: stepItems[stepItems.length - 1] }).element;
    };
    
    // Processes dropping a step
    const handleStepDrop = (stepId, targetElement, targetContainer) => {
        if (!stepId) return;
        
        // Find the source step
        const sourceStep = document.querySelector(`.step-item[data-step-id="${stepId}"]`);
        if (!sourceStep) return;
        
        const sourceProjectId = sourceStep.closest('.project-card').dataset.project;
        const targetProjectId = targetContainer.closest('.project-card').dataset.project;
        
        // If target is a step, insert before it
        if (targetElement.classList.contains('step-item')) {
            targetContainer.insertBefore(sourceStep, targetElement);
        } else {
            // Otherwise insert at the end of the container
            targetContainer.appendChild(sourceStep);
        }
        
        // If project has changed, reassign step to new project
        if (sourceProjectId !== targetProjectId) {
            // Get step and project data from managers
            const step = TodoManager.getStep(sourceProjectId, stepId);
            if (step) {
                // Remove step from old project
                TodoManager.deleteStep(sourceProjectId, stepId);
                
                // Add step to new project
                step.projectId = targetProjectId;
                TodoManager.addStep(targetProjectId, step);
                
                // Update UI
                updateProjectProgress(sourceProjectId);
                updateProjectProgress(targetProjectId);
            }
        } else {
            // Just update the step order
            updateStepOrder(targetProjectId, targetContainer);
        }
    };
    
    // Updates the order of steps in a project
    const updateStepOrder = (projectId, stepsContainer) => {
        const project = ProjectManager.getProject(projectId);
        if (!project) return;
        
        // Capture new step order
        const newOrder = Array.from(stepsContainer.querySelectorAll('.step-item'))
            .map(item => item.dataset.stepId);
        
        // Sort steps in the new order
        project.steps.sort((a, b) => {
            return newOrder.indexOf(a.id) - newOrder.indexOf(b.id);
        });
        
        // Update project
        ProjectManager.updateProject(project);
        
        // Send WebSocket message
        sendWebSocketMessage('update_project', project);
    };
    
    // Resets styling for all drop targets
    const resetDropTargets = () => {
        document.querySelectorAll('.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
    };
    
    // Cleans up the drag state
    const cleanupDrag = () => {
        isDragging = false;
        
        // Remove ghost element
        const ghostElement = document.getElementById('drag-ghost');
        if (ghostElement) {
            ghostElement.remove();
        }
        
        // Reset drag styling
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement = null;
        }
        
        // Reset drop target styling
        resetDropTargets();
    };
    
    // Updates project progress
    const updateProjectProgress = (projectId) => {
        if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateProjectProgress === 'function') {
            TodoManager.updateProjectProgress(projectId);
        }
    };
    
    // Filters projects based on current filter
    const applyFilter = () => {
        if (!projectsContainer) return;
        
        const projects = projectsContainer.querySelectorAll('.project-card');
        
        projects.forEach(project => {
            if (!currentFilter || project.dataset.status === currentFilter) {
                // First check if project is completed and hideCompleted is active
                if (hideCompleted && project.dataset.status === 'completed') {
                    fadeOutElement(project);
                } else {
                    fadeInElement(project);
                }
            } else {
                fadeOutElement(project);
            }
        });
    };
    
    // Sorts projects based on current sort
    const applySort = () => {
        if (!projectsContainer) return;
        
        const projects = Array.from(projectsContainer.querySelectorAll('.project-card'));
        
        // Sort projects
        projects.sort((a, b) => {
            let valueA, valueB;
            
            switch (currentSort.field) {
                case 'deadline':
                    // Extract date from text
                    const deadlineTextA = a.querySelector('.deadline-text').textContent;
                    const deadlineTextB = b.querySelector('.deadline-text').textContent;
                    
                    // Extract only the date from format "Fällig: DD.MM.YYYY"
                    const dateA = parseGermanDate(deadlineTextA.split(': ')[1]);
                    const dateB = parseGermanDate(deadlineTextB.split(': ')[1]);
                    
                    valueA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
                    valueB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
                    break;
                    
                case 'progress':
                    valueA = parseInt(a.querySelector('.progress-percentage').textContent);
                    valueB = parseInt(b.querySelector('.progress-percentage').textContent);
                    break;
                    
                case 'title':
                    valueA = a.querySelector('.project-title').textContent.toLowerCase();
                    valueB = b.querySelector('.project-title').textContent.toLowerCase();
                    break;
                    
                default:
                    return 0;
            }
            
            // Apply sort direction
            const direction = currentSort.direction === 'asc' ? 1 : -1;
            
            if (valueA < valueB) return -1 * direction;
            if (valueA > valueB) return 1 * direction;
            return 0;
        });
        
        // Insert sorted projects back into container
        projects.forEach(project => {
            projectsContainer.appendChild(project);
        });
    };
    
    // Applies the "hide completed" filter
    const applyHideCompleted = () => {
        if (!projectsContainer) return;
        
        const completedProjects = projectsContainer.querySelectorAll('.project-card[data-status="completed"]');
        
        completedProjects.forEach(project => {
            if (hideCompleted) {
                fadeOutElement(project);
            } else if (!currentFilter || project.dataset.status === currentFilter) {
                fadeInElement(project);
            }
        });
    };
    
    // Toggles the Gantt view
    const toggleGanttView = () => {
        const ganttView = document.getElementById('gantt-view');
        
        if (ganttView) {
            // Hide Gantt view
            ganttView.classList.remove('active');
            setTimeout(() => {
                ganttView.remove();
            }, 300);
            
            // Show normal view
            projectsContainer.style.display = 'grid';
            
            // Update button text
            if (ganttViewButton) {
                ganttViewButton.textContent = 'Gantt-Ansicht';
            }
        } else {
            // Hide normal view
            projectsContainer.style.display = 'none';
            
            // Create and show Gantt view
            createGanttView();
            
            // Update button text
            if (ganttViewButton) {
                ganttViewButton.textContent = 'Normale Ansicht';
            }
        }
    };
    
    // Creates the Gantt chart view
    const createGanttView = () => {
        const ganttView = document.createElement('div');
        ganttView.id = 'gantt-view';
        ganttView.className = 'gantt-view';
        
        // Get all projects
        const projects = Object.values(ProjectManager.getAllProjects());
        
        // Create Gantt chart header
        const ganttHeader = createGanttHeader(projects);
        ganttView.appendChild(ganttHeader);
        
        // Create Gantt chart body
        const ganttBody = createGanttBody(projects);
        ganttView.appendChild(ganttBody);
        
        // Add Gantt view to page
        projectsContainer.parentNode.insertBefore(ganttView, projectsContainer.nextSibling);
        
        // Animation for fade in
        setTimeout(() => {
            ganttView.classList.add('active');
        }, 10);
    };
    
    // Creates the header for the Gantt chart
    const createGanttHeader = (projects) => {
        const header = document.createElement('div');
        header.className = 'gantt-header';
        
        // Project title column
        const titleColumn = document.createElement('div');
        titleColumn.className = 'gantt-column gantt-title-column';
        titleColumn.textContent = 'Projekt';
        header.appendChild(titleColumn);
        
        // Determine time range for the Gantt chart
        const timeRange = calculateTimeRange(projects);
        const startDate = timeRange.start;
        const endDate = timeRange.end;
        
        // Create timeline (one column for each day)
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateColumn = document.createElement('div');
            dateColumn.className = 'gantt-column gantt-date-column';
            
            // Format: DD.MM.
            const day = String(currentDate.getDate()).padStart(2, '0');
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            dateColumn.textContent = `${day}.${month}`;
            
            // Highlight weekends
            if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                dateColumn.classList.add('weekend');
            }
            
            // Highlight today
            const today = new Date();
            if (currentDate.getDate() === today.getDate() && 
                currentDate.getMonth() === today.getMonth() && 
                currentDate.getFullYear() === today.getFullYear()) {
                dateColumn.classList.add('today');
            }
            
            header.appendChild(dateColumn);
            
            // Next day
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return header;
    };
    
    // Creates the body for the Gantt chart
    const createGanttBody = (projects) => {
        const body = document.createElement('div');
        body.className = 'gantt-body';
        
        // Time range for the Gantt chart
        const timeRange = calculateTimeRange(projects);
        const startDate = timeRange.start;
        const endDate = timeRange.end;
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        // Create a row for each project
        projects.forEach(project => {
            const row = document.createElement('div');
            row.className = 'gantt-row';
            
            // Status class for styling
            row.classList.add(`status-${project.status}`);
            
            // Project title column
            const titleColumn = document.createElement('div');
            titleColumn.className = 'gantt-column gantt-title-column';
            titleColumn.textContent = project.title;
            row.appendChild(titleColumn);
            
            // Project bar container across all days
            const barContainer = document.createElement('div');
            barContainer.className = 'gantt-bar-container';
            barContainer.style.gridColumn = `2 / span ${totalDays}`;
            
            // Parse project deadline
            const deadlineDate = project.deadline ? new Date(project.deadline) : null;
            
            // Create project bar
            if (deadlineDate) {
                const projectBar = document.createElement('div');
                projectBar.className = 'gantt-project-bar';
                
                // Bar width based on project duration (minimum 1 day)
                const startDay = 1; // Start on first day
                
                // Calculate days between start and deadline
                const deadlineDay = Math.ceil((deadlineDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                
                // Position the bar
                projectBar.style.gridColumn = `${startDay} / ${deadlineDay + 1}`;
                
                // Status class for styling
                projectBar.classList.add(`status-${project.status}`);
                
                // Show progress in bar
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'gantt-progress-indicator';
                progressIndicator.style.width = `${project.progress}%`;
                projectBar.appendChild(progressIndicator);
                
                // Show project title in bar
                const barTitle = document.createElement('span');
                barTitle.className = 'gantt-bar-title';
                barTitle.textContent = `${project.progress}%`;
                projectBar.appendChild(barTitle);
                
                barContainer.appendChild(projectBar);
                
                // Deadline marker
                const deadlineMarker = document.createElement('div');
                deadlineMarker.className = 'gantt-deadline-marker';
                deadlineMarker.style.gridColumn = deadlineDay;
                deadlineMarker.title = `Deadline: ${formatDate(deadlineDate)}`;
                barContainer.appendChild(deadlineMarker);
            }
            
            row.appendChild(barContainer);
            body.appendChild(row);
            
            // Add steps as sub-rows, if available
            if (project.steps && project.steps.length > 0) {
                project.steps.forEach(step => {
                    const stepRow = document.createElement('div');
                    stepRow.className = 'gantt-row gantt-step-row';
                    
                    if (step.completed) {
                        stepRow.classList.add('completed');
                    }
                    
                    // Step title (indented)
                    const stepTitleColumn = document.createElement('div');
                    stepTitleColumn.className = 'gantt-column gantt-title-column step-title';
                    stepTitleColumn.textContent = step.title;
                    stepRow.appendChild(stepTitleColumn);
                    
                    // Step as marker in Gantt chart
                    const stepBarContainer = document.createElement('div');
                    stepBarContainer.className = 'gantt-bar-container';
                    stepBarContainer.style.gridColumn = `2 / span ${totalDays}`;
                    
                    // Create step marker (simple dot or diamond)
                    const stepMarker = document.createElement('div');
                    stepMarker.className = 'gantt-step-marker';
                    
                    // Position marker (simplified in the middle)
                    const middleDay = Math.floor(totalDays / 2);
                    stepMarker.style.gridColumn = middleDay;
                    
                    if (step.completed) {
                        stepMarker.classList.add('completed');
                    }
                    
                    stepBarContainer.appendChild(stepMarker);
                    stepRow.appendChild(stepBarContainer);
                    
                    body.appendChild(stepRow);
                });
            }
        });
        
        return body;
    };
    
    // Calculates the time range for the Gantt chart based on projects
    const calculateTimeRange = (projects) => {
        let earliestDate = new Date();
        let latestDate = new Date();
        
        // Set earliest to today and latest to today + 30 days as default
        latestDate.setDate(latestDate.getDate() + 30);
        
        // Go through all projects and check deadlines
        projects.forEach(project => {
            if (project.deadline) {
                const deadlineDate = new Date(project.deadline);
                
                if (deadlineDate > latestDate) {
                    latestDate = new Date(deadlineDate);
                }
            }
        });
        
        // Add some buffer (3 days before and after)
        earliestDate.setDate(earliestDate.getDate() - 3);
        latestDate.setDate(latestDate.getDate() + 3);
        
        return {
            start: earliestDate,
            end: latestDate
        };
    };
    
    // Fades out an element smoothly
    const fadeOutElement = (element) => {
        // Prepare the element for animation
        element.style.transition = 'opacity 0.3s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
        element.style.opacity = '0';
        
        // Hide after short delay
        setTimeout(() => {
            const originalHeight = element.offsetHeight;
            element.style.maxHeight = originalHeight + 'px';
            
            // Short delay for transition
            setTimeout(() => {
                element.style.maxHeight = '0';
                element.style.margin = '0';
                element.style.padding = '0';
                element.style.overflow = 'hidden';
            }, 50);
        }, 300);
    };
    
    // Fades in an element smoothly
    const fadeInElement = (element) => {
        // Reset styles for animation
        element.style.transition = 'opacity 0.3s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
        element.style.maxHeight = '1000px'; // Higher than maximum project height
        element.style.margin = '';
        element.style.padding = '';
        
        // Short delay for transition
        setTimeout(() => {
            element.style.opacity = '1';
            
            // Reset overflow after transition
            setTimeout(() => {
                element.style.overflow = '';
                element.style.maxHeight = '';
            }, 500);
        }, 50);
    };
    
    // Helper function to parse a German date (DD.MM.YYYY)
    const parseGermanDate = (dateString) => {
        if (!dateString) return null;
        
        // Regular expression for DD.MM.YYYY
        const match = dateString.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (match) {
            return new Date(match[3], match[2] - 1, match[1]);
        }
        
        return null;
    };
    
    // Helper function to format a date as DD.MM.YYYY
    const formatDate = (date) => {
        if (!date) return '';
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}.${month}.${year}`;
    };
    
    // Public API
    return {
        init
    };
})();

// Initialize after document loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        EnhancedUI.init();
    }, 1000); // Wait for other modules to initialize
});