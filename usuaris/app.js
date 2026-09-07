// IndexedDB Configuration for Directory Handle storage
const DB_NAME = 'GPG_Merge_DB';
const STORE_NAME = 'settings';
const KEY_DIR_HANDLE = 'sharepoint_dir_handle';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveDirectoryHandle(handle) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(handle, KEY_DIR_HANDLE);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getDirectoryHandle() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(KEY_DIR_HANDLE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function clearDirectoryHandle() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY_DIR_HANDLE);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Persistència de la consulta a la memòria interna del navegador (IndexedDB)
async function saveCachedResults(results, metadata) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(results, 'cached_merged_results');
            store.put(metadata, 'cached_metadata');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("No s'ha pogut desar la consulta a la memòria:", e);
    }
}

async function getCachedResults() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const reqResults = store.get('cached_merged_results');
            const reqMeta = store.get('cached_metadata');
            tx.oncomplete = () => {
                resolve({
                    results: reqResults.result || null,
                    metadata: reqMeta.result || null
                });
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("No s'ha pogut recuperar la consulta de la memòria:", e);
        return { results: null, metadata: null };
    }
}

async function clearCachedResults() {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete('cached_merged_results');
            store.delete('cached_metadata');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("Error netejant memòria cau:", e);
    }
}

// State variables
let directoryHandle = null;
let fileDataCat = null;
let fileDataUsr = null;
let dateCatModified = null;
let dateUsrModified = null;
let mergedResults = [];
let filteredResults = [];
let hasClickedSync = false;
let currentSortColumn = 'ens';
let currentSortDirection = 'asc';
const columnFilters = {
    codi: '',
    ens: '',
    particip: '',
    origen: '',
    nom: '',
    cognoms: '',
    email: ''
};

// Pagination State
let currentPage = 1;
const rowsPerPage = 50;

// DOM Elements
const dropZoneCat = document.getElementById('dropZoneCat');
const fileInputCat = document.getElementById('fileInputCat');
const fileInfoCat = document.getElementById('fileInfoCat');
const removeCat = document.getElementById('removeCat');

const dropZoneUsr = document.getElementById('dropZoneUsr');
const fileInputUsr = document.getElementById('fileInputUsr');
const fileInfoUsr = document.getElementById('fileInfoUsr');
const removeUsr = document.getElementById('removeUsr');

const sharepointPickerState = document.getElementById('sharepointPickerState');
const sharepointConnectedState = document.getElementById('sharepointConnectedState');

const btnSyncNow = document.getElementById('btnSyncNow');
const btnChangeFolder = document.getElementById('btnChangeFolder');
const btnConnectFolder = document.getElementById('btnConnectFolder');
const btnDisconnectFolder = document.getElementById('btnDisconnectFolder');
const btnShowManualUpload = document.getElementById('btnShowManualUpload');

