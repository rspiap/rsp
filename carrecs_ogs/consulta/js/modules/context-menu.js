/**
 * context-menu.js - Menú contextual per enllaçar amb l'origen de dades (Web o API) de cada cel·la
 */
import { CONFIG } from './config.js';

let menuEl = null;

function ensureMenuElement() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.id = 'dataSourceContextMenu';
    menuEl.className = 'context-menu';
    menuEl.style.display = 'none';
    document.body.appendChild(menuEl);

    document.addEventListener('click', (e) => {
        if (menuEl && !menuEl.contains(e.target)) {
            hideMenu();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideMenu();
    });
    window.addEventListener('scroll', hideMenu, true);
    return menuEl;
}

function hideMenu() {
    if (menuEl) menuEl.style.display = 'none';
}

function cleanRegNum(reg) {
    return String(reg || '').trim().replace(/^0+/, '');
}

const DATASET_SLUGS = {
    [CONFIG.OPEN_DATA.RESOURCE_ID]: 'Sector-P-blic/Registre-del-sector-p-blic-de-la-Generalitat-de-Ca',
    [CONFIG.OPEN_DATA.EXTRA_RESOURCE_ID]: 'Sector-P-blic/Registre-del-sector-p-blic-de-la-Generalitat-de-Ca',
    [CONFIG.OPEN_DATA.PARTICIPACIO_RESOURCE_ID]: 'Sector-P-blic/Registre-del-sector-p-blic-de-la-Generalitat-de-Ca',
    [CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID]: 'Sector-P-blic/Registre-del-sector-p-blic-de-la-Generalitat-de-Ca',
    [CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID]: 'Legislaci-just-cia/Entitats-jur-diques-del-Registre-d-entitats-de-Cat',
    [CONFIG.OPEN_DATA.GUIA_GOVERN_RESOURCE_ID]: 'Legislaci-just-cia/-rgans-de-govern-de-les-entitats-jur-diques-del-Re'
};

function openDataQueryUrl(resourceId, ext = 'json', paramsObj = {}) {
    const base = `${CONFIG.OPEN_DATA.BASE_URL}/resource/${resourceId}.${ext}`;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(paramsObj)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            qs.set(k, String(v).trim());
        }
    }
    const str = qs.toString();
    return str ? `${base}?${str}` : base;
}

const DATASET_NUMERIC_COLS = {
    [CONFIG.OPEN_DATA.RESOURCE_ID]: new Set(['n_mero_de_registre']),
    [CONFIG.OPEN_DATA.PARTICIPACIO_RESOURCE_ID]: new Set(['n_mero_de_registre']),
    [CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID]: new Set(['n_mero_de_registre']),
    [CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID]: new Set(['id_entitat']),
    [CONFIG.OPEN_DATA.GUIA_GOVERN_RESOURCE_ID]: new Set(['id_entitat'])
};

function encodeSocrataQueryPath(str) {
    return encodeURIComponent(str)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
}

function openDataExploreUrl(resourceId, paramsObj = {}) {
    const slug = DATASET_SLUGS[resourceId];
    const base = slug
        ? `${CONFIG.OPEN_DATA.BASE_URL}/${slug}/${resourceId}/explore`
        : `${CONFIG.OPEN_DATA.BASE_URL}/d/${resourceId}/explore`;
    const numericCols = DATASET_NUMERIC_COLS[resourceId] || new Set();
    const clauses = [];
    for (const [col, val] of Object.entries(paramsObj)) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            const trimmed = String(val).trim();
            if (numericCols.has(col) && /^\d+$/.test(trimmed)) {
                clauses.push(`\`${col}\` = ${trimmed}`);
            } else if (resourceId === CONFIG.OPEN_DATA.EXTRA_RESOURCE_ID && col === 'n_mero_de_registre' && /^\d+$/.test(trimmed)) {
                const padded = trimmed.padStart(4, '0');
                if (padded !== trimmed) {
                    clauses.push(`caseless_one_of(\`${col}\`, "${trimmed}", "${padded}")`);
                } else {
                    clauses.push(`caseless_one_of(\`${col}\`, "${trimmed}")`);
                }
            } else {
                const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                clauses.push(`caseless_one_of(\`${col}\`, "${escaped}")`);
            }
        }
    }
    if (clauses.length === 0) return base;
    const soql = `SELECT * WHERE ${clauses.join(' AND ')}`;
    return `${base}/query/${encodeSocrataQueryPath(soql)}/page/filter`;
}

