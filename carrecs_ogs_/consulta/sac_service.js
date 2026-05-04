/**
 * sac_service.js - Versió 3.0 (Motor de Sincronització Intel·ligent)
 * Gestiona la càrrega des de memòria cau, el control de versions i les actualitzacions parcials.
 */

const SAC_CLOUD_SERVICE = {
    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbyvUzvFgnWqG2EdDnh8fu07ZXHdk7noYXM_lo322nh_fZb-xAdYoykFKPkEq1JYCeaH/exec',
    
    // Noms de les claus per a la memòria cau del navegador
    CACHE_KEY: 'sac_mapping_data',
    TS_KEY: 'sac_mapping_timestamp',

    /**
     * Carrega les dades de forma intel·ligent.
     * Si les dades del navegador coincideixen amb la versió del núvol, no descarrega res (instantani).
     */
    async loadData() {
        try {
            const cachedDataStr = localStorage.getItem(this.CACHE_KEY);
            const cachedTS = localStorage.getItem(this.TS_KEY) || "0";
            let cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;
            
            // OPTIMITZACIÓ: Throttle de xarxa
            const lastCheck = sessionStorage.getItem('sac_last_cloud_check') || 0;
            const now = Date.now();
            if (now - lastCheck < 30000 && cachedData) {
                return { data: cachedData, isNew: false };
            }
            
            sessionStorage.setItem('sac_last_cloud_check', now);
            console.log('Comprovant versió al núvol...');
            const checkUrl = `${this.WEB_APP_URL}?action=check&t=${new Date().getTime()}`;
            const checkResponse = await fetch(checkUrl);
            
            if (checkResponse.ok) {
                const { timestamp } = await checkResponse.json();
                
                // Si la versió coincideix, utilitzem el que tenim a memòria
                if (timestamp === cachedTS && cachedData) {
                    return { data: cachedData, isNew: false };
                }
                
                // Si la versió és diferent, descarreguem tot
                console.log('Sincronitzant amb el núvol...');
                const fullResponse = await fetch(`${this.WEB_APP_URL}?t=${new Date().getTime()}`);
                if (fullResponse.ok) {
                    const freshData = await fullResponse.json();
                    
                    // AUTO-HEALING: Si el núvol està buit però nosaltres tenim dades locals, les repujem
                    if (Array.isArray(freshData)) {
                        if (freshData.length === 0 && cachedData && cachedData.length > 0) {
                            console.warn("Núvol buit detectat! Restaurat automàticament des de dades locals...");
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
            const cachedDataStr = localStorage.getItem(this.CACHE_KEY);
            return cachedDataStr ? { data: JSON.parse(cachedDataStr), isNew: false } : null;
        }
    },

    /**
     * Guarda tota la base de dades sense problemes d'índex (Més robust).
     */
    async saveData(data) {
        try {
            console.log('Enviant dades al núvol (Full Overwrite)...');
            const response = await fetch(this.WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(data)
            });
            
            localStorage.removeItem(this.TS_KEY);
            console.log('Sincronització completada.');
            return true;
        } catch (error) {
            console.error('Error en la sincronització:', error);
            return false;
        }
    },
    
    /**
     * Guarda un registre però fent servir un volcat total per seguretat.
     * Això evita que si el script rep un objecte sol, esborri la resta.
     */
    async savePartial(entry) {
        try {
            // 1. Obtenir dades actuals de la memòria cau local
            const cachedDataStr = localStorage.getItem(this.CACHE_KEY);
            let data = cachedDataStr ? JSON.parse(cachedDataStr) : [];
            
            // 2. Actualitzar o afegir l'entrada
            let found = false;
            for(let i = 0; i < data.length; i++) {
                if(data[i].d === entry.d && data[i].m === entry.m && data[i].c === entry.c) {
                    data[i].k = entry.k;
                    found = true;
                    break;
                }
            }
            if(!found) data.unshift(entry);
            
            // 3. Persistir localment immediatament
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
            
            // 4. Volcat total al núvol
            return await this.saveData(data);
        } catch (error) {
            console.error('Error en savePartial (Fallback segur):', error);
            return false;
        }
    },

    updateCache(data, timestamp) {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(this.TS_KEY, timestamp);
    }
};