const sharepointStatusBadge = document.getElementById('sharepointStatusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const manualUploadSection = document.getElementById('manualUploadSection');
const autoSyncStatus = document.getElementById('autoSyncStatus');
const assistantActions = document.getElementById('assistantActions');
const syncProgressText = document.getElementById('syncProgressText');
const btnReauthorize = document.getElementById('btnReauthorize');

const btnProcess = document.getElementById('btnProcess');
const processSection = document.getElementById('processSection');
const resultsSection = document.getElementById('resultsSection');
const btnExport = document.getElementById('btnExport');
const btnCopyEmails = document.getElementById('btnCopyEmails');
const btnCopyEmailsText = document.getElementById('btnCopyEmailsText');
const searchInput = document.getElementById('searchInput');
const recordCount = document.getElementById('recordCount');

const resultsTable = document.getElementById('resultsTable');
const tableBody = document.getElementById('tableBody');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const pageIndicator = document.getElementById('pageIndicator');

// Initialize events on load
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup folder connect/disconnect/sync buttons
    if (btnConnectFolder) btnConnectFolder.addEventListener('click', connectSharepointFolder);
    if (btnDisconnectFolder) btnDisconnectFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnChangeFolder) btnChangeFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnReauthorize) btnReauthorize.addEventListener('click', reauthorizeFolderAccess);
    if (btnSyncNow) {
        btnSyncNow.addEventListener('click', () => {
            showManualUpload();
        });
    }

    const btnReReadFromFolder = document.getElementById('btnReReadFromFolder');
    if (btnReReadFromFolder) {
        btnReReadFromFolder.addEventListener('click', async () => {
            if (directoryHandle) {
                await syncWithDirectory(directoryHandle, false);
            }
        });
    }

    const btnCancelManualUpload = document.getElementById('btnCancelManualUpload');
    if (btnCancelManualUpload) {
        btnCancelManualUpload.addEventListener('click', () => {
            if (manualUploadSection) manualUploadSection.classList.add('hidden');
            if (mergedResults && mergedResults.length > 0) {
                resultsSection.classList.remove('hidden');
            }
        });
    }

    const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
    if (btnUploadToSharepoint) {
        btnUploadToSharepoint.addEventListener('click', async () => {
            hasClickedSync = true;
            if (!fileDataCat || !fileDataUsr) {
                alert("Si us plau, puja primer els dos fitxers excel.");
                return;
            }
            
            if (btnUploadToSharepoint) btnUploadToSharepoint.classList.add('hidden');
            if (btnCancelManualUpload) btnCancelManualUpload.classList.add('hidden');
            
            btnProcess.click();
        });
    }

    // 2. Setup Drag & Drop manual zones
    setupDropZone(dropZoneCat, fileInputCat, fileInfoCat, (data, lastModified) => {
        fileDataCat = data;
        dateCatModified = lastModified || new Date().getTime();
        checkReadyToProcess();
        updateDateDisplay(dateCatModified, dateUsrModified);
    });
    setupDropZone(dropZoneUsr, fileInputUsr, fileInfoUsr, (data, lastModified) => {
        fileDataUsr = data;
        dateUsrModified = lastModified || new Date().getTime();
        checkReadyToProcess();
        updateDateDisplay(dateCatModified, dateUsrModified);
    });

    // 3. Setup remove cross buttons for manual cards
    if (removeCat) {
        removeCat.addEventListener('click', () => {
            fileDataCat = null;
            fileInputCat.value = '';
            fileInfoCat.classList.remove('active');
            dropZoneCat.style.display = 'block';
            checkReadyToProcess();
        });
    }
    if (removeUsr) {
        removeUsr.addEventListener('click', () => {
            fileDataUsr = null;
            fileInputUsr.value = '';
            fileInfoUsr.classList.remove('active');
            dropZoneUsr.style.display = 'block';
            checkReadyToProcess();
        });
    }

    // 4. Setup column filter inputs and sort headers
    const filters = document.querySelectorAll('.column-filter');
    filters.forEach(input => {
        input.addEventListener('input', (e) => {
            const col = e.target.getAttribute('data-col');
            columnFilters[col] = e.target.value;
            applyFiltersAndSort();
        });
    });

    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-column');
            
            if (currentSortColumn === col) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = col;
                currentSortDirection = 'asc';
            }
            
            headers.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
                const icon = h.querySelector('.sort-icon');
                if (icon) icon.textContent = '↕';
            });
            
            if (currentSortDirection === 'asc') {
                th.classList.add('sorted-asc');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.textContent = '▲';
            } else {
                th.classList.add('sorted-desc');
                const icon = th.querySelector('.sort-icon');
                if (icon) icon.textContent = '▼';
            }
            
            applyFiltersAndSort();
        });
    });

    // 5. Carregar dades de la consulta des de la memòria IndexedDB (si n'hi ha)
    let hasLoadedCache = false;
    try {
        const cached = await getCachedResults();
        if (cached && cached.results && cached.results.length > 0) {
            mergedResults = cached.results;
            filteredResults = [...mergedResults];
            if (cached.metadata) {
                dateCatModified = cached.metadata.dateCatModified;
                dateUsrModified = cached.metadata.dateUsrModified;
                updateDateDisplay(dateCatModified, dateUsrModified);
            }
            resultsSection.classList.remove('hidden');
            currentPage = 1;
            applyFiltersAndSort();
            hasLoadedCache = true;
        }
    } catch (e) {
        console.warn("No s'han pogut carregar dades de la memòria cau:", e);
    }

    // 6. Comprovar si hi ha una carpeta connectada
    try {
        const savedHandle = await getDirectoryHandle();
        if (savedHandle) {
            directoryHandle = savedHandle;
            
            sharepointPickerState.classList.add('hidden');
            sharepointConnectedState.classList.remove('hidden');
            const pathLabel = document.getElementById('sharepointPathLabel');
            if (pathLabel && savedHandle) {
                pathLabel.textContent = `Ruta: D:\\fakepath\\OneDrive - Generalitat de Catalunya\\Documents (PROVES) - SDG Entitats\\04. Usuaris\\${savedHandle.name}`;
            }
            
            if (hasLoadedCache) {
                statusDot.className = 'status-dot green';
                statusText.textContent = 'Dades Carregades';
                btnDisconnectFolder.style.display = 'inline-block';
            } else {
                const permissionState = await directoryHandle.queryPermission({ mode: 'read' });
                if (permissionState === 'granted') {
                    await syncWithDirectorySilent(directoryHandle);
                } else {
                    statusDot.className = 'status-dot yellow';
                    statusText.textContent = 'Requerix Autorització';
                }
            }
        } else {
            if (!hasLoadedCache) {
                showInitialState();
            }
        }
    } catch (e) {
        console.error("Error loading directory from IndexedDB", e);
        if (!hasLoadedCache) showInitialState();
    }
});

// Show manual drag and drop section
function showManualUpload() {
    manualUploadSection.classList.remove('hidden');
    if (btnShowManualUpload) btnShowManualUpload.classList.add('hidden');
    const reReadFolderContainer = document.getElementById('reReadFolderContainer');
    if (reReadFolderContainer) {
        if (directoryHandle) {
            reReadFolderContainer.classList.remove('hidden');
        } else {
            reReadFolderContainer.classList.add('hidden');
        }
    }
    manualUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    checkReadyToProcess();
}

// Show SharePoint initial configuration
function showInitialState() {
    statusDot.className = 'status-dot red';
    statusText.textContent = 'SharePoint No Connectat';
    btnDisconnectFolder.style.display = 'none';
    
    sharepointPickerState.classList.remove('hidden');
    sharepointConnectedState.classList.add('hidden');
    manualUploadSection.classList.add('hidden');
    autoSyncStatus.classList.add('hidden');
    assistantActions.classList.remove('hidden');
    if (btnShowManualUpload) btnShowManualUpload.classList.remove('hidden');
}

// Connect new folder using File System Access API (Només Lectura)
async function connectSharepointFolder() {
    try {
        if (!window.showDirectoryPicker) {
            alert("El teu navegador no suporta l'accés directe a carpetes locals. Si us plau, utilitza Chrome o Edge.");
            return;
        }
        
        const handle = await window.showDirectoryPicker({
            id: 'gpg-merge-sharepoint',
            mode: 'read'
        });
        
        directoryHandle = handle;
        await saveDirectoryHandle(handle);
        
        sharepointPickerState.classList.add('hidden');
        sharepointConnectedState.classList.remove('hidden');
        const pathLabel = document.getElementById('sharepointPathLabel');
        if (pathLabel && handle) {
            pathLabel.textContent = `Ruta: D:\\fakepath\\OneDrive - Generalitat de Catalunya\\Documents (PROVES) - SDG Entitats\\04. Usuaris\\${handle.name}`;
        }
        
        await syncWithDirectory(handle);
    } catch (e) {
        console.error("User cancelled or directory select failed", e);
    }
}

// Re-authorize access to already saved handle (Només Lectura)
async function reauthorizeFolderAccess() {
    if (!directoryHandle) return;
    try {
        const options = { mode: 'read' };
        const permission = await directoryHandle.requestPermission(options);
        if (permission === 'granted') {
            await syncWithDirectory(directoryHandle);
        }
    } catch (e) {
        alert("Error en concedir accés: " + e.message);
    }
}

