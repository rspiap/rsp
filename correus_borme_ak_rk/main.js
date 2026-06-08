// ============================================================
// BORME Mail Generator – Main Application Logic
// Uses Gemini REST API directly via fetch (no npm required)
// ============================================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ---- DOM Elements ----
const apiKeyInput = document.getElementById('apiKey');
const entityNameInput = document.getElementById('entityName');
const autocompleteList = document.getElementById('autocompleteList');
const modelSelect = document.getElementById('modelSelect');
const dropZone = document.getElementById('dropZone');
const pdfInput = document.getElementById('pdfInput');
const fileList = document.getElementById('fileList');
const generateBtn = document.getElementById('generateBtn');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const outputContent = document.getElementById('outputContent');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const copyBtn = document.getElementById('copyBtn');

// CSV elements
const csvContainer = document.getElementById('csvContainer');
const csvUnconnectedState = document.getElementById('csvUnconnectedState');
const csvConnectedState = document.getElementById('csvConnectedState');
const btnLinkCSV = document.getElementById('btnLinkCSV');
const csvDropZone = document.getElementById('csvDropZone');
const connectedFileName = document.getElementById('connectedFileName');
const connectedFileStatus = document.getElementById('connectedFileStatus');
const btnGrantAccess = document.getElementById('btnGrantAccess');
const btnRefreshCSV = document.getElementById('btnRefreshCSV');
const btnUnlinkCSV = document.getElementById('btnUnlinkCSV');
const copyEmailsBtn = document.getElementById('copyEmailsBtn');
const entitiesList = document.getElementById('entitiesList');
const emailsList = document.getElementById('emailsList');
const entityDataPanel = document.getElementById('entityDataPanel');

// Settings modal & Badge
const btnSettings = document.getElementById('btnSettings');
const settingsModal = document.getElementById('settingsModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const csvConnectionStatusBadge = document.getElementById('csvConnectionStatusBadge');

// ---- State ----
let uploadedFiles = []; // Array of { file: File, base64: string, name: string }
let csvData = []; // Array of parsed row objects
let uniqueParentEntities = []; // Sorted list of unique parent entities
let activeEmailsList = []; // Emails currently displayed
let autocompleteActiveIndex = -1; // Keyboard index for autocomplete

// ---- Utility: convert File to base64 ----
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ---- Utility: format file size ----
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// ---- Update the generate button state ----
function updateGenerateBtn() {
    const hasKey = apiKeyInput.value.trim().length > 0;
    const hasEntity = entityNameInput.value.trim().length > 0;
    const hasFiles = uploadedFiles.length > 0;
    generateBtn.disabled = !(hasKey && hasEntity && hasFiles);
}

// ---- Render file list ----
function renderFileList() {
    fileList.innerHTML = '';
    uploadedFiles.forEach((f, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
      <div class="file-item-info">
        <svg class="file-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="file-item-name" title="${f.name}">${f.name}</span>
        <span class="file-item-size">${formatSize(f.file.size)}</span>
      </div>
      <button class="file-item-remove" data-index="${index}" title="Eliminar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
        fileList.appendChild(item);
    });

    // Bind remove buttons
    fileList.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            uploadedFiles.splice(idx, 1);
            renderFileList();
            updateGenerateBtn();
        });
    });

    updateGenerateBtn();
}

