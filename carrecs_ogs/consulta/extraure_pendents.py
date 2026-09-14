import requests
import json
import time
import random

def extreure_canvis_pendents():
    print("🚀 FASE 1: Obtenint la llista d'entitats amb canvis pendents...")
    print("🛡️ Comportament humà activat: Pauses aleatòries i capçaleres de navegació reals.")
    
    all_ids = []
    start = 0
    limit = 50
    page = 1
    total_registros = 0
    has_more = True

    # Capçaleres realistes de navegador per no ser identificat com a bot
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "ca,es;q=0.9,en;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://catens.gencat.cat/catensformacio/"
    }

    while has_more:
        ts = int(time.time() * 1000)
        url_fase1 = f"https://catens.gencat.cat/catensformacio/pantalla/nucleo.catens.ens/datosListaEnsCambio.action?idEntidadPrincipal=71303&_dc={ts}&listaFiltrada=si&prefijoPantalla=pantalla0_&pantalla0_filtro_filtro_codigo_catalogo=&pantalla0_filtro_filtro_ens_cambio_estado=0&pantalla0_filtro_filtro_agrup_datos=19&pantalla0_filtro_filtro_fecha_ultimo_cambio_desde=&pantalla0_filtro_filtro_fecha_modificacion_desde=&pantalla0_filtro_filtro_validador=&pantalla0_filtro_filtro_fecha_ultimo_cambio_hasta=&pantalla0_filtro_filtro_fecha_modificacion_hasta=&pantalla0_filtro_filtro_operacion=&pantalla0_filtro_filtro_id_usuario=3004238&ctrl_fama_id_contexto_pantalla_actual=194&identificadorGridAsociado=pantalla0_identificadorGrid_CAMPO_LISTA_ENS_CAMBIO&ctrl_fama_identificador_campo_arbol_lista=CAMPO_LISTA_ENS_CAMBIO&parametro_TIPOWF=M&page={page}&start={start}&limit={limit}"
        
        print(f"  -> Petició Fase 1 Pàgina {page} (start={start}, limit={limit})...")
        resp = requests.get(url_fase1, headers=headers)
        
        if resp.status_code != 200 or not resp.text.strip().startswith("{"):
            print("❌ ATENCIÓ: El servidor no ha retornat un JSON de dades (possiblement requereix galetes d'autenticació / inici de sessió).")
            print("💡 Solució: Executa el script des de la consola del navegador (F12) a la web de CATENS o afegeix la galeta de sessió 'Cookie' a l'script.")
            return

        data = resp.json()
        
        total_registros = int(data.get("totalRegistros", 0))
        registres = data.get("registros", [])
        
        for item in registres:
            item_id = str(item.get("ID", "")).strip()
            if item_id:
                all_ids.append(item_id)
                
        print(f"     Obtinguts {len(registres)} registres. (Total: {len(all_ids)} de {total_registros})")
        
        start += limit
        page += 1
        if start >= total_registros or not registres:
            has_more = False
        else:
            time.sleep(random.uniform(0.8, 1.5))

    print(f"✅ FASE 1 COMPLETADA: S'han trobat {len(all_ids)} IDs de canvis pendents.\n")

    if not all_ids:
        print("⚠️ No s'han trobat IDs de canvi.")
        return

    # FASE 2: Extreure el detall de cada ID de canvi
    print("🚀 FASE 2: Consultant el detall de representant per a cada ID de canvi (amb pauses humanes)...")
    dades_finals = []

    for idx, id_cambio in enumerate(all_ids, 1):
        ts = int(time.time() * 1000)
        url_fase2 = f"https://catens.gencat.cat/catensformacio/pantalla/nucleo.catens.ens/datosListaEnsRepresentante.action?idEntidadPrincipal={id_cambio}&_dc={ts}&listaFiltrada=si&prefijoPantalla=pantalla0_&pantalla0_filtro_FILTRO_CAMBIO_P_REP={id_cambio}&ordenacion=ID&ctrl_fama_id_contexto_pantalla_actual=255&identificadorGridAsociado=pantalla0_identificadorGrid_LISTA_ENS_R&ctrl_fama_identificador_campo_arbol_lista=LISTA_ENS_R&pantalla_definicion_sistema=nucleo.catens.ens&pantalla_definicion_entidad=EnsCambio&identificador_campo_lista=LISTA_ENS_R&page=1&start=0&limit=50&sort=%5B%7B%22property%22%3A%22ID%22%2C%22direction%22%3A%22ASC%22%7D%5D"
        
        print(f"  -> [{idx}/{len(all_ids)}] Consultant ID {id_cambio}...")
        resp_detall = requests.get(url_fase2, headers=headers)
        data_detall = resp_detall.json()
        registres_detall = data_detall.get("registros", [])
        
        for reg in registres_detall:
            reg["_id_cambio_origen"] = id_cambio
            dades_finals.append(reg)

        # Pausa humana aleatòria entre peticions (600ms - 1400ms) i 2.5s cada 10 peticions
        if idx % 10 == 0 and idx < len(all_ids):
            print("  ☕ Pausa humana breu de seguretat (2.5 segons)...")
            time.sleep(random.uniform(2.2, 2.8))
        else:
            time.sleep(random.uniform(0.6, 1.4))

    # Desaar resultat a JSON
    filename = "canvis_pendents_catens.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(dades_finals, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 PROCÉS COMPLETAT! S'han extret {len(dades_finals)} registres i s'ha desat a '{filename}'.")

if __name__ == "__main__":
    extreure_canvis_pendents()
