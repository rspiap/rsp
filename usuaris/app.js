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
let dateCatModified = null;
let dateUsrModified = null;
const DEFAULT_DEPT_MAPPING = {
    'ECO': 'ECF',
    'EXT': 'UEX',
    'ACC': 'ARP',
    'DSO': 'DSI'
};
let departmentMapping = {};
let mergedResults = [];
let filteredResults = [];
let hasClickedSync = false;
let currentSortColumn = 'ens';
let currentSortDirection = 'desc';
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
    
    // 4. Setup folder connect/disconnect/sync buttons
    if (btnConnectFolder) btnConnectFolder.addEventListener('click', connectSharepointFolder);
    if (btnDisconnectFolder) btnDisconnectFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnChangeFolder) btnChangeFolder.addEventListener('click', disconnectSharepointFolder);
    if (btnReauthorize) btnReauthorize.addEventListener('click', reauthorizeFolderAccess);
    if (btnSyncNow) btnSyncNow.addEventListener('click', () => {
        showManualUpload();
    });
    
    // Load department mapping
    loadDepartmentMapping();
    
    // Bind mapping modal triggers
    const mappingTriggers = document.querySelectorAll('.btn-show-mapping-trigger');
    mappingTriggers.forEach(btn => {
        btn.addEventListener('click', () => {
            renderMappingRows();
            const modal = document.getElementById('mappingModal');
            if (modal) modal.classList.remove('hidden');
        });
    });
    
    const btnCloseMapping = document.getElementById('btnCloseMapping');
    if (btnCloseMapping) {
        btnCloseMapping.addEventListener('click', closeMappingModal);
    }
    
    const btnCancelMapping = document.getElementById('btnCancelMapping');
    if (btnCancelMapping) {
        btnCancelMapping.addEventListener('click', closeMappingModal);
    }
    

    
    const btnSaveMapping = document.getElementById('btnSaveMapping');
    if (btnSaveMapping) {
        btnSaveMapping.addEventListener('click', saveDepartmentMapping);
    }
    
    const btnCancelManualUpload = document.getElementById('btnCancelManualUpload');
    if (btnCancelManualUpload) {
        btnCancelManualUpload.addEventListener('click', async () => {
            if (manualUploadSection) manualUploadSection.classList.add('hidden');
            
            if (directoryHandle) {
                // Revert in-memory files and table data to SharePoint's state
                try {
                    await syncWithDirectorySilent(directoryHandle);
                } catch (e) {
                    console.error("Error restoring SharePoint state on cancel", e);
                }
            } else {
                // Offline mode: clear everything
                fileDataCat = null;
                fileDataUsr = null;
                mergedResults = [];
                filteredResults = [];
                
                if (fileInfoCat) fileInfoCat.classList.remove('active');
                if (fileInputCat) fileInputCat.value = '';
                if (dropZoneCat) dropZoneCat.style.display = 'block';
                
                if (fileInfoUsr) fileInfoUsr.classList.remove('active');
                if (fileInputUsr) fileInputUsr.value = '';
                if (dropZoneUsr) dropZoneUsr.style.display = 'block';
                
                if (processSection) processSection.classList.add('hidden');
                if (resultsSection) resultsSection.classList.add('hidden');
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
            
            // Hide buttons to only show progress tracker
            if (btnUploadToSharepoint) btnUploadToSharepoint.classList.add('hidden');
            if (btnCancelManualUpload) btnCancelManualUpload.classList.add('hidden');
            
            try {
                if (directoryHandle) {
                    // Save files back to SharePoint folder if they were manually uploaded/overridden
                    await saveFileToDirectory(directoryHandle, fileDataCat, "Cataleg_dens_export.xls");
                    await saveFileToDirectory(directoryHandle, fileDataUsr, "Export_Usuaris.xls");
                }
                btnProcess.click();
            } catch (e) {
                console.error("Error durant el desament dels fitxers d'origen, procedint en memòria:", e);
                btnProcess.click();
            }
        });
    }
    
    // 5. Setup Drag & Drop manual zones
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
            const pathLabel = document.getElementById('sharepointPathLabel');
            if (pathLabel && savedHandle) {
                pathLabel.textContent = `Ruta: D:\\fakepath\\OneDrive - Generalitat de Catalunya\\Documents (PROVES) - SDG Entitats\\04. Usuaris\\${savedHandle.name}`;
            }
            
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
    if (btnShowManualUpload) btnShowManualUpload.classList.add('hidden');
    // Scroll and center the section on the screen
    manualUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        const pathLabel = document.getElementById('sharepointPathLabel');
        if (pathLabel && handle) {
            pathLabel.textContent = `Ruta: D:\\fakepath\\OneDrive - Generalitat de Catalunya\\Documents (PROVES) - SDG Entitats\\04. Usuaris\\${handle.name}`;
        }
        
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
        
        // 1. Si ja disposem de la fusió pre-calculada, la carreguem directament sense recalcular
        if (fileOut) {
            statusText.textContent = 'Carregant dades desades...';
            const arrayBuffer = await fileOut.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(arrayBuffer), {type: 'array'});
            
            // Extract original dates from comments to avoid reading heavy source files
            if (wb.Props && wb.Props.Comments) {
                const comments = wb.Props.Comments;
                const match = comments.match(/CatDate:(\d+)\|UsrDate:(\d+)/);
                if (match) {
                    dateCatModified = parseInt(match[1]) || null;
                    dateUsrModified = parseInt(match[2]) || null;
                }
            }
            if (!dateCatModified && !dateUsrModified) {
                dateCatModified = fileOut.lastModified;
                dateUsrModified = fileOut.lastModified;
            }
            updateDateDisplay(dateCatModified, dateUsrModified);

            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            
            mergedResults = rows.map(r => {
                // Read exact columns from sheet
                return {
                    'Detall de partícips.Codi Catàleg': r['Detall de partícips.Codi Catàleg'] !== undefined ? r['Detall de partícips.Codi Catàleg'] : null,
                    'Detall de partícips.Denominació': r['Detall de partícips.Denominació'] !== undefined ? r['Detall de partícips.Denominació'] : null,
                    'Desc. Departament': r['Desc. Departament'] !== undefined ? r['Desc. Departament'] : null,
                    'Nom': r['Nom'] !== undefined ? r['Nom'] : null,
                    'Cognoms': r['Cognoms'] !== undefined ? r['Cognoms'] : null,
                    'Email': r['Email'] !== undefined ? r['Email'] : null,
                    'Detall de partícips.Denominació partícip (agregat)': r['Detall de partícips.Denominació partícip (agregat)'] !== undefined ? r['Detall de partícips.Denominació partícip (agregat)'] : null
                };
            });
            filteredResults = [...mergedResults];
            
            statusDot.className = 'status-dot green';
            statusText.textContent = 'Dades Carregades';
            btnDisconnectFolder.style.display = 'inline-block';
            
            // Mostrar resultats directament a la taula
            resultsSection.classList.remove('hidden');
            currentPage = 1;
            applyFiltersAndSort();
            
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
            return; // Sortida ràpida
        }

        await extractMetadataDatesFromFiles(fileCat, fileUsr);
        updateDateDisplay(dateCatModified, dateUsrModified);
        
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
            if (manualUploadSection) manualUploadSection.classList.add('hidden');
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
async function syncWithDirectory(handle, forceRecalculate = false) {
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
        
        const { fileCat, fileUsr, fileOut } = await loadFilesFromDirectory(handle);
        
        await extractMetadataDatesFromFiles(fileCat, fileUsr);
        updateDateDisplay(dateCatModified, dateUsrModified);
        
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
            
            // If the user clicked the sync button manually, show the drag section. Otherwise, keep it hidden.
            if (forceRecalculate) {
                showManualUpload();
            } else {
                if (manualUploadSection) manualUploadSection.classList.add('hidden');
            }
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
        callback(data, file.lastModified);
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
        
        if (btnUploadToSharepoint) {
            btnUploadToSharepoint.classList.remove('hidden');
            if (directoryHandle) {
                btnUploadToSharepoint.textContent = '📤 Carregar i sincronitzar';
            } else {
                btnUploadToSharepoint.textContent = '⚡ Processar Dades';
            }
        }
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
            const d = getWorkbookDate(wbCat);
            if (d) dateCatModified = d.getTime();
        } catch (catErr) {
            console.error(catErr);
            throw new Error("El fitxer del Catàleg de Partícips ('Cataleg_dens_export.xls') és invàlid, està corrupte o està bloquejat per Excel.");
        }

        try {
            wbUsr = XLSX.read(fileDataUsr, {type: 'array', cellDates: true});
            const d = getWorkbookDate(wbUsr);
            if (d) dateUsrModified = d.getTime();
        } catch (usrErr) {
            console.error(usrErr);
            throw new Error("El fitxer d'Exportació d'Usuaris ('Export_Usuaris.xls') és invàlid, està corrupte o està bloquejat per Excel.");
        }
        updateStepStatus('stepRead', 'completed');
        
        // Update date display with extracted metadata dates
        updateDateDisplay(dateCatModified, dateUsrModified);

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

        // Populate unique user departments
        const rawUserDepts = rowsDepts.map(r => r['Desc. Departament']).filter(Boolean);
        userDepartments = Array.from(new Set(rawUserDepts)).sort();

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

        // Parse 'Dades entitat' and filter for Generalitat de Catalunya entities
        const sheetDadesEntitatRaw = wbCat.Sheets['Dades entitat'];
        const generalitatDeptUsuaris = [];
        if (sheetDadesEntitatRaw) {
            // Read starting from header line 2 (index 1)
            const rowsDadesEntitat = xlsxToObjectsWithDuplicateHeaders(sheetDadesEntitatRaw);

            // Populate unique catalog departments
            const rawCatDepts = rowsDadesEntitat.map(r => r["Departament d'adscripció"] || r["Departament d'adscripció_1"]).filter(Boolean);
            catalogDepartments = Array.from(new Set(rawCatDepts)).sort();

            // Create helper function to dynamically search properties
            const getProp = (obj, partialName) => {
                const normPartial = normalizeText(partialName);
                const matchedKey = Object.keys(obj).find(k => normalizeText(k).includes(normPartial));
                return matchedKey ? obj[matchedKey] : null;
            };

            // Build a dictionary lookup for Departament d'adscripció, Grau de participació, and Via de participació by Codi Catàleg
            const entitatDepts = {};
            const entitatGraus = {};
            const entitatVies = {};

            rowsDadesEntitat.forEach(entitat => {
                let codi = null;
                let deptAdscripcio = null;
                let grau = null;
                let via = null;

                for (const key of Object.keys(entitat)) {
                    const normKey = normalizeText(key);
                    if (normKey === 'codi cataleg' || normKey === 'codi cataleg_1' || normKey === 'codi') {
                        codi = entitat[key];
                    }
                    if (normKey === 'departament dadscripcio' || normKey === 'departament dadscripcio_1' || normKey === 'departament dadscripcio_2') {
                        deptAdscripcio = entitat[key];
                    }
                    if (normKey === 'grau de participacio' || normKey === 'grau de participacio_1' || normKey === 'grau') {
                        grau = entitat[key];
                    }
                    if (normKey === 'via de participacio' || normKey === 'via de participacio_1' || normKey === 'via') {
                        via = entitat[key];
                    }
                }

                // Fallback to contains search if not matched exactly
                if (codi === null || codi === undefined) {
                    const matchedCodiKey = Object.keys(entitat).find(k => normalizeText(k).includes('codi cataleg') || normalizeText(k).includes('codi'));
                    if (matchedCodiKey) codi = entitat[matchedCodiKey];
                }
                if (deptAdscripcio === null || deptAdscripcio === undefined) {
                    const matchedDeptKey = Object.keys(entitat).find(k => normalizeText(k).includes('adscripcio') || normalizeText(k).includes('departament'));
                    if (matchedDeptKey) deptAdscripcio = entitat[matchedDeptKey];
                }
                if (grau === null || grau === undefined) {
                    const matchedGrauKey = Object.keys(entitat).find(k => normalizeText(k).includes('grau'));
                    if (matchedGrauKey) grau = entitat[matchedGrauKey];
                }
                if (via === null || via === undefined) {
                    const matchedViaKey = Object.keys(entitat).find(k => normalizeText(k).includes('via'));
                    if (matchedViaKey) via = entitat[matchedViaKey];
                }

                if (codi !== null && codi !== undefined) {
                    const codiStr = String(codi).trim();
                    if (deptAdscripcio !== null && deptAdscripcio !== undefined) {
                        entitatDepts[codiStr] = deptAdscripcio;
                    }
                    if (grau !== null && grau !== undefined) {
                        entitatGraus[codiStr] = grau;
                    }
                    if (via !== null && via !== undefined) {
                        entitatVies[codiStr] = via;
                    }
                }
            });

            // Find all entities with Partícip agregat === "Administració de la Generalitat de Catalunya" from Detall de partícips
            // AND whose Grau === "Minoritària" and Via === "Directa" in Dades entitat
            const targetEntitats = detallParticips.filter(part => {
                const codiStr = String(part['Codi Catàleg']).trim();
                const isGeneralitat = part['Denominació partícip (agregat)'] === 'Administració de la Generalitat de Catalunya';
                const grau = normalizeText(entitatGraus[codiStr] || '');
                const via = normalizeText(entitatVies[codiStr] || '');
                return isGeneralitat && grau === 'minoritaria' && via === 'directa';
            });

            targetEntitats.forEach(entitat => {
                const codi = entitat['Codi Catàleg'];
                const nom = entitat['Denominació'];
                const deptAdscripcio = entitatDepts[String(codi).trim()];

                if (codi && deptAdscripcio) {
                    // Extract leading letters prefix, e.g. "SLT - Departament de Salut" -> "SLT"
                    const prefixRaw = String(deptAdscripcio).match(/^[A-Z]+/i)?.[0].toUpperCase();
                    if (prefixRaw) {
                        // Resolve mapping, e.g. "ECO" -> "ECF"
                        const mappedPrefix = departmentMapping[prefixRaw] || prefixRaw;

                        // Find users in Autoritzacio a departaments whose department starts with mappedPrefix
                        rowsDepts.forEach(usr => {
                            const usrDept = usr['Desc. Departament'] || '';
                            const usrDeptPrefix = usrDept.match(/^[A-Z]+/i)?.[0].toUpperCase();
                            
                            if (usrDeptPrefix === mappedPrefix && usr['Perfil'] !== 'Intervenció') {
                                generalitatDeptUsuaris.push({
                                    'Nom': usr['Nom'],
                                    'Cognoms': usr['Cognoms'],
                                    'Email': usr['Email'],
                                    'Desc. Departament': deptAdscripcio, // Show it in the Departament column
                                    'Detall de partícips.Codi Catàleg': codi,
                                    'Detall de partícips.Denominació': nom,
                                    'Detall de partícips.Denominació partícip (agregat)': deptAdscripcio // Set to the department's name as the participant
                                });
                            }
                        });
                    }
                }
            });
        }

        const consultaUsuarisFinalFormatted = consultaUsuarisFinal.map(r => ({
            ...r,
            'Desc. Departament': null
        }));

        // Final Combine (Union)
        mergedResults = [...consultaUsuarisFinalFormatted, ...autoritzacioDepts, ...generalitatDeptUsuaris];
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
        applyFiltersAndSort();
        
        // --- AUTOMATIC FILE WRITING TO SHAREPOINT ---
        if (directoryHandle) {
            // 1. Generate output Excel binary data using SheetJS
            const exportData = mergedResults.map(r => ({
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
            
            // Embed original dates in the workbook comments metadata
            wbOut.Props = {
                Comments: `CatDate:${dateCatModified || 0}|UsrDate:${dateUsrModified || 0}`
            };
            
            const wbBinary = XLSX.write(wbOut, {bookType: 'xlsx', type: 'array'});
            

            
            // Save the output merged excel directly
            await saveFileToDirectory(directoryHandle, new Uint8Array(wbBinary), "Consulta usuaris final + depts.xlsx");

            // Also save as CSV for easy direct consumption by other applications
            const csvString = XLSX.utils.sheet_to_csv(wsOut);
            await saveFileToDirectory(directoryHandle, new TextEncoder().encode(csvString), "Consulta usuaris final + depts.csv");
        }
        
    } catch (err) {
        alert("S'ha produït un error en processar els fitxers: " + err.message);
        console.error(err);
        
        // Restore buttons visibility on process error so user can retry or cancel
        const btnUploadToSharepoint = document.getElementById('btnUploadToSharepoint');
        const btnCancelManualUpload = document.getElementById('btnCancelManualUpload');
        if (btnUploadToSharepoint) btnUploadToSharepoint.classList.remove('hidden');
        if (btnCancelManualUpload) btnCancelManualUpload.classList.remove('hidden');
    } finally {
        btnProcess.removeAttribute('disabled');
    }
});

