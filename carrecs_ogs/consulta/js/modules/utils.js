/**
 * utils.js - Utilitats de normalització i processament de text
 */

/**
 * Normalització base per a claus de mapatge (entitats, càrrecs)
 */
export function baseNorm(raw) {
    if (!raw) return "";
    return raw.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Treure accents
        .replace(/[^a-z0-9]/g, "") // Treure tot el que no sigui alfanumèric
        .trim();
}

/**
 * Normalització específica per a noms de persones (més flexible amb el " i ")
 */
export function baseNormPersona(raw) {
    if (!raw) return "";
    let s = raw.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Eliminem el " i " en la comparació
    s = s.replace(/\bi\b/g, " ");

    // Separem per qualsevol caràcter no alfanumèric, filtrem buits, ordenem i unim
    return s.split(/[^a-z0-9]+/)
        .filter(word => word.length > 0)
        .sort()
        .join("");
}

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

const NAME_PARTICLES = new Set(["i", "y", "de", "del", "dels", "la", "les", "el", "els", "d", "s", "l"]);

export function normalizeCompareText(text) {
    let s = (text == null ? "" : String(text).trim()).replace(/\s+/g, " ");
    if (s.includes(",")) {
        const parts = s.split(",").map(p => p.trim()).filter(Boolean);
        if (parts.length === 2) {
            s = `${parts[1]} ${parts[0]}`;
        }
    }
    return s.toLowerCase();
}

function stripNameDiacritics(s) {
    return (s == null ? "" : String(s).trim())
        .replace(/·/g, "")
        .replace(/ª/g, "a")
        .replace(/º/g, "o")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function phoneticCatEs(token) {
    let t = stripNameDiacritics(token);
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
    return stripNameDiacritics(name)
        .replace(/[.,;:/\\\-_'’"()]/g, " ")
        .split(/\s+/)
        .filter(t => t && !NAME_PARTICLES.has(t));
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

/**
 * Calcula la similitud entre dos noms de persona tenint en compte variants català/castellà,
 * fonètica, inicials, partícules i ordre de cognoms.
 */
export function nameVariantScore(nameA, nameB) {
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

/**
 * Comprova si dos noms de persona representen la mateixa persona i indica si és coincidència 'exact' o 'variant'.
 */
export function getPersonNameMatchType(nameA, nameB) {
    if (!nameA || !nameB) return null;
    const n1 = baseNormPersona(nameA);
    const n2 = baseNormPersona(nameB);
    if (!n1 || !n2) return null;
    if (n1 === n2) return 'exact';
    if (normalizeCompareText(nameA) === normalizeCompareText(nameB)) return 'exact';
    return nameVariantScore(nameA, nameB) >= 0.78 ? 'variant' : null;
}

/**
 * Comprova si dos noms de persona representen la mateixa persona (coincidència exacta o per variant).
 */
export function arePersonNamesMatching(nameA, nameB) {
    return Boolean(getPersonNameMatchType(nameA, nameB));
}

/**
 * Generació de clau intel·ligent (SmartKey)
 * Combina entitat, membre i càrrec per identificar un registre únicament
 */
export function getSmartKey(entitat, p1, p2) {
    const nEntitat = baseNorm(entitat);
    const nP1 = baseNorm(p1);
    const nP2 = baseNorm(p2);

    // Ordenar els dos components personals per evitar inversions de camp
    const posicions = [nP1, nP2].sort();
    return `${nEntitat}|${posicions[0]}|${posicions[1]}`;
}

/**
 * Obté un valor d'un objecte provant diversos noms de camp (per robustesa amb l'Open Data)
 */
export function getFieldValue(obj, aliases) {
    for (const alias of aliases) {
        if (obj[alias] !== undefined && obj[alias] !== null) return obj[alias];
    }
    return "";
}
/**
 * Gestió de Temes (Clar / Fosc)
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
    updateThemeIcons();
}

export function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcons();
}

function updateThemeIcons() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isLight = document.body.classList.contains('light-mode');
    btn.innerHTML = `<i data-lucide="${isLight ? 'moon' : 'sun'}" style="width: 20px; height: 20px;"></i>`;
    if (window.lucide) lucide.createIcons();
}

/**
 * Gestió de Popovers de Filtre
 */
window.toggleFilterPopover = function (id) {
    const popover = document.getElementById('popover' + id);
    if (!popover) return;

    const isShowing = popover.classList.contains('show');

    // Tanquem tots els altres popovers primer
    document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));

    if (!isShowing) {
        popover.classList.add('show');
        const input = popover.querySelector('input');
        if (input) input.focus();
    }
};

// Tancar popovers en clicar a fora o prémer Enter als inputs
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sortable-header') && !e.target.closest('.filter-popover')) {
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('column-filter')) {
        document.querySelectorAll('.filter-popover').forEach(p => p.classList.remove('show'));
    }
});

