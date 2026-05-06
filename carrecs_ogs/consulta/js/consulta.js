/**
 * consulta.js - Controlador 5 Nivells (Versió Consulta)
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { initTheme, toggleTheme } from './modules/utils.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = 15;
let filters = { search: "", dept: "", status: "", nomenaments: [], categoritzacions: [], onlySac: false, onlyGovern: false, onlyVacant: false };
let sortConfig = { key: 'codi_sac', direction: 'asc' };

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupEventListeners();
    await loadData();
    if (window.lucide) lucide.createIcons();
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

    filteredRecords = allRecords.filter(r => {
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.nom_rep || ''} ${r.cognoms_rep || ''} ${r.denom_social || ''} ${r.entitat || ''} ${r.carrec || ''} ${r.codi_sac || ''}`.toLowerCase();
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
        const matchesCategoritzacio = filters.categoritzacions.length === 0 || (r.categoritzacio && filters.categoritzacions.includes(r.categoritzacio));
        const matchesSac = !filters.onlySac || (r.codi_sac && r.codi_sac.trim() !== "");
        const matchesGovern = !filters.onlyGovern || (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const matchesVacant = !filters.onlyVacant || (r.qualificador || "").toLowerCase().includes("vacant");
        return matchesSearch && matchesDept && matchesStatus && matchesNomenament && matchesCategoritzacio && matchesSac && matchesGovern && matchesVacant;
    });

    // Lògica d'ordenació dinàmica
    filteredRecords.sort((a, b) => {
        let valA = a[sortConfig.key] || "";
        let valB = b[sortConfig.key] || "";

        if (sortConfig.key === 'persona_nom') {
            valA = `${a.persona_nom || ''} ${a.persona_cognoms || ''}`.trim();
            valB = `${b.persona_nom || ''} ${b.persona_cognoms || ''}`.trim();
        }

        const sA = String(valA).toLowerCase();
        const sB = String(valB).toLowerCase();

        if (sA === sB) {
            return String(a.codi_sac || "").localeCompare(String(b.codi_sac || ""));
        }

        return sortConfig.direction === 'asc'
            ? sA.localeCompare(sB)
            : sB.localeCompare(sA);
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
        // REGLA: "El buit no agrupa"
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
        if (!eg) { eg = { id: eKey, name: eValue || '', reg: r.n_registre, ogs: [] }; cg.entities.push(eg); }

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
                sacHTML = `<div style="margin-top:8px;"><div style="font-size:0.6rem; color:var(--primary); font-weight:700;">(SAC:)</div><div style="font-size:0.75rem; color:var(--text-main); line-height:1.2;">${first.sac_carrec.toLowerCase()}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${first.sac_unitat || ''} | ${first.sac_departament || ''}</div></div>`;
            }

            html += `<div class="level-2-row" style="flex:1; display:flex;"><div class="level-2-cell"><div class="carrec-text" style="font-weight:700;">${cg.name}</div>${sacHTML}</div>`;
            html += `<div class="level-3-container" style="flex:1; display:flex; flex-direction:column;">`;
            cg.entities.forEach(ent => {
                html += `<div class="level-3-row" style="flex:1; display:flex;"><div class="level-3-cell"><div style="font-weight:700; font-size:0.85rem; color:var(--text-main);">${ent.name}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">Reg: ${ent.reg || '-'}</div></div>`;
                html += `<div class="level-4-container" style="flex:1; display:flex; flex-direction:column;">`;
                ent.ogs.forEach(og => {
                    const p = og.persons[0];
                    const deptText = p.departament ? `(${p.departament})` : '';
                    const displayOrg = p.sac_unitat ? `${p.sac_unitat} ${deptText}` : (p.departament || '');
                    const catHTML = p.categoritzacio ? `<div style="margin-top:2px; font-weight:700; color:var(--primary); font-size:0.6rem; text-transform:uppercase; letter-spacing:0.3px;">${p.categoritzacio}</div>` : '';
                    html += `<div class="level-4-row" style="flex:1; display:flex;"><div class="level-4-cell"><div style="font-weight:600; font-size:0.85rem; color:var(--text-main);">${og.name}</div><div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${displayOrg}</div><div style="margin-top:8px; font-size:0.65rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${p.part_cip_o_organisme || ''}${catHTML}</div></div>`;
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
                            const nomPrincipal = repNom || personaFisica || "Representant pendent";
                            const nomEntitat = entitatJuridica || "Entitat Jurídica";

                            nomHTML = `<div style="font-size:0.95rem; font-weight:700; color:var(--text-main);">${nomPrincipal}</div>
                                       <div style="font-size:0.75rem; color:var(--secondary); font-weight:500; margin-top:3px;">Representant de ${nomEntitat}</div>`;
                        } else if ((p.qualificador || "").toLowerCase().includes("vacant")) {
                            nomHTML = `<div style="color:var(--text-muted); font-style:italic; opacity:0.7;">(Vacant)</div>`;
                        } else {
                            nomHTML = `<div style="font-size:0.95rem; font-weight:700; color:var(--text-main);">${personaFisica || 'Sense nom'}</div>`;
                        }

                        let sacInfoHTML = '';
                        if (p.codi_sac && p.sac_nom_responsable && p.status !== 'Validat') {
                            sacInfoHTML = `<div style="margin-top: 8px; padding: 6px 10px; background: rgba(255, 107, 107, 0.05); border-radius: 6px; border-left: 2px solid #ff6b6b;"><div style="font-size: 0.55rem; text-transform: uppercase; color: #ff6b6b; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 2px;">Ref. SAC:</div><div style="font-size: 0.85rem; color: #e03131; font-weight: 600;">${p.sac_nom_responsable}</div></div>`;
                        }
                        html += `<div class="level-5-row" style="flex:1; display:flex;"><div class="level-5-cell"><div style="font-size:0.9rem; font-weight:600;">${nomHTML}</div><div style="font-size:0.7rem; color:var(--text-muted); font-style:italic; margin-top:2px;">${p.tipus_nomenament || ''}</div>${sacInfoHTML}</div><div class="level-5-cell" style="width:100px; text-align:center; flex:none;">${statusBadge}</div></div>`;
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

function setupEventListeners() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    document.getElementById('globalSearch').addEventListener('input', applyFilters);
    document.getElementById('filterDepartament').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('btnResetFilters').addEventListener('click', () => {
        document.getElementById('globalSearch').value = ""; document.getElementById('filterDepartament').value = ""; document.getElementById('filterStatus').value = "";
        ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('btn-primary');
        });
        filters = { search: "", dept: "", status: "", nomenaments: [], categoritzacions: [], onlySac: false, onlyGovern: false, onlyVacant: false };
        populateNomenaments(); populateCategoritzacions(); updateNomenamentsUI(); updateCategoritzacionsUI(); applyFilters();
    });

    // Multiselect dropdowns setup (Unificat)
    const setupMultiselect = (btnId, dropdownId) => {
        const btn = document.getElementById(btnId);
        const dropdown = document.getElementById(dropdownId);
        if (btn && dropdown) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasActive = dropdown.classList.contains('active');
                document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('active'));
                if (!wasActive) dropdown.classList.add('active');
            });
        }
    };

    setupMultiselect('btnNomenaments', 'dropdownNomenaments');
    setupMultiselect('btnCategoritzacions', 'dropdownCategoritzacions');

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.multiselect-dropdown').forEach(d => {
            if (!d.contains(e.target)) d.classList.remove('active');
        });
    });
    ['toggleSac', 'toggleGovern', 'toggleVacant'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
            const key = id.replace('toggle', 'only');
            filters[key.charAt(0).toLowerCase() + key.slice(1)] = !filters[key.charAt(0).toLowerCase() + key.slice(1)];
            e.currentTarget.classList.toggle('btn-primary'); applyFilters();
        });
    });
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) / document.documentElement.scrollHeight > 0.85 && rowsShown < filteredRecords.length) {
            rowsShown += 10; renderTable(true);
        }
    });
    document.getElementById('btnSync').addEventListener('click', () => handleSync());
    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);

    // Gestió d'ordenació per capçaleres
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            if (sortConfig.key === key) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.key = key;
                sortConfig.direction = 'asc';
            }
            document.querySelectorAll('.sortable-header').forEach(h => {
                h.classList.remove('active');
                const icon = h.querySelector('.sort-icon');
                if (icon) icon.style.transform = 'rotate(0deg)';
            });
            th.classList.add('active');
            const icon = th.querySelector('.sort-icon');
            if (icon) icon.style.transform = sortConfig.direction === 'desc' ? 'rotate(180deg)' : 'rotate(0deg)';
            applyFilters();
        });
    });
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
        item.innerHTML = `<input type="checkbox" ${filters.nomenaments.includes(type) ? 'checked' : ''} value="${type}"><span>${type}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) filters.nomenaments.push(type);
            else filters.nomenaments = filters.nomenaments.filter(v => v !== type);
            updateNomenamentsUI(); applyFilters();
        });
        list.appendChild(item);
    });
    updateNomenamentsUI();
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
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        item.innerHTML = `<input type="checkbox" ${filters.categoritzacions.includes(cat) ? 'checked' : ''} value="${cat}"><span>${cat}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) filters.categoritzacions.push(cat);
            else filters.categoritzacions = filters.categoritzacions.filter(v => v !== cat);
            updateCategoritzacionsUI(); applyFilters();
        });
        list.appendChild(item);
    });
    updateCategoritzacionsUI();
}

function updateCategoritzacionsUI() {
    const btn = document.getElementById('btnCategoritzacions'); if (!btn) return;
    btn.innerHTML = `<i data-lucide="layers" style="width: 16px; margin-right: 4px;"></i> ${filters.categoritzacions.length ? `(${filters.categoritzacions.length})` : 'Categorització'}`;
    btn.classList.toggle('btn-primary', filters.categoritzacions.length > 0);
    if (window.lucide) lucide.createIcons();
}

function exportToCSV() {
    if (filteredRecords.length === 0) return;
    const headers = ["Codi SAC", "Persona Nom", "Persona Cognoms", "Carrec", "Departament", "Entitat", "N. Registre", "Òrgan Govern Superior", "Categorització", "Tipus Membre", "Particip/Organisme", "Tipus Nomenament", "Estat", "Qualificador"];
    let csvContent = "\ufeff" + headers.join(";") + "\n";
    filteredRecords.forEach(r => {
        const row = [r.codi_sac || "", r.persona_nom || "", r.persona_cognoms || "", r.carrec || "", r.sac_departament || r.departament || "", r.entitat || "", r.n_registre || "", r.is_govern_superior || "", r.categoritzacio || "", r.membre_tipus || "", r.part_cip_o_organisme || "", r.tipus_nomenament || "", r.status || "", r.qualificador || ""];
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.click();
}
