/**
 * board-of-directors.js - Mòdul per gestionar la consulta dels Consells d'Administració
 */
import { API } from './api.js';

export const BoardService = {
    /**
     * Obre el modal i carrega les dades del consell d'administració
     * @param {string} reg Número de registre de l'entitat
     * @param {string} name Nom de l'entitat
     */
    async openModal(reg, name) {
        const modal = document.getElementById('consellModal');
        const title = document.getElementById('consellModalTitle');
        const loading = document.getElementById('consellLoading');
        const content = document.getElementById('consellContent');
        const tbody = document.getElementById('consellTableBody');

        if (!modal || !title || !loading || !content || !tbody) return;

        title.textContent = `Consell d'Administració: ${name}`;
        tbody.innerHTML = '';
        loading.style.display = 'block';
        content.style.display = 'none';
        modal.style.display = 'flex';

        try {
            const data = await API.fetchConsellAdmon(reg, name);
            loading.style.display = 'none';
            content.style.display = 'block';

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">No s\'han trobat dades del consell per a aquesta entitat.</td></tr>';
                return;
            }

            // Ordenem les dades segons el codi numèric del càrrec (jerarquia)
            data.sort((a, b) => {
                const getCode = (s) => parseInt((s || "").split("-")[0]) || 999;
                return getCode(a.c_rrec_en_l_rgan_de_govern_superior) - getCode(b.c_rrec_en_l_rgan_de_govern_superior);
            });

            // Mantenim el total de membres al títol si està disponible
            const totalMembres = data[0].nombre_total_de_persones_administradores;
            if (totalMembres) {
                title.innerHTML = `Consell d'Administració: ${name} <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal; margin-left: 10px;">(Total membres: ${totalMembres})</span>`;
            }

            data.forEach(d => {
                const tr = document.createElement('tr');
                
                // Neteja del càrrec (eliminar prefix numèric tipus "15-")
                const carrecNet = (d.c_rrec_en_l_rgan_de_govern_superior || "").replace(/^\d+-/, "");
                
                // Lògica per a Persones Jurídiques vs Físiques
                let membreHTML = "";
                const isJuridica = (d.qualificador || "").toLowerCase().includes("jur");
                
                const nomenamentText = d.tipus_de_nomenament || "";
                const organText = d.rgan_que_designa ? `(${d.rgan_que_designa})` : "";
                
                const metaInfoHTML = `
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px; font-style:italic; line-height:1.2;">
                        ${nomenamentText}
                        ${nomenamentText && organText ? '<br>' : ''}
                        ${organText}
                    </div>
                `;
                
                if (isJuridica) {
                    membreHTML = `
                        <div style="font-weight:700; color:var(--text-main); font-size:0.85rem;">${d.denominaci_social || ''}</div>
                        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">${d.nif_persona_jur_dica ? 'NIF: ' + d.nif_persona_jur_dica : ''}</div>
                        <div style="font-size:0.7rem; color:var(--secondary); font-weight:600; margin-top:4px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.05);">
                            ${d.nom_representant_p_jur_dica || d.cognoms_representant_p_jur_dica ? 'Rep: ' + (d.nom_representant_p_jur_dica || '') + ' ' + (d.cognoms_representant_p_jur_dica || '') : ''}
                        </div>
                        ${metaInfoHTML}
                    `;
                } else {
                    membreHTML = `
                        <div style="font-weight:700; color:var(--text-main); font-size:0.85rem;">${d.nom_representant || ''} ${d.cognoms_representant || ''}</div>
                        ${metaInfoHTML}
                    `;
                }

                tr.innerHTML = `
                    <td style="font-size:0.7rem; font-weight:600;">${carrecNet || ''}</td>
                    <td>${membreHTML}</td>
                    <td style="font-size:0.75rem;">${d.c_rrec_o_lloc_de_treball || ''}</td>
                    <td style="font-size:0.7rem; color:var(--text-muted);">${d.forma_d_organitzaci || ''}</td>
                    <td style="white-space: nowrap; font-family: monospace; font-size:0.75rem;">${d.data_inici_de_vig_ncia || ''}</td>
                    <td style="white-space: nowrap; font-family: monospace; font-size:0.75rem;">${d.data_final_de_vig_ncia || ''}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            loading.style.display = 'none';
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--primary); padding:2rem;">Error al carregar les dades: ${e.message}</td></tr>`;
        }
    },

    /**
     * Tanca el modal del consell d'administració
     */
    closeModal() {
        const modal = document.getElementById('consellModal');
        if (modal) modal.style.display = 'none';
    }
};

// Exposar globalment per als handlers inline HTML
window.openConsellModal = (reg, name) => BoardService.openModal(reg, name);
window.closeConsellModal = () => BoardService.closeModal();