function buildItemsForCell(td, target) {
    const sac = (td.dataset.sac || '').trim();
    const reg = cleanRegNum(td.dataset.reg || '');
    const rawReg = (td.dataset.reg || '').trim();
    const regVal = reg || rawReg;
    const entitat = (td.dataset.entitat || '').trim();
    const cognoms = (td.dataset.cognoms || '').trim();
    const fundId = (td.dataset.fundId || '').trim();
    const isFundacio = td.dataset.isFundacio === '1';
    const isMercantil = td.dataset.isMercantil === '1';
    const entityFilter = regVal ? { n_mero_de_registre: regVal } : (entitat ? { denominaci: entitat } : {});

    const sections = [];

    const addSacSection = () => {
        if (!sac) return;
        sections.push({
            title: `SAC (${sac})`,
            items: [
                {
                    label: 'Fitxa SAC (Web)',
                    url: `https://sac.gencat.cat/sacgencat/AppJava/organisme_fitxa.jsp?codi=${encodeURIComponent(sac)}`,
                    badge: 'WEB'
                }
            ]
        });
    };

    const addEntitatSection = () => {
        const items = [
            {
                label: 'Participació Generalitat gr39-ik6u (API)',
                url: openDataQueryUrl(CONFIG.OPEN_DATA.PARTICIPACIO_RESOURCE_ID, 'json', entityFilter),
                badge: 'API'
            },
            {
                label: 'Participació Generalitat gr39-ik6u (Web)',
                url: openDataExploreUrl(CONFIG.OPEN_DATA.PARTICIPACIO_RESOURCE_ID, entityFilter),
                badge: 'WEB'
            }
        ];
        if (isMercantil) {
            items.push(
                {
                    label: "Consells d'Administració nmgt-rq9t (API)",
                    url: openDataQueryUrl(CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID, 'json', entityFilter),
                    badge: 'API'
                },
                {
                    label: "Consells d'Administració nmgt-rq9t (Web)",
                    url: openDataExploreUrl(CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID, entityFilter),
                    badge: 'WEB'
                }
            );
        }
        sections.push({ title: 'Entitat (Sector Públic)', items });
    };

    const addOgsSection = () => {
        const ogsApiFilter = regVal && /^\d+$/.test(regVal) && regVal.length < 4
            ? { $where: `n_mero_de_registre in ('${regVal}', '${regVal.padStart(4, '0')}')` }
            : entityFilter;
        sections.push({
            title: 'Òrgan de Govern Superior (OGS)',
            items: [
                {
                    label: 'Registre OGS sexe-cpsh (API)',
                    url: openDataQueryUrl(CONFIG.OPEN_DATA.EXTRA_RESOURCE_ID, 'json', ogsApiFilter),
                    badge: 'API'
                },
                {
                    label: 'Registre OGS sexe-cpsh (Web)',
                    url: openDataExploreUrl(CONFIG.OPEN_DATA.EXTRA_RESOURCE_ID, entityFilter),
                    badge: 'WEB'
                }
            ]
        });
    };

    const addPersonaSection = () => {
        const personaFilter = { ...entityFilter };
        if (cognoms) personaFilter.cognoms = cognoms;
        sections.push({
            title: 'Persona / Membre (RSP)',
            items: [
                {
                    label: 'Persones i càrrecs auai-ppkn (API)',
                    url: openDataQueryUrl(CONFIG.OPEN_DATA.RESOURCE_ID, 'json', personaFilter),
                    badge: 'API'
                },
                {
                    label: 'Persones i càrrecs auai-ppkn (Web)',
                    url: openDataExploreUrl(CONFIG.OPEN_DATA.RESOURCE_ID, personaFilter),
                    badge: 'WEB'
                }
            ]
        });
    };

    const addFundacionsSection = () => {
        if (!isFundacio && !fundId) return;
        const fundGovFilter = fundId ? { id_entitat: fundId } : {};
        const fundEntFilter = fundId ? { id_entitat: fundId } : (entitat ? { nom_entitat: entitat } : {});
        const guiaWebUrl = fundId
            ? `https://justicia.gencat.cat/ca/serveis/guia_d_entitats/detall/?idEntitat=${encodeURIComponent(fundId)}`
            : 'https://justicia.gencat.cat/ca/serveis/guia_d_entitats/';
        sections.push({
            title: 'Registre de Fundacions',
            items: [
                {
                    label: 'Fitxa Guia d\'Entitats (Web)',
                    url: guiaWebUrl,
                    badge: 'WEB'
                },
                {
                    label: 'Òrgans de govern i46c-ebpp (API)',
                    url: openDataQueryUrl(CONFIG.OPEN_DATA.GUIA_GOVERN_RESOURCE_ID, 'json', fundGovFilter),
                    badge: 'API'
                },
                {
                    label: 'Òrgans de govern i46c-ebpp (Web)',
                    url: openDataExploreUrl(CONFIG.OPEN_DATA.GUIA_GOVERN_RESOURCE_ID, fundGovFilter),
                    badge: 'WEB'
                },
                {
                    label: 'Guia d\'entitats y6fz-g3ff (API)',
                    url: openDataQueryUrl(CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID, 'json', fundEntFilter),
                    badge: 'API'
                },
                {
                    label: 'Guia d\'entitats y6fz-g3ff (Web)',
                    url: openDataExploreUrl(CONFIG.OPEN_DATA.GUIA_ENTITATS_RESOURCE_ID, fundEntFilter),
                    badge: 'WEB'
                }
            ]
        });
    };

    // Prioritzar l'ordre segons la cel·la o badge on s'ha fet clic dret
    if (target.closest('.sac-ref-box') || td.classList.contains('td-sac') || td.classList.contains('td-carrec')) {
        addSacSection();
        addEntitatSection();
    } else if (target.closest('.fundacio-check')) {
        addFundacionsSection();
        addPersonaSection();
        addSacSection();
    } else if (td.classList.contains('td-entitat')) {
        addEntitatSection();
        addFundacionsSection();
        addOgsSection();
    } else if (td.classList.contains('td-organ')) {
        addOgsSection();
        addPersonaSection();
        addEntitatSection();
    } else if (td.classList.contains('td-persona')) {
        addPersonaSection();
        addFundacionsSection();
        addSacSection();
    } else {
        addPersonaSection();
        addEntitatSection();
        addSacSection();
    }

    return sections;
}

