/**
 * dashboard.js - Controlador de la interfície principal
 */
console.log("[JS] Dashboard carregat correctament.");

import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { CloudService } from './modules/cloud.js';

// Estats de l'aplicació
let allRecords = [];
let filteredRecords = [];
let rowsShown = CONFIG.SYNC.CHUNK_SIZE;
let isRendering = false;

// Filtres
let filters = {
    search: "",
    dept: "",
    status: "",
    nomenaments: [],
    onlySac: false,
    onlyGovern: false,
    onlyVacant: false
};

/**
 * Inicialització
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log("[Dashboard] Inicialitzant...");
    initUI();
    setupEventListeners(); 
    console.log("[Dashboard] Botons activats.");
    await loadInitialData();
});

function initUI() {
    if (window.lucide) lucide.createIcons();
}

async function loadInitialData() {
    try {
        let data = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (data && data.length > 0) {
            allRecords = data;
            populateDepartaments();
            populateNomenaments();
            applyFilters();
            checkCloudUpdates();
        } else {
            handleSync();
        }
    } catch (error) {
        console.error("Error loading initial data:", error);
    }
}

/**
 * Gestió de Sincronització
 */
async function handleSync(manualCsvText = null) {
    const modal = document.getElementById('syncModal');
    const stepText = document.getElementById('syncStep');
    const progressBar = document.getElementById('syncProgressBar');
    const btnSync = document.getElementById('btnSync');
    const csvFallback = document.getElementById('csvFallback');
    const modalControls = document.getElementById('modalControls');
    const icon = btnSync ? btnSync.querySelector('i') : null;

    try {
        if (btnSync) btnSync.disabled = true;
        if (icon) icon.classList.add('lucide-spin');
        
        modal.style.display = 'flex';
        if (csvFallback) csvFallback.style.display = 'none';
        if (modalControls) modalControls.style.display = 'none';
        stepText.style.color = 'white';
        stepText.textContent = "Iniciant procés...";
        progressBar.style.width = '0%';

        const data = await syncEngine.runFullSync(manualCsvText, (info) => {
            if (info.step) stepText.textContent = info.step;
            if (info.progress) progressBar.style.width = `${info.progress}%`;
        });

        allRecords = data;
        populateDepartaments();
        populateNomenaments();
        applyFilters();

        setTimeout(() => {
            modal.style.display = 'none';
            if (btnSync) btnSync.disabled = false;
            if (icon) icon.classList.remove('lucide-spin');
        }, 400);

    } catch (error) {
        console.error("Sync failed:", error);
        stepText.textContent = "Error: " + error.message;
        stepText.style.color = '#ef4444';
        if (btnSync) btnSync.disabled = false;
        if (icon) icon.classList.remove('lucide-spin');
        if (modalControls) modalControls.style.display = 'block';
    }
}

async function checkCloudUpdates() {
    const statusEl = document.getElementById('cloudStatus');
    try {
        const result = await CloudService.loadData();
        if (result) {
            statusEl.textContent = result.isNew ? 'Núvol Actualitzat' : 'Núvol Sincronitzat';
            statusEl.className = 'badge-validat';
            statusEl.style.display = 'inline-block';
            if (result.isNew) handleSync(); 
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = 'Mode Offline';
            statusEl.className = 'badge-pendent';
        }
    }
}

/**
 * Filtres i Renderització
 */
