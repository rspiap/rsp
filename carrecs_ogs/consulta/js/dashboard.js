/**
 * dashboard.js - Controlador 5 Nivells (SAC -> Càrrec -> Entitat -> OGS -> Persona)
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { CloudService } from './modules/cloud.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = 15;
let filters = { search: "", dept: "", status: "", nomenaments: [], onlySac: false, onlyGovern: false, onlyVacant: false };

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadInitialData();
});

async function loadInitialData() {
    try {
        let data = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (data && data.length > 0) {
            allRecords = data;
            populateDepartaments(); populateNomenaments(); applyFilters(); checkCloudUpdates();
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
        populateDepartaments(); populateNomenaments(); applyFilters();
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

    filteredRecords = allRecords.filter(r => {
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.entitat || ''} ${r.carrec || ''} ${r.codi_sac || ''}`.toLowerCase();
        const matchesSearch = !filters.search || searchableText.includes(filters.search);
        const valDept = r.sac_departament || r.departament || "Sense departament";
        const matchesDept = !filters.dept || valDept === filters.dept;
        let matchesStatus = true;
        if (filters.status) {
            if (filters.status === 'No aplica') {
                matchesStatus = (r.status !== 'Validat' && r.status !== 'Pendent');
            } else {
                matchesStatus = (r.status === filters.status);
            }
        }
        const matchesNomenament = filters.nomenaments.length === 0 || filters.nomenaments.includes(r.tipus_nomenament);
        const matchesSac = !filters.onlySac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesGovern = !filters.onlyGovern || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesVacant = !filters.onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");
        return matchesSearch && matchesDept && matchesStatus && matchesNomenament && matchesSac && matchesGovern && matchesVacant;
    });

    // Ordenar per SAC -> Càrrec -> Entitat -> OGS
    filteredRecords.sort((a, b) => {
        const sA = String(a.codi_sac || "ZZZZ");
        const sB = String(b.codi_sac || "ZZZZ");
        if (sA !== sB) return sA.localeCompare(sB);
        const cA = String(a.carrec || "");
        const cB = String(b.carrec || "");
        if (cA !== cB) return cA.localeCompare(cB);
        const eA = String(a.entitat || "");
        const eB = String(b.entitat || "");
        if (eA !== eB) return eA.localeCompare(eB);
        return String(a.is_govern_superior || "").localeCompare(String(b.is_govern_superior || ""));
    });

    rowsShown = 15;
    window.scrollTo(0, 0);
    renderTable();
}

function groupRecords5Levels(records) {
    const sacGroups = [];
    const sacMap = new Map();

    records.forEach((r, index) => {
        // REGLA: "El buit no agrupa". Cada valor buit és únic per definició.

        // 1. SAC Key
        const sValue = r.codi_sac;
        const sKey = sValue && sValue.trim() !== "" ? sValue : `EMPTY_SAC_${index}`;

        if (!sacMap.has(sKey)) {
            const sg = { sac: sValue || '', carrecGroups: [] };
            sacGroups.push(sg); sacMap.set(sKey, sg);
        }
        const sacGroup = sacMap.get(sKey);

        // 2. CÀRREC Key
        const cValue = r.carrec;
        const cKey = cValue && cValue.trim() !== "" ? `${cValue}|${r.sac_carrec || ''}|${r.sac_unitat || ''}` : `EMPTY_CARREC_${index}`;

        let cg = sacGroup.carrecGroups.find(c => c.id === cKey);
        if (!cg) {
            cg = { id: cKey, name: cValue || '', entities: [] };
            sacGroup.carrecGroups.push(cg);
        }

        // 3. ENTITAT Key
        const eValue = r.entitat;
        const eKey = eValue && eValue.trim() !== "" ? `${eValue}|${r.n_registre || ''}` : `EMPTY_ENT_${index}`;

        let eg = cg.entities.find(e => e.id === eKey);
        if (!eg) {
            eg = { id: eKey, name: eValue || '', reg: r.n_registre, ogs: [] };
            cg.entities.push(eg);
        }

        // 4. ÒRGAN Key
        const oValue = r.is_govern_superior;
        const oKey = oValue && oValue.trim() !== "" ? `${oValue}|${r.departament || ''}|${r.part_cip_o_organisme || ''}` : `EMPTY_OGS_${index}`;

        let og = eg.ogs.find(o => o.id === oKey);
        if (!og) {
            og = { id: oKey, name: oValue || '', type: r.membre_tipus, persons: [] };
            eg.ogs.push(og);
        }
        og.persons.push(r);
    });
    return sacGroups;
}

function renderTable(append = false) {
    const tbody = document.getElementById('tableBody');
    if (!append) tbody.innerHTML = '';

    const tree = groupRecords5Levels(filteredRecords);
    const slice = tree.slice(append ? tbody.children.length : 0, rowsShown);

    if (slice.length === 0 && !append) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 3rem;">No s\'han trobat resultats</td></tr>';
        return;
    }

    slice.forEach(sg => {
        const tr = document.createElement('tr');
        tr.className = 'modular-row';

        let html = `<td class="level-1"><span class="parent-sac-badge">${sg.sac || '---'}</span></td>`;
        html += `<td colspan="4" style="padding:0;"><div class="level-2-container" style="height:100%; display:flex; flex-direction:column;">`;

        sg.carrecGroups.forEach(cg => {
            const first = cg.entities[0].ogs[0].persons[0];
            let sacHTML = '';
            if (first.sac_carrec) {
                sacHTML = `<div style="margin-top:8px;"><div style="font-size:0.6rem; color:var(--primary); font-weight:700;">(SAC:)</div><div style="font-size:0.75rem; color:#fff; opacity:0.9; line-height:1.2;">${first.sac_carrec.toLowerCase()}</div><div style="font-size:0.65rem; color:var(--text-muted); opacity:0.7; margin-top:2px;">${first.sac_unitat || ''} | ${first.sac_departament || ''}</div></div>`;
            }

            html += `<div class="level-2-row" style="flex:1; display:flex;"><div class="level-2-cell"><div class="carrec-text" style="font-weight:700;">${cg.name}</div>${sacHTML}</div>`;
            html += `<div class="level-3-container" style="flex:1; display:flex; flex-direction:column;">`;

            cg.entities.forEach(ent => {
                html += `<div class="level-3-row" style="flex:1; display:flex;"><div class="level-3-cell"><div style="font-weight:700; font-size:0.85rem; color:#fff;">${ent.name}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">Reg: ${ent.reg || '-'}</div></div>`;
                html += `<div class="level-4-container" style="flex:1; display:flex; flex-direction:column;">`;

                ent.ogs.forEach(og => {
                    const p = og.persons[0];
                    const deptText = p.departament ? `(${p.departament})` : '';
                    const displayOrg = p.sac_unitat ? `${p.sac_unitat} ${deptText}` : (p.departament || '');
                    html += `<div class="level-4-row" style="flex:1; display:flex;"><div class="level-4-cell"><div style="font-weight:600; font-size:0.85rem; color:var(--text-main);">${og.name}</div><div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${displayOrg}</div><div style="margin-top:8px; font-size:0.65rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${p.part_cip_o_organisme || ''}</div></div>`;
                    html += `<div class="level-5-container" style="flex:1; display:flex; flex-direction:column;">`;

                    og.persons.forEach(p => {
                        let statusBadge = '';
                        if (p.status === 'Validat') statusBadge = '<span class="badge badge-validat">Validat</span>';
                        else if (p.status === 'Pendent') statusBadge = '<span class="badge badge-pendent">Pendent</span>';
                        else statusBadge = '<span class="badge badge-no-aplica">No aplica</span>';
                        let personaFisica = `${p.persona_nom || ''} ${p.persona_cognoms || ''}`.trim();
                        let repNom = `${p.nom_rep || ''} ${p.cognoms_rep || ''}`.trim();
                        let entitatJuridica = p.denom_social || "";
                        
                        // Lògica Persona Jurídica (Amb els camps confirmats)
                        const isJuridica = (p.qualificador || "").toLowerCase().includes("jur") || (p.membre_tipus || "").toLowerCase().includes("jur");
                        
                        let nomHTML = "";
                        if (isJuridica) {
                            // Si és jurídica, el representant és el principal i l'entitat va a sota
                            const nomPrincipal = repNom || personaFisica || "Representant pendent";
                            const nomEntitat = entitatJuridica || "Entitat Jurídica";
                            
                            nomHTML = `<div style="font-size:0.95rem; font-weight:700; color:#fff;">${nomPrincipal}</div>
                                       <div style="font-size:0.75rem; color:#5c7cfa; font-weight:500; margin-top:3px;">Representant de ${nomEntitat}</div>`;
                        } else if ((p.qualificador || "").toLowerCase().includes("vacant")) {
                            nomHTML = `<div style="color:var(--text-muted); font-style:italic; opacity:0.7;">(Vacant)</div>`;
                        } else {
                            nomHTML = `<div style="font-size:0.95rem; font-weight:700; color:#fff;">${personaFisica || 'Sense nom'}</div>`;
                        }
                        
                        let sacInfoHTML = '';
                        if (p.codi_sac && p.sac_nom_responsable && p.status !== 'Validat') {
                            sacInfoHTML = `<div style="margin-top: 8px; padding: 6px 10px; background: rgba(255, 107, 107, 0.05); border-radius: 6px; border-left: 2px solid #ff6b6b;"><div style="font-size: 0.55rem; text-transform: uppercase; color: #ff6b6b; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 2px;">Ref. SAC:</div><div style="font-size: 0.85rem; color: #ff9e9e; font-weight: 600;">${p.sac_nom_responsable}</div></div>`;
                        }
                        html += `<div class="level-5-row" style="flex:1; display:flex;"><div class="level-5-cell"><div style="font-size:0.9rem; font-weight:600;">${nomHTML}</div><div style="font-size:0.7rem; color:var(--text-muted); font-style:italic; margin-top:2px;">${p.tipus_nomenament || ''}</div>${sacInfoHTML}</div><div class="level-5-cell" style="width:100px; text-align:center; flex:none;">${statusBadge}</div><div class="level-5-cell" style="width:45px; text-align:center; flex:none;"><button class="btn-quick-edit" onclick="openQuickEdit('${p.id}')"><i data-lucide="pencil" style="width:14px;"></i></button></div></div>`;
                    });
                    html += `</div></div>`;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
        });
        html += `</div></td>`;
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}


/** Funcions d'Exportació i UI */
function exportToCSV() {
    if (filteredRecords.length === 0) return;
    const headers = ["Codi SAC", "Persona Nom", "Persona Cognoms", "Carrec", "Departament", "Entitat", "N. Registre", "Òrgan Govern Superior", "Tipus Membre", "Particip/Organisme", "Tipus Nomenament", "Estat", "Qualificador"];
    let csvContent = "\ufeff" + headers.join(";") + "\n";
    filteredRecords.forEach(r => {
        const row = [r.codi_sac || "", r.persona_nom || "", r.persona_cognoms || "", r.carrec || "", r.sac_departament || r.departament || "", r.entitat || "", r.n_registre || "", r.is_govern_superior || "", r.membre_tipus || "", r.part_cip_o_organisme || "", r.tipus_nomenament || "", r.status || "", r.qualificador || ""];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
}

function setupEventListeners() {
    console.log("Configurant esdeveniments...");

    const safeAddListener = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, fn);
        else console.warn(`Element no trobat: ${id}`);
    };

    safeAddListener('globalSearch', 'input', applyFilters);
    safeAddListener('filterDepartament', 'change', applyFilters);
    safeAddListener('filterStatus', 'change', applyFilters);

    safeAddListener('btnResetFilters', 'click', () => {
        document.getElementById('globalSearch').value = "";
        document.getElementById('filterDepartament').value = "";
        document.getElementById('filterStatus').value = "";
        ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('btn-primary');
        });
        filters = { search: "", dept: "", status: "", nomenaments: [], onlySac: false, onlyGovern: false, onlyVacant: false };
        populateNomenaments(); applyFilters();
    });

    safeAddListener('btnExportCSV', 'click', exportToCSV);

    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        console.log("Botó Actualitzar trobat i vinculat.");
        btnSync.addEventListener('click', () => {
            console.log("Clic detectat a Actualitzar Dades");
            handleSync();
        });
    }
    ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
            const key = id.replace('toggle', 'only');
            filters[key.charAt(0).toLowerCase() + key.slice(1)] = !filters[key.charAt(0).toLowerCase() + key.slice(1)];
            e.currentTarget.classList.toggle('btn-primary'); applyFilters();
        });
    });
    const btnNom = document.getElementById('btnNomenaments');
    const dropdownNom = document.getElementById('dropdownNomenaments');
    if (btnNom && dropdownNom) {
        btnNom.addEventListener('click', (e) => { e.stopPropagation(); dropdownNom.classList.toggle('active'); });
        document.addEventListener('click', (e) => { if (!dropdownNom.contains(e.target)) dropdownNom.classList.remove('active'); });
    }
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) / document.documentElement.scrollHeight > 0.85 && rowsShown < filteredRecords.length) {
            rowsShown += 10; renderTable(true);
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
            window.closeQuickEdit(); applyFilters();
        });
    }
}

