/**
 * sync-engine.js - Motor de sincronització centralitzat
 */

import { CONFIG } from './config.js';
import { db } from './db.js';
import { API } from './api.js';
import { CloudService } from './cloud.js';
import { baseNorm, baseNormPersona, getSmartKey, parseDate } from './utils.js';

export class SyncEngine {
    constructor() {
        this.algoliaLookup = null;
    }

    /**
     * Sincronització completa: Open Data + Algolia + SAC Mapping
     */
    async runFullSync(manualCsvText = null, onProgress) {
        try {
            await db.init();

            if (onProgress) onProgress({ step: 'Connectant amb el SAC (Algolia)...', progress: 5 });
            await new Promise(r => setTimeout(r, 400));
            
            const resourceId = CONFIG.OPEN_DATA.RESOURCE_ID;
            
            // 1. Algolia (Cache de 24h)
            const algoliaCache = await db.getByKey(CONFIG.DB.STORES.ALGOLIA_CACHE, 'all_hits');
            
            if (algoliaCache && (Date.now() - algoliaCache.timestamp < 24 * 60 * 60 * 1000)) {
                if (onProgress) onProgress({ step: 'Usant dades del SAC des de la memòria cau...', progress: 10 });
                this.algoliaLookup = new Map(algoliaCache.data.map(item => [item.key, item.val]));
            } else {
                if (onProgress) onProgress({ step: 'Descarregant dades actualitzades del SAC...', progress: 10 });
                this.algoliaLookup = await API.fetchAlgolia(count => {
                    if (onProgress) onProgress({ step: `Descarregant SAC... (${count} registres)`, progress: 10 + Math.min(10, (count/15000)*10) });
                });
                const cacheArray = [];
                this.algoliaLookup.forEach((val, key) => cacheArray.push({ key, val }));
                await db.save(CONFIG.DB.STORES.ALGOLIA_CACHE, { data: cacheArray, timestamp: Date.now() }, 'all_hits');
            }

            // 2. Open Data (Main dataset)
            if (onProgress) onProgress({ step: 'Obtenint dades del Sector Públic (Open Data)...', progress: 25 });
            await new Promise(r => setTimeout(r, 400));
            
            const persones = await API.fetchOpenData(resourceId, count => {
                if (onProgress) onProgress({ step: `Descarregant records públics... (${count})`, progress: 25 + Math.min(20, (count/300000)*20) });
            });

            // 3. Open Data (Extra dataset for enrichment)
            if (onProgress) onProgress({ step: 'Enriquint amb dades del Registre (Sector Públic)...', progress: 50 });
            await new Promise(r => setTimeout(r, 400));
            
            const sexeRaw = await API.fetchOpenData(CONFIG.OPEN_DATA.EXTRA_RESOURCE_ID);
            const sexeLookup = new Map();
            sexeRaw.forEach(d => {
                const ensNorm = baseNorm(d.denominaci);
                const membreNorm = baseNorm(d.denominaci_membre);
                const extra = { 
                    dept: d.departament || null, 
                    partici: d.part_cip_o_organisme || null,
                    categoritzacio: d.categoritzaci_part_cip || null
                };
                
                if (ensNorm && membreNorm) sexeLookup.set(`${ensNorm}|${membreNorm}`, extra);
                
                const reg = d.n_mero_de_registre || d.registre_del_sector_p_blic_n_mero;
                if (reg) {
                    const normalizedReg = reg.toString().trim().replace(/^0+/, '');
                    if (!sexeLookup.has(normalizedReg)) sexeLookup.set(normalizedReg, extra);
                }
            });
            
            // 4. Open Data (Participació dataset for tooltips)
            if (onProgress) onProgress({ step: 'Obtenint dades de participació (Tooltips)...', progress: 55 });
            await new Promise(r => setTimeout(r, 400));
            
            const participacioRaw = await API.fetchOpenData(CONFIG.OPEN_DATA.PARTICIPACIO_RESOURCE_ID);
            const participacioLookup = new Map();
            participacioRaw.forEach(d => {
                if (d.denominaci) {
                    const nEns = baseNorm(d.denominaci);
                    const nReg = (d.n_mero_de_registre || "").toString().trim().replace(/^0+/, '');
                    const payload = {
                        grau: d.grau_de_participaci || "-",
                        via: d.via_de_participaci || "-",
                        total: d.total_participaci_generalitat || "-",
                        mesura: d.mesura_de_la_participaci || "-",
                        deptAdscripcio: d.departament_d_adscripci || "-",
                        natureza: d.naturalesa_jur_dica || "-"
                    };
                    participacioLookup.set(nEns, payload);
                    if (nReg && nReg !== "") {
                        participacioLookup.set(nReg, payload);
                    }
                }
            });

            // 5. Open Data (Board of Directors dataset for expiration dates)
            if (onProgress) onProgress({ step: 'Obtenint dates de vigència dels Consells...', progress: 60 });
            await new Promise(r => setTimeout(r, 400));
            
            const consellRaw = await API.fetchOpenData(CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID);
            const consellLookup = new Map();
            const today = new Date();
            today.setHours(0,0,0,0);

            consellRaw.forEach(d => {
                const reg = d.n_mero_de_registre;
                const nom = d.denominaci;
                const dFinalStr = d.data_final_de_vig_ncia;
                
                if (!dFinalStr) return;

                const dFinal = parseDate(dFinalStr);
                if (!dFinal) return;
                const ts = dFinal.getTime();

                const processEntry = (key) => {
                    const existing = consellLookup.get(key); 
                    if (!existing || ts < existing.ts) {
                        consellLookup.set(key, { ts, str: dFinalStr });
                    }
                };

                if (reg) processEntry(reg.toString().trim().replace(/^0+/, ''));
                if (nom) processEntry(baseNorm(nom));
            });

            // 6. Mapatge SAC (Cloud o CSV)
            if (onProgress) onProgress({ step: 'Llegint mapatge personalitzat (SAC Mapping)...', progress: 70 });
            await new Promise(r => setTimeout(r, 400));
            
            let sacLookup = new Map();
            let sourceMapping = null;

            if (manualCsvText) {
                sourceMapping = this.parseSacCsv(manualCsvText);
                if (sourceMapping.length > 0) {
                    localStorage.setItem('sac_mapping_data', JSON.stringify(sourceMapping));
                    await CloudService.saveData(sourceMapping);
                }
            } else {
                const cloudResult = await CloudService.loadData();
                sourceMapping = cloudResult ? cloudResult.data : null;
            }

            if (sourceMapping) {
                sourceMapping.forEach(entry => {
                    const key = getSmartKey(entry.d, entry.m, entry.c);
                    sacLookup.set(key, entry.k.toString().trim());
                });
            }

            // 7. Processament i Creuament
            if (onProgress) onProgress({ step: 'Comparant i validant dades...', progress: 75 });
            await new Promise(r => setTimeout(r, 400));
            
            const finalRecords = this.processRecords(persones, sexeLookup, sacLookup, participacioLookup, consellLookup, onProgress);

            // 8. Persistència
            if (onProgress) onProgress({ step: 'Desant a la base de dades local...', progress: 95 });
            await db.save(CONFIG.DB.STORES.RECORDS, finalRecords, null, true);
            
            const cloudTimestamp = await API.fetchMetadata(resourceId);
            if (cloudTimestamp) await db.save(CONFIG.DB.STORES.METADATA, cloudTimestamp, `ts_${resourceId}`);

            if (onProgress) onProgress({ step: 'Sincronització completada amb èxit!', progress: 100 });
            await new Promise(r => setTimeout(r, 1000));
            
            // Retornem les dades directament de la DB per assegurar que tenen l'ID auto-incrementat
            return await db.getAll(CONFIG.DB.STORES.RECORDS);
        } catch (error) {
            console.error("Full Sync Error:", error);
            throw error;
        }
    }

