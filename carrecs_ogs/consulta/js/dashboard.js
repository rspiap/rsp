/**
 * dashboard.js - Controlador 5 Nivells (SAC -> Càrrec -> Entitat -> OGS -> Persona)
 * Versió: Taula Nativa amb rowspan per a alineació perfecta.
 */
import { CONFIG } from './modules/config.js';
import { db } from './modules/db.js';
import { syncEngine } from './modules/sync-engine.js';
import { CloudService } from './modules/cloud.js';
import { BoardService } from './modules/board-of-directors.js';
import { PendingService } from './modules/pending-service.js';
import { initTheme, toggleTheme, parseDate, baseNorm, prepareOrganRenderRows } from './modules/utils.js';

let allRecords = [];
let filteredRecords = [];
let rowsShown = 15;
let filters = { 
    search: "", dept: "", status: "", caStatus: [], ogsStatus: [], naturezas: [], nomenaments: [], categoritzacions: [], 
    onlySac: false, onlyGovern: false, onlyVacant: false, onlyPendingValidation: false,
    colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "",
    expireMonths: 1, filterMode: "subtractive"
};
let sortConfig = { key: 'codi_sac', direction: 'asc' };

function getCaStatus(r) {
    const reg = r.n_registre || r.reg || "";
    const isMercantil = (r.part_natureza || "").toLowerCase().includes("mercantil");
    if (!reg || !isMercantil) return null;
    if (r.ca_empty === true) return 'no_informat';

    if (r.data_final_de_vig_ncia) {
        const dFinal = parseDate(r.data_final_de_vig_ncia);
        if (dFinal) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = (dFinal - today) / (1000 * 60 * 60 * 24);
            const maxDays = (filters.expireMonths || 1) * 30;
            if (diffDays < 0) return 'caducat';
            if (diffDays < maxDays) return 'propera';
        }
    }
    return 'vigent';
}

function getOgsStatus(r) {
    if (!r.data_final_individual) return null;
    const dInd = parseDate(r.data_final_individual);
    if (!dInd) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = (dInd - today) / (1000 * 60 * 60 * 24);
    const maxDays = (filters.expireMonths || 1) * 30;

    if (diffDays < 0) return 'caducat';
    if (diffDays < maxDays) return 'propera';
    return 'vigent';
}

function initExpireMonths() {
    const saved = localStorage.getItem('caExpireMonths') || '1';
    const expEl = document.getElementById('caExpireMonths');
    if (expEl) {
        expEl.value = saved;
        filters.expireMonths = parseInt(saved) || 1;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initExpireMonths();
    setupEventListeners();
    await loadInitialData();
});