function populateDepartaments() {
    const deptsSet = new Set();
    allRecords.forEach(r => deptsSet.add(r.sac_departament || r.departament || "Sense departament"));
    const select = document.getElementById('filterDepartament');
    if (!select) return;
    select.innerHTML = '<option value="">Tots els departaments</option>';
    Array.from(deptsSet).sort().forEach(d => { const opt = document.createElement('option'); opt.value = d; opt.textContent = d; select.appendChild(opt); });
}

function populateNomenaments() {
    const list = document.getElementById('listNomenaments'); if (!list) return;
    const types = [...new Set(allRecords.map(r => r.tipus_nomenament))].filter(Boolean).sort();
    list.innerHTML = '';
    types.forEach(type => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        item.innerHTML = `<input type="checkbox" value="${type}"><span>${type}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) filters.nomenaments.push(type);
            else filters.nomenaments = filters.nomenaments.filter(v => v !== type);
            updateNomenamentsUI(); applyFilters();
        });
        list.appendChild(item);
    });
}

function updateNomenamentsUI() {
    const btn = document.getElementById('btnNomenaments'); if (!btn) return;
    btn.innerHTML = `<i data-lucide="list-checks" style="width: 16px; margin-right: 4px;"></i> ${filters.nomenaments.length ? `(${filters.nomenaments.length}) Nomenaments` : 'Tipus Nomenament'}`;
    btn.classList.toggle('btn-primary', filters.nomenaments.length > 0);
}

window.openQuickEdit = (id) => {
    const record = allRecords.find(r => r.id == id); if (!record) return;
    document.getElementById('editFieldEntitat').value = record.entitat;
    document.getElementById('editFieldMembre').value = record.membre_tipus;
    document.getElementById('editFieldCarrec').value = record.carrec;
    document.getElementById('editFieldCodi').value = record.codi_sac;
    document.getElementById('editMappingIndex').value = record.id;
    document.getElementById('editMappingModal').style.display = 'flex';
};

window.closeQuickEdit = () => document.getElementById('editMappingModal').style.display = 'none';
