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
