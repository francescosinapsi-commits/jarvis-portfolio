# MK12 — REPORT INTERVENTI

Data: 2026-06-13

Tre interventi, tutti rispettando i vincoli del brief:
**il motore dei 192 frame, lo scroll-sync e la progressione del fondale
NON sono stati toccati.**

---

## 1. FILE MODIFICATI

| File | Cosa è cambiato |
|------|-----------------|
| `script.js` | Modulo GFX semplificato a 2 profili; flag effetti LAPTOP; `effDpr` e densità campo neuronale legati a LAPTOP; riflessi non più guidati dal mouse in LAPTOP; fix anti-doppione comandi vocali; guardia legenda deterministica |
| `style.css` | Rimossi i blocchi `data-gfx="standard"` e `data-gfx="performance"`; aggiunto blocco `data-gfx="laptop"` (vetro nero glossy fisso, highlight precalcolati, blur ridotto) |
| `index.html` | Menu JARVIS SETTINGS: rimossi AUTO / STANDARD / PERFORMANCE; restano **ULTRA** e **LAPTOP** |

Nessun altro file toccato. Nessuna modifica a `frames/`, al preload, al loop di
scroll o alla sincronizzazione del fondale.

---

## 2. PROFILI GRAFICI — STATO

### ULTRA — INVARIATO (riferimento visivo approvato)
ULTRA non è stato modificato, ottimizzato né semplificato. Conserva:

- Riflessi vetro dinamici
- Campionamento colore del fondale (background color sampling)
- Bloom pieno
- Glow pieno
- Parallax del mouse
- Comportamento liquid glass completo
- Qualità visiva massima

È il profilo del PC desktop. Resta il default su hardware desktop potente.

### LAPTOP — NUOVO (≈95% di ULTRA, costo GPU molto inferiore)
Target: **Intel i5-9300H · GTX 1050 4GB · 16GB DDR4 · 1920×1080**.
Pensato come modalità presentazione per l'esame.

Mantiene l'identità visiva di ULTRA (riconoscibile a colpo d'occhio):
stile black liquid glass, pannelli neri lucidi, atmosfera cinematica,
sequenza a 192 frame, stesso layout, stessa tipografia, stesse animazioni.

**NON usa** (come da brief):

| Vietato | Come è stato evitato |
|---------|----------------------|
| Campionamento colore in tempo reale | `fx.colorSampling = false` → il motore JS salta `sampleEnvironment()` e `envEdgesFor()` |
| Analisi continua del fondale | stesso flag: nessuna lettura del canvas di sfondo |
| Aggiornamenti riflessi costosi | `fx.glassTickMin = 200` → ~5 update/s invece di ~12; layer `lg-refract` e `lg-chroma` spenti via CSS |
| Riflessi guidati dal mouse | `fx.parallax = false` + `pointermove` ignorato → la luce orbita lentamente da sola |

**USA invece** (come da brief):

- **Black liquid glass statico**: i pannelli restano neri lucidi
- **Highlight precalcolati**: `--lg-env` / `--lg-et/er/eb/el` bloccati su una
  terna neutra-fredda fissa (`150,168,188`) → riflesso argento sobrio
- **Riflessi leggeri**: glint/fresnel/streak restano vivi ma a cadenza ridotta
- **Aspetto glossy fisso**: nessuna variazione cromatica a runtime

**I pannelli restano NERI — non virano sul blu.** Il punto chiave: senza
campionamento, il fallback CSS preesistente era un blu saturo (`130,205,255`).
In LAPTOP quel fallback è stato **sovrascritto con una terna neutra fissa**, così
il vetro non diventa mai blu e l'estrazione colore dinamica è completamente
disattivata.

### Switch profilo
Menu JARVIS SETTINGS (in alto a destra): **ULTRA** / **LAPTOP**.
- Cambio **istantaneo**.
- Scelta salvata in `localStorage` (`hm-gfx-profile`).
- Profilo attivo sempre mostrato in fondo al pannello (`ACTIVE: …`).
- Prima visita senza preferenza salvata: euristica hardware una-tantum sceglie
  il default (GPU debole/integrata/mobile → LAPTOP, desktop discreto → ULTRA).
  **Non è un profilo AUTO selezionabile**: è solo il valore iniziale, poi
  decide l'utente.

---

## 3. FIX COMANDI VOCALI (esecuzione doppia)

**Problema:** comandi come *Jarvis procedi / indietro / mostra progetti* a volte
si eseguivano due volte.

**Cause:** il guard esistente era legato all'indice del risultato
(`executedUtterance`), che si azzera a ogni riavvio di `recognition`
(in `continuous` Chrome riavvia spesso). L'audio residuo veniva quindi
ri-riconosciuto come nuova frase ed eseguito di nuovo. Inoltre interim + final
della stessa frase potevano entrambi scattare.

**Soluzioni applicate (tutti i 7 requisiti del brief):**

1. **Esecuzione unica** — gate per-comando: la stessa azione ripetuta entro
   `ACTION_COOLDOWN` (1500 ms) viene ignorata.
2. **Niente eventi di riconoscimento doppi** — il gate per-azione copre i
   doppioni anche attraverso il riavvio di `recognition`.
