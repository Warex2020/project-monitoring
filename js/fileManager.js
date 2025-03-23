/**
 * fileManager.js - Verwaltet das Lesen/Schreiben der JSON-Dateien
 * Version 1.2.0 - Mit verbessertem Error-Handling und atomaren Schreiboperationen
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * Lädt eine JSON-Datei asynchron
 * @param {string} filePath - Pfad zur JSON-Datei
 * @returns {Promise<Object>} - Das geparste JSON-Objekt
 */
async function loadJson(filePath) {
    try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Wenn die Datei nicht existiert, gib leeres Objekt zurück
        if (error.code === 'ENOENT') {
            console.warn(`Datei nicht gefunden: ${filePath}`);
            return {};
        }
        
        // Bei Parsing-Fehlern versuche eine Backup-Datei zu verwenden
        if (error instanceof SyntaxError) {
            console.error(`JSON-Parsing-Fehler in ${filePath}: ${error.message}`);
            return await tryLoadBackup(filePath);
        }
        
        // Bei anderen Fehlern wirf eine Exception
        throw new Error(`Fehler beim Laden der JSON-Datei ${filePath}: ${error.message}`);
    }
}

/**
 * Versucht eine Backup-Datei zu laden, wenn die Hauptdatei beschädigt ist
 * @param {string} filePath - Pfad zur Hauptdatei
 * @returns {Promise<Object>} - Das geparste JSON-Objekt aus dem letzten funktionierenden Backup
 */
async function tryLoadBackup(filePath) {
    const dirPath = path.dirname(filePath);
    const baseName = path.basename(filePath, '.json');
    
    try {
        // Suche nach Backup-Dateien im selben Verzeichnis
        const files = await fsPromises.readdir(dirPath);
        const backups = files
            .filter(file => file.startsWith(`${baseName}.backup-`))
            .sort((a, b) => b.localeCompare(a)); // Neueste zuerst
        
        // Versuche Backups in der Reihenfolge vom neuesten zum ältesten
        for (const backup of backups) {
            try {
                console.log(`Versuche Backup-Datei zu laden: ${backup}`);
                const backupPath = path.join(dirPath, backup);
                const data = await fsPromises.readFile(backupPath, 'utf8');
                const parsed = JSON.parse(data);
                
                // Wenn erfolgreich geladen, erstelle eine neue Hauptdatei
                await atomicSaveJson(filePath, parsed);
                console.log(`Original-Datei aus Backup wiederhergestellt: ${backup}`);
                
                return parsed;
            } catch (backupError) {
                console.error(`Fehler beim Laden des Backups ${backup}: ${backupError.message}`);
                // Weiter zum nächsten Backup
            }
        }
        
        // Keine funktionierenden Backups gefunden
        console.error(`Keine funktionierenden Backups für ${filePath} gefunden. Erstelle leeres Objekt.`);
        return {};
    } catch (error) {
        console.error(`Fehler beim Suchen nach Backups: ${error.message}`);
        return {};
    }
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
        
        // Bei Parsing-Fehlern versuche eine Backup-Datei zu verwenden
        if (error instanceof SyntaxError) {
            console.error(`JSON-Parsing-Fehler in ${filePath}: ${error.message}`);
            
            // Versuche synchron ein Backup zu laden
            const dirPath = path.dirname(filePath);
            const baseName = path.basename(filePath, '.json');
            
            try {
                const files = fs.readdirSync(dirPath);
                const backups = files
                    .filter(file => file.startsWith(`${baseName}.backup-`))
                    .sort((a, b) => b.localeCompare(a)); // Neueste zuerst
                
                for (const backup of backups) {
                    try {
                        console.log(`Versuche Backup-Datei zu laden: ${backup}`);
                        const backupPath = path.join(dirPath, backup);
                        const data = fs.readFileSync(backupPath, 'utf8');
                        return JSON.parse(data);
                    } catch (backupError) {
                        // Weiter zum nächsten Backup
                    }
                }
            } catch (listError) {
                // Ignorieren und leeres Objekt zurückgeben
            }
            
            return {};
        }
        
        // Bei anderen Fehlern wirf eine Exception
        throw error;
    }
}

/**
 * Speichert ein Objekt als JSON-Datei (atomare Schreiboperation)
 * @param {string} filePath - Pfad zur JSON-Datei
 * @param {Object} data - Das zu speichernde Objekt
 * @returns {Promise<void>}
 */
async function saveJson(filePath, data) {
    await atomicSaveJson(filePath, data);
    
    // Erstelle ein Backup nach erfolgreicher Speicherung
    await createBackup(filePath);
}

/**
 * Führt eine atomare Schreiboperation durch, um Datenverlust bei Absturz zu vermeiden
 * @param {string} filePath - Pfad zur JSON-Datei 
 * @param {Object} data - Das zu speichernde Objekt
 */
