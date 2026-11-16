/**
 * cloud.js - Integració amb Google Apps Script (SAC Cloud Service)
 */

import { CONFIG } from './config.js';

export const CloudService = {
    /**
     * Carrega les dades de mapatge des del núvol amb control de versió i cache
     */
    async loadData() {
        try {
            const cachedDataStr = localStorage.getItem('sac_mapping_data');
            const cachedTS = localStorage.getItem('sac_mapping_timestamp') || "0";
            let cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;
            
            // Throttle de xarxa per evitar crides excessives
            const lastCheck = sessionStorage.getItem('sac_last_cloud_check') || 0;
            const now = Date.now();
            if (now - lastCheck < CONFIG.SYNC.CLOUD_CHECK_INTERVAL && cachedData) {
                return { data: cachedData, isNew: false };
            }
            
            sessionStorage.setItem('sac_last_cloud_check', now);
            console.log('Comprovant versió al núvol...');
            const checkUrl = `${CONFIG.CLOUD.WEB_APP_URL}?action=check&t=${new Date().getTime()}`;
            const checkResponse = await fetch(checkUrl);
            
            if (checkResponse.ok) {
                const { timestamp } = await checkResponse.json();
                
                if (timestamp === cachedTS && cachedData) {
                    return { data: cachedData, isNew: false };
                }
                
                console.log('Sincronitzant amb el núvol...');
                const fullResponse = await fetch(`${CONFIG.CLOUD.WEB_APP_URL}?t=${new Date().getTime()}`);
                if (fullResponse.ok) {
                    const freshData = await fullResponse.json();
                    
                    if (Array.isArray(freshData)) {
                        // Auto-healing: si el núvol està buit però tenim dades locals, restaurem
                        if (freshData.length === 0 && cachedData && cachedData.length > 0) {
                            console.warn("Núvol buit detectat! Restaurat automàticament.");
                            await this.saveData(cachedData); 
                            return { data: cachedData, isNew: true };
                        }
                        
                        this.updateCache(freshData, timestamp);
                        return { data: freshData, isNew: true };
                    }
                }
            }
            
            return cachedData ? { data: cachedData, isNew: false } : null;
        } catch (error) {
            console.error("Cloud load error:", error);
            const cachedDataStr = localStorage.getItem('sac_mapping_data');
            return cachedDataStr ? { data: JSON.parse(cachedDataStr), isNew: false } : null;
        }
    },

    async saveData(data) {
        try {
            console.log('Enviant dades al núvol...');
            await fetch(CONFIG.CLOUD.WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(data)
            });
            
            localStorage.removeItem('sac_mapping_timestamp');
            return true;
        } catch (error) {
            console.error('Error en la sincronització al núvol:', error);
            return false;
        }
    },
    
    async savePartial(entry) {
        const cachedDataStr = localStorage.getItem('sac_mapping_data');
        let data = cachedDataStr ? JSON.parse(cachedDataStr) : [];
        
        let found = false;
        for(let i = 0; i < data.length; i++) {
            if(data[i].d === entry.d && data[i].m === entry.m && data[i].c === entry.c) {
                data[i].k = entry.k;
                found = true;
                break;
            }
        }
        if(!found) data.unshift(entry);
        
        localStorage.setItem('sac_mapping_data', JSON.stringify(data));
        return await this.saveData(data);
    },

    updateCache(data, timestamp) {
        localStorage.setItem('sac_mapping_data', JSON.stringify(data));
        localStorage.setItem('sac_mapping_timestamp', timestamp);
    }
};