// Disconnect SharePoint folder
async function disconnectSharepointFolder() {
    try {
        await clearDirectoryHandle();
        await clearCachedResults();
        directoryHandle = null;
        fileDataCat = null;
        fileDataUsr = null;
        dateCatModified = null;
        dateUsrModified = null;
        mergedResults = [];
        filteredResults = [];
        
        const sharepointDateLabel = document.getElementById('sharepointDateLabel');
        const infoUpdateDate = document.getElementById('infoUpdateDate');
        if (sharepointDateLabel) sharepointDateLabel.textContent = 'Darrera actualització: -';
        if (infoUpdateDate) {
            infoUpdateDate.textContent = "📅 Data d'actualització: -";
            infoUpdateDate.classList.add('hidden');
        }
        
        fileInfoCat.classList.remove('active');
        dropZoneCat.style.display = 'block';
        fileInfoUsr.classList.remove('active');
        dropZoneUsr.style.display = 'block';
        
        processSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        
        showInitialState();
    } catch (e) {
        console.error(e);
    }
}

// Scan directory silently on load if permission is already granted
async function syncWithDirectorySilent(handle) {
    statusDot.className = 'status-dot yellow';
    statusText.textContent = 'Comprovant fitxers...';
    
    try {
        const { fileCat, fileUsr } = await loadFilesFromDirectory(handle);

        await extractMetadataDatesFromFiles(fileCat, fileUsr);
        updateDateDisplay(dateCatModified, dateUsrModified);
        
        fileInfoCat.classList.remove('active');
        dropZoneCat.style.display = 'block';
        fileInfoUsr.classList.remove('active');
        dropZoneUsr.style.display = 'block';
        
        if (fileCat) {
            fileDataCat = new Uint8Array(await fileCat.arrayBuffer());
            fileInfoCat.querySelector('.file-name').textContent = `${fileCat.name} (SharePoint)`;
            fileInfoCat.classList.add('active');
            dropZoneCat.style.display = 'none';
        } else {
            fileDataCat = null;
        }
        
        if (fileUsr) {
            fileDataUsr = new Uint8Array(await fileUsr.arrayBuffer());
            fileInfoUsr.querySelector('.file-name').textContent = `${fileUsr.name} (SharePoint)`;
            fileInfoUsr.classList.add('active');
            dropZoneUsr.style.display = 'none';
        } else {
            fileDataUsr = null;
        }
        
        if (fileCat && fileUsr) {
            statusDot.className = 'status-dot green';
            statusText.textContent = 'SharePoint Connectat';
            btnDisconnectFolder.style.display = 'inline-block';
            
            btnProcess.removeAttribute('disabled');
            processSection.classList.remove('hidden');
            if (manualUploadSection) manualUploadSection.classList.add('hidden');
            btnProcess.click();
        } else {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Fitxers incomplets';
            showManualUpload();
            checkReadyToProcess();
        }
    } catch (e) {
        console.error("Silent sync failed", e);
        showManualUpload();
    }
}

// Query handle permission and load files
async function syncWithDirectory(handle, forceRecalculate = false) {
    btnSyncNow.setAttribute('disabled', 'true');
    statusDot.className = 'status-dot yellow';
    statusText.textContent = 'Actualitzant...';
    
    try {
        const permissionState = await handle.queryPermission({ mode: 'read' });
        
        if (permissionState === 'prompt') {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Requerix Permís';
            const permission = await handle.requestPermission({ mode: 'read' });
            if (permission !== 'granted') {
                btnSyncNow.removeAttribute('disabled');
                statusDot.className = 'status-dot yellow';
                statusText.textContent = 'Sense Accés';
                return;
            }
        } else if (permissionState === 'denied') {
            await disconnectSharepointFolder();
            return;
        }
        
        statusDot.className = 'status-dot green';
        statusText.textContent = 'SharePoint Connectat';
        btnDisconnectFolder.style.display = 'inline-block';
        
        const { fileCat, fileUsr } = await loadFilesFromDirectory(handle);
        
        await extractMetadataDatesFromFiles(fileCat, fileUsr);
        updateDateDisplay(dateCatModified, dateUsrModified);
        
        fileInfoCat.classList.remove('active');
        dropZoneCat.style.display = 'block';
        fileInfoUsr.classList.remove('active');
        dropZoneUsr.style.display = 'block';
        
        if (fileCat) {
            fileDataCat = new Uint8Array(await fileCat.arrayBuffer());
            fileInfoCat.querySelector('.file-name').textContent = `${fileCat.name} (SharePoint)`;
            fileInfoCat.classList.add('active');
            dropZoneCat.style.display = 'none';
        } else {
            fileDataCat = null;
        }
        
        if (fileUsr) {
            fileDataUsr = new Uint8Array(await fileUsr.arrayBuffer());
            fileInfoUsr.querySelector('.file-name').textContent = `${fileUsr.name} (SharePoint)`;
            fileInfoUsr.classList.add('active');
            dropZoneUsr.style.display = 'none';
        } else {
            fileDataUsr = null;
        }
        
        if (fileCat && fileUsr) {
            btnProcess.removeAttribute('disabled');
            processSection.classList.remove('hidden');
            btnProcess.click();
            
            if (forceRecalculate) {
                showManualUpload();
            } else {
                if (manualUploadSection) manualUploadSection.classList.add('hidden');
            }
            checkReadyToProcess();
        } else {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Fitxers incomplets';
            let missingMsg = "No s'han trobat els fitxers excels necessaris a la carpeta de SharePoint / OneDrive amb els noms exactes.";
            if (!fileCat) missingMsg += "\n- Falta el fitxer exactament anomenat 'Cataleg_dens_export.xls' (o .xlsx).";
            if (!fileUsr) missingMsg += "\n- Falta el fitxer exactament anomenat 'Export_Usuaris.xls' (o .xlsx).";
            alert(missingMsg);
            showManualUpload();
            checkReadyToProcess();
        }
    } catch (e) {
        console.error("Error during synchronization", e);
        alert("Error de sincronització: " + e.message);
        showManualUpload();
    } finally {
        btnSyncNow.removeAttribute('disabled');
    }
}

