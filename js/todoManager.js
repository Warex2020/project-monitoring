/**
 * todoManager.js - Verwaltet Todo/Schritte in den Projekten
 */

const TodoManager = (() => {
    // Fügt einen neuen Schritt zu einem Projekt hinzu
    const addStep = (projectId, step) => {
        if (!projectId || !step) return;
        
        // Hole das Projekt
        const project = ProjectManager.getProject(projectId);
        if (!project) return;
        
        // Füge Schritt hinzu, falls er noch nicht existiert
        if (!project.steps) {
            project.steps = [];
        }
        
        // Prüfe, ob Schritt bereits existiert
        const existingIndex = project.steps.findIndex(s => s.id === step.id);
        if (existingIndex >= 0) {
            project.steps[existingIndex] = step;
        } else {
            project.steps.push(step);
        }
        
        // Aktualisiere das Projekt
        ProjectManager.updateProject(project);
        
        // Aktualisiere die Fortschrittsanzeige
        updateProjectProgress(projectId);
    };

    // Aktualisiert einen vorhandenen Schritt
    const updateStep = (projectId, updatedStep) => {
        if (!projectId || !updatedStep || !updatedStep.id) return;
        
        // Hole das Projekt
        const project = ProjectManager.getProject(projectId);
        if (!project || !project.steps) return;
        
        // Finde den Schritt
        const stepIndex = project.steps.findIndex(step => step.id === updatedStep.id);
        if (stepIndex === -1) return;
        
        // Aktualisiere den Schritt
        project.steps[stepIndex] = updatedStep;
        
        // Aktualisiere das Projekt
        ProjectManager.updateProject(project);
        
        // Aktualisiere die Fortschrittsanzeige
        updateProjectProgress(projectId);
    };

    // Löscht einen Schritt
    const deleteStep = (projectId, stepId) => {
        if (!projectId || !stepId) return;
        
        // Hole das Projekt
        const project = ProjectManager.getProject(projectId);
        if (!project || !project.steps) return;
        
        // Finde den Schritt
        const stepIndex = project.steps.findIndex(step => step.id === stepId);
        if (stepIndex === -1) return;
        
        // Entferne den Schritt
        project.steps.splice(stepIndex, 1);
        
        // Aktualisiere das Projekt
        ProjectManager.updateProject(project);
        
        // Aktualisiere die Fortschrittsanzeige
        updateProjectProgress(projectId);
    };

    // Gibt einen Schritt zurück
    const getStep = (projectId, stepId) => {
        if (!projectId || !stepId) return null;
        
        // Hole das Projekt
        const project = ProjectManager.getProject(projectId);
        if (!project || !project.steps) return null;
        
        // Finde und gib den Schritt zurück
        return project.steps.find(step => step.id === stepId) || null;
    };

    // Berechnet und aktualisiert den Projektfortschritt basierend auf abgeschlossenen Schritten
    const updateProjectProgress = (projectId) => {
        const project = ProjectManager.getProject(projectId);
        if (!project || !project.steps || project.steps.length === 0) return;
        
        // Berechne Prozentsatz abgeschlossener Schritte
        const completedSteps = project.steps.filter(step => step.completed).length;
        const totalSteps = project.steps.length;
        const progressPercentage = Math.round((completedSteps / totalSteps) * 100);
        
        // Speichere alten Fortschrittswert, um Animation nur bei Änderung auszulösen
        const oldProgress = project.progress;
        
        // Aktualisiere Projekt-Fortschritt
        project.progress = progressPercentage;
        
        // Aktualisiere Projekt-Status basierend auf Fortschritt
        updateProjectStatus(project);
        
        // Aktualisiere nächsten Schritt
        updateNextStep(project);
        
        // Aktualisiere das Projekt mit animiertem Übergang
        if (oldProgress !== progressPercentage) {
            ProjectManager.updateProject(project);
        }
    };

    // Aktualisiert den Projektstatus basierend auf Fortschritt und Deadline
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

    // Aktualisiert den nächsten Schritt für ein Projekt
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

    // Public API
    return {
        addStep,
        updateStep,
        deleteStep,
        getStep,
        updateProjectProgress
    };
})();