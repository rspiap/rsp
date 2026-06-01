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

// State variables
let directoryHandle = null;
let fileDataCat = null;
let fileDataUsr = null;
let mergedResults = [];
let filteredResults = [];
let hasClickedSync = false;
let currentSortColumn = null;
let currentSortDirection = 'asc';
const columnFilters = {
    codi: '',
    ens: '',
    particip: '',
    dept: '',
    nom: '',
    cognoms: '',
    email: ''
};

// Pagination State
let currentPage = 1;
const rowsPerPage = 50;

// Dom Elements
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
const btnShowManualConnected = document.getElementById('btnShowManualConnected');


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
const searchInput = document.getElementById('searchInput');
const recordCount = document.getElementById('recordCount');

const resultsTable = document.getElementById('resultsTable');
const tableBody = document.getElementById('tableBody');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const pageIndicator = document.getElementById('pageIndicator');

// Initialize events on load
window.addEventListener('DOMContentLoaded', async () => {
    if (btnShowManualUpload) btnShowManualUpload.addEventListener('click', showManualUpload);
    if (btnShowManualConnected) btnShowManualConnected.addEventListener('click', showManualUpload);
    
    // 4. Setup folder connect/disconnect/sync buttons
    if (btnConnectFolder) btnConnectFolder.addEventListener('click', connectSharepointFolder);
    if (btnDisconnectFolder) btnDisconnectFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnChangeFolder) btnChangeFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnReauthorize) btnReauthorize.addEventListener('click', reauthorizeFolderAccess);
    if (btnSyncNow) btnSyncNow.addEventListener('click', () => {
        syncWithDirectory(directoryHandle);
    });
    
    const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
    if (btnUploadToSharepoint) {
        btnUploadToSharepoint.addEventListener('click', async () => {
            hasClickedSync = true;
            if (!directoryHandle) {
                alert("No hi ha cap carpeta de SharePoint connectada.");
                return;
            }
            if (!fileDataCat || !fileDataUsr) {
                alert("Si us plau, puja primer els dos fitxers excel.");
                return;
            }
            
            btnUploadToSharepoint.setAttribute('disabled', 'true');
            btnUploadToSharepoint.textContent = 'Carregant...';
            
            try {
                let filesSaved = [];
                const saveCat = await saveFileToDirectory(directoryHandle, fileDataCat, "Cataleg_dens_export.xls");
                if (saveCat) filesSaved.push("Cataleg_dens_export.xls");
                
                const saveUsr = await saveFileToDirectory(directoryHandle, fileDataUsr, "Export_Usuaris.xls");
                if (saveUsr) filesSaved.push("Export_Usuaris.xls");
                
                if (filesSaved.length === 2) {
                    btnProcess.click();
                } else {
                    alert("⚠️ Hi ha hagut un problema en desar un o ambdós fitxers.");
                }
            } catch (e) {
                console.error(e);
                alert("Error en desar els fitxers: " + e.message);
            } finally {
                btnUploadToSharepoint.removeAttribute('disabled');
                btnUploadToSharepoint.textContent = '📤 Carregar i sincronitzar';
            }
        });
    }
    
    // 5. Setup Drag & Drop manual zones
    setupDropZone(dropZoneCat, fileInputCat, fileInfoCat, (data) => {
        fileDataCat = data;
        checkReadyToProcess();
    });
    setupDropZone(dropZoneUsr, fileInputUsr, fileInfoUsr, (data) => {
        fileDataUsr = data;
        checkReadyToProcess();
    });

    // 5b. Setup remove cross buttons for manual cards
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

    // 5c. Setup column filter inputs and sort headers
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
            
            // Toggle sort direction if same column, else default to asc
            if (currentSortColumn === col) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = col;
                currentSortDirection = 'asc';
            }
            
            // Update sort visual classes on headers
            headers.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
                h.querySelector('.sort-icon').textContent = '↕';
            });
            
            if (currentSortDirection === 'asc') {
                th.classList.add('sorted-asc');
                th.querySelector('.sort-icon').textContent = '▲';
            } else {
                th.classList.add('sorted-desc');
                th.querySelector('.sort-icon').textContent = '▼';
            }
            
            applyFiltersAndSort();
        });
    });

    // 6. Try to load saved folder from IndexedDB
    try {
        const savedHandle = await getDirectoryHandle();
        if (savedHandle) {
            directoryHandle = savedHandle;
            
            // Switch UI to connected state
            sharepointPickerState.classList.add('hidden');
            sharepointConnectedState.classList.remove('hidden');
            
            // Query permission silently (NO prompt, no user gesture yet)
            const permissionState = await directoryHandle.queryPermission({ mode: 'readwrite' });
            if (permissionState === 'granted') {
                await syncWithDirectorySilent(directoryHandle);
            } else {
                statusDot.className = 'status-dot yellow';
                statusText.textContent = 'Requerix Autorització';
                // Automatically show manual upload fallback as a precaution or let the user click
                // Let's silently check if they need to authorize
            }
        } else {
            showInitialState();
        }
    } catch (e) {
        console.error("Error loading directory from IndexedDB", e);
        showInitialState();
    }
});



