/**
 * editor-ui.js - Controlador per al Gestor de Mapatges
 */

import { CloudService } from './modules/cloud.js';
import { syncEngine } from './modules/sync-engine.js';
import { getSmartKey } from './modules/utils.js';

let mappings = [];
let filteredMappings = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadMappings();
    setupEventListeners();
    if (window.lucide) lucide.createIcons();
});

async function loadMappings() {
    const result = await CloudService.loadData();
    mappings = result ? result.data : [];
    applyFilters();
}

function applyFilters() {
    const search = document.getElementById('mappingSearch').value.toLowerCase().trim();
    filteredMappings = mappings.filter(m => {
        const text = `${m.d} ${m.m} ${m.c} ${m.k}`.toLowerCase();
        return !search || text.includes(search);
    });
    
    document.getElementById('mappingCount').textContent = `${filteredMappings.length} mapatges`;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('mappingTableBody');
    tbody.innerHTML = '';

    filteredMappings.forEach((m, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="sac-code">${m.k}</span></td>
            <td>${m.d}</td>
            <td>
                <div style="font-weight:500;">${m.m}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${m.c}</div>
            </td>
            <td>
                <button class="btn-quick-edit" onclick="openEdit(${idx})">
                    <i data-lucide="pencil" style="width: 14px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

function setupEventListeners() {
    document.getElementById('mappingSearch').addEventListener('input', applyFilters);
    
    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const idx = document.getElementById('editMappingIndex').value;
        const nouCodi = document.getElementById('fieldCodi').value.trim();
        
        if (idx !== "") {
            mappings[idx].k = nouCodi;
            await CloudService.saveData(mappings);
            // Opcional: Podríem actualitzar la BD local també aquí si volem consistència immediata
        }
        
        closeEdit();
        applyFilters();
    });
    
    document.getElementById('btnCancelEdit').addEventListener('click', closeEdit);
}

window.openEdit = (idx) => {
    const m = filteredMappings[idx];
    // Trobar l'índex real a l'array mappings
    const realIdx = mappings.findIndex(map => map.d === m.d && map.m === m.m && map.c === m.c);
    
    document.getElementById('fieldEntitat').value = m.d;
    document.getElementById('fieldMembre').value = m.m;
    document.getElementById('fieldCarrec').value = m.c;
    document.getElementById('fieldCodi').value = m.k;
    document.getElementById('editMappingIndex').value = realIdx;
    
    document.getElementById('editModal').style.display = 'flex';
};

window.closeEdit = () => {
    document.getElementById('editModal').style.display = 'none';
};

window.resetToFile = async () => {
    if (confirm("Segur que vols restablir els mapatges? Això sobreescriurà les dades del núvol amb les locals.")) {
        // Lògica per importar un CSV o restablir
        console.log("Restablint...");
    }
};
