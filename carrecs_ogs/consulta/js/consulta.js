/**
 * consulta.js - Controlador de la versió de consulta
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = CONFIG.SYNC.CHUNK_SIZE;

let filters = {
    search: "",
    dept: "",
    status: "",
    nomenaments: [],
    onlySac: false,
    onlyGovern: false,
    onlyVacant: false
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciant Consulta Modular...");
    setupEventListeners();
    await loadData();
    if (window.lucide) lucide.createIcons();
});

async function loadData() {
    try {
        await db.init();
        allRecords = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (allRecords.length > 0) {
            applyFilters();
            populateDepartaments();
            populateNomenaments();
        } else {
            handleSync();
        }
    } catch (e) {
        console.error("Error loading data:", e);
    }
}

async function handleSync() {
    const btn = document.getElementById('btnSync');
    const icon = btn ? btn.querySelector('i') : null;
    const modal = document.getElementById('syncModal');
    try {
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('lucide-spin');
        if (modal) modal.style.display = 'flex';
        allRecords = await syncEngine.runFullSync(null, (info) => {
            const stepText = document.getElementById('syncStep');
            const progressBar = document.getElementById('syncProgressBar');
            if (stepText) stepText.textContent = info.step;
            if (progressBar) progressBar.style.width = `${info.progress}%`;
        });
        applyFilters();
        populateDepartaments();
        populateNomenaments();
        setTimeout(() => {
            if (modal) modal.style.display = 'none';
            if (btn) btn.disabled = false;
            if (icon) icon.classList.remove('lucide-spin');
        }, 400);
    } catch (e) {
        console.error("Sync error:", e);
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('lucide-spin');
    }
}

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
    document.getElementById('toggleGovern').classList.remove('btn-primary');
    document.getElementById('toggleVacant').classList.remove('btn-primary');
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
    let csvContent = "\ufeff";
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem;">No s\'han trobat resultats</td></tr>';
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
    let personaHTML = `<div class="person-cell"><div class="original-data">${nomMostrar}</div>${socialHTML}${nomenamentHTML}${(r.status && r.status !== 'Validat' && r.sac_nom_responsable) ? `<div style="margin-top:8px; padding-top:6px; border-top: 1px solid rgba(255,255,255,0.1);"><small style="color:var(--secondary); font-size:0.75rem; display:block; margin-bottom:2px;">SAC</small><span class="sac-data">${r.sac_nom_responsable}</span></div>` : ''}</div>`;
    const carrecHTML = `<div><div style="font-weight:600;">${r.carrec || '-'}</div>${r.sac_carrec ? `<div style="margin-top:6px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);"><small style="color:var(--secondary); font-size:0.7rem; display:block;">(SAC:)</small><div style="font-size:0.8rem;">${r.sac_carrec}</div><div style="font-size:0.75rem; color:var(--text-muted);">${r.sac_unitat || ''} | ${r.sac_departament || ''}</div></div>` : ''}</div>`;
    const entitatHTML = `<div><div style="font-weight:600;">${r.entitat}</div><div style="font-size:0.75rem; color:var(--text-muted);">Reg: ${r.n_registre || '-'}</div></div>`;
    const ogsHTML = `<div style="font-size:0.85rem;"><div style="font-weight:500;">${r.is_govern_superior || '-'}</div><div style="font-size:0.75rem; color:var(--text-muted);">${r.membre_tipus || '-'} <span style="font-size:0.7rem;">(${r.part_cip_o_organisme || '-'})</span></div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);">${r.departament || '-'}</div></div>`;
    return `<td><span class="sac-code">${r.codi_sac || '-'}</span></td><td>${carrecHTML}</td><td>${personaHTML}</td><td>${entitatHTML}</td><td>${ogsHTML}</td><td>${badgeHTML}</td>`;
}

function populateDepartaments() {
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
        btn.textContent = "Tipus Nomenament";
        btn.classList.remove('btn-primary');
    } else {
        btn.textContent = `(${filters.nomenaments.length}) Nomenaments`;
        btn.classList.add('btn-primary');
    }
}

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
    document.getElementById('toggleGovern').addEventListener('click', (e) => {
        filters.onlyGovern = !filters.onlyGovern;
        e.currentTarget.classList.toggle('btn-primary', filters.onlyGovern);
        applyFilters();
    });
    document.getElementById('toggleVacant').addEventListener('click', (e) => {
        filters.onlyVacant = !filters.onlyVacant;
        e.currentTarget.classList.toggle('btn-primary', filters.onlyVacant);
        applyFilters();
    });
    document.getElementById('btnSync').addEventListener('click', () => handleSync());
    window.addEventListener('scroll', () => {
        const scrollPercent = (window.innerHeight + window.scrollY) / document.documentElement.scrollHeight;
        if (scrollPercent > 0.85 && rowsShown < filteredRecords.length) {
            rowsShown += CONFIG.SYNC.CHUNK_SIZE;
            renderTable(true);
        }
    });
}
