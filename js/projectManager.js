/**
 * projectManager.js - Verantwortlich für das Verwalten von Projekten
 */

const ProjectManager = (() => {
    // Private Projektobjekt
    let projects = {};

    // DOM-Referenzen cachen
    const projectContainer = document.getElementById('projects-container');
    const projectTemplate = document.getElementById('project-template');

    // Lädt alle Projekte aus der Konfiguration
    const loadProjects = async () => {
        try {
            const response = await fetch('config/projects.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Leere den Projektcontainer
            projectContainer.innerHTML = '';
            
            // Speichere Projekte und rendere sie
            projects = data;
            
            // Erstelle DOM-Elemente für alle Projekte
            Object.values(projects).forEach(project => {
                renderProject(project);
            });
            
            console.log('Projekte erfolgreich geladen:', projects);
        } catch (error) {
            console.error('Fehler beim Laden der Projekte:', error);
            
            // Fallback: Leeres Projektobjekt
            projects = {};
        }
    };

    // Rendert ein einzelnes Projekt
    const renderProject = (project) => {
        // Klone das Template
        const projectElement = document.importNode(projectTemplate.content, true).querySelector('.project-card');
        
        // Setze Projekt-ID und Status als Attribute
        projectElement.dataset.project = project.id;
        projectElement.dataset.status = project.status;
        
        // Fülle Projektdaten aus
        projectElement.querySelector('.project-title').textContent = project.title;
        
        // Setze Status-Klasse und -Text
        const statusElement = projectElement.querySelector('.project-status');
        statusElement.textContent = getStatusText(project.status);
        statusElement.className = 'project-status'; // Reset Klassen
        statusElement.classList.add(`status-${project.status}`);
        
        // Setze Fortschritt
        projectElement.querySelector('.progress-percentage').textContent = `${project.progress}%`;
        const progressValue = projectElement.querySelector('.progress-value');
        
        // Fortschrittsbalken träge animieren
        // Verzögerte Animation mit kurzer Pause, um die Transition sichtbarer zu machen
        setTimeout(() => {
            progressValue.style.width = `${project.progress}%`;
        }, 50);
        
        // Setze nächsten Schritt
        projectElement.querySelector('.next-step-description').textContent = project.nextStep;
        
        // Füge Teammitglieder hinzu
        const teamContainer = projectElement.querySelector('.team-members');
        teamContainer.innerHTML = ''; // Leere Container
        
        // Begrenze auf 4 sichtbare Mitglieder + Zähler für den Rest
        const visibleMembers = project.team.slice(0, 4);
        const extraMembers = project.team.length > 4 ? project.team.length - 4 : 0;
        
        // Füge sichtbare Mitglieder hinzu
        visibleMembers.forEach(member => {
            const memberElement = document.createElement('div');
            memberElement.className = 'team-member';
            memberElement.textContent = member;
            teamContainer.appendChild(memberElement);
        });
        
        // Füge Zähler hinzu, falls nötig
        if (extraMembers > 0) {
            const countElement = document.createElement('div');
            countElement.className = 'team-member team-count';
            countElement.textContent = `+${extraMembers}`;
            teamContainer.appendChild(countElement);
        }
        
        // Setze Deadline
        const deadlineText = projectElement.querySelector('.deadline-text');
        deadlineText.textContent = formatDeadline(project.deadline, project.status);
        
        // Prüfe, ob Deadline kritisch ist (weniger als 7 Tage entfernt)
        if (isDeadlineCritical(project.deadline) && project.status !== 'completed') {
            deadlineText.classList.add('critical-deadline');
        }
        
        // Rendere Projektschritte
        renderProjectSteps(projectElement, project);
        
        // Füge das Projekt zum Container hinzu
        projectContainer.appendChild(projectElement);
    };

    // Rendert die Schritte eines Projekts
    const renderProjectSteps = (projectElement, project) => {
        const stepsContainer = projectElement.querySelector('.project-steps');
        
        // Prüfe, ob Schritte vorhanden sind
        if (!project.steps || project.steps.length === 0) {
            // Zeige Leermeldung
            stepsContainer.querySelector('.steps-empty-message').style.display = 'block';
            return;
        }
        
        // Verstecke Leermeldung
        stepsContainer.querySelector('.steps-empty-message').style.display = 'none';
        
        // Leere Container
        Array.from(stepsContainer.querySelectorAll('.step-item')).forEach(step => step.remove());
        
        // Füge Schritte hinzu
        project.steps.forEach(step => {
            const stepElement = createStepElement(step);
            stepsContainer.appendChild(stepElement);
        });
    };

    // Erstellt ein Schritt-Element
    const createStepElement = (step) => {
        // Klone das Template
        const stepTemplate = document.getElementById('step-template');
        const stepElement = document.importNode(stepTemplate.content, true).querySelector('.step-item');
        
        // Setze Schritt-ID als Attribut
        stepElement.dataset.stepId = step.id;
        
        // Setze Schritt-Daten
        stepElement.querySelector('.step-title').textContent = step.title;
        stepElement.querySelector('.step-description').textContent = step.description;
        
        // Setze Abschluss-Status
        if (step.completed) {
            stepElement.classList.add('step-completed');
        }
        
        return stepElement;
    };

    // Aktualisiert ein vorhandenes Projekt
    const updateProject = (updatedProject) => {
        if (!updatedProject || !updatedProject.id) return;
        
        // Aktualisiere Projekt im Speicher
        projects[updatedProject.id] = updatedProject;
        
        // Aktualisiere DOM
        const projectElement = document.querySelector(`.project-card[data-project="${updatedProject.id}"]`);
        
        if (projectElement) {
            // Entferne altes Element
            projectElement.remove();
        }
        
        // Rendere aktualisiertes Projekt
        renderProject(updatedProject);
    };

    // Fügt ein neues Projekt hinzu
    const addProject = (project) => {
        if (!project || !project.id) return;
        
        // Füge Projekt zum Speicher hinzu
        projects[project.id] = project;
        
        // Check if project already exists in DOM
        const projectElement = document.querySelector(`.project-card[data-project="${project.id}"]`);
        
        if (projectElement) {
            // Remove the existing project card
            projectElement.remove();
        }
        
        // Rendere neues Projekt
        renderProject(project);
    };

    // Löscht ein Projekt
    const deleteProject = (projectId) => {
        if (!projectId || !projects[projectId]) return;
        
        // Entferne Projekt aus dem Speicher
        delete projects[projectId];
        
        // Entferne DOM-Element
        const projectElement = document.querySelector(`.project-card[data-project="${projectId}"]`);
        if (projectElement) {
            projectElement.remove();
        }
    };

    // Gibt ein Projekt anhand seiner ID zurück
    const getProject = (projectId) => {
        return projects[projectId] || null;
    };

    // Gibt alle Projekte zurück
    const getAllProjects = () => {
        return {...projects};
    };

    // Hilfsfunktion: Formatiert die Deadline
    const formatDeadline = (deadline, status) => {
        if (!deadline) return 'Keine Deadline';
        
        const deadlineDate = new Date(deadline);
        const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
        const formattedDate = deadlineDate.toLocaleDateString('de-DE', options);
        
        if (status === 'completed') {
            return `Abgeschlossen: ${formattedDate}`;
        } else {
            return `Fällig: ${formattedDate}`;
        }
    };

    // Hilfsfunktion: Prüft, ob Deadline kritisch ist (weniger als 7 Tage)
    const isDeadlineCritical = (deadline) => {
        if (!deadline) return false;
        
        const deadlineDate = new Date(deadline);
        const today = new Date();
        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays <= 7 && diffDays >= 0;
    };

    // Hilfsfunktion: Gibt Text für Status zurück
    const getStatusText = (status) => {
        switch (status) {
            case 'on-track': return 'On Track';
            case 'at-risk': return 'At Risk';
            case 'delayed': return 'Delayed';
            case 'completed': return 'Completed';
            default: return 'Unbekannt';
        }
    };

    // Public API
    return {
        loadProjects,
        updateProject,
        addProject,
        deleteProject,
        getProject,
        getAllProjects
    };
})();

// Exportiere zum globalen Scope
window.loadProjects = ProjectManager.loadProjects;