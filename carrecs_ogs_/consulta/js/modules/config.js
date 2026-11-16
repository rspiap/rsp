/**
 * config.js - Configuració centralitzada de l'aplicació
 */

export const CONFIG = {
    // Open Data Catalunya
    OPEN_DATA: {
        RESOURCE_ID: 'auai-ppkn', // Persones i membres d'òrgans de govern
        EXTRA_RESOURCE_ID: 'sexe-cpsh', // Registre del sector públic (enriquiment)
        PARTICIPACIO_RESOURCE_ID: 'gr39-ik6u', // Participació de la Generalitat (tooltips)
        CONSELL_ADMON_RESOURCE_ID: 'nmgt-rq9t',
        BASE_URL: 'https://analisi.transparenciacatalunya.cat'
    },

    // Algolia SAC
    ALGOLIA: {
        APP_ID: "GAVVNU5N19",
        API_KEY: "a4c62f41bac4bec5f3d3b0ced22ae65b",
        INDEX_NAME: "pro_ADRECES_SAC"
    },

    // Google Apps Script (SAC Cloud Service)
    CLOUD: {
        WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbyvUzvFgnWqG2EdDnh8fu07ZXHdk7noYXM_lo322nh_fZb-xAdYoykFKPkEq1JYCeaH/exec'
    },

    // IndexedDB
    DB: {
        NAME: 'SectorPublicDB_Modular',
        VERSION: 1,
        STORES: {
            RECORDS: 'records',
            METADATA: 'metadata',
            ALGOLIA_CACHE: 'algolia_cache'
        }
    },

    // UI & Sync
    SYNC: {
        CHUNK_SIZE: 100,
        FETCH_LIMIT: 50000,
        CLOUD_CHECK_INTERVAL: 30000, // 30 segons per al throttle de xarxa
        AUTO_SYNC_INTERVAL: 180000   // 3 minuts per a la comprovació automàtica
    }
};