3. **Callback ripetuti ignorati** — `lastAction` + `lastActionAt` scartano la
   ripetizione indipendentemente da quante volte arriva il callback.
4. **Cooldown comando** — `GLOBAL_COOLDOWN` (900 ms): un solo comando alla volta.
5. **Una sola istanza SpeechRecognition** — guard singleton `window.__voiceCtrlInit`:
   una seconda chiamata a `initVoiceControl()` esce subito.
6. **Listener duplicati rimossi** — conseguenza del singleton: i listener
   (`onresult`/`onend`/`onerror`) si registrano una volta sola.
7. **Interim ≠ doppio del final** — il guard per-indice (`executedUtterance`)
   più il cooldown per-azione impediscono che interim e final eseguano due volte.

Priorità data alla **affidabilità** sulla velocità, come richiesto.

---

## 4. FIX LEGENDA COMANDI JARVIS (ridimensionamento)

> Il design della legenda **non è stato ridisegnato** — è approvato. È stato
> corretto solo il comportamento di dimensionamento.

**Cosa causava il cambio di dimensione:**
La guardia anti-overlap (`guardVoicePanel`) rimisurava il bounding rect della
legenda **a ogni resize e ogni 2 secondi**, ricalcolando da zero. Con
`width: fit-content` la misura oscillava (caricamento font, comparsa della
scrollbar, transizioni CSS): in certi tick il bordo destro superava la soglia
della colonna centrale e il pannello veniva rimpicciolito (classe `vcp-compact`,
scala 0.78). Da qui il sintomo: appariva alla dimensione giusta e **dopo**
diventava più piccolo, a volte oscillando.

**Strategia finale di dimensionamento:**
Decisione **deterministica e memorizzata per larghezza di viewport**, con isteresi:

- si calcola **una sola volta**, quando la legenda diventa visibile;
- si ricalcola **solo se la larghezza del viewport cambia davvero** (resize
  reale) — mai sul polling a vuoto;
- margine di isteresi (24 px): rimpicciolisce solo in caso di sovrapposizione
  **netta**, mai per pochi pixel di confine → niente oscillazioni;
- a larghezza invariata lo stato già deciso viene **riapplicato senza rimisurare**.

**Risultato:** la legenda appare una volta alla dimensione corretta e resta
identica per tutta la sessione, mantenendo leggibilità e gerarchia visiva, senza
mai sovrapporsi alla colonna centrale dei contenuti.

**Comportamento atteso per risoluzione** (la UI è in rem, scala = `min(vw/1920, vh/1080)`):

| Risoluzione | Esito legenda |
|-------------|---------------|
| 1366×768 | piena, stabile (no overlap con la colonna centrale) |
| 1920×1080 (esame) | piena, stabile — nessun rimpicciolimento |
| 2560×1440 | piena, scalata proporzionalmente |
| TV / proiettore (≥3000px) | piena, scalata proporzionalmente |

---

## 5. MIGLIORAMENTI ATTESI SU GTX 1050 (profilo LAPTOP)

Le stime riguardano il **costo di rendering della UI**; il fondale a 192 frame
è identico nei due profili (non toccato).

| Voce | ULTRA | LAPTOP | Beneficio su GTX 1050 |
|------|-------|--------|-----------------------|
| **backdrop-filter blur** | fino a 30px | 12–18px | È il costo GPU più alto della UI: dimezzare il raggio di blur riduce drasticamente i pixel filtrati per frame |
| **Campionamento colore fondale** | attivo (~6 letture/s del canvas + readback) | **off** | Elimina i `getImageData`/readback GPU→CPU, fonte tipica di stall su GPU mobile |
| **Cadenza riflessi** | ~12 update/s | ~5 update/s (`glassTickMin 200`) | Meno cicli di style/paint e meno scritture di custom property |
| **Layer ottici per pannello** | refract + chroma attivi | **spenti** | Rimuove un backdrop-filter mascherato e un layer di aberrazione cromatica per ogni pannello |
| **Parallax / riflessi da mouse** | attivi | **off** | Niente letture di layout e ricalcoli a ogni `mousemove` |
| **DPR layer effetti** | nativo | cap a 1.5 | Su 1080p (dpr 1) nessun cambiamento visivo; protegge su pannelli hi-DPI |
| **Densità campo neuronale** | 160 / 85 nodi | 120 / 60 nodi | Meno nodi e connessioni da disegnare (stessa fisica e colori) |

**Attesa qualitativa:** frame sequence fluida, scrolling fluido e frame-time UI
nettamente più stabile sulla GTX 1050, conservando ~95% dell'aspetto di ULTRA
(stesso black liquid glass, stessi pannelli neri lucidi, stessa atmosfera).
I numeri esatti di FPS vanno verificati sul portatile target.

---

## NOTE DI VERIFICA CONSIGLIATE
- Aprire il menu GFX e alternare ULTRA ⇄ LAPTOP: il cambio è immediato e
  persiste al reload.
- In LAPTOP controllare che i pannelli restino neri lucidi (nessun alone blu).
- Provare *Jarvis procedi* / *indietro* / *mostra progetti* più volte: ogni
  comando scatta una sola volta.
- Ridimensionare la finestra e attendere: la legenda in basso a sinistra non
  deve rimpicciolirsi da sola.