export function initTableContextMenu(tableBodyId = 'tableBody') {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const menu = ensureMenuElement();

    tbody.addEventListener('contextmenu', (e) => {
        const td = e.target.closest('td');
        if (!td || !tbody.contains(td)) return;

        const sections = buildItemsForCell(td, e.target);
        if (sections.length === 0) return;

        e.preventDefault();

        menu.innerHTML = sections.map((sec, idx) => `
            ${idx > 0 ? '<div class="context-menu-sep"></div>' : ''}
            <div class="context-menu-title">${sec.title}</div>
            ${sec.items.map(item => `
                <a class="context-menu-item" href="${item.url}" target="_blank" rel="noopener noreferrer">
                    <span class="context-menu-label">${item.label}</span>
                    <span class="context-menu-badge ${item.badge === 'API' ? 'badge-api' : 'badge-web'}">${item.badge}</span>
                </a>
            `).join('')}
        `).join('');

        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        const x = Math.min(e.clientX, window.innerWidth - rect.width - 10);
        const y = Math.min(e.clientY, window.innerHeight - rect.height - 10);
        menu.style.left = `${Math.max(8, x)}px`;
        menu.style.top = `${Math.max(8, y)}px`;

        menu.querySelectorAll('.context-menu-item').forEach(a => {
            a.addEventListener('click', () => hideMenu());
        });
    });
}