// Helper to write files directly to directory handles (File System Access API)
async function saveFileToDirectory(dirHandle, fileData, fileName) {
    try {
        // To avoid InvalidStateError (browser stale file handle cache), try removing the entry first
        try {
            await dirHandle.removeEntry(fileName);
        } catch (removeErr) {
            // Ignore if file doesn't exist or can't be removed
        }
        
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(fileData);
        await writable.close();
        console.log(`Saved ${fileName} directly to local SharePoint directory`);
        return true;
    } catch (e) {
        console.warn(`[OneDrive Sync Warning] No s'ha pogut desar ${fileName} al directori local (fitxer bloquejat per sincronització de Windows/OneDrive):`, e);
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
    
    // Robust header row detection by searching for 'Codi Catàleg' or 'Denominació' in the first few rows
    let headerRowIndex = range.s.r;
    for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
        let isHeaderRow = false;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({r: r, c: col})];
            if (cell && cell.v) {
                const normVal = normalizeText(String(cell.v));
                if (normVal.includes('codi cataleg') || normVal.includes('codi cat') || normVal.includes('denominacio')) {
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
        
        // Normalize column header character replacements (e.g.  or other encoding glitches -> standard Catalan characters)
        val = val.replace(/[\uFFFD\u00A0\u00AD\u0080-\u00FF]/g, (match, offset, string) => {
            const prevChar = string.slice(0, offset).toLowerCase();
            if (prevChar.endsWith('cat')) return 'à';
            if (prevChar.endsWith('denominaci') || prevChar.endsWith('participaci') || prevChar.endsWith('adscripci')) return 'ó';
            if (prevChar.endsWith('presid') || prevChar.endsWith('just')) return 'è';
            if (prevChar.endsWith('part') && string.slice(offset + 1).startsWith('cip')) return 'í';
            return 'ó'; // Default fallback for Catalan XLS headers commonly carrying 'ó' (e.g. Denominació, adscripció, participació)
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
        if (row['Desc. Departament'] && !row['Detall de partícips.Codi Catàleg']) {
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

if (searchInput) {
    searchInput.addEventListener('input', () => {
        applyFiltersAndSort();
    });
}

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

// Helper to normalize text (ignore accents and common punctuation)
function normalizeText(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // removes accents
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, "") // removes punctuation
        .trim();
}

// Unified Filtering and Sorting Engine
function applyFiltersAndSort() {
    const query = searchInput ? normalizeText(searchInput.value) : '';
    
    const filterCodi = normalizeText(columnFilters.codi);
    const filterEns = normalizeText(columnFilters.ens);
    const filterParticip = normalizeText(columnFilters.particip);
    const filterDept = normalizeText(columnFilters.dept);
    const filterNom = normalizeText(columnFilters.nom);
    const filterCognoms = normalizeText(columnFilters.cognoms);
    const filterEmail = normalizeText(columnFilters.email);
    
    filteredResults = mergedResults.filter(row => {
        const codiStr = normalizeText(row['Detall de partícips.Codi Catàleg']);
        const ensStr = normalizeText(row['Detall de partícips.Denominació']);
        const participStr = normalizeText(row['Detall de partícips.Denominació partícip (agregat)']);
        const deptStr = normalizeText(row['Desc. Departament']);
        const nomStr = normalizeText(row['Nom']);
        const cognomsStr = normalizeText(row['Cognoms']);
        const emailStr = normalizeText(row['Email']);
        
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
        if (filterCodi && !codiStr.includes(filterCodi)) return false;
        if (filterEns && !ensStr.includes(filterEns)) return false;
        if (filterParticip && !participStr.includes(filterParticip)) return false;
        if (filterDept && !deptStr.includes(filterDept)) return false;
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

// State variables for departments extracted from excels
let catalogDepartments = []; // Extracted from Cataleg_dens_export (Dades entitat -> Departament d'adscripció)
let userDepartments = [];    // Extracted from Export_Usuaris (Autoritzacio a departaments -> Desc. Departament)

// --- DEPARTMENT MAPPING ENGINE & MODAL FUNCTIONS ---
function loadDepartmentMapping() {
    try {
        const stored = localStorage.getItem('gpg_department_mapping');
        if (stored) {
            departmentMapping = JSON.parse(stored);
        } else {
            departmentMapping = { ...DEFAULT_DEPT_MAPPING };
        }
    } catch (e) {
        console.error("Error loading department mapping, fallback to default", e);
        departmentMapping = { ...DEFAULT_DEPT_MAPPING };
    }
}

function saveDepartmentMapping() {
    const container = document.getElementById('mappingListContainer');
    if (!container) return;
    
    const rows = container.querySelectorAll('.mapping-row');
    const newMapping = {};
    
    rows.forEach(row => {
        const selects = row.querySelectorAll('select');
        if (selects.length === 2) {
            const key = selects[0].value.trim().toUpperCase();
            const val = selects[1].value.trim().toUpperCase();
            
            if (key && val) {
                newMapping[key] = val;
            }
        }
    });
    
    departmentMapping = newMapping;
    try {
        localStorage.setItem('gpg_department_mapping', JSON.stringify(departmentMapping));
    } catch (e) {
        console.error("Could not write to localStorage", e);
    }
    
    closeMappingModal();
    
    // If we already have data loaded, trigger reprocessing to apply the new mapping rules
    if (fileDataCat && fileDataUsr) {
        btnProcess.click();
    }
}

function renderMappingRows() {
    const container = document.getElementById('mappingListContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Determine the list of keys to display: either current mapping keys or any catalog prefix we extracted
    const currentKeys = new Set(Object.keys(departmentMapping));
    catalogDepartments.forEach(dept => {
        const prefix = dept.split(/[\s\-]/)[0].trim().toUpperCase();
        if (prefix) currentKeys.add(prefix);
    });
    
    // If we don't have files loaded yet, use DEFAULT_DEPT_MAPPING keys
    if (currentKeys.size === 0) {
        Object.keys(DEFAULT_DEPT_MAPPING).forEach(k => currentKeys.add(k));
    }

    Array.from(currentKeys).sort().forEach(key => {
        const value = departmentMapping[key] || '';
        const row = createMappingRowElement(key, value);
        container.appendChild(row);
    });
}

function createMappingRowElement(key, value) {
    const div = document.createElement('div');
    div.className = 'mapping-row';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';
    
    // Dropdown for catalog prefix (fixed to the extracted/mapped key)
    const selectKey = document.createElement('select');
    selectKey.className = 'mapping-input';
    selectKey.style.flex = '1';
    selectKey.style.background = '#1e1b4b';
    selectKey.style.color = '#e5e7eb';
    selectKey.style.border = '1px solid var(--glass-border)';
    selectKey.style.padding = '0.5rem';
    selectKey.style.borderRadius = '6px';
    
    // Populate selectKey with catalog departments or fallback
    let catOptions = catalogDepartments.map(d => {
        const prefix = d.split(/[\s\-]/)[0].trim().toUpperCase();
        return { prefix, label: d };
    });
    // Remove duplicates
    catOptions = catOptions.filter((v, i, a) => a.findIndex(t => t.prefix === v.prefix) === i);
    
    if (catOptions.length === 0) {
        // Fallback options
        const fallbacks = ['ECO', 'EXT', 'ACC', 'DSO', 'CLT', 'REU', 'SLT', 'PRE', 'EMT', 'TER', 'JUS'];
        fallbacks.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === key) opt.selected = true;
            selectKey.appendChild(opt);
        });
    } else {
        catOptions.forEach(optData => {
            const opt = document.createElement('option');
            opt.value = optData.prefix;
            opt.textContent = optData.label;
            if (optData.prefix === key) opt.selected = true;
            selectKey.appendChild(opt);
        });
    }
    
    const arrow = document.createElement('span');
    arrow.textContent = '➔';
    arrow.style.color = 'var(--text-muted)';
    arrow.style.width = '30px';
    arrow.style.textAlign = 'center';
    
    // Dropdown for target user departments
    const selectValue = document.createElement('select');
    selectValue.className = 'mapping-input';
    selectValue.style.flex = '1';
    selectValue.style.background = '#1e1b4b';
    selectValue.style.color = '#e5e7eb';
    selectValue.style.border = '1px solid var(--glass-border)';
    selectValue.style.padding = '0.5rem';
    selectValue.style.borderRadius = '6px';
    
    // Populate selectValue with user departments or fallback
    let usrOptions = userDepartments.map(d => {
        const prefix = d.split(/[\s\-]/)[0].trim().toUpperCase();
        return { prefix, label: d };
    });
    // Remove duplicates
    usrOptions = usrOptions.filter((v, i, a) => a.findIndex(t => t.prefix === v.prefix) === i);
    
    // Add default empty/identity option
    const optDefault = document.createElement('option');
    optDefault.value = key; // If not explicitly mapped, default is matching itself
    optDefault.textContent = `Sense equivalència (${key})`;
    selectValue.appendChild(optDefault);

    if (usrOptions.length === 0) {
        // Fallback options
        const fallbacks = ['ECF', 'UEX', 'ARP', 'DSI', 'CLT', 'REU', 'SLT', 'PRE', 'EMT', 'TER', 'JUS'];
        fallbacks.forEach(f => {
            if (f === key) return; // Already covered by default option
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === value) opt.selected = true;
            selectValue.appendChild(opt);
        });
    } else {
        usrOptions.forEach(optData => {
            if (optData.prefix === key) {
                // Update default option text to full label if match
                optDefault.textContent = optData.label;
                return;
            }
            const opt = document.createElement('option');
            opt.value = optData.prefix;
            opt.textContent = optData.label;
            if (optData.prefix === value) opt.selected = true;
            selectValue.appendChild(opt);
        });
    }
    
    div.appendChild(selectKey);
    div.appendChild(arrow);
    div.appendChild(selectValue);
    
    return div;
}

function closeMappingModal() {
    const modal = document.getElementById('mappingModal');
    if (modal) modal.classList.add('hidden');
}