//// ---- String normalization for matching ----
function normalizeForMatch(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[,._\-()]/g, ' ')
        .replace(/\b(s\.?a\.?u?\.?|s\.?l\.?u?\.?|s\.?a\.?t\.?|s\.?c\.?p?\.?|s\.?l\.?p?\.?|sa|sl|slu|sau|sc|scp|slp)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---- Jaccard token similarity (0-1) ----
function tokenSimilarity(normA, normB) {
    const tokA = new Set(normA.split(/\s+/).filter(t => t.length > 1));
    const tokB = new Set(normB.split(/\s+/).filter(t => t.length > 1));
    if (tokA.size === 0 || tokB.size === 0) return 0;
    let intersection = 0;
    for (const t of tokA) if (tokB.has(t)) intersection++;
    return intersection / (tokA.size + tokB.size - intersection);
}

// ---- Find the best parent and subsidiary in the CSV for a given company name ----
function findParentAndSubsidiaryByCompanyName(companyName) {
    if (!companyName || csvData.length === 0) return null;
    const entityField = "Detall de partícips.Denominació";
    const parentField = "Detall de partícips.Denominació partícip (agregat)";
    const normInput = normalizeForMatch(companyName);

    let bestScore = 0;
    let bestRow = null;

    for (const row of csvData) {
        const denom = row[entityField]?.trim() || '';
        if (!denom) continue;
        const normDenom = normalizeForMatch(denom);

        // Exact match → return immediately
        if (normDenom === normInput) {
            return {
                parent: row[parentField]?.trim() || null,
                subsidiary: row[entityField]?.trim() || null
            };
        }

        const score = tokenSimilarity(normInput, normDenom);
        if (score > bestScore) {
            bestScore = score;
            bestRow = row;
        }
    }

    // Only accept if similarity is strong enough (≥ 40% token overlap)
    if (bestScore >= 0.4 && bestRow) {
        return {
            parent: bestRow[parentField]?.trim() || null,
            subsidiary: bestRow[entityField]?.trim() || null
        };
    }
    return null;
}

// ---- Filename-based fast path (no API) ----
function findParentAndSubsidiaryFromFilename(filename) {
    const base = filename.replace(/\.pdf$/i, '');

    // Build multiple candidate names from the filename
    const candidates = new Set();

    // 1. Strip compact date prefix (YYYYMMDD) and common BORME boilerplate
    const withoutDate = base
        .replace(/^\d{8}\s*/i, '')                              // 20260410
        .replace(/^\d{4}[-/]\d{2}[-/]\d{2}\s*[-–]?\s*/i, '')  // 2026-04-10 or 2026-04-10 -
        .replace(/\bBORME\b/gi, '')
        .trim();
    candidates.add(withoutDate);

    // 2. Last segment after " - " (typically the company name, e.g. "Luxquanta")
    const lastDash = base.lastIndexOf(' - ');
    if (lastDash !== -1) {
        candidates.add(base.substring(lastDash + 3).trim());
    }

    // 3. Try each candidate and return the first meaningful match
    for (const candidate of candidates) {
        if (!candidate) continue;
        const result = findParentAndSubsidiaryByCompanyName(candidate);
        if (result) return result;
    }
    return null;
}

// ---- AI: extract only the company name from the PDF, then look it up in the CSV ----
async function detectEntityFromPDF(fileEntry) {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey || csvData.length === 0) return null;

    // Deduplicated CSV subsidiaries (used if Jaccard fails)
    const entityField = "Detall de partícips.Denominació";
    const parentField = "Detall de partícips.Denominació partícip (agregat)";
    const denominations = [...new Set(
        csvData.map(r => r[entityField]?.trim()).filter(Boolean)
    )];

    const extractPrompt = `Ets un assistent especialitzat en documents BORME (Butlletí Oficial del Registre Mercantil d'Espanya).

Analitza el document PDF adjunt i extreu ÚNICAMENT el nom oficial de la societat que és objecte de l'acte registral (augment de capital, reducció de capital, modificació d'estatuts, nomenament d'administradors, etc.).

Retorna ÚNICAMENT el nom de la societat tal com apareix al document. No afegeixis cap altre text, explicació ni puntuació addicional.`;

    const modelName = modelSelect.value;
    const url = `${GEMINI_API_BASE}${modelName}:generateContent?key=${apiKey}`;

    try {
        // ── Pas 1: IA extreu el nom de la societat del PDF ──────────────────
        const res1 = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { inlineData: { mimeType: 'application/pdf', data: fileEntry.base64 } },
                        { text: extractPrompt }
                    ]
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 64 }
            })
        });
        if (!res1.ok) { console.warn('detectEntityFromPDF: step1 API error', res1.status); return null; }
        const d1 = await res1.json();
        const companyName = d1.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        console.log('detectEntityFromPDF ① nom extret →', companyName);
        if (!companyName) return null;

        // ── Pas 2: Jaccard similarity contra el CSV ──────────────────────────
        let matchResult = findParentAndSubsidiaryByCompanyName(companyName);
        console.log('detectEntityFromPDF ② Jaccard →', matchResult);
        if (matchResult) return matchResult;

        // ── Pas 3: Jaccard ha fallat (p.ex. nom en castellà vs català) ──────
        //    Cridem la IA amb el nom extret + la llista de denominacions del CSV.
        //    Aquesta crida és text únicament (sense PDF), per tant molt ràpida.
        if (denominations.length === 0) return null;

        const matchPrompt = `La societat identificada és: "${companyName}"

Busca quina entrada del llistat de sota correspon millor a aquesta societat. Pot estar en un idioma diferent (català/castellà), tenir abreviatures o sufixos jurídics diferents (SA, SL, SLU, SAU, Sociedad Anónima, Societat Limitada, etc.) o lleugeres variacions ortogràfiques.

Retorna ÚNICAMENT el nom exacte de l'entrada del llistat, copiat literalment sense cap modificació. Si cap correspon clarament, retorna exactament: null

Llistat:
${denominations.join('\n')}`;

        const res2 = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: matchPrompt }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 256 }
            })
        });
        if (!res2.ok) { console.warn('detectEntityFromPDF: step3 API error', res2.status); return null; }
        const d2 = await res2.json();
        const matched = d2.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        console.log('detectEntityFromPDF ③ IA match →', matched);
        if (!matched || matched.toLowerCase() === 'null') return null;

        // Lookup exact then case-insensitive
        let row = csvData.find(r => r[entityField]?.trim() === matched);
        if (!row) {
            const lc = matched.toLowerCase();
            row = csvData.find(r => r[entityField]?.trim().toLowerCase() === lc);
        }
        if (row) {
            return {
                parent: row[parentField]?.trim() || null,
                subsidiary: row[entityField]?.trim() || null
            };
        }
        return null;

    } catch (err) {
        console.warn('detectEntityFromPDF: exception', err);
        return null;
    }
}

// ---- Helper: check if parent is Generalitat ----
function isGeneralitatParent(name) {
    if (!name) return false;
    const GENERALITAT = 'Administració de la Generalitat de Catalunya';
    return name === GENERALITAT || 
           name === "Administració de la Generalitat" ||
           name.startsWith("Administració de la Generalitat");
}

// ---- Helper: check if parent is Generalitat main or department ----
function isGeneralitatOrDeptParent(name) {
    if (!name) return false;
    if (isGeneralitatParent(name)) return true;
    return /^[A-Z]+\s*-\s*(Departament|Direcció|Secretaria)/i.test(name) || /Departament d'/i.test(name);
}

