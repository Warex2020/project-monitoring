/**
 * main.js - Hauptskript für die UI-Interaktionen
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialisiere Datum und Uhrzeit
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Initialisiere Event-Handler
    initEventHandlers();

    // Verbinde mit WebSocket
    connectWebSocket();

    // Lade Projekte
    loadProjects();
});

// Aktualisiert Datum und Zeit
function updateDateTime() {
    const now = new Date();
    
    // Datum formatieren
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const dateElement = document.getElementById('current-date');
    dateElement.textContent = now.toLocaleDateString('de-DE', options);
    
    // Zeit formatieren
    const timeElement = document.getElementById('current-time');
    timeElement.textContent = now.toLocaleTimeString('de-DE');
}

// Initialisiert Event-Handler für die UI-Elemente
function initEventHandlers() {
    // Event-Handler für "Neues Projekt" Button
    const addProjectBtn = document.getElementById('add-project-btn');
    addProjectBtn.addEventListener('click', () => {
        // Reset Form
        document.getElementById('project-form').reset();
        document.getElementById('project-id').value = '';
        document.getElementById('modal-title').textContent = 'Neues Projekt';
        
        // Zeige Modal
        const modal = document.getElementById('project-modal');
        modal.style.display = 'block';
    });

    // Event-Handler für Schließen der Modals
    document.querySelectorAll('.close-modal').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Schließe Modals beim Klicken außerhalb
    window.addEventListener('click', (e) => {
        document.querySelectorAll('.modal').forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Event-Handler für Projekt-Formular
    const projectForm = document.getElementById('project-form');
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
    
    // Event-Handler für Schritte-Formular
    const stepForm = document.getElementById('step-form');
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

    // Delegieren von Events für dynamisch erstellte Elemente
    document.getElementById('projects-container').addEventListener('click', handleProjectContainerClicks);
}

// Behandelt Klicks innerhalb des Projekt-Containers (Event-Delegation)
function handleProjectContainerClicks(e) {
    const projectCard = e.target.closest('.project-card');
    if (!projectCard) return;

    const projectId = projectCard.dataset.project;
    
    // Bearbeiten eines Projekts
    if (e.target.classList.contains('edit-icon')) {
        editProject(projectId);
        return;
    }
    
    // Hinzufügen eines Schrittes
    if (e.target.classList.contains('add-step-icon')) {
        addStep(projectId);
        return;
    }
    
    // Bearbeiten eines Schrittes
    if (e.target.classList.contains('edit-step-icon')) {
        const stepItem = e.target.closest('.step-item');
        const stepId = stepItem.dataset.stepId;
        editStep(projectId, stepId);
        return;
    }
    
    // Checkbox für Schritt-Abschluss
    if (e.target.classList.contains('step-checkbox')) {
        const stepItem = e.target.closest('.step-item');
        const stepId = stepItem.dataset.stepId;
        toggleStepCompletion(projectId, stepId);
        return;
    }
    
    // Toggle für Projektschritte (nur wenn nicht auf ein ActionIcon geklickt wurde)
    if (!e.target.closest('.action-icons') && !e.target.closest('.step-actions')) {
        toggleProjectSteps(projectCard);
    }
}

// Öffnet das Modal zum Bearbeiten eines Projekts
function editProject(projectId) {
    const project = ProjectManager.getProject(projectId);
    if (!project) return;
    
    // Formular mit Projektdaten füllen
    document.getElementById('project-id').value = projectId;
    document.getElementById('project-title').value = project.title;
    document.getElementById('project-status').value = project.status;
    document.getElementById('project-progress').value = project.progress;
    document.getElementById('project-next-step').value = project.nextStep;
    document.getElementById('project-team').value = project.team.join(', ');
    document.getElementById('project-deadline').value = project.deadline;
    
    // Modal Titel anpassen und anzeigen
    document.getElementById('modal-title').textContent = 'Projekt bearbeiten';
    document.getElementById('project-modal').style.display = 'block';
}

// Öffnet das Modal zum Hinzufügen eines Schrittes
function addStep(projectId) {
    // Formular zurücksetzen
    document.getElementById('step-form').reset();
    document.getElementById('step-id').value = '';
    document.getElementById('step-project-id').value = projectId;
    
    // Modal Titel anpassen und anzeigen
    document.getElementById('step-modal-title').textContent = 'Neuer Schritt';
    document.getElementById('step-modal').style.display = 'block';
}

// Öffnet das Modal zum Bearbeiten eines Schrittes
function editStep(projectId, stepId) {
    const step = TodoManager.getStep(projectId, stepId);
    if (!step) return;
    
    // Formular mit Schrittdaten füllen
    document.getElementById('step-id').value = stepId;
    document.getElementById('step-project-id').value = projectId;
    document.getElementById('step-title').value = step.title;
    document.getElementById('step-description').value = step.description;
    document.getElementById('step-completed').checked = step.completed;
    
    // Modal Titel anpassen und anzeigen
    document.getElementById('step-modal-title').textContent = 'Schritt bearbeiten';
    document.getElementById('step-modal').style.display = 'block';
}

// Ändert den Abschluss-Status eines Schrittes
function toggleStepCompletion(projectId, stepId) {
    const step = TodoManager.getStep(projectId, stepId);
    if (!step) return;
    
    // Invertiere completed-Status
    step.completed = !step.completed;
    
    // Aktualisiere den Schritt
    TodoManager.updateStep(projectId, step);
    
    // Sende Update über WebSocket
    sendWebSocketMessage('update_step', step);
}

// Klappt die Projektschritte auf/zu
function toggleProjectSteps(projectCard) {
    const projectId = projectCard.dataset.project;
    const stepsContainer = projectCard.querySelector('.project-steps');
    
    // Toggle expanded class
    projectCard.classList.toggle('expanded');
    
    // Animiertes Auf-/Zuklappen
    if (stepsContainer.classList.contains('active')) {
        // Einklappen mit Animation
        stepsContainer.style.maxHeight = '0';
        stepsContainer.style.padding = '0';
        stepsContainer.style.marginTop = '0';
        
        setTimeout(() => {
            stepsContainer.classList.remove('active');
        }, 400);
    } else {
        // Aufklappen mit Animation
        stepsContainer.classList.add('active');
        stepsContainer.style.maxHeight = stepsContainer.scrollHeight + 40 + 'px';
        stepsContainer.style.padding = '20px';
        stepsContainer.style.marginTop = '25px';
    }
}

// Generiert eine eindeutige ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}