// Scan directory and return exact matches for Cataleg_dens_export.xls and Export_Usuaris.xls
async function loadFilesFromDirectory(dirHandle) {
    let fileCat = null;
    let fileUsr = null;
    
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            if (name === 'cataleg_dens_export.xls' || name === 'cataleg_dens_export.xlsx') {
                fileCat = await entry.getFile();
            } else if (name === 'export_usuaris.xls' || name === 'export_usuaris.xlsx') {
                fileUsr = await entry.getFile();
            }
        }
    }
    return { fileCat, fileUsr };
}

// Drag and drop setup for manual upload
function setupDropZone(dropZone, fileInput, fileInfo, callback) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) {
            handleFileSelection(files[0], fileInput, fileInfo, callback);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFileSelection(fileInput.files[0], fileInput, fileInfo, callback);
        }
    });
}

function handleFileSelection(file, fileInput, fileInfo, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        fileInfo.querySelector('.file-name').textContent = file.name;
        fileInfo.classList.add('active');
        const dropZone = fileInput.parentElement;
        if (dropZone) dropZone.style.display = 'none';
        callback(data, file.lastModified);
    };
    reader.readAsArrayBuffer(file);
}

// Check if both files are manually uploaded
function checkReadyToProcess() {
    const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
    if (fileDataCat && fileDataUsr) {
        btnProcess.removeAttribute('disabled');
        resetSteps();
        
        if (btnUploadToSharepoint) {
            btnUploadToSharepoint.classList.remove('hidden');
            btnUploadToSharepoint.textContent = '⚡ Processar nous Excels';
        }
    } else {
        btnProcess.setAttribute('disabled', 'true');
        processSection.classList.add('hidden');
        if (!mergedResults || mergedResults.length === 0) {
            resultsSection.classList.add('hidden');
        }
        if (btnUploadToSharepoint) btnUploadToSharepoint.classList.add('hidden');
    }
}

function resetSteps() {
    const steps = ['stepRead', 'stepParticips', 'stepHierarchy', 'stepOutput'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active', 'completed');
    });
}

function updateStepStatus(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    if (status === 'active') {
        el.classList.add('active');
        el.classList.remove('completed');
    } else if (status === 'completed') {
        el.classList.remove('active');
        el.classList.add('completed');
    }
}

// Helper to normalize string for comparison
function normalizeCode(val) {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
}

// Helper to normalize search text (ignore accents and punctuation)
function normalizeText(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, "")
        .trim();
}