async function loadInitialData() {
    try {
        await PendingService.loadPendingData();
        let data = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (data && data.length > 0) {
            allRecords = data;
            populateDepartaments(); populateNaturezas(); populateNomenaments(); populateCategoritzacions(); populateCaStatus(); populateOgsStatus(); applyFilters(); checkCloudUpdates();
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
        populateDepartaments(); populateNaturezas(); populateNomenaments(); populateCategoritzacions(); populateCaStatus(); populateOgsStatus(); applyFilters();
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
    const expireMonthsEl = document.getElementById('caExpireMonths');
    filters.expireMonths = expireMonthsEl ? (parseInt(expireMonthsEl.value) || 1) : 1;

    filters.colSac = (document.getElementById('colFilterSAC').value || "").toLowerCase().trim();
    filters.colCarrec = (document.getElementById('colFilterCarrec').value || "").toLowerCase().trim();
    filters.colEntitat = (document.getElementById('colFilterEntitat').value || "").toLowerCase().trim();
    filters.colOGS = (document.getElementById('colFilterOGS').value || "").toLowerCase().trim();
    filters.colPersona = (document.getElementById('colFilterPersona').value || "").toLowerCase().trim();

    filteredRecords = allRecords.filter(r => {
        const cleanReg = String(r.n_registre || "").trim().replace(/^0+/, '');
        const regVariants = cleanReg ? `${r.n_registre || ''} ${cleanReg} reg:${cleanReg} reg: ${cleanReg}` : (r.n_registre || "");
        const searchableText = `${r.persona_nom || ''} ${r.persona_cognoms || ''} ${r.nom_rep || ''} ${r.cognoms_rep || ''} ${r.denom_social || ''} ${r.entitat || ''} ${regVariants} ${r.carrec || ''} ${r.codi_sac || ''}`.toLowerCase();
        const matchesSearch = !filters.search || searchableText.includes(filters.search);
        const matchesColSac = !filters.colSac || String(r.codi_sac || "").toLowerCase().includes(filters.colSac);
        const matchesColCarrec = !filters.colCarrec || String(r.carrec || "").toLowerCase().includes(filters.colCarrec);
        const entitatSearchable = `${r.entitat || ''} ${r.n_registre || ''} ${cleanReg}`.toLowerCase();
        const matchesColEntitat = !filters.colEntitat || entitatSearchable.includes(filters.colEntitat);
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
        let matchesCaStatus = true;
        if (filters.caStatus && filters.caStatus.length > 0) {
            const caState = getCaStatus(r);
            matchesCaStatus = (caState !== null && filters.caStatus.includes(caState));
        }
        let matchesOgsStatus = true;
        if (filters.ogsStatus && filters.ogsStatus.length > 0) {
            const ogsState = getOgsStatus(r);
            matchesOgsStatus = (ogsState !== null && filters.ogsStatus.includes(ogsState));
        }
        const matchesNatureza = filters.naturezas.length === 0 || filters.naturezas.includes(r.part_natureza);
        const nomVal = r.tipus_nomenament && r.tipus_nomenament.trim() !== "" ? r.tipus_nomenament : "No informat";
        const matchesNomenament = filters.nomenaments.length === 0 || filters.nomenaments.includes(nomVal);
        const matchesCategoritzacio = filters.categoritzacions.length === 0 || (r.categoritzacio && filters.categoritzacions.includes(r.categoritzacio));
        const satisfiesSac = (r.codi_sac && r.codi_sac.trim() !== "");
        const satisfiesGovern = (!r.is_govern_superior || r.is_govern_superior.trim() === "");
        const satisfiesVacant = (r.qualificador || "").toLowerCase().includes("vacant");
        const satisfiesPending = (PendingService.getPendingChange(r) !== null);

        let matchesToggles = true;
        if (filters.filterMode === 'additive') {
            const anyActive = filters.onlySac || filters.onlyGovern || filters.onlyVacant || filters.onlyPendingValidation;
            if (anyActive) {
                matchesToggles = (filters.onlySac && satisfiesSac) ||
                                 (filters.onlyGovern && satisfiesGovern) ||
                                 (filters.onlyVacant && satisfiesVacant) ||
                                 (filters.onlyPendingValidation && satisfiesPending);
            }
        } else {
            const matchesSac = !filters.onlySac || satisfiesSac;
            const matchesGovern = !filters.onlyGovern || satisfiesGovern;
            const matchesVacant = !filters.onlyVacant || satisfiesVacant;
            const matchesPendingValidation = !filters.onlyPendingValidation || satisfiesPending;
            matchesToggles = matchesSac && matchesGovern && matchesVacant && matchesPendingValidation;
        }

        return matchesSearch && matchesColSac && matchesColCarrec && matchesColEntitat && matchesColOGS && matchesColPersona && 
               matchesDept && matchesStatus && matchesCaStatus && matchesOgsStatus && matchesNatureza && matchesNomenament && matchesCategoritzacio && matchesToggles;
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
                    og.renderRows.forEach((rowItem, rIdx) => {
                        const isFirstOfOGS = rIdx === 0;
                        const p = rowItem.isGrouped ? rowItem.rep : rowItem.person;

                        // Comprovació de canvis pendents de validar
                        const pending = PendingService.getPendingChange(p);
                        let carrecPendingHTML = "";
                        let organPendingHTML = "";
                        let personaPendingHTML = "";

                        const isDeletion = pending && pending.operacio && pending.operacio.trim().toLowerCase().includes("esborrar");
                        const rowClass = isDeletion ? "modular-row row-deletion-pending" : "modular-row";

                        if (pending && pending.nou) {
                            const n = pending.nou;

                            // 1. Canvi de Càrrec (Level 2) - Omitit per petició de l'usuari
                            carrecPendingHTML = "";

                            // 2. Canvi d'Òrgan (Level 4) - Correspon a CARGO_GOBIERNO_SUPERIOR en les dades
                            if (n.CARGO_GOBIERNO_SUPERIOR && baseNorm(n.CARGO_GOBIERNO_SUPERIOR) !== baseNorm(og.name)) {
                                organPendingHTML = `<div class="pending-change-badge" style="display:block; margin-top:6px;"><i data-lucide="clock" style="width:12px; height:12px; vertical-align:-2px; margin-right:4px;"></i><strong>Pendent:</strong> ${n.CARGO_GOBIERNO_SUPERIOR}</div>`;
                            }

                            // 3. Canvi de Persona/Estat (Level 5)
                            const nMembre = (n.NOMBRE_PF ? `${n.NOMBRE_PF} ${n.APELLIDOS_PF}` : n.NOMBRE_PJ) ||
                                            (n.NOMBRE_PERSONA_REPRESENTANTE ? `${n.NOMBRE_PERSONA_REPRESENTANTE} ${n.APELLIDOS_PERSONA_REPRESENTANTE}` : '') ||
                                            n.MIEMBRO_ORGANO_GOBIERNO || "";
                            const nData = n.FECHA_INICIO_VIGENCIA ? ` (des de ${n.FECHA_INICIO_VIGENCIA})` : "";

                            if (isDeletion) {
                                personaPendingHTML = `<div class="pending-change-badge" style="color:#ef4444; border-color:rgba(239,68,68,0.4); background:rgba(239,68,68,0.1);"><i data-lucide="clock" style="width:12px; height:12px; vertical-align:-2px; margin-right:4px;"></i><strong>Pendent:</strong> Baixa / Esborrar</div>`;
                            } else {
                                personaPendingHTML = `<div class="pending-change-badge"><i data-lucide="clock" style="width:12px; height:12px; vertical-align:-2px; margin-right:4px;"></i><strong>Pendent:</strong> ${nMembre}${nData}</div>`;
                            }
                        }

                        html += `<tr class="${rowClass}">`;
                        if (isFirstOfSAC) html += `<td rowspan="${sacRows}" class="td-sac"><span class="parent-sac-badge">${sg.sac || '---'}</span></td>`;
                        if (isFirstOfCarrec) {
                            const first = cg.entities[0].ogs[0].persons[0];
                            let sacHTML = first.sac_carrec ? `<div class="clickable-sac" style="margin-top:8px; cursor:pointer;" data-record-id="${first.id}"><div style="font-size:0.6rem; color:var(--primary); font-weight:700; display:flex; align-items:center; gap:4px;">(SAC:) <i data-lucide="info" style="width:10px; height:10px;"></i></div><div style="font-size:0.75rem; color:var(--text-main); line-height:1.2;">${first.sac_carrec.toLowerCase()}</div><div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${first.sac_unitat || ''}</div></div>` : '';
                            html += `<td rowspan="${carrecRows}" class="td-carrec"><div class="cell-main-title">${cg.name}</div>${carrecPendingHTML}${sacHTML}</td>`;
                        }
                        if (isFirstOfEntitat) {
                            const firstP = ent.ogs[0].persons[0];
                            const isMercantil = (ent.natureza || "").toLowerCase().includes("mercantil");
                            let caBtn = '';
                            if (ent.reg && isMercantil) {
                                let btnClass = "btn-ca-blue";
                                if (ent.ca_empty === true) {
                                    btnClass = "btn-ca-empty";
                                } else if (firstP.data_final_de_vig_ncia) {
                                    const dFinal = parseDate(firstP.data_final_de_vig_ncia);
                                    if (dFinal) {
                                        const today = new Date();
                                        today.setHours(0,0,0,0);
                                        const diffDays = (dFinal - today) / (1000 * 60 * 60 * 24);
                                        const maxDays = (filters.expireMonths || 1) * 30;
                                        if (diffDays < 0) btnClass = "btn-ca-red";
                                        else if (diffDays < maxDays) btnClass = "btn-ca-orange";
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
                                        ${organPendingHTML}
                                     </td>`;
                        }

                        if (rowItem.isGrouped) {
                            html += `<td class="td-persona">
                                        <div style="display:flex; align-items:center; justify-content:space-between;">
                                            <div>
                                                <div class="cell-main-title" style="color:var(--text-muted); font-style:italic;">${rowItem.titleText || (rowItem.count > 1 ? `${rowItem.count} persones no informades` : "Persona no informada")}</div>
                                                <div class="persona-sub" style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${rowItem.subText || 'Tipus de nomenament no informat'}</div>
                                            </div>
                                            <div style="display:flex; align-items:center; gap:8px;">
                                                <span class="badge badge-no-aplica">No aplica</span>
                                                <button class="btn-edit" data-id="${rowItem.firstId}"><i data-lucide="pencil" style="width:14px; height:14px;"></i></button>
                                            </div>
                                        </div>
                                     </td>`;
                            html += `</tr>`;
                            return;
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
                            const maxDaysInd = (filters.expireMonths || 1) * 30;
                            if (diffDays < 0) {
                                expStyle = "color: #ff6b6b; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#ff6b6b; margin-top:4px; font-weight:600;">Càrrec expirat el ${p.data_final_individual}</div>`;
                            } else if (diffDays < maxDaysInd) {
                                expStyle = "color: #f59e0b; font-weight: 700;";
                                expText = `<div style="font-size:0.7rem; color:#f59e0b; margin-top:4px; font-weight:600;">El càrrec expira el ${p.data_final_individual}</div>`;
                            }
                        }

                        let personaHTML = `<div class="cell-main-title" style="${expStyle}">${personaName || '---'}</div>`;
                        if (qualif.includes("jur") && p.denom_social) {
                            personaHTML = `<div class="cell-main-title" style="${expStyle}">${p.denom_social}</div><div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">Rep: ${repName || '---'}</div>`;
                        } else if (qualif.includes("vacant")) {
                            personaHTML = `<div class="cell-main-title" style="color:var(--text-muted); font-style:italic;">(Vacant)</div>`;
                        } else if (!personaName) {
                            personaHTML = `<div class="cell-main-title" style="color:var(--text-muted); font-style:italic;">Persona no informada</div>`;
                        }

                        const nomText = (p.tipus_nomenament && p.tipus_nomenament.trim() && p.tipus_nomenament.trim().toLowerCase() !== 'no informat' && p.tipus_nomenament.trim().toLowerCase() !== 'tipus de nomenament no informat')
                            ? p.tipus_nomenament.trim()
                            : 'Tipus de nomenament no informat';

                        html += `<td class="td-persona">
                                    <div style="display:flex; align-items:center; justify-content:space-between;">
                                        <div>
                                            ${personaHTML}${expText}${personaPendingHTML}
                                            <div class="persona-sub" style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${nomText}</div>
                                        </div>
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
        if (!sacMap.has(sKey)) sacMap.set(sKey, { sac: sKey, carrecs: new Map() });
        const sGroup = sacMap.get(sKey);
        
        const cKey = r.carrec || '---';
        if (!sGroup.carrecs.has(cKey)) sGroup.carrecs.set(cKey, { name: cKey, entities: new Map() });
        const cGroup = sGroup.carrecs.get(cKey);
        
        const cleanReg = (r.n_registre || "").toString().trim().replace(/^0+/, '');
        const eKey = r.entitat ? `${r.entitat}|${cleanReg}` : '---';
        if (!cGroup.entities.has(eKey)) cGroup.entities.set(eKey, { name: r.entitat || '---', reg: cleanReg || r.n_registre, natureza: r.part_natureza, ca_empty: r.ca_empty, ogs: new Map() });
        const eGroup = cGroup.entities.get(eKey);
        
        const oKey = r.is_govern_superior || '---';
        if (!eGroup.ogs.has(oKey)) eGroup.ogs.set(oKey, { name: oKey, persons: [] });
        const oGroup = eGroup.ogs.get(oKey);
        
        oGroup.persons.push(r);
    });

    return Array.from(sacMap.values()).map(sg => {
        let sRows = 0;
        const carrecs = Array.from(sg.carrecs.values()).map(cg => {
            let cRows = 0;
            const entities = Array.from(cg.entities.values()).map(eg => {
                let eRows = 0;
                const ogs = Array.from(eg.ogs.values()).map(og => {
                    const renderRows = prepareOrganRenderRows(og.persons, PendingService);
                    const oRows = renderRows.length;
                    eRows += oRows;
                    return {
                        ...og,
                        renderRows: renderRows,
                        rows: oRows
                    };
                });
                cRows += eRows;
                return {
                    ...eg,
                    ogs: ogs,
                    rows: eRows
                };
            });
            sRows += cRows;
            return {
                ...cg,
                entities: entities,
                rows: cRows
            };
        });
        return {
            ...sg,
            carrecs: carrecs,
            rows: sRows
        };
    });
}

function setupEventListeners() {
    document.getElementById('globalSearch').addEventListener('input', applyFilters);
    document.getElementById('filterDepartament').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    const expEl = document.getElementById('caExpireMonths');
    if (expEl) {
        const handleExpireMonthsInput = () => {
            localStorage.setItem('caExpireMonths', expEl.value);
            applyFilters(); populateCaStatus(); populateOgsStatus();
        };
        expEl.addEventListener('change', handleExpireMonthsInput);
        expEl.addEventListener('input', handleExpireMonthsInput);
    }
    const filterCheckbox = document.getElementById('filterModeCheckbox');
    const textSubtractive = document.getElementById('textModeSubtractive');
    const textAdditive = document.getElementById('textModeAdditive');
    
    if (filterCheckbox && textSubtractive && textAdditive) {
        textSubtractive.addEventListener('click', () => {
            filterCheckbox.checked = false;
            triggerChange();
        });
        textAdditive.addEventListener('click', () => {
            filterCheckbox.checked = true;
            triggerChange();
        });
        filterCheckbox.addEventListener('change', () => triggerChange());
        
        function triggerChange() {
            const isAdditive = filterCheckbox.checked;
            filters.filterMode = isAdditive ? 'additive' : 'subtractive';
            textSubtractive.classList.toggle('active', !isAdditive);
            textAdditive.classList.toggle('active', isAdditive);
            applyFilters();
        }
    }

    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            document.getElementById('globalSearch').value = "";
            document.getElementById('filterDepartament').value = "";
            document.getElementById('filterStatus').value = "";
            document.querySelectorAll('.column-filter').forEach(input => input.value = "");
            ['toggleSac', 'toggleGovern', 'toggleVacant', 'togglePendingValidation'].forEach(id => {
                const el = document.getElementById(id); if (el) el.classList.remove('btn-primary');
            });
            const expEl = document.getElementById('caExpireMonths');
            const curMonths = expEl ? (parseInt(expEl.value) || 1) : 1;
            filters = { search: "", dept: "", status: "", caStatus: [], ogsStatus: [], naturezas: [], nomenaments: [], categoritzacions: [], onlySac: false, onlyGovern: false, onlyVacant: false, onlyPendingValidation: false, colSac: "", colCarrec: "", colEntitat: "", colOGS: "", colPersona: "", expireMonths: curMonths, filterMode: "subtractive" };
            if (filterCheckbox) filterCheckbox.checked = false;
            if (textSubtractive) textSubtractive.classList.add('active');
            if (textAdditive) textAdditive.classList.remove('active');
            populateNaturezas(); populateNomenaments(); populateCategoritzacions(); populateCaStatus(); populateOgsStatus(); updateNaturezasUI(); updateNomenamentsUI(); updateCategoritzacionsUI(); updateCaStatusUI(); updateOgsStatusUI(); applyFilters();
        });
    }

    const setupToggleBtn = (btnId, filterProp) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                filters[filterProp] = !filters[filterProp];
                btn.classList.toggle('btn-primary', filters[filterProp]);
                applyFilters();
            });
        }
    };
    setupToggleBtn('toggleSac', 'onlySac');
    setupToggleBtn('toggleGovern', 'onlyGovern');
    setupToggleBtn('toggleVacant', 'onlyVacant');
    setupToggleBtn('togglePendingValidation', 'onlyPendingValidation');

    const setupMultiselect = (btnId, dropdownId) => {
        const btn = document.getElementById(btnId); const dropdown = document.getElementById(dropdownId);
        if (btn && dropdown) btn.addEventListener('click', (e) => { e.stopPropagation(); const wasActive = dropdown.classList.contains('active'); document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('active')); if (!wasActive) dropdown.classList.add('active'); });
    };
    setupMultiselect('btnCaStatus', 'dropdownCaStatus');
    setupMultiselect('btnOgsStatus', 'dropdownOgsStatus');
    setupMultiselect('btnCategoritzacions', 'dropdownCategoritzacions');
    setupMultiselect('btnNaturezas', 'dropdownNaturezas');
    setupMultiselect('btnNomenaments', 'dropdownNomenaments');
    document.addEventListener('click', (e) => { document.querySelectorAll('.multiselect-dropdown').forEach(d => { if (!d.contains(e.target)) d.classList.remove('active'); }); });
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

function populateCaStatus() {
    const list = document.getElementById('listCaStatus');
    if (!list) return;
    const m = filters.expireMonths || 1;
    const labelPropera = `Propera caducitat (${m} ${m === 1 ? 'mes' : 'mesos'})`;
    const options = [
        { value: 'caducat', label: 'Caducats', class: 'btn-ca-red' },
        { value: 'propera', label: labelPropera, class: 'btn-ca-orange' },
        { value: 'vigent', label: 'Vigents', class: 'btn-ca-blue' },
        { value: 'no_informat', label: 'No informat', class: 'btn-ca-empty' }
    ];
    list.innerHTML = '';
    options.forEach(opt => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        const isChecked = filters.caStatus.includes(opt.value);
        item.innerHTML = `<input type="checkbox" value="${opt.value}" ${isChecked ? 'checked' : ''}><span class="btn ${opt.class}" style="padding: 4px 10px; font-size: 0.75rem; font-weight: 800; border-radius: 4px; pointer-events: none;">${opt.label}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!filters.caStatus.includes(opt.value)) filters.caStatus.push(opt.value);
            } else {
                filters.caStatus = filters.caStatus.filter(v => v !== opt.value);
            }
            updateCaStatusUI();
            applyFilters();
        });
        list.appendChild(item);
    });
    updateCaStatusUI();
}

function updateCaStatusUI() {
    const btn = document.getElementById('btnCaStatus');
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="shield-alert" style="width: 16px; margin-right: 4px;"></i> ${filters.caStatus.length ? `(${filters.caStatus.length}) Estat CA` : 'Estat Consells (CA)'}`;
    btn.classList.toggle('btn-primary', filters.caStatus.length > 0);
    if (window.lucide) lucide.createIcons();
}

function populateOgsStatus() {
    const list = document.getElementById('listOgsStatus');
    if (!list) return;
    const m = filters.expireMonths || 1;
    const labelPropera = `Propera caducitat (${m} ${m === 1 ? 'mes' : 'mesos'})`;
    const options = [
        { value: 'caducat', label: 'Caducats', class: 'btn-ca-red' },
        { value: 'propera', label: labelPropera, class: 'btn-ca-orange' },
        { value: 'vigent', label: 'Vigents', class: 'btn-ca-blue' }
    ];
    list.innerHTML = '';
    options.forEach(opt => {
        const item = document.createElement('label');
        item.className = 'multiselect-item';
        const isChecked = filters.ogsStatus.includes(opt.value);
        item.innerHTML = `<input type="checkbox" value="${opt.value}" ${isChecked ? 'checked' : ''}><span class="btn ${opt.class}" style="padding: 4px 10px; font-size: 0.75rem; font-weight: 800; border-radius: 4px; pointer-events: none;">${opt.label}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!filters.ogsStatus.includes(opt.value)) filters.ogsStatus.push(opt.value);
            } else {
                filters.ogsStatus = filters.ogsStatus.filter(v => v !== opt.value);
            }
            updateOgsStatusUI();
            applyFilters();
        });
        list.appendChild(item);
    });
    updateOgsStatusUI();
}

function updateOgsStatusUI() {
    const btn = document.getElementById('btnOgsStatus');
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="user-check" style="width: 16px; margin-right: 4px;"></i> ${filters.ogsStatus.length ? `(${filters.ogsStatus.length}) Estat OGS` : 'Estat càrrecs OGS'}`;
    btn.classList.toggle('btn-primary', filters.ogsStatus.length > 0);
    if (window.lucide) lucide.createIcons();
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