// ---- Helper: resolve Generalitat display name with department suffix ----
function resolveGeneralitatDisplayName(parentName, subsidiaryName) {
    const GENERALITAT = 'Administració de la Generalitat de Catalunya';
    
    const isMainGeneralitat = isGeneralitatParent(parentName);
    const isDeptGeneralitat = !isMainGeneralitat && isGeneralitatOrDeptParent(parentName);
    const isGeneralitat = isMainGeneralitat || isDeptGeneralitat;
    
    console.log('[resolveGeneralitatDisplayName] Input:', { parentName, subsidiaryName, isMainGeneralitat, isDeptGeneralitat, isGeneralitat, csvDataLength: csvData.length });
    
    if (!isGeneralitat) {
        return parentName;
    }
    
    let displayName = "Administració de la Generalitat";
    let deptName = null;
    let isMajoritaria = false;
    
    if (isMainGeneralitat) {
        if (subsidiaryName && csvData.length > 0) {
            const entityField = "Detall de partícips.Denominació";
            const normSub = normalizeForMatch(subsidiaryName);
            const subRows = csvData.filter(row => {
                const denom = row[entityField]?.trim() || '';
                if (!denom) return false;
                
                if (denom.toLowerCase() === subsidiaryName.toLowerCase()) return true;
                
                const normDenom = normalizeForMatch(denom);
                if (normDenom === normSub) return true;
                
                if (denom.length < 4) return false;
                
                if (denom.toLowerCase().includes(subsidiaryName.toLowerCase())) return true;
                if (subsidiaryName.toLowerCase().includes(denom.toLowerCase())) return true;
                return tokenSimilarity(normDenom, normSub) >= 0.4;
            });
            
            console.log('[resolveGeneralitatDisplayName] subRows found:', subRows.length);
            
            for (const row of subRows) {
                const descDept = (row["Desc. Departament"] || row["Departament"])?.trim();
                if (descDept && descDept.toLowerCase() !== 'none' && descDept.toLowerCase() !== 'null') {
                    deptName = descDept;
                    break;
                }
                const parentAgregat = row["Detall de partícips.Denominació partícip (agregat)"]?.trim();
                if (parentAgregat && parentAgregat !== 'None' && parentAgregat !== 'null' && parentAgregat !== GENERALITAT) {
                    deptName = parentAgregat;
                    break;
                }
            }
            
            // Si l'entitat no té cap departament associat, es considera "Directa majoritària"
            if (!deptName) {
                isMajoritaria = true;
            }
        }
    } else if (isDeptGeneralitat) {
        deptName = parentName;
    }
    
    if (isMajoritaria && subsidiaryName) {
        return subsidiaryName;
    }
    
    if (deptName) {
        displayName = "Administració de la Generalitat - " + deptName;
    }
    
    console.log('[resolveGeneralitatDisplayName] Result:', displayName);
    return displayName;
}

// ---- Helper: get target entity name ----
function getTargetEntityName(parent, subsidiary) {
    return resolveGeneralitatDisplayName(parent, subsidiary);
}

// ---- Helper: check if existing input matches new entity parent ----
function isSameEntityOrDept(currentEntity, targetEntity, parent) {
    if (!currentEntity) return true;
    if (currentEntity === targetEntity) return true;
    
    const normCurrent = currentEntity.replace(" de Catalunya", "").trim().toLowerCase();
    const normTarget = targetEntity.replace(" de Catalunya", "").trim().toLowerCase();
    const normParent = parent.replace(" de Catalunya", "").trim().toLowerCase();
    
    if (normCurrent === normTarget) return true;
    if (normCurrent === normParent) return true;

    // Special case for Generalitat: if both are Generalitat, check compatibility
    const currentIsGen = normCurrent.startsWith("administració de la generalitat");
    const targetIsGen = normTarget.startsWith("administració de la generalitat");
    
    if (currentIsGen && targetIsGen) {
        // If either is the bare "Administració de la Generalitat", they are compatible
        const currentIsBare = normCurrent === "administració de la generalitat";
        const targetIsBare = normTarget === "administració de la generalitat";
        if (currentIsBare || targetIsBare) {
            return true;
        }
    }

    return false;
}

// ---- Handle file additions (from input or drag-drop) ----
async function handleFiles(files) {
    const newFiles = [];
    for (const file of files) {
        if (file.type !== 'application/pdf') continue;
        if (uploadedFiles.some(f => f.name === file.name && f.file.size === file.size)) continue;
        const base64 = await fileToBase64(file);
        const entry = { file, base64, name: file.name };
        uploadedFiles.push(entry);
        newFiles.push(entry);
    }
    renderFileList();

    if (csvData.length === 0 || newFiles.length === 0) return;

    for (const fileEntry of newFiles) {
        // Step 1: instant fuzzy match on filename (no API cost)
        let matchResult = findParentAndSubsidiaryFromFilename(fileEntry.name);

        // Step 2: AI extracts company name from PDF, then we look it up in the CSV
        if (!matchResult) {
            entityNameInput.placeholder = 'Detectant entitat…';
            entityNameInput.disabled = true;
            try {
                matchResult = await detectEntityFromPDF(fileEntry);
            } finally {
                entityNameInput.disabled = false;
                entityNameInput.placeholder = 'p. ex. Fundació Institut de Ciències Fotòniques (ICFO)';
            }
        }

        if (matchResult && matchResult.parent) {
            const parent = matchResult.parent;
            const subsidiary = matchResult.subsidiary;
            const currentEntity = entityNameInput.value.trim();
            const targetEntity = getTargetEntityName(parent, subsidiary);

            if (!isSameEntityOrDept(currentEntity, targetEntity, parent)) {
                // Different entity detected — show blocking modal
                showMismatchModal(currentEntity, targetEntity, parent, subsidiary, newFiles);
            } else {
                // No existing entity or same entity — auto-fill silently
                selectParentEntity(parent, subsidiary);
                entityNameInput.classList.add('auto-filled');
                setTimeout(() => entityNameInput.classList.remove('auto-filled'), 2500);
            }
            break;
        }
    }
}

// ---- Entity mismatch modal ----
const mismatchBackdrop      = document.getElementById('mismatchBackdrop');
const mismatchNewEntityEl   = document.getElementById('mismatchNewEntity');
const mismatchCurrentEl     = document.getElementById('mismatchCurrentEntity');
const btnMismatchUndo       = document.getElementById('btnMismatchUndo');
const btnMismatchReplace    = document.getElementById('btnMismatchReplace');
const btnMismatchKeep       = document.getElementById('btnMismatchKeep');

let pendingMismatchParent   = null;   // detected parent to potentially switch to
let pendingMismatchSubsidiary = null; // detected subsidiary
let mismatchTriggerFiles    = [];     // newly added files that caused the mismatch