function applyFilters() {
    filters.search = (document.getElementById('globalSearch').value || "").toLowerCase().trim();
    filters.dept = document.getElementById('filterDepartament').value;
    filters.status = document.getElementById('filterStatus').value;

    filteredRecords = allRecords.filter(r => {
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.entitat || ''} ${r.carrec || ''} ${r.codi_sac || ''} ${r.qualificador || ''}`.toLowerCase();
        const sacNom = (r.sac_nom_responsable || "").toLowerCase();
        const matchesSearch = !filters.search || searchableText.includes(filters.search) || sacNom.includes(filters.search);
        
        const valDept = r.sac_departament || r.departament || "Sense departament";
        const matchesDept = !filters.dept || valDept === filters.dept;
        
        const matchesStatus = !filters.status || r.status === filters.status;
        const matchesNomenament = filters.nomenaments.length === 0 || filters.nomenaments.includes(r.tipus_nomenament);
        const matchesSac = !filters.onlySac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesGovern = !filters.onlyGovern || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesVacant = !filters.onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");

        return matchesSearch && matchesDept && matchesStatus && matchesNomenament && matchesSac && matchesGovern && matchesVacant;
    });

    rowsShown = CONFIG.SYNC.CHUNK_SIZE;
    window.scrollTo(0, 0);
    renderTable();
}

function resetFilters() {
    filters = {
        search: "",
        dept: "",
        status: "",
        nomenaments: [],
        onlySac: false,
        onlyGovern: false,
        onlyVacant: false
    };

    document.getElementById('globalSearch').value = "";
    document.getElementById('filterDepartament').value = "";
    document.getElementById('filterStatus').value = "";
    document.getElementById('toggleSac').classList.remove('btn-primary');
    const btnGov = document.getElementById('toggleGovern'); if (btnGov) btnGov.classList.remove('btn-primary');
    const btnVac = document.getElementById('toggleVacant'); if (btnVac) btnVac.classList.remove('btn-primary');
    
    updateNomenamentsUI();
    populateNomenaments();
    applyFilters();
}

function exportToCSV() {
    if (filteredRecords.length === 0) {
        alert("No hi ha dades per exportar");
        return;
    }

    const headers = ["Codi SAC", "Persona Nom", "Persona Cognoms", "Carrec", "Departament", "Entitat", "N. Registre", "Òrgan Govern Superior", "Tipus Membre", "Particip/Organisme", "Tipus Nomenament", "Estat", "Qualificador"];
    
    let csvContent = "\ufeff"; // BOM per a Excel (UTF-8)
    csvContent += headers.join(";") + "\n";
    
    filteredRecords.forEach(r => {
        const valDept = r.sac_departament || r.departament || "";
        const row = [
            r.codi_sac || "",
            r.persona_nom || "",
            r.persona_cognoms || "",
            r.carrec || "",
            valDept,
            r.entitat || "",
            r.n_registre || "",
            r.is_govern_superior || "",
            r.membre_tipus || "",
            r.part_cip_o_organisme || "",
            r.tipus_nomenament || "",
            r.status || "",
            r.qualificador || ""
        ];

        const escapedRow = row.map(val => {
            let str = String(val).replace(/"/g, '""');
            if (str.includes(";") || str.includes("\n") || str.includes('"')) {
                str = `"${str}"`;
            }
            return str;
        });
        csvContent += escapedRow.join(";") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0,10);
    link.setAttribute("href", url);
    link.setAttribute("download", `export_sector_public_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderTable(append = false) {
    const tbody = document.getElementById('tableBody');
    if (!append) tbody.innerHTML = '';
    const start = append ? rowsShown - CONFIG.SYNC.CHUNK_SIZE : 0;
    const end = Math.min(rowsShown, filteredRecords.length);
    const chunk = filteredRecords.slice(start, end);

    if (chunk.length === 0 && !append) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 3rem;">No s\'han trobat resultats</td></tr>';
        return;
    }

    chunk.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = generateRowHTML(r);
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

function generateRowHTML(r) {
    const statusClass = r.status === 'Validat' ? 'badge-validat' : 'badge-pendent';
    const badgeHTML = r.status ? `<span class="badge ${statusClass}">${r.status}</span>` : '';
    
    let nomMostrar = `${r.persona_nom || ''} ${r.persona_cognoms || ''}`;
    let socialHTML = '';
    const nomenamentHTML = r.tipus_nomenament ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; font-style: italic;">${r.tipus_nomenament}</div>` : '';
    const qualNorm = (r.qualificador || "").toString().trim().toLowerCase();

    if (r.qualificador === "P. Jurídica") {
        nomMostrar = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`;
        if (r.denom_social) socialHTML = `<div style="font-size: 0.65rem; color: var(--primary); margin-top: 1px; font-weight: 600;">Representant de ${r.denom_social}</div>`;
    } else if (qualNorm.includes("vacant")) {
        nomMostrar = `<span style="color:var(--text-muted); font-style:italic;">Vacant</span>`;
    }

    let personaHTML = `
        <div class="person-cell">
            <div class="original-data">${nomMostrar}</div>
            ${socialHTML}
            ${nomenamentHTML}
            ${(r.status && r.status !== 'Validat' && r.sac_nom_responsable) ? `
                <div style="margin-top:8px; padding-top:6px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <small style="color:var(--secondary); font-size:0.75rem; display:block; margin-bottom:2px;">SAC</small>
                    <span class="sac-data">${r.sac_nom_responsable}</span>
                </div>` : ''}
        </div>`;

    const carrecHTML = `
        <div>
            <div style="font-weight:600;">${r.carrec || '-'}</div>
            ${r.sac_carrec ? `
            <div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);">
                <small style="color:var(--secondary); font-size:0.7rem; display:block;">(SAC:)</small>
                <div style="font-size:0.8rem;">${r.sac_carrec}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${r.sac_unitat || ''} | ${r.sac_departament || ''}</div>
            </div>` : ''}
        </div>`;

    const entitatHTML = `
        <div>
            <div style="font-weight:600;">${r.entitat}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Reg: ${r.n_registre || '-'}</div>
        </div>`;

    const ogsHTML = `
        <div style="font-size:0.85rem;">
            <div style="font-weight:500;">${r.is_govern_superior || '-'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
                ${r.membre_tipus || '-'} <span style="font-size:0.7rem;">(${r.part_cip_o_organisme || '-'})</span>
            </div>
            ${r.rgan_que_designa ? `<div style="font-size:0.7rem; color:var(--primary); margin-top:4px;">Nomenat per: ${r.rgan_que_designa}</div>` : ''}
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);">
                ${r.departament || '-'}
            </div>
        </div>`;

    return `
        <td><span class="sac-code">${r.codi_sac || '-'}</span></td>
        <td>${carrecHTML}</td>
        <td>${personaHTML}</td>
        <td>${entitatHTML}</td>
        <td>${ogsHTML}</td>
        <td>${badgeHTML}</td>
        <td style="text-align: center;">
            <button class="btn-quick-edit" onclick="openQuickEdit('${r.id}')">
                <i data-lucide="pencil" style="width: 14px;"></i>
            </button>
        </td>
    `;
}

function populateDepartaments() {
    if (!allRecords || allRecords.length === 0) return;
    const deptsSet = new Set();
    for (let i = 0; i < allRecords.length; i++) {
        const r = allRecords[i];
        deptsSet.add(r.sac_departament || r.departament || "Sense departament");
    }
    const depts = Array.from(deptsSet).sort();
    const select = document.getElementById('filterDepartament');
    if (!select) return;
    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);
    depts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
}

function populateNomenaments() {
    const list = document.getElementById('listNomenaments');
    if (!list) return;
    const types = [...new Set(allRecords.map(r => r.tipus_nomenament))].filter(Boolean).sort();
    list.innerHTML = '';
    types.forEach(type => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        const checked = filters.nomenaments.includes(type);
        item.innerHTML = `<input type="checkbox" value="${type}" ${checked ? 'checked' : ''}><span>${type}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) filters.nomenaments.push(type);
            else filters.nomenaments = filters.nomenaments.filter(v => v !== type);
            updateNomenamentsUI();
            applyFilters();
        });
        list.appendChild(item);
    });
}