// ETL Process Trigger
btnProcess.addEventListener('click', async () => {
    btnProcess.setAttribute('disabled', 'true');
    resetSteps();
    processSection.classList.remove('hidden');
    if (manualUploadSection) manualUploadSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    processSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    try {
        if (!fileDataCat || fileDataCat.length === 0) {
            throw new Error("El fitxer de Catàleg és buit o invàlid.");
        }
        if (!fileDataUsr || fileDataUsr.length === 0) {
            throw new Error("El fitxer d'Exportació d'Usuaris és buit o invàlid.");
        }

        // Step 1: Read Files
        updateStepStatus('stepRead', 'active');
        await delay(500);
        
        let wbCat, wbUsr;
        try {
            wbCat = XLSX.read(fileDataCat, {type: 'array', cellDates: true});
            const d = getWorkbookDate(wbCat);
            if (d) dateCatModified = d.getTime();
        } catch (catErr) {
            console.error(catErr);
            throw new Error("El fitxer del Catàleg de Partícips ('Cataleg_dens_export.xls') és invàlid o està corrupte.");
        }

        try {
            wbUsr = XLSX.read(fileDataUsr, {type: 'array', cellDates: true});
            const d = getWorkbookDate(wbUsr);
            if (d) dateUsrModified = d.getTime();
        } catch (usrErr) {
            console.error(usrErr);
            throw new Error("El fitxer d'Exportació d'Usuaris ('Export_Usuaris.xls') és invàlid o està corrupte.");
        }
        updateStepStatus('stepRead', 'completed');
        updateDateDisplay(dateCatModified, dateUsrModified);

        // Step 2: Lectura i processament d'entitats del Catàleg
        updateStepStatus('stepParticips', 'active');
        await delay(600);
        
        const sheetParticipsRaw = wbCat.Sheets['Detall de partícips'] || wbCat.Sheets['Detall de partÃ­cips'];
        if (!sheetParticipsRaw) throw new Error("No s'ha trobat la fulla 'Detall de partícips' a Cataleg_dens_export.xls");
        
        const rowsParticips = xlsxToObjectsWithDuplicateHeaders(sheetParticipsRaw);
        
        // Mapa per agrupar totes les entitats úniques i identificar el seu vincle primari
        const entitatsMap = new Map();

        rowsParticips.forEach(r => {
            const codi = normalizeCode(r['Codi Catàleg'] || r['CODI'] || r['Codi'] || r['Codi catàleg']);
            if (!codi) return;
            const denominacio = r['Denominació'] || r['Nom ens'] || r['Denominacio'] || '';
            
            const vincleStr = String(r['Vincle primari'] || r['Vincle_primari'] || '').trim().toLowerCase();
            const isVinclePrimari = vincleStr === 'si' || vincleStr === 'sí';
            
            if (!entitatsMap.has(codi)) {
                entitatsMap.set(codi, {
                    codi: codi,
                    denominacio: denominacio,
                    codiVincle: null,
                    nomVincle: null
                });
            } else if (denominacio && !entitatsMap.get(codi).denominacio) {
                entitatsMap.get(codi).denominacio = denominacio;
            }

            if (isVinclePrimari) {
                const codiVincle = normalizeCode(r['Codi Catàleg_1'] || r['CODI_1'] || r['Codi_1'] || r['Codi catàleg_1']);
                const nomVincle = r['Denominació partícip (agregat)'] || r['Partícip agregat'] || r['Denominacio particip (agregat)'] || '';
                
                const ent = entitatsMap.get(codi);
                ent.codiVincle = codiVincle;
                ent.nomVincle = nomVincle;
            }
        });

        // Comprovar també 'Dades entitat' si existeix per capturar entitats addicionals
        const sheetDadesEntitatRaw = wbCat.Sheets['Dades entitat'];
        if (sheetDadesEntitatRaw) {
            try {
                const rowsDadesEntitat = xlsxToObjectsWithDuplicateHeaders(sheetDadesEntitatRaw);
                rowsDadesEntitat.forEach(r => {
                    let codi = null;
                    let denom = null;
                    for (const key of Object.keys(r)) {
                        const normKey = normalizeText(key);
                        if (normKey === 'codi cataleg' || normKey === 'codi' || normKey === 'codi cat') {
                            codi = normalizeCode(r[key]);
                        }
                        if (normKey === 'denominacio' || normKey === 'nom ens') {
                            denom = r[key];
                        }
                    }
                    if (codi && !entitatsMap.has(codi)) {
                        entitatsMap.set(codi, {
                            codi: codi,
                            denominacio: denom || '',
                            codiVincle: null,
                            nomVincle: null
                        });
                    }
                });
            } catch (e) {
                console.warn("No s'han pogut processar files de 'Dades entitat':", e);
            }
        }

        // Si una entitat no té assignat cap vincle primari, la mateixa entitat actua com a vincle primari
        entitatsMap.forEach(ent => {
            if (!ent.codiVincle) {
                ent.codiVincle = ent.codi;
                ent.nomVincle = ent.denominacio || ent.codi;
            }
        });

        const detallParticips = Array.from(entitatsMap.values());

        if (detallParticips.length === 0) {
            console.warn("Avís: No s'ha trobat cap entitat a Cataleg_dens_export.xls.");
        }
        updateStepStatus('stepParticips', 'completed');

        // Step 3: Cerca Jeràrquica d'usuaris
        updateStepStatus('stepHierarchy', 'active');
        await delay(800);

        // Read "Autorització directa a ens"
        const sheetDirectaRaw = wbUsr.Sheets['Autorització directa a ens'] || wbUsr.Sheets['Autoritzacio directa a ens'];
        if (!sheetDirectaRaw) throw new Error("No s'ha trobat la fulla 'Autorització directa a ens' a Export_Usuaris.xls");
        const rowsDirecta = XLSX.utils.sheet_to_json(sheetDirectaRaw, {defval: null});

        // Read "Autorització a ens (resum)"
        const sheetResumRaw = wbUsr.Sheets['Autorització a ens (resum)'] || 
                              wbUsr.Sheets['Autoritzacio a ens (resum)'] || 
                              wbUsr.Sheets['Autoritzacio a ens'] ||
                              wbUsr.Sheets['Autorització a ens'];
        if (!sheetResumRaw) throw new Error("No s'ha trobat la fulla 'Autorització a ens (resum)' a Export_Usuaris.xls");
        const rowsResum = XLSX.utils.sheet_to_json(sheetResumRaw, {defval: null});

        // Helper per filtrar només usuaris amb Perfil = 'Resta'
        const isPerfilResta = (r) => {
            let p = r['Perfil'] || r['PERFIL'] || r['perfil'];
            if (p === undefined || p === null) {
                const matchedKey = Object.keys(r).find(k => normalizeText(k) === 'perfil');
                if (matchedKey) p = r[matchedKey];
            }
            return p !== undefined && p !== null && String(p).trim().toLowerCase() === 'resta';
        };

        // Helper per filtrar només usuaris amb Pot modificar = 'X'
        const isPotModificar = (r) => {
            let m = r['Pot modificar'] || r['Pot Modificar'] || r['POT MODIFICAR'] || r['Pot_modificar'];
            if (m === undefined || m === null) {
                const matchedKey = Object.keys(r).find(k => normalizeText(k).includes('modificar'));
                if (matchedKey) m = r[matchedKey];
            }
            return m !== undefined && m !== null && String(m).trim().toUpperCase() === 'X';
        };

        // Detectar si les taules contenen la columna Pot modificar
        const hasPotModificarDirecta = rowsDirecta.some(r => Object.keys(r).some(k => normalizeText(k).includes('modificar')));
        const hasPotModificarResum = rowsResum.some(r => Object.keys(r).some(k => normalizeText(k).includes('modificar')));

        // Validació d'usuaris (Perfil = 'Resta' i, si existeix la columna, Pot modificar = 'X')
        const isValidUserDirecta = (r) => isPerfilResta(r) && (!hasPotModificarDirecta || isPotModificar(r));
        const isValidUserResum = (r) => isPerfilResta(r) && (!hasPotModificarResum || isPotModificar(r));

        // Indexar usuaris per 'Ens' a la pestanya directa (Perfil = 'Resta' i Pot modificar = 'X')
        const indexDirecta = new Map();
        rowsDirecta.forEach(usr => {
            if (!isValidUserDirecta(usr)) return;
            const rawEns = usr['Ens'] || usr['CODI'] || usr['Codi'] || usr['Codi ens'];
            const ensKey = normalizeCode(rawEns);
            if (ensKey) {
                if (!indexDirecta.has(ensKey)) {
                    indexDirecta.set(ensKey, []);
                }
                indexDirecta.get(ensKey).push({
                    nom: usr['Nom'] ? String(usr['Nom']).trim() : '',
                    cognoms: usr['Cognoms'] ? String(usr['Cognoms']).trim() : '',
                    email: usr['Email'] ? String(usr['Email']).trim() : ''
                });
            }
        });

        // Indexar usuaris per 'Ens' a la pestanya resum (Perfil = 'Resta' i Pot modificar = 'X')
        const indexResum = new Map();
        rowsResum.forEach(usr => {
            if (!isValidUserResum(usr)) return;
            const rawEns = usr['Ens'] || usr['CODI'] || usr['Codi'] || usr['Codi ens'];
            const ensKey = normalizeCode(rawEns);
            if (ensKey) {
                if (!indexResum.has(ensKey)) {
                    indexResum.set(ensKey, []);
                }
                indexResum.get(ensKey).push({
                    nom: usr['Nom'] ? String(usr['Nom']).trim() : '',
                    cognoms: usr['Cognoms'] ? String(usr['Cognoms']).trim() : '',
                    email: usr['Email'] ? String(usr['Email']).trim() : ''
                });
            }
        });

        // Executar cerca en cascada per cada entitat
        mergedResults = [];

        detallParticips.forEach(entitat => {
            const codiEntitat = normalizeCode(entitat.codi);
            const codiVincle = normalizeCode(entitat.codiVincle);

            let usuarisTrobats = [];
            let via = '';

            // Pas 1: Cercar a "Autorització directa a ens" pel codi de l'entitat
            if (codiEntitat && indexDirecta.has(codiEntitat) && indexDirecta.get(codiEntitat).length > 0) {
                usuarisTrobats = indexDirecta.get(codiEntitat);
                via = 'Directa';
            }
            // Pas 2: Si no hi ha resultats, cercar usuaris del seu vincle primari a "Autorització directa a ens"
            else if (codiVincle && indexDirecta.has(codiVincle) && indexDirecta.get(codiVincle).length > 0) {
                usuarisTrobats = indexDirecta.get(codiVincle);
                via = 'Vincle primari';
            }
            // Pas 3: Si tampoc no s'ha trobat cap usuari, cercar usuaris a "Autorització a ens (resum)" pel codi de l'entitat
            else if (codiEntitat && indexResum.has(codiEntitat) && indexResum.get(codiEntitat).length > 0) {
                usuarisTrobats = indexResum.get(codiEntitat);
                via = 'Directa (resum)';
            }
            // Pas 4: Si no es troben resultats, cercar usuaris del seu vincle primari a "Autorització a ens (resum)"
            else if (codiVincle && indexResum.has(codiVincle) && indexResum.get(codiVincle).length > 0) {
                usuarisTrobats = indexResum.get(codiVincle);
                via = 'Vincle primari (resum)';
            }

            // Pas 4: Processar resultats
            if (usuarisTrobats.length > 0) {
                usuarisTrobats.forEach(u => {
                    mergedResults.push({
                        'Detall de partícips.Codi Catàleg': entitat.codi,
                        'Detall de partícips.Denominació': entitat.denominacio,
                        'Detall de partícips.Denominació partícip (agregat)': entitat.nomVincle,
                        'Origen': via,
                        'Nom': u.nom,
                        'Cognoms': u.cognoms,
                        'Email': u.email
                    });
                });
            } else {
                mergedResults.push({
                    'Detall de partícips.Codi Catàleg': entitat.codi,
                    'Detall de partícips.Denominació': entitat.denominacio,
                    'Detall de partícips.Denominació partícip (agregat)': entitat.nomVincle,
                    'Origen': 'Sense usuaris',
                    'Nom': "No s'han trobat usuaris",
                    'Cognoms': '',
                    'Email': ''
                });
            }
        });

        updateStepStatus('stepHierarchy', 'completed');

        // Step 4: Generació de resultats i desament
        updateStepStatus('stepOutput', 'active');
        await delay(500);

        filteredResults = [...mergedResults];
        updateStepStatus('stepOutput', 'completed');
        await delay(500);

        // Ocultar tracker i manualUploadSection, i mostrar taula de resultats
        processSection.classList.add('hidden');
        if (manualUploadSection) manualUploadSection.classList.add('hidden');
        const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
        const btnCancelManualUpload = document.getElementById('btnCancelManualUpload');
        if (btnUploadToSharepoint) btnUploadToSharepoint.classList.remove('hidden');
        if (btnCancelManualUpload) btnCancelManualUpload.classList.remove('hidden');
        hasClickedSync = false;
        
        resultsSection.classList.remove('hidden');
        currentPage = 1;
        applyFiltersAndSort();
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Persistir la consulta a la memòria interna del navegador (IndexedDB) per a consultes instantànies posteriors
        try {
            await saveCachedResults(mergedResults, {
                dateCatModified,
                dateUsrModified,
                updatedAt: new Date().getTime()
            });
        } catch (e) {
            console.warn("No s'ha pogut desar a memòria cau:", e);
        }

        // L'aplicació és exclusivament de consulta: no es desa ni es modifica cap fitxer de la carpeta.
        // L'usuari pot descarregar els resultats quan vulgui mitjançant el botó 'Exportar a Excel (.xlsx)'.

    } catch (err) {
        alert("S'ha produït un error en processar els fitxers: " + err.message);
        console.error(err);
        
        const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
        const btnCancelManualUpload = document.getElementById('btnCancelManualUpload');
        if (btnUploadToSharepoint) btnUploadToSharepoint.classList.remove('hidden');
        if (btnCancelManualUpload) btnCancelManualUpload.classList.remove('hidden');
    } finally {
        btnProcess.removeAttribute('disabled');
    }
});

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function xlsxToObjectsWithDuplicateHeaders(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows = [];
    const headers = [];
    
    let headerRowIndex = range.s.r;
    for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
        let isHeaderRow = false;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({r: r, c: col})];
            if (cell && cell.v) {
                const normVal = normalizeText(String(cell.v));
                if (normVal.includes('codi cataleg') || normVal.includes('codi cat') || normVal.includes('denominacio') || normVal === 'codi') {
                    isHeaderRow = true;
                    break;
                }
            }
        }
        if (isHeaderRow) {
            headerRowIndex = r;
            break;
        }
    }
    
    for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({r: headerRowIndex, c: col})];
        let val = cell ? String(cell.v).trim() : `Column${col + 1}`;
        
        val = val.replace(/[\uFFFD\u00A0\u00AD\u0080-\u00FF]/g, (match, offset, string) => {
            const prevChar = string.slice(0, offset).toLowerCase();
            if (prevChar.endsWith('cat')) return 'à';
            if (prevChar.endsWith('denominaci') || prevChar.endsWith('participaci')) return 'ó';
            if (prevChar.endsWith('part') && string.slice(offset + 1).startsWith('cip')) return 'í';
            return 'ó';
        });
        
        let finalVal = val;
        let count = 1;
        while (headers.includes(finalVal)) {
            finalVal = `${val}_${count}`;
            count++;
        }
        headers.push(finalVal);
    }
    
    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
        const rowObj = {};
        let hasData = false;
        
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({r: r, c: col})];
            const header = headers[col - range.s.c];
            rowObj[header] = cell ? cell.v : null;
            if (cell !== undefined && cell !== null) hasData = true;
        }
        if (hasData) {
            rows.push(rowObj);
        }
    }
    return rows;
}

