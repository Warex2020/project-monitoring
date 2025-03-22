/**
 * fileManager.js - Verwaltet das Lesen/Schreiben der JSON-Dateien
 */

const fs = require('fs');
const path = require('path');

/**
 * Lädt eine JSON-Datei asynchron
 * @param {string} filePath - Pfad zur JSON-Datei
 * @returns {Promise<Object>} - Das geparste JSON-Objekt
 */
function loadJson(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                // Wenn die Datei nicht existiert, gib leeres Objekt zurück
                if (err.code === 'ENOENT') {
                    console.warn(`Datei nicht gefunden: ${filePath}`);
                    resolve({});
                } else {
                    reject(err);
                }
                return;
            }
            
            try {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
            } catch (parseError) {
                reject(new Error(`Fehler beim Parsen der JSON-Datei ${filePath}: ${parseError.message}`));
            }
        });
    });
}

/**
 * Lädt eine JSON-Datei synchron
 * @param {string} filePath - Pfad zur JSON-Datei
 * @returns {Object} - Das geparste JSON-Objekt
 */
function loadJsonSync(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Wenn die Datei nicht existiert, gib leeres Objekt zurück
        if (error.code === 'ENOENT') {
            console.warn(`Datei nicht gefunden: ${filePath}`);
            return {};
        }
        
        // Bei anderen Fehlern wirf eine Exception
        throw error;
    }
}

/**
 * Speichert ein Objekt als JSON-Datei
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {Object} data - Das zu speichernde Objekt
 * @returns {Promise<void>}
 */
function saveJson(filePath, data) {
    return new Promise((resolve, reject) => {
        // Stelle sicher, dass das Verzeichnis existiert
        const dirPath = path.dirname(filePath);
        
        fs.mkdir(dirPath, { recursive: true }, (mkdirErr) => {
            if (mkdirErr) {
                reject(new Error(`Fehler beim Erstellen des Verzeichnisses ${dirPath}: ${mkdirErr.message}`));
                return;
            }
            
            // Konvertiere Objekt in JSON mit Einrückung für bessere Lesbarkeit
            const jsonData = JSON.stringify(data, null, 2);
            
            // Schreibe Datei
            fs.writeFile(filePath, jsonData, 'utf8', (writeErr) => {
                if (writeErr) {
                    reject(new Error(`Fehler beim Schreiben der Datei ${filePath}: ${writeErr.message}`));
                    return;
                }
                
                resolve();
            });
        });
    });
}

/**
 * Speichert ein Objekt als JSON-Datei synchron
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {Object} data - Das zu speichernde Objekt
 */
function saveJsonSync(filePath, data) {
    // Stelle sicher, dass das Verzeichnis existiert
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    
    // Konvertiere Objekt in JSON mit Einrückung für bessere Lesbarkeit
    const jsonData = JSON.stringify(data, null, 2);
    
    // Schreibe Datei
    fs.writeFileSync(filePath, jsonData, 'utf8');
}

module.exports = {
    loadJson,
    loadJsonSync,
    saveJson,
    saveJsonSync
};