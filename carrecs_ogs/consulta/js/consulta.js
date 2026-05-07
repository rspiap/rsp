/**
 * consulta.js - Controlador 5 Nivells (Versió Consulta)
 * Versió: Taula Nativa amb rowspan per a alineació perfecta.
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { BoardService } from './modules/board-of-directors.js';
import { initTheme, toggleTheme } from './modules/utils.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = 15;
let filters = { 
    search: "", dept: "", status: "", nomenaments: [], categoritzacions: [], 
    onlySac: false, onlyGovern: false, onlyVacant: false,
    colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "" 
};
let sortConfig = { key: 'codi_sac', direction: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupEventListeners();
    await loadData();
});

async function loadData() {
    try {
        await db.init();
        allRecords = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (allRecords.length > 0) {
            applyFilters(); populateDepartaments(); populateNomenaments(); populateCategoritzacions();
        } else { handleSync(); }
    } catch (e) { console.error(e); }
}

async function handleSync() {
    const btn = document.getElementById('btnSync');
    const modal = document.getElementById('syncModal');
    try {
        if (btn) btn.disabled = true;
        modal.style.display = 'flex';
        allRecords = await syncEngine.runFullSync(null, (info) => {
            const stepText = document.getElementById('syncStep');
            const progressBar = document.getElementById('syncProgressBar');
            if (stepText) stepText.textContent = info.step;
            if (progressBar) progressBar.style.width = `${info.progress}%`;
        });
        applyFilters(); populateDepartaments(); populateNomenaments();
        setTimeout(() => { if (modal) modal.style.display = 'none'; if (btn) btn.disabled = false; }, 400);
    } catch (e) { if (btn) btn.disabled = false; }
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
        const nomVal = r.tipus_nomenament && r.tipus_nomenament.trim() !== "" ? r.tipus_nomenament : "No informat";
        const matchesNomenament = filters.nomenaments.length === 0 || filters.nomenaments.includes(nomVal);
        const matchesCategoritzacio = filters.categoritzacions.length === 0 || (r.categoritzacio && filters.categoritzacions.includes(r.categoritzacio));
        const matchesSac = !filters.onlySac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesGovern = !filters.onlyGovern || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesVacant = !filters.onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");

        return matchesSearch && matchesColSac && matchesColCarrec && matchesColEntitat && matchesColOGS && matchesColPersona && 
               matchesDept && matchesStatus && matchesNomenament && matchesCategoritzacio && matchesSac && matchesGovern && matchesVacant;
    });

    const updateIcon = (id, val) => {
        const icon = document.getElementById('iconFilter' + id);
        if (icon) {
            if (val && val.trim() !== "") icon.classList.add('active');
            else icon.classList.remove('active');
        }
    };
    updateIcon('SAC', filters.colSac);
    updateIcon('Carrec', filters.colCarrec);
    updateIcon('Entitat', filters.colEntitat);
    updateIcon('OGS', filters.colOGS);
    updateIcon('Persona', filters.colPersona);

    filteredRecords.sort((a, b) => {
        // 1. Prioritat absoluta: Registres amb codi_sac a dalt
        const hasSacA = (a.codi_sac && a.codi_sac.trim() !== "") ? 1 : 0;
        const hasSacB = (b.codi_sac && b.codi_sac.trim() !== "") ? 1 : 0;
        if (hasSacA !== hasSacB) return hasSacB - hasSacA;

        // 2. Ordenació secundària segons sortConfig
        let valA = a[sortConfig.key] || "";
        let valB = b[sortConfig.key] || "";

        if (sortConfig.key === 'codi_sac') {
            const nA = parseFloat(valA) || 0;
            const nB = parseFloat(valB) || 0;
            if (nA !== nB) return sortConfig.direction === 'asc' ? nA - nB : nB - nA;
        }

        if (sortConfig.key === 'persona_nom') {
            valA = `${a.persona_nom || ''} ${a.persona_cognoms || ''}`.trim();
            valB = `${b.persona_nom || ''} ${b.persona_cognoms || ''}`.trim();
        }
        const sA = String(valA).toLowerCase();
        const sB = String(valB).toLowerCase();
        if (sA === sB) {
            const nA = parseFloat(a.codi_sac) || 0;
            const nB = parseFloat(b.codi_sac) || 0;
            return nA - nB;
        }
        return sortConfig.direction === 'asc' ? sA.localeCompare(sB) : sB.localeCompare(sA);
    });

    rowsShown = 15;
    const countEl = document.getElementById('recordCount');
    if (countEl) countEl.textContent = `${filteredRecords.length} registres trobats`;
    window.scrollTo(0, 0);
    renderTable();
}

function groupRecords5Levels(records) {
    const sacGroups = [];
    const sacMap = new Map();
    records.forEach((r, index) => {
        const sValue = r.codi_sac;
        const sKey = sValue && sValue.trim() !== "" ? sValue : `EMPTY_SAC_${index}`;
        if (!sacMap.has(sKey)) { const sg = { sac: sValue || '', carrecGroups: [] }; sacGroups.push(sg); sacMap.set(sKey, sg); }
        const sacGroup = sacMap.get(sKey);
        const cValue = r.carrec;
        const cKey = cValue && cValue.trim() !== "" ? `${cValue}|${r.sac_carrec || ''}|${r.sac_unitat || ''}` : `EMPTY_CARREC_${index}`;
        let cg = sacGroup.carrecGroups.find(c => c.id === cKey);
        if (!cg) { cg = { id: cKey, name: cValue || '', entities: [] }; sacGroup.carrecGroups.push(cg); }
        const eValue = r.entitat;
        const eKey = eValue && eValue.trim() !== "" ? `${eValue}|${r.n_registre || ''}` : `EMPTY_ENT_${index}`;
        let eg = cg.entities.find(e => e.id === eKey);
        if (!eg) { eg = { id: eKey, name: eValue || '', reg: r.n_registre, natureza: r.part_natureza, ogs: [] }; cg.entities.push(eg); }
        const oValue = r.is_govern_superior;
        const oKey = oValue && oValue.trim() !== "" ? `${oValue}|${r.departament || ''}|${r.part_cip_o_organisme || ''}` : `EMPTY_OGS_${index}`;
        let og = eg.ogs.find(o => o.id === oKey);
        if (!og) { og = { id: oKey, name: oValue || '', type: r.membre_tipus, persons: [] }; eg.ogs.push(og); }
        og.persons.push(r);
    });
    return sacGroups;
}

function renderTable(append = false) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    const tree = groupRecords5Levels(filteredRecords);
    const slice = tree.slice(append ? tbody.children.length : 0, rowsShown);

    if (slice.length === 0 && !append) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem; color:var(--text-muted);">No s\'han trobat resultats</td></tr>';
        return;
    }

    let html = '';
    slice.forEach(sg => {
        let sacRows = 0;
        sg.carrecGroups.forEach(cg => {
            cg.entities.forEach(ent => {
                ent.ogs.forEach(og => { sacRows += og.persons.length; });
            });
        });

        sg.carrecGroups.forEach((cg, cgIdx) => {
            let carrecRows = 0;
            cg.entities.forEach(ent => {
                ent.ogs.forEach(og => { carrecRows += og.persons.length; });
            });

            cg.entities.forEach((ent, entIdx) => {
                let entRows = 0;
                ent.ogs.forEach(og => { entRows += og.persons.length; });

                ent.ogs.forEach((og, ogIdx) => {
                    const ogRows = og.persons.length;
                    og.persons.forEach((p, pIdx) => {
                        const isFirstOfSAC = cgIdx === 0 && entIdx === 0 && ogIdx === 0 && pIdx === 0;
                        const isFirstOfCarrec = entIdx === 0 && ogIdx === 0 && pIdx === 0;
                        const isFirstOfEntitat = ogIdx === 0 && pIdx === 0;
                        const isFirstOfOGS = pIdx === 0;

                        html += `<tr class="modular-row">`;
                        if (isFirstOfSAC) html += `<td rowspan="${sacRows}" class="td-sac"><span class="parent-sac-badge">${sg.sac || '---'}</span></td>`;
                        if (isFirstOfCarrec) {
                            const first = cg.entities[0].ogs[0].persons[0];
                            let sacHTML = first.sac_carrec ? `<div style="margin-top:8px;"><div style="font-size:0.6rem; color:var(--primary); font-weight:700;">(SAC:)</div><div style="font-size:0.75rem; color:var(--text-main); line-height:1.2;">${first.sac_carrec.toLowerCase()}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${first.sac_unitat || ''}</div></div>` : '';
                            html += `<td rowspan="${carrecRows}" class="td-carrec"><div class="cell-main-title">${cg.name}</div>${sacHTML}</td>`;
                        }
                        if (isFirstOfEntitat) {
                            const firstP = ent.ogs[0].persons[0];
                            const isMercantil = (ent.natureza || "").toLowerCase().includes("mercantil");
                            const caBtn = (ent.reg && isMercantil) ? `<div style="margin-left:12px;"><button onclick="openConsellModal('${ent.reg || '-'}', '${ent.name.replace(/'/g, "\\'")}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.7rem; font-weight: 800; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); white-space: nowrap;">CA</button></div>` : '';

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

                        const isJuridica = (p.qualificador || "").toLowerCase().includes("jur") || (p.membre_tipus || "").toLowerCase().includes("jur");
                        let nomHTML = "";
                        if (isJuridica) {
                            let repNomComplet = `${p.nom_rep || ''} ${p.cognoms_rep || ''}`.trim();
                            const nomPrincipal = repNomComplet || p.persona_nom || "Representant pendent";
                            nomHTML = `<div class="persona-nom">${nomPrincipal}</div><div class="persona-rep-info">Representant de ${p.denom_social || "Entitat Jurídica"}</div>`;
                        } else if ((p.qualificador || "").toLowerCase().includes("vacant")) {
                            nomHTML = `<div style="color:var(--text-muted); font-style:italic;">(Vacant)</div>`;
                        } else {
                            nomHTML = `<div class="persona-nom">${p.persona_nom || ''} ${p.persona_cognoms || ''}</div>`;
                        }
                        let sacInfoHTML = (p.codi_sac && p.sac_nom_responsable && p.status !== 'Validat') ? `<div class="sac-ref-box"><div style="font-size: 0.55rem; text-transform: uppercase; color: #ff6b6b; font-weight: 700;">Ref. SAC:</div><div style="font-weight: 600; color: #ff6b6b;">${p.sac_nom_responsable}</div></div>` : '';

                        html += `<td class="td-persona">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                        <div>${nomHTML}<div class="persona-sub">${p.tipus_nomenament || ''}</div>${sacInfoHTML}</div>
                                        <div style="text-align:right;">
                                            <div>${statusBadge}</div>
                                        </div>
                                    </div>
                                 </td>`;

                        html += `</tr>`;
                    });
                });
            });
        });
    });

    if (append) {
        const temp = document.createElement('tbody');
        temp.innerHTML = html;
        while (temp.firstChild) tbody.appendChild(temp.firstChild);
    } else {
        tbody.innerHTML = html;
    }
    if (window.lucide) window.lucide.createIcons();
}

function setupEventListeners() {
    const safeAddListener = (id, event, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(event, fn); };
    safeAddListener('globalSearch', 'input', applyFilters);
    safeAddListener('colFilterSAC', 'input', applyFilters);
    safeAddListener('colFilterCarrec', 'input', applyFilters);
    safeAddListener('colFilterEntitat', 'input', applyFilters);
    safeAddListener('colFilterOGS', 'input', applyFilters);
    safeAddListener('colFilterPersona', 'input', applyFilters);
    safeAddListener('themeToggle', 'click', toggleTheme);
    safeAddListener('filterDepartament', 'change', applyFilters);
    safeAddListener('filterStatus', 'change', applyFilters);
    safeAddListener('btnResetFilters', 'click', () => {
        ['globalSearch', 'colFilterSAC', 'colFilterCarrec', 'colFilterEntitat', 'colFilterOGS', 'colFilterPersona', 'filterDepartament', 'filterStatus'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = "";
        });
        ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
            const el = document.getElementById(id); if (el) el.classList.remove('btn-primary');
        });
        filters = { search: "", dept: "", status: "", nomenaments: [], categoritzacions: [], onlySac: false, onlyGovern: false, onlyVacant: false, colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "" };
        populateNomenaments(); populateCategoritzacions(); updateNomenamentsUI(); updateCategoritzacionsUI(); applyFilters();
    });

    const setupMultiselect = (btnId, dropdownId) => {
        const btn = document.getElementById(btnId); const dropdown = document.getElementById(dropdownId);
        if (btn && dropdown) btn.addEventListener('click', (e) => { e.stopPropagation(); const wasActive = dropdown.classList.contains('active'); document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('active')); if (!wasActive) dropdown.classList.add('active'); });
    };
    setupMultiselect('btnNomenaments', 'dropdownNomenaments');
    setupMultiselect('btnCategoritzacions', 'dropdownCategoritzacions');
    document.addEventListener('click', (e) => { document.querySelectorAll('.multiselect-dropdown').forEach(d => { if (!d.contains(e.target)) d.classList.remove('active'); }); });
    safeAddListener('btnExportCSV', 'click', exportToCSV);
    const btnSync = document.getElementById('btnSync'); if (btnSync) btnSync.addEventListener('click', () => handleSync());

    document.querySelectorAll('.sortable-header').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            else { sortConfig.key = key; sortConfig.direction = 'asc'; }
            document.querySelectorAll('.sortable-header').forEach(h => {
                h.classList.remove('active'); const icon = h.querySelector('.sort-icon');
                if (icon) icon.style.transform = 'rotate(0deg)';
            });
            th.classList.add('active'); const icon = th.querySelector('.sort-icon');
            if (icon) icon.style.transform = sortConfig.direction === 'desc' ? 'rotate(180deg)' : 'rotate(0deg)';
            applyFilters();
        });
    });

    ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => {
            const key = id.replace('toggle', 'only');
            const filterKey = key.charAt(0).toLowerCase() + key.slice(1);
            filters[filterKey] = !filters[filterKey];
            e.currentTarget.classList.toggle('btn-primary');
            applyFilters();
        });
    });
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) / document.documentElement.scrollHeight > 0.85 && rowsShown < filteredRecords.length) {
            rowsShown += 10; renderTable(true);
        }
    });
}

function populateDepartaments() {
    const sacSet = new Set(); const entSet = new Set(); const carSet = new Set();
    allRecords.forEach(r => {
        if (r.sac_departament && r.sac_departament.trim() !== "") sacSet.add(r.sac_departament.trim());
        if (r.part_dept_adscripcio && r.part_dept_adscripcio !== "-" && r.part_dept_adscripcio.trim() !== "") entSet.add(r.part_dept_adscripcio.trim());
        if (r.departament && r.departament.trim() !== "") carSet.add(r.departament.trim());
    });
    const select = document.getElementById('filterDepartament'); if (!select) return;
    let html = '<option value="">Tots els departaments</option>';
    if (sacSet.size > 0) { html += '<optgroup label="SAC">'; Array.from(sacSet).sort().forEach(d => html += `<option value="${d}">${d}</option>`); html += '</optgroup>'; }
    if (entSet.size > 0) { html += '<optgroup label="Entitats">'; Array.from(entSet).sort().forEach(d => html += `<option value="${d}">${d}</option>`); html += '</optgroup>'; }
    if (carSet.size > 0) { html += '<optgroup label="Càrrecs">'; Array.from(carSet).sort().forEach(d => html += `<option value="${d}">${d}</option>`); html += '</optgroup>'; }
    select.innerHTML = html;
}

function populateNomenaments() {
    const list = document.getElementById('listNomenaments'); if (!list) return;
    const types = [...new Set(allRecords.map(r => r.tipus_nomenament && r.tipus_nomenament.trim() !== "" ? r.tipus_nomenament : "No informat"))].sort((a, b) => a === "No informat" ? 1 : b === "No informat" ? -1 : a.localeCompare(b));
    list.innerHTML = '';
    types.forEach(type => {
        const item = document.createElement('label'); item.className = 'multiselect-item'; item.innerHTML = `<input type="checkbox" value="${type}"><span>${type}</span>`;
        item.querySelector('input').addEventListener('change', (e) => { if (e.target.checked) filters.nomenaments.push(type); else filters.nomenaments = filters.nomenaments.filter(v => v !== type); updateNomenamentsUI(); applyFilters(); });
        list.appendChild(item);
    });
}
function updateNomenamentsUI() {
    const btn = document.getElementById('btnNomenaments'); if (!btn) return;
    btn.innerHTML = `<i data-lucide="list-checks" style="width: 16px; margin-right: 4px;"></i> ${filters.nomenaments.length ? `(${filters.nomenaments.length}) Tipus` : 'Tipus Nomenament'}`;
    btn.classList.toggle('btn-primary', filters.nomenaments.length > 0);
    if (window.lucide) lucide.createIcons();
}
function populateCategoritzacions() {
    const list = document.getElementById('listCategoritzacions'); if (!list) return;
    const cats = [...new Set(allRecords.map(r => r.categoritzacio))].filter(Boolean).sort();
    list.innerHTML = '';
    cats.forEach(cat => {
        const item = document.createElement('label'); item.className = 'multiselect-item'; item.innerHTML = `<input type="checkbox" value="${cat}"><span>${cat}</span>`;
        item.querySelector('input').addEventListener('change', (e) => { if (e.target.checked) filters.categoritzacions.push(cat); else filters.categoritzacions = filters.categoritzacions.filter(v => v !== cat); updateCategoritzacionsUI(); applyFilters(); });
        list.appendChild(item);
    });
}
function updateCategoritzacionsUI() {
    const btn = document.getElementById('btnCategoritzacions'); if (!btn) return;
    btn.innerHTML = `<i data-lucide="layers" style="width: 16px; margin-right: 4px;"></i> ${filters.categoritzacions.length ? `(${filters.categoritzacions.length})` : 'Categorització'}`;
    btn.classList.toggle('btn-primary', filters.categoritzacions.length > 0);
    if (window.lucide) lucide.createIcons();
}
function exportToCSV() {
    if (filteredRecords.length === 0) return;
    const headers = ["Codi SAC", "Membre", "Representant", "Carrec", "Departament", "Entitat", "N. Registre", "Òrgan Govern Superior", "Tipus Membre", "Particip/Organisme", "Tipus Nomenament", "Estat", "Qualificador"];
    let csvContent = "\ufeff" + headers.join(";") + "\n";
    filteredRecords.forEach(r => {
        const isJuridica = (r.qualificador || "").toLowerCase().includes("jur") || (r.membre_tipus || "").toLowerCase().includes("jur");
        
        const membre = isJuridica ? (r.denom_social || "") : `${r.persona_nom || ''} ${r.persona_cognoms || ''}`.trim();
        const representant = isJuridica ? `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim() : "";
        
        const row = [
            r.codi_sac || "", 
            membre, 
            representant,
            r.carrec || "", 
            r.sac_departament || r.departament || "", 
            r.entitat || "", 
            r.n_registre || "", 
            r.is_govern_superior || "", 
            r.membre_tipus || "", 
            r.part_cip_o_organisme || "", 
            r.tipus_nomenament || "", 
            r.status || "", 
            r.qualificador || ""
        ];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
}

const tooltip = document.getElementById('global-tooltip');
document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.has-tooltip');
    if (target && tooltip) {
        const { grau, via, total, mesura } = target.dataset;
        tooltip.innerHTML = `<div class="tooltip-row"><span class="tooltip-label">Grau:</span><span class="tooltip-value">${grau}</span></div><div class="tooltip-row"><span class="tooltip-label">Via:</span><span class="tooltip-value">${via}</span></div><div class="tooltip-row"><span class="tooltip-label">Participació GC:</span><span class="tooltip-value">${total}%</span></div><div class="tooltip-row"><span class="tooltip-label">Mesura:</span><span class="tooltip-value">${mesura}</span></div>`;
        tooltip.style.visibility = 'visible'; tooltip.style.opacity = '1';
    }
});
document.addEventListener('mousemove', (e) => { if (tooltip && tooltip.style.visibility === 'visible') { const offset = 15; let x = e.clientX + offset; if (x + 340 > window.innerWidth) x = e.clientX - 340 - offset; tooltip.style.left = x + 'px'; tooltip.style.top = (e.clientY + offset) + 'px'; } });
document.addEventListener('mouseout', (e) => { if (e.target.closest('.has-tooltip') && tooltip) { tooltip.style.visibility = 'hidden'; tooltip.style.opacity = '0'; } });
