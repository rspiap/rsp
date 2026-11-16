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
window.toggleFilterPopover = function(id) {
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
    const membreTipus = (p.membre_tipus || "").toLowerCase();
    const isJuridica = qualif.includes("jur") || membreTipus.includes("jur");
    if (isJuridica) {
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

