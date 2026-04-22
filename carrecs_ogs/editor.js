/**
 * editor.js - Controlador de la interfície d'edició de mapatge SAC
 */

class SacEditor {
    constructor() {
        this.data = [];
        this.filteredData = [];
        this.editingIndex = -1;
        this.init();
    }

    async init() {
        try {
            this.dom = {
                tableBody: document.getElementById('mappingTableBody'),
                search: document.getElementById('mappingSearch'),
                count: document.getElementById('mappingCount'),
                modal: document.getElementById('editModal'),
                form: document.getElementById('editForm'),
                title: document.getElementById('modalTitle'),
                statusTag: document.getElementById('modalStatusTag'),
                btnCancel: document.getElementById('btnCancelEdit')
            };

            // 1. Carrega immediata local (Perquè l'usuari vegi dades JA)
            this.loadLocalDataFirst();
            this.processUrlParams();
            this.render();

            // 2. Sincronització de fons (Sense bloquejar la interfície)
            this.syncWithCloudInBackground();
            
            // 3. Carregar Algolia en segon pla per l'enriquiment de l'editor
            if (window.dataSync) {
                window.dataSync.fetchAlgolia().then(lookup => {
                    this.algoliaLookup = lookup;
                    console.log('Memòria cau d\'Algolia carregada (BG).');
                }).catch(e => console.warn('Algolia offline:', e));
            }

            // Listeners
            this.dom.search.addEventListener('input', () => this.handleSearch());
            this.dom.form.addEventListener('submit', (e) => this.saveEntry(e));
            this.dom.btnCancel.addEventListener('click', () => this.closeModal());

            console.log('Editor inicialitzat correctament.');

            // 4. Re-intent de seguretat per a fitxers grans
            setTimeout(() => {
                if (this.data.length === 0) {
                    console.log('Re-intentant càrrega de dades locals...');
                    this.loadLocalDataFirst();
                    this.render();
                }
            }, 500);

        } catch (err) {
            console.error('Error crític en la inicialització de l\'Editor:', err);
            // Mostrar avís a l'usuari si falla catastròficament
            if (this.dom && this.dom.count) this.dom.count.textContent = 'Error al carregar l\'editor.';
        }
    }

    loadLocalDataFirst() {
        console.log('Carregant fallbacks locals...');
        const stored = localStorage.getItem('sac_mapping_data');
        if (stored) {
            try {
                this.data = JSON.parse(stored);
            } catch (e) {
                console.warn('LocalStorage corrupte, ignorant.');
            }
        }
        
        // Si no hi ha dades al LocalStorage, comencem amb una llista buida
        // i esperarem que la sincronització de fons (SacEditor.syncWithCloudInBackground) les porti del núvol.
        if (!this.data || this.data.length === 0) {
            console.log('No hi ha dades al LocalStorage. Esperant sincronització del núvol...');
            this.data = [];
        }
        
        this.filteredData = [...this.data];
    }

    async syncWithCloudInBackground() {
        console.log('Iniciant sincronització amb el núvol en segon pla...');
        this.updateSyncStatus('Connectant...', 'pending');
        
        try {
            const result = await SAC_CLOUD_SERVICE.loadData();
            const cloudData = result ? (result.data || result) : null;
            
            if (cloudData && Array.isArray(cloudData) && cloudData.length > 0) {
                // Només actualitzem si realment hi ha dades noves i no són buides
                this.data = cloudData;
                this.filteredData = [...this.data];
                this.updateSyncStatus('Núvol Sincronitzat', 'success');
                this.render();
                console.log('Dades de l\'editor actualitzades des del núvol.');
            } else {
                this.updateSyncStatus('Mode Local (Offline)', 'pending');
            }
        } catch (e) {
            console.warn('No s\'ha pogut sincronitzar amb el núvol:', e);
            this.updateSyncStatus('Error de connexió (Xarxa)', 'pending');
        }
    }



    updateSyncStatus(text, type) {
        let statusEl = document.getElementById('cloudStatus');
        if (!statusEl) {
            statusEl = document.createElement('span');
            statusEl.id = 'cloudStatus';
            statusEl.style.fontSize = '0.8rem';
            statusEl.style.padding = '4px 8px';
            statusEl.style.borderRadius = '4px';
            statusEl.style.marginLeft = '1rem';
            document.querySelector('.editor-header .subtitle').appendChild(statusEl);
        }
        
        statusEl.textContent = text;
        statusEl.className = type === 'success' ? 'badge-validat' : 'badge-pendent';
    }

    processUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const d = params.get('d');
        const m = params.get('m');
        const c = params.get('c');

