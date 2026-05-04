let onlyIncomplete = false;
let onlyWithSac = false;
let onlyVacant = false;
let rowsShown = 100;
const CHUNK_SIZE = 100;
let isRendering = false; // Per evitar col·lisions en el scroll

async function updateCloudStatus(forceQuickSync = false) {
    const cloudStatus = document.getElementById('cloudStatus');
    let hasNewData = forceQuickSync;

    if (cloudStatus && typeof SAC_CLOUD_SERVICE !== 'undefined') {
        try {
            const result = await SAC_CLOUD_SERVICE.loadData();
            if (result && result.isNew) {
                hasNewData = true;
            }
            const cloudData = result ? (result.data || result) : null;

            if (cloudData) {
                cloudStatus.textContent = 'Núvol Sincronitzat';
                cloudStatus.className = 'badge-validat';
                cloudStatus.style.display = 'inline-block';
            } else {
                cloudStatus.textContent = 'Mode Local (Offline)';
                cloudStatus.className = 'badge-pendent';
                cloudStatus.style.display = 'inline-block';
            }
        } catch (e) {
            console.warn("Error en el check del núvol:", e);
            cloudStatus.textContent = 'Error Núvol';
            cloudStatus.className = 'badge-error';
            cloudStatus.style.display = 'inline-block';
        }
    }

    // Si hem detectat un canvi al núvol (isNew), refem el mapatge i refresquem la vista
    if (hasNewData && typeof window.dataSync !== 'undefined' && allRecords.length > 0) {
        console.log("☁️ Canvi detectat al núvol. Actualitzant mapatges automàticament...");
        const btnSync = document.getElementById('btnSync');
        const originalContent = btnSync ? btnSync.innerHTML : '';
        
        if (btnSync) {
            btnSync.innerHTML = `<i data-lucide="refresh-cw" class="lucide-spin" style="width: 14px; margin-right: 4px;"></i> Actualitzant...`;
            if (window.lucide) lucide.createIcons();
        }

        try {
            await window.dataSync.quickSync(allRecords);
            applyFilters(); // Redibuixa la taula amb els nous mapatges
            console.log("✅ Taula actualitzada amb les dades del servidor.");
        } catch (err) {
            console.error("Error en l'auto-sincronització:", err);
        }

        if (btnSync) {
            setTimeout(() => {
                btnSync.innerHTML = originalContent;
                if (window.lucide) lucide.createIcons();
            }, 1000);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.getElementById('tableBody');
    try {
        console.log("Iniciant Dashboard...");

        // 1. Intentar carregar des d'IndexedDB
        let data = await window.dataSync.loadFromDB();

        if (data && data.length > 0) {
            console.log("Dades carregades des d'IndexedDB:", data.length);
            allRecords = data;
            
            // 2. Render inicial IMMEDIAT
            filteredRecords = [...allRecords];
            populateDepartaments();
            renderTable();
            
            // 3. Comprovar núvol en segon pla per actualitzar mapatges
            updateCloudStatus();
        } else {
            console.log("No hi ha dades a IndexedDB. Iniciant sincronització inicial automàtica...");
            // Mostrem un missatge amable a la taula mentre se sincronitza
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem; color: var(--primary);">
                        <i data-lucide="refresh-cw" class="lucide-spin" style="width: 24px; margin-bottom: 1rem; display: block; margin-left: auto; margin-right: auto;"></i>
                        <strong>Sincronitzant amb el núvol per primera vegada...</strong><br>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Això només passarà el primer cop.</span>
                    </td>
                </tr>`;
            if (window.lucide) lucide.createIcons();
            
            // Forcem la sincronització inicial
            handleSync();
        }
        setupEventListeners();
        initMappingEditor();

        // 4. Escoltar canvis en temps real des d'altres pestanyes
        window.addEventListener('storage', async (event) => {
            if (event.key === 'sac_update_signal') {
                console.log("Notificació de canvi rebuda via localStorage.");
                // Recarregar dades de la BD local i refrescar la vista
                const freshData = await window.dataSync.loadFromDB();
                if (freshData && freshData.length > 0) {
                    allRecords = freshData;
                    applyFilters();
                }
            }
        });
    } catch (error) {
        console.error("Error en el Dashboard:", error);
    }
});

function populateDepartaments() {
    const depts = [...new Set(allRecords.map(r => r.sac_departament || "Sense departament"))].sort();
    const select = document.getElementById('filterDepartament');
    depts.forEach(dept => {
        if (!dept) return;
        const opt = document.createElement('option');
        opt.value = dept;
        opt.textContent = dept;
        select.appendChild(opt);
    });
}

function setupEventListeners() {
    document.getElementById('globalSearch').addEventListener('input', applyFilters);
    document.getElementById('filterDepartament').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);

    document.getElementById('toggleSac').addEventListener('click', (e) => {
        onlyWithSac = !onlyWithSac;
        e.currentTarget.classList.toggle('btn-primary', onlyWithSac);
        applyFilters();
    });

    document.getElementById('toggleGovern').addEventListener('click', (e) => {
        onlyIncomplete = !onlyIncomplete;
        e.currentTarget.classList.toggle('btn-error', onlyIncomplete);
        applyFilters();
    });

    document.getElementById('toggleVacant').addEventListener('click', (e) => {
        onlyVacant = !onlyVacant;
        e.currentTarget.classList.toggle('btn-primary', onlyVacant);
        applyFilters();
    });

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.addEventListener('click', () => handleSync());
    }

    const btnCancelSync = document.getElementById('btnCancelSync');
    if (btnCancelSync) {
        btnCancelSync.addEventListener('click', () => {
            document.getElementById('syncModal').style.display = 'none';
            document.getElementById('btnSync').disabled = false;
        });
    }

    // Detector de Scroll Infinit
    window.addEventListener('scroll', () => {
        // Si estem a prop del final de la pàgina (85%) i hi ha més records per mostrar
        const scrollPercent = (window.innerHeight + window.scrollY) / document.documentElement.scrollHeight;
        if (scrollPercent > 0.85 && rowsShown < filteredRecords.length && !isRendering) {
            loadMoreRows();
        }
    });

    const sacFileInput = document.getElementById('sacFileInput');
    if (sacFileInput) {
        sacFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                handleSync(text);
            };
            reader.readAsText(file);
        });
    }
}

async function handleSync(manualCsvText = null) {
    const modal = document.getElementById('syncModal');
    const stepText = document.getElementById('syncStep');
    const progressBar = document.getElementById('syncProgressBar');
    const btnSync = document.getElementById('btnSync');
    const csvFallback = document.getElementById('csvFallback');
    const modalControls = document.getElementById('modalControls');
    const icon = btnSync.querySelector('i');

    try {
        btnSync.disabled = true;
        if (icon) icon.classList.add('sync-status-active');
        modal.style.display = 'flex';
        csvFallback.style.display = 'none';
        modalControls.style.display = 'none';
        stepText.style.color = 'inherit';

        const data = await window.dataSync.runFullSync(manualCsvText, (info) => {
            if (info.step) stepText.textContent = info.step;
            if (info.progress) progressBar.style.width = `${info.progress}%`;

            if (info.isError) {
                stepText.style.color = '#eab308'; // Warning color
                if (info.step.toLowerCase().includes('sac.csv') || info.step.toLowerCase().includes('buit')) {
                    csvFallback.style.display = 'block';
                    modalControls.style.display = 'block';
                }
            }
        });

        allRecords = data;
        applyFilters();
        populateDepartaments();

        setTimeout(() => {
            if (csvFallback.style.display !== 'block') {
                modal.style.display = 'none';
                btnSync.disabled = false;
                if (icon) icon.classList.remove('sync-status-active');
            }
        }, 1500);

    } catch (error) {
        console.error("Sync failed:", error);
        stepText.textContent = "Error: " + error.message;
        stepText.style.color = '#ef4444';
        btnSync.disabled = false;
        if (icon) icon.classList.remove('sync-status-active');
        modalControls.style.display = 'block';
    }
}

function applyFilters() {
    if (!allRecords || !Array.isArray(allRecords)) return;

    const search = (document.getElementById('globalSearch').value || "").toLowerCase().trim();
    const dept = document.getElementById('filterDepartament').value;
    const status = document.getElementById('filterStatus').value;

    filteredRecords = allRecords.filter(r => {
        // Seguretat contra nuls
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.entitat || ''} ${r.carrec || ''} ${r.codi_sac || ''} ${r.qualificador || ''}`.toLowerCase();
        const sacNom = (r.sac_nom_responsable || "").toLowerCase();

        const matchesSearch = !search || 
                             searchableText.includes(search) || 
                             sacNom.includes(search);

        const matchesDept = !dept || r.sac_departament === dept;
        const matchesStatus = !status || r.status === status;
        const matchesGovern = !onlyIncomplete || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesSac = !onlyWithSac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesVacant = !onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");

        return matchesSearch && matchesDept && matchesStatus && matchesGovern && matchesSac && matchesVacant;
    });

    rowsShown = CHUNK_SIZE;
    window.scrollTo(0, 0);
    renderTable();
}

function loadMoreRows() {
    isRendering = true;
    rowsShown += CHUNK_SIZE;
    renderTable(true);
    isRendering = false;
}

function renderTable(append = false) {
    const tbody = document.getElementById('tableBody');

    if (!append) {
        tbody.innerHTML = '';
        if (filteredRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 3rem;">No s\'han trobat resultats</td></tr>';
            return;
        }
    }

    // Calculem el rang de files a mostrar
    const start = append ? rowsShown - CHUNK_SIZE : 0;
    const end = Math.min(rowsShown, filteredRecords.length);
    const recordsToDisplay = filteredRecords.slice(start, end);

    if (recordsToDisplay.length === 0 && !append) return;

    recordsToDisplay.forEach(r => {
        const tr = document.createElement('tr');

        const showBadge = r.status && r.status !== "";
        const statusClass = r.status === 'Validat' ? 'badge-validat' : 'badge-pendent';
        const badgeHTML = showBadge ? `<span class="badge ${statusClass}">${r.status}</span>` : '';

        // Persona: Lògica actual (comparació DO vs SAC) + Tipus de Nomenament + P. Jurídica
        let personaHTML = '';
        const nomenamentHTML = r.tipus_nomenament ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; font-style: italic;">${r.tipus_nomenament}</div>` : '';
        
        let nomMostrar = `${r.persona_nom || ''} ${r.persona_cognoms || ''}`;
        let socialHTML = '';

        const qualNorm = (r.qualificador || "").toString().trim().toLowerCase();

        if (r.qualificador === "P. Jurídica") {
            nomMostrar = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`;
            if (r.denom_social) {
                socialHTML = `<div style="font-size: 0.65rem; color: var(--primary); margin-top: 1px; font-weight: 600;">Representant de ${r.denom_social}</div>`;
            }
        } else if (qualNorm.includes("vacant")) {
            nomMostrar = `<span style="color:var(--text-muted); font-style:italic;">Vacant</span>`;
        }

        if (r.status === 'Validat' || !r.codi_sac) {
            personaHTML = `
                <div class="person-cell">
                    <div class="original-data">${nomMostrar}</div>
                    ${socialHTML}
                    ${nomenamentHTML}
                </div>`;
        } else {
            personaHTML = `
                <div class="person-cell">
                    <div class="original-data">${nomMostrar}</div>
                    ${socialHTML}
                    ${nomenamentHTML}
                    <div style="margin-top:8px; padding-top:6px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <small style="color:var(--secondary); font-size:0.75rem; display:block; margin-bottom:2px;">SAC</small>
                        <span class="sac-data">${r.sac_nom_responsable || '<span style="color:var(--error)">Dada no trobada al SAC</span>'}</span>
                    </div>
                </div>`;
        }

        // Càrrec: (DO:) càrrec | depto | (SAC:) càrrec | unitat | depto
        const carrecHTML = `
            <div>
                <div style="font-weight:600;">${r.carrec || '-'}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.departament || '-'}</div>
                ${r.sac_carrec ? `
                <div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);">
                    <small style="color:var(--secondary); font-size:0.7rem; display:block;">(SAC:)</small>
                    <div style="font-size:0.8rem;">${r.sac_carrec}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${r.sac_unitat || ''} | ${r.sac_departament || ''}</div>
                </div>` : ''}
            </div>
        `;

        // Entitat: denominació | n_registre
        const entitatHTML = `
            <div>
                <div style="font-weight:600;">${r.entitat}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Reg: ${r.n_registre || '-'}</div>
            </div>
        `;

        // Càrrec OGS: govern_superior | membre (participant) | Nomenat per: rgan_que_designa
        const ogsHTML = `
            <div style="font-size:0.85rem;">
                <div style="font-weight:500;">${r.is_govern_superior || '-'}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">
                    ${r.membre_tipus || '-'} <span style="font-style:italic; font-size:0.7rem;">(${r.part_cip_o_organisme || '-'})</span>
                </div>
                ${r.rgan_que_designa ? `<div style="font-size:0.7rem; color:var(--primary); margin-top:4px;">Nomenat per: ${r.rgan_que_designa}</div>` : ''}
            </div>
        `;

        tr.innerHTML = `
            <td><span class="sac-code">${r.codi_sac || '-'}</span></td>
            <td>${carrecHTML}</td>
            <td>${personaHTML}</td>
            <td>${entitatHTML}</td>
            <td>${ogsHTML}</td>
            <td>${badgeHTML}</td>
            <td style="text-align: center;">
                <button class="btn-quick-edit" onclick="openEditMappingModal('${r.entitat.replace(/'/g, "\\'")}', '${r.membre_tipus.replace(/'/g, "\\'")}', '${r.carrec.replace(/'/g, "\\'")}', '${r.codi_sac || ''}')">
                    <i data-lucide="pencil" style="width: 14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (filteredRecords.length > rowsShown) {
        const moreTr = document.createElement('tr');
        moreTr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1rem; font-size: 0.85rem;">
            Mostrant ${rowsShown} de ${filteredRecords.length} registres... <br>
            <span style="font-size: 0.75rem; color: var(--primary);">Continua baixant per veure'n més</span>
        </td>`;
        tbody.appendChild(moreTr);
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Lògica de l'Editor de Mapatges Encastat
 */
function initMappingEditor() {
    const editForm = document.getElementById('editMappingForm');
    const btnCancel = document.getElementById('btnCancelEditMapping');
    const modal = document.getElementById('editMappingModal');

    if (editForm) {
        editForm.addEventListener('submit', handleEditMappingSubmit);
    }
    if (btnCancel) {
        btnCancel.addEventListener('click', () => modal.style.display = 'none');
    }
}

function openEditMappingModal(entitat, membre, carrec, codiActual) {
    document.getElementById('editFieldEntitat').value = entitat;
    document.getElementById('editFieldMembre').value = membre;
    document.getElementById('editFieldCarrec').value = carrec;
    document.getElementById('editFieldCodi').value = codiActual;

    document.getElementById('editMappingModal').style.display = 'flex';
    document.getElementById('editFieldCodi').focus();
}

async function handleEditMappingSubmit(e) {
    e.preventDefault();

    const entitat = document.getElementById('editFieldEntitat').value;
    const membre = document.getElementById('editFieldMembre').value;
    const carrec = document.getElementById('editFieldCarrec').value;
    const nouCodi = document.getElementById('editFieldCodi').value.trim();

    document.getElementById('editMappingModal').style.display = 'none';

    if (window.dataSync) {
        // 1. Actualització ràpida en memòria i IndexedDB
        const sacFields = { codi_sac: nouCodi };

        // Intentar enriquir amb dades de SAC si el motor les té
        if (window.dataSync.algoliaLookup && window.dataSync.algoliaLookup.has(nouCodi)) {
            const alg = window.dataSync.algoliaLookup.get(nouCodi);
            sacFields.sac_nom_responsable = alg.dadesOrganigrama.nomresponsable;
            sacFields.sac_unitat = alg.unitatResp.unitat;
            sacFields.sac_departament = alg.unitatResp.departament;
            sacFields.sac_carrec = alg.dadesOrganigrama.carrec;
        }

        await window.dataSync.updateSingleRecord(entitat, membre, carrec, sacFields);

        // 2. Notificació a la interfície
        console.log(`Mapatge actualitzat manualment: ${entitat} -> ${nouCodi}`);

        // 3. Sincronització amb el núvol (en segon pla)
        if (typeof SAC_CLOUD_SERVICE !== 'undefined') {
            SAC_CLOUD_SERVICE.savePartial({ d: entitat, m: membre, c: carrec, k: nouCodi });
        }

        // 4. Refrescar la vista
        const freshData = await window.dataSync.loadFromDB();
        if (freshData) {
            allRecords = freshData;
            applyFilters();
        }
    }
}

// Inici: Motor de Sincronització en segon pla (V3)
// Revisa si hi ha canvis fets per altres companys cada 3 minuts
setInterval(async () => {
    console.log('Comprovació automática de canvis al núvol...');
    await updateCloudStatus();
}, 180000); 
