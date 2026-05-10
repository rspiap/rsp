/**
 * dashboard.js - Controlador 5 Nivells (SAC -> Càrrec -> Entitat -> OGS -> Persona)
 * Versió: Taula Nativa amb rowspan per a alineació perfecta.
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { CloudService } from './modules/cloud.js';
import { BoardService } from './modules/board-of-directors.js';
import { initTheme, toggleTheme, parseDate } from './modules/utils.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = 15;
let filters = { 
    search: "", dept: "", status: "", naturezas: [], nomenaments: [], categoritzacions: [], 
    onlySac: false, onlyGovern: false, onlyVacant: false,
    colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "" 
};
let sortConfig = { key: 'codi_sac', direction: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupEventListeners();
    await loadInitialData();
});

async function loadInitialData() {
    try {
        let data = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (data && data.length > 0) {
            allRecords = data;
            populateDepartaments(); populateNaturezas(); populateNomenaments(); populateCategoritzacions(); applyFilters(); checkCloudUpdates();
        } else { handleSync(); }
    } catch (e) { console.error(e); }
}

async function handleSync(manualCsvText = null) {
    const modal = document.getElementById('syncModal');
    const stepText = document.getElementById('syncStep');
    const progressBar = document.getElementById('syncProgressBar');
    const btnSync = document.getElementById('btnSync');
    try {
        if (btnSync) btnSync.disabled = true;
        modal.style.display = 'flex';
        const data = await syncEngine.runFullSync(manualCsvText, (info) => {
            if (info.step) stepText.textContent = info.step;
            if (info.progress) progressBar.style.width = `${info.progress}%`;
        });
        allRecords = data;
        populateDepartaments(); populateNaturezas(); populateNomenaments(); populateCategoritzacions(); applyFilters();
        setTimeout(() => { modal.style.display = 'none'; if (btnSync) btnSync.disabled = false; }, 400);
    } catch (e) { if (btnSync) btnSync.disabled = false; }
}

async function checkCloudUpdates() {
    const statusEl = document.getElementById('cloudStatus');
    try {
        const result = await CloudService.loadData();
        if (result && statusEl) {
            statusEl.textContent = result.isNew ? 'Núvol Actualitzat' : 'Núvol Sincronitzat';
            statusEl.className = 'badge-validat';
            statusEl.style.display = 'inline-block';
            if (result.isNew) handleSync();
        }
    } catch (e) { }
}

function applyFilters() {
    filters.search = (document.getElementById('globalSearch').value || "").toLowerCase().trim();
    filters.dept = document.getElementById('filterDepartament').value;
    filters.status = document.getElementById('filterStatus').value;

    filters.colSac = (document.getElementById('colFilterSAC').value || "").toLowerCase().trim();
    filters.colCarrec = (document.getElementById('colFilterCarrec').value || "").toLowerCase().trim();
    filters.colEntitat = (document.getElementById('colFilterEntitat').value || "").toLowerCase().trim();
    filters.colOGS = (document.getElementById('colFilterOGS').value || "").toLowerCase().trim();
    filters.colPersona = (document.getElementById('colFilterPersona').value || "").toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.nom_rep || ''} ${r.cognoms_rep || ''} ${r.denom_social || ''} ${r.entitat || ''} ${r.carrec || ''} ${r.codi_sac || ''}`.toLowerCase();
        const matchesSearch = !filters.search || searchableText.includes(filters.search);
        const matchesColSac = !filters.colSac || String(r.codi_sac || "").toLowerCase().includes(filters.colSac);
        const matchesColCarrec = !filters.colCarrec || String(r.carrec || "").toLowerCase().includes(filters.colCarrec);
        const matchesColEntitat = !filters.colEntitat || String(r.entitat || "").toLowerCase().includes(filters.colEntitat);
        const matchesColOGS = !filters.colOGS || String(r.is_govern_superior || "").toLowerCase().includes(filters.colOGS);
        const personaText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.nom_rep || ''} ${r.cognoms_rep || ''} ${r.denom_social || ''}`.toLowerCase();
        const matchesColPersona = !filters.colPersona || personaText.includes(filters.colPersona);

        const valDept = r.sac_departament || r.departament || "Sense departament";
        const matchesDept = !filters.dept || valDept === filters.dept || r.part_dept_adscripcio === filters.dept;
        let matchesStatus = true;
        if (filters.status) {
            if (filters.status === 'No aplica') {
                matchesStatus = (r.status !== 'Validat' && r.status !== 'Pendent');
            } else {
                matchesStatus = (r.status === filters.status);
            }
        }
        const matchesNatureza = filters.naturezas.length === 0 || filters.naturezas.includes(r.part_natureza);
        const nomVal = r.tipus_nomenament && r.tipus_nomenament.trim() !== "" ? r.tipus_nomenament : "No informat";
        const matchesNomenament = filters.nomenaments.length === 0 || filters.nomenaments.includes(nomVal);
        const matchesCategoritzacio = filters.categoritzacions.length === 0 || (r.categoritzacio && filters.categoritzacions.includes(r.categoritzacio));
        const matchesSac = !filters.onlySac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesGovern = !filters.onlyGovern || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesVacant = !filters.onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");

        return matchesSearch && matchesColSac && matchesColCarrec && matchesColEntitat && matchesColOGS && matchesColPersona && 
               matchesDept && matchesStatus && matchesNatureza && matchesNomenament && matchesCategoritzacio && matchesSac && matchesGovern && matchesVacant;
    });

    const sortKey = sortConfig.key;
    const sortDir = sortConfig.direction === 'asc' ? 1 : -1;
    filteredRecords.sort((a, b) => {
        let valA = a[sortKey] || "";
        let valB = b[sortKey] || "";
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return -1 * sortDir;
        if (valA > valB) return 1 * sortDir;
        return 0;
    });

    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const countEl = document.getElementById('recordCount');
    if (!tbody) return;

    const dataToShow = filteredRecords.slice(0, rowsShown);
    countEl.textContent = `${filteredRecords.length} registres trobats (mostrant ${dataToShow.length})`;

    const grouped = groupData(dataToShow);
    let html = '';

    grouped.forEach(sg => {
        const sacRows = sg.rows;
        sg.carrecs.forEach((cg, cIdx) => {
            const carrecRows = cg.rows;
            const isFirstOfSAC = cIdx === 0;
            cg.entities.forEach((ent, eIdx) => {
                const entRows = ent.rows;
                const isFirstOfCarrec = eIdx === 0;
                ent.ogs.forEach((og, oIdx) => {
                    const ogRows = og.rows;
                    const isFirstOfEntitat = oIdx === 0;
                    og.persons.forEach((p, pIdx) => {
                        const isFirstOfOGS = pIdx === 0;

                        html += `<tr class="modular-row">`;
                        if (isFirstOfSAC) html += `<td rowspan="${sacRows}" class="td-sac"><span class="parent-sac-badge">${sg.sac || '---'}</span></td>`;
                        if (isFirstOfCarrec) {
                            const first = cg.entities[0].ogs[0].persons[0];
                            let sacHTML = first.sac_carrec ? `<div class="clickable-sac" style="margin-top:8px; cursor:pointer;" data-record-id="${first.id}"><div style="font-size:0.6rem; color:var(--primary); font-weight:700; display:flex; align-items:center; gap:4px;">(SAC:) <i data-lucide="info" style="width:10px; height:10px;"></i></div><div style="font-size:0.75rem; color:var(--text-main); line-height:1.2;">${first.sac_carrec.toLowerCase()}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${first.sac_unitat || ''}</div></div>` : '';
                            html += `<td rowspan="${carrecRows}" class="td-carrec"><div class="cell-main-title">${cg.name}</div>${sacHTML}</td>`;
                        }
                        if (isFirstOfEntitat) {
                            const firstP = ent.ogs[0].persons[0];
                            const isMercantil = (ent.natureza || "").toLowerCase().includes("mercantil");
                            let caBtn = '';
                            if (ent.reg && isMercantil) {
                                let btnClass = "btn-ca-blue";
                                if (firstP.data_final_de_vig_ncia) {
                                    const dFinal = parseDate(firstP.data_final_de_vig_ncia);
                                    if (dFinal) {
                                        const today = new Date();
                                        today.setHours(0,0,0,0);
                                        const diffDays = (dFinal - today) / (1000 * 60 * 60 * 24);
                                        if (diffDays < 0) btnClass = "btn-ca-red";
                                        else if (diffDays < 30) btnClass = "btn-ca-orange";
                                    }
                                }
                                caBtn = `<div style="margin-left:12px;"><button onclick="openConsellModal('${ent.reg || '-'}', '${ent.name.replace(/'/g, "\\'")}')" class="btn ${btnClass}" style="padding: 6px 12px; font-size: 0.7rem; font-weight: 800; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); white-space: nowrap;">CA</button></div>`;
                            }

                            html += `<td rowspan="${entRows}" class="td-entitat has-tooltip" 
                                        data-grau="${firstP.part_grau || '-'}" 
                                        data-via="${firstP.part_via || '-'}" 
                                        data-total="${firstP.part_total || '-'}" 
                                        data-mesura="${firstP.part_mesura || '-'}">
                                        <div style="display:flex; align-items:center; justify-content:space-between; height:100%;">
                                            <div style="flex:1;">
                                                <div class="cell-main-title">${ent.name}</div>
                                                <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">Reg: ${ent.reg || '-'}</div>
                                                <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px; font-style:italic; line-height:1.1;">${firstP.part_dept_adscripcio || ''}</div>
                                            </div>
                                            ${caBtn}
                                        </div>
                                     </td>`;
                        }
                        if (isFirstOfOGS) {
                            const deptText = p.departament ? `(${p.departament})` : '';
                            const displayOrg = p.sac_unitat ? `${p.sac_unitat} ${deptText}` : (p.departament || '');
                            const catHTML = p.categoritzacio ? `<div style="margin-top:2px; font-weight:700; color:var(--text-muted); font-size:0.6rem; text-transform:uppercase;">${p.categoritzacio}</div>` : '';
                            html += `<td rowspan="${ogRows}" class="td-organ">
                                        <div class="cell-main-title">${og.name}</div>
                                        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${displayOrg}</div>
                                        <div style="margin-top:8px; font-size:0.65rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${p.part_cip_o_organisme || ''}${catHTML}</div>
                                     </td>`;
                        }

                        let statusBadge = '';
                        if (p.status === 'Validat') statusBadge = '<span class="badge badge-validat">Validat</span>';
                        else if (p.status === 'Pendent') statusBadge = '<span class="badge badge-pendent">Pendent</span>';
                        else statusBadge = '<span class="badge badge-no-aplica">No aplica</span>';

                        const personaName = `${p.persona_nom || ''} ${p.persona_cognoms || ''}`.trim();
                        const repName = `${p.nom_rep || ''} ${p.cognoms_rep || ''}`.trim();
                        const qualif = (p.qualificador || "").toLowerCase();
                        
                        // Lògica de caducitat individual
                        const dFinalInd = parseDate(p.data_final_individual);
                        let expStyle = "";
                        let expText = "";
                        if (dFinalInd) {
                            const today = new Date(); today.setHours(0,0,0,0);
                            const diffDays = (dFinalInd - today) / (1000 * 60 * 60 * 24);
                            if (diffDays < 0) {
                                expStyle = "color: #ff6b6b; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#ff6b6b; margin-top:4px; font-weight:600;">Càrrec expirat el ${p.data_final_individual}</div>`;
                            } else if (diffDays < 30) {
                                expStyle = "color: #f59e0b; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#f59e0b; margin-top:4px; font-weight:600;">El càrrec expira el ${p.data_final_individual}</div>`;
                            }
                        }

                        let personaHTML = `<div class="cell-main-title" style="${expStyle}">${personaName || '---'}</div>`;
                        if (qualif.includes("jur") && p.denom_social) {
                            personaHTML = `<div class="cell-main-title" style="${expStyle}">${p.denom_social}</div><div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Rep: ${repName || '---'}</div>`;
                        } else if (qualif.includes("vacant")) {
                            personaHTML = `<div class="cell-main-title" style="color:var(--text-muted); font-style:italic;">Vacant</div>`;
                        }

                        html += `<td class="td-persona">
                                    <div style="display:flex; align-items:center; justify-content:space-between;">
                                        <div>${personaHTML}${expText}</div>
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            ${statusBadge}
                                            <button class="btn-edit" data-id="${p.id}"><i data-lucide="pencil" style="width:14px; height:14px;"></i></button>
                                        </div>
                                    </div>
                                 </td>`;
                        html += `</tr>`;
                    });
                });
            });
        });
    });

    tbody.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    setupTableInteractions();
}

function groupData(data) {
    const sacMap = new Map();
    data.forEach(r => {
        const sKey = r.codi_sac || '---';
        if (!sacMap.has(sKey)) sacMap.set(sKey, { sac: sKey, carrecs: new Map(), rows: 0 });
        const sGroup = sacMap.get(sKey);
        
        const cKey = r.carrec || '---';
        if (!sGroup.carrecs.has(cKey)) sGroup.carrecs.set(cKey, { name: cKey, entities: new Map(), rows: 0 });
        const cGroup = sGroup.carrecs.get(cKey);
        
        const eKey = r.entitat || '---';
        if (!cGroup.entities.has(eKey)) cGroup.entities.set(eKey, { name: eKey, reg: r.n_registre, natureza: r.part_natureza, ogs: new Map(), rows: 0 });
        const eGroup = cGroup.entities.get(eKey);
        
        const oKey = r.is_govern_superior || '---';
        if (!eGroup.ogs.has(oKey)) eGroup.ogs.set(oKey, { name: oKey, persons: [], rows: 0 });
        const oGroup = eGroup.ogs.get(oKey);
        
        oGroup.persons.push(r);
        oGroup.rows++;
        eGroup.rows++;
        cGroup.rows++;
        sGroup.rows++;
    });

    return Array.from(sacMap.values()).map(sg => ({
        ...sg,
        carrecs: Array.from(sg.carrecs.values()).map(cg => ({
            ...cg,
            entities: Array.from(cg.entities.values()).map(eg => ({
                ...eg,
                ogs: Array.from(eg.ogs.values())
            }))
        }))
    }));
}

function setupEventListeners() {
    document.getElementById('globalSearch').addEventListener('input', applyFilters);
    document.getElementById('filterDepartament').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('btnSync').addEventListener('click', () => handleSync());
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('loadMore').addEventListener('click', () => { rowsShown += 20; renderTable(); });
    
    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
    document.getElementById('btnOpenSyncModal').addEventListener('click', () => { document.getElementById('syncModal').style.display = 'flex'; });
    document.getElementById('btnCloseSyncModal').addEventListener('click', () => { document.getElementById('syncModal').style.display = 'none'; });
    document.getElementById('btnStartSync').addEventListener('click', () => {
        const csvText = document.getElementById('sacCsvInput').value;
        handleSync(csvText || null);
    });

    document.querySelectorAll('.column-filter').forEach(input => {
        input.addEventListener('input', applyFilters);
        input.addEventListener('click', (e) => e.stopPropagation());
    });

    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const key = header.dataset.sort;
            if (sortConfig.key === key) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.key = key;
                sortConfig.direction = 'asc';
            }
            document.querySelectorAll('.sortable-header').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
            header.classList.add(sortConfig.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            applyFilters();
        });
    });

    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const type = pill.dataset.type;
            const val = pill.dataset.value;
            pill.classList.toggle('active');
            
            let arr = [];
            if (type === 'natureza') arr = filters.naturezas;
            else if (type === 'nomenament') arr = filters.nomenaments;
            else if (type === 'categoritzacio') arr = filters.categoritzacions;
            
            const idx = arr.indexOf(val);
            if (idx > -1) arr.splice(idx, 1);
            else arr.push(val);
            
            applyFilters();
        });
    });

    document.getElementById('btnFilterSac').addEventListener('click', (e) => {
        filters.onlySac = !filters.onlySac;
        e.target.classList.toggle('active');
        applyFilters();
    });
    document.getElementById('btnFilterGovern').addEventListener('click', (e) => {
        filters.onlyGovern = !filters.onlyGovern;
        e.target.classList.toggle('active');
        applyFilters();
    });
    document.getElementById('btnFilterVacant').addEventListener('click', (e) => {
        filters.onlyVacant = !filters.onlyVacant;
        e.target.classList.toggle('active');
        applyFilters();
    });
}

function setupTableInteractions() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            const record = allRecords.find(r => r.id === id);
            if (record) openEditor(record);
        });
    });

    document.querySelectorAll('.clickable-sac').forEach(el => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            const record = allRecords.find(r => r.id === id);
            if (record) openEditor(record);
        });
    });

    const tooltip = document.getElementById('tooltip');
    document.querySelectorAll('.has-tooltip').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const rect = el.getBoundingClientRect();
            tooltip.innerHTML = `
                <div style="font-weight:700; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">Detalls de Participació</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:0.75rem;">
                    <div style="color:var(--text-muted);">Grau:</div><div style="font-weight:600;">${el.dataset.grau}</div>
                    <div style="color:var(--text-muted);">Via:</div><div style="font-weight:600;">${el.dataset.via}</div>
                    <div style="color:var(--text-muted);">Total:</div><div style="font-weight:600;">${el.dataset.total}</div>
                    <div style="color:var(--text-muted);">Mesura:</div><div style="font-weight:600;">${el.dataset.mesura}</div>
                </div>
            `;
            tooltip.style.display = 'block';
            tooltip.style.left = (rect.right + 10) + 'px';
            tooltip.style.top = rect.top + 'px';
        });
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
}

function openEditor(record) {
    const editor = document.getElementById('editorModal');
    const iframe = document.getElementById('editorIframe');
    if (editor && iframe) {
        iframe.src = `editor.html?id=${record.id}`;
        editor.style.display = 'flex';
    }
}

window.closeEditor = function() {
    document.getElementById('editorModal').style.display = 'none';
    document.getElementById('editorIframe').src = '';
};

window.onRecordUpdated = function(updatedRecord) {
    const idx = allRecords.findIndex(r => r.id === updatedRecord.id);
    if (idx > -1) {
        allRecords[idx] = updatedRecord;
        applyFilters();
    }
};

window.openConsellModal = function(reg, name) {
    BoardService.openModal(reg, name);
};

function populateDepartaments() {
    const select = document.getElementById('filterDepartament');
    const depts = new Set();
    allRecords.forEach(r => {
        const d = r.sac_departament || r.departament;
        if (d) depts.add(d);
        if (r.part_dept_adscripcio && r.part_dept_adscripcio !== "-") depts.add(r.part_dept_adscripcio);
    });
    const sorted = Array.from(depts).sort();
    let html = '<option value="">Tots els Departaments</option>';
    sorted.forEach(d => html += `<option value="${d}">${d}</option>`);
    select.innerHTML = html;
}

function populateNaturezas() {
    const container = document.getElementById('filterNatureza');
    const values = new Set();
    allRecords.forEach(r => { if (r.part_natureza && r.part_natureza !== "-") values.add(r.part_natureza); });
    const sorted = Array.from(values).sort();
    let html = '';
    sorted.forEach(v => html += `<div class="filter-pill" data-type="natureza" data-value="${v}">${v}</div>`);
    container.innerHTML = html;
}

function populateNomenaments() {
    const container = document.getElementById('filterNomenament');
    const values = new Set();
    allRecords.forEach(r => {
        const val = r.tipus_nomenament && r.tipus_nomenament.trim() !== "" ? r.tipus_nomenament : "No informat";
        values.add(val);
    });
    const sorted = Array.from(values).sort();
    let html = '';
    sorted.forEach(v => html += `<div class="filter-pill" data-type="nomenament" data-value="${v}">${v}</div>`);
    container.innerHTML = html;
}

function populateCategoritzacions() {
    const container = document.getElementById('filterCategoritzacio');
    const values = new Set();
    allRecords.forEach(r => { if (r.categoritzacio) values.add(r.categoritzacio); });
    const sorted = Array.from(values).sort();
    let html = '';
    sorted.forEach(v => html += `<div class="filter-pill" data-type="categoritzacio" data-value="${v}">${v}</div>`);
    container.innerHTML = html;
}

function exportToCSV() {
    if (filteredRecords.length === 0) return;
    const headers = ["SAC", "Departament (SAC)", "Unitat (SAC)", "Càrrec (SAC)", "Responsable (SAC)", "Entitat", "Càrrec", "Departament", "Membre", "Representant", "Participació", "Tipus Nomenament", "Status"];
    const rows = filteredRecords.map(r => {
        const personaName = `${r.persona_nom || ''} ${r.persona_cognoms || ''}`.trim();
        const repName = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim();
        const qualif = (r.qualificador || "").toLowerCase();
        
        let membre = personaName;
        let representant = "";
        
        if (qualif.includes("jur")) {
            membre = r.denom_social || "Persona Jurídica";
            representant = repName;
        } else if (qualif.includes("vacant")) {
            membre = "Vacant";
        }

        return [
            r.codi_sac, r.sac_departament, r.sac_unitat, r.sac_carrec, r.sac_nom_responsable,
            r.entitat, r.carrec, r.departament, membre, representant, r.part_total, r.tipus_nomenament, r.status
        ].map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(";");
    });

    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `export_auditoria_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
