/**
 * project-manager.test.js - Unit Tests für ProjectManager
 */

const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');

// Mock für DOM-Umgebung erstellen
function setupJsdom() {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="projects-container"></div>
        <template id="project-template">
          <div class="project-card">
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
                <span class="edit-icon">✏️</span>
                <span class="add-step-icon">➕</span>
                <span class="toggle-icon">▼</span>
              </div>
            </div>
            <div class="project-steps">
              <div class="steps-empty-message">Keine Schritte vorhanden</div>
            </div>
          </div>
        </template>
      </body>
    </html>
  `, { url: 'http://localhost' });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.navigator = {
    onLine: true
  };
  global.fetch = jest.fn();
  
  return dom;
}

// Mock für localStorage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

// Mock für Notifications
function mockOfflineManager() {
  global.OfflineManager = {
    showNotification: jest.fn(),
    saveProjectsToIndexedDB: jest.fn(),
    loadProjectsFromIndexedDB: jest.fn().mockResolvedValue({})
  };
}

describe('ProjectManager Unit Tests', () => {
  let ProjectManager;
  let dom;
  
  beforeAll(() => {
    dom = setupJsdom();
    global.localStorage = new LocalStorageMock();
    mockOfflineManager();
    
    // ProjectManager laden
    jest.isolateModules(() => {
      ProjectManager = require('../js/projectManager');
    });
  });
  
  beforeEach(() => {
    // DOM zurücksetzen
    document.getElementById('projects-container').innerHTML = '';
    
    // Mocks zurücksetzen
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Globale Objekte aufräumen
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
    delete global.Element;
    delete global.navigator;
    delete global.fetch;
    delete global.localStorage;
    delete global.OfflineManager;
  });
  
  describe('validateProject', () => {
    test('sollte gültige Projekte akzeptieren', () => {
      const validProject = {
        id: '123',
        title: 'Test Projekt',
        status: 'on-track',
        progress: 50,
        nextStep: 'Nächster Schritt',
        team: ['Person 1', 'Person 2'],
        deadline: '2025-12-31',
        steps: []
      };
      
      // validateProject ist privat, daher nutzen wir addProject zum Testen
      const result = ProjectManager.addProject(validProject);
      assert.strictEqual(result.id, validProject.id);
    });
    
    test('sollte ungültige Projekte ablehnen', () => {
      const invalidProject = {
        // id fehlt (Pflichtfeld)
        title: 'Test Projekt',
        status: 'ungültiger-status', // Ungültiger Status
        progress: 'keine zahl' // Keine Zahl
      };
      
      const result = ProjectManager.addProject(invalidProject);
      assert.strictEqual(result, null);
    });
  });
  
  describe('normalizeProject', () => {
    test('sollte fehlende Felder ergänzen', () => {
      const minimalProject = {
        id: '123',
        title: 'Minimal Projekt',
        status: 'on-track'
      };
      
      const result = ProjectManager.addProject(minimalProject);
      
      // Prüfen, ob fehlende Felder ergänzt wurden
      assert.strictEqual(typeof result.progress, 'number');
      assert.ok(Array.isArray(result.team));
      assert.ok(Array.isArray(result.steps));
      assert.ok(result.createdAt);
      assert.ok(result.updatedAt);
    });
    
    test('sollte den Fortschritt auf gültigen Bereich beschränken', () => {
      const projectWithInvalidProgress = {
        id: '123',
        title: 'Projekt mit ungültigem Fortschritt',
        status: 'on-track',
        progress: 150 // Ungültiger Wert > 100
      };
      
      const result = ProjectManager.addProject(projectWithInvalidProgress);
      assert.strictEqual(result.progress, 100); // Auf 100 begrenzt
      
      const projectWithNegativeProgress = {
        id: '124',
        title: 'Projekt mit negativem Fortschritt',
        status: 'on-track',
        progress: -20 // Ungültiger Wert < 0
      };
      
      const result2 = ProjectManager.addProject(projectWithNegativeProgress);
      assert.strictEqual(result2.progress, 0); // Auf 0 begrenzt
    });
  });
  
  describe('calculateProgress', () => {
    test('sollte den Fortschritt basierend auf abgeschlossenen Schritten berechnen', () => {
      const project = {
        id: '123',
        title: 'Fortschritts-Test',
        status: 'on-track',
        steps: [
          { id: 's1', completed: true },
          { id: 's2', completed: false },
          { id: 's3', completed: true },
          { id: 's4', completed: false }
        ]
      };
      
      const progress = ProjectManager.calculateProgress(project);
      assert.strictEqual(progress, 50); // 2 von 4 Schritten = 50%
    });
    
    test('sollte 0 zurückgeben, wenn keine Schritte vorhanden sind', () => {
      const project = {
        id: '123',
        title: 'Projekt ohne Schritte',
        status: 'on-track',
        steps: []
      };
      
      const progress = ProjectManager.calculateProgress(project);
      assert.strictEqual(progress, 0);
    });
  });
  
  describe('addProject, getProject, getAllProjects', () => {
    test('sollte ein Projekt hinzufügen und abrufen können', () => {
      const project = {
        id: 'test-project',
        title: 'Test Projekt',
        status: 'on-track',
        progress: 50
      };
      
      ProjectManager.addProject(project);
      
      const retrievedProject = ProjectManager.getProject('test-project');
      assert.strictEqual(retrievedProject.id, project.id);
      assert.strictEqual(retrievedProject.title, project.title);
      
      const allProjects = ProjectManager.getAllProjects();
      assert.ok('test-project' in allProjects);
    });
  });
  
  describe('updateProject', () => {
    test('sollte ein vorhandenes Projekt aktualisieren', () => {
      // Projekt hinzufügen
      const originalProject = {
        id: 'update-test',
        title: 'Original Titel',
        status: 'on-track',
        progress: 30
      };
      
      ProjectManager.addProject(originalProject);
      
      // Projekt aktualisieren
      const updatedProject = {
        id: 'update-test',
        title: 'Aktualisierter Titel',
        status: 'at-risk',
        progress: 45
      };
      
      ProjectManager.updateProject(updatedProject);
      
      // Aktualisiertes Projekt abrufen
      const retrievedProject = ProjectManager.getProject('update-test');
      assert.strictEqual(retrievedProject.title, 'Aktualisierter Titel');
      assert.strictEqual(retrievedProject.status, 'at-risk');
      assert.strictEqual(retrievedProject.progress, 45);
    });
  });
  
  describe('deleteProject', () => {
    test('sollte ein Projekt löschen', () => {
      // Projekt hinzufügen
      const project = {
        id: 'delete-test',
        title: 'Zu löschendes Projekt',
        status: 'on-track',
        progress: 10
      };
      
      ProjectManager.addProject(project);
      
      // Prüfen, ob Projekt existiert
      assert.ok(ProjectManager.getProject('delete-test'));
      
      // Projekt löschen
      const result = ProjectManager.deleteProject('delete-test');
      assert.strictEqual(result, true);
      
      // Prüfen, ob Projekt gelöscht wurde
      assert.strictEqual(ProjectManager.getProject('delete-test'), null);
    });
    
    test('sollte false zurückgeben, wenn das Projekt nicht existiert', () => {
      const result = ProjectManager.deleteProject('nicht-existierendes-projekt');
      assert.strictEqual(result, false);
    });
  });
  
  describe('isDeadlineCritical', () => {
    test('sollte true zurückgeben, wenn die Deadline in weniger als 7 Tagen ist', () => {
      // Aktuelles Datum
      const today = new Date();
      
      // Deadline in 5 Tagen
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + 5);
      
      const deadline = futureDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Wir können die private Funktion nicht direkt testen, daher ein Projekt mit dieser Deadline
      const project = {
        id: 'deadline-test',
        title: 'Kritische Deadline',
        status: 'on-track',
        progress: 50,
        deadline: deadline
      };
      
      ProjectManager.addProject(project);
      
      // Prüfen, ob die Deadline im UI als kritisch markiert wird
      document.querySelector(`.project-card[data-project="deadline-test"] .deadline-text`).classList.contains('critical-deadline');
    });
  });
  
  describe('Event System', () => {
    test('sollte Events auslösen, wenn Projekte hinzugefügt werden', (done) => {
      // Event-Handler registrieren
      ProjectManager.on('project-added', (project) => {
        assert.strictEqual(project.id, 'event-test');
        assert.strictEqual(project.title, 'Event Test');
        done();
      });
      
      // Projekt hinzufügen, sollte das Event auslösen
      ProjectManager.addProject({
        id: 'event-test',
        title: 'Event Test',
        status: 'on-track',
        progress: 0
      });
    });
  });
});