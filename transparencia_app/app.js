console.log("Transparency App Initialized");

const API_URL = "https://analisi.transparenciacatalunya.cat/resource/ex6p-6zmp.json";

// State
let allData = [];
let groupedData = {};

// DOM Elements
const searchInput = document.getElementById('searchInput');
const resultsContainer = document.getElementById('resultsContainer');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const closeModalBtn = document.getElementById('closeModal');

// Init
async function init() {
    try {
        await fetchData();
        setupEventListeners();
        console.log("Data loaded and app ready");
    } catch (error) {
        console.error("Initialization failed:", error);
        resultsContainer.innerHTML = `<div class="empty-state" style="color: #ff6b6b;">Error carregant les dades. Si us plau, recarrega la pàgina.</div>`;
    }
}

async function fetchData() {
    // Fetching a larger limit to get a good dataset. 
    // In a real production app with massive data, we might want to paginate or search server-side.
    // For this demo, client-side filtering on ~1000 records should be fine and fast.
    const response = await fetch(`${API_URL}?$limit=3000000`);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    
    allData = data;
    processData(data);
}

function processData(data) {
    // Group by 'denominaci' (Entity Name)
    groupedData = data.reduce((acc, item) => {
        const entityName = item.denominaci;
        if (!acc[entityName]) {
            acc[entityName] = {
                name: entityName,
                registryNumber: item.n_mero_de_registre,
                participants: []
            };
        }
        
        acc[entityName].participants.push({
            name: item.denominaci_part_cip_agregat || "Desconegut",
            category: item.categoritzaci_part_cip || "Sense categoria",
            percentage: item.percentatge_participaci || "0",
            qualityVote: item.vot_de_qualitat,
            date: item.data_alta_part_cip
        });
        
        return acc;
    }, {});
}

function setupEventListeners() {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        handleSearch(query);
    });

    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
            closeModal();
        }
    });
}

function handleSearch(query) {
    if (query.length < 2) {
        resultsContainer.innerHTML = '<div class="empty-state"><p>Comença a escriure per cercar entitats...</p></div>';
        return;
    }

    const matches = Object.values(groupedData).filter(entity => 
        entity.name.toLowerCase().includes(query)
    );

    renderResults(matches);
}

function renderResults(matches) {
    resultsContainer.innerHTML = '';
    
    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state"><p>No s\'han trobat resultats.</p></div>';
        return;
    }

    matches.forEach(entity => {
        const card = document.createElement('div');
        card.className = 'entity-card glass-panel';
        card.innerHTML = `
            <div class="entity-name">${entity.name}</div>
            <div class="entity-meta">
                ${entity.participants.length} partícip${entity.participants.length !== 1 ? 's' : ''}
                ${entity.registryNumber ? `• Reg: ${entity.registryNumber}` : ''}
            </div>
        `;
        card.addEventListener('click', () => openModal(entity));
        resultsContainer.appendChild(card);
    });
}

function openModal(entity) {
    const participantsHtml = entity.participants.map(p => `
        <div class="participant-item">
            <div class="participant-category">${p.category}</div>
            <div class="participant-name">${p.name}</div>
            <div class="participant-details">
                <span>Participació: ${parseFloat(p.percentage).toFixed(2)}%</span>
                ${p.qualityVote ? `<span>Vot de qualitat: ${p.qualityVote}</span>` : ''}
            </div>
        </div>
    `).join('');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-title">${entity.name}</h2>
            <p style="color: var(--text-dim)">Registre: ${entity.registryNumber || 'N/A'}</p>
        </div>
        <div class="participant-list">
            ${participantsHtml}
        </div>
    `;
    
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

// Start
init();