// Show manual drag and drop section
function showManualUpload() {
    manualUploadSection.classList.remove('hidden');
    btnShowManualUpload.classList.add('hidden');
    // Scroll to section
    manualUploadSection.scrollIntoView({ behavior: 'smooth' });
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
    btnShowManualUpload.classList.remove('hidden');
}

// Connect new folder using File System Access API
async function connectSharepointFolder() {
    try {
        if (!window.showDirectoryPicker) {
            alert("El teu navegador no suporta l'accés directe a carpetes locals. Si us plau, utilitza Chrome o Edge.");
            return;
        }
        

        
        const handle = await window.showDirectoryPicker({
            id: 'gpg-merge-sharepoint',
            mode: 'readwrite'
        });
        
        directoryHandle = handle;
        await saveDirectoryHandle(handle);
        
        // Switch UI to connected state
        sharepointPickerState.classList.add('hidden');
        sharepointConnectedState.classList.remove('hidden');
        
        await syncWithDirectory(handle);
    } catch (e) {
        console.error("User cancelled or directory select failed", e);
    }
}

// Re-authorize access to already saved handle
async function reauthorizeFolderAccess() {
    if (!directoryHandle) return;
    try {
        const options = { mode: 'readwrite' };
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
        directoryHandle = null;
        fileDataCat = null;
        fileDataUsr = null;
        mergedResults = [];
        filteredResults = [];
        
        // Clear UI states
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
        const { fileCat, fileUsr, fileOut } = await loadFilesFromDirectory(handle);
        
        // 1. Si ja disposem de la fusió pre-calculada, la carreguem directament a l'acte!
        if (fileOut) {
            statusText.textContent = 'Carregant dades desades...';
            const arrayBuffer = await fileOut.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(arrayBuffer), {type: 'array'});
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            mergedResults = rows.map(r => {
                const isDept = r['Denominació Partícip (Agregat)'] === 'Departament';
                return {
                    'Detall de partícips.Codi Catàleg': r['Codi Catàleg'] || null,
                    'Detall de partícips.Denominació': isDept ? null : r['Denominació Ens'],
                    'Desc. Departament': isDept ? r['Denominació Ens'] : null,
                    'Nom': r['Nom'] || null,
                    'Cognoms': r['Cognoms'] || null,
                    'Email': r['Email'] || null,
                    'Detall de partícips.Denominació partícip (agregat)': isDept ? null : r['Denominació Partícip (Agregat)']
                };
            });
            filteredResults = [...mergedResults];
            
            statusDot.className = 'status-dot green';
            statusText.textContent = 'Dades Carregades';
            btnDisconnectFolder.style.display = 'inline-block';
            
            // Mostrar resultats directament a la taula
            resultsSection.classList.remove('hidden');
            currentPage = 1;
            renderTable();
            
            // Pre-omplir en segon pla les targetes de càrrega manual
            fileInfoCat.classList.remove('active');
            dropZoneCat.style.display = 'block';
            fileInfoUsr.classList.remove('active');
            dropZoneUsr.style.display = 'block';
            
            if (fileCat) {
                fileDataCat = new Uint8Array(await fileCat.arrayBuffer());
                fileInfoCat.querySelector('.file-name').textContent = `${fileCat.name} (SharePoint)`;
                fileInfoCat.classList.add('active');
                dropZoneCat.style.display = 'none';
            }
            if (fileUsr) {
                fileDataUsr = new Uint8Array(await fileUsr.arrayBuffer());
                fileInfoUsr.querySelector('.file-name').textContent = `${fileUsr.name} (SharePoint)`;
                fileInfoUsr.classList.add('active');
                dropZoneUsr.style.display = 'none';
            }
            return; // Sortida ràpida de la inicialització exitosa!
        }
        
        // Reset manual upload card visual states before populating
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
            
            // Automatically launch ETL
            btnProcess.removeAttribute('disabled');
            processSection.classList.remove('hidden');
            btnProcess.click();
        } else {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Fitxers incomplets';
            
            // Automatically show manual upload fallback with the missing one empty
            showManualUpload();
            checkReadyToProcess(); // Update buttons visibility
        }
    } catch (e) {
        console.error("Silent sync failed", e);
        showManualUpload();
    }
}

