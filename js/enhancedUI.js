/**
 * enhancedUI.js - Erweiterte UI-Funktionen für das Dashboard
 * 
 * Enthält:
 * - Drag-and-Drop für Aufgaben
 * - Sortier- und Filterfunktionen
 * - Verbesserte Animationen
 * - Erweiterte UI-Steuerelemente
 */

const EnhancedUI = (() => {
    // Caching von DOM-Elementen
    let projectsContainer = null;
    let filterControls = null;
    let sortControls = null;
    let ganttViewButton = null;
    let hideCompletedToggle = null;
    
    // Zustand
    let isDragging = false;
    let draggedElement = null;
    let hideCompleted = false;
    let currentSort = {field: 'deadline', direction: 'asc'};
    let currentFilter = null;
    
    // Initialisiert die verbesserten UI-Funktionen
    const init = () => {
        // DOM-Elemente cachen
        projectsContainer = document.getElementById('projects-container');
        
        // Erstelle UI-Kontrollelemente
        createUIControls();
        
        // Event-Listener hinzufügen
        addEventListeners();
        
        // Anfängliche Sortierung anwenden
        applySort();
        
        console.log('EnhancedUI initialisiert');
    };

    // Erstellt die UI-Kontrollelemente für Filter, Sortierung etc.
    const createUIControls = () => {
        // Container für Kontrollelemente erstellen
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'ui-controls';
        
        // Erstelle Filter-Kontrollelemente
        filterControls = createFilterControls();
        
        // Erstelle Sortier-Kontrollelemente
        sortControls = createSortControls();

        // Erstelle "Abgeschlossene ausblenden"-Toggle
        hideCompletedToggle = createHideCompletedToggle();
        
        // Erstelle Gantt-Chart-Button
        ganttViewButton = createGanttViewButton();
        
        // Füge alle Kontrollelemente zum Container hinzu
        controlsContainer.appendChild(filterControls);
        controlsContainer.appendChild(sortControls);
        controlsContainer.appendChild(hideCompletedToggle);
        controlsContainer.appendChild(ganttViewButton);
        
        // Füge den Container zur Seite hinzu
        const actionBar = document.querySelector('.action-bar');
        if (actionBar) {
            actionBar.appendChild(controlsContainer);
        }
    };
    
    // Erstellt die Filter-Kontrollelemente
    const createFilterControls = () => {
        const container = document.createElement('div');
        container.className = 'filter-controls control-group';
        
        // Filter-Label
        const label = document.createElement('span');
        label.className = 'control-label';
        label.textContent = 'Filter:';
        
        // Filter-Dropdown
        const select = document.createElement('select');
        select.id = 'project-filter';
        
        // Filter-Optionen
        const options = [
            {value: '', text: 'Alle anzeigen'},
            {value: 'on-track', text: 'On Track'},
            {value: 'at-risk', text: 'At Risk'},
            {value: 'delayed', text: 'Verzögert'},
            {value: 'completed', text: 'Abgeschlossen'}
        ];
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.text;
            select.appendChild(optElement);
        });
        
        // Event-Listener für Filter-Änderungen
        select.addEventListener('change', () => {
            currentFilter = select.value;
            applyFilter();
        });
        
        // Füge alles zum Container hinzu
        container.appendChild(label);
        container.appendChild(select);
        
        return container;
    };
    
    // Erstellt die Sortier-Kontrollelemente
    const createSortControls = () => {
        const container = document.createElement('div');
        container.className = 'sort-controls control-group';
        
        // Sortier-Label
        const label = document.createElement('span');
        label.className = 'control-label';
        label.textContent = 'Sortieren:';
        
        // Sortier-Dropdown
        const select = document.createElement('select');
        select.id = 'project-sort';
        
        // Sortier-Optionen
        const options = [
            {value: 'deadline-asc', text: 'Deadline (aufsteigend)'},
            {value: 'deadline-desc', text: 'Deadline (absteigend)'},
            {value: 'progress-asc', text: 'Fortschritt (aufsteigend)'},
            {value: 'progress-desc', text: 'Fortschritt (absteigend)'},
            {value: 'title-asc', text: 'Titel (A-Z)'},
            {value: 'title-desc', text: 'Titel (Z-A)'}
        ];
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.text;
            select.appendChild(optElement);
        });
        
        // Event-Listener für Sortier-Änderungen
        select.addEventListener('change', () => {
            const [field, direction] = select.value.split('-');
            currentSort = {field, direction};
            applySort();
        });
        
        // Füge alles zum Container hinzu
        container.appendChild(label);
        container.appendChild(select);
        
        return container;
    };
    
    // Erstellt den "Abgeschlossene ausblenden"-Toggle
    const createHideCompletedToggle = () => {
        const container = document.createElement('div');
        container.className = 'hide-completed-toggle control-group';
        
        // Erstelle Checkbox
        const checkboxContainer = document.createElement('label');
        checkboxContainer.className = 'checkbox-container control-label';
        checkboxContainer.textContent = 'Erledigte ausblenden';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'hide-completed';
        
        const checkmark = document.createElement('span');
        checkmark.className = 'checkmark';
        
        // Event-Listener für Checkbox
        checkbox.addEventListener('change', () => {
            hideCompleted = checkbox.checked;
            applyHideCompleted();
        });
        
        // Füge alles zum Container hinzu
        checkboxContainer.prepend(checkbox);
        checkboxContainer.appendChild(checkmark);
        container.appendChild(checkboxContainer);
        
        return container;
    };
    
    // Erstellt den Gantt-Chart-Button
    const createGanttViewButton = () => {
        const button = document.createElement('button');
        button.className = 'gantt-view-button action-button secondary';
        button.textContent = 'Gantt-Ansicht';
        button.title = 'Zeigt Projekte in einer Gantt-Diagramm-Ansicht';
        
        // Event-Listener für Klick auf den Button
        button.addEventListener('click', () => {
            toggleGanttView();
        });
        
        return button;
    };
    
    // Fügt Event-Listener für Drag-and-Drop und andere Interaktionen hinzu
    const addEventListeners = () => {
        // Delegierter Event-Listener für Drag-and-Drop
        projectsContainer.addEventListener('mousedown', handleDragStart);
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        
        // Zusätzlich Touch-Events für mobile Geräte
        projectsContainer.addEventListener('touchstart', handleTouchStart, {passive: false});
        document.addEventListener('touchmove', handleTouchMove, {passive: false});
        document.addEventListener('touchend', handleTouchEnd);
        
        // Event-Delegation für Projekte updaten
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    initDraggableItems();
                }
            });
        });
        
        observer.observe(projectsContainer, { childList: true });
        
        // Initialisiere Drag-and-Drop für vorhandene Elemente
        initDraggableItems();
    };
    
    // Initialisiert Drag-and-Drop für Projektschritte
    const initDraggableItems = () => {
        // Für alle Projektschritte Drag-and-Drop aktivieren
        document.querySelectorAll('.step-item').forEach(stepItem => {
            if (!stepItem.getAttribute('draggable')) {
                stepItem.setAttribute('draggable', 'true');
                
                // Visuelles Feedback für Drag-and-Drop
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
        
        // Für alle Projekte Drag-and-Drop-Ziele aktivieren
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
    
    // Handler für Drag-Start (Maus)
    const handleDragStart = (e) => {
        // Nur Schritte sind draggable, nicht die Projekte selbst
        const stepItem = e.target.closest('.step-item');
        if (!stepItem) return;
        
        // Verhindern von Text-Selektion während Drag
        e.preventDefault();
        
        isDragging = true;
        draggedElement = stepItem;
        
        // Visuelles Feedback
        stepItem.classList.add('dragging');
        
        // Position des Mauszeigers innerhalb des Elements speichern
        const rect = stepItem.getBoundingClientRect();
        stepItem.dragOffsetX = e.clientX - rect.left;
        stepItem.dragOffsetY = e.clientY - rect.top;
        
        // Clone für Ghost-Drag-Element erstellen
        const clone = stepItem.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.opacity = '0.5';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '1000';
        clone.style.width = rect.width + 'px';
        clone.id = 'drag-ghost';
        
        document.body.appendChild(clone);
        
        // Position des Klons aktualisieren
        updateDragGhostPosition(e.clientX, e.clientY);
    };
    
    // Handler für Touch-Start (Touch-Geräte)
    const handleTouchStart = (e) => {
        const stepItem = e.target.closest('.step-item');
        if (!stepItem) return;
        
        // Nur für Schritte, nicht für die Projekte selbst
        if (stepItem) {
            e.preventDefault(); // Verhindern des Scrollens
            
            const touch = e.touches[0];
            
            isDragging = true;
            draggedElement = stepItem;
            
            // Visuelles Feedback
            stepItem.classList.add('dragging');
            
            // Position des Touches innerhalb des Elements speichern
            const rect = stepItem.getBoundingClientRect();
            stepItem.dragOffsetX = touch.clientX - rect.left;
            stepItem.dragOffsetY = touch.clientY - rect.top;
            
            // Clone für Ghost-Drag-Element erstellen
            const clone = stepItem.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.opacity = '0.5';
            clone.style.pointerEvents = 'none';
            clone.style.zIndex = '1000';
            clone.style.width = rect.width + 'px';
            clone.id = 'drag-ghost';
            
            document.body.appendChild(clone);
            
            // Position des Klons aktualisieren
            updateDragGhostPosition(touch.clientX, touch.clientY);
        }
    };
    
    // Handler für Drag-Move (Maus)
    const handleDragMove = (e) => {
        if (!isDragging || !draggedElement) return;
        
        updateDragGhostPosition(e.clientX, e.clientY);
        
        // Finde das Ziel-Container unter dem Cursor
        const dropContainer = getDropContainerAtPoint(e.clientX, e.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(e.clientY, dropContainer);
            
            // Visuelles Feedback zurücksetzen
            resetDropTargets();
            
            // Visuelles Feedback für das aktuelle Ziel
            if (dragTarget) {
                dragTarget.classList.add('drop-target');
            }
        } else {
            resetDropTargets();
        }
    };
    
    // Handler für Touch-Move (Touch-Geräte)
    const handleTouchMove = (e) => {
        if (!isDragging || !draggedElement) return;
        
        e.preventDefault(); // Verhindern des Scrollens
        
        const touch = e.touches[0];
        
        updateDragGhostPosition(touch.clientX, touch.clientY);
        
        // Finde das Ziel-Container unter dem Touch-Punkt
        const dropContainer = getDropContainerAtPoint(touch.clientX, touch.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(touch.clientY, dropContainer);
            
            // Visuelles Feedback zurücksetzen
            resetDropTargets();
            
            // Visuelles Feedback für das aktuelle Ziel
            if (dragTarget) {
                dragTarget.classList.add('drop-target');
            }
        } else {
            resetDropTargets();
        }
    };
    
    // Handler für Drag-End (Maus)
    const handleDragEnd = (e) => {
        if (!isDragging) return;
        
        // Finde das Ziel-Container unter dem Cursor
        const dropContainer = getDropContainerAtPoint(e.clientX, e.clientY);
        if (dropContainer) {
            const dragTarget = getDragTarget(e.clientY, dropContainer);
            
            if (dragTarget && draggedElement) {
                // Verarbeite den Drop
                handleStepDrop(draggedElement.dataset.stepId, dragTarget, dropContainer);
            }
        }
        
        // Bereinige den Drag-Zustand
        cleanupDrag();
    };
    
    // Handler für Touch-End (Touch-Geräte)
    const handleTouchEnd = (e) => {
        if (!isDragging) return;
        
        // Wenn Touch-Ereignis beendet wird, kann es keine Koordinaten haben
        // Verwende den letzten bekannten Touchpunkt oder beende den Drag
        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            
            // Finde das Ziel-Container unter dem letzten Touch-Punkt
            const dropContainer = getDropContainerAtPoint(touch.clientX, touch.clientY);
            if (dropContainer) {
                const dragTarget = getDragTarget(touch.clientY, dropContainer);
                
                if (dragTarget && draggedElement) {
                    // Verarbeite den Drop
                    handleStepDrop(draggedElement.dataset.stepId, dragTarget, dropContainer);
                }
            }
        }
        
        // Bereinige den Drag-Zustand
        cleanupDrag();
    };
    
    // Aktualisiert die Position des Drag-Ghost-Elements
    const updateDragGhostPosition = (clientX, clientY) => {
        const ghostElement = document.getElementById('drag-ghost');
        if (ghostElement && draggedElement) {
            ghostElement.style.left = (clientX - draggedElement.dragOffsetX) + 'px';
            ghostElement.style.top = (clientY - draggedElement.dragOffsetY) + 'px';
        }
    };
    
    // Findet den Drop-Container unter dem angegebenen Punkt
    const getDropContainerAtPoint = (x, y) => {
        const elements = document.elementsFromPoint(x, y);
        
        // Suche nach dem ersten .project-steps-Element in der Liste
        for (const element of elements) {
            if (element.closest('.project-steps')) {
                return element.closest('.project-steps');
            }
        }
        
        return null;
    };
    
    // Findet das Drag-Ziel basierend auf der Y-Position
    const getDragTarget = (clientY, container) => {
        const stepItems = Array.from(container.querySelectorAll('.step-item:not(.dragging)'));
        
        if (stepItems.length === 0) {
            // Container ist leer, Ziel ist der Container selbst
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
    
    // Verarbeitet das Fallenlassen eines Schritts
    const handleStepDrop = (stepId, targetElement, targetContainer) => {
        if (!stepId) return;
        
        // Finde den Ursprungsschritt
        const sourceStep = document.querySelector(`.step-item[data-step-id="${stepId}"]`);
        if (!sourceStep) return;
        
        const sourceProjectId = sourceStep.closest('.project-card').dataset.project;
        const targetProjectId = targetContainer.closest('.project-card').dataset.project;
        
        // Wenn Ziel ein Schritt ist, vor diesem einfügen
        if (targetElement.classList.contains('step-item')) {
            targetContainer.insertBefore(sourceStep, targetElement);
        } else {
            // Sonst am Ende des Containers einfügen
            targetContainer.appendChild(sourceStep);
        }
        
        // Wenn Projekt sich geändert hat, Step zum neuen Projekt zuordnen
        if (sourceProjectId !== targetProjectId) {
            // Hol Step und Projekt-Daten aus den Managern
            const step = TodoManager.getStep(sourceProjectId, stepId);
            if (step) {
                // Schritt vom alten Projekt entfernen
                TodoManager.deleteStep(sourceProjectId, stepId);
                
                // Schritt im neuen Projekt hinzufügen
                step.projectId = targetProjectId;
                TodoManager.addStep(targetProjectId, step);
                
                // Aktualisiere UI
                updateProjectProgress(sourceProjectId);
                updateProjectProgress(targetProjectId);
            }
        } else {
            // Nur die Reihenfolge der Schritte aktualisieren
            updateStepOrder(targetProjectId, targetContainer);
        }
    };
    
    // Aktualisiert die Reihenfolge der Schritte in einem Projekt
    const updateStepOrder = (projectId, stepsContainer) => {
        const project = ProjectManager.getProject(projectId);
        if (!project) return;
        
        // Neue Reihenfolge der Schritte erfassen
        const newOrder = Array.from(stepsContainer.querySelectorAll('.step-item'))
            .map(item => item.dataset.stepId);
        
        // Schritte in der neuen Reihenfolge sortieren
        project.steps.sort((a, b) => {
            return newOrder.indexOf(a.id) - newOrder.indexOf(b.id);
        });
        
        // Projekt aktualisieren
        ProjectManager.updateProject(project);
        
        // WebSocket-Nachricht senden
        sendWebSocketMessage('update_project', project);
    };
    
    // Setzt das Styling für alle Drop-Targets zurück
    const resetDropTargets = () => {
        document.querySelectorAll('.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
    };
    
    // Bereinigt den Drag-Zustand
    const cleanupDrag = () => {
        isDragging = false;
        
        // Ghost-Element entfernen
        const ghostElement = document.getElementById('drag-ghost');
        if (ghostElement) {
            ghostElement.remove();
        }
        
        // Drag-Styling zurücksetzen
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement = null;
        }
        
        // Drop-Target-Styling zurücksetzen
        resetDropTargets();
    };
    
    // Aktualisiert den Fortschritt eines Projekts
    const updateProjectProgress = (projectId) => {
        if (typeof TodoManager !== 'undefined' && typeof TodoManager.updateProjectProgress === 'function') {
            TodoManager.updateProjectProgress(projectId);
        }
    };
    
    // Filtert Projekte basierend auf dem aktuellen Filter
    const applyFilter = () => {
        if (!projectsContainer) return;
        
        const projects = projectsContainer.querySelectorAll('.project-card');
        
        projects.forEach(project => {
            if (!currentFilter || project.dataset.status === currentFilter) {
                // Erst prüfen ob das Projekt abgeschlossen ist und hideCompleted aktiv
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
    
    // Sortiert Projekte basierend auf der aktuellen Sortierung
    const applySort = () => {
        if (!projectsContainer) return;
        
        const projects = Array.from(projectsContainer.querySelectorAll('.project-card'));
        
        // Projekte sortieren
        projects.sort((a, b) => {
            let valueA, valueB;
            
            switch (currentSort.field) {
                case 'deadline':
                    // Extrahiere Datum aus dem Text
                    const deadlineTextA = a.querySelector('.deadline-text').textContent;
                    const deadlineTextB = b.querySelector('.deadline-text').textContent;
                    
                    // Extrahiere nur das Datum aus dem Format "Fällig: DD.MM.YYYY"
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
            
            // Sortierrichtung anwenden
            const direction = currentSort.direction === 'asc' ? 1 : -1;
            
            if (valueA < valueB) return -1 * direction;
            if (valueA > valueB) return 1 * direction;
            return 0;
        });
        
        // Sortierte Projekte wieder in den Container einfügen
        projects.forEach(project => {
            projectsContainer.appendChild(project);
        });
    };
    
    // Wendet den "Abgeschlossene ausblenden"-Filter an
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
    
    // Schaltet die Gantt-Ansicht ein/aus
    const toggleGanttView = () => {
        const ganttView = document.getElementById('gantt-view');
        
        if (ganttView) {
            // Gantt-Ansicht ausblenden
            ganttView.classList.remove('active');
            setTimeout(() => {
                ganttView.remove();
            }, 300);
            
            // Normale Ansicht wieder anzeigen
            projectsContainer.style.display = 'grid';
            
            // Button-Text aktualisieren
            ganttViewButton.textContent = 'Gantt-Ansicht';
        } else {
            // Normale Ansicht ausblenden
            projectsContainer.style.display = 'none';
            
            // Gantt-Ansicht erstellen und anzeigen
            createGanttView();
            
            // Button-Text aktualisieren
            ganttViewButton.textContent = 'Normale Ansicht';
        }
    };
    
    // Erstellt die Gantt-Chart-Ansicht
    const createGanttView = () => {
        const ganttView = document.createElement('div');
        ganttView.id = 'gantt-view';
        ganttView.className = 'gantt-view';
        
        // Hole alle Projekte
        const projects = Object.values(ProjectManager.getAllProjects());
        
        // Erstelle Gantt-Chart-Header
        const ganttHeader = createGanttHeader(projects);
        ganttView.appendChild(ganttHeader);
        
        // Erstelle Gantt-Chart-Body
        const ganttBody = createGanttBody(projects);
        ganttView.appendChild(ganttBody);
        
        // Füge Gantt-View zur Seite hinzu
        const container = document.querySelector('.container');
        container.insertBefore(ganttView, projectsContainer.nextSibling);
        
        // Animation für das Einblenden
        setTimeout(() => {
            ganttView.classList.add('active');
        }, 10);
    };
    
    // Erstellt den Header für das Gantt-Chart
    const createGanttHeader = (projects) => {
        const header = document.createElement('div');
        header.className = 'gantt-header';
        
        // Projekttitel-Spalte
        const titleColumn = document.createElement('div');
        titleColumn.className = 'gantt-column gantt-title-column';
        titleColumn.textContent = 'Projekt';
        header.appendChild(titleColumn);
        
        // Zeitraum für das Gantt-Chart bestimmen
        const timeRange = calculateTimeRange(projects);
        const startDate = timeRange.start;
        const endDate = timeRange.end;
        
        // Zeitlinie erstellen (für jeden Tag eine Spalte)
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const dateColumn = document.createElement('div');
            dateColumn.className = 'gantt-column gantt-date-column';
            
            // Format: DD.MM.
            const day = String(currentDate.getDate()).padStart(2, '0');
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            dateColumn.textContent = `${day}.${month}`;
            
            // Wochenenden hervorheben
            if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                dateColumn.classList.add('weekend');
            }
            
            // Heutigen Tag hervorheben
            const today = new Date();
            if (currentDate.getDate() === today.getDate() && 
                currentDate.getMonth() === today.getMonth() && 
                currentDate.getFullYear() === today.getFullYear()) {
                dateColumn.classList.add('today');
            }
            
            header.appendChild(dateColumn);
            
            // Nächster Tag
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return header;
    };
    
    // Erstellt den Body für das Gantt-Chart
    const createGanttBody = (projects) => {
        const body = document.createElement('div');
        body.className = 'gantt-body';
        
        // Zeitraum für das Gantt-Chart
        const timeRange = calculateTimeRange(projects);
        const startDate = timeRange.start;
        const endDate = timeRange.end;
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        // Für jedes Projekt eine Zeile erstellen
        projects.forEach(project => {
            const row = document.createElement('div');
            row.className = 'gantt-row';
            
            // Status-Klasse für Styling
            row.classList.add(`status-${project.status}`);
            
            // Projekttitel-Spalte
            const titleColumn = document.createElement('div');
            titleColumn.className = 'gantt-column gantt-title-column';
            titleColumn.textContent = project.title;
            row.appendChild(titleColumn);
            
            // Projektbalken-Container über alle Tage
            const barContainer = document.createElement('div');
            barContainer.className = 'gantt-bar-container';
            barContainer.style.gridColumn = `2 / span ${totalDays}`;
            
            // Deadline des Projekts parsen
            const deadlineDate = project.deadline ? new Date(project.deadline) : null;
            
            // Projektbalken erstellen
            if (deadlineDate) {
                const projectBar = document.createElement('div');
                projectBar.className = 'gantt-project-bar';
                
                // Balken-Breite basierend auf Projektdauer (mindestens 1 Tag)
                const startDay = 1; // Beginne am ersten Tag
                
                // Berechne Tage zwischen Start und Deadline
                const deadlineDay = Math.ceil((deadlineDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                
                // Positioniere den Balken
                projectBar.style.gridColumn = `${startDay} / ${deadlineDay + 1}`;
                
                // Statusklasse für Styling
                projectBar.classList.add(`status-${project.status}`);
                
                // Fortschritt im Balken anzeigen
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'gantt-progress-indicator';
                progressIndicator.style.width = `${project.progress}%`;
                projectBar.appendChild(progressIndicator);
                
                // Projekttitel im Balken anzeigen
                const barTitle = document.createElement('span');
                barTitle.className = 'gantt-bar-title';
                barTitle.textContent = `${project.progress}%`;
                projectBar.appendChild(barTitle);
                
                barContainer.appendChild(projectBar);
                
                // Deadline-Marker
                const deadlineMarker = document.createElement('div');
                deadlineMarker.className = 'gantt-deadline-marker';
                deadlineMarker.style.gridColumn = deadlineDay;
                deadlineMarker.title = `Deadline: ${formatDate(deadlineDate)}`;
                barContainer.appendChild(deadlineMarker);
            }
            
            row.appendChild(barContainer);
            body.appendChild(row);
            
            // Schritte als Unterzeilen hinzufügen, wenn vorhanden
            if (project.steps && project.steps.length > 0) {
                project.steps.forEach(step => {
                    const stepRow = document.createElement('div');
                    stepRow.className = 'gantt-row gantt-step-row';
                    
                    if (step.completed) {
                        stepRow.classList.add('completed');
                    }
                    
                    // Schritt-Titel (eingerückt)
                    const stepTitleColumn = document.createElement('div');
                    stepTitleColumn.className = 'gantt-column gantt-title-column step-title';
                    stepTitleColumn.textContent = step.title;
                    stepRow.appendChild(stepTitleColumn);
                    
                    // Schritt als Marker im Gantt-Chart
                    const stepBarContainer = document.createElement('div');
                    stepBarContainer.className = 'gantt-bar-container';
                    stepBarContainer.style.gridColumn = `2 / span ${totalDays}`;
                    
                    // Schritt-Marker erstellen (einfacher Punkt oder Diamant)
                    const stepMarker = document.createElement('div');
                    stepMarker.className = 'gantt-step-marker';
                    
                    // Positioniere den Marker (vereinfacht in der Mitte)
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
    
    // Berechnet den Zeitraum für das Gantt-Chart basierend auf den Projekten
    const calculateTimeRange = (projects) => {
        let earliestDate = new Date();
        let latestDate = new Date();
        
        // Setze die früheste auf heute und die späteste auf heute + 30 Tage als Standard
        latestDate.setDate(latestDate.getDate() + 30);
        
        // Durchlaufe alle Projekte und prüfe Deadlines
        projects.forEach(project => {
            if (project.deadline) {
                const deadlineDate = new Date(project.deadline);
                
                if (deadlineDate > latestDate) {
                    latestDate = new Date(deadlineDate);
                }
            }
        });
        
        // Füge etwas Puffer hinzu (3 Tage vor und nach)
        earliestDate.setDate(earliestDate.getDate() - 3);
        latestDate.setDate(latestDate.getDate() + 3);
        
        return {
            start: earliestDate,
            end: latestDate
        };
    };
    
    // Blendet ein Element sanft aus
    const fadeOutElement = (element) => {
        // Erst die Transition vorbereiten
        element.style.transition = 'opacity 0.3s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
        
        // Dann die neuen Werte setzen
        element.style.opacity = '0';
        
        // Nach kurzer Verzögerung ausblenden
        setTimeout(() => {
            const originalHeight = element.offsetHeight;
            element.style.maxHeight = originalHeight + 'px';
            
            // Kurze Verzögerung für den Übergang
            setTimeout(() => {
                element.style.maxHeight = '0';
                element.style.marginTop = '0';
                element.style.marginBottom = '0';
                element.style.paddingTop = '0';
                element.style.paddingBottom = '0';
                element.style.overflow = 'hidden';
            }, 50);
        }, 300);
    };
    
    // Blendet ein Element sanft ein
    const fadeInElement = (element) => {
        // Reset der Stile
        element.style.transition = 'opacity 0.3s ease, max-height 0.5s ease, margin 0.5s ease, padding 0.5s ease';
        
        // Höhe zurücksetzen und sichtbar machen
        element.style.maxHeight = '1000px'; // Höher als die maximale Projekthöhe
        element.style.marginTop = '';
        element.style.marginBottom = '';
        element.style.paddingTop = '';
        element.style.paddingBottom = '';
        
        // Kurze Verzögerung für den Übergang
        setTimeout(() => {
            element.style.opacity = '1';
            
            // Nach der Transition Overflow zurücksetzen
            setTimeout(() => {
                element.style.overflow = '';
            }, 500);
        }, 50);
    };
    
    // Hilfsfunktion zum Parsen eines deutschen Datums (DD.MM.YYYY)
    const parseGermanDate = (dateString) => {
        if (!dateString) return null;
        
        // Regulärer Ausdruck für DD.MM.YYYY
        const match = dateString.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (match) {
            return new Date(match[3], match[2] - 1, match[1]);
        }
        
        return null;
    };
    
    // Hilfsfunktion zum Formatieren eines Datums als DD.MM.YYYY
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

// Initialisiere nach dem Laden des Dokuments
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        EnhancedUI.init();
    }, 1000); // Warte, bis andere Module initialisiert sind
});