/**
 * Converteix una cadena de text en un objecte Date, suportant formats ISO i europeus.
 */
export function parseDate(dStr) {
    if (!dStr) return null;
    const cleanStr = dStr.trim();

    // Cas 1: ISO YYYY-MM-DD (molt comú en APIs)
    const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }

    // Cas 2: Europeu DD/MM/YYYY
    if (cleanStr.includes('/')) {
        const p = cleanStr.split('/');
        if (p.length === 3) {
            return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
        }
    }

    // Cas 3: Altres formats reconeguts per JS
    const d = new Date(cleanStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Comprova si un registre correspon a una persona jurídica (tolera "P. Júridica" amb accent a la u)
 */
export function isPersonaJuridica(p) {
    if (!p) return false;
    const qualif = (p.qualificador || "").toLowerCase();
    const membreTipus = (p.membre_tipus || "").toLowerCase();
    return /j[uú]r/.test(qualif) || /j[uú]r/.test(membreTipus);
}

/**
 * Comprova si un registre es correspon amb un registre no informat (com a la imatge: "(No informat)", "No informat", "NO APLICA")
 */
export function isNoInformatRecord(p, pendingService = null) {
    if (!p) return false;

    // Si té canvis pendents, cal visualitzar-los expressament
    if (pendingService && pendingService.getPendingChange && pendingService.getPendingChange(p)) {
        return false;
    }

    // Estat: a la imatge es mostra el distintiu "NO APLICA" (no Validat ni Pendent)
    const st = (p.status || "").toLowerCase().trim();
    if (st === 'validat' || st === 'pendent') return false;

    // Vacant expressa: es mostraria com (Vacant)
    const qualif = (p.qualificador || "").toLowerCase();
    if (qualif.includes("vacant")) return false;

    // Persona jurídica amb representant o raó social informada
    if (isPersonaJuridica(p)) {
        const rep = `${p.nom_rep || ''} ${p.cognoms_rep || ''}`.trim();
        const principal = rep || p.persona_nom || p.nom || "";
        if (principal || (p.denom_social && p.denom_social.trim())) {
            return false;
        }
    }

    // Persona física: si té nom real indicat, no coincideix amb la imatge
    const pNom = `${p.persona_nom || p.nom || ''} ${p.persona_cognoms || p.cognoms || ''}`.trim();
    if (pNom) {
        const norm = pNom.toLowerCase().replace(/[\(\)]/g, '').trim();
        if (norm !== 'no informat' && norm !== 'sense persona' && norm !== 'no indicada' && norm !== 'persona no indicada' && norm !== 'persona no informada' && norm !== '') {
            return false;
        }
    }

    if (p.persona && typeof p.persona === 'string' && p.persona.trim()) {
        const normP = p.persona.trim().toLowerCase().replace(/[\(\)]/g, '');
        if (normP !== 'no informat' && normP !== 'sense persona' && normP !== 'no indicada' && normP !== 'persona no indicada' && normP !== 'persona no informada' && normP !== '') {
            return false;
        }
    }

    // Caducitat individual
    if (p.data_final_individual && parseDate(p.data_final_individual)) {
        return false;
    }

    // Referència SAC
    if (p.codi_sac && p.sac_nom_responsable && p.status !== 'Validat') {
        return false;
    }

    return true;
}

/**
 * Agrupa les persones d'un mateix Òrgan / Membre:
 * Si hi ha més d'un registre no informat (com a la imatge), es col·lapsen en una sola fila indicant
 * quantes repeticions hi ha (p.ex: "4 persones no informades").
 * Si n'hi ha un de sol, s'indica "Persona no informada".
 */
export function prepareOrganRenderRows(persons, pendingService = null) {
    if (!persons || persons.length === 0) return [];

    const normalItems = [];
    const noInformats = [];

    persons.forEach(p => {
        if (isNoInformatRecord(p, pendingService)) {
            noInformats.push(p);
        } else {
            normalItems.push(p);
        }
    });

    const getNomenamentText = (r) => {
        const val = r && r.tipus_nomenament ? r.tipus_nomenament.trim() : "";
        if (!val || val.toLowerCase() === 'no informat' || val.toLowerCase() === 'tipus de nomenament no informat') {
            return "Tipus de nomenament no informat";
        }
        return val;
    };

    if (noInformats.length > 1) {
        const rep = noInformats[0];
        const sub = getNomenamentText(rep);
        const groupedItem = {
            isGrouped: true,
            count: noInformats.length,
            titleText: `${noInformats.length} persones no informades`,
            subText: sub,
            persons: noInformats,
            rep: rep,
            firstId: rep.id
        };
        return [...normalItems.map(p => ({ isGrouped: false, person: p })), groupedItem];
    } else if (noInformats.length === 1) {
        const rep = noInformats[0];
        const sub = getNomenamentText(rep);
        const singleItem = {
            isGrouped: true,
            count: 1,
            titleText: "Persona no informada",
            subText: sub,
            persons: noInformats,
            rep: rep,
            firstId: rep.id
        };
        return [...normalItems.map(p => ({ isGrouped: false, person: p })), singleItem];
    } else {
        return persons.map(p => ({ isGrouped: false, person: p }));
    }
}

const URL_STRING_FILTERS = [
    ['search', 'globalSearch'],
    ['dept', 'filterDepartament'],
    ['status', 'filterStatus'],
    ['colSac', 'colFilterSAC'],
    ['colCarrec', 'colFilterCarrec'],
    ['colEntitat', 'colFilterEntitat'],
    ['colOGS', 'colFilterOGS'],
    ['colPersona', 'colFilterPersona']
];

const URL_ARRAY_FILTERS = ['caStatus', 'ogsStatus', 'naturezas', 'qualificadors', 'nomenaments', 'categoritzacions', 'rf'];

const URL_BOOL_FILTERS = [
    ['onlySac', 'toggleSac'],
    ['onlyGovern', 'toggleGovern'],
    ['onlyVacant', 'toggleVacant'],
    ['onlyPendingValidation', 'togglePendingValidation']
];

/**
 * Llegeix els filtres des de window.location.search i actualitza l'estat i els inputs del DOM
 */
export function readFiltersFromURL(filters) {
    if (typeof window === 'undefined' || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);

    for (const [key, domId] of URL_STRING_FILTERS) {
        if (params.has(key)) {
            const val = params.get(key) || "";
            filters[key] = val;
            const el = document.getElementById(domId);
            if (el) el.value = val;
        }
    }

    for (const key of URL_ARRAY_FILTERS) {
        const vals = params.getAll(key).filter(Boolean);
        if (vals.length > 0) {
            filters[key] = vals;
        }
    }

    for (const [key, btnId] of URL_BOOL_FILTERS) {
        if (params.get(key) === '1' || params.get(key) === 'true') {
            filters[key] = true;
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('btn-primary');
        }
    }

    if (params.get('filterMode') === 'additive') {
        filters.filterMode = 'additive';
        const cb = document.getElementById('filterModeCheckbox');
        const sub = document.getElementById('textModeSubtractive');
        const add = document.getElementById('textModeAdditive');
        if (cb) cb.checked = true;
        if (sub) sub.classList.remove('active');
        if (add) add.classList.add('active');
    }

    if (params.has('expireMonths')) {
        const m = parseInt(params.get('expireMonths'), 10);
        if (!isNaN(m) && m >= 1 && m <= 120) {
            filters.expireMonths = m;
            const expEl = document.getElementById('caExpireMonths');
            if (expEl) expEl.value = String(m);
        }
    }
}

/**
 * Sincronitza els filtres actius amb la URL mitjançant history.replaceState
 */
export function syncFiltersToURL(filters) {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const params = new URLSearchParams();

    for (const [key] of URL_STRING_FILTERS) {
        if (filters[key]) params.set(key, filters[key]);
    }

    for (const key of URL_ARRAY_FILTERS) {
        if (Array.isArray(filters[key])) {
            for (const v of filters[key]) {
                if (v) params.append(key, v);
            }
        }
    }

    for (const [key] of URL_BOOL_FILTERS) {
        if (filters[key]) params.set(key, '1');
    }

    if (filters.filterMode === 'additive') {
        params.set('filterMode', 'additive');
    }

    if (params.toString() && filters.expireMonths && filters.expireMonths !== 1) {
        params.set('expireMonths', String(filters.expireMonths));
    }

    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(null, '', newUrl);
}

/**
 * Configura el botó per copiar l'enllaç actual amb els filtres al porta-retalls
 */
export function setupCopyLinkButton(btnId = 'btnCopyLink') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            const origHTML = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="check" style="width: 14px; margin-right: 4px;"></i>Copiat!`;
            btn.classList.add('btn-primary');
            if (window.lucide) lucide.createIcons();
            setTimeout(() => {
                btn.innerHTML = origHTML;
                btn.classList.remove('btn-primary');
                if (window.lucide) lucide.createIcons();
            }, 1800);
        } catch (e) {
            prompt("Copia aquest enllaç:", window.location.href);
        }
    });
}