    parseSacCsv(text) {
        const lines = text.split(/\r?\n/);
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(';');
            if (cols.length > 7) {
                const codi = cols[7].trim();
                if (codi) data.push({ d: cols[1], m: cols[3], c: cols[5], k: codi });
            }
        }
        return data;
    }

    processRecords(persones, sexeLookup, sacLookup, participacioLookup, consellLookup, onProgress) {
        const finalRecords = [];
        const total = persones.length;

        // Detecció dinàmica de columnes (més robust: escaneja els primers 1000 registres)
        const fieldKeysSet = new Set();
        persones.slice(0, 1000).forEach(rec => Object.keys(rec).forEach(key => fieldKeysSet.add(key)));
        const fieldKeys = Array.from(fieldKeysSet);
        
        const findK = (keys) => fieldKeys.find(k => keys.some(kw => k.toLowerCase().includes(kw))) || keys[0];

        const k = {
            entitat: findK(['denominaci_de_l_ens', 'entitat', 'denominaci']),
            membre: findK(['membre']),
            carrec: findK(['c_rrec_o_lloc', 'carrec']),
            dept: findK(['departament']),
            ogs: findK(['govern_superior']),
            reg: findK(['registre']),
            partici: findK(['participant', 'part_cip']),
            designa: findK(['designa']),
            nomenament: findK(['tipus_de_nomenament']),
            qualificador: findK(['qualificador_de_persona_f_sica_jur_dica_o_vacant', 'qualificador']),
            nomRep: findK(['nom_representant_p_jur_dica', 'nom_representant']),
            cognomRep: findK(['cognoms_representant_p_jur_dica', 'cognoms_representant']),
            social: findK(['denominaci_social']),
            categoritzacio: findK(['categoritzaci_part_cip', 'categoritzacio']),
            dataFinal: findK(['data_final_de_vig_ncia', 'data_fi_vigencia'])
        };

        for (let i = 0; i < total; i++) {
            const p = persones[i];
            const vEntitat = p[k.entitat] || "";
            const vMembre = p[k.membre] || "";
            const vCarrec = p[k.carrec] || "";
            const vReg = p[k.reg] || "";
            const vPartici = p[k.partici] || "";

            const nEns = baseNorm(vEntitat);
            const nMembre = baseNorm(vMembre);
            const nCarrec = baseNorm(vCarrec);
            const nReg = vReg.toString().trim().replace(/^0+/, '');

            const extra = sexeLookup.get(`${nEns}|${nMembre}`) || sexeLookup.get(`${nEns}|${nCarrec}`) || sexeLookup.get(nReg);
            
            const record = {
                entitat: vEntitat,
                membre_tipus: vMembre,
                carrec: vCarrec,
                departament: extra ? (extra.dept || p[k.dept] || "") : (p[k.dept] || ""),
                persona_nom: p.nom || "",
                persona_cognoms: p.cognoms || "",
                is_govern_superior: p[k.ogs] || "",
                n_registre: vReg,
                part_cip_o_organisme: vPartici || (extra ? extra.partici : ""),
                rgan_que_designa: p[k.designa] || "",
                tipus_nomenament: p[k.nomenament] || "",
                qualificador: p[k.qualificador] || "",
                nom_rep: p[k.nomRep] || "",
                cognoms_rep: p[k.cognomRep] || "",
                denom_social: p[k.social] || "",
                categoritzacio: extra ? (extra.categoritzacio || p[k.categoritzacio] || "") : (p[k.categoritzacio] || ""),
                codi_sac: "",
                sac_nom_responsable: "",
                sac_unitat: "",
                sac_departament: "",
                sac_carrec: "",
                sac_relacions: "",
                status: "",
                // Tooltip data
                part_grau: "-",
                part_via: "-",
                part_total: "-",
                part_mesura: "-",
                part_dept_adscripcio: "-",
                part_natureza: "-",
                data_final_de_vig_ncia: "",
                data_final_individual: p[k.dataFinal] || ""
            };

            const partExtra = participacioLookup.get(nReg) || participacioLookup.get(nEns);
            if (partExtra) {
                record.part_grau = partExtra.grau;
                record.part_via = partExtra.via;
                record.part_total = partExtra.total;
                record.part_mesura = partExtra.mesura;
                record.part_dept_adscripcio = partExtra.deptAdscripcio;
                record.part_natureza = partExtra.natureza;
            }
            
            const vDataFinalObj = consellLookup.get(nReg) || consellLookup.get(nEns);
            if (vDataFinalObj) {
                record.data_final_de_vig_ncia = vDataFinalObj.str;
            }

            const smartKey = getSmartKey(vEntitat, vMembre, vCarrec);
            if (sacLookup.has(smartKey)) {
                const codiSac = sacLookup.get(smartKey);
                record.codi_sac = codiSac;
                record.status = "Pendent";

                if (this.algoliaLookup && this.algoliaLookup.has(codiSac)) {
                    const alg = this.algoliaLookup.get(codiSac);
                    record.sac_nom_responsable = alg.dadesOrganigrama.nomresponsable;
                    record.sac_unitat = alg.unitatResp.unitat;
                    record.sac_departament = alg.unitatResp.departament;
                    record.sac_carrec = alg.dadesOrganigrama.carrec;

                    const n1 = baseNormPersona(`${record.persona_nom} ${record.persona_cognoms}`);
                    const n2 = baseNormPersona(record.sac_nom_responsable);
                    
                    // Extracció de relacions
                    const rawRel = alg.relacions || (alg.dadesOrganigrama ? alg.dadesOrganigrama.relacions : null);
                    if (rawRel) {
                        record.sac_relacions = JSON.stringify(rawRel);
                    } else {
                        record.sac_relacions = "";
                    }

                    // Validació robusta: si coincideix el nom, és Validat.
                    if (n1 === n2 && n1 !== "") {
                        record.status = "Validat";
                    }
                }
            } else {
                record.status = "No vinculat";
            }

            finalRecords.push(record);
            if (i % 10000 === 0 && onProgress) {
                onProgress({ step: `Processant registres... (${i} / ${total})`, progress: 75 + (i/total * 20) });
            }
        }
        return finalRecords;
    }

    /**
     * Actualització ràpida en memòria d'un sol registre
     */
    async updateSingleRecord(record, sacFields) {
        // Lògica de validació de status
        const codi = sacFields.codi_sac || "";
        let nomSAC = sacFields.sac_nom_responsable || "";
        let status = "Pendent";

        if (codi && !nomSAC && this.algoliaLookup && this.algoliaLookup.has(codi)) {
            const alg = this.algoliaLookup.get(codi);
            nomSAC = alg.dadesOrganigrama.nomresponsable;
            sacFields.sac_nom_responsable = nomSAC;
            sacFields.sac_unitat = alg.unitatResp.unitat;
            sacFields.sac_departament = alg.unitatResp.departament;
            sacFields.sac_carrec = alg.dadesOrganigrama.carrec;
            
            // Relacions
            const rawRel = alg.relacions || (alg.dadesOrganigrama ? alg.dadesOrganigrama.relacions : null);
            sacFields.sac_relacions = rawRel ? JSON.stringify(rawRel) : "";
        }

        if (codi && nomSAC) {
            const n1 = baseNormPersona(`${record.persona_nom} ${record.persona_cognoms}`);
            const n2 = baseNormPersona(nomSAC);
            if (n1 === n2 && n1 !== "") status = "Validat";
        } else if (!codi) {
            status = "No vinculat";
        }

        const updated = { ...record, ...sacFields, status };
        
        // Persistir a DB
        const transaction = db.db.transaction([CONFIG.DB.STORES.RECORDS], 'readwrite');
        const store = transaction.objectStore(CONFIG.DB.STORES.RECORDS);
        store.put(updated);
        
        return updated;
    }
}

export const syncEngine = new SyncEngine();
