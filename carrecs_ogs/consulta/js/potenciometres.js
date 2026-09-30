/**
 * js/potenciometres.js - Lògica del Panell de Control de Potenciòmetres
 * 
 * Visualitza els percentatges de caducitat dels mandats en forma de potenciòmetre
 * semicircular amb tres trams (verd: vigent, taronja: proper a caducar, vermell: caducat)
 * i agulla indicadora.
 * 
 * Permet commutar entre:
 * - Òrgans de Govern Superior (OGS): Càlcul individual per càrrec/membre (data_final_individual).
 * - Consells d'Administració (CA): Càlcul separat per entitat/òrgan col·legiat (data_final_de_vig_ncia).
 */

import { db } from './modules/db.js';
import { API } from './modules/api.js';
import { CONFIG } from './modules/config.js';
import { parseDate, baseNorm, initTheme, toggleTheme } from './modules/utils.js';

// Estat global de la vista
const state = {
    records: [],
    caRecords: [],
    mode: localStorage.getItem('gaugeOrganMode') || 'ogs', // 'ogs' o 'ca'
    monthsThreshold: parseInt(localStorage.getItem('gaugeExpireMonths') || '6', 10),
    legalNatures: {},
    totals: { vigents: 0, propers: 0, caducats: 0, noInformats: 0, total: 0 },
    activeModalNature: null,
    modalSearchTerm: ''
};

// Inicialització en carregar el DOM
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupEventListeners();
    initAutoSync();
    await loadData();
});

/**
 * Configuració dels listeners dels controls interactius
 */
function setupEventListeners() {
    // Canvi de tema Clar / Fosc
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Input de mesos de propera caducitat
    const monthsInput = document.getElementById('monthsInput');
    if (monthsInput) {
        monthsInput.value = state.monthsThreshold;
        monthsInput.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            if (val > 120) val = 120;
            state.monthsThreshold = val;
            localStorage.setItem('gaugeExpireMonths', val.toString());
            recalculateAndRender();
        });
    }

    // Commutador d'Òrgan: OGS vs Consells d'Administració (CA)
    const organSwitch = document.getElementById('organSwitch');
    if (organSwitch) {
        updateSwitchPillUI();
        organSwitch.addEventListener('click', async (e) => {
            const btn = e.target.closest('.switch-pill');
            if (btn && btn.dataset.mode) {
                state.mode = btn.dataset.mode;
                localStorage.setItem('gaugeOrganMode', state.mode);
                updateSwitchPillUI();

                if (state.mode === 'ca' && (!state.caRecords || state.caRecords.length === 0)) {
                    await loadData();
                } else {
                    recalculateAndRender();
                }
            }
        });
    }

    // Modal de Detall: tancament
    const modal = document.getElementById('detailModal');
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', closeModal);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Cerca dins el modal
    const modalSearch = document.getElementById('modalSearchInput');
    if (modalSearch) {
        modalSearch.addEventListener('input', (e) => {
            state.modalSearchTerm = e.target.value.toLowerCase().trim();
            renderModalTable();
        });
    }

    // Clic en targetes de la graella de potenciòmetres (Event Delegation segur, sense inline JS)
    const grid = document.getElementById('gaugesGrid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.gauge-card');
            if (card && card.dataset.nature) {
                openNatureModal(card.dataset.nature);
            }
        });
    }
}

let lastLoadedTimestamp = Date.now();
let autoUpdateTimeout = null;

/**
 * Sistema de sincronització automàtica en temps real:
 * Escolta canvis a la base de dades sense intervenció de l'usuari mitjançant:
 * 1. BroadcastChannel (notificació instantània entre pestanyes/finestres)
 * 2. Esdeveniment 'storage' de window (canvis a localStorage)
 * 3. Esdeveniment 'focus' de window (quan l'usuari torna a la pestanya)
 * 4. Polling lleuger de segon pla (cada 30 segons per verificar marques de temps)
 */
function initAutoSync() {
    // 1. BroadcastChannel: comunicació directa i instantània
    if (typeof BroadcastChannel !== 'undefined') {
        try {
            const dbChannel = new BroadcastChannel('sector_public_db_channel');
            dbChannel.onmessage = (event) => {
                if (event.data && (event.data.type === 'DB_CHANGED' || event.data.type === 'FULL_SYNC_COMPLETE')) {
                    console.log("[Potenciòmetres] Canvi detectat a la base de dades (BroadcastChannel). Actualitzant...");
                    triggerLiveReload();
                }
            };
        } catch (err) {
            console.warn("[Potenciòmetres] BroadcastChannel no disponible:", err);
        }
    }

    // 2. Esdeveniment 'storage' (suport universal entre pestanyes)
    window.addEventListener('storage', (e) => {
        if (e.key === 'db_last_records_update' || e.key === 'db_last_update_records') {
            console.log("[Potenciòmetres] S'ha detectat actualització a localStorage. Actualitzant...");
            triggerLiveReload();
        }
    });

    // 3. Quan la pestanya recupera el focus
    window.addEventListener('focus', () => {
        const lastUpdateStr = localStorage.getItem('db_last_records_update');
        if (lastUpdateStr) {
            const lastUpdate = parseInt(lastUpdateStr, 10);
            if (lastUpdate > lastLoadedTimestamp) {
                console.log("[Potenciòmetres] S'han detectat canvis mentre la pestanya estava en segon pla. Actualitzant...");
                triggerLiveReload();
            }
        }
    });

    // 4. Comprovació periòdica de segon pla (cada 30 segons)
    setInterval(() => {
        const lastUpdateStr = localStorage.getItem('db_last_records_update');
        if (lastUpdateStr) {
            const lastUpdate = parseInt(lastUpdateStr, 10);
            if (lastUpdate > lastLoadedTimestamp) {
                console.log("[Potenciòmetres] Polling periòdic: dades noves detectades. Actualitzant...");
                triggerLiveReload();
            }
        }
    }, 30000);
}