function showMismatchModal(currentEntity, targetEntity, detectedParent, detectedSubsidiary, triggerFiles) {
    pendingMismatchParent  = detectedParent;
    pendingMismatchSubsidiary = detectedSubsidiary;
    mismatchTriggerFiles   = triggerFiles || [];
    mismatchCurrentEl.textContent   = currentEntity;
    mismatchNewEntityEl.textContent = targetEntity;
    mismatchBackdrop.style.display  = 'flex';
    mismatchBackdrop.querySelector('.mismatch-modal').classList.add('modal-enter');
    setTimeout(() => mismatchBackdrop.querySelector('.mismatch-modal').classList.remove('modal-enter'), 400);
}

function hideMismatchModal() {
    mismatchBackdrop.style.display = 'none';
    pendingMismatchParent  = null;
    pendingMismatchSubsidiary = null;
    mismatchTriggerFiles   = [];
}

// Desfer canvis → elimina els fitxers que han causat el conflicte
btnMismatchUndo.addEventListener('click', () => {
    mismatchTriggerFiles.forEach(entry => {
        const idx = uploadedFiles.indexOf(entry);
        if (idx !== -1) uploadedFiles.splice(idx, 1);
    });
    renderFileList();
    hideMismatchModal();
});

// Substituir entitat → canvia l'entitat pel valor detectat
btnMismatchReplace.addEventListener('click', () => {
    if (pendingMismatchParent) {
        selectParentEntity(pendingMismatchParent, pendingMismatchSubsidiary);
        entityNameInput.classList.add('auto-filled');
        setTimeout(() => entityNameInput.classList.remove('auto-filled'), 2500);
    }
    hideMismatchModal();
});

// Mantenir entitat → conserva l'entitat actual (els fitxers queden afegits)
btnMismatchKeep.addEventListener('click', hideMismatchModal);

// ---- Drop Zone Events ----

