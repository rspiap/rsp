/**
 * db.js - Gestió de la base de dades local (IndexedDB)
 */
console.log("[JS] Carregant mòdul db.js...");
import { CONFIG } from './config.js';

export class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timeout obrint la base de dades")), 5000);
            
            const request = indexedDB.open(CONFIG.DB.NAME, CONFIG.DB.VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                const stores = CONFIG.DB.STORES;

                if (!db.objectStoreNames.contains(stores.RECORDS)) {
                    const store = db.createObjectStore(stores.RECORDS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('codi_sac', 'codi_sac', { unique: false });
                    store.createIndex('entitat', 'entitat', { unique: false });
                }
                if (!db.objectStoreNames.contains(stores.METADATA)) {
                    db.createObjectStore(stores.METADATA);
                }
                if (!db.objectStoreNames.contains(stores.ALGOLIA_CACHE)) {
                    db.createObjectStore(stores.ALGOLIA_CACHE);
                }
            };

            request.onsuccess = (e) => {
                clearTimeout(timeout);
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                clearTimeout(timeout);
                reject(e.target.error);
            };
        });
    }

    async getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getByKey(storeName, key) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    async save(storeName, data, key = null, clear = false) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            if (clear) {
                const clearReq = store.clear();
                clearReq.onsuccess = () => {
                    if (key !== null && key !== undefined) {
                        store.put(data, key);
                    } else if (Array.isArray(data)) {
                        const chunkSize = 5000;
                        for (let i = 0; i < data.length; i += chunkSize) {
                            const chunk = data.slice(i, i + chunkSize);
                            chunk.forEach(item => store.add(item));
                        }
                    } else {
                        store.put(data);
                    }
                };
            } else {
                if (key !== null && key !== undefined) {
                    store.put(data, key);
                } else if (Array.isArray(data)) {
                    const chunkSize = 5000;
                    for (let i = 0; i < data.length; i += chunkSize) {
                        const chunk = data.slice(i, i + chunkSize);
                        chunk.forEach(item => store.add(item));
                    }
                } else {
                    store.put(data);
                }
            }

            transaction.oncomplete = () => {
                this.notifyChange(storeName);
                resolve();
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    async clear(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => {
                this.notifyChange(storeName);
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    notifyChange(storeName) {
        const timestamp = Date.now();
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                if (!this.broadcastChannel) {
                    this.broadcastChannel = new BroadcastChannel('sector_public_db_channel');
                }
                this.broadcastChannel.postMessage({
                    type: 'DB_CHANGED',
                    store: storeName,
                    timestamp: timestamp
                });
            }
        } catch (e) {
            console.warn("[DB] Error emetent per BroadcastChannel:", e);
        }

        try {
            localStorage.setItem('db_last_update_' + storeName, timestamp.toString());
            localStorage.setItem('db_last_records_update', timestamp.toString());
        } catch (e) {
            // Ignorat si hi ha restriccions de quota
        }
    }
}

export const db = new Database();
