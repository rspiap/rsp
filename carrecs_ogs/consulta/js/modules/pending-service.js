/**
 * pending-service.js - Mòdul per carregar i creuar els canvis pendents de validar
 */

import { baseNorm, baseNormPersona } from './utils.js';

function decodeHtml(str) {
    if (!str) return '';
    return str.replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
}

export const PendingService = {
    pendingData: [],
    lookupMap: new Map(), // Registre de canvis per diferents claus normalitzades
    loaded: false,

    /**
     * Carrega les dades de canvis pendents des del fitxer o la memòria cau
     */
    async loadPendingData() {
        if (this.loaded && this.pendingData.length > 0) return this.pendingData;

        try {
            const filenames = [
                'anonimitzat_canvis_pendents_creuats_2026-07-21.json',
                'canvis_pendents_creuats_2026-07-21.json',
                'canvis_pendents_creuats.json',
                'canvis_pendents_catens.json'
            ];

            let data = null;
            for (const fn of filenames) {
                try {
                    const resp = await fetch(fn + '?v=' + Date.now());
                    if (resp.ok) {
                        data = await resp.json();
                        console.log(`[PendingService] Dades pendents carregades des de ${fn} (${data.length} entrades)`);
                        break;
                    }
                } catch (e) {}
            }

            if (!data) {
                console.log('[PendingService] No s\'ha trobat fitxer local de canvis pendents.');
                this.loaded = true;
                return [];
            }

            this.pendingData = data;
            this.buildIndex(data);
            this.loaded = true;
            return this.pendingData;

        } catch (err) {
            console.error('[PendingService] Error carregant canvis pendents:', err);
            return [];
        }
    },

    /**
     * Indexa els canvis per trobar coincidències ràpides amb la taula actual
     */
    buildIndex(data) {
        this.lookupMap.clear();

        data.forEach(item => {
            let detalls = [];

            if (item._detall_representants && Array.isArray(item._detall_representants)) {
                detalls = item._detall_representants;
            } else if (item.ESTADO) {
                detalls = [item];
            }

            if (detalls.length === 0) return;

            // Cercar parelles de Valor nou i Valor anterior
            const nou = detalls.find(d => d.ESTADO === 'Valor nou');
            const anterior = detalls.find(d => d.ESTADO === 'Valor anterior');

            if (nou || anterior) {
                const targetRef = anterior || nou;
                const operacio = (item.OPERACION || "").trim();
                
                // Normalització de l'entitat
                const rawEns = decodeHtml(item.DENOM_ENS || targetRef.ORGANO_NOMBRE || item.entitat || "");
                const entitatNorm = baseNorm(rawEns);

                // Normalització de la persona (Pf / Pj / Rep)
                const pfName = targetRef.NOMBRE_PF || targetRef.APELLIDOS_PF ? `${targetRef.NOMBRE_PF || ''} ${targetRef.APELLIDOS_PF || ''}`.trim() : "";
                const pjName = targetRef.NOMBRE_PJ || "";
                const repName = targetRef.NOMBRE_PERSONA_REPRESENTANTE || targetRef.APELLIDOS_PERSONA_REPRESENTANTE ? `${targetRef.NOMBRE_PERSONA_REPRESENTANTE || ''} ${targetRef.APELLIDOS_PERSONA_REPRESENTANTE || ''}`.trim() : "";
                const membreName = targetRef.MIEMBRO_ORGANO_GOBIERNO || "";

                const personaName = pfName || pjName || repName || membreName;
                const personaNorm = baseNormPersona(personaName);

                // Mapeig correcte de càrrec funcional (Vocal/Vicepresident) i òrgan/representació (Conseller de Territori)
                const pendingCargoNorm = baseNorm(targetRef.CARGO_GOBIERNO_SUPERIOR || "");
                const pendingOrganNorm = baseNorm(targetRef.ORGANO_NOMBRE || targetRef.MIEMBRO_ORGANO_GOBIERNO || "");

                const payload = {
                    nou,
                    anterior,
                    itemHeader: item,
                    operacio: operacio,
                    type: anterior ? (nou ? 'modification' : 'deletion') : 'addition'
                };

                if (entitatNorm) {
                    if (personaNorm) {
                        this.lookupMap.set(`${entitatNorm}|${personaNorm}`, payload);
                        if (pendingCargoNorm) {
                            this.lookupMap.set(`${entitatNorm}|cargo_${pendingCargoNorm}|${personaNorm}`, payload);
                        }
                        if (pendingOrganNorm) {
                            this.lookupMap.set(`${entitatNorm}|organ_${pendingOrganNorm}|${personaNorm}`, payload);
                        }
                    }
                }
            }
        });

        console.log(`[PendingService] Indexats ${this.lookupMap.size} claus de canvis pendents.`);
    },

    /**
     * Comprova si un registre de la taula té un canvi pendent de validar
     * @param {Object} r Registre de la taula
     * @returns {Object|null} Payload amb el valor nou si n'hi ha
     */
    getPendingChange(r) {
        if (!r || !this.loaded || this.lookupMap.size === 0) return null;

        const entitatsCandidates = [
            r.entitat,
            r.ORGANO_NOMBRE,
            r.part_cip_o_organisme,
            r.sac_unitat,
            r.departament
        ].filter(Boolean).map(e => baseNorm(decodeHtml(e))).filter(Boolean);

        const personesCandidates = [
            `${r.persona_nom || ''} ${r.persona_cognoms || ''}`.trim(),
            r.denom_social,
            `${r.nom_rep || ''} ${r.cognoms_rep || ''}`.trim(),
            r.part_cip_o_organisme
        ].filter(Boolean).map(p => baseNormPersona(decodeHtml(p))).filter(Boolean);

        // Mapeig corregit:
        // is_govern_superior conté el càrrec funcional (Vocal)
        // carrec conté l'òrgan/representació (Conseller de Territori)
        const dbCargoNorm = baseNorm(r.is_govern_superior || "");
        const dbOrganNorm = baseNorm(r.carrec || "");

        for (const entitatNorm of entitatsCandidates) {
            for (const personaNorm of personesCandidates) {
                if (dbCargoNorm && personaNorm) {
                    const k1 = `${entitatNorm}|cargo_${dbCargoNorm}|${personaNorm}`;
                    if (this.lookupMap.has(k1)) return this.lookupMap.get(k1);
                }
                if (dbOrganNorm && personaNorm) {
                    const k2 = `${entitatNorm}|organ_${dbOrganNorm}|${personaNorm}`;
                    if (this.lookupMap.has(k2)) return this.lookupMap.get(k2);
                }
                const k3 = `${entitatNorm}|${personaNorm}`;
                if (this.lookupMap.has(k3)) return this.lookupMap.get(k3);
            }
        }

        return null;
    }
};
