/**
 * fundacions-service.js - Consulta i comparativa de noms amb el Registre de Fundacions
 * Utilitza els datasets d'Open Data Catalunya:
 * - Guia d'entitats (y6fz-g3ff)
 * - Òrgans de govern (i46c-ebpp)
 */
import { API } from './api.js';
import { CONFIG } from './config.js';
import { baseNorm, isPersonaJuridica } from './utils.js';

const BATCH_SIZE = 50;

const NAME_EQUIV = {
    "ma": "maria", "m": "maria",
    "josep": "jose", "pep": "jose",
    "joan": "juan", "francesc": "francisco", "paco": "francisco",
    "carles": "carlos", "pere": "pedro", "jaume": "jaime",
    "jordi": "jorge", "xavier": "javier", "antoni": "antonio",
    "enric": "enrique", "lluis": "luis", "miquel": "miguel",
    "marc": "marcos", "pau": "pablo", "ricard": "ricardo",
    "eduard": "eduardo", "albert": "alberto", "ferran": "fernando",
    "joaquim": "joaquin", "marti": "martin", "guillem": "guillermo",
    "mateu": "mateo", "esteve": "esteban", "ignasi": "ignacio",
    "gerard": "gerardo", "anna": "ana", "elisabet": "isabel",
    "dolors": "dolores", "merce": "mercedes", "carme": "carmen",
    "angels": "angeles", "angel": "angeles", "montse": "montserrat",
    "helena": "elena", "esther": "ester"
};

const PARTICLES = new Set(["i", "y", "de", "del", "dels", "la", "les", "el", "els", "d", "s", "l"]);

function normStr(val) {
    return val == null ? "" : String(val).trim();
}

function normalizeCompareText(text) {
    let s = normStr(text).replace(/\s+/g, " ");
    if (s.includes(",")) {
        const parts = s.split(",").map(p => p.trim()).filter(Boolean);
        if (parts.length === 2) {
            s = `${parts[1]} ${parts[0]}`;
        }
    }
    return s.toLowerCase();
}