function updateNomenamentsUI() {
    const btn = document.getElementById('btnNomenaments');
    if (!btn) return;
    if (filters.nomenaments.length === 0) {
        btn.innerHTML = `<i data-lucide="list-checks" style="width: 16px; vertical-align: middle; margin-right: 4px;"></i> Tipus Nomenament`;
        btn.classList.remove('btn-primary');
    } else {
        btn.innerHTML = `<i data-lucide="list-checks" style="width: 16px; vertical-align: middle; margin-right: 4px;"></i> (${filters.nomenaments.length}) Nomenaments`;
        btn.classList.add('btn-primary');
    }
    if (window.lucide) lucide.createIcons();
}

/**
 * Esdeveniments
 */
function setupEventListeners() {
    document.getElementById('globalSearch').addEventListener('input', applyFilters);
    document.getElementById('filterDepartament').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);

    const btnNom = document.getElementById('btnNomenaments');
    const dropdownNom = document.getElementById('dropdownNomenaments');
    if (btnNom && dropdownNom) {
        btnNom.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownNom.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!dropdownNom.contains(e.target) && e.target !== btnNom) dropdownNom.classList.remove('active');
        });
    }

    document.getElementById('btnResetFilters').addEventListener('click', resetFilters);
    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);

    document.getElementById('toggleSac').addEventListener('click', (e) => {
        filters.onlySac = !filters.onlySac;
        e.currentTarget.classList.toggle('btn-primary', filters.onlySac);
        applyFilters();
    });

    const btnGovern = document.getElementById('toggleGovern');
    if (btnGovern) {
        btnGovern.addEventListener('click', (e) => {
            filters.onlyGovern = !filters.onlyGovern;
            e.currentTarget.classList.toggle('btn-primary', filters.onlyGovern);
            applyFilters();
        });
    }

    const btnVacant = document.getElementById('toggleVacant');
    if (btnVacant) {
        btnVacant.addEventListener('click', (e) => {
            filters.onlyVacant = !filters.onlyVacant;
            e.currentTarget.classList.toggle('btn-primary', filters.onlyVacant);
            applyFilters();
        });
    }

    const syncBtn = document.getElementById('btnSync');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => handleSync());
    }

    const btnCancelSync = document.getElementById('btnCancelSync');
    if (btnCancelSync) {
        btnCancelSync.addEventListener('click', () => {
            document.getElementById('syncModal').style.display = 'none';
            if (syncBtn) syncBtn.disabled = false;
        });
    }

    const sacFileInput = document.getElementById('sacFileInput');
    if (sacFileInput) {
        sacFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => handleSync(event.target.result);
            reader.readAsText(file);
        });
    }
    
    window.addEventListener('scroll', () => {
        const scrollPercent = (window.innerHeight + window.scrollY) / document.documentElement.scrollHeight;
        if (scrollPercent > 0.85 && rowsShown < filteredRecords.length && !isRendering) {
            rowsShown += CONFIG.SYNC.CHUNK_SIZE;
            renderTable(true);
        }
    });

    const editForm = document.getElementById('editMappingForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editMappingIndex').value;
            const nouCodi = document.getElementById('editFieldCodi').value.trim();
            const record = allRecords.find(r => r.id == id);
            const updated = await syncEngine.updateSingleRecord(record, { codi_sac: nouCodi });
            const idx = allRecords.findIndex(r => r.id == id);
            allRecords[idx] = updated;
            CloudService.savePartial({ d: record.entitat, m: record.membre_tipus, c: record.carrec, k: nouCodi });
            window.closeQuickEdit();
            applyFilters();
        });
    }
}

window.openQuickEdit = (id) => {
    const record = allRecords.find(r => r.id == id);
    if (!record) return;
    document.getElementById('editFieldEntitat').value = record.entitat;
    document.getElementById('editFieldMembre').value = record.membre_tipus;
    document.getElementById('editFieldCarrec').value = record.carrec;
    document.getElementById('editFieldCodi').value = record.codi_sac;
    document.getElementById('editMappingIndex').value = record.id;
    document.getElementById('editMappingModal').style.display = 'flex';
};

window.closeQuickEdit = () => {
    document.getElementById('editMappingModal').style.display = 'none';
};
