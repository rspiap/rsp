/**
 * consulta.js - Controlador 5 Nivells (Versió Consulta)
 * Versió: Taula Nativa amb rowspan per a alineació perfecta.
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
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
    await loadData();
});

async function loadData() {
    try {
        await db.init();
        allRecords = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (allRecords.length > 0) {
            applyFilters(); populateDepartaments(); populateNaturezas(); populateNomenaments(); populateCategoritzacions();
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
        applyFilters(); populateDepartaments(); populateNaturezas(); populateNomenaments();
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

                        const isJuridica = (p.qualificador || "").toLowerCase().includes("jur") || (p.membre_tipus || "").toLowerCase().includes("jur");
                        
                        // Lògica de caducitat individual
                        const dFinalInd = parseDate(p.data_final_individual);
                        let expStyle = "";
                        let expText = "";
                        if (dFinalInd) {
                            const today = new Date(); today.setHours(0,0,0,0);
                            const diffDays = (dFinalInd - today) / (1000 * 60 * 60 * 24);
                            if (diffDays < 0) {
                                expStyle = "color: #ff6b6b !important; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#ff6b6b; margin-top:4px; font-weight:600;">Càrrec expirat el ${p.data_final_individual}</div>`;
                            } else if (diffDays < 30) {
                                expStyle = "color: #f59e0b !important; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#f59e0b; margin-top:4px; font-weight:600;">El càrrec expira el ${p.data_final_individual}</div>`;
                            }
                        }

                        let nomHTML = "";
                        if (isJuridica) {
                            let repNomComplet = `${p.nom_rep || ''} ${p.cognoms_rep || ''}`.trim();
                            const nomPrincipal = repNomComplet || p.persona_nom || "Representant pendent";
                            nomHTML = `<div class="persona-nom" style="${expStyle}">${nomPrincipal}</div><div class="persona-rep-info">Representant de ${p.denom_social || "Entitat Jurídica"}</div>`;
                        } else if ((p.qualificador || "").toLowerCase().includes("vacant")) {
                            nomHTML = `<div style="color:var(--text-muted); font-style:italic;">(Vacant)</div>`;
                        } else {
                            nomHTML = `<div class="persona-nom" style="${expStyle}">${p.persona_nom || ''} ${p.persona_cognoms || ''}</div>`;
                        }
                        let sacInfoHTML = (p.codi_sac && p.sac_nom_responsable && p.status !== 'Validat') ? `<div class="sac-ref-box"><div style="font-size: 0.55rem; text-transform: uppercase; color: #ff6b6b; font-weight: 700;">Ref. SAC:</div><div style="font-weight: 600; color: #ff6b6b;">${p.sac_nom_responsable}</div></div>` : '';

                        html += `<td class="td-persona">
                                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                        <div>${nomHTML}${expText}<div class="persona-sub">${p.tipus_nomenament || ''}</div>${sacInfoHTML}</div>
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
        filters = { search: "", dept: "", status: "", naturezas: [], nomenaments: [], categoritzacions: [], onlySac: false, onlyGovern: false, onlyVacant: false, colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "" };
        populateNaturezas(); populateNomenaments(); populateCategoritzacions(); updateNaturezasUI(); updateNomenamentsUI(); updateCategoritzacionsUI(); applyFilters();
    });

    const setupMultiselect = (btnId, dropdownId) => {
        const btn = document.getElementById(btnId); const dropdown = document.getElementById(dropdownId);
        if (btn && dropdown) btn.addEventListener('click', (e) => { e.stopPropagation(); const wasActive = dropdown.classList.contains('active'); document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('active')); if (!wasActive) dropdown.classList.add('active'); });
    };
    setupMultiselect('btnCategoritzacions', 'dropdownCategoritzacions');
    setupMultiselect('btnNaturezas', 'dropdownNaturezas');
    setupMultiselect('btnNomenaments', 'dropdownNomenaments');
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

    // Delegació d'esdeveniments per a la info del SAC
    const tbody = document.getElementById('tableBody');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const sacDiv = e.target.closest('.clickable-sac');
            if (sacDiv) {
                const id = sacDiv.dataset.recordId;
                if (id) window.openSacDocsModal(id);
            }
        });
    }
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

function populateNaturezas() {
    const list = document.getElementById('listNaturezas');
    if (!list) return;
    const nats = [...new Set(allRecords.map(r => r.part_natureza && r.part_natureza !== "-" ? r.part_natureza : null))].filter(Boolean).sort();
    list.innerHTML = '';
    nats.forEach(nat => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        item.innerHTML = `<input type="checkbox" value="${nat}"><span>${nat}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) filters.naturezas.push(nat);
            else filters.naturezas = filters.naturezas.filter(v => v !== nat);
            updateNaturezasUI();
            applyFilters();
        });
        list.appendChild(item);
    });
}
function updateNaturezasUI() {
    const btn = document.getElementById('btnNaturezas');
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="building" style="width: 16px; margin-right: 4px;"></i> ${filters.naturezas.length ? `(${filters.naturezas.length}) Naturalesa` : 'Naturalesa jurídica'}`;
    btn.classList.toggle('btn-primary', filters.naturezas.length > 0);
    if (window.lucide) lucide.createIcons();
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

window.openSacDocsModal = (id) => {
    console.log("[SAC] Obrint info per ID:", id);
    const record = allRecords.find(r => r.id == id);
    
    if (!record) {
        console.error("[SAC] Record no trobat per ID:", id);
        return;
    }

    if (!record.sac_relacions || record.sac_relacions === "[]" || record.sac_relacions === "") {
        alert("Aquest càrrec no té informació de 'relacions' registrada al SAC.");
        return;
    }
    
    let rels = null;
    try { rels = JSON.parse(record.sac_relacions); } catch (e) { console.error(e); }
    
    const container = document.getElementById('sacDocsContent');
    const modalTitle = document.querySelector('#sacDocsModal h2');
    if (modalTitle) modalTitle.textContent = "Documentació acreditativa";

    if (!rels) {
        container.innerHTML = '<div style="padding:2rem; text-align:center; color:var(--text-muted);">Error al processar les dades de relacions.</div>';
    } else {
        // Agrupació per tipusInf
        const relsArray = Array.isArray(rels) ? rels : [rels];
        const grouped = relsArray.reduce((acc, curr) => {
            const type = curr.tipusInf || "Altres";
            if (!acc[type]) acc[type] = [];
            acc[type].push(curr);
            return acc;
        }, {});

        let html = '<div style="display:flex; flex-direction:column; gap:1rem;">';
        for (const [type, items] of Object.entries(grouped)) {
            html += `<div class="sac-group">
                <div style="font-size:0.7rem; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; padding-bottom:2px; border-bottom:1px solid rgba(var(--primary-rgb), 0.3); display:inline-block;">${type}</div>
                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                    ${items.map(item => {
                        const titol = item.titol || item.descripcio || item.nom || "Document / Enllaç";
                        const link = item.url || item.path || "";
                        
                        if (link) {
                            return `
                                <div style="padding:0.4rem 0.6rem; border-radius:4px; transition: background 0.2s; background:rgba(255,255,255,0.02);">
                                    <a href="${link}" target="_blank" style="font-weight:600; color:var(--text-main); font-size:0.85rem; text-decoration:none; display:flex; align-items:center; gap:6px;">
                                        <i data-lucide="external-link" style="width:12px; color:var(--primary); opacity:0.7;"></i>
                                        ${titol}
                                    </a>
                                </div>
                            `;
                        } else {
                            return `
                                <div style="padding:0.4rem 0.6rem; border-radius:4px; background:rgba(255,255,255,0.01);">
                                    <div style="font-weight:600; color:var(--text-muted); font-size:0.85rem;">${titol}</div>
                                </div>
                            `;
                        }
                    }).join('')}
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = `<div style="padding:0.5rem;">${html}</div>`;
    }
    
    document.getElementById('sacDocsModal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
};
window.closeSacDocsModal = () => document.getElementById('sacDocsModal').style.display = 'none';