function stripDiacritics(s) {
    return normStr(s)
        .replace(/·/g, "")
        .replace(/ª/g, "a")
        .replace(/º/g, "o")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function phoneticCatEs(token) {
    let t = stripDiacritics(token);
    if (NAME_EQUIV[t]) t = NAME_EQUIV[t];
    t = t
        .replace(/h/g, "")
        .replace(/ny/g, "n")
        .replace(/v/g, "b")
        .replace(/qu([ei])/g, "k$1")
        .replace(/q/g, "k")
        .replace(/c([aou])/g, "k$1")
        .replace(/g([ei])/g, "j$1")
        .replace(/ç/g, "s")
        .replace(/z/g, "s")
        .replace(/c([ei])/g, "s$1")
        .replace(/tx/g, "ch")
        .replace(/ix/g, "x")
        .replace(/(.)\1+/g, "$1");
    return t;
}

function tokenizeName(name) {
    return stripDiacritics(name)
        .replace(/[.,;:/\\\-_'’"()]/g, " ")
        .split(/\s+/)
        .filter(t => t && !PARTICLES.has(t));
}

function levenshteinSim(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return 1 - dp[m][n] / Math.max(m, n);
}

function nameVariantScore(nameA, nameB) {
    const tokA = tokenizeName(nameA);
    const tokB = tokenizeName(nameB);
    if (tokA.length === 0 || tokB.length === 0) return 0;
    if (tokA[0] === "[vacant]" || tokB[0] === "[vacant]") return 0;

    const phA = tokA.map(phoneticCatEs);
    const phB = tokB.map(phoneticCatEs);

    if (phA.length === 1 && phB.length === 1) {
        const sim = levenshteinSim(phA[0], phB[0]);
        return sim >= 0.85 ? sim : 0;
    }
    if (phA.length === 1 || phB.length === 1) return 0;

    const usedB = new Array(phB.length).fill(false);
    let matchedWeight = 0;
    let surnameMatched = false;

    for (let i = 0; i < phA.length; i++) {
        let bestJ = -1;
        let bestS = 0;
        for (let j = 0; j < phB.length; j++) {
            if (usedB[j]) continue;
            let s = 0;
            if (phA[i] === phB[j]) {
                s = 1.0;
            } else if ((tokA[i].length === 1 && tokB[j].startsWith(tokA[i])) ||
                       (tokB[j].length === 1 && tokA[i].startsWith(tokB[j])) ||
                       (phA[i].length === 1 && phB[j].startsWith(phA[i])) ||
                       (phB[j].length === 1 && phA[i].startsWith(phB[j]))) {
                s = 0.82;
            } else {
                const lsim = levenshteinSim(phA[i], phB[j]);
                if (lsim >= 0.78) s = lsim;
            }
            if (s > bestS) { bestS = s; bestJ = j; }
        }
        if (bestJ >= 0 && bestS >= 0.78) {
            usedB[bestJ] = true;
            matchedWeight += bestS;
            if (i > 0 && bestJ > 0) surnameMatched = true;
        }
    }

    if (!surnameMatched) return 0;
    const minLen = Math.min(phA.length, phB.length);
    const maxLen = Math.max(phA.length, phB.length);
    if (matchedWeight < 1.7) return 0;
    const score = (matchedWeight / maxLen) * 0.5 + (matchedWeight / minLen) * 0.5;
    return score >= 0.78 ? score : 0;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export const FundacionsService = {
    /**
     * Obté els membres dels òrgans de govern del Registre de Fundacions per a totes les
     * entitats de tipus Fundació presents a participacioRaw (gr39-ik6u).
     */
    async fetchFundacionsGovernLookup(participacioRaw, onProgress) {
        const lookup = new Map();
        if (!Array.isArray(participacioRaw) || participacioRaw.length === 0) return lookup;

        const fundacionsRows = participacioRaw.filter(d => {
            const nat = (d.naturalesa_jur_dica_agrupaci || d.naturalesa_jur_dica || "").toLowerCase();
            return nat.includes("fundaci");
        });
        if (fundacionsRows.length === 0) return lookup;

        if (onProgress) onProgress({ step: `Consultant Registre de Fundacions (${fundacionsRows.length} entitats)...`, progress: 57 });

        // 1. Cerca per CIF/NIF a Guia d'Entitats (y6fz-g3ff)
        const byCif = new Map();
        const uniqueCifs = [...new Set(
            fundacionsRows.map(r => normStr(r.nif).toUpperCase()).filter(c => c && c !== "NO CONSTA")
        )].sort();

        for (let i = 0; i < uniqueCifs.length; i += BATCH_SIZE) {
            const chunk = uniqueCifs.slice(i, i + BATCH_SIZE);
            const quoted = chunk.map(c => `'${c.replace(/'/g, "''")}'`).join(",");
            const rows = await API.fetchOpenDataWhere(CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID, {
                $where: `upper(cif) in (${quoted})`
            });
            for (const row of rows) {
                const ck = normStr(row.cif).toUpperCase();
                if (ck && (!byCif.has(ck) || normStr(row.tipus_entitat) === "Fundació")) {
                    byCif.set(ck, row);
                }
            }
        }

        // 2. Cerca per número d'inscripció per a les que no tinguin NIF coincident
        const byNum = new Map();
        const missingNums = [...new Set(
            fundacionsRows
                .filter(r => !byCif.has(normStr(r.nif).toUpperCase()) && normStr(r.n_mero_del_registre_de_fundacions))
                .map(r => normStr(r.n_mero_del_registre_de_fundacions))
        )].sort();

        for (let i = 0; i < missingNums.length; i += BATCH_SIZE) {
            const chunk = missingNums.slice(i, i + BATCH_SIZE);
            const quoted = chunk.map(n => `'${n.replace(/'/g, "''")}'`).join(",");
            const rows = await API.fetchOpenDataWhere(CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID, {
                $where: `tipus_entitat='Fundació' AND num_inscripcio in (${quoted})`
            });
            for (const row of rows) {
                const nk = normStr(row.num_inscripcio);
                if (nk) byNum.set(nk, row);
            }
        }

        // 3. Recopilar id_entitat i consultar òrgans de govern (i46c-ebpp)
        const matchedGuia = new Map();
        const idEntitats = new Set();
        fundacionsRows.forEach((spRow, idx) => {
            const nif = normStr(spRow.nif).toUpperCase();
            const nregFund = normStr(spRow.n_mero_del_registre_de_fundacions);
            const gRow = (nif && byCif.get(nif)) || (nregFund && byNum.get(nregFund)) || null;
            if (gRow) {
                matchedGuia.set(idx, gRow);
                const eid = normStr(gRow.id_entitat);
                if (eid) idEntitats.add(eid);
            }
        });

        const governById = new Map();
        const uniqueIds = [...idEntitats].sort();
        for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
            const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
            const quoted = chunk.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
            const rows = await API.fetchOpenDataWhere(CONFIG.OPEN_DATA.GUIA_GOVERN_RESOURCE_ID, {
                $where: `id_entitat in (${quoted})`,
                $order: "id_entitat,ordre_carrec,persona"
            });
            for (const row of rows) {
                const eid = normStr(row.id_entitat);
                if (!eid) continue;
                if (!governById.has(eid)) governById.set(eid, []);
                governById.get(eid).push({
                    ordre_carrec: normStr(row.ordre_carrec),
                    carrec: normStr(row.carrec),
                    persona: normStr(row.persona)
                });
            }
        }

        // 4. Indexar per número de registre RSP i per denominació normalitzada
        fundacionsRows.forEach((spRow, idx) => {
            const gRow = matchedGuia.get(idx);
            const eid = gRow ? normStr(gRow.id_entitat) : "";
            const members = eid ? (governById.get(eid) || []) : [];
            const payload = {
                id_entitat: eid,
                num_inscripcio: gRow ? normStr(gRow.num_inscripcio) : "",
                members
            };

            const nReg = normStr(spRow.n_mero_de_registre).replace(/^0+/, '');
            const nEns = baseNorm(spRow.denominaci);
            if (nReg) lookup.set(nReg, payload);
            if (nEns) lookup.set(nEns, payload);
        });

        return lookup;
    },

    /**
     * Comprova una llista de noms candidats contra els membres del Registre de Fundacions.
     */
    matchNamesInFundacio(candidateNames, fundacioEntry) {
        if (!fundacioEntry || !Array.isArray(fundacioEntry.members) || fundacioEntry.members.length === 0) {
            return { status: 'no_data' };
        }

        const members = fundacioEntry.members;
        const validNames = (candidateNames || []).map(normStr).filter(n => {
            const low = n.toLowerCase();
            return low && low !== 'no informat' && low !== 'persona no informada' && low !== 'representant pendent';
        });

        if (validNames.length === 0) {
            return { status: 'no_person', totalFundacio: members.length };
        }

        // 1. Coincidència exacta (normalitzada)
        for (const cand of validNames) {
            const candNorm = normalizeCompareText(cand);
            for (const m of members) {
                if (candNorm && normalizeCompareText(m.persona) === candNorm) {
                    return {
                        status: 'match',
                        matchedPersona: m.persona,
                        matchedCarrec: m.carrec
                    };
                }
            }
        }

        // 2. Coincidència per variant fonètica / ortogràfica
        let bestVariant = null;
        let bestScore = 0;
        for (const cand of validNames) {
            for (const m of members) {
                const score = nameVariantScore(cand, m.persona);
                if (score > bestScore) {
                    bestScore = score;
                    bestVariant = m;
                }
            }
        }
        if (bestVariant) {
            return {
                status: 'variant',
                matchedPersona: bestVariant.persona,
                matchedCarrec: bestVariant.carrec
            };
        }

        return { status: 'no_match', totalFundacio: members.length };
    },

    /**
     * Comprova si un nom concret (p.ex. sac_nom_responsable) consta al Registre de Fundacions.
     */
    matchNameInFundacio(nameStr, fundacioEntry) {
        if (!nameStr || !normStr(nameStr)) return null;
        return this.matchNamesInFundacio([nameStr], fundacioEntry);
    },

    /**
     * Comprova si el nom d'un registre coincideix amb algun membre del Registre de Fundacions.
     */
    matchPersonInFundacio(record, fundacioEntry) {
        if (!record) return null;
        if (!fundacioEntry || !Array.isArray(fundacioEntry.members) || fundacioEntry.members.length === 0) {
            return { status: 'no_data' };
        }

        if ((record.qualificador || "").toLowerCase().includes("vacant")) {
            return { status: 'no_person', totalFundacio: fundacioEntry.members.length };
        }

        const candidateNames = [];
        if (isPersonaJuridica(record)) {
            const rep = `${record.nom_rep || ''} ${record.cognoms_rep || ''}`.trim();
            if (rep) candidateNames.push(rep);
            if (record.persona_nom) candidateNames.push(normStr(record.persona_nom));
            if (record.denom_social) candidateNames.push(normStr(record.denom_social));
        } else {
            const pNom = `${record.persona_nom || ''} ${record.persona_cognoms || ''}`.trim();
            if (pNom) candidateNames.push(pNom);
        }

        return this.matchNamesInFundacio(candidateNames, fundacioEntry);
    }
};

/**
 * Genera el bloc HTML del nivell de comprovació amb el Registre de Fundacions.
 */
export function renderFundacioBadgeHTML(check) {
    if (!check || !check.status || check.status === 'no_person') return '';

    if (check.status === 'match') {
        const title = `Coincideix al Reg. Fundacions: ${check.matchedPersona}${check.matchedCarrec ? ` (${check.matchedCarrec})` : ''}`;
        return `<div class="fundacio-check fundacio-match" title="${escapeHtml(title)}">✓ Consta al Reg. Fundacions</div>`;
    }
    if (check.status === 'variant') {
        const title = `Possible coincidència al Reg. Fundacions: ${check.matchedPersona}${check.matchedCarrec ? ` (${check.matchedCarrec})` : ''}`;
        return `<div class="fundacio-check fundacio-variant" title="${escapeHtml(title)}">≈ Reg. Fundacions: ${escapeHtml(check.matchedPersona)}</div>`;
    }
    if (check.status === 'no_match') {
        const title = `No s'ha trobat cap coincidència entre els ${check.totalFundacio || 0} membres del Registre de Fundacions`;
        return `<div class="fundacio-check fundacio-no-match" title="${escapeHtml(title)}">✗ No consta al Reg. Fundacions</div>`;
    }
    if (check.status === 'no_data') {
        return `<div class="fundacio-check fundacio-no-data" title="Aquesta fundació no té membres informats al Registre de Fundacions">Sense dades al Reg. Fundacions</div>`;
    }
    return '';
}