dropZone.addEventListener('click', () => pdfInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

pdfInput.addEventListener('change', () => {
    handleFiles(pdfInput.files);
    pdfInput.value = '';
});

// ---- Input listeners ----
apiKeyInput.addEventListener('input', updateGenerateBtn);
entityNameInput.addEventListener('input', updateGenerateBtn);

// ---- Build the prompt for Gemini ----
function buildPrompt(entityName, fileNames) {
    const GENERALITAT_PREFIX = "Administració de la Generalitat";
    const cleanEntityName = entityName.startsWith(GENERALITAT_PREFIX) 
        ? "Administració de la Generalitat" 
        : entityName;

    let introSentence;
    if (entityName.startsWith(GENERALITAT_PREFIX)) {
        const parts = entityName.split(" - ");
        if (parts.length >= 3) {
            const deptName = parts[2].trim();
            introSentence = `Rebeu el present correu en qualitat d'usuari/ària del ${deptName} de l'Administració de la Generalitat i, per extensió, de les societats [LLISTA DE SOCIETATS EXTRETES DELS TÍTOLS DELS FITXERS DELS BORMES ADJUNTATS, però posant-les amb la forma exacta que apareixen dins el cos del BORME, separades per "i"] en l'aplicació del Registre del sector públic de la Generalitat de Catalunya.`;
        } else {
            introSentence = `Rebeu el present correu en qualitat d'usuari/ària de l'Administració de la Generalitat i, per extensió, de les societats [LLISTA DE SOCIETATS EXTRETES DELS TÍTOLS DELS FITXERS DELS BORMES ADJUNTATS, però posant-les amb la forma exacta que apareixen dins el cos del BORME, separades per "i"] en l'aplicació del Registre del sector públic de la Generalitat de Catalunya.`;
        }
    } else {
        introSentence = `Rebeu el present correu en qualitat d'usuari/ària de ${entityName} i, per extensió, de les societats [LLISTA DE SOCIETATS EXTRETES DELS TÍTOLS DELS FITXERS DELS BORMES ADJUNTATS, però posant-les amb la forma exacta que apareixen dins el cos del BORME, separades per "i"] en l'aplicació del Registre del sector públic de la Generalitat de Catalunya.`;
    }

    const societyNames = fileNames.map(n => {
        // Remove .pdf extension and common BORME prefixes like dates to get society name
        return n.replace(/\.pdf$/i, '');
    });

    return `IDIOMA OBLIGATORI: Tot el text que generis ha de ser EXCLUSIVAMENT en català. No escriguis cap paraula en castellà ni en cap altre idioma.
 
 CONCORDANÇA GRAMATICAL: Assegura't que totes les concordances gramaticals siguin correctes en català:
 - Concordança de gènere i nombre entre substantius, adjectius i determinants.
 - Ús correcte dels verbs en la persona i el temps adequats.
 - Ús correcte de les preposicions, articles i pronoms en català.
 - "Publicades" si el subjecte és femení plural (p.ex. ampliacions), "publicats" si és masculí plural (p.ex. augments).
 - Quan hi hagi una única operació, usa el singular ("ampliació", "reducció", "publicada"); quan n'hi hagi diverses, usa el plural.
 
 Ets un assistent especialitzat en analitzar documents del BORME (Butlletí Oficial del Registre Mercantil) espanyol.
 
 T'adjunto ${fileNames.length} fitxer(s) PDF del BORME. Els noms dels fitxers són:
 ${fileNames.map(n => `- ${n}`).join('\n')}
 
 L'entitat dels usuaris és: ${cleanEntityName}
 
 TASCA: Llegeix atentament cada PDF del BORME adjunt i redacta un correu electrònic en CATALÀ seguint EXACTAMENT la plantilla següent, substituint la informació entre claudàtors per la informació real extreta dels BORMEs.
 
 PLANTILLA DEL CORREU:
 
 Benvolgut/da,
 
 ${introSentence}
 Per tal d'actualitzar les dades de participació de les societats esmentades al Registre del sector públic, així com per a informar les dades de l'Inventari d'accions i participacions de la Generalitat de Catalunya, us demanem que ens trameteu les escriptures públiques que formalitzen els augments i/o reduccions de capital [INDICA SI SÓN AUGMENTS, REDUCCIONS O AMBDUES COSES, segons la informació dels BORMEs] següents, publicats al BORME, fins i tot en cas que ${cleanEntityName} no hagués participat en els augments:
 
 [PER CADA SOCIETAT, CREA UNA LLISTA AMB VINYETES AMB EL FORMAT SEGÜENT:
 • [Nom Societat]:
   o [Resum en UNA SOLA LÍNIA de tot el contingut del BORME per a aquesta societat: ampliacions de capital, reduccions de capital, modificació d'estatuts, canvis en accions o participacions, etc., amb els imports corresponents], publicades al BORME el [DATA DE PUBLICACIÓ DEL BORME. La data del BORME s'ha d'extreure de la seva capçalera, no de la línia d'inscripció.]
 LA REFERÈNCIA A LA DATA DEL BORME HA D'ANAR SEMPRE AL FINAL DE TOT EL CONTINGUT DEL BORME CORRESPONENT]
 
 Així mateix, en cas que s'haguessin realitzat operacions d'adquisició o alienació d'accions d'aquestes o altres entitats del sector públic de la Generalitat que en poguessin alterar la sua participació, us agrairem que ens feu arribar les escriptures públiques o altres instruments que les formalitzin.
 
 Gràcies anticipades per la vostra col·laboració i quedem pendents de la vostra resposta.
 
 Cordialment,
 
 FI DE LA PLANTILLA.
 
 INSTRUCCIONS IMPORTANTS:
 0. NORMALITZA ELS NOMS: Utilitza la forma exacta que apareix dins el cos dels BORMEs, normalitzant majúscules/minúscules (p.ex. "SOCIETAT SL" -> "Societat, SL").
 1. Extreu TOTA la informació rellevant de cada BORME: augments de capital, reduccions de capital, modificació d'estatuts, canvis en accions o participacions, i qualsevol altra informació rellevant.
 2. AGRUPA els continguts per SOCIETAT, no per fitxer BORME. Si una mateixa societat apareix en diversos BORMEs, agrupa tota la seva informació sota el seu nom en una llista de vinyetes amb una línia per cada BORME.
 3. Resumeix el contingut de cada BORME en una sola línia per societat.
 4. La referència a la data del BORME ha d'anar SEMPRE al final de tot el contingut del BORME corresponent.
 5. NO INVENTIS CAP DADA. Només utilitza informació que aparegui LITERALMENT als PDFs adjunts.
 6. El format del correu ha de ser text pla, sense markdown ni format HTML.
 7. No afegeixis cap text abans ni després del correu.
 8. Tot el text ha de ser en CATALÀ CORRECTE amb concordances gramaticals impecables.
 9. Revisa el text final per assegurar-te que les concordances de gènere, nombre i persona són correctes.
 10. SINGULAR/PLURAL PER SOCIETATS: Si només s'ha extret informació d'una única societat, redacta tot el correu en singular (ex: "de la societat", "de l'escriptura", "d'aquesta entitat"). Si n'hi ha més d'una, utilitza el plural (ex: "de les societats", "de les escriptures", "d'aquestes entitats").`;
}

// ---- Show/Hide UI States ----
function showState(state) {
    emptyState.style.display = 'none';
    loadingState.style.display = 'none';
    outputContent.style.display = 'none';
    errorState.style.display = 'none';
    copyBtn.style.display = 'none';

    switch (state) {
        case 'empty':
            emptyState.style.display = 'flex';
            break;
        case 'loading':
            loadingState.style.display = 'flex';
            break;
        case 'output':
            outputContent.style.display = 'block';
            copyBtn.style.display = 'flex';
            break;
        case 'error':
            errorState.style.display = 'flex';
            break;
    }
}

// ---- Call Gemini REST API ----
async function callGemini(apiKey, prompt, pdfParts) {
    // Build the request body with inline PDF data
    const parts = [];

    // Add each PDF as inline data
    for (const pdf of pdfParts) {
        parts.push({
            inlineData: {
                mimeType: 'application/pdf',
                data: pdf.base64
            }
        });
    }

    // Add the text prompt
    parts.push({ text: prompt });

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
        }
    };

    const modelName = modelSelect.value;
    const url = `${GEMINI_API_BASE}${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData?.error?.message || `Error HTTP ${response.status}`;
        throw new Error(msg);
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Resposta buida de Gemini. Comprova que els PDFs són vàlids.');
    }

    return data.candidates[0].content.parts[0].text;
}

// ---- Generate Email ----
generateBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const entityName = entityNameInput.value.trim();

    if (!apiKey || !entityName || uploadedFiles.length === 0) return;

    showState('loading');
    generateBtn.disabled = true;

    try {
        const fileNames = uploadedFiles.map(f => f.name);
        const prompt = buildPrompt(entityName, fileNames);
        const pdfParts = uploadedFiles.map(f => ({ base64: f.base64 }));

        const result = await callGemini(apiKey, prompt, pdfParts);

        outputContent.textContent = result;
        showState('output');
    } catch (err) {
        errorMessage.textContent = err.message;
        showState('error');
    } finally {
        updateGenerateBtn();
    }
});

// ---- Copy to Clipboard ----
copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(outputContent.textContent);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Copiat!
    `;
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copiar
      `;
        }, 2000);
    } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = outputContent.textContent;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
});

// ---- IndexedDB Helper for Persisting File Handles ----
const DB_NAME = 'BormeMailGeneratorDB';
const STORE_NAME = 'fileHandles';
const KEY_NAME = 'csvFileHandle';

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveFileHandle(handle) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(handle, KEY_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getFileHandle() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function removeFileHandle() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(KEY_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ---- CSV File System Access & Traditional Upload ----
let csvFileHandle = null;

function showConnectedState(filename, status, showGrant, showRefresh) {
    csvUnconnectedState.style.display = 'none';
    csvConnectedState.style.display = 'flex';
    connectedFileName.textContent = filename;
    connectedFileStatus.textContent = status;
    
    const isReady = status === 'Actiu' || status.includes('registres');
    if (isReady) {
        connectedFileStatus.className = 'csv-file-status ready';
        updateConnectionBadge('ready');
    } else if (status.includes('Error')) {
        connectedFileStatus.className = 'csv-file-status';
        updateConnectionBadge('unconnected');
    } else {
        connectedFileStatus.className = 'csv-file-status';
        updateConnectionBadge('pending');
    }

    btnGrantAccess.style.display = showGrant ? 'block' : 'none';
    btnRefreshCSV.style.display = showRefresh ? 'block' : 'none';
}

function showUnconnectedState() {
    csvUnconnectedState.style.display = 'flex';
    csvConnectedState.style.display = 'none';
    updateConnectionBadge('unconnected');
}

// Parse CSV text to memory
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) return [];

    const headerLine = lines[0];
    const commas = (headerLine.match(/,/g) || []).length;
    const semicolons = (headerLine.match(/;/g) || []).length;
    const delimiter = semicolons > commas ? ';' : ',';

    const parseLine = (line) => {
        const result = [];
        let curVal = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(curVal.trim().replace(/^"|"$/g, ''));
                curVal = '';
            } else {
                curVal += char;
            }
        }
        result.push(curVal.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = parseLine(lines[0]).map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const rowValues = parseLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = rowValues[index] || '';
        });
        data.push(row);
    }

    return data;
}

function processCSVData() {
    const parentField = "Detall de partícips.Denominació partícip (agregat)";
    const parents = new Set();
    
    csvData.forEach(row => {
        const val = row[parentField];
        if (val && val.trim()) {
            parents.add(val.trim());
        }
    });
    
    uniqueParentEntities = Array.from(parents).sort((a, b) => a.localeCompare(b, 'ca'));
}

// Read CSV data from standard File object
async function readCSVFileObject(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const parsed = parseCSV(text);
                if (parsed.length === 0) {
                    throw new Error('El fitxer CSV sembla estar buit.');
                }
                resolve(parsed);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Error en llegir el fitxer.'));
        reader.readAsText(file, 'UTF-8');
    });
}

// Verify file system handle permissions
async function verifyPermission(fileHandle, withPrompt = false) {
    const opts = { mode: 'read' };
    if ((await fileHandle.queryPermission(opts)) === 'granted') {
        return true;
    }
    if (withPrompt) {
        if ((await fileHandle.requestPermission(opts)) === 'granted') {
            return true;
        }
    }
    return false;
}

// Read data from a linked file handle
async function readLinkedCSVHandle(handle, requestAuth = false) {
    try {
        const hasPermission = await verifyPermission(handle, requestAuth);
        if (!hasPermission) {
            showConnectedState(handle.name, 'Pendent de permís d\'accés', true, false);
            return;
        }

        const file = await handle.getFile();
        const parsed = await readCSVFileObject(file);
        
        csvData = parsed;
        processCSVData();
        showConnectedState(handle.name, `Actiu (${parsed.length} registres)`, false, true);

        // Refresh entity view if text matches
        if (entityNameInput.value.trim()) {
            const rawVal = entityNameInput.value.trim();
            
            // Try to match the exact string first
            let match = uniqueParentEntities.find(p => p === rawVal);
            
            if (!match) {
                // Try matching without " de Catalunya"
                const cleanVal = rawVal.toLowerCase().replace(" de catalunya", "").trim();
                
                // If it starts with "administració de la generalitat - ", extract the department part
                let deptPart = null;
                if (cleanVal.startsWith("administració de la generalitat - ")) {
                    deptPart = rawVal.substring("Administració de la Generalitat - ".length).trim();
                }
                
                match = uniqueParentEntities.find(p => {
                    const normP = p.toLowerCase().replace(" de catalunya", "").trim();
                    if (deptPart && p.toLowerCase() === deptPart.toLowerCase()) {
                        return true;
                    }
                    if (cleanVal.startsWith("administració de la generalitat")) {
                        if (deptPart) {
                            return false;
                        }
                        return normP === "administració de la generalitat";
                    }
                    return normP === cleanVal;
                });
            }
            
            if (match) {
                const subsidiaryName = sessionStorage.getItem('activeSubsidiary');
                selectParentEntity(match, subsidiaryName);
            }
        }
    } catch (err) {
        showConnectedState(handle.name, `Error: ${err.message}`, false, true);
    }
}

// Setup and verify File System Access API support
const hasFileSystemAccess = typeof window.showOpenFilePicker === 'function';

async function initCSVConnection() {
    if (!hasFileSystemAccess) {
        btnLinkCSV.disabled = true;
        btnLinkCSV.textContent = 'Sincronització no suportada';
        const helpText = document.querySelector('.csv-help-text');
        if (helpText) {
            helpText.textContent = 'El teu navegador no admet la vinculació de fitxers. Si us plau, utilitza Google Chrome o Microsoft Edge.';
            helpText.style.color = 'var(--error)';
        }
        showUnconnectedState();
        return;
    }

    try {
        const savedHandle = await getFileHandle();
        if (savedHandle) {
            csvFileHandle = savedHandle;
            const hasPermission = await verifyPermission(csvFileHandle, false);
            if (hasPermission) {
                await readLinkedCSVHandle(csvFileHandle, false);
            } else {
                showConnectedState(csvFileHandle.name, 'Cal permetre l\'accés per llegir', true, false);
            }
        } else {
            showUnconnectedState();
        }
    } catch (e) {
        console.error('Error restoring CSV file handle', e);
        showUnconnectedState();
    }
}

// Event: Link CSV File
btnLinkCSV.addEventListener('click', async () => {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Arxius CSV de Consulta d\'Usuaris',
                accept: { 'text/csv': ['.csv'] }
            }],
            multiple: false
        });

        csvFileHandle = handle;
        await saveFileHandle(handle);
        await readLinkedCSVHandle(handle, true);
    } catch (err) {
        if (err.name !== 'AbortError') {
            alert(`Error en vincular el fitxer: ${err.message}`);
        }
    }
});

// Event: Grant Access
btnGrantAccess.addEventListener('click', async () => {
    if (csvFileHandle) {
        await readLinkedCSVHandle(csvFileHandle, true);
    }
});

// Event: Refresh CSV
btnRefreshCSV.addEventListener('click', async () => {
    if (csvFileHandle) {
        await readLinkedCSVHandle(csvFileHandle, false);
    }
});

// Event: Unlink CSV
btnUnlinkCSV.addEventListener('click', async () => {
    csvFileHandle = null;
    csvData = [];
    uniqueParentEntities = [];
    activeEmailsList = [];
    entityDataPanel.style.display = 'none';
    
    await removeFileHandle();
    showUnconnectedState();
});

// Drag & Drop for linking file handle
csvDropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

csvDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    csvDropZone.classList.add('drag-over');
});

csvDropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    csvDropZone.classList.remove('drag-over');
});

csvDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    csvDropZone.classList.remove('drag-over');
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file') {
            try {
                let handle = null;
                if (typeof item.getAsFileSystemHandle === 'function') {
                    try {
                        handle = await item.getAsFileSystemHandle();
                    } catch (handleErr) {
                        console.warn('Failed to get file handle, falling back to file object:', handleErr);
                    }
                }

                if (handle && handle.kind === 'file') {
                    if (handle.name.endsWith('.csv')) {
                        csvFileHandle = handle;
                        await saveFileHandle(handle);
                        await readLinkedCSVHandle(handle, true);
                    } else {
                        alert('Si us plau, arrossega un fitxer CSV vàlid.');
                    }
                } else {
                    const file = item.getAsFile();
                    if (file && file.name.endsWith('.csv')) {
                        const parsed = await readCSVFileObject(file);
                        csvData = parsed;
                        processCSVData();
                        alert("Avís: El fitxer s'ha carregat temporalment, però no s'ha pogut vincular permanentment (pot tractar-se d'un fitxer virtual de OneDrive). Utilitza el botó 'Cerca el fitxer' per vincular-lo de manera persistent.");
                    } else {
                        alert('Si us plau, arrossega un fitxer CSV vàlid.');
                    }
                }
            } catch (err) {
                alert(`Error en processar el fitxer: ${err.message}`);
            }
        }
    }
});

// Click on drop zone to trigger picker if button wasn't clicked directly
csvDropZone.addEventListener('click', (e) => {
    if (e.target !== btnLinkCSV && !btnLinkCSV.contains(e.target) && !btnLinkCSV.disabled) {
        btnLinkCSV.click();
    }
});

// ---- Settings Modal Logic ----
function openSettingsModal() {
    settingsModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
    document.body.style.overflow = '';
}

btnSettings.addEventListener('click', openSettingsModal);
btnCloseModal.addEventListener('click', closeSettingsModal);
csvConnectionStatusBadge.addEventListener('click', openSettingsModal);

// Close modal when clicking on the overlay background
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettingsModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.style.display !== 'none') {
        closeSettingsModal();
    }
});

// ---- Update Connection Status Badge ----
function updateConnectionBadge(state) {
    csvConnectionStatusBadge.className = 'connection-badge ' + state;
    switch (state) {
        case 'ready':
            csvConnectionStatusBadge.textContent = 'Connectat';
            break;
        case 'pending':
            csvConnectionStatusBadge.textContent = 'Pendent';
            break;
        default:
            csvConnectionStatusBadge.textContent = 'Sense fitxer';
    }
}



// ---- Autocomplete Dropdown Logic ----
function showAutocomplete(query) {
    if (uniqueParentEntities.length === 0) {
        autocompleteList.style.display = 'none';
        return;
    }

    const GENERALITAT = 'Administració de la Generalitat de Catalunya';
    const cleanQuery = query.trim().toLowerCase();
    
    const filtered = uniqueParentEntities.filter(entity => {
        const displayName = entity === GENERALITAT ? "Administració de la Generalitat" : entity;
        return displayName.toLowerCase().includes(cleanQuery);
    });

    if (filtered.length === 0) {
        autocompleteList.style.display = 'none';
        return;
    }

    autocompleteList.innerHTML = '';
    autocompleteActiveIndex = -1;

    filtered.forEach((entity, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        const displayName = entity === GENERALITAT ? "Administració de la Generalitat" : entity;
        item.textContent = displayName;
        item.dataset.value = entity;
        item.addEventListener('click', () => {
            selectParentEntity(entity);
        });
        autocompleteList.appendChild(item);
    });

    autocompleteList.style.display = 'block';
}

function selectParentEntity(parentName, subsidiaryName = null) {
    const GENERALITAT = 'Administració de la Generalitat de Catalunya';
    const displayName = resolveGeneralitatDisplayName(parentName, subsidiaryName);
    
    entityNameInput.value = displayName;
    autocompleteList.style.display = 'none';

    const parentField = "Detall de partícips.Denominació partícip (agregat)";
    const entityField = "Detall de partícips.Denominació";
    const emailField  = "Email";

    let matchedRows;
    const isGen = isGeneralitatOrDeptParent(parentName);

    console.log('[selectParentEntity] Input:', { parentName, subsidiaryName, isGen, csvDataLength: csvData.length });

    if (isGen) {
        if (subsidiaryName) {
            sessionStorage.setItem('activeSubsidiary', subsidiaryName);
        } else {
            sessionStorage.removeItem('activeSubsidiary');
        }

        const GENERALITAT_PREFIX = "Administració de la Generalitat - ";
        const isGeneralitatName = displayName.startsWith("Administració de la Generalitat");
        let deptName = null;
        
        if (displayName.startsWith(GENERALITAT_PREFIX)) {
            deptName = displayName.substring(GENERALITAT_PREFIX.length).trim();
        }

        if (!isGeneralitatName && subsidiaryName) {
            // It's Directa majoritària, the entity is the subsidiary itself
            // Filter emails by the subsidiary
            const normSub = normalizeForMatch(subsidiaryName);
            matchedRows = csvData.filter(row => {
                const denom = row[entityField]?.trim() || '';
                if (!denom) return false;
                
                if (denom.toLowerCase() === subsidiaryName.toLowerCase()) return true;
                
                const normDenom = normalizeForMatch(denom);
                if (normDenom === normSub) return true;
                
                if (denom.length < 4) return false;

                if (denom.toLowerCase().includes(subsidiaryName.toLowerCase())) return true;
                if (subsidiaryName.toLowerCase().includes(denom.toLowerCase())) return true;
                return tokenSimilarity(normDenom, normSub) >= 0.4;
            });
        } else if (deptName) {
            // Filter by department
            matchedRows = csvData.filter(row => {
                const descDept = (row["Desc. Departament"] || row["Departament"])?.trim();
                const parentAgregat = row[parentField]?.trim();
                return (descDept === deptName) || 
                       (parentAgregat === deptName) || 
                       (parentAgregat === `Administració de la Generalitat - ${deptName}`);
            });
            // Fallback to all Generalitat rows if no department emails are found
            if (matchedRows.length === 0) {
                matchedRows = csvData.filter(row => isGeneralitatOrDeptParent(row[parentField]?.trim()));
            }
        } else {
            // Fallback to all Generalitat rows
            matchedRows = csvData.filter(row => isGeneralitatOrDeptParent(row[parentField]?.trim()));
        }
    } else {
        sessionStorage.removeItem('activeSubsidiary');
        matchedRows = csvData.filter(row => row[parentField]?.trim() === parentName);
    }

    console.log('[selectParentEntity] matchedRows found:', matchedRows.length);

    const entitiesSet = new Set();
    const emailsSet   = new Set();

    matchedRows.forEach(row => {
        const entity = row[entityField]?.trim();
        if (entity) entitiesSet.add(entity);

        const emailVal = row[emailField]?.trim();
        if (emailVal) {
            emailVal.split(/[,;\s]+/).forEach(e => {
                const cleaned = e.trim().toLowerCase();
                if (cleaned && cleaned.includes('@')) emailsSet.add(cleaned);
            });
        }
    });

    const matchedEntities = Array.from(entitiesSet).sort((a, b) => a.localeCompare(b, 'ca'));
    const matchedEmails   = Array.from(emailsSet).sort();

    console.log('[selectParentEntity] Final Entities:', matchedEntities);
    console.log('[selectParentEntity] Final Emails:', matchedEmails);

    displayEntityData(matchedEntities, matchedEmails, displayName);
    updateGenerateBtn();
}

function displayEntityData(entities, emails, entityName) {
    const emptyDataState = document.getElementById('emptyDataState');
    if (entities.length === 0 && emails.length === 0) {
        entityDataPanel.style.display = 'none';
        if (emptyDataState) emptyDataState.style.display = 'block';
        return;
    }

    entityDataPanel.style.display = 'block';
    if (emptyDataState) emptyDataState.style.display = 'none';
    
    const titleEl = document.getElementById('selectedEntityTitle');
    if (titleEl && entityName) {
        titleEl.textContent = entityName;
    }
    const countLabel = document.getElementById('entitiesCountLabel');
    countLabel.textContent = `Entitats cercades (${entities.length})`;

    // Render entities badges
    entitiesList.innerHTML = '';
    entities.forEach(ent => {
        const badge = document.createElement('span');
        badge.className = 'entity-badge';
        badge.textContent = ent;
        badge.title = ent;
        entitiesList.appendChild(badge);
    });

    // Render emails
    emailsList.innerHTML = '';
    if (emails.length === 0) {
        const noEmails = document.createElement('div');
        noEmails.className = 'email-item';
        noEmails.style.color = 'var(--text-muted)';
        noEmails.textContent = 'Cap correu trobat';
        emailsList.appendChild(noEmails);
    } else {
        emails.forEach(email => {
            const item = document.createElement('div');
            item.className = 'email-item';
            item.textContent = email;
            item.title = email;
            emailsList.appendChild(item);
        });
    }

    activeEmailsList = emails;
}

// Input and focus listeners for Autocomplete
entityNameInput.addEventListener('input', () => {
    showAutocomplete(entityNameInput.value);
    if (!entityNameInput.value.trim()) {
        entityDataPanel.style.display = 'none';
        const emptyDataState = document.getElementById('emptyDataState');
        if (emptyDataState) emptyDataState.style.display = 'block';
        activeEmailsList = [];
    }
});

entityNameInput.addEventListener('focus', () => {
    showAutocomplete(entityNameInput.value);
});

// Autocomplete Keyboard Navigation
entityNameInput.addEventListener('keydown', (e) => {
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % items.length;
        updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex - 1 + items.length) % items.length;
        updateActiveItem(items);
    } else if (e.key === 'Enter') {
        if (autocompleteActiveIndex > -1) {
            e.preventDefault();
            selectParentEntity(items[autocompleteActiveIndex].dataset.value);
        }
    } else if (e.key === 'Escape') {
        autocompleteList.style.display = 'none';
    }
});

function updateActiveItem(items) {
    items.forEach((item, index) => {
        if (index === autocompleteActiveIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

// Hide autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (e.target !== entityNameInput && !autocompleteList.contains(e.target)) {
        autocompleteList.style.display = 'none';
    }
});

// Copy Extracted Emails
copyEmailsBtn.addEventListener('click', async () => {
    if (activeEmailsList.length === 0) return;
    const emailsText = activeEmailsList.join('; ');
    try {
        await navigator.clipboard.writeText(emailsText);
        copyEmailsBtn.classList.add('copied');
        copyEmailsBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Copiat!
        `;
        setTimeout(() => {
            copyEmailsBtn.classList.remove('copied');
            copyEmailsBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar
            `;
        }, 2000);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = emailsText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
});

// ---- Init ----
showState('empty');
initCSVConnection();

