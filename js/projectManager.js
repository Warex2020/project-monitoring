/**
 * projectManager.js - Verantwortlich für das Verwalten von Projekten
 * Version 2.0.0 - Mit Datenvalidierung und Event-System
 */

const ProjectManager = (() => {
    // Private Projektobjekt
    let projects = {};

    // Event-System für erweiterte Beobachtbarkeit
    const eventHandlers = {
        'project-added': [],
        'project-updated': [],
        'project-deleted': [],
        'projects-loaded': []
    };
    
    // Schema für Datenvalidierung
    const projectSchema = {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true, maxLength: 100 },
        status: { 
            type: 'string', 
            required: true, 
            enum: ['on-track', 'at-risk', 'delayed', 'completed'] 
        },
        progress: { type: 'number', required: true, min: 0, max: 100 },
        nextStep: { type: 'string', required: false, maxLength: 200 },
        team: { type: 'array', required: false },
        deadline: { type: 'string', required: false, format: 'date' },
        steps: { type: 'array', required: false },
        createdAt: { type: 'string', required: false, format: 'datetime' },
        updatedAt: { type: 'string', required: false, format: 'datetime' }
    };

    // DOM-Referenzen cachen
    let projectContainer = null;
    let projectTemplate = null;

    /**
     * Initialisiert den ProjectManager
     * @returns {Promise<void>}
     */
    const init = async () => {
        try {
            // DOM-Elemente cachen
            projectContainer = document.getElementById('projects-container');
            projectTemplate = document.getElementById('project-template');
            
            if (!projectContainer) {
                console.error('Fehler: projects-container nicht gefunden');
                return;
            }
            
            if (!projectTemplate) {
                console.warn('Warnung: project-template nicht gefunden');
            }
            
            // Prüfen, ob im Offline-Modus geladen werden soll
            if (navigator.onLine === false && typeof OfflineManager !== 'undefined') {
                console.log('Offline-Modus: Lade Projekte aus IndexedDB');
                projects = await OfflineManager.loadProjectsFromIndexedDB() || {};
                renderAllProjects();
                triggerEvent('projects-loaded', Object.values(projects));
            } else {
                // Online-Modus: Lade Projekte vom Server
                await loadProjects();
            }
            
            // Event-Listener für Offline-Modus
            window.addEventListener('offlineModeChange', async (e) => {
                if (e.detail.offline) {
                    projects = await OfflineManager.loadProjectsFromIndexedDB() || projects;
                    renderAllProjects();
                }
            });
            
            console.log('ProjectManager initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung des ProjectManagers:', error);
        }
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
     * Lädt alle Projekte aus der Konfiguration
     * @returns {Promise<Object>} - Geladene Projekte
     */
    const loadProjects = async () => {
        try {
            // Projekte aus IndexedDB laden, falls offline
            if (navigator.onLine === false && typeof OfflineManager !== 'undefined') {
                projects = await OfflineManager.loadProjectsFromIndexedDB() || {};
                renderAllProjects();
                triggerEvent('projects-loaded', Object.values(projects));
                return projects;
            }
            
            // Lade-Status anzeigen
            showLoadingIndicator();
            
            // Projekte vom Server laden
            const response = await fetch('config/projects.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Validiere die geladenen Projekte
            const validatedData = {};
            for (const [id, project] of Object.entries(data)) {
                if (validateProject(project)) {
                    validatedData[id] = project;
                } else {
                    console.warn(`Ungültiges Projektformat ignoriert: ${id}`);
                }
            }
            
            // Speichere Projekte und rendere sie
            projects = validatedData;
            
            // Lade-Status entfernen
            hideLoadingIndicator();
            
            // Alle Projekte rendern
            renderAllProjects();
            
            // Event auslösen
            triggerEvent('projects-loaded', Object.values(projects));
            
            console.log('Projekte erfolgreich geladen:', Object.keys(projects).length);
            
            // In IndexedDB speichern für Offline-Nutzung
            if (typeof OfflineManager !== 'undefined' && typeof OfflineManager.saveProjectsToIndexedDB === 'function') {
                OfflineManager.saveProjectsToIndexedDB();
            }
            
            return projects;
        } catch (error) {
            console.error('Fehler beim Laden der Projekte:', error);
            
            // Lade-Status entfernen
            hideLoadingIndicator();
            
            // Fallback: Versuche aus IndexedDB zu laden
            if (typeof OfflineManager !== 'undefined') {
                projects = await OfflineManager.loadProjectsFromIndexedDB() || {};
                renderAllProjects();
            } else {
                // Leeres Projektobjekt
                projects = {};
            }
            
            showError('Projekte konnten nicht geladen werden. Bitte versuchen Sie es später erneut.');
            return projects;
        }
    };

    /**
     * Zeigt einen Ladeindikator an
     */
    const showLoadingIndicator = () => {
        if (!projectContainer) return;
        
        // Existierenden Ladeindikator prüfen
        if (document.getElementById('projects-loading')) return;
        
        // Erstelle Ladeindikator
        const loadingEl = document.createElement('div');
        loadingEl.id = 'projects-loading';
        loadingEl.className = 'loading-placeholder';
        loadingEl.setAttribute('aria-label', 'Projekte werden geladen');
        loadingEl.setAttribute('role', 'status');
        
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        loadingEl.appendChild(spinner);
        
        // Füge zum Container hinzu
        projectContainer.innerHTML = '';
        projectContainer.appendChild(loadingEl);
    };

    /**
     * Entfernt den Ladeindikator
     */
    const hideLoadingIndicator = () => {
        const loadingEl = document.getElementById('projects-loading');
        if (loadingEl) {
            loadingEl.remove();
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
            
            // Einfache Fehlermeldung im Container
            if (projectContainer) {
                const errorEl = document.createElement('div');
                errorEl.className = 'error-message';
                errorEl.innerHTML = `<p>${message}</p>`;
                projectContainer.appendChild(errorEl);
            }
        }
    };

    /**
     * Validiert ein Projekt gegen das Schema
     * @param {Object} project - Zu validierendes Projekt
     * @returns {boolean} - Ob das Projekt gültig ist
     */
    const validateProject = (project) => {
        if (!project || typeof project !== 'object') return false;
        
        // Pflichtfelder prüfen
        for (const [field, rules] of Object.entries(projectSchema)) {
            if (rules.required && (project[field] === undefined || project[field] === null)) {
                console.warn(`Validierungsfehler: Pflichtfeld ${field} fehlt`);
                return false;
            }
            
            // Wenn das Feld vorhanden ist, Typprüfung durchführen
            if (project[field] !== undefined && project[field] !== null) {
                // Typprüfung
                if (rules.type === 'string' && typeof project[field] !== 'string') {
                    console.warn(`Validierungsfehler: ${field} ist kein String`);
                    return false;
                }
                
                if (rules.type === 'number' && typeof project[field] !== 'number') {
                    console.warn(`Validierungsfehler: ${field} ist keine Zahl`);
                    return false;
                }
                
                if (rules.type === 'array' && !Array.isArray(project[field])) {
                    console.warn(`Validierungsfehler: ${field} ist kein Array`);
                    return false;
                }
                
                // Wertebereiche prüfen
                if (rules.min !== undefined && project[field] < rules.min) {
                    console.warn(`Validierungsfehler: ${field} ist kleiner als ${rules.min}`);
                    return false;
                }
                
                if (rules.max !== undefined && project[field] > rules.max) {
                    console.warn(`Validierungsfehler: ${field} ist größer als ${rules.max}`);
                    return false;
                }
                
                // Aufzählungswerte prüfen
                if (rules.enum && !rules.enum.includes(project[field])) {
                    console.warn(`Validierungsfehler: ${field} muss einer der folgenden Werte sein: ${rules.enum.join(', ')}`);
                    return false;
                }
                
                // Maximale Länge prüfen
                if (rules.maxLength && typeof project[field] === 'string' && project[field].length > rules.maxLength) {
                    console.warn(`Validierungsfehler: ${field} überschreitet maximale Länge von ${rules.maxLength}`);
                    return false;
                }
                
                // Datumsformat prüfen
                if (rules.format === 'date' && !isValidDate(project[field])) {
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
     * Normalisiert ein Projekt (fehlende Felder ergänzen)
     * @param {Object} project - Zu normalisierendes Projekt
     * @returns {Object} - Normalisiertes Projekt
     */
    const normalizeProject = (project) => {
        const normalized = { ...project };
        
        // Timestamp aktualisieren oder erstellen
        const now = new Date().toISOString();
        normalized.updatedAt = now;
        
        if (!normalized.createdAt) {
            normalized.createdAt = now;
        }
        
        // Team als Array sicherstellen
        if (!normalized.team) {
            normalized.team = [];
        } else if (!Array.isArray(normalized.team)) {
            normalized.team = [normalized.team];
        }
        
        // Schritte als Array sicherstellen
        if (!normalized.steps) {
            normalized.steps = [];
        }
        
        // Progress als Zahl sicherstellen
        if (normalized.progress === undefined) {
            normalized.progress = calculateProgress(normalized);
        } else if (typeof normalized.progress !== 'number') {
            normalized.progress = parseInt(normalized.progress, 10) || 0;
        }
        
        // Fortschritt auf gültigen Bereich beschränken
        normalized.progress = Math.max(0, Math.min(100, normalized.progress));
        
        return normalized;
    };

    /**
     * Berechnet den Fortschritt eines Projekts anhand der abgeschlossenen Schritte
     * @param {Object} project - Projekt
     * @returns {number} - Fortschritt in Prozent
     */
    const calculateProgress = (project) => {
        if (!project.steps || project.steps.length === 0) return 0;
        
        const completedSteps = project.steps.filter(step => step.completed).length;
        return Math.round((completedSteps / project.steps.length) * 100);
    };

    /**
     * Rendert alle Projekte
     */
    const renderAllProjects = () => {
        if (!projectContainer) return;
        
        // Container leeren
        projectContainer.innerHTML = '';
        
        // Kein Projekt-Fallback
        if (Object.keys(projects).length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h3>Keine Projekte gefunden</h3>
                <p>Erstellen Sie ein neues Projekt, um zu beginnen.</p>
                <button id="empty-add-project" class="action-button">+ Neues Projekt</button>
            `;
            projectContainer.appendChild(emptyState);
            
            // Event-Listener für den Button hinzufügen
            const addButton = document.getElementById('empty-add-project');
            if (addButton) {
                addButton.addEventListener('click', () => {
                    const addProjectBtn = document.getElementById('add-project-btn');
                    if (addProjectBtn) addProjectBtn.click();
                });
            }
            
            return;
        }
        
        // Sortiere Projekte nach Status und dann alphabetisch
        const sortedProjects = Object.values(projects).sort((a, b) => {
            // Abgeschlossene Projekte am Ende
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (a.status !== 'completed' && b.status === 'completed') return -1;
            
            // Dann nach Risikograd
            const statusOrder = { 'delayed': 0, 'at-risk': 1, 'on-track': 2, 'completed': 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            
            // Alphabetisch nach Titel
            return a.title.localeCompare(b.title);
        });
        
        // Projektcards erstellen
        sortedProjects.forEach(project => {
            renderProject(project);
        });
    };

    /**
     * Rendert ein einzelnes Projekt
     * @param {Object} project - Zu renderndes Projekt
     * @returns {HTMLElement} - Die erstellte Projekt-Card
     */
    const renderProject = (project) => {
        if (!projectContainer) return null;
        
        // Wenn kein Template vorhanden ist, erstellen wir das Element dynamisch
        let projectElement;
        
        if (projectTemplate) {
            projectElement = document.importNode(projectTemplate.content, true).querySelector('.project-card');
        } else {
            // Fallback, wenn kein Template vorhanden ist
            projectElement = document.createElement('div');
            projectElement.className = 'project-card';
            projectElement.innerHTML = `
                <div class="tech-accent"></div>
                <div class="project-header">
                    <div class="project-title"></div>
                    <div class="project-status"></div>
                </div>
                <div class="progress-container">
                    <div class="progress-info">
                        <div class="progress-text">Fortschritt</div>
                        <div class="progress-percentage">0%</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-value" style="width: 0%"></div>
                    </div>
                </div>
                <div class="next-step">
                    <div class="next-step-title">Nächster Schritt</div>
                    <div class="next-step-description"></div>
                </div>
                <div class="team-members"></div>
                <div class="bottom-info">
                    <div class="deadline">
                        <span class="deadline-icon">📅</span>
                        <span class="deadline-text">Keine Deadline</span>
                    </div>
                    <div class="action-icons">
                        <span class="edit-icon" data-tooltip="Projekt bearbeiten">✏️</span>
                        <span class="add-step-icon" data-tooltip="Schritt hinzufügen">➕</span>
                        <span class="toggle-icon" data-tooltip="Schritte ein-/ausblenden">▼</span>
                    </div>
                </div>
                <div class="project-steps">
                    <div class="steps-empty-message">Keine Schritte vorhanden</div>
                </div>
            `;
        }
        
        // ARIA-Attribute für Barrierefreiheit
        projectElement.setAttribute('role', 'region');
        projectElement.setAttribute('aria-label', `Projekt: ${project.title}`);
        
        // Setze Projekt-ID und Status als Attribute
        projectElement.dataset.project = project.id;
        projectElement.dataset.status = project.status;
        
        // Animation hinzufügen
        projectElement.style.animation = 'fadeIn 0.5s ease forwards';
        
        // Fülle Projektdaten aus
        projectElement.querySelector('.project-title').textContent = project.title;
        
        // Setze Status-Klasse und -Text
        const statusElement = projectElement.querySelector('.project-status');
        statusElement.textContent = getStatusText(project.status);
        statusElement.className = 'project-status'; // Reset Klassen
        statusElement.classList.add(`status-${project.status}`);
        
        // ARIA-Attribut für Status
        statusElement.setAttribute('aria-label', `Status: ${getStatusText(project.status)}`);
        
        // Setze Fortschritt
        const progressPercentage = projectElement.querySelector('.progress-percentage');
        progressPercentage.textContent = `${project.progress}%`;
        
        // ARIA für Fortschrittsbalken
        const progressBar = projectElement.querySelector('.progress-bar');
        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-valuenow', project.progress);
        progressBar.setAttribute('aria-valuemin', 0);
        progressBar.setAttribute('aria-valuemax', 100);
        progressBar.setAttribute('aria-label', `Fortschritt: ${project.progress}%`);
        
        const progressValue = projectElement.querySelector('.progress-value');
        
        // Fortschrittsbalken träge animieren
        // Verzögerte Animation mit kurzer Pause, um die Transition sichtbarer zu machen
        setTimeout(() => {
            progressValue.style.width = `${project.progress}%`;
        }, 50);
        
        // Setze nächsten Schritt
        projectElement.querySelector('.next-step-description').textContent = project.nextStep || 'Kein nächster Schritt definiert';
        
        // Füge Teammitglieder hinzu
        const teamContainer = projectElement.querySelector('.team-members');
        teamContainer.innerHTML = ''; // Leere Container
        
        if (project.team && project.team.length > 0) {
            // Begrenze auf 4 sichtbare Mitglieder + Zähler für den Rest
            const visibleMembers = project.team.slice(0, 4);
            const extraMembers = project.team.length > 4 ? project.team.length - 4 : 0;
            
            // Füge sichtbare Mitglieder hinzu
            visibleMembers.forEach(member => {
                const memberElement = document.createElement('div');
                memberElement.className = 'team-member';
                memberElement.textContent = typeof member === 'string' ? member.charAt(0).toUpperCase() : '?';
                
                // Name im Tooltip und als Datenattribut
                if (typeof member === 'string') {
                    memberElement.setAttribute('data-name', member);
                    memberElement.setAttribute('aria-label', `Team-Mitglied: ${member}`);
                }
                
                teamContainer.appendChild(memberElement);
            });
            
            // Füge Zähler hinzu, falls nötig
            if (extraMembers > 0) {
                const countElement = document.createElement('div');
                countElement.className = 'team-member team-count';
                countElement.textContent = `+${extraMembers}`;
                countElement.setAttribute('aria-label', `${extraMembers} weitere Team-Mitglieder`);
                teamContainer.appendChild(countElement);
            }
        } else {
            // Keine Team-Mitglieder
            const emptyTeam = document.createElement('div');
            emptyTeam.className = 'empty-team';
            emptyTeam.textContent = 'Kein Team zugewiesen';
            teamContainer.appendChild(emptyTeam);
        }
        
        // Setze Deadline
        const deadlineText = projectElement.querySelector('.deadline-text');
        deadlineText.textContent = formatDeadline(project.deadline, project.status);
        
        // Prüfe, ob Deadline kritisch ist (weniger als 7 Tage entfernt)
        if (isDeadlineCritical(project.deadline) && project.status !== 'completed') {
            deadlineText.classList.add('critical-deadline');
            
            // ARIA für Screenreader
            deadlineText.setAttribute('aria-label', 'Kritische Deadline: ' + formatDeadline(project.deadline, project.status));
        } else {
            deadlineText.setAttribute('aria-label', 'Deadline: ' + formatDeadline(project.deadline, project.status));
        }
        
        // Rendere Projektschritte
        renderProjectSteps(projectElement, project);
        
        // Füge das Projekt zum Container hinzu
        projectContainer.appendChild(projectElement);
        
        return projectElement;
    };

    /**
     * Rendert die Schritte eines Projekts
     * @param {HTMLElement} projectElement - Das Projekt-Element
     * @param {Object} project - Projektdaten
     */
    const renderProjectSteps = (projectElement, project) => {
        const stepsContainer = projectElement.querySelector('.project-steps');
        
        // Prüfe, ob Schritte vorhanden sind
        if (!project.steps || project.steps.length === 0) {
            // Zeige Leermeldung
            stepsContainer.querySelector('.steps-empty-message').style.display = 'block';
            
            // ARIA für Screenreader
            stepsContainer.setAttribute('aria-label', 'Keine Schritte vorhanden');
            return;
        }
        
        // Verstecke Leermeldung
        stepsContainer.querySelector('.steps-empty-message').style.display = 'none';
        
        // ARIA für Screenreader
        stepsContainer.setAttribute('aria-label', `${project.steps.length} Schritte`);
        
        // Leere Container
        Array.from(stepsContainer.querySelectorAll('.step-item')).forEach(step => step.remove());
        
        // Füge Schritte hinzu
        project.steps.forEach(step => {
            const stepElement = createStepElement(step);
            stepsContainer.appendChild(stepElement);
        });
    };

    /**
     * Erstellt ein Schritt-Element
     * @param {Object} step - Schrittdaten
     * @returns {HTMLElement} - Das Schritt-Element
     */
    const createStepElement = (step) => {
        // Erstelle Schritt-Element
        const stepElement = document.createElement('div');
        stepElement.className = 'step-item';
        
        // Wenn der Schritt abgeschlossen ist, füge Klasse hinzu
        if (step.completed) {
            stepElement.classList.add('step-completed');
        }
        
        // Setze Schritt-ID als Attribut
        stepElement.dataset.stepId = step.id;
        
        // ARIA-Attribute für Barrierefreiheit
        stepElement.setAttribute('role', 'listitem');
        stepElement.setAttribute('aria-label', `Schritt: ${step.title}, ${step.completed ? 'abgeschlossen' : 'offen'}`);
        
        // Struktur des Schritt-Elements
        stepElement.innerHTML = `
            <div class="step-checkbox" role="checkbox" aria-checked="${step.completed}" tabindex="0"></div>
            <div class="step-content">
                <div class="step-title">${escapeHTML(step.title)}</div>
                <div class="step-description">${escapeHTML(step.description || '')}</div>
            </div>
            <div class="step-actions">
                <span class="edit-step-icon" data-tooltip="Schritt bearbeiten">✏️</span>
            </div>
        `;
        
        // Event-Listener für die Checkbox
        const checkbox = stepElement.querySelector('.step-checkbox');
        checkbox.addEventListener('click', () => {
            toggleStepCompletion(step);
        });
        
        // Tastaturzugriff für Checkbox
        checkbox.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleStepCompletion(step);
            }
        });
        
        return stepElement;
    };

    /**
     * Schaltet den Abschluss-Status eines Schritts um
     * @param {Object} step - Der Schritt
     */
    const toggleStepCompletion = (step) => {
        if (!step || !step.projectId) return;
        
        // Schritt-Status umschalten
        step.completed = !step.completed;
        
        // Schritt aktualisieren
        if (typeof TodoManager !== 'undefined' && TodoManager.updateStep) {
            TodoManager.updateStep(step.projectId, step);
        } else {
            // Fallback, wenn TodoManager nicht verfügbar
            const project = projects[step.projectId];
            if (project && project.steps) {
                const stepIndex = project.steps.findIndex(s => s.id === step.id);
                if (stepIndex >= 0) {
                    project.steps[stepIndex] = step;
                    updateProject(project);
                }
            }
        }
    };

    /**
     * Aktualisiert ein vorhandenes Projekt
     * @param {Object} updatedProject - Aktualisierte Projektdaten
     */
    const updateProject = (updatedProject) => {
        if (!updatedProject || !updatedProject.id) return;
        
        // Aktualisiere Projekt im Speicher
        projects[updatedProject.id] = updatedProject;
        
        // Prüfe, ob Element existiert und expanded-Status speichern
        const projectElement = document.querySelector(`.project-card[data-project="${updatedProject.id}"]`);
        const wasExpanded = projectElement ? projectElement.classList.contains('expanded') : false;
        
        if (projectElement) {
            // Nur dieses spezifische Projekt aktualisieren, nicht alle neu rendern
            renderSingleProject(updatedProject, projectElement, wasExpanded);
        } else {
            // Neues Projekt, einfach hinzufügen
            renderProject(updatedProject);
        }
    };

    /**
     * Aktualisiert ein einzelnes Projektelement
     * @param {Object} project - Projektdaten
     * @param {HTMLElement} element - Bestehende Projektkarte
     * @param {boolean} wasExpanded - War die Projektkarte expandiert
     */
    const renderSingleProject = (project, element, wasExpanded) => {
        // Nur die spezifischen Teile der Projektkarte aktualisieren
        element.querySelector('.project-title').textContent = project.title;
        
        // Status aktualisieren
        const statusElement = element.querySelector('.project-status');
        statusElement.textContent = getStatusText(project.status);
        statusElement.className = 'project-status';
        statusElement.classList.add(`status-${project.status}`);
        
        // Update dataset für Filterung
        element.dataset.status = project.status;
        
        // Fortschritt aktualisieren  
        const progressValue = element.querySelector('.progress-value');
        const progressPercentage = element.querySelector('.progress-percentage');
        progressPercentage.textContent = `${project.progress}%`;
        progressValue.style.width = `${project.progress}%`;
        
        // Nächsten Schritt aktualisieren
        element.querySelector('.next-step-description').textContent = 
            project.nextStep || 'Kein nächster Schritt definiert';
        
        // Deadline aktualisieren
        const deadlineText = element.querySelector('.deadline-text');
        deadlineText.textContent = formatDeadline(project.deadline, project.status);
        
        // Schritte aktualisieren
        const stepsContainer = element.querySelector('.project-steps');
        renderProjectSteps(element, project);
        
        // Expanded-Status wiederherstellen
        if (wasExpanded) {
            element.classList.add('expanded');
            stepsContainer.classList.add('active');
            stepsContainer.style.maxHeight = stepsContainer.scrollHeight + 40 + 'px';
            stepsContainer.style.padding = '20px';
            stepsContainer.style.marginTop = '25px';
        }
    };

    /**
     * Fügt ein neues Projekt hinzu
     * @param {Object} project - Projektdaten
     * @returns {Object|null} - Das hinzugefügte Projekt oder null bei Fehler
     */
    const addProject = (project) => {
        if (!project) return null;
        
        try {
            // ID generieren, falls nicht vorhanden
            if (!project.id) {
                project.id = generateUniqueId();
            }
            
            // Validieren
            if (!validateProject(project)) {
                console.error('Ungültiges Projektformat:', project);
                showError('Projekt konnte nicht hinzugefügt werden: Ungültiges Format');
                return null;
            }
            
            // Normalisieren
            const normalizedProject = normalizeProject(project);
            
            // Füge Projekt zum Speicher hinzu
            projects[normalizedProject.id] = normalizedProject;
            
            // Check if project already exists in DOM
            const projectElement = document.querySelector(`.project-card[data-project="${normalizedProject.id}"]`);
            
            if (projectElement) {
                // Remove the existing project card
                projectElement.remove();
            }
            
            // Leere State entfernen, falls vorhanden
            const emptyState = document.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            
            // Rendere neues Projekt
            renderProject(normalizedProject);
            
            // Event auslösen
            triggerEvent('project-added', normalizedProject);
            
            // In IndexedDB speichern für Offline-Nutzung
            if (typeof OfflineManager !== 'undefined' && typeof OfflineManager.saveProjectsToIndexedDB === 'function') {
                OfflineManager.saveProjectsToIndexedDB();
            }
            
            return normalizedProject;
        } catch (error) {
            console.error('Fehler beim Hinzufügen des Projekts:', error);
            showError('Projekt konnte nicht hinzugefügt werden');
            return null;
        }
    };

    /**
     * Löscht ein Projekt
     * @param {string} projectId - Projekt-ID
     * @returns {boolean} - Ob das Löschen erfolgreich war
     */
    const deleteProject = (projectId) => {
        if (!projectId || !projects[projectId]) return false;
        
        try {
            // Projekt zum Auslösen des Events speichern
            const deletedProject = projects[projectId];
            
            // Entferne Projekt aus dem Speicher
            delete projects[projectId];
            
            // Entferne DOM-Element
            const projectElement = document.querySelector(`.project-card[data-project="${projectId}"]`);
            if (projectElement) {
                projectElement.classList.add('fade-out');
                
                // Animation abwarten, dann entfernen
                setTimeout(() => {
                    projectElement.remove();
                    
                    // Empty state anzeigen, wenn keine Projekte mehr vorhanden
                    if (Object.keys(projects).length === 0) {
                        renderAllProjects();
                    }
                }, 500);
            }
            
            // Event auslösen
            triggerEvent('project-deleted', deletedProject);
            
            // In IndexedDB speichern für Offline-Nutzung
            if (typeof OfflineManager !== 'undefined' && typeof OfflineManager.saveProjectsToIndexedDB === 'function') {
                OfflineManager.saveProjectsToIndexedDB();
            }
            
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen des Projekts:', error);
            showError('Projekt konnte nicht gelöscht werden');
            return false;
        }
    };

    /**
     * Gibt ein Projekt anhand seiner ID zurück
     * @param {string} projectId - Projekt-ID
     * @returns {Object|null} - Das Projekt oder null, wenn nicht gefunden
     */
    const getProject = (projectId) => {
        return projects[projectId] || null;
    };

    /**
     * Gibt alle Projekte zurück
     * @returns {Object} - Alle Projekte
     */
    const getAllProjects = () => {
        return {...projects};
    };

    /**
     * Hilfsfunktion: Formatiert die Deadline
     * @param {string} deadline - Deadline-Datum
     * @param {string} status - Projektstatus
     * @returns {string} - Formatierte Deadline
     */
    const formatDeadline = (deadline, status) => {
        if (!deadline) return 'Keine Deadline';
        
        try {
            const deadlineDate = new Date(deadline);
            const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
            const formattedDate = deadlineDate.toLocaleDateString('de-DE', options);
            
            if (status === 'completed') {
                return `Abgeschlossen: ${formattedDate}`;
            } else {
                return `Fällig: ${formattedDate}`;
            }
        } catch (error) {
            console.error('Fehler beim Formatieren der Deadline:', error);
            return 'Ungültiges Datum';
        }
    };

    /**
     * Hilfsfunktion: Prüft, ob Deadline kritisch ist (weniger als 7 Tage)
     * @param {string} deadline - Deadline-Datum
     * @returns {boolean} - Ob die Deadline kritisch ist
     */
    const isDeadlineCritical = (deadline) => {
        if (!deadline) return false;
        
        try {
            const deadlineDate = new Date(deadline);
            
            // Ungültiges Datum
            if (isNaN(deadlineDate.getTime())) return false;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Nur der Tag zählt
            
            const diffTime = deadlineDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            return diffDays <= 7 && diffDays >= 0;
        } catch (error) {
            console.error('Fehler beim Prüfen der kritischen Deadline:', error);
            return false;
        }
    };

    /**
     * Hilfsfunktion: Gibt Text für Status zurück
     * @param {string} status - Statuscode
     * @returns {string} - Statustext
     */
    const getStatusText = (status) => {
        switch (status) {
            case 'on-track': return 'On Track';
            case 'at-risk': return 'At Risk';
            case 'delayed': return 'Delayed';
            case 'completed': return 'Completed';
            default: return 'Unbekannt';
        }
    };

    /**
     * Escapes HTML special characters to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    const escapeHTML = (text) => {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    /**
     * Hilfsfunktion: Generiert eine eindeutige ID
     * @returns {string} - Eindeutige ID
     */
    const generateUniqueId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    };

    // Public API
    return {
        init,
        loadProjects,
        updateProject,
        addProject,
        deleteProject,
        getProject,
        getAllProjects,
        on,
        calculateProgress,
        renderAllProjects
    };
})();

// Exportiere zum globalen Scope
window.loadProjects = ProjectManager.loadProjects;

// Initialisiere nach dem Laden des Dokuments
document.addEventListener('DOMContentLoaded', () => {
    ProjectManager.init();
});