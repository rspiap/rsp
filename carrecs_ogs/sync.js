/**
 * sync.js - Mòdul de sincronització de dades des del navegador
 * Gestiona les crides a Open Data, Algolia i el creuament de dades.
 */

class DataSync {
    constructor() {
        this.dbName = 'SectorPublicDB';
        this.dbVersion = 2; // Incremented for new stores
        this.storeName = 'records';
        this.metadataStore = 'metadata';
        this.algoliaStore = 'algolia_cache';
        this.db = null;
        this.algoliaLookup = null;
        
        // Configuració Algolia (extreta de process_data.ps1)
        this.algoliaAppId = "GAVVNU5N19";
        this.algoliaApiKey = "a4c62f41bac4bec5f3d3b0ced22ae65b";
        this.algoliaIndex = "pro_ADRECES_SAC";
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains(this.metadataStore)) {
                    db.createObjectStore(this.metadataStore);
                }
                if (!db.objectStoreNames.contains(this.algoliaStore)) {
                    db.createObjectStore(this.algoliaStore);
                }
                
                const transaction = e.target.transaction;
                const store = transaction.objectStore(this.storeName);
                if (!store.indexNames.contains('codi_sac')) {
                    store.createIndex('codi_sac', 'codi_sac', { unique: false });
                }
                if (!store.indexNames.contains('entitat')) {
                    store.createIndex('entitat', 'entitat', { unique: false });
                }
            };
            request.onsuccess = async (e) => {
                this.db = e.target.result;
                try {
                    const cache = await this.getAlgoliaCache();
                    if (cache) {
                        this.algoliaLookup = cache.lookup;
                        console.log("Memòria cau d'Algolia carregada (Lazy init).");
                    }
                } catch (err) {
                    console.warn("No s'ha pogut carregar la cache d'Algolia:", err);
                }
                resolve(this.db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Obté un valor d'un objecte provant diversos noms de camp (per robustesa amb l'Open Data)
     */
    getFieldValue(obj, aliases) {
        for (const alias of aliases) {
            if (obj[alias] !== undefined && obj[alias] !== null) return obj[alias];
        }
        return "";
    }

    // Normalització per a claus de mapatge (entitats, càrrecs)
    baseNorm(raw) {
        if (!raw) return "";
        return raw.toString().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Treure accents
            .replace(/[^a-z0-9]/g, "") // Treure tot el que no sigui alfanumèric
            .trim();
    }

    // Normalització específica per a noms de persones (més flexible amb el " i ")
    baseNormPersona(raw) {
        if (!raw) return "";
        let s = raw.toString().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Només eliminem el " i " en la comparació de noms de persones
        s = s.replace(/\bi\b/g, " ");
        
        return s.replace(/[^a-z0-9]/g, "").trim();
    }

    // Generació de clau intel·ligent (mimetitza Get-SmartKey de PS)
    getSmartKey(entitat, p1, p2) {
        const nEntitat = this.baseNorm(entitat);
        const nP1 = this.baseNorm(p1);
        const nP2 = this.baseNorm(p2);

        // Ordenar els dos components personals per evitar inversions de camp
        const posicions = [nP1, nP2].sort();
        return `${nEntitat}|${posicions[0]}|${posicions[1]}`;
    }

    async fetchAlgolia(onProgress) {
        const lookup = new Map();
        let cursor = null;
        let total = 0;

        const headers = {
            "X-Algolia-Application-Id": this.algoliaAppId,
            "X-Algolia-API-Key": this.algoliaApiKey,
            "Content-Type": "application/json"
        };

        do {
            const url = `https://${this.algoliaAppId}-dsn.algolia.net/1/indexes/${this.algoliaIndex}/browse`;
            const body = cursor ? { cursor } : {};
            
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error(`Algolia error: ${response.statusText}`);
            
            const data = await response.json();
            data.hits.forEach(hit => {
                total++;
                if (hit.objectID) lookup.set(hit.objectID.toString().trim(), hit);
                if (hit.dadesOrganigrama && hit.dadesOrganigrama.codi) {
                    lookup.set(hit.dadesOrganigrama.codi.toString().trim(), hit);
                }
            });

            cursor = data.cursor;
            if (onProgress) onProgress(total);
        } while (cursor);

        this.algoliaLookup = lookup;
        return lookup;
    }

    async fetchOpenDataMetadata(resourceId) {
        try {
            const url = `https://analisi.transparenciacatalunya.cat/api/views/${resourceId}.json`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const meta = await response.json();
            return meta.rowsUpdatedAt; // Segell de temps de l'última actualització de dades
        } catch (e) {
            console.warn("No s'ha pogut obtenir metadades de l'Open Data:", e);
            return null;
        }
    }

    async getMetadata(key) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.metadataStore], 'readonly');
            const store = transaction.objectStore(this.metadataStore);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    async setMetadata(key, value) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.metadataStore], 'readwrite');
            const store = transaction.objectStore(this.metadataStore);
            store.put(value, key);
            transaction.oncomplete = () => resolve();
        });
    }

    async fetchOpenData(resourceId, onProgress) {
        let allData = [];
        const limit = 50000;
        let offset = 0;
        let totalReceived = 0;

        while (true) {
            const url = `https://analisi.transparenciacatalunya.cat/resource/${resourceId}.json?$limit=${limit}&$offset=${offset}`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Open Data error (${resourceId}): ${response.statusText} - ${errorText}`);
                }
                const chunk = await response.json();
                if (!chunk || chunk.length === 0) break;
                allData = allData.concat(chunk);
                totalReceived += chunk.length;
                offset += limit;
                if (onProgress) onProgress(totalReceived);
                if (chunk.length < limit) break;
            } catch (err) {
                console.error(`Error en el chunk offset ${offset}:`, err);
                throw err;
            }
        }
        return allData;
    }

    async getAlgoliaCache() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.algoliaStore], 'readonly');
            const store = transaction.objectStore(this.algoliaStore);
            const request = store.get('all_hits');
            request.onsuccess = () => {
                if (!request.result) return resolve(null);
                // Convertim de nou a Map
                const lookup = new Map();
                request.result.data.forEach(item => lookup.set(item.key, item.val));
                resolve({ lookup, timestamp: request.result.timestamp });
            };
            request.onerror = () => resolve(null);
        });
    }

    async setAlgoliaCache(lookup) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.algoliaStore], 'readwrite');
            const store = transaction.objectStore(this.algoliaStore);
            const data = [];
            lookup.forEach((val, key) => data.push({ key, val }));
            store.put({ data, timestamp: Date.now() }, 'all_hits');
            transaction.oncomplete = () => resolve();
        });
    }

    async runFullSync(sacCsvText = null, onProgress) {
        try {
            if (!this.db) await this.initDB();

            // 0. Comprovació intel·ligent (Delta Check)
            // Si estem en una sincronització manual (no incremental d'edició), ignorem el skip per seguretat
            const isManualFullSync = !sacCsvText; // Si no ve del canal parcial d'edició
            
            if (onProgress) onProgress({ step: 'Comprovant actualitzacions...', progress: 2 });
            const resourceId = 'auai-ppkn';
            const cloudTimestamp = await this.fetchOpenDataMetadata(resourceId);
            const localTimestamp = await this.getMetadata(`ts_${resourceId}`);
            
            let data = await this.loadFromDB();
            
            // Només saltem la descarrega si és una sync automàtica (no manual) i els timestamps coincideixen
            // Nota: En aquest cas, com que l'usuari vol recuperar el mapatge, NO SALTEM.
            if (false && data && data.length > 0 && cloudTimestamp && cloudTimestamp === localTimestamp) {
                console.log("Dades d'Open Data sense canvis. Sincronització ràpida...");
                if (onProgress) onProgress({ step: 'L\'Open Data no ha canviat. Actualitzant només mapatges...', progress: 10 });
                return await this.quickSync(data, onProgress);
            }

            // 1. Algolia (amb memòria cau de 24h)
            if (onProgress) onProgress({ step: 'Obtenint dades del SAC...', progress: 5 });
            const cache = await this.getAlgoliaCache();
            
            if (cache && (Date.now() - cache.timestamp < 24 * 60 * 60 * 1000)) {
                console.log("Utilitzant dades d'Algolia des de la memòria cau local.");
                this.algoliaLookup = cache.lookup;
            } else {
                this.algoliaLookup = await this.fetchAlgolia(count => {
                    if (onProgress) onProgress({ step: `Descarregant SAC... (${count} registres)`, progress: 10 });
                });
                await this.setAlgoliaCache(this.algoliaLookup);
            }
            const algoliaLookup = this.algoliaLookup;

            // 2. Open Data (Descarrega només si el timestamp ha canviat)
            if (onProgress) onProgress({ step: 'Descarregant records públics (Open Data)...', progress: 20 });
            const persones = await this.fetchOpenData(resourceId, count => {
                if (onProgress) onProgress({ step: `Descarregant dades... (${count} registres)`, progress: 20 + Math.min(20, (count/300000)*20) });
            });

            // 2b. Carregar Departaments (sexe-cpsh) per creuar (Nou)
            if (onProgress) onProgress({ step: 'Descarregant noms de departaments...', progress: 45 });
            const deptsRaw = await this.fetchOpenData('sexe-cpsh');
            const deptLookup = new Map();
            deptsRaw.forEach(d => {
                const dept = d.departament;
                if (!dept) return;

                const ensNameNorm = this.baseNorm(d.denominaci);
                const membreNameNorm = this.baseNorm(d.denominaci_membre);
                
                // 1. Clau específica: Entitat + Membre
                if (ensNameNorm && membreNameNorm) {
                    deptLookup.set(`${ensNameNorm}|${membreNameNorm}`, dept);
                }

                // 2. Clau de fallback: Número de Registre (Nivell d'Ens)
                const reg = d.n_mero_de_registre || d.registre_del_sector_p_blic_n_mero;
                if (reg) {
                    const normalizedReg = reg.toString().trim().replace(/^0+/, '');
                    if (!deptLookup.has(normalizedReg)) {
                        deptLookup.set(normalizedReg, dept);
                    }
                }
            });
            console.log(`Detectats ${deptLookup.size} departaments per creuar.`);

            // 3. Carregar SAC CSV (amb gestió d'errors millorada i suport per dades encastades)
            if (onProgress) onProgress({ step: 'Llegint mapatge SAC...', progress: 55 });
            let sacLookup = new Map();
            let sourceData = null;

            try {
                // A. Si ens passen text CSV manualment (Importació des del fitxer sac.csv)
                if (sacCsvText) {
                    console.log("Processant fitxer CSV manual...");
                    const lines = sacCsvText.split(/\r?\n/);
                    const manualData = [];
                    
                    // Comencem a la línia 1 (saltem capçalera)
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        
                        const cols = line.split(';');
                        if (cols.length > 7) {
                            const entitat = cols[1];
                            const membre = cols[3];
                            const carrec = cols[5];
                            const codi = cols[7];
                            
                            if (codi && codi.trim()) {
                                manualData.push({
                                    d: entitat,
                                    m: membre,
                                    c: carrec,
                                    k: codi.trim()
                                });
                            }
                        }
                    }
                    
                    if (manualData.length > 0) {
                        console.log(`Importats ${manualData.length} mapatges del CSV. Pujant al núvol...`);
                        sourceData = manualData;
                        
                        // Persistència: Local i Núvol
                        localStorage.setItem('sac_mapping_data', JSON.stringify(manualData));
                        if (typeof SAC_CLOUD_SERVICE !== 'undefined') {
                            SAC_CLOUD_SERVICE.saveData(manualData)
                                .then(() => console.log("Mapatges sincronitzats amb el núvol correctament."))
                                .catch(err => console.error("Error sincronitzant mapatges al núvol:", err));
                        }
                    }
                }

                // B. Si NO tenim dades manuals, busquem al Núvol (Compartit)
                if (!sourceData) {
                    try {
                        const result = await SAC_CLOUD_SERVICE.loadData();
                        sourceData = result ? (result.data || result) : null;
                    } catch (e) {
                        console.warn("Núvol no disponible, provant persistència local.");
                    }
                }

                // C. Si el núvol falla o està buit, fallback a LocalStorage
                if (!sourceData || sourceData.length === 0) {
                    const stored = localStorage.getItem('sac_mapping_data');
                    if (stored) {
                        try {
                            sourceData = JSON.parse(stored);
                            console.log('Dades SAC carregades des de LocalStorage.');
                        } catch (e) { console.error("Error parsejant dades locals:", e); }
                    }
                }

                if (sourceData && sourceData.length > 0) {
                    sourceData.forEach(entry => {
                        const key = this.getSmartKey(entry.d, entry.m, entry.c);
                        sacLookup.set(key, entry.k.toString().trim());
                    });
                }
                
                if (sacLookup.size > 0) {
                    console.log(`Mapatge SAC carregat: ${sacLookup.size} claus.`);
                    if (onProgress) onProgress({ step: `Mapatge SAC carregat (${sacLookup.size} claus)`, progress: 60 });
                } else {
                    if (onProgress) onProgress({ step: 'AVÍS: sac.csv no trobat o buit al núvol.', progress: 55, isError: true });
                }
            } catch (csvErr) {
                console.error("Error carregant dades SAC:", csvErr);
            }

            if (onProgress) onProgress({ step: 'Processant i creuant dades...', progress: 65 });
            const finalRecords = [];
            const sacIReplacement = / i /g;
            const totalPersones = persones.length;
            
            // Processament per lots per no penjar el navegador
            let matchedCount = 0;
            // Auto-descobriment estricte de columnes (prioritat exacta)
            // Escanegem els primers 100 per si algun camp és opcional/buit al primer registre
            const fieldKeysSet = new Set();
            persones.slice(0, 100).forEach(rec => Object.keys(rec).forEach(key => fieldKeysSet.add(key)));
            const fieldKeys = Array.from(fieldKeysSet);

            const findKeyStrict = (keywords, exact) => {
                // 1. Prioritat exacta
                let found = fieldKeys.find(k => exact.includes(k));
                if (found) return found;
                // 2. Prioritat keyword (inclou el camp literal rgan_que_designa)
                return fieldKeys.find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
            };
            
            const kEntitat = findKeyStrict(['denominaci', 'entitat', 'ens'], ['denominaci', 'denominaci_de_l_ens_empresa_entitat_o_organisme_p_blic']);
            const kMembre = findKeyStrict(['membre'], ['membre']);
            const kCarrec = findKeyStrict(['c_rrec_o_lloc'], ['c_rrec_o_lloc_de_treball', 'carrec_o_lloc_de_treball']);
            const kDept = findKeyStrict(['departament'], ['departament', 'departament_de_l_ens_empresa_entitat_o_organisme_p_blic']);
            const kOgs = findKeyStrict(['govern_superior'], ['c_rrec_en_l_rgan_de_govern_superior']);
            const kReg = findKeyStrict(['registre'], ['n_mero_de_registre', 'registre_del_sector_p_blic_n_mero']);
            const kPartici = findKeyStrict(['participant', 'part_cip'], ['part_cip_o_organisme', 'part_cip_o_organisme_participant']);
            const kDesigna = findKeyStrict(['designa'], ['rgan_que_designa', 'organ_que_designa']);

            console.log("🔍 Camps detectats a l'Open Data:", { kEntitat, kMembre, kCarrec, kDept });
            
            // Debug: Mostrar 1 clau de mostra del mapatge per comparar
            if (sacLookup.size > 0) {
                const sampleKey = Array.from(sacLookup.keys())[0];
                console.log("🔑 Mostra de clau de mapatge (SAC):", sampleKey);
            }

            for (let i = 0; i < totalPersones; i++) {
                const p = persones[i];
                
                const vEntitat = p[kEntitat] || "";
                const vMembre = p[kMembre] || "";
                const vCarrec = p[kCarrec] || "";
                const vOgs = p[kOgs] || "";
                const vReg = p[kReg] || "";
                const vPartici = p[kPartici] || "";
                const vDesigna = p[kDesigna] || "";

                // Cerca multinivell del departament (Refinat segons feedback usuari)
                const normEns = this.baseNorm(vEntitat);
                const normMembre = this.baseNorm(vMembre);
                const normCarrec = this.baseNorm(vCarrec);
                const normalizedReg = vReg.toString().trim().replace(/^0+/, '');

                const vDept = deptLookup.get(`${normEns}|${normMembre}`) || 
                              deptLookup.get(`${normEns}|${normCarrec}`) || 
                              deptLookup.get(normalizedReg) || 
                              p[kDept] || "";

                const key = this.getSmartKey(vEntitat, vMembre, vCarrec);
                
                const enriched = {
                    entitat: vEntitat,
                    membre_tipus: vMembre,
                    carrec: vCarrec,
                    departament: vDept,
                    persona_nom: p.nom || "",
                    persona_cognoms: p.cognoms || "",
                    is_govern_superior: vOgs,
                    n_registre: vReg,
                    part_cip_o_organisme: vPartici,
                    rgan_que_designa: vDesigna,
                    codi_sac: "",
                    sac_nom_responsable: "",
                    sac_unitat: "",
                    sac_departament: "",
                    sac_carrec: "",
                    status: ""
                };

                if (sacLookup.has(key)) {
                    matchedCount++;
                    enriched.status = "Pendent";
                    const codiSac = sacLookup.get(key);
                    enriched.codi_sac = codiSac;
                    
                    if (codiSac && algoliaLookup.has(codiSac)) {
                        const alg = algoliaLookup.get(codiSac);
                        enriched.sac_nom_responsable = alg.dadesOrganigrama.nomresponsable;
                        enriched.sac_unitat = alg.unitatResp.unitat;
                        enriched.sac_departament = alg.unitatResp.departament;
                        enriched.sac_carrec = alg.dadesOrganigrama.carrec;

                        const n1 = this.baseNormPersona(`${p.nom || ""} ${p.cognoms || ""}`);
                        const n2 = this.baseNormPersona(enriched.sac_nom_responsable);

                        if (n1 === n2 && n1 !== "") {
                            enriched.status = "Validat";
                        }
                    }
                } else if (i < 5) {
                    console.log("❌ No hi ha correspondència per la clau DO:", key);
                }
                finalRecords.push(enriched);
                
                if (i % 5000 === 0 && onProgress) {
                    onProgress({ step: `Creuant dades... (${i} / ${totalPersones}) - Trobats: ${matchedCount}`, progress: 65 + (i/totalPersones * 25) });
                }
                if (i % 20000 === 0) await new Promise(r => setTimeout(r, 0));
            }

            console.log(`Creuament finalitzat. Total coincidències: ${matchedCount} de ${totalPersones}`);
            
            if (onProgress) onProgress({ step: 'Desant a la base de dades local...', progress: 95 });
            await this.saveToDB(finalRecords);

            // Guardar el timestamp per a la propera vegada
            if (cloudTimestamp) {
                await this.setMetadata(`ts_${resourceId}`, cloudTimestamp);
            }

            if (onProgress) onProgress({ step: 'Sincronització completada!', progress: 100 });
            return finalRecords;
        } catch (error) {
            console.error("Sync error:", error);
            throw error;
        }
    }

    async quickSync(currentRecords, onProgress) {
        try {
            if (!this.db) await this.initDB();
            
            if (onProgress) onProgress({ step: 'Actualitzant mapeig (Càrrega Algolia)...', progress: 20 });
            const algoliaLookup = await this.fetchAlgolia();
            
            if (onProgress) onProgress({ step: 'Actualitzant mapeig (Càrrega Mapeig SAC)...', progress: 50 });
            let sourceData = null;
            if (typeof SAC_CLOUD_SERVICE !== 'undefined') {
                try {
                    const result = await SAC_CLOUD_SERVICE.loadData();
                    sourceData = result ? (result.data || result) : null;
                } catch(e) {}
            }
            if (!sourceData) {
                const stored = localStorage.getItem('sac_mapping_data');
                if (stored) sourceData = JSON.parse(stored);
            }
            if (!sourceData && typeof SAC_LOOKUP_DATA !== 'undefined') {
                sourceData = SAC_LOOKUP_DATA;
            }

            let sacLookup = new Map();
            if (sourceData && sourceData.length > 0) {
                sourceData.forEach(entry => {
                    const key = this.getSmartKey(entry.d, entry.m, entry.c);
                    sacLookup.set(key, entry.k.toString().trim());
                });
            }

            if (onProgress) onProgress({ step: 'Aplicant nous codis als registres...', progress: 70 });
            
            currentRecords.forEach(p => {
                const key = this.getSmartKey(p.entitat, p.membre_tipus, p.carrec);
                
                // Mantenim els camps de DO (Open Data) però resetegem els de SAC
                p.codi_sac = "";
                p.sac_nom_responsable = "";
                p.sac_unitat = "";
                p.sac_departament = "";
                p.sac_carrec = "";
                p.status = "";

                if (sacLookup.has(key)) {
                    p.status = "Pendent";
                    const codiSac = sacLookup.get(key);
                    p.codi_sac = codiSac;

                    if (codiSac && algoliaLookup.has(codiSac)) {
                        const alg = algoliaLookup.get(codiSac);
                        p.sac_nom_responsable = alg.dadesOrganigrama.nomresponsable;
                        p.sac_unitat = alg.unitatResp.unitat;
                        p.sac_departament = alg.unitatResp.departament;
                        p.sac_carrec = alg.dadesOrganigrama.carrec;

                        const n1 = this.baseNormPersona(`${p.persona_nom} ${p.persona_cognoms}`);
                        const n2 = this.baseNormPersona(p.sac_nom_responsable);

                        if (n1 === n2 && n1 !== "") {
                            p.status = "Validat";
                        }
                    }
                }
            });

            if (onProgress) onProgress({ step: 'Guardant resultats...', progress: 95 });
            await this.saveToDB(currentRecords);

            if (onProgress) onProgress({ step: 'Sincronització completada!', progress: 100 });
            return currentRecords;
        } catch (error) {
            console.error("Quick Sync error:", error);
            throw error;
        }
    }

    async saveToDB(records) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            // Netejar dades velles
            store.clear();
            
            // Inserir en grups (més eficient)
            const chunkSize = 5000;
            for (let i = 0; i < records.length; i += chunkSize) {
                const chunk = records.slice(i, i + chunkSize);
                chunk.forEach(r => store.add(r));
            }

            transaction.oncomplete = () => {
                localStorage.setItem('sac_update_signal', Date.now());
                resolve();
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Actualitza un únic registre a la base de dades local.
     * Molt més ràpid que tornar a fer tot el creuament.
     */
    async updateSingleRecord(entitat, membre, carrec, sacFields) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('entitat'); // Useu l'índex per filtrar més ràpid
            
            const request = index.getAll(entitat);
            
            request.onsuccess = () => {
                const results = request.result;
                // Busquem el registre exacte dins dels resultats per entitat
                const target = results.find(r => 
                    r.membre_tipus === membre && 
                    r.carrec === carrec
                );

                if (target) {
                    // 1. Mirar si tenim les dades de SAC (Algolia) per a aquest codi
                    const codi = sacFields.codi_sac || "";
                    let nomSAC = sacFields.sac_nom_responsable || "";
                    let unitat = sacFields.sac_unitat || "";
                    let depto = sacFields.sac_departament || "";
                    let carS = sacFields.sac_carrec || "";
                    let status = "Pendent";

                    // Si ens falten dades però tenim el codi i el lookup carregat, les recuperem
                    if (codi && !nomSAC && this.algoliaLookup && this.algoliaLookup.has(codi)) {
                        const alg = this.algoliaLookup.get(codi);
                        nomSAC = alg.dadesOrganigrama.nomresponsable;
                        unitat = alg.unitatResp.unitat;
                        depto = alg.unitatResp.departament;
                        carS = alg.dadesOrganigrama.carrec;
                    }

                    // 2. Validació de nom per marcar com a Validat automàticament
                    if (codi && nomSAC) {
                        const n1 = this.baseNormPersona(`${target.persona_nom} ${target.persona_cognoms}`);
                        const n2 = this.baseNormPersona(nomSAC);
                        if (n1 === n2 && n1 !== "") {
                            status = "Validat";
                        }
                    } else if (!codi) {
                        status = ""; 
                    }

                    // 3. Actualitzem els camps del registre
                    target.codi_sac = codi;
                    target.sac_nom_responsable = nomSAC;
                    target.sac_unitat = unitat;
                    target.sac_departament = depto;
                    target.sac_carrec = carS;
                    target.status = status;
                    
                    // 3. Recalculem el status de forma intel·ligent (amb normalització de persona)
                    if (target.codi_sac && target.sac_nom_responsable) {
                        const n1 = this.baseNormPersona(`${target.persona_nom} ${target.persona_cognoms}`);
                        const n2 = this.baseNormPersona(target.sac_nom_responsable);
                        
                        console.log(`🔍 Debug validació (Manual): "${n1}" vs "${n2}"`);
                        
                        if (n1 === n2 && n1 !== "") {
                            target.status = "Validat";
                        } else {
                            target.status = "Pendent";
                        }
                    } else if (target.codi_sac) {
                        target.status = "Pendent";
                    } else {
                        target.status = "";
                    }

                    store.put(target);
                }
            };

            transaction.oncomplete = () => {
                // Notifiquem a les altres pestanyes (Dashboard) que hem canviat un registre via localStorage
                localStorage.setItem('sac_update_signal', Date.now());
                resolve(true);
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    async loadFromDB() {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

window.dataSync = new DataSync();