// Render Table
function renderTable() {
    tableBody.innerHTML = '';
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, filteredResults.length);
    
    const pageItems = filteredResults.slice(startIndex, endIndex);
    
    if (pageItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">Cap resultat que coincideixi amb la cerca</td></tr>`;
        recordCount.textContent = `0 registres trobats`;
        btnPrev.setAttribute('disabled', 'true');
        btnNext.setAttribute('disabled', 'true');
        pageIndicator.textContent = 'Pàgina 1 de 1';
        return;
    }

    pageItems.forEach(row => {
        const tr = document.createElement('tr');
        
        const codi = row['Detall de partícips.Codi Catàleg'] || '-';
        const ens = row['Detall de partícips.Denominació'] || '-';
        const particip = row['Detall de partícips.Denominació partícip (agregat)'] || '-';
        const origen = row['Origen'] || '-';
        let nom = row['Nom'] || '-';
        const cognoms = row['Cognoms'] || '-';
        const email = row['Email'] || '-';
        
        // Format Origen Badge
        let badgeHtml = '';
        if (origen === 'Directa') {
            badgeHtml = `<span style="color:#34d399; font-size:0.78rem; font-weight:600; background:rgba(16,185,129,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(16,185,129,0.25);">Directa</span>`;
        } else if (origen === 'Vincle primari') {
            badgeHtml = `<span style="color:#60a5fa; font-size:0.78rem; font-weight:600; background:rgba(59,130,246,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(59,130,246,0.25);">Vincle primari</span>`;
        } else if (origen === 'Directa (resum)' || origen === 'Resum') {
            badgeHtml = `<span style="color:#38bdf8; font-size:0.78rem; font-weight:600; background:rgba(56,189,248,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(56,189,248,0.25);">${origen}</span>`;
        } else if (origen === 'Vincle primari (resum)') {
            badgeHtml = `<span style="color:#c084fc; font-size:0.78rem; font-weight:600; background:rgba(168,85,247,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(168,85,247,0.25);">Vincle primari (resum)</span>`;
        } else if (origen === 'Sense usuaris') {
            badgeHtml = `<span style="color:#fbbf24; font-size:0.78rem; font-weight:600; background:rgba(245,158,11,0.12); padding:3px 8px; border-radius:6px; border:1px solid rgba(245,158,11,0.25);">Sense usuaris</span>`;
        } else {
            badgeHtml = origen;
        }

        // Highlight "No s'han trobat usuaris"
        if (nom === "No s'han trobat usuaris" || nom === "No s'ha trobat usuaris") {
            nom = `<span style="color: #fbbf24; font-style: italic;">No s'han trobat usuaris</span>`;
        }

        tr.innerHTML = `
            <td><strong>${codi}</strong></td>
            <td>${ens}</td>
            <td>${particip}</td>
            <td>${badgeHtml}</td>
            <td>${nom}</td>
            <td>${cognoms}</td>
            <td>${email}</td>
        `;
        tableBody.appendChild(tr);
    });

    const totalPages = Math.ceil(filteredResults.length / rowsPerPage);
    recordCount.textContent = `${filteredResults.length} registres trobats`;
    pageIndicator.textContent = `Pàgina ${currentPage} de ${totalPages || 1}`;
    
    if (currentPage > 1) {
        btnPrev.removeAttribute('disabled');
    } else {
        btnPrev.setAttribute('disabled', 'true');
    }

    if (currentPage < totalPages) {
        btnNext.removeAttribute('disabled');
    } else {
        btnNext.setAttribute('disabled', 'true');
    }
}

btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

btnNext.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredResults.length / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

if (searchInput) {
    searchInput.addEventListener('input', () => {
        applyFiltersAndSort();
    });
}

// Copiar adreces de correu al portapapers per a destinataris de correu
if (btnCopyEmails) {
    btnCopyEmails.addEventListener('click', async () => {
        if (!filteredResults || filteredResults.length === 0) {
            alert("No hi ha resultats disponibles per copiar.");
            return;
        }

        // Extreure correus únics i vàlids dels resultats filtrats actualment
        const emailSet = new Set();
        filteredResults.forEach(r => {
            const rawEmail = r['Email'];
            if (rawEmail && typeof rawEmail === 'string') {
                const clean = rawEmail.trim();
                // Validar que sembli un correu electrònic vàlid
                if (clean.includes('@') && clean.length >= 5) {
                    emailSet.add(clean);
                }
            }
        });

        const emails = Array.from(emailSet);

        if (emails.length === 0) {
            alert("No s'ha trobat cap adreça de correu electrònic vàlida entre els resultats filtrats.");
            return;
        }

        // Format separat per punt i coma i espai (estàndard Outlook / Exchange / Thunderbird / Webmail)
        const textToCopy = emails.join('; ');

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                // Fallback tradicional
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            // Feedback visual i temporal al botó
            if (btnCopyEmailsText) {
                const originalText = btnCopyEmailsText.textContent;
                btnCopyEmails.style.borderColor = 'rgba(16, 185, 129, 0.6)';
                btnCopyEmails.style.color = '#34d399';
                btnCopyEmailsText.textContent = `✓ ${emails.length} correus copiats`;

                setTimeout(() => {
                    btnCopyEmails.style.borderColor = '';
                    btnCopyEmails.style.color = '';
                    btnCopyEmailsText.textContent = originalText;
                }, 2500);
            }
        } catch (err) {
            console.error("Error al copiar al portapapers:", err);
            prompt("No s'ha pogut copiar automàticament. Pots copiar les adreces manualment des d'aquí:", textToCopy);
        }
    });
}

