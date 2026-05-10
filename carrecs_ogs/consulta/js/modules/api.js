/**
 * api.js - Clients per a les APIs d'Open Data i Algolia
 */

import { CONFIG } from './config.js';

export const API = {
    /**
     * Descarrega dades d'Open Data Catalunya amb suport per a paginació
     */
    async fetchOpenData(resourceId, onProgress) {
        let allData = [];
        const limit = CONFIG.SYNC.FETCH_LIMIT;
        let offset = 0;
        let totalReceived = 0;

        while (true) {
            const url = `${CONFIG.OPEN_DATA.BASE_URL}/resource/${resourceId}.json?$limit=${limit}&$offset=${offset}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Open Data error (${resourceId}): ${response.statusText}`);

            const chunk = await response.json();
            if (!chunk || chunk.length === 0) break;

            allData = allData.concat(chunk);
            totalReceived += chunk.length;
            offset += limit;

            if (onProgress) onProgress(totalReceived);
            if (chunk.length < limit) break;
        }
        return allData;
    },

    /**
     * Obté les metadades d'un recurs d'Open Data per comprovar actualitzacions
     */
    async fetchMetadata(resourceId) {
        try {
            const url = `${CONFIG.OPEN_DATA.BASE_URL}/api/views/${resourceId}.json`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const meta = await response.json();
            return meta.rowsUpdatedAt;
        } catch (e) {
            console.warn("No s'ha pogut obtenir metadades:", e);
            return null;
        }
    },

    /**
     * Descarrega tot l'índex d'Algolia utilitzant el mètode 'browse'
     */
    async fetchAlgolia(onProgress) {
        const lookup = new Map();
        let cursor = null;
        let total = 0;

        const headers = {
            "X-Algolia-Application-Id": CONFIG.ALGOLIA.APP_ID,
            "X-Algolia-API-Key": CONFIG.ALGOLIA.API_KEY,
            "Content-Type": "application/json"
        };

        do {
            const url = `https://${CONFIG.ALGOLIA.APP_ID}-dsn.algolia.net/1/indexes/${CONFIG.ALGOLIA.INDEX_NAME}/browse`;
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

        return lookup;
    },
    async fetchConsellAdmon(regNumber, name) {
        let url = `${CONFIG.OPEN_DATA.BASE_URL}/resource/${CONFIG.OPEN_DATA.CONSELL_ADMON_RESOURCE_ID}.json?`;
        if (regNumber && regNumber !== '-') {
            url += `n_mero_de_registre=${regNumber}`;
        } else {
            url += `denominaci=${encodeURIComponent(name)}`;
        }
        url += `&$limit=50000`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al carregar el consell');
        return await response.json();
    }
};