        if (d || m || c) {
            // Intentar trobar l'entrada existent
            const index = this.data.findIndex(entry => 
                (d ? entry.d === d : true) && 
                (m ? entry.m === m : true) && 
                (c ? entry.c === c : true)
            );

            if (index !== -1) {
                // Existeix: obrim per edició
                this.openModal(index);
                // Filtrem la taula per veure només aquest
                this.dom.search.value = d || m || c;
                this.handleSearch();
            } else {
                // No existeix: obrim per creació amb dades pre-omplertes
                this.openModal(-1, { d, m, c });
            }
        }
    }

    handleSearch() {
        const query = (this.dom.search.value || "").toLowerCase().trim();
        if (!query) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(item => {
                const d = (item.d || "").toLowerCase();
                const m = (item.m || "").toLowerCase();
                const c = (item.c || "").toLowerCase();
                const k = (item.k || "").toString();

                return d.includes(query) || m.includes(query) || c.includes(query) || k.includes(query);
            });
        }
        this.render();
    }

    render() {
        this.dom.tableBody.innerHTML = '';
        this.dom.count.textContent = `Total: ${this.data.length} registres (Filtrats: ${this.filteredData.length})`;

        if (this.filteredData.length === 0) {
            this.dom.tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem;">No s\'ha trobat cap correspondència</td></tr>';
            return;
        }

        this.filteredData.forEach((item, fIndex) => {
            // Busquem l'índex real a l'array original
            const realIndex = this.data.indexOf(item);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="sac-code">${item.k}</span></td>
                <td><div style="font-weight: 500;">${item.d}</div></td>
                <td>
                    <div style="font-size: 0.85rem;">${item.c}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${item.m}</div>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-icon" onclick="editor.openModal(${realIndex})" title="Editar">
                            <i data-lucide="pencil" style="width: 14px;"></i>
                        </button>
                        <button class="btn-icon" onclick="editor.deleteEntry(${realIndex})" title="Eliminar" style="color: var(--error)">
                            <i data-lucide="trash-2" style="width: 14px;"></i>
                        </button>
                    </div>
                </td>
            `;
            this.dom.tableBody.appendChild(tr);
        });
        
        lucide.createIcons();
    }

    openModal(index = -1, prefill = null) {
        this.editingIndex = index;
        
        if (index === -1) {
            this.dom.title.textContent = 'Crear Nou Mapatge';
            this.dom.statusTag.textContent = 'NOVA ENTRADA';
            this.dom.statusTag.className = 'status-tag status-new';
            
            document.getElementById('fieldEntitat').value = prefill?.d || '';
            document.getElementById('fieldMembre').value = prefill?.m || '';
            document.getElementById('fieldCarrec').value = prefill?.c || '';
            document.getElementById('fieldCodi').value = '';
        } else {
            const entry = this.data[index];
            this.dom.title.textContent = 'Editar Mapatge existent';
            this.dom.statusTag.textContent = 'REGISTRE EXISTENT';
            this.dom.statusTag.className = 'status-tag status-existing';
            
            document.getElementById('fieldEntitat').value = entry.d;
            document.getElementById('fieldMembre').value = entry.m;
            document.getElementById('fieldCarrec').value = entry.c;
            document.getElementById('fieldCodi').value = entry.k;
        }

        this.dom.modal.style.display = 'flex';
    }

    closeModal() {
        this.dom.modal.style.display = 'none';
        this.dom.form.reset();
    }

    async saveEntry(e) {
        e.preventDefault();
        
        const newEntry = {
            d: document.getElementById('fieldEntitat').value.trim(),
            m: document.getElementById('fieldMembre').value.trim(),
            c: document.getElementById('fieldCarrec').value.trim(),
            k: document.getElementById('fieldCodi').value.trim()
        };

        if (this.editingIndex === -1) {
            this.data.unshift(newEntry);
        } else {
            this.data[this.editingIndex] = newEntry;
        }

        this.closeModal();
        this.persistLocal();
        
        // 1. Sincronització instantània local (perquè el Dashboard ho vegi JA)
        if (window.dataSync) {
            const sacFields = {
                codi_sac: newEntry.k,
                status: "Pendent"
            };
            
            // Si tenim les dades d'Algolia, enriquim el registre localment
            if (this.algoliaLookup && this.algoliaLookup.has(newEntry.k)) {
                const alg = this.algoliaLookup.get(newEntry.k);
                sacFields.sac_nom_responsable = alg.dadesOrganigrama.nomresponsable;
                sacFields.sac_unitat = alg.unitatResp.unitat;
                sacFields.sac_departament = alg.unitatResp.departament;
                sacFields.sac_carrec = alg.dadesOrganigrama.carrec;
                // La lògica de validació (comparació de noms) la farà el Dashboard en carregar, 
                // o podem posar-la aquí si volem ser 100% exactes.
            }

            await window.dataSync.updateSingleRecord(newEntry.d, newEntry.m, newEntry.c, sacFields);
        }

        // 2. Sincronització parcial al núvol (ràpida)
        await SAC_CLOUD_SERVICE.savePartial(newEntry);
        
        this.handleSearch();
        this.render();
    }

    persistLocal() {
        localStorage.setItem('sac_mapping_data', JSON.stringify(this.data));
    }

    resetToFile() {
        if (confirm('Vols descartar tots els canvis no baixats i tornar a la versió del fitxer original?')) {
            localStorage.removeItem('sac_mapping_data');
            location.reload();
        }
    }

    async deleteEntry(index) {
        if (confirm('Estàs segur que vols eliminar aquesta correspondència?')) {
            const entry = this.data[index];
            this.data.splice(index, 1);
            this.persistLocal();
            
            // 1. Neteja local instantània
            if (window.dataSync) {
                await window.dataSync.updateSingleRecord(entry.d, entry.m, entry.c, {
                    codi_sac: "",
                    status: ""
                });
            }

            // 2. Notificar al núvol (Acció d'esborrat parcial)
            await SAC_CLOUD_SERVICE.savePartial({ ...entry, _delete: true });

            this.handleSearch();
            this.render();
        }
    }

}

// Inicialitzar globalment
const editor = new SacEditor();