// Excel Export
btnExport.addEventListener('click', () => {
    if (!filteredResults.length) return;
    
    const wb = XLSX.utils.book_new();
    const exportData = filteredResults.map(r => ({
        'Codi Catàleg': r['Detall de partícips.Codi Catàleg'],
        'Denominació Ens': r['Detall de partícips.Denominació'],
        'Partícip Agregat': r['Detall de partícips.Denominació partícip (agregat)'],
        'Origen / Via': r['Origen'],
        'Nom': r['Nom'],
        'Cognoms': r['Cognoms'],
        'Email': r['Email']
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = Object.keys(exportData[0] || {}).map(key => {
        let maxLen = key.length;
        exportData.forEach(r => {
            const val = r[key];
            if (val !== undefined && val !== null) {
                const len = String(val).length;
                if (len > maxLen) maxLen = len;
            }
        });
        return { wch: maxLen + 3 };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Usuaris per Entitat");
    XLSX.writeFile(wb, "Consulta usuaris final.xlsx");
});

// Unified Filtering and Sorting Engine
function applyFiltersAndSort() {
    const query = searchInput ? normalizeText(searchInput.value) : '';
    
    const filterCodi = normalizeText(columnFilters.codi);
    const filterEns = normalizeText(columnFilters.ens);
    const filterParticip = normalizeText(columnFilters.particip);
    const filterOrigen = normalizeText(columnFilters.origen);
    const filterNom = normalizeText(columnFilters.nom);
    const filterCognoms = normalizeText(columnFilters.cognoms);
    const filterEmail = normalizeText(columnFilters.email);
    
    filteredResults = mergedResults.filter(row => {
        const codiStr = normalizeText(row['Detall de partícips.Codi Catàleg']);
        const ensStr = normalizeText(row['Detall de partícips.Denominació']);
        const participStr = normalizeText(row['Detall de partícips.Denominació partícip (agregat)']);
        const origenStr = normalizeText(row['Origen']);
        const nomStr = normalizeText(row['Nom']);
        const cognomsStr = normalizeText(row['Cognoms']);
        const emailStr = normalizeText(row['Email']);
        
        // General search query check
        if (query) {
            const matchQuery = codiStr.includes(query) || 
                               ensStr.includes(query) || 
                               participStr.includes(query) ||
                               origenStr.includes(query) ||
                               nomStr.includes(query) || 
                               cognomsStr.includes(query) || 
                               emailStr.includes(query);
            if (!matchQuery) return false;
        }
        
        // Column-specific filter checks
        if (filterCodi && !codiStr.includes(filterCodi)) return false;
        if (filterEns && !ensStr.includes(filterEns)) return false;
        if (filterParticip && !participStr.includes(filterParticip)) return false;
        if (filterOrigen && !origenStr.includes(filterOrigen)) return false;
        if (filterNom && !nomStr.includes(filterNom)) return false;
        if (filterCognoms && !cognomsStr.includes(filterCognoms)) return false;
        if (filterEmail && !emailStr.includes(filterEmail)) return false;
        
        return true;
    });
    
    // Apply sorting
    if (currentSortColumn) {
        filteredResults.sort((a, b) => {
            let valA, valB;
            
            if (currentSortColumn === 'codi') {
                valA = a['Detall de partícips.Codi Catàleg'] || '';
                valB = b['Detall de partícips.Codi Catàleg'] || '';
            } else if (currentSortColumn === 'ens') {
                valA = a['Detall de partícips.Denominació'] || '';
                valB = b['Detall de partícips.Denominació'] || '';
            } else if (currentSortColumn === 'particip') {
                valA = a['Detall de partícips.Denominació partícip (agregat)'] || '';
                valB = b['Detall de partícips.Denominació partícip (agregat)'] || '';
            } else if (currentSortColumn === 'origen') {
                valA = a['Origen'] || '';
                valB = b['Origen'] || '';
            } else if (currentSortColumn === 'nom') {
                valA = a['Nom'] || '';
                valB = b['Nom'] || '';
            } else if (currentSortColumn === 'cognoms') {
                valA = a['Cognoms'] || '';
                valB = b['Cognoms'] || '';
            } else if (currentSortColumn === 'email') {
                valA = a['Email'] || '';
                valB = b['Email'] || '';
            }
            
            const strA = String(valA).trim();
            const strB = String(valB).trim();
            
            const cmp = strA.localeCompare(strB, 'ca', { numeric: true, sensitivity: 'base' });
            return currentSortDirection === 'asc' ? cmp : -cmp;
        });
    }
    
    currentPage = 1;
    renderTable();
}

function updateDateDisplay(timestampCat, timestampUsr) {
    let tsCat = timestampCat;
    let tsUsr = timestampUsr;
    if (timestampCat && !timestampUsr) {
        tsCat = timestampCat;
        tsUsr = timestampCat;
    }
    
    const formatDate = (ts) => {
        if (!ts) return 'Sense dades';
        const d = new Date(ts);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    };
    
    const strCat = formatDate(tsCat);
    const strUsr = formatDate(tsUsr);
    const formattedText = `Actualitzacions: Usuaris: ${strUsr} / Entitats: ${strCat}`;
    
    const sharepointDateLabel = document.getElementById('sharepointDateLabel');
    const infoUpdateDate = document.getElementById('infoUpdateDate');
    
    if (sharepointDateLabel) {
        sharepointDateLabel.textContent = formattedText;
    }
    if (infoUpdateDate) {
        infoUpdateDate.textContent = `📅 ${formattedText}`;
        infoUpdateDate.classList.remove('hidden');
    }
}

function getWorkbookDate(wb) {
    if (!wb || !wb.Props) return null;
    const d = wb.Props.CreatedDate || wb.Props.ModifiedDate || wb.Props.Created || wb.Props.Modified;
    if (d) {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

async function extractMetadataDatesFromFiles(fileCat, fileUsr) {
    if (fileCat) {
        try {
            const arrayBuffer = await fileCat.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(arrayBuffer), {type: 'array'});
            const d = getWorkbookDate(wb);
            if (d) dateCatModified = d.getTime();
            else dateCatModified = fileCat.lastModified;
        } catch (e) {
            dateCatModified = fileCat.lastModified;
        }
    }
    if (fileUsr) {
        try {
            const arrayBuffer = await fileUsr.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(arrayBuffer), {type: 'array'});
            const d = getWorkbookDate(wb);
            if (d) dateUsrModified = d.getTime();
            else dateUsrModified = fileUsr.lastModified;
        } catch (e) {
            dateUsrModified = fileUsr.lastModified;
        }
    }
}
