/**
 * help-modal.js - Modal compartit d'Ajuda, Instruccions i FAQs
 */

let helpModalInitialized = false;

function buildHelpModalHTML() {
    return `
        <div id="helpModal" class="modal-overlay" style="display: none;">
            <div class="modal-content glass help-modal-content">
                <div class="help-modal-header">
                    <div>
                        <h2 style="margin: 0; font-size: 1.25rem;">Ajuda i Preguntes Freqüents (FAQs)</h2>
                        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
                            Guia ràpida de funcionament de Consulta Sector Públic i Panell de Caducitats
                        </p>
                    </div>
                    <button type="button" id="btnCloseHelpModal" class="btn btn-secondary" aria-label="Tancar">Tancar</button>
                </div>

                <div class="help-tabs" role="tablist">
                    <button type="button" class="help-tab active" data-help-tab="consulta">Taula de Consulta</button>
                    <button type="button" class="help-tab" data-help-tab="caducitats">Panell de Caducitats</button>
                    <button type="button" class="help-tab" data-help-tab="faqs">FAQs</button>
                </div>

                <div class="help-body">
                    <div class="help-panel active" data-help-panel="consulta">
                        <h3>Estructura i Navegació</h3>
                        <ul>
                            <li><strong>Jerarquia de 5 nivells:</strong> Codi SAC → Càrrec (SAC) → Entitat (amb núm. de registre i participació en passar-hi el ratolí) → Òrgan de Govern Superior (OGS) → Persona / Estat.</li>
                            <li><strong>Cerca global i per columna:</strong> Pots cercar a tota la taula des del quadre superior o filtrar per columna fent clic a la icona de lupa de cada capçalera.</li>
                            <li><strong>Lògica de filtres (Sostractiva vs Additiva):</strong> Afecta els botons interruptor (<code>Només SAC</code>, <code>Sense càrrec</code>, <code>Vacants</code>, <code>Validacions pendents</code>). En mode <em>Sostractiva (AND)</em> s'han de complir tots els actius; en <em>Additiva (OR)</em> n'hi ha prou amb un.</li>
                        </ul>

                        <h3>Filtres Específics</h3>
                        <ul>
                            <li><strong>Estat Consells (CA) i Estat càrrecs OGS:</strong> Filtra per vigència (<em>Caducats</em>, <em>Propera caducitat</em> segons els mesos indicats, <em>Vigents</em> i <em>No informat</em>).</li>
                            <li><strong>Qualificador:</strong> Permet filtrar segons el qualificador de participació de l'ens (<em>Entitat del sector públic de la Generalitat</em> o <em>Entitat participada no majoritàriament</em>).</li>
                            <li><strong>RF (Registre de Fundacions):</strong> Selecció múltiple per flags per al càrrec al RSP i per a la Ref. SAC (<em>Consta / No consta al RF (RSP)</em> i <em>Consta / No consta al RF (SAC)</em>). Dins del mateix camp aplica lògica OR; entre camps diferents (RSP i SAC) aplica lògica AND.</li>
                        </ul>

                        <h3>Registre de Fundacions, Enllaços i Exportació</h3>
                        <ul>
                            <li><strong>Comprovació al RF:</strong> A les entitats de tipus <em>Fundació</em>, s'indica sota el nom (i dins <code>Ref. SAC:</code>) si la persona consta al Registre de Fundacions (<code>✓</code> verd), si hi ha una coincidència per variant ortogràfica/fonètica (<code>≈</code> ambre), o si no hi consta (<code>✗</code> vermell).</li>
                            <li><strong>Enllaços prefiltrats:</strong> Cada filtre que marques s'actualitza automàticament a la URL. Fes clic a <strong>Copiar enllaç</strong> per compartir una vista ja filtrada.</li>
                            <li><strong>Exportació XLSX:</strong> El botó <strong>XLSX</strong> descarrega un fitxer Excel amb els registres filtrats actualment.</li>
                        </ul>
                    </div>

                    <div class="help-panel" data-help-panel="caducitats">
                        <h3>Visualització de Caducitats</h3>
                        <ul>
                            <li><strong>Commutador OGS / CA:</strong>
                                <ul>
                                    <li><strong>Òrgans de Govern Superior (OGS):</strong> Avalua la data individual de fi de mandat de cada càrrec/membre (<code>data_final_individual</code>).</li>
                                    <li><strong>Consells d'Administració (CA):</strong> Avalua els membres i mandats del dataset oficial de Consells d'Administració.</li>
                                </ul>
                            </li>
                            <li><strong>Propera caducitat (mesos):</strong> Defineix el marge en mesos futurs per classificar un mandat en franja taronja (proper a caducar).</li>
                            <li><strong>Filtre Qualificador:</strong> Filtra tant el potenciòmetre global com les targetes per naturalesa jurídica segons el qualificador de participació de l'ens.</li>
                            <li><strong>Detall interactiu:</strong> Fes clic sobre qualsevol targeta per obrir el llistat detallat i cercable dels càrrecs o membres corresponents.</li>
                        </ul>
                    </div>

                    <div class="help-panel" data-help-panel="faqs">
                        <div class="faq-item">
                            <h4>Com s'actualitzen les dades d'Open Data?</h4>
                            <p>En obrir la pàgina es carreguen a l'instant les dades locals desades a IndexedDB. En segon pla, l'aplicació comprova si algun dels 6 datasets d'Open Data ha canviat; si hi ha novetats, resincronitza automàticament, i si no n'hi ha, pots treballar sense cap espera. També pots forçar-ho amb el botó <strong>Actualitzar</strong>.</p>
                        </div>
                        <div class="faq-item">
                            <h4>Què vol dir el requadre vermell <code>Ref. SAC:</code>?</h4>
                            <p>Indica que el càrrec està vinculat a una fitxa del SAC, però el nom del responsable al SAC no coincideix amb el nom registrat al Registre del Sector Públic (estat <em>Pendent</em>).</p>
                        </div>
                        <div class="faq-item">
                            <h4>Per a què serveix combinar <code>No consta al RF (RSP)</code> i <code>Consta al RF (SAC)</code>?</h4>
                            <p>Permet localitzar de cop les fundacions on la persona que figura al RSP ja no consta al Registre de Fundacions, mentre que la persona informada al SAC sí que hi consta inscrita i, per tant, ja es pot actualitzar al RSP.</p>
                        </div>
                        <div class="faq-item">
                            <h4>Per què una fundació mostra "Sense dades al Reg. Fundacions"?</h4>
                            <p>Perquè al dataset d'Òrgans de Govern del Registre de Fundacions (<code>i46c-ebpp</code>) no hi ha membres informats per a aquella entitat o no s'ha trobat correspondència per NIF ni número d'inscripció.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function initHelpModal(defaultTab = 'consulta') {
    if (!helpModalInitialized) {
        document.body.insertAdjacentHTML('beforeend', buildHelpModalHTML());
        helpModalInitialized = true;

        const modal = document.getElementById('helpModal');
        const closeBtn = document.getElementById('btnCloseHelpModal');
        const tabs = modal.querySelectorAll('.help-tab');
        const panels = modal.querySelectorAll('.help-panel');

        const activateTab = (tabName) => {
            tabs.forEach(t => t.classList.toggle('active', t.dataset.helpTab === tabName));
            panels.forEach(p => p.classList.toggle('active', p.dataset.helpPanel === tabName));
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => activateTab(tab.dataset.helpTab));
        });

        const closeModal = () => { modal.style.display = 'none'; };
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
        });

        modal._activateTab = activateTab;
    }

    const btnHelp = document.getElementById('btnHelp');
    const modal = document.getElementById('helpModal');
    if (btnHelp && modal) {
        btnHelp.addEventListener('click', () => {
            if (modal._activateTab) modal._activateTab(defaultTab);
            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        });
    }
}