// Query handle permission and load files
async function syncWithDirectory(handle) {
    // Show spinner in connected state or loading progress
    btnSyncNow.setAttribute('disabled', 'true');
    statusDot.className = 'status-dot yellow';
    statusText.textContent = 'Actualitzant...';
    
    try {
        // Query permission
        const permissionState = await handle.queryPermission({ mode: 'readwrite' });
        
        if (permissionState === 'prompt') {
            // Need user prompt
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Requerix Permís';
            const permission = await handle.requestPermission({ mode: 'readwrite' });
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
        
        // Permission is granted, scan files
        statusDot.className = 'status-dot green';
        statusText.textContent = 'SharePoint Connectat';
        btnDisconnectFolder.style.display = 'inline-block';
        
        const { fileCat, fileUsr } = await loadFilesFromDirectory(handle);
        
        // Reset manual upload card visual states before populating
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
            // Automatically launch ETL
            btnProcess.removeAttribute('disabled');
            processSection.classList.remove('hidden');
            
            // Trigger process
            btnProcess.click();
            
            // Show manual upload section with files pre-filled so they can update them by dragging
            showManualUpload();
            checkReadyToProcess(); // Update buttons visibility
        } else {
            statusDot.className = 'status-dot yellow';
            statusText.textContent = 'Fitxers incomplets';
            let missingMsg = "No s'han trobat els fitxers excels necessaris a la carpeta de SharePoint / OneDrive amb els noms exactes.";
            if (!fileCat) missingMsg += "\n- Falta el fitxer exactament anomenat 'Cataleg_dens_export.xls' (o .xlsx).";
            if (!fileUsr) missingMsg += "\n- Falta el fitxer exactament anomenat 'Export_Usuaris.xls' (o .xlsx).";
            alert(missingMsg);
            
            // Show manual upload fallback
            showManualUpload();
            checkReadyToProcess(); // Update buttons visibility
        }
    } catch (e) {
        console.error("Error during synchronization", e);
        alert("Error de sincronització: " + e.message);
        showManualUpload();
    } finally {
        btnSyncNow.removeAttribute('disabled');
    }
}

// Scan directory and return exact matches for Cataleg_dens_export.xls, Export_Usuaris.xls, and Consulta usuaris final + depts.xlsx
async function loadFilesFromDirectory(dirHandle) {
    let fileCat = null;
    let fileUsr = null;
    let fileOut = null;
    
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            
            // Check exact simplified names (allowing .xls or .xlsx)
            if (name === 'cataleg_dens_export.xls' || name === 'cataleg_dens_export.xlsx') {
                fileCat = await entry.getFile();
            } else if (name === 'export_usuaris.xls' || name === 'export_usuaris.xlsx') {
                fileUsr = await entry.getFile();
            } else if (name === 'consulta usuaris final + depts.xlsx') {
                fileOut = await entry.getFile();
            }
        }
    }
    return { fileCat, fileUsr, fileOut };
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
        dropZone.style.display = 'none';
        callback(data);
    };
    const dropZone = fileInput.parentElement;
    reader.readAsArrayBuffer(file);
}