/**
 * Executa la recàrrega amb debounce per evitar renderitzats duplicats
 */
function triggerLiveReload() {
    if (autoUpdateTimeout) clearTimeout(autoUpdateTimeout);
    autoUpdateTimeout = setTimeout(async () => {
        lastLoadedTimestamp = Date.now();
        await loadData();
        showLiveSyncIndicator();
    }, 300);
}

/**
 * Mostra un indicador visual discret que les dades s'han actualitzat en viu
 */
function showLiveSyncIndicator() {
    let indicator = document.getElementById('liveSyncBadge');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'liveSyncBadge';
        indicator.className = 'live-sync-toast';
        document.body.appendChild(indicator);
    }
    
    indicator.innerHTML = `
        <span class="live-pulse-dot"></span>
        <span>Potenciòmetres actualitzats automàticament</span>
    `;
    indicator.classList.add('visible');

    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 3500);
}

/**
 * Actualitza la classe activa visual de les píndoles del commutador
 */
function updateSwitchPillUI() {
    const pills = document.querySelectorAll('.switch-pill');
    pills.forEach(p => {
        if (p.dataset.mode === state.mode) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

/**
 * Carrega les dades emmagatzemades a IndexedDB
 */
async function loadData() {
    showLoading(true);
    try {
        const rawRecords = await db.getAll(CONFIG.DB.STORES.RECORDS);
        if (!rawRecords || rawRecords.length === 0) {
            showEmptyDBState();
            return;
        }

        state.records = rawRecords;

        // Intentem recuperar els registres de CA locals d'IndexedDB (instantani, < 5ms)
        let caRaw = await db.getByKey(CONFIG.DB.STORES.METADATA, 'ca_raw_records');

        // Si estem en mode CA i encara no els tenim a la base de dades local, els descarreguem
        if (state.mode === 'ca' && (!caRaw || caRaw.length === 0)) {
            try {
                console.log("[Potenciòmetres] Obtenint dades del Consell d'Administració (nmgt-rq9t)...");
                caRaw = await API.fetchOpenData(CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID);
                if (caRaw && caRaw.length > 0) {
                    await db.save(CONFIG.DB.STORES.METADATA, caRaw, 'ca_raw_records');
                }
            } catch (errCA) {
                console.warn("[Potenciòmetres] No s'han pogut descarregar els consells d'administració:", errCA);
            }
        }
        state.caRecords = caRaw || [];

        recalculateAndRender();

        // Si estem en mode OGS i no tenim CA en local, podem pre-carregar-los en segon pla
        // de forma transparent sense congelar ni bloquejar el panell
        if (state.mode === 'ogs' && (!state.caRecords || state.caRecords.length === 0)) {
            API.fetchOpenData(CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID).then(async (bgCA) => {
                if (bgCA && bgCA.length > 0) {
                    state.caRecords = bgCA;
                    await db.save(CONFIG.DB.STORES.METADATA, bgCA, 'ca_raw_records');
                }
            }).catch(() => {});
        }
    } catch (err) {
        console.error("Error carregant registres d'IndexedDB:", err);
        showErrorState(err);
    } finally {
        showLoading(false);
    }
}

/**
 * Recalcula les mètriques i actualitza el panell segons el mode (OGS o CA)
 */
function recalculateAndRender() {
    const now = new Date();
    const thresholdDate = new Date(now.getTime());
    thresholdDate.setMonth(thresholdDate.getMonth() + state.monthsThreshold);

    if (state.mode === 'ca') {
        recalculateConsellsAdmon(now, thresholdDate);
    } else {
        recalculateOGS(now, thresholdDate);
    }

    renderHeroGauge(state.totals);
    renderNaturesGrid(state.legalNatures);

    // Si el modal està obert, actualitza'n la taula
    if (state.activeModalNature) {
        renderModalTable();
    }

    if (window.lucide) lucide.createIcons();
}

/**
 * Determina el text i l'estat de la persona per a un registre OGS,
 * reproduint exactament la visualització de la columna "Persona / Estat" de la taula principal.
 * Retorna "(No informat)" si no hi ha persona física, representant jurídic o vacant.
 */
function getPersonaEstat(r) {
    if (!r) return "(No informat)";

    const qualif = (r.qualificador || "").toLowerCase();
    const membreTipus = (r.membre_tipus || "").toLowerCase();
    const isJuridica = qualif.includes("jur") || membreTipus.includes("jur");

    if (isJuridica) {
        const rep = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim();
        const principal = rep || r.persona_nom || r.nom || "Representant pendent";
        return `${principal} (Rep. de ${r.denom_social || 'Entitat Jurídica'})`;
    }

    if (qualif.includes("vacant")) {
        return "(Vacant)";
    }

    const pNom = `${r.persona_nom || r.nom || ''} ${r.persona_cognoms || r.cognoms || ''}`.trim();
    if (!pNom) {
        if (r.persona && r.persona.trim()) {
            const normP = r.persona.trim().toLowerCase().replace(/[\(\)]/g, '');
            if (normP !== 'no informat' && normP !== 'persona no indicada' && normP !== 'sense persona' && normP !== 'persona no informada') {
                return r.persona.trim();
            }
        }
        return "Persona no informada";
    }

    const norm = pNom.toLowerCase().replace(/[\(\)]/g, '').trim();
    if (norm === 'no informat' || norm === 'sense persona' || norm === 'no indicada' || norm === 'persona no indicada' || norm === 'persona no informada') {
        return "Persona no informada";
    }

    return pNom;
}

/**
 * Comprova si un registre prové originàriament del conjunt de dades auai-ppkn (càrrecs i membres d'OGS).
 * Només aquests registres s'utilitzen per als càlculs de dates i percentatges.
 * S'exclouen totalment les files afegides des de sexe-cpsh per a la conciliació de quotes.
 */
function isAuaiRecord(r) {
    if (!r) return false;

    // 1. Etiqueta explícita de font
    if (r.source === 'auai-ppkn') return true;
    if (r.source === 'sexe-cpsh' || r.source === 'synthetic' || r.is_synthetic === true) return false;

    // 2. Detecció per atributs de registres existents a la base de dades local:
    // A la taula sexe-cpsh no hi ha càrrecs, no hi ha persones, no hi ha òrgans designants ni dates individuals.
    // Totes les files generades per sexe-cpsh tenen carrec buit (""), persona buida ("") i cap data.
    const hasCarrec = Boolean(r.carrec && r.carrec.trim());
    const hasPersona = Boolean((r.persona_nom && r.persona_nom.trim()) || (r.persona_cognoms && r.persona_cognoms.trim()));
    const hasRep = Boolean((r.nom_rep && r.nom_rep.trim()) || (r.cognoms_rep && r.cognoms_rep.trim()) || (r.denom_social && r.denom_social.trim()));
    const hasDesigna = Boolean(r.rgan_que_designa && r.rgan_que_designa.trim());
    const hasData = Boolean(r.data_final_individual && r.data_final_individual.trim());
    const hasRealQualif = Boolean(r.qualificador && r.qualificador.trim() && r.qualificador.trim().toLowerCase() !== 'no informat');
    const hasRealNomenament = Boolean(r.tipus_nomenament && r.tipus_nomenament.trim() && r.tipus_nomenament.trim().toLowerCase() !== 'no informat' && r.tipus_nomenament.trim().toLowerCase() !== 'tipus de nomenament no informat');

    return Boolean(hasCarrec || hasPersona || hasRep || hasDesigna || hasData || hasRealQualif || hasRealNomenament);
}

/**
 * Comprova si un registre es visualitza a la columna "Persona / Estat" de la taula principal
 * exactament com a la imatge aportada per l'usuari:
 *   (No informat)
 *   No informat
 *   NO APLICA
 */
function isRecordLikeImage(r) {
    if (!r) return true;
    if (r.is_synthetic === true || r.source === 'sexe-cpsh' || r.source === 'synthetic') return true;

    // Estat: a la imatge es mostra el distintiu "NO APLICA" (no Validat ni Pendent)
    const st = (r.status || "").toLowerCase();
    const isNoAplica = (st !== 'validat' && st !== 'pendent');
    if (!isNoAplica) return false;

    // Vacant expressa: es mostraria com (Vacant)
    const qualif = (r.qualificador || "").toLowerCase();
    if (qualif.includes("vacant")) return false;

    // Persona jurídica amb representant o raó social
    const membreTipus = (r.membre_tipus || "").toLowerCase();
    const isJuridica = qualif.includes("jur") || membreTipus.includes("jur");
    if (isJuridica) {
        const rep = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim();
        const principal = rep || r.persona_nom || r.nom || "";
        if (principal || (r.denom_social && r.denom_social.trim())) {
            return false;
        }
    }

    // Persona física: si té nom real indicat, no coincideix amb la imatge
    const pNom = `${r.persona_nom || r.nom || ''} ${r.persona_cognoms || r.cognoms || ''}`.trim();
    if (pNom) {
        const norm = pNom.toLowerCase().replace(/[\(\)]/g, '').trim();
        if (norm !== 'no informat' && norm !== 'sense persona' && norm !== 'no indicada' && norm !== 'persona no indicada') {
            return false;
        }
    }

    if (r.persona && typeof r.persona === 'string' && r.persona.trim()) {
        const normP = r.persona.trim().toLowerCase().replace(/[\(\)]/g, '');
        if (normP !== 'no informat' && normP !== 'sense persona' && normP !== 'no indicada' && normP !== 'persona no indicada') {
            return false;
        }
    }

    // No té persona informada i el seu estat és "No aplica": coincideix amb la imatge
    return true;
}

/**
 * Retorna el nom a visualitzar al modal per a la persona
 */
function getPersonaDisplayName(r) {
    if (!r) return "(No informat)";
    const qualif = (r.qualificador || "").toLowerCase();
    const membreTipus = (r.membre_tipus || "").toLowerCase();
    const isJuridica = qualif.includes("jur") || membreTipus.includes("jur");

    if (isJuridica) {
        const rep = `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim();
        const principal = rep || r.persona_nom || r.nom || "Representant pendent";
        return `${principal} (Rep. de ${r.denom_social || 'Entitat Jurídica'})`;
    }

    if (qualif.includes("vacant")) {
        return "(Vacant)";
    }

    const pNom = `${r.persona_nom || r.nom || ''} ${r.persona_cognoms || r.cognoms || ''}`.trim();
    if (pNom) return pNom;
    return "Persona no informada";
}

/**
 * Càlcul específic per a Òrgans de Govern Superior (OGS):
 * Exclou totalment els Consells d'Administració. Avalua data_final_individual.
 * Només s'utilitzen dades provinents de la taula auai-ppkn (s'ignoren files de sexe-cpsh).
 */
function recalculateOGS(now, thresholdDate) {
    const naturesMap = {};
    const globalTotals = { vigents: 0, propers: 0, caducats: 0, noInformats: 0, total: 0 };

    state.records.forEach(r => {
        // Només dades reals de mandats d'auai-ppkn
        if (!isAuaiRecord(r)) {
            return;
        }

        // Excloem si la cel·la de persona és com la de la imatge
        if (isRecordLikeImage(r)) {
            return;
        }

        const rawNature = (r.part_natureza || "Altres / No informada").trim();
        if (!naturesMap[rawNature]) {
            naturesMap[rawNature] = {
                name: rawNature,
                vigents: 0,
                propers: 0,
                caducats: 0,
                noInformats: 0,
                total: 0,
                items: []
            };
        }

        // IMPORTANT: Només s'avalua la data de mandat individual OGS
        const targetDateStr = r.data_final_individual;
        const d = parseDate(targetDateStr);

        let status = 'sense_data';
        if (d) {
            if (d < now) {
                status = 'caducat';
            } else if (d <= thresholdDate) {
                status = 'propera';
            } else {
                status = 'vigent';
            }
        }

        const personaText = getPersonaDisplayName(r);
        const rawReg = (r.n_registre || r.reg || "").toString().trim();
        const cleanReg = rawReg.replace(/^0+/, '');

        const itemInfo = {
            id: r.id,
            entitat: r.entitat || "Entitat sense nom",
            codi_sac: r.codi_sac || "",
            reg: cleanReg || rawReg || "—",
            carrec: r.carrec || r.membre_tipus || "Càrrec",
            persona: personaText,
            status: status,
            dateStr: targetDateStr || '—',
            dateFormatted: formatDateDisplay(d, targetDateStr),
            dateObj: d,
            dateSource: 'Mandat OGS'
        };

        naturesMap[rawNature].items.push(itemInfo);

        if (status === 'vigent') {
            naturesMap[rawNature].vigents++;
            globalTotals.vigents++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else if (status === 'propera') {
            naturesMap[rawNature].propers++;
            globalTotals.propers++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else if (status === 'caducat') {
            naturesMap[rawNature].caducats++;
            globalTotals.caducats++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else {
            // No informat: s'inclou al còmput total i a la barra de data informada
            naturesMap[rawNature].noInformats++;
            globalTotals.noInformats++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        }
    });

    state.legalNatures = naturesMap;
    state.totals = globalTotals;
}

/**
 * Formata una data per a la seva presentació a les taules (DD/MM/YYYY)
 */
function formatDateDisplay(dateObj, originalStr) {
    if (!dateObj) return originalStr || '—';
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/**
 * Càlcul per a Consells d'Administració (CA):
 * En mode CA, s'avalua directament el conjunt de dades oficial dels Consells d'Administració (nmgt-rq9t).
 * Reflecteix els consellers reals, els seus càrrecs autèntics dins del consell (President, Vicepresident,
 * Conseller, Vocal, Secretari no conseller...) i les seves dates de vigència de mandat reals.
 */
function recalculateConsellsAdmon(now, thresholdDate) {
    const naturesMap = {};
    const globalTotals = { vigents: 0, propers: 0, caducats: 0, noInformats: 0, total: 0 };

    // Mapa auxiliar d'entitats per enriquir amb SAC i naturalesa jurídica des de state.records
    const entityMap = new Map();
    state.records.forEach(r => {
        const rawReg = (r.n_registre || r.reg || "").toString().trim();
        const cleanReg = rawReg.replace(/^0+/, '');
        const normName = baseNorm(r.entitat || r.denominacio || "");
        const payload = {
            entitat: r.entitat || r.denominacio || "",
            codi_sac: r.codi_sac || "",
            natureza: (r.part_natureza && r.part_natureza.trim() !== "-" && r.part_natureza.trim() !== "") ? r.part_natureza.trim() : "Societat mercantil"
        };
        if (cleanReg && !entityMap.has(`reg_${cleanReg}`)) entityMap.set(`reg_${cleanReg}`, payload);
        if (normName && !entityMap.has(`name_${normName}`)) entityMap.set(`name_${normName}`, payload);
    });

    const caData = state.caRecords || [];

    caData.forEach(d => {
        // Ignorem files buides de resum que no contenen cap càrrec informat a l'òrgan
        if (!d.c_rrec_en_l_rgan_de_govern_superior || !d.c_rrec_en_l_rgan_de_govern_superior.trim()) {
            return;
        }

        const rawReg = (d.n_mero_de_registre || "").toString().trim();
        const cleanReg = rawReg.replace(/^0+/, '');
        const rawNom = (d.denominaci || "").trim();
        const normNom = baseNorm(rawNom);

        const meta = (cleanReg && entityMap.get(`reg_${cleanReg}`)) || (normNom && entityMap.get(`name_${normNom}`)) || {};
        const entitat = meta.entitat || rawNom || "Entitat sense nom";
        const codi_sac = meta.codi_sac || "";
        const rawNature = meta.natureza || "Societat mercantil";

        if (!naturesMap[rawNature]) {
            naturesMap[rawNature] = {
                name: rawNature,
                vigents: 0,
                propers: 0,
                caducats: 0,
                noInformats: 0,
                total: 0,
                items: []
            };
        }

        // Càrrec autèntic del consell (p.ex: "01-President" -> "President", "15-Conseller" -> "Conseller")
        const rawCarrec = d.c_rrec_en_l_rgan_de_govern_superior.trim();
        const carrecNet = rawCarrec.replace(/^\d+-/, "").trim() || "Conseller";

        // Persona física o representant de persona jurídica
        const qualif = (d.qualificador || "").toLowerCase();
        const isJuridica = qualif.includes("jur");
        let personaText = "";

        if (isJuridica) {
            const rep = `${d.nom_representant_p_jur_dica || ''} ${d.cognoms_representant_p_jur_dica || ''}`.trim();
            const soc = d.denominaci_social || 'Entitat Jurídica';
            if (rep) {
                personaText = `${rep} (Rep. de ${soc})`;
            } else {
                personaText = `${soc} (Persona jurídica)`;
            }
        } else {
            const pNom = `${d.nom_representant || ''} ${d.cognoms_representant || ''}`.trim();
            if (pNom) {
                personaText = pNom;
            } else if (qualif.includes("vacant")) {
                personaText = "(Vacant)";
            } else {
                personaText = "Persona no informada";
            }
        }

        // Data real de vigència de mandat del conseller
        const targetDateStr = d.data_final_de_vig_ncia ? d.data_final_de_vig_ncia.trim() : "";
        const dateObj = parseDate(targetDateStr);

        let status = 'sense_data';
        if (dateObj) {
            if (dateObj < now) {
                status = 'caducat';
            } else if (dateObj <= thresholdDate) {
                status = 'propera';
            } else {
                status = 'vigent';
            }
        }

        const itemInfo = {
            id: d.id || `${cleanReg}_${carrecNet}_${personaText}_${targetDateStr}`,
            entitat: entitat,
            codi_sac: codi_sac,
            reg: cleanReg || rawReg || "—",
            persona: personaText,
            carrec: carrecNet,
            carrecSecundari: d.c_rrec_o_lloc_de_treball ? d.c_rrec_o_lloc_de_treball.trim() : "",
            status: status,
            dateStr: targetDateStr || "—",
            dateFormatted: formatDateDisplay(dateObj, targetDateStr),
            dateObj: dateObj,
            dateSource: "Mandat CA"
        };

        naturesMap[rawNature].items.push(itemInfo);

        if (status === 'vigent') {
            naturesMap[rawNature].vigents++;
            globalTotals.vigents++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else if (status === 'propera') {
            naturesMap[rawNature].propers++;
            globalTotals.propers++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else if (status === 'caducat') {
            naturesMap[rawNature].caducats++;
            globalTotals.caducats++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        } else {
            // Sense data / No informat
            naturesMap[rawNature].noInformats++;
            globalTotals.noInformats++;
            naturesMap[rawNature].total++;
            globalTotals.total++;
        }
    });

    state.legalNatures = naturesMap;
    state.totals = globalTotals;
}

/**
 * Genera el codi SVG per a un arc semicircular donat un rang de proporcions [pStart, pEnd]
 * viewBox: 0 0 200 102, centre: (100, 90), radi: 72
 */
function createArcSvgPath(pStart, pEnd, r = 72, cx = 100, cy = 90) {
    if (pEnd <= pStart) return '';
    const p1 = Math.max(0, Math.min(1, pStart));
    const p2 = Math.max(0, Math.min(1, pEnd));
    if (p2 - p1 <= 0.0005) return '';

    // De p=0 (esquerra, angle PI) a p=1 (dreta, angle 0)
    const angle1 = Math.PI * (1 - p1);
    const angle2 = Math.PI * (1 - p2);

    const x1 = cx + r * Math.cos(angle1);
    const y1 = cy - r * Math.sin(angle1);
    const x2 = cx + r * Math.cos(angle2);
    const y2 = cy - r * Math.sin(angle2);

    // CRÍTIC: En un semicercle la longitud angular màxima és 180° (PI radians).
    // A SVG, large-arc-flag és 0 per a qualsevol arc <= 180°.
    // Fixar-lo sempre a 0 garanteix que SVG dibuixi directament pel semicercle
    // i mai no faci un bucle gegant inflat per l'arc major de 360°!
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Construeix la barra de completesa (Informats vs No informats / Sense data)
 * que es mostra a sobre de cada potenciòmetre
 */
function buildCompletenessBarHtml(informats, noInformats, total) {
    if (!total || total === 0) return '';
    const pctInformat = ((informats / total) * 100).toFixed(1);
    const pctNoInformat = ((noInformats / total) * 100).toFixed(1);

    return `
        <div class="completeness-container" title="Qualitat de dades: ${informats} de ${total} informats (${pctInformat}%), ${noInformats} sense data (${pctNoInformat}%)">
            <div class="completeness-header">
                <div class="completeness-label-left">
                    <span class="stat-dot blue" style="width: 6px; height: 6px;"></span>
                    <span>Informats: <strong>${pctInformat}%</strong> <span style="opacity: 0.75; font-weight: 500;">(${informats}/${total})</span></span>
                </div>
            </div>
            <div class="completeness-bar">
                <div class="completeness-fill-informed" style="width: ${pctInformat}%;"></div>
                <div class="completeness-fill-missing" style="width: ${pctNoInformat}%;"></div>
            </div>
        </div>
    `;
}

/**
 * Construeix el contingut SVG del potenciòmetre amb 3 trams de mandats informats:
 * 1. Verd (Vigent) a l'esquerra
 * 2. Taronja (Propera caducitat)
 * 3. Vermell (Caducat) a la dreta
 */
function buildGaugeSvg(vigents, propers, caducats, isHero = false) {
    const strokeWidth = isHero ? 13 : 12;
    const r = 72;
    const cx = 100;
    const cy = 90;

    const totalInformats = (vigents || 0) + (propers || 0) + (caducats || 0);

    if (totalInformats === 0) {
        return `
            <svg class="gauge-svg" viewBox="0 0 200 102">
                <path class="gauge-track" d="M 28 90 A 72 72 0 0 1 172 90" stroke-width="${strokeWidth}" />
                <g class="gauge-needle-group" style="transform: rotate(-90deg); transform-origin: 100px 90px;">
                    <polygon class="gauge-needle" points="98.2,90 101.8,90 100.5,24 99.5,24" />
                    <circle class="gauge-needle-pin" cx="100" cy="90" r="4.5" />
                </g>
            </svg>
        `;
    }

    const fVigent = (vigents || 0) / totalInformats;
    const fProper = (propers || 0) / totalInformats;
    const fCaducat = (caducats || 0) / totalInformats;

    // Seccions d'esquerra a dreta (0 a 1):
    // 1. Verd (Vigents): de 0 a fVigent
    const greenPath = createArcSvgPath(0, fVigent, r, cx, cy);
    // 2. Taronja (Propers a caducar): de fVigent a fVigent + fProper
    const orangePath = createArcSvgPath(fVigent, fVigent + fProper, r, cx, cy);
    // 3. Vermell (Caducats): de fVigent + fProper a 1.0
    const redPath = createArcSvgPath(fVigent + fProper, 1, r, cx, cy);

    // Agulla: frontera entre vàlids (verd + taronja) i caducats (vermell)
    const pBoundary = fVigent + fProper;
    const needleDeg = (-90 + (pBoundary * 180)).toFixed(1);

    return `
        <svg class="gauge-svg" viewBox="0 0 200 102">
            <path class="gauge-track" d="M 28 90 A 72 72 0 0 1 172 90" stroke-width="${strokeWidth}" />
            ${greenPath ? `<path class="gauge-arc-green" d="${greenPath}" stroke-width="${strokeWidth}" />` : ''}
            ${orangePath ? `<path class="gauge-arc-orange" d="${orangePath}" stroke-width="${strokeWidth}" />` : ''}
            ${redPath ? `<path class="gauge-arc-red" d="${redPath}" stroke-width="${strokeWidth}" />` : ''}
            <g class="gauge-needle-group" style="transform: rotate(${needleDeg}deg); transform-origin: 100px 90px;">
                <polygon class="gauge-needle" points="98.2,90 101.8,90 100.5,24 99.5,24" />
                <circle class="gauge-needle-pin" cx="100" cy="90" r="4.5" />
            </g>
        </svg>
    `;
}

/**
 * Renderitza la targeta Hero del Total Global del Sector Públic
 */
function renderHeroGauge(totals) {
    const heroCard = document.getElementById('heroGaugeCard');
    if (!heroCard) return;

    const isCA = state.mode === 'ca';
    const titleText = isCA ? "Consells d'Administració (CA) - Global" : "Òrgans de Govern Superior (OGS) - Global";
    const subtitleText = isCA 
        ? "Estat consolidat dels mandats dels consellers dels Consells d'Administració (Societats Mercantils). L'agulla marca la divisió entre consellers vigents i caducats."
        : "Estat consolidat dels mandats individuals dels membres dels Òrgans de Govern Superior (OGS). L'agulla marca la divisió entre càrrecs legalment vàlids i caducats.";
    const unitLabel = isCA ? "consellers" : "càrrecs";

    const informats = totals.vigents + totals.propers + totals.caducats;
    const noInformats = totals.noInformats || 0;
    const total = totals.total;

    const pctVigentsTotal = informats > 0 ? (((totals.vigents + totals.propers) / informats) * 100).toFixed(1) : '0.0';
    const pctVigent = informats > 0 ? ((totals.vigents / informats) * 100).toFixed(1) : '0.0';
    const pctProper = informats > 0 ? ((totals.propers / informats) * 100).toFixed(1) : '0.0';
    const pctCaducat = informats > 0 ? ((totals.caducats / informats) * 100).toFixed(1) : '0.0';

    const completenessBarHtml = buildCompletenessBarHtml(informats, noInformats, total);
    const svgHtml = buildGaugeSvg(totals.vigents, totals.propers, totals.caducats, true);

    heroCard.innerHTML = `
        <div class="hero-info">
            <div class="hero-title">
                <i data-lucide="${isCA ? 'building' : 'shield-alert'}" style="color: var(--primary); width: 26px; height: 26px;"></i>
                ${titleText}
            </div>
            <p class="hero-subtitle">${subtitleText}</p>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
                Threshold de pròxima caducitat: <strong style="color: var(--gauge-orange);">${state.monthsThreshold} mesos</strong>
            </div>
        </div>

        <div class="gauge-svg-container">
            ${completenessBarHtml}
            ${svgHtml}
            <div class="gauge-center-metrics" title="Vigents: ${totals.vigents + totals.propers} de ${informats} informats (${pctVigentsTotal}%)">
                <div class="gauge-percentage color-green">${pctVigentsTotal}%</div>
                <div class="gauge-percentage-label">Vigents</div>
            </div>
        </div>

        <div class="hero-stats-grid">
            <div class="stat-badge-row">
                <div class="stat-badge-label">
                    <span class="stat-dot green"></span> Vigents (> ${state.monthsThreshold}m)
                </div>
                <div class="stat-badge-val color-green">${totals.vigents.toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; opacity: 0.8;">(${pctVigent}%)</span></div>
            </div>

            <div class="stat-badge-row">
                <div class="stat-badge-label">
                    <span class="stat-dot orange"></span> Propers (&le; ${state.monthsThreshold}m)
                </div>
                <div class="stat-badge-val color-orange">${totals.propers.toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; opacity: 0.8;">(${pctProper}%)</span></div>
            </div>

            <div class="stat-badge-row">
                <div class="stat-badge-label">
                    <span class="stat-dot red"></span> Caducats
                </div>
                <div class="stat-badge-val color-red">${totals.caducats.toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; opacity: 0.8;">(${pctCaducat}%)</span></div>
            </div>

            <div class="stat-badge-row" style="opacity: 0.9;">
                <div class="stat-badge-label">
                    <span class="stat-dot blue"></span> Amb data informada
                </div>
                <div class="stat-badge-val color-blue">${informats.toLocaleString()} <span style="font-size: 0.75rem; font-weight: 600; opacity: 0.8;">(${total > 0 ? ((informats / total) * 100).toFixed(1) : '0.0'}%)</span></div>
            </div>

            <div class="stat-badge-row" style="opacity: 0.85;">
                <div class="stat-badge-label">
                    <span class="stat-dot muted"></span> Total ${unitLabel} avaluats
                </div>
                <div class="stat-badge-val">${total.toLocaleString()}</div>
            </div>
        </div>
    `;
}

/**
 * Renderitza la graella de potenciòmetres individuals per Naturalesa Jurídica
 */
function renderNaturesGrid(naturesMap) {
    const grid = document.getElementById('gaugesGrid');
    if (!grid) return;

    const isCA = state.mode === 'ca';
    const unitLabel = isCA ? "consellers" : "càrrecs";

    // Ordenar per volum de càrrecs/consells de major a menor
    const sortedNatures = Object.values(naturesMap).sort((a, b) => b.total - a.total);

    if (sortedNatures.length === 0) {
        grid.innerHTML = '<div class="loading-state">No s\'han trobat dades per a aquest tipus d\'òrgan.</div>';
        return;
    }

    grid.innerHTML = sortedNatures.map(nat => {
        const informats = nat.vigents + nat.propers + nat.caducats;
        const noInformats = nat.noInformats || 0;
        const total = nat.total;

        const pctVigentsTotal = informats > 0 ? (((nat.vigents + nat.propers) / informats) * 100).toFixed(1) : '0.0';
        const pctVigent = informats > 0 ? ((nat.vigents / informats) * 100).toFixed(1) : '0.0';
        const pctProper = informats > 0 ? ((nat.propers / informats) * 100).toFixed(1) : '0.0';
        const pctCaducat = informats > 0 ? ((nat.caducats / informats) * 100).toFixed(1) : '0.0';

        const completenessBarHtml = buildCompletenessBarHtml(informats, noInformats, total);
        const svgHtml = buildGaugeSvg(nat.vigents, nat.propers, nat.caducats, false);

        return `
            <div class="gauge-card" data-nature="${escapeHtml(nat.name)}">
                <div class="gauge-card-header">
                    <span class="gauge-natureza-name" title="${escapeHtml(nat.name)}">${escapeHtml(nat.name)}</span>
                    <span class="gauge-total-chip">${nat.total} ${unitLabel}</span>
                </div>

                <div class="gauge-svg-container">
                    ${completenessBarHtml}
                    ${svgHtml}
                    <div class="gauge-center-metrics" title="Vigents: ${nat.vigents + nat.propers} de ${informats} informats (${pctVigentsTotal}%)">
                        <div class="gauge-percentage color-green">${pctVigentsTotal}%</div>
                        <div class="gauge-percentage-label">Vigents</div>
                    </div>
                </div>

                <div class="gauge-legend">
                    <div class="gauge-legend-item">
                        <span class="gauge-legend-dot-title"><span class="stat-dot green" style="width: 7px; height: 7px;"></span> Vigents</span>
                        <span class="gauge-legend-value color-green">${nat.vigents}</span>
                        <span class="gauge-legend-pct color-green">${pctVigent}%</span>
                    </div>
                    <div class="gauge-legend-item">
                        <span class="gauge-legend-dot-title"><span class="stat-dot orange" style="width: 7px; height: 7px;"></span> Propers</span>
                        <span class="gauge-legend-value color-orange">${nat.propers}</span>
                        <span class="gauge-legend-pct color-orange">${pctProper}%</span>
                    </div>
                    <div class="gauge-legend-item">
                        <span class="gauge-legend-dot-title"><span class="stat-dot red" style="width: 7px; height: 7px;"></span> Caducats</span>
                        <span class="gauge-legend-value color-red">${nat.caducats}</span>
                        <span class="gauge-legend-pct color-red">${pctCaducat}%</span>
                    </div>
                </div>

                <div class="gauge-card-footer">
                    <button class="btn-view-details" type="button">
                        <span>Veure detall</span>
                        <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Obre el modal amb la llista detallada d'entitats i càrrecs per a una naturalesa jurídica
 */
function openNatureModal(natureName) {
    if (!natureName) return;
    const natureData = state.legalNatures[natureName];
    if (!natureData) return;

    state.activeModalNature = natureName;
    state.modalSearchTerm = '';

    const isCA = state.mode === 'ca';
    const unitLabel = isCA ? "consellers" : "càrrecs";

    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const searchInput = document.getElementById('modalSearchInput');

    if (modalTitle) modalTitle.textContent = `${natureName} (${isCA ? "Consells d'Administració" : "Òrgans de Govern Superior"})`;
    if (modalSubtitle) {
        modalSubtitle.textContent = `${natureData.total} ${unitLabel} avaluats (${natureData.caducats} caducats, ${natureData.propers} propers a caducar en ${state.monthsThreshold}m)`;
    }
    if (searchInput) searchInput.value = '';

    renderModalTable();

    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    if (window.lucide) lucide.createIcons();
}
window.openNatureModal = openNatureModal;

/**
 * Tanca el modal de detall
 */
function closeModal() {
    state.activeModalNature = null;
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

/**
 * Renderitza les files de la taula dins del modal
 */
function renderModalTable() {
    const tableHead = document.getElementById('modalTableHead');
    const tableBody = document.getElementById('modalTableBody');
    if (!tableBody || !state.activeModalNature) return;

    const natureData = state.legalNatures[state.activeModalNature];
    if (!natureData) return;

    const isCA = state.mode === 'ca';

    // Adaptació de capçaleres segons mode OGS o CA
    if (tableHead) {
        if (isCA) {
            tableHead.innerHTML = `
                <tr>
                    <th style="width: 30%;">Entitat</th>
                    <th style="width: 25%;">Conseller / Persona</th>
                    <th style="width: 20%;">Càrrec al Consell</th>
                    <th style="width: 15%;">Data Fi CA</th>
                    <th style="width: 10%;">Estat</th>
                </tr>
            `;
        } else {
            tableHead.innerHTML = `
                <tr>
                    <th style="width: 32%;">Entitat</th>
                    <th style="width: 25%;">Persona</th>
                    <th style="width: 20%;">Càrrec</th>
                    <th style="width: 13%;">Data Fi OGS</th>
                    <th style="width: 10%;">Estat</th>
                </tr>
            `;
        }
    }

    const term = state.modalSearchTerm;
    let items = natureData.items;

    // Filtre de cerca
    if (term) {
        items = items.filter(item => 
            item.entitat.toLowerCase().includes(term) ||
            (item.persona && item.persona.toLowerCase().includes(term)) ||
            (item.carrec && item.carrec.toLowerCase().includes(term)) ||
            (item.carrecSecundari && item.carrecSecundari.toLowerCase().includes(term)) ||
            (item.codi_sac && item.codi_sac.toLowerCase().includes(term)) ||
            (item.reg && item.reg.toLowerCase().includes(term))
        );
    }

    if (items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Cap element coincideix amb la cerca.</td></tr>`;
        return;
    }

    // Ordenar: Caducats primer, després propers, després vigents
    const orderPriority = { 'caducat': 1, 'propera': 2, 'vigent': 3, 'sense_data': 4 };
    const sorted = [...items].sort((a, b) => {
        const pa = orderPriority[a.status] || 99;
        const pb = orderPriority[b.status] || 99;
        if (pa !== pb) return pa - pb;
        const entComp = a.entitat.localeCompare(b.entitat);
        if (entComp !== 0) return entComp;
        return (a.carrec || "").localeCompare(b.carrec || "");
    });

    tableBody.innerHTML = sorted.map(item => {
        let badgeClass = 'vigent';
        let badgeText = 'Vigent';

        if (item.status === 'caducat') {
            badgeClass = 'caducat';
            badgeText = 'Caducat';
        } else if (item.status === 'propera') {
            badgeClass = 'propera';
            badgeText = `Propera (&le; ${state.monthsThreshold}m)`;
        } else if (item.status === 'sense_data') {
            badgeClass = 'no_informat';
            badgeText = 'No informat';
        }

        return `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(item.entitat)}</div>
                    ${item.codi_sac ? `<div style="font-size: 0.7rem; color: var(--primary);">SAC: ${escapeHtml(item.codi_sac)}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(item.persona)}</div>
                    ${item.reg && item.reg !== '—' ? `<div style="font-size: 0.65rem; color: var(--text-muted);">Reg: ${escapeHtml(item.reg)}</div>` : ''}
                </td>
                <td>
                    <div style="color: var(--text-muted); font-size: 0.75rem; font-weight: 600;">${escapeHtml(item.carrec)}</div>
                    ${item.carrecSecundari ? `<div style="color: var(--text-muted); font-size: 0.65rem; font-style: italic; margin-top: 2px;">${escapeHtml(item.carrecSecundari)}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight: 600; font-family: monospace;">${item.dateFormatted || item.dateStr}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted);">${escapeHtml(item.dateSource)}</div>
                </td>
                <td>
                    <span class="badge-status ${badgeClass}">${badgeText}</span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Utilitats de visualització d'estats de càrrega o buits
 */
function showLoading(show) {
    const loader = document.getElementById('dashboardLoader');
    if (loader) loader.style.display = show ? 'block' : 'none';
}

function showEmptyDBState() {
    const grid = document.getElementById('gaugesGrid');
    const heroCard = document.getElementById('heroGaugeCard');
    if (heroCard) heroCard.style.display = 'none';

    if (grid) {
        grid.innerHTML = `
            <div class="empty-state-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; background: var(--bg-card); border-radius: 16px; border: 1px dashed var(--border-color);">
                <i data-lucide="database" style="width: 48px; height: 48px; color: var(--primary); margin-bottom: 1rem;"></i>
                <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem;">No s'han trobat dades locals</h3>
                <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 1.5rem;">
                    La base de dades local encara no ha descarregat els registres del Sector Públic. 
                    Accediu a la pàgina principal de consulta per sincronitzar les dades.
                </p>
                <a href="index.html" class="btn" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 0.75rem 1.5rem;">
                    <i data-lucide="arrow-left" style="width: 16px;"></i>
                    Anar a la Consulta i Sincronitzar
                </a>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }
}

function showErrorState(err) {
    const grid = document.getElementById('gaugesGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="empty-state-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(239, 68, 68, 0.1); border-radius: 16px; border: 1px solid var(--gauge-red);">
                <i data-lucide="alert-triangle" style="width: 40px; height: 40px; color: var(--gauge-red); margin-bottom: 1rem;"></i>
                <h3 style="color: var(--gauge-red); margin-bottom: 0.5rem;">Error en carregar les dades</h3>
                <p style="color: var(--text-muted);">${escapeHtml(err.message || String(err))}</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
