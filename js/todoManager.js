/**
 * todoManager.js - Verwaltet Todo/Schritte in den Projekten
 * Version 2.0.0 - Mit Datenvalidierung und erweiterten Funktionen
 */

const TodoManager = (() => {
    // Event-System für erweiterte Beobachtbarkeit
    const eventHandlers = {
        'step-added': [],
        'step-updated': [],
        'step-deleted': [],
        'step-completed': [],
        'step-reordered': []
    };
    
    // Schema für Datenvalidierung
    const stepSchema = {
        id: { type: 'string', required: true },
        projectId: { type: 'string', required: true },
        title: { type: 'string', required: true, maxLength: 100 },
        description: { type: 'string', required: false, maxLength: 500 },
        completed: { type: 'boolean', required: true },
        dueDate: { type: 'string', required: false, format: 'date' },
        assignedTo: { type: 'string', required: false },
        tags: { type: 'array', required: false },
        priority: { type: 'string', required: false, enum: ['low', 'medium', 'high'] },
        createdAt: { type: 'string', required: false, format: 'datetime' },
        updatedAt: { type: 'string', required: false, format: 'datetime' }
    };

    /**
     * Registriert einen Event-Handler
     * @param {string} event - Event-Name
     * @param {Function} handler - Event-Handler-Funktion
     */
    const on = (event, handler) => {
        if (!eventHandlers[event]) {
            eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);
    };

    /**
     * Löst ein Event aus
     * @param {string} event - Event-Name
     * @param {any} data - Event-Daten
     */
    const triggerEvent = (event, data) => {
        if (!eventHandlers[event]) return;
        
        eventHandlers[event].forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Fehler im Event-Handler für ${event}:`, error);
            }
        });
    };

    /**
     * Validiert einen Schritt gegen das Schema
     * @param {Object} step - Zu validierender Schritt
     * @returns {boolean} - Ob der Schritt gültig ist
     */
    const validateStep = (step) => {
        if (!step || typeof step !== 'object') return false;
        
        // Pflichtfelder prüfen
        for (const [field, rules] of Object.entries(stepSchema)) {
            if (rules.required && (step[field] === undefined || step[field] === null)) {
                console.warn(`Validierungsfehler: Pflichtfeld ${field} fehlt`);
                return false;
            }
            
            // Wenn das Feld vorhanden ist, Typprüfung durchführen
            if (step[field] !== undefined && step[field] !== null) {
                // Typprüfung
                if (rules.type === 'string' && typeof step[field] !== 'string') {
                    console.warn(`Validierungsfehler: ${field} ist kein String`);
                    return false;
                }
                
                if (rules.type === 'boolean' && typeof step[field] !== 'boolean') {
                    console.warn(`Validierungsfehler: ${field} ist kein Boolean`);
                    return false;
                }
                
                if (rules.type === 'array' && !Array.isArray(step[field])) {
                    console.warn(`Validierungsfehler: ${field} ist kein Array`);
                    return false;
                }
                
                // Maximale Länge prüfen
                if (rules.maxLength && typeof step[field] === 'string' && step[field].length > rules.maxLength) {
                    console.warn(`Validierungsfehler: ${field} überschreitet maximale Länge von ${rules.maxLength}`);
                    return false;
                }
                
                // Aufzählungswerte prüfen
                if (rules.enum && !rules.enum.includes(step[field])) {
                    console.warn(`Validierungsfehler: ${field} muss einer der folgenden Werte sein: ${rules.enum.join(', ')}`);
                    return false;
                }
                
                // Datumsformat prüfen
                if (rules.format === 'date' && !isValidDate(step[field])) {
                    console.warn(`Validierungsfehler: ${field} ist kein gültiges Datum`);
                    return false;
                }
            }
        }
        
        return true;
    };

    /**
     * Prüft, ob ein String ein gültiges Datum ist
     * @param {string} dateString - Zu prüfender Datumsstring
     * @returns {boolean} - Ob das Datum gültig ist
     */
    const isValidDate = (dateString) => {
        if (!dateString) return true; // Leeres Datum ist erlaubt
        
        // Prüfe ISO-Datumsformat (YYYY-MM-DD)
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!datePattern.test(dateString)) return false;
        
        // Prüfe, ob das Datum gültig ist
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    };

    /**
     * Normalisiert einen Schritt (fehlende Felder ergänzen)
     * @param {Object} step - Zu normalisierender Schritt
     * @returns {Object} - Normalisierter Schritt
     */
    const normalizeStep = (step) => {
        const normalized = { ...step };
        
        // Timestamp aktualisieren oder erstellen
        const now = new Date().toISOString();
        normalized.updatedAt = now;
        
        if (!normalized.createdAt) {
            normalized.createdAt = now;
        }
        
        // Completed als Boolean sicherstellen
        if (normalized.completed === undefined) {
            normalized.completed = false;
        } else if (typeof normalized.completed !== 'boolean') {
            normalized.completed = Boolean(normalized.completed);
        }
        
        // Tags als Array sicherstellen
        if (normalized.tags && !Array.isArray(normalized.tags)) {
            normalized.tags = [normalized.tags];
        } else if (!normalized.tags) {
            normalized.tags = [];
        }
        
        return normalized;
    };

    /**
     * Fügt einen neuen Schritt zu einem Projekt hinzu
     * @param {string} projectId - Projekt-ID
     * @param {Object} step - Schrittdaten
     * @returns {Object|null} - Der hinzugefügte Schritt oder null bei Fehler
     */
    const addStep = (projectId, step) => {
        if (!projectId || !step) return null;
        
        try {
            // Projekt-ID zum Schritt hinzufügen
            step.projectId = projectId;
            
            // ID generieren, falls nicht vorhanden
            if (!step.id) {
                step.id = generateUniqueId();
            }
            
            // Validieren
            if (!validateStep(step)) {
                console.error('Ungültiger Schrittformat:', step);
                showError('Schritt konnte nicht hinzugefügt werden: Ungültiges Format');
                return null;
            }
            
            // Normalisieren
            const normalizedStep = normalizeStep(step);
            
            // Hole das Projekt
            const project = typeof ProjectManager !== 'undefined' && ProjectManager.getProject
                ? ProjectManager.getProject(projectId)
                : null;
                
            if (!project) {
                console.error(`Projekt mit ID ${projectId} nicht gefunden`);
                showError('Schritt konnte nicht hinzugefügt werden: Projekt nicht gefunden');
                return null;
            }
            
            // Füge Schritt hinzu, falls er noch nicht existiert
            if (!project.steps) {
                project.steps = [];
            }
            
            // Prüfe, ob Schritt bereits existiert
            const existingIndex = project.steps.findIndex(s => s.id === normalizedStep.id);
            if (existingIndex >= 0) {
                project.steps[existingIndex] = normalizedStep;
            } else {
                project.steps.push(normalizedStep);
            }
            
            // Aktualisiere das Projekt
            if (typeof ProjectManager !== 'undefined' && ProjectManager.updateProject) {
                ProjectManager.updateProject(project);
            }
            
            // Event auslösen
            triggerEvent('step-added', normalizedStep);
            
            return normalizedStep;
        } catch (error) {
            console.error('Fehler beim Hinzufügen des Schritts:', error);
            showError('Schritt konnte nicht hinzugefügt werden');
            return null;
        }
    };

    /**
     * Aktualisiert einen vorhandenen Schritt
     * @param {string} projectId - Projekt-ID
     * @param {Object} updatedStep - Aktualisierte Schrittdaten
     * @returns {Object|null} - Der aktualisierte Schritt oder null bei Fehler
     */
    const updateStep = (projectId, updatedStep) => {
        if (!projectId || !updatedStep || !updatedStep.id) {
            console.error("updateStep called with invalid parameters:", { projectId, updatedStep });
            return null;
        }
        
        try {
            console.log(`Updating step ${updatedStep.id} in project ${projectId}`);
            
            // Stelle sicher, dass die projectId im Step korrekt ist
            updatedStep.projectId = projectId;
            
            // Hole das Projekt
            let project = null;
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                project = ProjectManager.getProject(projectId);
            }
                
            if (!project) {
                console.error(`Project with ID ${projectId} not found`);
                return null;
            }
            
            if (!project.steps) {
                console.error(`Project with ID ${projectId} has no steps array`);
                project.steps = [];
            }
            
            // Finde den Index des Schritts
            const stepIndex = project.steps.findIndex(step => step.id === updatedStep.id);
            
            if (stepIndex === -1) {
                console.error(`Step with ID ${updatedStep.id} not found in project ${projectId}`);
                return null;
            }
            
            // Speichere wichtige Werte
            const wasComplete = project.steps[stepIndex].completed;
            const isNowComplete = updatedStep.completed;
            
            // Aktualisiere nur die angegebenen Werte, behalte den Rest
            const originalStep = project.steps[stepIndex];
            const mergedStep = {
                ...originalStep,
                ...updatedStep,
                updatedAt: new Date().toISOString()
            };
            
            // Aktualisiere den Schritt im Projekt
            project.steps[stepIndex] = mergedStep;
            
            console.log("Updated step in project:", mergedStep);
            
            // Aktualisiere das Projekt
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.updateProject === 'function') {
                ProjectManager.updateProject(project);
                console.log("Project updated via ProjectManager");
            }
            
            // Aktualisiere UI-Element wenn vorhanden
            const stepElement = document.querySelector(`.step-item[data-step-id="${updatedStep.id}"]`);
            if (stepElement) {
                console.log("Updating step UI element");
                if (mergedStep.completed) {
                    stepElement.classList.add('step-completed');
                    const checkbox = stepElement.querySelector('.step-checkbox');
                    if (checkbox) checkbox.setAttribute('aria-checked', 'true');
                } else {
                    stepElement.classList.remove('step-completed');
                    const checkbox = stepElement.querySelector('.step-checkbox');
                    if (checkbox) checkbox.setAttribute('aria-checked', 'false');
                }
            }
            
            return mergedStep;
        } catch (error) {
            console.error(`Error in updateStep(${projectId}, ${updatedStep?.id}):`, error);
            return null;
        }
    };

    /**
     * Löscht einen Schritt
     * @param {string} projectId - Projekt-ID
     * @param {string} stepId - Schritt-ID
     * @returns {boolean} - Ob das Löschen erfolgreich war
     */
    const deleteStep = (projectId, stepId) => {
        if (!projectId || !stepId) return false;
        
        try {
            // Hole das Projekt
            const project = typeof ProjectManager !== 'undefined' && ProjectManager.getProject
                ? ProjectManager.getProject(projectId)
                : null;
                
            if (!project || !project.steps) {
                console.error(`Projekt mit ID ${projectId} nicht gefunden oder keine Schritte`);
                return false;
            }
            
            // Finde den Schritt
            const stepIndex = project.steps.findIndex(step => step.id === stepId);
            if (stepIndex === -1) {
                console.error(`Schritt mit ID ${stepId} nicht gefunden`);
                return false;
            }
            
            // Speichere Schritt für Event-Auslösung
            const deletedStep = project.steps[stepIndex];
            
            // Entferne den Schritt
            project.steps.splice(stepIndex, 1);
            
            // Aktualisiere das Projekt
            if (typeof ProjectManager !== 'undefined' && ProjectManager.updateProject) {
                ProjectManager.updateProject(project);
            } else {
                // Fortschritt manuell aktualisieren, wenn ProjectManager nicht verfügbar
                updateProjectProgress(project);
            }
            
            // Ereignis auslösen
            triggerEvent('step-deleted', deletedStep);
            
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen des Schritts:', error);
            showError('Schritt konnte nicht gelöscht werden');
            return false;
        }
    };

    /**
     * Gibt einen Schritt zurück
     * @param {string} projectId - Projekt-ID
     * @param {string} stepId - Schritt-ID
     * @returns {Object|null} - Der Schritt oder null, wenn nicht gefunden
     */
    const getStep = (projectId, stepId) => {
        if (!projectId || !stepId) {
            console.error("getStep called with invalid parameters:", { projectId, stepId });
            return null;
        }
        
        try {
            // Hole das Projekt
            let project = null;
            if (typeof ProjectManager !== 'undefined' && typeof ProjectManager.getProject === 'function') {
                project = ProjectManager.getProject(projectId);
            }
                
            if (!project) {
                console.error(`Project with ID ${projectId} not found`);
                return null;
            }
            
            if (!project.steps) {
                console.error(`Project with ID ${projectId} has no steps array`);
                return null;
            }
            
            // Finde und gib den Schritt zurück
            const step = project.steps.find(step => step.id === stepId);
            if (!step) {
                console.error(`Step with ID ${stepId} not found in project ${projectId}`);
                return null;
            }
            
            return step;
        } catch (error) {
            console.error(`Error in getStep(${projectId}, ${stepId}):`, error);
            return null;
        }
    };
    

    /**
     * Gibt alle Schritte eines Projekts zurück
     * @param {string} projectId - Projekt-ID
     * @returns {Array} - Schritte des Projekts
     */
    const getProjectSteps = (projectId) => {
        if (!projectId) return [];
        
        // Hole das Projekt
        const project = typeof ProjectManager !== 'undefined' && ProjectManager.getProject
            ? ProjectManager.getProject(projectId)
            : null;
            
        if (!project || !project.steps) return [];
        
        return [...project.steps];
    };

    /**
     * Ändert die Reihenfolge von Schritten in einem Projekt
     * @param {string} projectId - Projekt-ID
     * @param {Array<string>} stepOrder - Neue Reihenfolge der Schritt-IDs
     * @returns {boolean} - Ob die Neuanordnung erfolgreich war
     */
    const reorderSteps = (projectId, stepOrder) => {
        if (!projectId || !Array.isArray(stepOrder) || stepOrder.length === 0) return false;
        
        try {
            // Hole das Projekt
            const project = typeof ProjectManager !== 'undefined' && ProjectManager.getProject
                ? ProjectManager.getProject(projectId)
                : null;
                
            if (!project || !project.steps || project.steps.length === 0) {
                console.error(`Projekt mit ID ${projectId} nicht gefunden oder keine Schritte`);
                return false;
            }
            
            // Prüfe, ob alle IDs vorhanden sind
            const allStepsIncluded = project.steps.every(step => stepOrder.includes(step.id));
            if (!allStepsIncluded) {
                console.error('Nicht alle Schritte sind in der neuen Reihenfolge enthalten');
                return false;
            }
            
            // Sortiere Schritte in der neuen Reihenfolge
            project.steps.sort((a, b) => {
                return stepOrder.indexOf(a.id) - stepOrder.indexOf(b.id);
            });
            
            // Aktualisiere das Projekt
            if (typeof ProjectManager !== 'undefined' && ProjectManager.updateProject) {
                ProjectManager.updateProject(project);
            }
            
            // Ereignis auslösen
            triggerEvent('step-reordered', { projectId, stepOrder });
            
            return true;
        } catch (error) {
            console.error('Fehler beim Neuanordnen der Schritte:', error);
            showError('Schritte konnten nicht neu angeordnet werden');
            return false;
        }
    };

    /**
     * Berechnet und aktualisiert den Projektfortschritt basierend auf abgeschlossenen Schritten
     * @param {string|Object} projectIdOrProject - Projekt-ID oder Projektobjekt
     * @returns {number} - Neuer Fortschrittswert (0-100)
     */
    const updateProjectProgress = (projectIdOrProject) => {
        let project;
        
        // Projekt-ID oder Projektobjekt?
        if (typeof projectIdOrProject === 'string') {
            // Hole das Projekt
            project = typeof ProjectManager !== 'undefined' && ProjectManager.getProject
                ? ProjectManager.getProject(projectIdOrProject)
                : null;
        } else {
            project = projectIdOrProject;
        }
        
        if (!project || !project.steps || project.steps.length === 0) return 0;
        
        // Berechne Prozentsatz abgeschlossener Schritte
        const completedSteps = project.steps.filter(step => step.completed).length;
        const totalSteps = project.steps.length;
        const progressPercentage = Math.round((completedSteps / totalSteps) * 100);
        
        // Speichere alten Fortschrittswert
        const oldProgress = project.progress;
        
        // Aktualisiere Projekt-Fortschritt
        project.progress = progressPercentage;
        
        // Aktualisiere Projekt-Status basierend auf Fortschritt
        updateProjectStatus(project);
        
        // Aktualisiere nächsten Schritt
        updateNextStep(project);
        
        // Aktualisiere das Projekt, wenn sich der Fortschritt geändert hat
        if (oldProgress !== progressPercentage && typeof ProjectManager !== 'undefined' && ProjectManager.updateProject) {
            ProjectManager.updateProject(project);
        }
        
        return progressPercentage;
    };

    /**
     * Aktualisiert den Projektstatus basierend auf Fortschritt und Deadline
     * @param {Object} project - Projektobjekt
     */
    const updateProjectStatus = (project) => {
        if (!project) return;
        
        // Wenn alle Schritte abgeschlossen sind, setze Status auf "completed"
        if (project.progress === 100) {
            project.status = 'completed';
            return;
        }
        
        // Prüfe, ob Deadline überschritten wurde
        if (project.deadline) {
            const deadlineDate = new Date(project.deadline);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Nur der Tag zählt
            
            if (deadlineDate < today) {
                project.status = 'delayed';
                return;
            }
            
            // Prüfe, ob Deadline in weniger als 7 Tagen ist und Fortschritt < 70%
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
    };

    /**
     * Aktualisiert den nächsten Schritt für ein Projekt
     * @param {Object} project - Projektobjekt
     */
    const updateNextStep = (project) => {
        if (!project || !project.steps || project.steps.length === 0) return;
        
        // Finde den ersten nicht abgeschlossenen Schritt
        const nextStep = project.steps.find(step => !step.completed);
        
        if (nextStep) {
            project.nextStep = nextStep.title;
        } else {
            project.nextStep = 'Alle Schritte abgeschlossen';
        }
    };

    /**
     * Zeigt eine Fehlermeldung an
     * @param {string} message - Fehlermeldung
     */
    const showError = (message) => {
        if (typeof OfflineManager !== 'undefined' && typeof OfflineManager.showNotification === 'function') {
            OfflineManager.showNotification(message, 'error');
        } else {
            console.error(message);
        }
    };

    /**
     * Generiert eine eindeutige ID
     * @returns {string} - Eindeutige ID
     */
    const generateUniqueId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    };

    /**
     * Gibt alle ausstehenden Schritte zurück (für Dashboard-Überblick)
     * @returns {Array} - Ausstehende Schritte
     */
    const getPendingSteps = () => {
        const pending = [];
        
        // ProjectManager muss verfügbar sein
        if (typeof ProjectManager === 'undefined' || !ProjectManager.getAllProjects) {
            return pending;
        }
        
        const allProjects = ProjectManager.getAllProjects();
        
        for (const project of Object.values(allProjects)) {
            if (!project.steps) continue;
            
            for (const step of project.steps) {
                if (!step.completed) {
                    pending.push({
                        ...step,
                        projectTitle: project.title
                    });
                }
            }
        }
        
        // Sortiere nach Priorität und Fälligkeit
        pending.sort((a, b) => {
            // Priorität (hoch > mittel > niedrig)
            const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2, undefined: 3 };
            const priorityA = priorityOrder[a.priority] || 3;
            const priorityB = priorityOrder[b.priority] || 3;
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // Fälligkeit (früher zuerst)
            if (a.dueDate && b.dueDate) {
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            
            // Schritte mit Fälligkeit kommen vor Schritten ohne Fälligkeit
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            
            return 0;
        });
        
        return pending;
    };

    /**
     * Erstellt Schrittkategorien für das Dashboard (geplant, in Arbeit, abgeschlossen)
     * @returns {Object} - Schrittkategorien
     */
    const getStepCategories = () => {
        const categories = {
            planned: [],
            inProgress: [],
            completed: []
        };
        
        // ProjectManager muss verfügbar sein
        if (typeof ProjectManager === 'undefined' || !ProjectManager.getAllProjects) {
            return categories;
        }
        
        const allProjects = ProjectManager.getAllProjects();
        
        for (const project of Object.values(allProjects)) {
            if (!project.steps) continue;
            
            for (const step of project.steps) {
                const stepWithProject = {
                    ...step,
                    projectTitle: project.title
                };
                
                if (step.completed) {
                    categories.completed.push(stepWithProject);
                } else if (step.inProgress) {
                    categories.inProgress.push(stepWithProject);
                } else {
                    categories.planned.push(stepWithProject);
                }
            }
        }
        
        return categories;
    };
    
    /**
     * Markiert einen Schritt als "in Arbeit"
     * @param {string} projectId - Projekt-ID
     * @param {string} stepId - Schritt-ID
     * @returns {Object|null} - Der aktualisierte Schritt oder null bei Fehler
     */
    const markStepInProgress = (projectId, stepId) => {
        const step = getStep(projectId, stepId);
        if (!step) return null;
        
        step.inProgress = true;
        return updateStep(projectId, step);
    };

    // Public API
    return {
        addStep,
        updateStep,
        deleteStep,
        getStep,
        getProjectSteps,
        reorderSteps,
        updateProjectProgress,
        getPendingSteps,
        getStepCategories,
        markStepInProgress,
        on
    };
})();