// Check if both files are manually uploaded
function checkReadyToProcess() {
    const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
    if (fileDataCat && fileDataUsr) {
        btnProcess.removeAttribute('disabled');
        processSection.classList.remove('hidden');
        resetSteps();
        
        if (directoryHandle) {
            if (btnUploadToSharepoint) btnUploadToSharepoint.classList.remove('hidden');
        } else {
            if (btnUploadToSharepoint) btnUploadToSharepoint.classList.add('hidden');
        }
        
        // Trigger ETL process automatically!
        btnProcess.click();
    } else {
        btnProcess.setAttribute('disabled', 'true');
        processSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        if (btnUploadToSharepoint) btnUploadToSharepoint.classList.add('hidden');
    }
}

function resetSteps() {
    const steps = ['stepRead', 'stepParticips', 'stepJoins', 'stepDepts'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove('active', 'completed');
    });
}

function updateStepStatus(id, status) {
    const el = document.getElementById(id);
    if (status === 'active') {
        el.classList.add('active');
        el.classList.remove('completed');
    } else if (status === 'completed') {
        el.classList.remove('active');
        el.classList.add('completed');
    }
}

// ETL Process Trigger
btnProcess.addEventListener('click', async () => {
    btnProcess.setAttribute('disabled', 'true');
    resetSteps();
    
    try {
        // Comprovar que disposem de les dades binaris dels fitxers
        if (!fileDataCat || fileDataCat.length === 0) {
            throw new Error("El fitxer de Catàleg és buit o invàlid.");
        }
        if (!fileDataUsr || fileDataUsr.length === 0) {
            throw new Error("El fitxer d'Exportació d'Usuaris és buit o invàlid.");
        }

        // Step 1: Read Files
        updateStepStatus('stepRead', 'active');
        await delay(600);
        
        let wbCat, wbUsr;
        try {
            wbCat = XLSX.read(fileDataCat, {type: 'array', cellDates: true});
        } catch (catErr) {
            console.error(catErr);
            throw new Error("El fitxer del Catàleg de Partícips ('Cataleg_dens_export.xls') és invàlid, està corrupte o està bloquejat per Excel.");
        }

        try {
            wbUsr = XLSX.read(fileDataUsr, {type: 'array', cellDates: true});
        } catch (usrErr) {
            console.error(usrErr);
            throw new Error("El fitxer d'Exportació d'Usuaris ('Export_Usuaris.xls') és invàlid, està corrupte o està bloquejat per Excel.");
        }
        updateStepStatus('stepRead', 'completed');

        // Step 2: Detall de partícips ETL
        updateStepStatus('stepParticips', 'active');
        await delay(800);
        
        const sheetParticipsRaw = wbCat.Sheets['Detall de partícips'];
        if (!sheetParticipsRaw) throw new Error("No s'ha trobat la fulla 'Detall de partícips' a Cataleg_dens_export");
        
        const rowsParticips = xlsxToObjectsWithDuplicateHeaders(sheetParticipsRaw);
        
        const detallParticips = rowsParticips
            .filter(r => r['Vincle primari'] === 'Si')
            .map(r => ({
                'Codi Catàleg': r['Codi Catàleg'],
                'Denominació': r['Denominació'],
                'Denominació partícip (agregat)': r['Denominació partícip (agregat)'],
                'Codi Catàleg_1': r['Codi Catàleg_1'],
                'Vincle primari': r['Vincle primari']
            }));
            
        updateStepStatus('stepParticips', 'completed');

        // Step 3: Joins & Direct Authorizations
        updateStepStatus('stepJoins', 'active');
        await delay(1000);

        const sheetDirectaRaw = wbUsr.Sheets['Autorització directa a ens'];
        if (!sheetDirectaRaw) throw new Error("No s'ha trobat la fulla 'Autorització directa a ens' a Export_Usuaris");
        
        const rowsDirecta = XLSX.utils.sheet_to_json(sheetDirectaRaw, {defval: null});

        // Step 3a: Consulta usuaris (Full Outer Join on Ens <=> Codi Catàleg_1)
        const consultaUsuaris = [];
        const matchedParticips = new Set();
        
        rowsDirecta.forEach(usr => {
            const ensKey = usr['Ens'] ? String(usr['Ens']).trim() : null;
            let foundMatch = false;
            
            detallParticips.forEach(part => {
                const partKey = part['Codi Catàleg_1'] ? String(part['Codi Catàleg_1']).trim() : null;
                if (ensKey !== null && partKey !== null && ensKey === partKey) {
                    foundMatch = true;
                    matchedParticips.add(part);
                    consultaUsuaris.push({
                        'Nom': usr['Nom'],
                        'Cognoms': usr['Cognoms'],
                        'Email': usr['Email'],
                        'Detall de partícips.Codi Catàleg': part['Codi Catàleg'],
                        'Detall de partícips.Denominació': part['Denominació'],
                        'Detall de partícips.Denominació partícip (agregat)': part['Denominació partícip (agregat)']
                    });
                }
            });
            
            if (!foundMatch) {
                consultaUsuaris.push({
                    'Nom': usr['Nom'],
                    'Cognoms': usr['Cognoms'],
                    'Email': usr['Email'],
                    'Detall de partícips.Codi Catàleg': null,
                    'Detall de partícips.Denominació': null,
                    'Detall de partícips.Denominació partícip (agregat)': null
                });
            }
        });

        detallParticips.forEach(part => {
            if (!matchedParticips.has(part)) {
                consultaUsuaris.push({
                    'Nom': null,
                    'Cognoms': null,
                    'Email': null,
                    'Detall de partícips.Codi Catàleg': part['Codi Catàleg'],
                    'Detall de partícips.Denominació': part['Denominació'],
                    'Detall de partícips.Denominació partícip (agregat)': part['Denominació partícip (agregat)']
                });
            }
        });

        const consultaUsuarisFiltrada = consultaUsuaris.filter(r => r['Detall de partícips.Codi Catàleg'] !== null && r['Detall de partícips.Codi Catàleg'] !== undefined);

        // Step 3b: Administració de la Generalitat (Right Outer Join on Denominació <=> Nom ens - CASE-SENSITIVE)
        const administracioGeneralitat = [];
        rowsDirecta.forEach(usr => {
            const nomEnsKey = usr['Nom ens'] ? String(usr['Nom ens']).trim() : null;
            let foundMatch = false;
            
            detallParticips.forEach(part => {
                const denomKey = part['Denominació'] ? String(part['Denominació']).trim() : null;
                if (nomEnsKey !== null && denomKey !== null && nomEnsKey === denomKey) {
                    foundMatch = true;
                    if (part['Denominació partícip (agregat)'] === 'Administració de la Generalitat de Catalunya') {
                        administracioGeneralitat.push({
                            'Nom': usr['Nom'],
                            'Cognoms': usr['Cognoms'],
                            'Email': usr['Email'],
                            'Detall de partícips.Codi Catàleg': part['Codi Catàleg'],
                            'Detall de partícips.Denominació': part['Denominació'],
                            'Detall de partícips.Denominació partícip (agregat)': part['Denominació partícip (agregat)']
                        });
                    }
                }
            });
        });

        // Step 3c: Combine the two (Union) to form "Consulta usuaris final"
        const consultaUsuarisFinal = [...consultaUsuarisFiltrada, ...administracioGeneralitat];
        updateStepStatus('stepJoins', 'completed');

        // Step 4: Autorització a departaments & Final Combined + depts
        updateStepStatus('stepDepts', 'active');
        await delay(1000);

        const sheetDeptsRaw = wbUsr.Sheets['Autoritzacio a departaments'];
        if (!sheetDeptsRaw) throw new Error("No s'ha trobat la fulla 'Autoritzacio a departaments' a Export_Usuaris");
        
        const rowsDepts = XLSX.utils.sheet_to_json(sheetDeptsRaw, {defval: null});

        const autoritzacioDepts = rowsDepts
            .filter(r => r['Perfil'] !== 'Intervenció')
            .map(r => ({
                'Nom': r['Nom'],
                'Cognoms': r['Cognoms'],
                'Email': r['Email'],
                'Desc. Departament': r['Desc. Departament'],
                'Detall de partícips.Codi Catàleg': null,
                'Detall de partícips.Denominació': null,
                'Detall de partícips.Denominació partícip (agregat)': null
            }));

        const consultaUsuarisFinalFormatted = consultaUsuarisFinal.map(r => ({
            ...r,
            'Desc. Departament': null
        }));

        // Final Combine (Union)
        mergedResults = [...consultaUsuarisFinalFormatted, ...autoritzacioDepts];
        filteredResults = [...mergedResults];
        
        updateStepStatus('stepDepts', 'completed');
        
        // Hide process tracker on success
        processSection.classList.add('hidden');
        
        // Hide manual upload section on success only if a synchronization action was initiated
        if (hasClickedSync && manualUploadSection) {
            manualUploadSection.classList.add('hidden');
            hasClickedSync = false;
        }
        
        // Show table & set page 1
        resultsSection.classList.remove('hidden');
        currentPage = 1;
        renderTable();
        
        // --- AUTOMATIC FILE WRITING TO SHAREPOINT ---
        if (directoryHandle) {
            // 1. Generate output Excel binary data using SheetJS
            const exportData = filteredResults.map(r => ({
                'Detall de partícips.Codi Catàleg': r['Detall de partícips.Codi Catàleg'],
                'Detall de partícips.Denominació': r['Detall de partícips.Denominació'],
                'Detall de partícips.Denominació partícip (agregat)': r['Detall de partícips.Denominació partícip (agregat)'],
                'Desc. Departament': r['Desc. Departament'],
                'Nom': r['Nom'],
                'Cognoms': r['Cognoms'],
                'Email': r['Email']
            }));
            const wbOut = XLSX.utils.book_new();
            const wsOut = XLSX.utils.json_to_sheet(exportData);
            
            // Auto-fit columns to text length
            const colWidthsOut = Object.keys(exportData[0] || {}).map(key => {
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
            wsOut['!cols'] = colWidthsOut;

            XLSX.utils.book_append_sheet(wbOut, wsOut, "Dades Fusionades");
            const wbBinary = XLSX.write(wbOut, {bookType: 'xlsx', type: 'array'});
            
            let filesSaved = [];
            
            // If the user uploaded files manually, write them directly back to the SharePoint folder!
            if (manualUploadSection && !manualUploadSection.classList.contains('hidden')) {
                if (fileDataCat) {
                    const saveCat = await saveFileToDirectory(directoryHandle, fileDataCat, "Cataleg_dens_export.xls");
                    if (saveCat) filesSaved.push("Cataleg_dens_export.xls");
                }
                if (fileDataUsr) {
                    const saveUsr = await saveFileToDirectory(directoryHandle, fileDataUsr, "Export_Usuaris.xls");
                    if (saveUsr) filesSaved.push("Export_Usuaris.xls");
                }
            }
            
            // Save the output merged excel directly
            await saveFileToDirectory(directoryHandle, new Uint8Array(wbBinary), "Consulta usuaris final + depts.xlsx");
        }
        
    } catch (err) {
        alert("S'ha produït un error en processar els fitxers: " + err.message);
        console.error(err);
    } finally {
        btnProcess.removeAttribute('disabled');
    }
});

// Helper to write files directly to directory handles (File System Access API)
async function saveFileToDirectory(dirHandle, fileData, fileName) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(fileData);
        await writable.close();
        console.log(`Saved ${fileName} directly to local SharePoint directory`);
        return true;
    } catch (e) {
        console.error(`Failed to save ${fileName} to local SharePoint directory`, e);
        return false;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function xlsxToObjectsWithDuplicateHeaders(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows = [];
    const headers = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({r: range.s.r, c: col})];
        let val = cell ? cell.v : `Column${col + 1}`;
        
        let finalVal = val;
        let count = 1;
        while (headers.includes(finalVal)) {
            finalVal = `${val}_${count}`;
            count++;
        }
        headers.push(finalVal);
    }
    
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
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

function renderTable() {
    tableBody.innerHTML = '';
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, filteredResults.length);
    
    const pageItems = filteredResults.slice(startIndex, endIndex);
    
    if (pageItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--text-muted);">Cap resultat que coincideixi amb la cerca</td></tr>`;
        recordCount.textContent = `0 registres`;
        btnPrev.setAttribute('disabled', 'true');
        btnNext.setAttribute('disabled', 'true');
        pageIndicator.textContent = 'Pàgina 1 de 1';
        return;
    }

    pageItems.forEach(row => {
        const tr = document.createElement('tr');
        
        const codi = row['Detall de partícips.Codi Catàleg'] || '-';
        const ens = row['Detall de partícips.Denominació'] || '-';
        let particip = row['Detall de partícips.Denominació partícip (agregat)'] || '-';
        let dept = row['Desc. Departament'] || '-';
        const nom = row['Nom'] || '-';
        const cognoms = row['Cognoms'] || '-';
        const email = row['Email'] || '-';
        
        // Visual badge for departments
        if (row['Desc. Departament']) {
            dept = `<span style="color:var(--accent-violet); font-size:0.8rem; font-weight:600; background:rgba(139,92,246,0.1); padding:2px 8px; border-radius:4px;">${row['Desc. Departament']}</span>`;
            particip = `<span style="color:var(--text-muted); font-size:0.8rem;">DEPARTAMENT</span>`;
        }

        tr.innerHTML = `
            <td><strong>${codi}</strong></td>
            <td>${ens}</td>
            <td>${particip}</td>
            <td>${dept}</td>
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

searchInput.addEventListener('input', () => {
    applyFiltersAndSort();
});

btnExport.addEventListener('click', () => {
    if (!filteredResults.length) return;
    
    const wb = XLSX.utils.book_new();
    const exportData = filteredResults.map(r => ({
        'Detall de partícips.Codi Catàleg': r['Detall de partícips.Codi Catàleg'],
        'Detall de partícips.Denominació': r['Detall de partícips.Denominació'],
        'Detall de partícips.Denominació partícip (agregat)': r['Detall de partícips.Denominació partícip (agregat)'],
        'Desc. Departament': r['Desc. Departament'],
        'Nom': r['Nom'],
        'Cognoms': r['Cognoms'],
        'Email': r['Email']
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-fit columns to text length
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

    XLSX.utils.book_append_sheet(wb, ws, "Dades Fusionades");
    XLSX.writeFile(wb, "Consulta usuaris final + depts.xlsx");
});

// Unified Filtering and Sorting Engine
function applyFiltersAndSort() {
    const query = searchInput.value.toLowerCase().trim();
    
    filteredResults = mergedResults.filter(row => {
        const codiStr = String(row['Detall de partícips.Codi Catàleg'] || '').toLowerCase();
        const ensStr = String(row['Detall de partícips.Denominació'] || '').toLowerCase();
        const participStr = String(row['Detall de partícips.Denominació partícip (agregat)'] || '').toLowerCase();
        const deptStr = String(row['Desc. Departament'] || '').toLowerCase();
        const nomStr = String(row['Nom'] || '').toLowerCase();
        const cognomsStr = String(row['Cognoms'] || '').toLowerCase();
        const emailStr = String(row['Email'] || '').toLowerCase();
        
        // General search query check
        if (query) {
            const matchQuery = codiStr.includes(query) || 
                               ensStr.includes(query) || 
                               participStr.includes(query) ||
                               deptStr.includes(query) ||
                               nomStr.includes(query) || 
                               cognomsStr.includes(query) || 
                               emailStr.includes(query);
            if (!matchQuery) return false;
        }
        
        // Column-specific filter checks
        if (columnFilters.codi && !codiStr.includes(columnFilters.codi.toLowerCase())) return false;
        if (columnFilters.ens && !ensStr.includes(columnFilters.ens.toLowerCase())) return false;
        if (columnFilters.particip && !participStr.includes(columnFilters.particip.toLowerCase())) return false;
        if (columnFilters.dept && !deptStr.includes(columnFilters.dept.toLowerCase())) return false;
        if (columnFilters.nom && !nomStr.includes(columnFilters.nom.toLowerCase())) return false;
        if (columnFilters.cognoms && !cognomsStr.includes(columnFilters.cognoms.toLowerCase())) return false;
        if (columnFilters.email && !emailStr.includes(columnFilters.email.toLowerCase())) return false;
        
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
            } else if (currentSortColumn === 'dept') {
                valA = a['Desc. Departament'] || '';
                valB = b['Desc. Departament'] || '';
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
