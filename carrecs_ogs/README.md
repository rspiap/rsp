
# Sistema de Gestió de Dades SAC (Sector Públic de Catalunya)

Aquest projecte és una aplicació web "Local-First" dissenyada per gestionar, visualitzar i sincronitzar les dades del sector públic de Catalunya amb els codis d'informació del SAC (Algolia). Permet un control total sobre els mapatges entre els òrgans de govern i els seus responsables institucionals.

## 🚀 Característiques Principals

- **Dashboard Avançat**: Visualització jeràrquica de càrrecs, membres i entitats amb filtres intel·ligents.
- **Arquitectura Local-First**: L'aplicació funciona directament des del navegador utilitzant **IndexedDB** per a la persistència de dades, garantint una velocitat instantània.
- **Sincronització al Núvol**: Connexió bidireccional amb **Google Sheets** (via Google Apps Script) per compartir mapatges en temps real entre diversos usuaris.
- **Editor de Mapatges Encastat**: Permet corregir o assignar codis SAC directament des de la taula de dades.
- **Validador Automàtic**: Compara les dades d'Open Data amb l'API d'Algolia per detectar discrepàncies en els noms dels responsables (Estats: Validat 🟢 o Pendent 🟡).

## 📁 Estructura del Projecte

- `index.html`: Dashboard principal de visualització i cerca.
- `editor.html`: Interfície per gestionar el llistat complet de mapatges al núvol.
- `importer.html`: Eina de migració i restauració massiva de dades des de fitxers CSV.
- `sync.js`: Motor de sincronització, normalització de noms i generació de **SmartKeys**.
- `sac_service.js`: Capa de comunicació amb l'API de Google Sheets i gestió de memòria cau.
- `styles.css`: Sistema de disseny modern amb suport per a glassmorphism i micro-animacions.

## 🛠️ Com Funciona el Mapatge (SmartKey)

Per garantir que les dades es creuin correctament, l'aplicació utilitza un sistema de claus intel·ligents basat en tres components:
`Denominació de l'Entitat | Càrrec OGS (Membre) | Càrrec (Lloc de treball)`

Aquesta combinació permet identificar de forma única cada posició, fins i tot si els noms de les persones canvien en les fonts originals.

## 📥 Importació de Dades Inicials

Per posar en marxa el sistema o restaurar la base de dades:
1. Obre `importer.html`.
2. Adjunta el fitxer mestre **`sac.csv`** i, opcionalment, el fitxer de persones jurídiques **`sac_pj.csv`**.
3. Prem **"Iniciar Migració Total"**. L'eina s'encarregarà de processar els caràcters especials (accents) i pujar-ho tot al núvol amb el format UTF-8 correcte.

## ☁️ Configuració del Núvol (Google Sheets)

L'aplicació es connecta a un script de Google Apps Script que actua com a base de dades. La URL de sincronització es configura automàticament a `sac_service.js`:

```javascript
const WEB_APP_URL = "https://script.google.com/macros/s/.../exec";
```

## 📋 Requisits

- Navegador modern (Chrome, Edge, Firefox).
- No requereix servidor web (es pot executar obrint els fitxers localment), tot i que es recomana l'ús de GitHub Pages per a ús compartit.

---
*Creat per a la gestió eficient de les dades de governança del Sector Públic de la Generalitat de Catalunya.*