async function atomicSaveJson(filePath, data) {
    // Stelle sicher, dass das Verzeichnis existiert
    const dirPath = path.dirname(filePath);
    await fsPromises.mkdir(dirPath, { recursive: true });
    
    // Temporäre Datei mit zufälligem Namen erstellen
    const tempFileName = `${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    try {
        // Konvertiere Objekt in JSON mit Einrückung für bessere Lesbarkeit
        const jsonData = JSON.stringify(data, null, 2);
        
        // Schreibe in temporäre Datei
        await fsPromises.writeFile(tempFilePath, jsonData, 'utf8');
        
        // Prüfe, ob die geschriebene Datei valides JSON enthält
        try {
            const checkData = await fsPromises.readFile(tempFilePath, 'utf8');
            JSON.parse(checkData); // Nur zum Testen, ob das JSON valide ist
        } catch (validateError) {
            throw new Error(`Validierung des geschriebenen JSON fehlgeschlagen: ${validateError.message}`);
        }
        
        // Atomar umbenennen (ersetzt die Zieldatei, falls sie existiert)
        try {
            // Für Windows: Zuerst die alte Datei löschen, wenn sie existiert
            if (process.platform === 'win32') {
                try {
                    await fsPromises.unlink(filePath);
                } catch (unlinkError) {
                    // Ignorieren, wenn die Datei nicht existiert
                }
            }
            
            // Datei von temp nach Ziel verschieben/umbenennen
            await fsPromises.rename(tempFilePath, filePath);
        } catch (renameError) {
            // Fallback: Kopieren und Original löschen, wenn atomares Umbenennen fehlschlägt
            await fsPromises.copyFile(tempFilePath, filePath);
            await fsPromises.unlink(tempFilePath);
        }
    } catch (error) {
        // Aufräumen bei Fehler
        try {
            await fsPromises.unlink(tempFilePath);
        } catch (cleanupError) {
            // Ignoriere Fehler beim Aufräumen
        }
        
        throw new Error(`Fehler beim atomaren Speichern der Datei ${filePath}: ${error.message}`);
    }
}

/**
 * Erstellt ein Backup einer JSON-Datei
 * @param {string} filePath - Pfad zur JSON-Datei
 * @returns {Promise<string>} - Pfad zur Backup-Datei
 */
async function createBackup(filePath) {
    try {
        // Erstelle einen Backup-Dateinamen mit Zeitstempel
        const timestamp = Date.now();
        const dirPath = path.dirname(filePath);
        const baseName = path.basename(filePath, '.json');
        const backupPath = path.join(dirPath, `${baseName}.backup-${timestamp}.json`);
        
        // Kopiere die aktuelle Datei als Backup
        await fsPromises.copyFile(filePath, backupPath);
        
        // Halte nur die letzten 5 Backups
        await cleanupBackups(filePath, 5);
        
        return backupPath;
    } catch (error) {
        console.error(`Fehler beim Erstellen des Backups von ${filePath}: ${error.message}`);
        // Ignoriere Fehler beim Erstellen des Backups, da es nicht kritisch ist
        return null;
    }
}

/**
 * Löscht alte Backup-Dateien und behält nur die angegebene Anzahl
 * @param {string} filePath - Pfad zur Hauptdatei
 * @param {number} keepCount - Anzahl der zu behaltenden Backups
 */
async function cleanupBackups(filePath, keepCount) {
    try {
        const dirPath = path.dirname(filePath);
        const baseName = path.basename(filePath, '.json');
        
        // Liste aller Dateien im Verzeichnis
        const files = await fsPromises.readdir(dirPath);
        
        // Filtere Backup-Dateien und sortiere nach Zeitstempel (neueste zuerst)
        const backups = files
            .filter(file => file.startsWith(`${baseName}.backup-`) && file.endsWith('.json'))
            .sort((a, b) => {
                // Extrahiere Zeitstempel aus Dateinamen
                const timestampA = parseInt(a.split(`${baseName}.backup-`)[1].split('.json')[0]);
                const timestampB = parseInt(b.split(`${baseName}.backup-`)[1].split('.json')[0]);
                return timestampB - timestampA; // Neueste zuerst
            });
        
        // Behalte nur die neuesten 'keepCount' Backups
        if (backups.length > keepCount) {
            for (let i = keepCount; i < backups.length; i++) {
                const backupPath = path.join(dirPath, backups[i]);
                await fsPromises.unlink(backupPath);
            }
        }
    } catch (error) {
        console.error(`Fehler beim Bereinigen alter Backups: ${error.message}`);
        // Ignoriere Fehler beim Cleanup, da es nicht kritisch ist
    }
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
    
    // Temporäre Datei mit zufälligem Namen erstellen
    const tempFileName = `${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    try {
        // Konvertiere Objekt in JSON mit Einrückung für bessere Lesbarkeit
        const jsonData = JSON.stringify(data, null, 2);
        
        // Schreibe in temporäre Datei
        fs.writeFileSync(tempFilePath, jsonData, 'utf8');
        
        // Prüfe, ob die geschriebene Datei valides JSON enthält
        try {
            const checkData = fs.readFileSync(tempFilePath, 'utf8');
            JSON.parse(checkData); // Nur zum Testen, ob das JSON valide ist
        } catch (validateError) {
            throw new Error(`Validierung des geschriebenen JSON fehlgeschlagen: ${validateError.message}`);
        }
        
        // Atomar umbenennen (ersetzt die Zieldatei, falls sie existiert)
        if (process.platform === 'win32') {
            // Windows: Zuerst die alte Datei löschen, wenn sie existiert
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkError) {
                // Ignorieren, wenn die Datei nicht existiert
            }
        }
        
        // Datei von temp nach Ziel verschieben/umbenennen
        fs.renameSync(tempFilePath, filePath);
        
        // Erstelle ein Backup (synchron)
        try {
            const timestamp = Date.now();
            const backupPath = path.join(dirPath, `${path.basename(filePath, '.json')}.backup-${timestamp}.json`);
            fs.copyFileSync(filePath, backupPath);
        } catch (backupError) {
            // Ignoriere Fehler beim Erstellen des Backups
        }
    } catch (error) {
        // Aufräumen bei Fehler
        try {
            fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
            // Ignoriere Fehler beim Aufräumen
        }
        
        throw new Error(`Fehler beim Speichern der Datei ${filePath}: ${error.message}`);
    }
}

module.exports = {
    loadJson,
    loadJsonSync,
    saveJson,
    saveJsonSync,
    createBackup
};