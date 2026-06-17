/* ============================================================
   PROJECT HAIL MARY × SICUREZZA ELETTRONICA — PORTFOLIO 2026
   script.js

   ┌─ AGGIUNGERE UN NUOVO PROGETTO ─────────────────────────┐
   │  Aggiungi un oggetto nell'array PROJECTS qui sotto.     │
   │  La card e il modal vengono generati automaticamente.   │
   └────────────────────────────────────────────────────────┘
   ============================================================ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     AUDIO COMPONENTS
  ══════════════════════════════════════════════════════════ */
  const bgMusic   = new Audio('./audio/space-ambient.mp3'); bgMusic.loop = true;  bgMusic.volume   = 0.12;
  const uiClickFx = new Audio('./audio/click.mp3');                               uiClickFx.volume = 0.35;
  const bootFx    = new Audio('./audio/boot.mp3');                                bootFx.volume    = 0.45;
  const glitchFx  = new Audio('./audio/glitch.mp3');                              glitchFx.volume  = 0.50;

  /* ── SFX SINTETICI — beep da computer di bordo, stile NASA.
        WebAudio a basso volume: mai invasivi, mai arcade. ── */
  const Sfx = (() => {
    let ctx = null;
    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      }
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function beep(freq = 880, dur = 0.07, vol = 0.045, type = 'sine', delay = 0) {
      const c = ensure();
      if (!c) return;
      try {
        const t = c.currentTime + delay;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + dur + 0.06);
      } catch (_) {}
    }
    return { beep, ensure };
  })();

  /* ══════════════════════════════════════════════════════════
     MK11 — RESPONSIVE ENGINE (master UI scale)

     Tutta la UI è dimensionata in rem: qui imponiamo
       html.font-size = 16px × min(vw/1920, vh/1080)
     così ogni pannello occupa la STESSA frazione di schermo su
     laptop 1366×768, FHD, QHD e TV 4K — proporzioni identiche.

     Profili (data-ui-profile su <html>): laptop / desktop /
     large-monitor / tv-projector.
     Debug: CTRL+SHIFT+R → viewport, scala, profilo, audit overflow.
     Test harness: responsive-test.html interroga via postMessage.
  ══════════════════════════════════════════════════════════ */
  const UIScale = (() => {
    const REF_W = 1920, REF_H = 1080;        /* design reference */
    const MIN_SCALE = 0.70, MAX_SCALE = 2.40;
    const rootEl = document.documentElement;
    let scale = 1, profile = 'desktop', debugOn = false, debugEl = null;

    function profileFor(w) {
      if (w >= 3000) return 'tv-projector';
      if (w >= 2200) return 'large-monitor';
      if (w >= 1500) return 'desktop';
      return 'laptop';
    }

    function computeScale(w, h) {
      /* sotto i 900px (telefoni/tablet stretti) la scala resta quella
         dei breakpoint mobile: root ≈14.5px come il vecchio clamp */
      if (w < 900) return 0.906;
      const s = Math.min(w / REF_W, h / REF_H);
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    }

    function apply() {
      const w = window.innerWidth, h = window.innerHeight;
      scale   = computeScale(w, h);
      profile = profileFor(w);
      rootEl.style.setProperty('--ui-scale', scale.toFixed(4));
      rootEl.style.fontSize = (16 * scale).toFixed(2) + 'px';
      rootEl.setAttribute('data-ui-profile', profile);
      guardVoicePanel();
      if (debugOn) renderDebug();
    }

    /* ── Guardia anti-overlap del riferimento comandi vocali ─────────
       La legenda (fixed, in basso a sinistra) non deve mai coprire la
       colonna centrale dei contenuti. Ma la dimensione dev'essere
       STABILE per tutta la sessione.

       Prima il guard rimisurava il bounding rect a ogni tick (ogni 2s
       + a ogni resize) e ricalcolava da zero: con width:fit-content la
       misura oscillava (caricamento font, comparsa scrollbar, transizioni)
       e a volte rimpiccioliva la legenda di colpo (scala 0.78) → l'utente
       la vedeva apparire giusta e poi diventare più piccola.

       Ora la decisione è DETERMINISTICA e MEMORIZZATA per larghezza di
       viewport, con isteresi:
         · si calcola UNA volta quando la legenda diventa visibile;
         · si ricalcola SOLO se la larghezza del viewport cambia davvero
           (resize reale), mai sul polling a vuoto;
         · margine di isteresi → si rimpicciolisce solo in caso di
           sovrapposizione netta, mai per pochi pixel di confine.
       Risultato: appare una volta alla dimensione giusta e resta
       coerente. Stadio 1: scala 0.78. Stadio 2: solo intestazione. ── */
    const CENTRAL_MAX_REM = 68.75;  /* projects-wrapper: colonna più larga */
    const VCP_HYST  = 24;           /* px di margine: isteresi anti-flicker */
    let vcpState    = null;         /* null=non deciso | ''| 'compact' | 'collapsed' */
    let vcpDecidedW = -1;           /* larghezza viewport per cui è deciso */

    function applyVcpState(panel) {
      panel.classList.toggle('vcp-compact',   vcpState === 'compact' || vcpState === 'collapsed');
      panel.classList.toggle('vcp-collapsed', vcpState === 'collapsed');
    }

    function guardVoicePanel() {
      const panel = document.getElementById('voice-commands-panel');
      if (!panel) return;
      /* invisibile (boot, modal, exam): nessuna decisione, nessuna misura */
      if (!panel.classList.contains('visible')) return;

      const vw = window.innerWidth;
      /* larghezza invariata e stato già deciso → riapplica e basta:
         nessuna rimisura, quindi nessuna possibilità di oscillazione */
      if (vcpState !== null && Math.abs(vw - vcpDecidedW) < 2) {
        applyVcpState(panel);
        return;
      }

      const rootPx   = parseFloat(getComputedStyle(rootEl).fontSize) || 16;
      const centralW = Math.min(CENTRAL_MAX_REM * rootPx, vw * 0.92);
      const safeLeft = (vw - centralW) / 2 - 8;

      /* misura SEMPRE partendo dalla dimensione piena */
      panel.classList.remove('vcp-compact', 'vcp-collapsed');
      let next = '';
      if (panel.getBoundingClientRect().right > safeLeft + VCP_HYST) {
        panel.classList.add('vcp-compact');
        if (panel.getBoundingClientRect().right > safeLeft + VCP_HYST) {
          panel.classList.add('vcp-collapsed');
          next = 'collapsed';
        } else {
          next = 'compact';
        }
      }
      vcpState    = next;
      vcpDecidedW = vw;
    }

    /* ── Audit overflow / collisioni: usato dal debug HUD e dal
       test harness automatico (responsive-test.html) ── */
    const AUDIT_SEL = '.hud-frame,.projects-wrapper,.blackbox-wrapper,.footer-panel,' +
      '#telemetry-panel,#voice-commands-panel,#earth-cover,#exam-btn,' +
      '.hud-topbar,.hud-bottombar,.tab-content,.rocky-widget';
    function audit() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const issues = [];
      if (rootEl.scrollWidth > vw + 1)
        issues.push('scroll orizzontale: documento ' + rootEl.scrollWidth + 'px > viewport ' + vw + 'px');
      const boxes = [];
      document.querySelectorAll(AUDIT_SEL).forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const name = el.id ? '#' + el.id : '.' + String(el.className).split(' ')[0];
        if (r.left < -1 || r.right > vw + 1)
          issues.push(name + ' esce dal viewport (' + Math.round(r.left) + '…' + Math.round(r.right) + ')');
        if (cs.position === 'fixed' && name !== '.hud-topbar' && name !== '.hud-bottombar')
          boxes.push({ name, r });
      });
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          if (a.left < b.right - 4 && b.left < a.right - 4 &&
              a.top < b.bottom - 4 && b.top < a.bottom - 4)
            issues.push('collisione: ' + boxes[i].name + ' × ' + boxes[j].name);
        }
      return {
        viewport: vw + '×' + vh,
        dpr: (window.devicePixelRatio || 1).toFixed(2),
        scale: scale.toFixed(3),
        rootFont: (16 * scale).toFixed(1) + 'px',
        profile,
        pass: issues.length === 0,
        issues
      };
    }

    /* ── Debug HUD — CTRL+SHIFT+R ── */
    function renderDebug() {
      if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'ui-debug-hud';
        document.body.appendChild(debugEl);
      }
      const a = audit();
      const row = (k, v) => '<div class="udh-row"><span class="udh-key">' + k +
                            '</span><span class="udh-val">' + v + '</span></div>';
      debugEl.innerHTML =
        '<div class="udh-title">◈ RESPONSIVE DEBUG</div>' +
        row('VIEWPORT', a.viewport) +
        row('DPR', a.dpr) +
        row('UI SCALE', a.scale) +
        row('ROOT FONT', a.rootFont) +
        row('PROFILE', a.profile.toUpperCase()) +
        row('AUDIT', a.pass ? '<span class="udh-pass">PASS — NO OVERFLOW</span>'
                            : '<span class="udh-fail">' + a.issues.length + ' ISSUE</span>') +
        (a.pass ? '' : '<div class="udh-issues">' + a.issues.map(i => '▸ ' + i).join('<br>') + '</div>');
      debugEl.style.display = 'block';
    }
    function toggleDebug(force) {
      debugOn = (force !== undefined) ? force : !debugOn;
      try { sessionStorage.setItem('hm-debug', debugOn ? '1' : '0'); } catch (_) {}
      if (debugOn) renderDebug();
      else if (debugEl) debugEl.style.display = 'none';
    }
    window.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        toggleDebug();
      }
    });
    try { if (sessionStorage.getItem('hm-debug') === '1') debugOn = true; } catch (_) {}

    /* ── Test harness (responsive-test.html) — risponde via postMessage ── */
    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'hm-audit-request') {
        const src = e.source || window.parent;
        try { src.postMessage({ type: 'hm-audit-result', payload: audit() }, '*'); } catch (_) {}
      }
    });

    /* resize coalescente su rAF; la guardia del pannello vocale gira
       anche su intervallo lento (il pannello appare dopo il boot) */
    let pending = false;
    window.addEventListener('resize', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; apply(); });
    }, { passive: true });
    window.addEventListener('load', apply);
    setInterval(guardVoicePanel, 2000);

    apply();
    return { apply, audit, toggleDebug, guardVoicePanel,
             get factor() { return scale; },
             get profile() { return profile; } };
  })();
  window.HM_RESPONSIVE = UIScale;

  /* ══════════════════════════════════════════════════════════
     PERFORMANCE CORE
     1) Metriche documento condivise: scrollHeight è una lettura
        di layout costosa — la calcoliamo una volta e la riusiamo
        in tutti i loop invece di forzare un reflow per frame.
     2) Governor adattivo: misura gli FPS reali e, se la macchina
        non regge, riduce SOLO il carico interno (frequenza di
        campionamento, numero particelle) senza toccare la UI.
  ══════════════════════════════════════════════════════════ */
  let docMaxScroll = 1;
  function refreshDocMetrics() {
    docMaxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
  }
  refreshDocMetrics();
  window.addEventListener('resize', refreshDocMetrics, { passive: true });
  window.addEventListener('load', refreshDocMetrics);
  setInterval(refreshDocMetrics, 2000); /* il layout può cambiare (font, immagini) */

  const PERF = (() => {
    let tier = 0;                 /* 0 = pieno, 1 = ridotto, 2 = minimo */
    const listeners = [];
    let ema = 60, last = performance.now(), lastEval = last;
    function notify() { listeners.forEach(fn => { try { fn(tier); } catch (_) {} }); }
    (function meter(now) {
      const dt = now - last; last = now;
      /* ignora pause lunghe (tab nascosta, breakpoint) */
      if (dt > 0 && dt < 500) ema += (1000 / dt - ema) * 0.05;
      if (now - lastEval > 1800 && !document.hidden) {
        lastEval = now;
        const prev = tier;
        if      (ema < 30 && tier < 2) tier++;
        else if (ema < 47 && tier < 1) tier = 1;
        else if (ema > 56 && tier > 0) tier--;
        if (tier !== prev) notify();
      }
      requestAnimationFrame(meter);
    })(performance.now());
    return { get tier() { return tier; }, onTier(fn) { listeners.push(fn); } };
  })();

  /* ══════════════════════════════════════════════════════════
     GFX — GRAPHICS PROFILE SYSTEM (MK12 — SEMPLIFICATO)
     Due soli profili: ULTRA / LAPTOP.

       · ULTRA  — profilo di riferimento approvato (desktop PC).
                  Tutti gli effetti al massimo. NON va modificato.
       · LAPTOP — stessa identità visiva (~95% di ULTRA) a costo
                  GPU molto inferiore: niente campionamento colore
                  in tempo reale, niente analisi continua del fondale,
                  niente riflessi guidati dal mouse. Riflessi leggeri,
                  highlight precalcolati, vetro nero glossy FISSO.

     Agisce SOLO sugli effetti secondari (riflessi, campionamento
     colore, bloom, blur, parallax, effetti mouse): il motore dei
     192 frame, la sincronizzazione con lo scroll e la progressione
     del fondale restano IDENTICI in entrambi i profili.
     Il profilo effettivo è esposto come data-gfx su <html> per
     gli override CSS; la scelta utente persiste in localStorage e
     si può cambiare all'istante dal menu JARVIS SETTINGS.
  ══════════════════════════════════════════════════════════ */
  const GFX = (() => {
    const KEY   = 'hm-gfx-profile';
    const VALID = ['ultra', 'laptop'];
    let selected = 'ultra';                /* scelta utente persistente */
    try {
      const s = localStorage.getItem(KEY);
      if (VALID.indexOf(s) !== -1) selected = s;
      else if (s === null) selected = weakHardware() ? 'laptop' : 'ultra';
    } catch (_) {}
    let active = selected;                 /* profilo effettivo applicato */
    const listeners = [];

    /* flag effetti — letti dai motori secondari, MAI dal frame engine */
    const fx = {
      bloom: true,         /* pass bloom additivo sopra il fondale */
      bloomAlpha: 0.12,    /* intensità del bloom */
      colorSampling: true, /* campionamento ambiente del liquid glass */
      parallax: true,      /* parallax dal puntatore (pannelli + stelle) */
      mouseFx: true,       /* particelle reattive a mouse e click */
      reflections: true,   /* motore riflessi liquid glass */
      glassTickMin: 0,     /* cadenza minima (ms) dei tick riflessi */
    };

    /* ── DEFAULT DI PRIMA VISITA ──────────────────────────────────
       NON è un profilo AUTO selezionabile: è solo l'euristica che
       sceglie il valore iniziale quando localStorage è vuoto. Dopo
       la prima scelta dell'utente questo non viene più consultato. */
    function weakHardware() {
      try {
        const cores = navigator.hardwareConcurrency || 4;
        const mem   = navigator.deviceMemory || 4;
        let gpu = '';
        const cv = document.createElement('canvas');
        const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
        const g = gpu.toLowerCase();
        if (/swiftshader|llvmpipe|software|basic render/.test(g)) return true;
        if (/android|iphone|ipad|mobile/i.test(navigator.userAgent)) return true;
        /* desktop discreto/potente → ULTRA di default; il resto
           (incluso laptop GTX 1050 + i5 mobile) → LAPTOP di default */
        if (/rtx|radeon rx|apple m\d|gtx 1[06-9]\d0|arc a/.test(g)) return false;
        return (cores < 8 || mem < 8);
      } catch (_) { return false; }
    }

    function applyFlags() {
      const ultra = active === 'ultra';
      fx.bloom         = true;                /* glow/bloom attivo in entrambi */
      fx.bloomAlpha    = ultra ? 0.12 : 0.09; /* LAPTOP: bagliore appena più morbido */
      fx.colorSampling = ultra;               /* LAPTOP: nessuna estrazione colore dinamica */
      fx.parallax      = ultra;               /* LAPTOP: niente parallax/riflessi dal mouse */
      fx.mouseFx       = ultra;               /* LAPTOP: particelle non reattive al mouse */
      fx.reflections   = true;                /* LAPTOP: riflessi leggeri (cadenza rallentata) */
      fx.glassTickMin  = ultra ? 0 : 200;     /* LAPTOP: ~5 update/s invece di ~12 */
    }

    function update() {
      applyFlags();
      document.documentElement.setAttribute('data-gfx', active);
      console.log('GFX PROFILE: ' + active.toUpperCase());
      listeners.forEach(fn => { try { fn(active); } catch (_) {} });
    }

    function select(p) {
      if (VALID.indexOf(p) === -1) return;
      selected = p; active = p;
      try { localStorage.setItem(KEY, p); } catch (_) {}
      update();
    }

    update();

    return {
      fx, select,
      get selected() { return selected; },
      get active()   { return active; },
      on(fn) { listeners.push(fn); },
    };
  })();
  window.HM_GFX = GFX;

  /* DPR effettivo per i layer di effetti: al tier minimo (o nel
     profilo LAPTOP) il backing store viene limitato a 1.5 — su
     schermi standard (laptop 1080p, dpr 1) non cambia nulla, su
     hi-DPI in sofferenza dimezza i pixel da riempire */
  function effDpr() {
    const d = window.devicePixelRatio || 1;
    return (PERF.tier === 2 || GFX.active === 'laptop') ? Math.min(d, 1.5) : d;
  }

  /* ══════════════════════════════════════════════════════════
     JARVIS VOICE ENGINE — clip ElevenLabs pre-registrate
     Unica sorgente vocale del sistema: ogni categoria
     di comando ha una cartella di varianti in real_jarvis_voice/;
     alla chiamata viene scelta una clip casuale (mai la stessa
     due volte di fila) e il parlato precedente viene interrotto.
  ══════════════════════════════════════════════════════════ */
  const JarvisVoice = (() => {
    const BASE = './real_jarvis_voice/';
    /* due soli pattern di nome file generati da ElevenLabs:
       cambia solo il timestamp */
    const rm  = ts => `ElevenLabs_2026-06-11T${ts}_Raffaele Montini - Refined and Secure_pvc_sp92_s33_sb82_v3.mp3`;
    const s50 = ts => `ElevenLabs_2026-06-11T${ts}__s50_v3.mp3`;

    const LIBRARY = {
      accensione:       ['ACCENSIONE',           [s50('19_44_30'), rm('19_46_23'), rm('19_46_56')]],
      procedi:          ['PROCEDI',              [rm('19_47_24'), rm('19_48_24'), rm('19_48_44')]],
      indietro:         ['INDIETRO',             [rm('19_49_06'), rm('19_49_38'), rm('19_50_02')]],
      progetto:         ['APERTURA PROGETTO',    [rm('19_50_30'), rm('19_50_58'), rm('19_51_18'), rm('19_51_36')]],
      chiudi:           ['CHIUSURA PROGETTO',    [rm('19_51_56'), rm('19_52_20'), rm('19_52_45')]],
      foto:             ['CAMBIO FOTO',          [rm('19_53_14'), rm('19_53_44'), rm('19_54_02')]],
      sezione:          ['CAMBIO SEZIONE',       [rm('19_54_25'), rm('19_54_56'), rm('19_55_13')]],
      autodistruzione:  ['AUTODISTRUZIONE',      [rm('19_55_36'), rm('19_56_08')]],
      presentati:       ['PRESENTAZIONE JARVIS', [rm('19_56_30'), rm('19_57_28')]],
      rocky:            ['ROCKY',                [s50('19_58_07'), rm('19_59_21')]],
      mostra_progetti:  ['MOSTRA PROGETTI',      [rm('20_00_13'), rm('20_01_08'), s50('20_01_28')]],
      mostra_visione:   ['MOSTRA VISIONE',       [rm('20_01_52'), rm('20_02_21'), rm('20_02_40')]],
      mostra_struttura: ['MOSTRA STRUTTURA',     [rm('20_03_00'), rm('20_03_47'), rm('20_04_03')]],
    };

    /* pool fisso di HTMLAudioElement creati una volta sola e
       riusati ad ogni play: preload completo all'avvio, zero
       allocazioni a runtime, latenza di risposta immediata */
    const pool = {};
    for (const key in LIBRARY) {
      const [dir, files] = LIBRARY[key];
      pool[key] = files.map(name => {
        const a = new Audio(encodeURI(BASE + dir + '/' + name));
        a.preload = 'auto';
        a.volume  = 0.9;
        return a;
      });
    }

    let current   = null;
    const lastIdx = {};

    function fireEnd(a) {
      const fn = a.onended;
      a.onended = null;
      if (fn) fn();
    }

    /* interrompe la clip corrente facendo comunque scattare
       l'onended del chiamante (gli overlay sincronizzati alla
       voce devono potersi chiudere) */
    function stop() {
      const a = current;
      if (!a) return;
      current = null;
      a.pause();
      try { a.currentTime = 0; } catch (_) {}
      fireEnd(a);
    }

    function play(category) {
      const clips = pool[category];
      if (!clips || !clips.length) return null;
      stop();
      let i = Math.floor(Math.random() * clips.length);
      if (clips.length > 1 && i === lastIdx[category]) i = (i + 1) % clips.length;
      lastIdx[category] = i;
      const a = clips[i];
      a.onended = null;
      try { a.currentTime = 0; } catch (_) {}
      a.addEventListener('ended', () => { if (current === a) current = null; }, { once: true });
      a.play().catch(() => {
        /* autoplay bloccato o file mancante: libera lo stato e
           sblocca comunque l'eventuale callback del chiamante */
        if (current === a) { current = null; fireEnd(a); }
      });
      current = a;
      return a;
    }

    return { play, stop };
  })();

  /* ══════════════════════════════════════════════════════════
     ★  PROJECTS  — aggiungi qui i tuoi lavori
     ══════════════════════════════════════════════════════════
     image: './img/nome.jpg'               (singola immagine)
     images: ['./img/1.jpg','./img/2.jpg'] (galleria — mostra carousel nel modal)
  ══════════════════════════════════════════════════════════ */
  const PROJECTS = [
    {
      id: 'progetto-uno',
      title: 'LOTUS — BEAUTY ESSENCE',
      subtitle: 'Packaging Design & Pre-stampa',
      brief: 'Studio strutturale e grafico di un packaging secondario fustellato per il settore cosmetico di lusso "Lotus - Luxury Beauty Spa". Il progetto si concentra sull\'industrializzazione del layout, definendo linee di taglio, cordonatura e margini di abbondanza, integrando elementi normativi reali come l\'INCI degli ingredienti e i codici a barre.',
      objectives: [
        'Sviluppo del tracciato fustellato millimetrico',
        'Studio del layout coordinato e bilanciamento dei bianchi',
        'Integrazione degli elementi tecnici per la pre-stampa tipografica',
      ],
      tools: ['Adobe Illustrator', 'InDesign'],
      images: ['./PROGETTO 1/photo 1.jpeg', './PROGETTO 1/photo 2.jpeg', './PROGETTO 1/photo 3.jpeg'],
    },
    {
      id: 'progetto-due',
      title: 'SINAPSI SECURITY',
      subtitle: 'Advertising Design & Visual Communication',
      brief: 'Manifesto pubblicitario sviluppato per Sinapsi Security, azienda specializzata in sicurezza elettronica, videosorveglianza e protezione degli ambienti. L\'intera comunicazione ruota attorno all\'occhio umano, trasformato in metafora visiva del sistema di sorveglianza: l\'elemento circolare richiama insieme l\'obiettivo di una telecamera, una lente ottica e un sistema di monitoraggio, comunicando la presenza costante della tecnologia che controlla e protegge prima ancora della lettura del messaggio. La palette blu veicola affidabilità, protezione e professionalità, mentre la tipografia bold garantisce una lettura immediata dello slogan "Guarda. Proteggi. Monitora.", sintesi del principio operativo dei moderni sistemi di sicurezza.',
      objectives: [
        'Sintesi visiva dei tre principi del settore: Guarda, Proteggi, Monitora',
        'Costruzione del simbolo occhio-telecamera come fulcro della gerarchia visiva',
        'Studio della palette blu e della tipografia bold per affidabilità e leggibilità immediata',
      ],
      tools: ['Adobe Illustrator', 'Adobe Photoshop'],
      images: ['./PROGETTO 2/photo 1.jpeg', './PROGETTO 2/photo 2.jpeg', './PROGETTO 2/photo 3.jpeg'],
    },
    {
      id: 'progetto-tre',
      title: 'WILD — STREETWEAR POSTER',
      subtitle: 'Visual Communication & Brand Identity',
      brief: 'Manifesto pubblicitario d\'avanguardia per il brand indipendente di abbigliamento urban "Wild Streetwear". L\'opera esplora l\'uso espressivo e cinetico della tipografia unito alla scomposizione geometrica multi-livello dei canali visivi (con l\'uso di maschere ad arco) per massimizzare l\'impatto visivo in contesti urbani complessi.',
      objectives: [
        'Frammentazione e scomposizione geometrica dei livelli d\'immagine',
        'Gestione e bilanciamento asimmetrico dei pesi visivi',
        'Studio dell\'impatto espressivo dei caratteri tipografici "Wild" e "Streetwear"',
      ],
      tools: ['Adobe Illustrator', 'Adobe Photoshop'],
      images: ['./PROGETTO 3/photo 1.jpg', './PROGETTO 3/photo 2.jpeg', './PROGETTO 3/photo 3.jpeg'],
    },
    {
      id: 'progetto-quattro',
      title: 'NEW BALANCE — THE ICONIC STEP',
      subtitle: 'Advertising & Deep Space Composition',
      brief: 'Poster pubblicitario per il product placement di calzature New Balance. La composizione sperimenta l\'intersezione tridimensionale tra la tipografia monumentale "SHOES" e il prodotto, inserito su uno sfondo spaziale stellato ad alta profondità che si collega perfettamente alla narrazione e all\'identità visiva del portfolio.',
      objectives: [
        'Mascheratura complessa per intersecare testo e prodotto in 3D',
        'Uso delle linee di forza prospettiche della calzatura nel layout',
        'Studio del contrasto tra lo sfondo cosmico e la silhouette della scarpa',
      ],
      tools: ['Adobe Illustrator', 'Adobe Photoshop'],
      images: ['./PROGETTO 4/photo 1.jpeg', './PROGETTO 4/photo 2.jpeg', './PROGETTO 4/photo 3.jpeg'],
    },
    // ── AGGIUNGI NUOVI PROGETTI QUI SOTTO ──────────────────
    // {
    //   id: 'nuovo-progetto',
    //   title: 'NOME PROGETTO',
    //   subtitle: 'Tipo di Progetto',
    //   brief: 'Brief scolastico IIS Carlo Urbani...',
    //   objectives: ['Obiettivo 1', 'Obiettivo 2', 'Obiettivo 3'],
    //   tools: ['Adobe Photoshop'],
    //   images: ['./img/1.jpg', './img/2.jpg'],
    // },
  ];

  /* ══════════════════════════════════════════════════════════
     CURSORE ASTRONAVE — lag fluido + rotazione direzionale
  ══════════════════════════════════════════════════════════ */
  const cursorEl = document.getElementById('cursor');
  let cX = window.innerWidth/2, cY = window.innerHeight/2;
  /* vCursorX/vCursorY — coordinate unificate navicella (mouse o gamepad) */
  let vCursorX = cX, vCursorY = cY;
  let examActive = false;
  let shipAngle = 0, targetAngle = 0, moveSpeed = 0;
  let gpVelX = 0, gpVelY = 0;
  const gpBtnPrev = {};

  window.addEventListener('mousemove', e => {
    const dx = e.clientX - vCursorX, dy = e.clientY - vCursorY;
    const spd = Math.sqrt(dx*dx + dy*dy);
    if (spd > 1.5) {
      targetAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      moveSpeed = spd;
    }
    vCursorX = e.clientX; vCursorY = e.clientY;
  }, { passive:true });

  let curLastX = -1, curLastY = -1, curLastA = 0, curThrust = false;
  (function animCursor() {
    pollGamepad();
    cX += (vCursorX - cX) * 0.13;
    cY += (vCursorY - cY) * 0.13;
    let da = targetAngle - shipAngle;
    while (da >  180) da -= 360;
    while (da < -180) da += 360;
    shipAngle += da * 0.10;
    moveSpeed *= 0.88;
    if (cursorEl && !examActive) {
      /* scrivi lo stile solo se la navicella si è davvero mossa:
         a riposo il compositor non viene mai invalidato */
      if (Math.abs(cX - curLastX) > 0.02 || Math.abs(cY - curLastY) > 0.02 || Math.abs(shipAngle - curLastA) > 0.05) {
        curLastX = cX; curLastY = cY; curLastA = shipAngle;
        cursorEl.style.transform = `translate(${cX - 14}px,${cY - 17}px) rotate(${shipAngle}deg) scale(${UIScale.factor.toFixed(3)})`;
      }
      const thrusting = moveSpeed > 4;
      if (thrusting !== curThrust) {
        curThrust = thrusting;
        cursorEl.classList.toggle('thrusting', thrusting);
      }
    }
    requestAnimationFrame(animCursor);
  })();

  /* ══════════════════════════════════════════════════════════
     GAMEPAD — DualSense PS5 / Gamepad API
     Polling continuo a 60fps dentro animCursor.
  ══════════════════════════════════════════════════════════ */
  function gpBtnDown(gp, idx) {
    const pressed = !!(gp.buttons[idx] && gp.buttons[idx].pressed);
    const was     = !!gpBtnPrev[idx];
    gpBtnPrev[idx] = pressed;
    return pressed && !was;
  }
  /* pool fisso di 4 player riusati a rotazione: niente nuovi elementi
     Audio allocati ad ogni click (meno GC, latenza più costante) */
  const clickPool = [];
  let clickPoolIdx = 0;
  function playClickSfx() {
    if (!clickPool.length) {
      for (let i = 0; i < 4; i++) { const a = uiClickFx.cloneNode(true); a.volume = 0.35; clickPool.push(a); }
    }
    const a = clickPool[clickPoolIdx++ % clickPool.length];
    try { a.currentTime = 0; } catch (_) {}
    a.play().catch(() => {});
  }
  function gpPlayClick() { playClickSfx(); }
  function gpPlayBoot() {
    const sfx = bootFx.cloneNode(true); sfx.volume = 0.45; sfx.play().catch(() => {});
  }
  function gpScrollSection(dir) {
    const SECTS = ['#intro','#chi-sono','#progetti','#sinergia','#black-box','#fine'];
    const pivot = window.scrollY + window.innerHeight * 0.35;
    const els   = SECTS.map(s => document.querySelector(s)).filter(Boolean);
    let idx = 0;
    for (let i = 0; i < els.length; i++) { if (els[i].offsetTop <= pivot) idx = i; }
    const target = els[Math.max(0, Math.min(els.length - 1, idx + dir))];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) { if (gamepads[i]) { gp = gamepads[i]; break; } }
    if (!gp) return;

    const DZ   = 0.15;
    const SENS = 6;

    // ── Analogico sinistro (assi 0/1) → cursore-navicella ──
    const axX   = gp.axes[0] || 0;
    const axY   = gp.axes[1] || 0;
    const rawVX = Math.abs(axX) > DZ ? axX * SENS : 0;
    const rawVY = Math.abs(axY) > DZ ? axY * SENS : 0;
    if (rawVX !== 0 || rawVY !== 0) {
      // Lerp della velocità per scivolamento cinematico
      gpVelX += (rawVX - gpVelX) * 0.22;
      gpVelY += (rawVY - gpVelY) * 0.22;
      const prevX = vCursorX, prevY = vCursorY;
      vCursorX = Math.max(0, Math.min(window.innerWidth,  vCursorX + gpVelX));
      vCursorY = Math.max(0, Math.min(window.innerHeight, vCursorY + gpVelY));
      const spd = Math.sqrt((vCursorX - prevX) ** 2 + (vCursorY - prevY) ** 2);
      if (spd > 0.4) {
        targetAngle = Math.atan2(vCursorY - prevY, vCursorX - prevX) * (180 / Math.PI) + 90;
        moveSpeed = spd * 4;
      }
    } else {
      // Decelerazione smooth al rilascio
      gpVelX *= 0.78; gpVelY *= 0.78;
      if (Math.abs(gpVelX) > 0.05 || Math.abs(gpVelY) > 0.05) {
        vCursorX = Math.max(0, Math.min(window.innerWidth,  vCursorX + gpVelX));
        vCursorY = Math.max(0, Math.min(window.innerHeight, vCursorY + gpVelY));
      } else { gpVelX = 0; gpVelY = 0; }
    }

    // ── Analogico destro (asse 3) → scroll verticale fluido ──
    const axR = gp.axes[3] || 0;
    if (Math.abs(axR) > DZ) {
      const curved = Math.pow(Math.abs(axR), 2) * Math.sign(axR);
      window.scrollBy({ top: curved * 75, behavior: 'instant' });
    }

    // ── Tasto X (0): click reale al cursore ──────────────────
    if (gpBtnDown(gp, 0)) {
      const el = document.elementFromPoint(vCursorX, vCursorY);
      if (el) el.click();
      gpPlayClick();
    }
    // ── Tasto Cerchio (1): chiudi modal o torna all'intro ────
    if (gpBtnDown(gp, 1)) {
      if (modalEl && modalEl.classList.contains('open')) closeModal();
      else { const intro = document.getElementById('intro'); if (intro) intro.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      gpPlayClick();
    }
    // ── Tasto Triangolo (3): fullscreen immagine modal ───────
    if (gpBtnDown(gp, 3)) {
      const img = document.getElementById('modal-img-el');
      if (img) {
        const req = img.requestFullscreen || img.webkitRequestFullscreen || img.mozRequestFullScreen;
        if (req) req.call(img).catch(() => {});
      }
      gpPlayBoot();
    }
    // ── L1 (4): immagine precedente nel carousel ─────────────
    if (gpBtnDown(gp, 4) && modalCarousel) { modalCarousel.prev(); gpPlayClick(); }
    // ── R1 (5): immagine successiva nel carousel ─────────────
    if (gpBtnDown(gp, 5) && modalCarousel) { modalCarousel.next(); gpPlayClick(); }
    // ── D-Pad Su (12): sezione precedente ────────────────────
    if (gpBtnDown(gp, 12)) { gpScrollSection(-1); gpPlayClick(); }
    // ── D-Pad Giù (13): sezione successiva ───────────────────
    if (gpBtnDown(gp, 13)) { gpScrollSection(1);  gpPlayClick(); }
  }

  /* ══════════════════════════════════════════════════════════
     MISSION STATUS — etichetta di telemetria pura.
     Nessun click, nessuna navigazione nascosta: il testo viene
     aggiornato dal modulo telemetria (fase corrente della missione).
  ══════════════════════════════════════════════════════════ */
  const examLabel = document.getElementById('exam-label');

  /* ══════════════════════════════════════════════════════════
     CANVAS SFONDO — sequenza frame_000 → frame_191 (192 JPG) + DPR HD
     Playback DIRETTO — la sequenza è già nell'ordine cinematico
     giusto (rosso → esplosione → transizione → nebulosa verde):
     top della pagina  = frame_000 (scena rossa PORTFOLIO)
     fondo della pagina = frame_191 (nebulosa verde)
  ══════════════════════════════════════════════════════════ */
  const FRAME_DIR   = './frames/';
  const FRAME_PAD   = 3;
  const FRAME_COUNT = 192;
  const LOAD_BATCH  = 8;   /* immagini per ondata di preload progressivo */

  const bgCanvas  = document.getElementById('bg-canvas');
  const bgCtx     = bgCanvas.getContext('2d');
  const frames    = new Array(FRAME_COUNT).fill(null);  /* indice = numero frame */
  let frameCount = 0, currentFrame = 0, animReady = false, bgDpr = 1;

  function frameName(n) {
    return 'frame_' + String(n).padStart(FRAME_PAD, '0') + '.jpg';
  }

  /* risoluzione nativa dei frame sorgente (impostata al primo load):
     un backing store più grande del sorgente non aggiunge alcun
     dettaglio — rasterizzarlo a DPR pieno su schermi hi-DPI/4K è
     solo costo GPU sprecato. Stessa identica resa a schermo. */
  let frameNativeW = 0, frameNativeH = 0;

  function resizeBg() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    bgDpr = dpr;
    if (frameNativeW) {
      bgDpr = Math.min(dpr, Math.max(1, frameNativeW / w, frameNativeH / h));
    }
    bgCanvas.width  = Math.round(w * bgDpr);
    bgCanvas.height = Math.round(h * bgDpr);
    bgCanvas.style.width  = w + 'px';
    bgCanvas.style.height = h + 'px';
    /* canonical DPR transform: draw in CSS-pixel space, canvas stores at native res */
    bgCtx.setTransform(bgDpr, 0, 0, bgDpr, 0, 0);
    renderFrame(currentFrame);
  }
  window.addEventListener('resize', resizeBg, { passive:true });

  /* offscreen 1/8 per il bloom: downscale+upscale = blur naturale, costo minimo */
  let bloomCvs = null, bloomCtx = null;

  function renderFrame(idx) {
    if (examActive) return;
    const img = frames[idx];
    /* frame non ancora caricato: mantieni l'ultimo disegnato, mai schermo nero */
    if (!img || !img.complete || !img.naturalWidth) return;
    /* draw in CSS-pixel space (setTransform handles DPR upscaling) */
    const cw = window.innerWidth, ch = window.innerHeight;
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = 'high';
    /* object-fit: cover — scale to fill, centre-crop */
    const sc = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    bgCtx.clearRect(0, 0, cw, ch);
    /* resa cromatica cinematografica: contrasto e saturazione appena superiori */
    try { bgCtx.filter = 'saturate(1.12) contrast(1.06)'; } catch (_) {}
    bgCtx.drawImage(img, (cw - dw) * 0.5, (ch - dh) * 0.5, dw, dh);
    try { bgCtx.filter = 'none'; } catch (_) {}
    /* bloom leggerissimo — mai aggressivo. Effetto SECONDARIO gestito
       dal profilo grafico: pieno in ULTRA, appena più morbido in
       LAPTOP. Il disegno del frame sopra resta identico. */
    if (GFX.fx.bloom) try {
      if (!bloomCvs) { bloomCvs = document.createElement('canvas'); bloomCtx = bloomCvs.getContext('2d'); }
      const bw = Math.max(8, cw >> 3), bh = Math.max(8, ch >> 3);
      if (bloomCvs.width !== bw || bloomCvs.height !== bh) { bloomCvs.width = bw; bloomCvs.height = bh; }
      bloomCtx.clearRect(0, 0, bw, bh);
      bloomCtx.drawImage(img, (cw - dw) * 0.5 / 8, (ch - dh) * 0.5 / 8, dw / 8, dh / 8);
      bgCtx.save();
      bgCtx.globalCompositeOperation = 'screen';
      bgCtx.globalAlpha = GFX.fx.bloomAlpha;
      bgCtx.drawImage(bloomCvs, 0, 0, bw, bh, 0, 0, cw, ch);
      bgCtx.restore();
    } catch (_) {}
    /* grading cinematografico: la sequenza apre sul rosso (PORTFOLIO)
       e chiude sul verde della nebulosa; p = 1 in cima alla pagina
       (idx 0), p = 0 in fondo — stessa resa per posizione di scroll */
    const p = FRAME_COUNT > 1 ? 1 - idx / (FRAME_COUNT - 1) : 1;
    if (p < 0.38) {
      bgCtx.fillStyle = `rgba(0,185,215,${0.10 * (1 - p / 0.38)})`;
      bgCtx.fillRect(0, 0, cw, ch);
    }
    if (p >= 0.42 && p <= 0.88) {
      const t = p < 0.72 ? (p - 0.42) / 0.30 : 1 - (p - 0.72) / 0.16;
      bgCtx.fillStyle = `rgba(155,0,18,${0.20 * t})`;
      bgCtx.fillRect(0, 0, cw, ch);
    }
  }

  /* cambio profilo grafico: ridisegna lo STESSO frame corrente con il
     nuovo set di effetti (bloom on/off) — mai salti, mai frame diversi */
  GFX.on(() => { if (animReady) renderFrame(currentFrame); });

  /* Preload progressivo: parte da frame_000 (il primo visibile in
     cima alla pagina), poi continua in background a piccole ondate
     sequenziali — niente picchi di memoria, niente freeze.
     Un frame mancante viene segnalato e saltato: il caricamento
     e il rendering non si fermano mai. */
  function preloadFrames() {
    frameCount = FRAME_COUNT;
    let nextNum = 0;

    function loadWave() {
      const start = nextNum;
      const end   = Math.min(FRAME_COUNT, start + LOAD_BATCH);
      let pending = end - start;
      nextNum = end;
      for (let i = start; i < end; i++) {
        const num = i;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          frames[num] = img;
          /* primo frame visibile subito, senza aspettare il resto;
             nota la risoluzione sorgente e ricalibra il canvas */
          if (!animReady) {
            animReady = true;
            frameNativeW = img.naturalWidth;
            frameNativeH = img.naturalHeight;
            resizeBg();
          }
          else if (num === currentFrame) renderFrame(currentFrame);
          if (--pending === 0) waveDone();
        };
        img.onerror = () => {
          console.warn(`Missing frame ${num}`);
          if (--pending === 0) waveDone();
        };
        img.src = FRAME_DIR + frameName(num);
      }
    }

    function waveDone() {
      if (nextNum < FRAME_COUNT) { loadWave(); return; }
      const loaded = frames.reduce((a, f) => a + (f ? 1 : 0), 0);
      if (!loaded) {
        console.error('BACKGROUND: nessun frame trovato in ' + FRAME_DIR);
        return;
      }
      console.log('FRAMES FOUND: ' + loaded + ' / ' + FRAME_COUNT);
      console.log('FIRST FRAME: ' + frameName(0));
      console.log('LAST FRAME: ' + frameName(FRAME_COUNT - 1));
      console.log('SCROLL MAPPING: top = frame_000, bottom = frame_191 (direct)');
      console.log('BACKGROUND READY');
      renderFrame(currentFrame);
    }

    loadWave();
  }

  /* Persistent RAF loop — reads scroll position every display frame.
     Decouples canvas updates from scroll-event timing, runs at native
     monitor refresh rate (60 / 120 / 240 Hz) with zero extra latency.
     Mappatura DIRETTA — timeline scrubbed dallo scroll:
     scroll 0%  → frame_000, scroll 100% → frame_191. */
  (function bgRafLoop() {
    if (animReady && !examActive && frameCount > 1) {
      /* docMaxScroll è in cache: nessuna lettura di layout per frame */
      const progress = Math.min(1, Math.max(0, (window.scrollY || 0) / docMaxScroll));
      const tgt      = Math.floor(progress * (FRAME_COUNT - 1));
      if (tgt !== currentFrame) { currentFrame = tgt; renderFrame(currentFrame); }
    }
    requestAnimationFrame(bgRafLoop);
  })();

  /* ── HUD COLOR PHASE (scroll-reactive cyan/red) ── */
  let hudPhase = 'cyan';
  function updateHudPhase() {
    if (examActive) return;
    const p = Math.min(1, (window.scrollY||0) / docMaxScroll);
    // Astrofagi zone: scroll 28%–80% = mid-film red invasion
    const newPhase = (p > 0.28 && p < 0.80) ? 'red' : 'cyan';
    if (newPhase !== hudPhase) {
      hudPhase = newPhase;
      document.body.classList.toggle('hud-alert', hudPhase === 'red');
    }
  }
  window.addEventListener('scroll', updateHudPhase, { passive:true });

  /* ══════════════════════════════════════════════════════════
     LOADER — implosione dal centro
  ══════════════════════════════════════════════════════════ */
  const LOADER_MSGS = [
    'CONNECTING TO HAIL MARY SERVER...',
    'ESTABLISHING QUANTUM LINK...',
    'LOADING MISSION PORTFOLIO DATA...',
    'INITIALIZING NEURAL INTERFACE...',
    'DECODING QUANTUM DATA...',
    'DECRYPTING GRAFICA ARCHIVES...',
    'CALIBRATING VISUAL SENSORS...',
    'AUTHENTICATING CREW MEMBER...',
    'VALIDATING CLEARANCE LEVEL ALPHA...',
    'PELLEGRINO FRANCESCO — IDENTITY VERIFIED',
    'IIS CARLO URBANI DATALINK ACTIVE',
    'ASTROFAGE CONTAINMENT: NOMINAL',
    'SECURITY SYSTEMS LAYER: ACTIVE',
    'COMPILING PORTFOLIO ASSETS...',
    'MISSION DATA TRANSFER COMPLETE.',
    'LAUNCH SEQUENCE READY.',
  ];

  const loaderEl = document.getElementById('loader');
  const ldMsgEl  = document.getElementById('ld-message');
  const ldBarEl  = document.getElementById('ld-bar');
  const ldPctEl  = document.getElementById('ld-pct');
  let msgIdx = 0;

  function startLoader() {
    const start = performance.now();
    let last = start, msgTimer = 0;
    const DURATION = 2500, MSG_INT = 175;

    function tick(now) {
      const elapsed = now - start;
      const raw     = Math.min(1, elapsed / DURATION);
      const eased   = raw < 0.5 ? 2*raw*raw : 1 - Math.pow(-2*raw+2,2)/2;
      const pct     = Math.round(eased*100);
      if (ldBarEl) ldBarEl.style.width = pct + '%';
      if (ldPctEl) ldPctEl.textContent = pct + '%';
      msgTimer += now - last;
      if (msgTimer >= MSG_INT && ldMsgEl) {
        ldMsgEl.textContent = LOADER_MSGS[msgIdx % LOADER_MSGS.length];
        msgIdx++; msgTimer = 0;
      }
      last = now;
      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        if (ldMsgEl) ldMsgEl.textContent = 'SISTEMA PRONTO — BENVENUTO';
        // uscita cinematica: il pannello di vetro sale e si dissolve
        setTimeout(() => {
          if (loaderEl) {
            loaderEl.classList.add('imploding');
            setTimeout(() => loaderEl.classList.add('done'), 950);
          }
        }, 500);
      }
    }
    requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════
     EARTH ANCHOR LOCK — terra.jpg + SVG navicella scroll-driven
  ══════════════════════════════════════════════════════════ */
  function initEarthCover() {
    const shipEl = document.getElementById('ship-svg');
    if (!shipEl) return;

    const CX      = 110;  // center of 220×220 container
    const CY      = 110;
    const ORBIT_R = 90;   // px — navicella orbita a 90px dal centro

    let scrollPct = 0;
    const sphereEl = document.getElementById('earth-sphere');

    // ── Posizione navicella ────────────────────────────────
    function updateShip() {
      // 0% scroll → bordo inferiore Terra (angolo π/2 = giù)
      // 100% scroll → 1.5 orbite complete (3π rad)
      const angle  = Math.PI / 2 + scrollPct * Math.PI * 3;
      const sx     = CX + Math.cos(angle) * ORBIT_R;
      const sy     = CY + Math.sin(angle) * ORBIT_R;
      const facing = (angle + Math.PI / 2) * (180 / Math.PI);

      /* coordinate in % del contenitore: il widget Terra è in rem e
         scala con la UI — la nave resta agganciata all'orbita */
      shipEl.style.left      = ((sx - 10) / 220 * 100) + '%';
      shipEl.style.top       = ((sy - 10) / 220 * 100) + '%';
      shipEl.style.transform = `rotate(${facing}deg)`;
    }

    // ── La Terra racconta il viaggio: si allontana e il segnale sbiadisce ──
    let labelEl = null, lastLabelTxt = '', lastLabelFill = '';
    function updateEarthNarrative() {
      if (sphereEl) {
        const scale = 1 - scrollPct * 0.42;
        sphereEl.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
        sphereEl.style.filter    = `brightness(${(1 - scrollPct * 0.30).toFixed(3)}) saturate(${(1 - scrollPct * 0.25).toFixed(3)})`;
      }
      if (!labelEl) labelEl = document.getElementById('earth-anchor-label');
      if (labelEl) {
        const txt =
          scrollPct < 0.22 ? 'EARTH_ANCHOR_LOCK // STABLE' :
          scrollPct < 0.62 ? `SIGNAL DELAY: ${Math.max(1, Math.round(scrollPct * 99))} MIN` :
                             'EARTH SIGNAL // FADING';
        if (txt !== lastLabelTxt) { lastLabelTxt = txt; labelEl.textContent = txt; }
        const fill = scrollPct < 0.62 ? 'rgba(0,242,254,0.62)' : 'rgba(255,150,150,0.60)';
        if (fill !== lastLabelFill) { lastLabelFill = fill; labelEl.setAttribute('fill', fill); }
      }
    }

    /* coalescenza: più eventi scroll per frame → un solo update DOM */
    let earthDirty = false;
    window.addEventListener('scroll', () => {
      scrollPct = window.scrollY / docMaxScroll;
      if (!earthDirty) {
        earthDirty = true;
        requestAnimationFrame(() => { earthDirty = false; updateShip(); updateEarthNarrative(); });
      }
    }, { passive: true });

    updateShip(); // posizione iniziale

    // ── Anello HUD calibrazione (con gruppo rotante CSS) ──
    function buildHudRing() {
      const NS  = 'http://www.w3.org/2000/svg';
      const svg = document.getElementById('hud-ring');
      if (!svg) return;

      // Gruppo che ruota via CSS (cerchio tratteggiato + tacche)
      const spin = document.createElementNS(NS, 'g');
      spin.id = 'hud-spin-group';

      const circ = document.createElementNS(NS, 'circle');
      circ.setAttribute('cx', CX); circ.setAttribute('cy', CY); circ.setAttribute('r', '80');
      circ.setAttribute('fill', 'none');
      circ.setAttribute('stroke', '#00f2fe');
      circ.setAttribute('stroke-opacity', '0.30');
      circ.setAttribute('stroke-width', '0.9');
      circ.setAttribute('stroke-dasharray', '4 7');
      spin.appendChild(circ);

      for (let i = 0; i < 12; i++) {
        const a     = (i * 30 * Math.PI) / 180;
        const major = i % 3 === 0;
        const ir    = major ? 72 : 76;
        const line  = document.createElementNS(NS, 'line');
        line.setAttribute('x1', CX + 80 * Math.cos(a));
        line.setAttribute('y1', CY + 80 * Math.sin(a));
        line.setAttribute('x2', CX + ir * Math.cos(a));
        line.setAttribute('y2', CY + ir * Math.sin(a));
        line.setAttribute('stroke', '#00f2fe');
        line.setAttribute('stroke-opacity', major ? '0.55' : '0.25');
        line.setAttribute('stroke-width', major ? '1.1' : '0.5');
        spin.appendChild(line);
      }
      svg.appendChild(spin);

      // Testo statico (non ruota)
      const label = document.createElementNS(NS, 'text');
      label.id = 'earth-anchor-label';
      label.setAttribute('x', String(CX));
      label.setAttribute('y', '213');
      label.setAttribute('font-family', "'JetBrains Mono',monospace");
      label.setAttribute('font-size', '5.2');
      label.setAttribute('fill', 'rgba(0,242,254,0.62)');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('letter-spacing', '0.7');
      label.textContent = 'EARTH_ANCHOR_LOCK // STABLE';
      svg.appendChild(label);
    }

    buildHudRing();
  }

  /* ══════════════════════════════════════════════════════════
     FOOTER CINEMATIC — noise burst + scramble reveal
  ══════════════════════════════════════════════════════════ */
  function initFooterCinematic() {
    const footer      = document.getElementById('fine');
    const noiseCanvas = document.getElementById('ft-noise');
    const decryptBar  = document.getElementById('ft-decrypt-bar');
    if (!footer) return;

    // Size noise canvas to match panel
    function resizeNoise() {
      if (!noiseCanvas) return;
      const panel = noiseCanvas.parentElement;
      const dpr   = window.devicePixelRatio || 1;
      noiseCanvas.width  = panel.offsetWidth  * dpr;
      noiseCanvas.height = panel.offsetHeight * dpr;
      noiseCanvas.style.width  = panel.offsetWidth  + 'px';
      noiseCanvas.style.height = panel.offsetHeight + 'px';
    }
    resizeNoise();

    let triggered = false;

    function revealSequence() {
      if (triggered) return;
      triggered = true;

      // Phase 1 — static noise burst that fades out
      if (noiseCanvas) {
        const ctx = noiseCanvas.getContext('2d');
        let alpha = 1;
        const TOTAL = 48;
        let frame  = 0;
        noiseCanvas.style.opacity = '1';

        function animateNoise() {
          frame++;
          alpha = Math.max(0, 1 - Math.pow(frame / TOTAL, 1.6));
          const w = noiseCanvas.width, h = noiseCanvas.height;
          ctx.clearRect(0, 0, w, h);
          const img  = ctx.createImageData(w, h);
          const data = img.data;
          for (let i = 0; i < data.length; i += 4) {
            const v    = Math.random() > 0.52 ? Math.floor(Math.random() * 90) : 0;
            const tint = Math.random() > 0.96;
            data[i]   = tint ? Math.min(255, v + 70) : v;
            data[i+1] = v;
            data[i+2] = tint ? v : Math.min(255, v + 40);
            data[i+3] = v > 0 ? Math.floor(alpha * 130 * (v / 90)) : 0;
          }
          ctx.putImageData(img, 0, 0);
          if (alpha > 0) requestAnimationFrame(animateNoise);
          else noiseCanvas.style.opacity = '0';
        }
        animateNoise();
      }

      // Phase 2 — decrypt bar sweeps in at 400ms
      if (decryptBar) {
        setTimeout(() => decryptBar.classList.add('revealed'), 400);
      }

      // Phase 3 — scramble-reveal each metadata value sequentially
      const metaVals = footer.querySelectorAll('.ft-meta-val');
      metaVals.forEach((el, i) => {
        const original = el.textContent.trim();
        const ts = new TextScramble(el);
        el.textContent = '';
        setTimeout(() => ts.run(original), 750 + i * 210);
      });
    }

    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { revealSequence(); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });

    obs.observe(footer);
  }

  /* ══════════════════════════════════════════════════════════
     TEXT SCRAMBLE
  ══════════════════════════════════════════════════════════ */
  const GLYPHS = '@#%!<>-_\\/[]{}—=+*^?$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  class TextScramble {
    constructor(el) { this.el=el; this.frame=0; this.queue=[]; this.rafId=null; this._update=this._update.bind(this); }
    run(text) {
      const prev=this.el.textContent, len=Math.max(prev.length,text.length);
      this.queue=[]; this.frame=0;
      for (let i=0;i<len;i++) {
        const from=prev[i]||'', to=text[i]||'';
        const start=Math.floor(Math.random()*16), end=start+Math.floor(Math.random()*22)+10;
        this.queue.push({from,to,start,end,char:''});
      }
      cancelAnimationFrame(this.rafId);
      return new Promise(r=>{ this._resolve=r; this._update(); });
    }
    _update() {
      let out='',done=0;
      for (let i=0;i<this.queue.length;i++) {
        const q=this.queue[i];
        if (this.frame>=q.end) { done++; out+=q.to; }
        else if (this.frame>=q.start) {
          if (!q.char||Math.random()<0.28) q.char=GLYPHS[Math.floor(Math.random()*GLYPHS.length)];
          out+=`<span class="scrambling">${q.char}</span>`;
        } else { out+=`<span class="unresolved">${q.from}</span>`; }
      }
      this.el.innerHTML=out; this.frame++;
      if (done<this.queue.length) { this.rafId=requestAnimationFrame(this._update); }
      else { this.el.textContent=this.queue.map(q=>q.to).join(''); this._resolve&&this._resolve(); }
    }
  }

  /* ══════════════════════════════════════════════════════════
     DYNAMIC PROJECT CARDS
  ══════════════════════════════════════════════════════════ */
  function renderProjectCards() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    grid.innerHTML = '';
    PROJECTS.forEach((proj, idx) => {
      const num     = String(idx+1).padStart(2,'0');
      const allImgs = (proj.images && proj.images.length) ? proj.images
                      : (proj.image ? [proj.image] : []);
      const tagsHtml = (proj.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');

      let mediaHtml;
      if (!allImgs.length) {
        mediaHtml = `<div class="card-placeholder"><span class="placeholder-icon">◧</span><span>IMMAGINE</span></div>`;
      } else if (allImgs.length === 1) {
        mediaHtml = `<img class="card-img" src="${allImgs[0]}" alt="${proj.title}" loading="lazy"/>`;
      } else {
        const slides = allImgs.map((src, i) =>
          `<img class="card-slide${i===0?' active':''}" src="${src}" alt="${proj.title} ${i+1}" loading="lazy"/>`
        ).join('');
        const dots = allImgs.map((_, i) =>
          `<span class="card-dot${i===0?' active':''}"></span>`
        ).join('');
        mediaHtml = `<div class="card-carousel">
          ${slides}
          <button class="card-car-btn card-car-prev" data-dir="-1">&#8249;</button>
          <button class="card-car-btn card-car-next" data-dir="1">&#8250;</button>
          <div class="card-dots">${dots}</div>
        </div>`;
      }

      const el = document.createElement('article');
      el.className = 'project-card';
      el.setAttribute('tabindex','0');
      el.setAttribute('role','button');
      el.setAttribute('aria-label',`Apri progetto: ${proj.title}`);
      el.innerHTML = `<div class="card-index">[ ${num} ]</div><div class="card-media">${mediaHtml}</div><div class="card-body"><div class="card-title">${proj.title} —</div><div class="card-desc">${proj.subtitle}</div><div class="card-tags">${tagsHtml}</div></div><div class="card-corner card-tl"></div><div class="card-corner card-tr"></div><div class="card-corner card-bl"></div><div class="card-corner card-br"></div>`;

      el.addEventListener('click', () => openModal(proj));
      el.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openModal(proj); } });

      // Wire up carousel buttons without opening the modal
      if (allImgs.length > 1) {
        let cur = 0;
        const slideEls = el.querySelectorAll('.card-slide');
        const dotEls   = el.querySelectorAll('.card-dot');
        function goTo(n) {
          slideEls[cur].classList.remove('active');
          dotEls[cur].classList.remove('active');
          cur = (n + allImgs.length) % allImgs.length;
          slideEls[cur].classList.add('active');
          dotEls[cur].classList.add('active');
        }
        el.querySelectorAll('.card-car-btn').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            goTo(cur + parseInt(btn.dataset.dir, 10));
          });
        });
      }

      grid.appendChild(el);
    });
  }

  /* ══════════════════════════════════════════════════════════
     MODAL — split screen cinema
  ══════════════════════════════════════════════════════════ */
  const modalEl       = document.getElementById('modal');
  const modalCloseBtn = document.getElementById('modal-close');
  let modalCarousel = null; // set by openModal when gallery has >1 image

  /* Flag letto dai loop di rendering: col modal a TUTTO SCHERMO
     aperto, starfield / particelle / vetro dietro sono invisibili
     ma costringerebbero la GPU a ricalcolare il backdrop-filter
     blur(44px) del modal ad ogni frame. Si attiva DOPO il fade-in
     (0.38s): mai un congelamento visibile durante la transizione. */
  let uiModalOpen  = false;
  let uiModalTimer = null;

  /* Sequenza DECRYPT prima dell'apertura del mission file */
  let decrypting = false;
  function openModal(proj) {
    if (decrypting) return;
    const ov = document.getElementById('decrypt-overlay');
    if (!ov || examActive || (modalEl && modalEl.classList.contains('open'))) {
      openModalNow(proj);
      return;
    }
    decrypting = true;
    const l1 = document.getElementById('dcy-l1');
    const l2 = document.getElementById('dcy-l2');
    const l3 = document.getElementById('dcy-l3');
    [l1, l2, l3].forEach(l => l && l.classList.remove('on'));
    ov.classList.add('active');
    ov.setAttribute('aria-hidden', 'false');
    Sfx.beep(540, 0.06, 0.04, 'square');
    setTimeout(() => { if (l1) l1.classList.add('on'); }, 60);
    setTimeout(() => { if (l2) l2.classList.add('on'); Sfx.beep(660, 0.06, 0.04, 'square'); }, 360);
    setTimeout(() => { if (l3) l3.classList.add('on'); Sfx.beep(990, 0.10, 0.05, 'sine'); }, 700);
    setTimeout(() => {
      ov.classList.remove('active');
      ov.setAttribute('aria-hidden', 'true');
      decrypting = false;
      openModalNow(proj);
    }, 1000);
  }

  function openModalNow(proj) {
    if (!modalEl) return;
    const idx = PROJECTS.indexOf(proj)+1;
    const set = (id,val,html=false) => { const e=document.getElementById(id); if(e){ html?e.innerHTML=val:e.textContent=val; } };

    set('modal-mission-tag', `// MISSION FILE — ${String(idx).padStart(2,'0')}`);
    set('modal-year',   proj.year);
    set('modal-title',  proj.title);
    set('modal-subtitle', proj.subtitle);
    set('modal-brief',  proj.brief);
    set('modal-objectives', (proj.objectives||[]).map(o=>`<li>${o}</li>`).join(''), true);
    set('modal-tools', (proj.tools||[]).map(t=>`<span class="tool-chip">${t}</span>`).join(''), true);
    set('modal-method', proj.method||'');
    set('modal-tags-list', (proj.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(''), true);

    const imgs = (proj.images && proj.images.length) ? proj.images
                 : (proj.image ? [proj.image] : []);
    let carIdx = 0;

    function renderCarousel() {
      const imgEl = document.getElementById('modal-image');
      if (!imgEl) return;
      if (!imgs.length) {
        imgEl.innerHTML = `<div class="modal-img-placeholder"><span class="modal-img-icon">◧</span><span>IMMAGINE PROGETTO</span></div>`;
      } else if (imgs.length === 1) {
        imgEl.innerHTML = `<img class="modal-img-full" id="modal-img-el" src="${imgs[0]}" alt="${proj.title}"/>`;
      } else {
        imgEl.innerHTML = `
          <div class="carousel-wrap">
            <img class="modal-img-full" id="modal-img-el" src="${imgs[carIdx]}" alt="${proj.title}"/>
            <button class="carousel-btn carousel-prev" id="carousel-prev">&#8249;</button>
            <button class="carousel-btn carousel-next" id="carousel-next">&#8250;</button>
            <div class="carousel-counter">[ ${String(carIdx+1).padStart(2,'0')} / ${String(imgs.length).padStart(2,'0')} ]</div>
          </div>`;
        document.getElementById('carousel-prev').addEventListener('click', e => {
          e.stopPropagation();
          carIdx = (carIdx - 1 + imgs.length) % imgs.length;
          renderCarousel();
        });
        document.getElementById('carousel-next').addEventListener('click', e => {
          e.stopPropagation();
          carIdx = (carIdx + 1) % imgs.length;
          renderCarousel();
        });
      }
    }
    renderCarousel();

    // Expose navigation for voice commands
    modalCarousel = imgs.length > 1 ? {
      goTo(idx) { if (idx >= 0 && idx < imgs.length) { carIdx = idx; renderCarousel(); } },
      next()    { carIdx = (carIdx + 1) % imgs.length; renderCarousel(); },
      prev()    { carIdx = (carIdx - 1 + imgs.length) % imgs.length; renderCarousel(); },
    } : null;

    modalEl.setAttribute('aria-hidden','false');
    modalEl.classList.add('open');
    document.body.style.overflow='hidden';
    document.body.classList.add('modal-open');
    clearTimeout(uiModalTimer);
    uiModalTimer = setTimeout(() => {
      if (modalEl.classList.contains('open')) uiModalOpen = true;
    }, 420);
    // Laser scan effect
    const scanEl = document.getElementById('modal-scan');
    if (scanEl) {
      scanEl.classList.remove('scanning');
      void scanEl.offsetWidth;
      scanEl.classList.add('scanning');
    }
    setTimeout(()=>{ if(modalCloseBtn) modalCloseBtn.focus(); },50);
  }

  function closeModal() {
    if (!modalEl) return;
    clearTimeout(uiModalTimer);
    uiModalOpen = false; /* i loop di fondo ripartono subito, prima del fade-out */
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    document.body.classList.remove('modal-open');
    modalCarousel = null;
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

  /* ══════════════════════════════════════════════════════════
     SKILL GRAPH — RETE DI COMPETENZE (Sinergia Cibernetica)
     Grafo a relazioni esplicite: ogni arco è un legame nominato
     tra due competenze. L'hover non ingrandisce i nodi:
       · illumina le connessioni del nodo
       · rivela l'etichetta della relazione sull'arco
       · accelera il flusso di pacchetti lungo la rete
     A riposo la rete resta viva: impulsi lenti percorrono gli archi.
  ══════════════════════════════════════════════════════════ */
  function initNeuralNetwork() {
    const cvs = document.getElementById('neural-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let nW=0, nH=0, nDpr=1;
    const nMouse = { x:-9999, y:-9999 };

    function resizeN() {
      nDpr=window.devicePixelRatio||1; nW=cvs.offsetWidth; nH=cvs.offsetHeight;
      cvs.width=Math.round(nW*nDpr); cvs.height=Math.round(nH*nDpr);
    }
    resizeN();
    window.addEventListener('resize',resizeN,{passive:true});
    cvs.addEventListener('mousemove',e=>{
      const r=cvs.getBoundingClientRect();
      nMouse.x=e.clientX-r.left; nMouse.y=e.clientY-r.top;
    });
    cvs.addEventListener('mouseleave',()=>{nMouse.x=-9999;nMouse.y=-9999;});

    const NODE_DEF = [
      {label:'GRAFICA',       x:0.16,y:0.26,log:'VISUAL_COMM → ENCODE → OUTPUT:PRINT'},
      {label:'SICUR. ELETT.', x:0.78,y:0.22,log:'PERIMETER_SCAN → CCTV → SECURE'},
      {label:'AI / ML',       x:0.50,y:0.52,log:'NEURAL_NET → TRAIN → ACC:99.97%'},
      {label:'SCI-FI',        x:0.20,y:0.72,log:'REALITY.SYS → OVERRIDE → LIMIT:∞'},
      {label:'MOTION DESIGN', x:0.80,y:0.68,log:'TIMELINE → 24fps → RENDER:DONE'},
      {label:'TIPOGRAFIA',    x:0.52,y:0.86,log:'GLYPH → KERN:+0.02em → MAX'},
    ];

    /* relazioni nominate: [a, b, etichetta del legame] */
    const LINK_DEF = [
      [0, 5, 'GERARCHIA VISIVA'],
      [0, 4, 'NARRAZIONE ANIMATA'],
      [0, 2, 'CO-CREAZIONE'],
      [0, 1, 'INTEGRITÀ DEL MESSAGGIO'],
      [2, 1, 'ANALISI PREDITTIVA'],
      [2, 4, 'FRAME GENERATIVI'],
      [3, 0, 'IMMAGINARIO VISIVO'],
      [3, 2, 'VISIONE FUTURA'],
      [5, 4, 'TIPOGRAFIA CINETICA'],
    ];

    const nodes = NODE_DEF.map(n=>({
      ...n,
      vx:(Math.random()-0.5)*0.00030,
      vy:(Math.random()-0.5)*0.00030,
      act:0.5,                       // attivazione 0..1 (luminosità, MAI scala)
    }));

    const links = LINK_DEF.map(([a,b,label],i)=>({
      a, b, label,
      lit:0,                          // illuminazione 0..1
      pulses:[{t:Math.random()},{t:(Math.random()+0.5)%1}],
      seed:i*1.37,
    }));

    let hovered = -1;
    let nnVisible = false, nnRunning = false;

    function loop() {
      /* sezione fuori schermo: il loop si ferma del tutto, zero CPU.
         Riparte identico quando la sezione torna visibile. */
      if (!nnVisible) { nnRunning = false; return; }
      ctx.clearRect(0,0,cvs.width,cvs.height);
      ctx.save(); ctx.scale(nDpr,nDpr);

      /* deriva orbitale lenta dei nodi */
      nodes.forEach(n=>{
        n.x+=n.vx; n.y+=n.vy;
        if(n.x<0.08||n.x>0.92)n.vx*=-1;
        if(n.y<0.10||n.y>0.90)n.vy*=-1;
      });

      /* hover: nodo più vicino entro 64px — il puntatore seleziona,
         non gonfia */
      hovered = -1;
      let best = 64;
      nodes.forEach((n,i)=>{
        const d=Math.hypot(n.x*nW-nMouse.x,n.y*nH-nMouse.y);
        if(d<best){best=d;hovered=i;}
      });

      const neighbors = new Set();
      if(hovered>=0){
        links.forEach(l=>{
          if(l.a===hovered)neighbors.add(l.b);
          if(l.b===hovered)neighbors.add(l.a);
        });
      }

      /* attivazione nodi: hover pieno, vicini accesi, resto in penombra */
      nodes.forEach((n,i)=>{
        const target = hovered<0 ? 0.55
          : i===hovered ? 1
          : neighbors.has(i) ? 0.85
          : 0.16;
        n.act += (target-n.act)*0.10;
      });

      /* ── ARCHI: si illuminano se toccano il nodo hover ── */
      links.forEach(l=>{
        const litTarget = hovered<0 ? 0 : (l.a===hovered||l.b===hovered ? 1 : 0);
        l.lit += (litTarget-l.lit)*0.10;

        const A=nodes[l.a], B=nodes[l.b];
        const ax=A.x*nW, ay=A.y*nH, bx=B.x*nW, by=B.y*nH;
        const dim = hovered>=0 && l.lit<0.04 ? 0.30 : 1;

        /* linea base */
        ctx.globalAlpha=(0.20+l.lit*0.45)*dim;
        if(l.lit>0.04){
          const g=ctx.createLinearGradient(ax,ay,bx,by);
          g.addColorStop(0,'rgba(29,212,212,0.95)');
          g.addColorStop(0.5,'rgba(190,242,255,0.95)');
          g.addColorStop(1,'rgba(29,212,212,0.95)');
          ctx.strokeStyle=g;
        } else {
          ctx.strokeStyle='rgba(140,180,195,0.85)';
        }
        ctx.lineWidth=0.6+l.lit*0.9;
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();

        /* flusso di rete: impulsi che percorrono l'arco — lenti a
           riposo, rapidi e luminosi quando la connessione è attiva */
        const speed=(0.0011+l.lit*0.0058);
        l.pulses.forEach((p,pi)=>{
          p.t=(p.t+speed+pi*0.0002)%1;
          /* direzione alternata per pulse: la rete dialoga, non scarica */
          const tt = pi%2===0 ? p.t : 1-p.t;
          const px=ax+(bx-ax)*tt, py=ay+(by-ay)*tt;
          ctx.globalAlpha=(0.32+l.lit*0.63)*dim;
          ctx.fillStyle=l.lit>0.3?'#bef2ff':'#1dd4d4';
          ctx.shadowColor='#1dd4d4';
          ctx.shadowBlur=3+l.lit*7;
          ctx.beginPath();ctx.arc(px,py,1.1+l.lit*0.9,0,Math.PI*2);ctx.fill();
          ctx.shadowBlur=0;
        });

        /* relazione rivelata: etichetta dell'arco al centro */
        if(l.lit>0.35){
          const mx=(ax+bx)/2, my=(ay+by)/2;
          const a2=(l.lit-0.35)/0.65;
          ctx.globalAlpha=a2*0.92;
          ctx.font='8.5px JetBrains Mono,Share Tech Mono,monospace';
          const tw=ctx.measureText(l.label).width;
          ctx.fillStyle='rgba(1,6,12,0.88)';
          ctx.fillRect(mx-tw/2-5,my-7,tw+10,14);
          ctx.strokeStyle='rgba(29,212,212,'+(0.40*a2)+')';
          ctx.lineWidth=0.6;
          ctx.strokeRect(mx-tw/2-5,my-7,tw+10,14);
          ctx.fillStyle='rgba(190,242,255,0.96)';
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(l.label,mx,my+0.5);
        }
      });

      /* ── NODI: dimensione FISSA — parlano luce e anello, non scala ── */
      nodes.forEach((n,i)=>{
        const px=n.x*nW, py=n.y*nH;
        const isHov=i===hovered, isNb=neighbors.has(i);

        ctx.globalAlpha=0.25+n.act*0.75;
        ctx.fillStyle=isHov||isNb?'#1dd4d4':'#e81c28';
        ctx.shadowColor=isHov||isNb?'#1dd4d4':'#e81c28';
        ctx.shadowBlur=5+n.act*6;
        ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;

        /* anello di selezione sottile (feedback senza ingrandimento) */
        if(isHov||isNb){
          ctx.globalAlpha=n.act*(isHov?0.85:0.40);
          ctx.strokeStyle='#7eeaff';
          ctx.lineWidth=isHov?1.2:0.8;
          ctx.beginPath();ctx.arc(px,py,8.5,0,Math.PI*2);ctx.stroke();
          if(isHov){
            ctx.globalAlpha=n.act*0.30;
            ctx.beginPath();ctx.arc(px,py,13,0,Math.PI*2);ctx.stroke();
          }
        }

        ctx.globalAlpha=0.30+n.act*0.70;
        ctx.fillStyle=isHov?'#ffffff':isNb?'#d9f6ff':'rgba(200,216,224,0.72)';
        ctx.font='10px JetBrains Mono,Share Tech Mono,monospace';
        ctx.textAlign='center';ctx.textBaseline='bottom';
        ctx.fillText(n.label,px,py-13);

        if(isHov&&n.act>0.55){
          ctx.globalAlpha=(n.act-0.55)/0.45;
          ctx.fillStyle='rgba(29,212,212,0.92)';
          ctx.font='8.5px JetBrains Mono,Share Tech Mono,monospace';
          ctx.textBaseline='top';
          ctx.fillText(n.log,px,py+16);
        }
      });

      ctx.restore();
      requestAnimationFrame(loop);
    }

    new IntersectionObserver(entries => {
      entries.forEach(e => {
        nnVisible = e.isIntersecting;
        if (nnVisible && !nnRunning) { nnRunning = true; requestAnimationFrame(loop); }
      });
    }, { rootMargin: '120px' }).observe(cvs);
  }

  /* ══════════════════════════════════════════════════════════
     ROCKY TRANSLATOR WIDGET
  ══════════════════════════════════════════════════════════ */
  const ROCKY_SIGNALS = [
    {
      freq:0.16, amp:0.60, msg:'VISIONE → NARRATIVA → SCENOGRAFIA',
      color:'cyan',
      detail:'La fantascienza è la grammatica della mia visione grafica. Ogni frame di un film come Project Hail Mary è una decisione visiva precisa: illuminazione, palette, composizione. Studio queste scelte e le traduco nel mio linguaggio di grafico pubblicitario — perché comunicare visivamente è sempre raccontare una storia.',
    },
    {
      freq:0.07, amp:0.85, msg:'TEMPO → FORMA → SIGNIFICATO',
      color:'cyan',
      detail:'Il movimento trasforma la grafica da statica a narrativa. Lavoro su transizioni, easing e timing per comunicare emozioni che un\'immagine fissa non può trasmettere. Il motion design è la differenza tra un manifesto e un\'esperienza memorabile.',
    },
    {
      freq:0.03, amp:0.92, msg:'SCALA COSMICA → UMILTÀ VISIVA',
      color:'red',
      detail:'La scala cosmica mi insegna l\'umiltà visiva: ogni progetto grafico è piccolo ma significativo nell\'universo della comunicazione. Uso la vastità dello spazio come metafora quando affronto brief complessi — la soluzione esiste sempre, bisogna trovare il punto di vista giusto.',
    },
    {
      freq:0.14, amp:0.68, msg:'GUARDA → PROTEGGI → MONITORA → LOOP',
      color:'red',
      detail:'Sicurezza elettronica e grafica condividono lo stesso obiettivo: rendere immediato e leggibile ciò che protegge. Lavoro su sistemi antintrusione e videosorveglianza — tecnologie per la protezione degli ambienti — e ne traduco la logica in comunicazione visiva: la stessa precisione con cui un impianto sorveglia uno spazio la applico alla gerarchia tipografica e alla leggibilità del messaggio.',
    },
    {
      freq:0.20, amp:0.30, msg:'CARATTERE → VOCE → IDENTITÀ',
      color:'cyan',
      detail:'La tipografia è il fondamento silenzioso di ogni comunicazione visiva. Lavoro su spaziatura, kerning e gerarchia come un chirurgo: ogni micro-decisione cambia la percezione del messaggio. Il carattere giusto parla prima ancora che si legga una parola.',
    },
    {
      freq:0.10, amp:0.74, msg:'PROMPT → TRAIN → OUTPUT → REFINE',
      color:'red',
      detail:'L\'Intelligenza Artificiale è il mio copilota creativo, non il mio sostituto. Uso i modelli AI per esplorare varianti, accelerare i processi e risolvere problemi complessi. La mia competenza sta nel saper dialogare con l\'AI attraverso prompt precisi — una forma di regia visiva che amplifica le capacità umane senza sostituirle.',
    },
  ];
  const BASE_W = {freq:0.06,amp:0.28};

  function initRockyTranslator() {
    const wCvs    = document.getElementById('rocky-wave');
    const msgEl   = document.getElementById('rocky-msg');
    const detailEl= document.getElementById('rocky-detail');
    if (!wCvs) return;
    const wCtx = wCvs.getContext('2d');
    let wDpr=1,wW=0,wH=0;
    function resW(){ wDpr=window.devicePixelRatio||1; wW=wCvs.offsetWidth; wH=wCvs.offsetHeight; wCvs.width=Math.round(wW*wDpr); wCvs.height=Math.round(wH*wDpr); }
    resW();
    window.addEventListener('resize',resW,{passive:true});
    let cur={...BASE_W},tgt={...BASE_W},flashA=0,wt=0;
    let activeIdx = -1;
    let distortAmt = 0;

    // CLICK-BASED (non hover)
    document.querySelectorAll('.rocky-signal').forEach(btn=>{
      const i=parseInt(btn.dataset.index,10);
      const sig=ROCKY_SIGNALS[i]; if(!sig)return;

      btn.addEventListener('click',()=>{
        const isSame = activeIdx === i;

        // reset tutti
        document.querySelectorAll('.rocky-signal').forEach(b=>{
          b.classList.remove('active','active-red');
        });
        if (detailEl) { detailEl.classList.remove('visible'); detailEl.innerHTML=''; }
        if (msgEl)    { msgEl.textContent=''; msgEl.style.opacity='0'; }

        if (isSame) {
          // secondo click sullo stesso: deseleziona
          activeIdx = -1;
          tgt.freq=BASE_W.freq; tgt.amp=BASE_W.amp;
        } else {
          // attiva il nuovo — spike immediato + settle al target
          activeIdx = i;
          tgt.freq = sig.freq; tgt.amp = sig.amp;
          cur.amp  = Math.min(cur.amp * 2.8, 1.1); // spike immediato
          distortAmt = 1.8;
          flashA   = 1.0;

          const cls = sig.color === 'red' ? 'active-red' : 'active';
          btn.classList.add(cls);

          if (msgEl)  { msgEl.textContent=sig.msg; msgEl.style.opacity='1'; }
          if (detailEl) {
            detailEl.innerHTML = `<p>${sig.detail}</p>`;
            detailEl.classList.add('visible');
          }
        }
      });
    });

    // ── FREQUENCY TUNER SLIDER ─────────────────────────────
    const freqSlider  = document.getElementById('rocky-freq-slider');
    const freqDisplay = document.getElementById('rocky-freq-display');
    const decodeStatus= document.getElementById('rocky-decode-status');

    // Sweet spots [sliderValue, signalIndex, label]
    const SWEET_SPOTS = [
      { val:22, idx:0, label:'CINEMA SCI-FI' },
      { val:55, idx:3, label:'SICUREZZA ELETTRONICA' },
      { val:82, idx:5, label:'AI / PROMPT ENG.' },
    ];
    const SWEET_RANGE = 4.5;
    let lastLockedIdx = -1;

    function glitchReveal(el, finalText) {
      const GLYPHS_S = '@#%!<>-_\\/[]{}=+*?$';
      let iter = 0;
      const id = setInterval(()=>{
        if (!el) { clearInterval(id); return; }
        if (iter < 10) {
          el.textContent = Array.from(finalText).map(c=>
            c===' ' ? ' ' : (Math.random()<0.42 ? GLYPHS_S[Math.floor(Math.random()*GLYPHS_S.length)] : c)
          ).join('');
          el.style.opacity = '1';
        } else {
          el.textContent = finalText;
          clearInterval(id);
        }
        iter++;
      }, 52);
    }

    if (freqSlider) {
      freqSlider.addEventListener('input', ()=>{
        const v = parseFloat(freqSlider.value);
        if (freqDisplay) freqDisplay.textContent = v.toFixed(1);

        // Map slider → wave distortion
        const freq  = 0.025 + (v/100)*0.20;
        const amp   = 0.22 + Math.abs(Math.sin(v*0.065))*0.55;
        tgt.freq = freq; tgt.amp = Math.max(0.10, amp);
        distortAmt = 0.6 + Math.abs(Math.sin(v*0.09))*0.9;

        // Check sweet spots
        const hit = SWEET_SPOTS.find(s=> Math.abs(s.val-v) <= SWEET_RANGE);

        if (hit && hit.idx !== lastLockedIdx) {
          lastLockedIdx = hit.idx;
          const sig = ROCKY_SIGNALS[hit.idx];

          // Spike + lock wave to signal
          tgt.freq = sig.freq; tgt.amp = sig.amp;
          cur.amp  = Math.min(cur.amp*2.2, 1.0);
          flashA   = 1.0; distortAmt = 1.5;

          // Status display
          if (decodeStatus) {
            decodeStatus.classList.remove('scanning');
            decodeStatus.classList.add('locked');
            decodeStatus.textContent = `◉ FREQ LOCKED — ${hit.label}`;
            setTimeout(()=>decodeStatus.classList.remove('locked'), 2200);
          }

          // Activate button + decode content
          document.querySelectorAll('.rocky-signal').forEach(b=>b.classList.remove('active','active-red'));
          if (msgEl)    { msgEl.textContent=''; msgEl.style.opacity='0'; }
          if (detailEl) { detailEl.classList.remove('visible'); detailEl.innerHTML=''; }

          activeIdx = hit.idx;
          const cls = sig.color==='red' ? 'active-red' : 'active';
          const triggerBtn = document.querySelector(`.rocky-signal[data-index="${hit.idx}"]`);
          if (triggerBtn) triggerBtn.classList.add(cls);

          if (msgEl) glitchReveal(msgEl, sig.msg);
          if (detailEl) {
            setTimeout(()=>{
              detailEl.innerHTML=`<p>${sig.detail}</p>`;
              detailEl.classList.add('visible');
            }, 620);
          }

        } else if (!hit) {
          lastLockedIdx = -1;
          if (decodeStatus) {
            decodeStatus.classList.remove('locked');
            decodeStatus.classList.add('scanning');
            decodeStatus.textContent = `— SCANNING ${v.toFixed(1)} MHz —`;
            setTimeout(()=>decodeStatus.classList.remove('scanning'), 350);
          }
        }
      });
    }

    let waveVisible = false, waveRunning = false;

    function drawW(){
      if (!waveVisible) { waveRunning = false; return; }
      wCtx.clearRect(0,0,wCvs.width,wCvs.height);
      wCtx.save(); wCtx.scale(wDpr,wDpr);
      cur.freq+=(tgt.freq-cur.freq)*0.15; cur.amp+=(tgt.amp-cur.amp)*0.15; flashA*=0.90;
      distortAmt *= 0.84;

      // grid lines
      for(let i=0;i<=3;i++){
        const y=wH/3*i;
        wCtx.globalAlpha=0.07; wCtx.strokeStyle='#1dd4d4'; wCtx.lineWidth=0.5;
        wCtx.beginPath(); wCtx.moveTo(0,y); wCtx.lineTo(wW,y); wCtx.stroke();
      }

      // flash on activation
      if(flashA>0.02){
        wCtx.globalAlpha=flashA*0.28;
        wCtx.fillStyle = activeIdx>=0 && ROCKY_SIGNALS[activeIdx].color==='red' ? '#e81c28' : '#1dd4d4';
        wCtx.fillRect(0,0,wW,wH);
      }

      // pick wave color based on active signal
      const wColor = activeIdx>=0 && ROCKY_SIGNALS[activeIdx].color==='red' ? '#e81c28' : '#1dd4d4';
      const amp=cur.amp*(wH/2)*0.82, cx=wH/2;

      // primary wave
      wCtx.beginPath();
      for(let x=0;x<=wW;x++){
        const chaos = distortAmt > 0.03 ? Math.sin(x*0.08+wt*4.5)*distortAmt*(wH*0.30) : 0;
        const y=cx+Math.sin(x*cur.freq*Math.PI*2+wt)*amp+Math.sin(x*cur.freq*Math.PI*4+wt*1.3)*amp*0.18+chaos;
        x===0?wCtx.moveTo(x,y):wCtx.lineTo(x,y);
      }
      wCtx.shadowColor=wColor; wCtx.shadowBlur=8;
      wCtx.strokeStyle=wColor; wCtx.lineWidth=1.6; wCtx.globalAlpha=0.90; wCtx.stroke();

      // harmonic
      wCtx.beginPath();
      for(let x=0;x<=wW;x++){
        const chaosH = distortAmt > 0.03 ? Math.sin(x*0.12+wt*6)*distortAmt*(wH*0.12) : 0;
        const y=cx+Math.sin(x*cur.freq*Math.PI*5+wt*1.7)*amp*0.18+chaosH;
        x===0?wCtx.moveTo(x,y):wCtx.lineTo(x,y);
      }
      wCtx.shadowBlur=4; wCtx.strokeStyle=`${wColor}55`; wCtx.lineWidth=0.8; wCtx.stroke();

      wCtx.restore(); wt+=0.045; requestAnimationFrame(drawW);
    }

    new IntersectionObserver(entries => {
      entries.forEach(e => {
        waveVisible = e.isIntersecting;
        if (waveVisible && !waveRunning) { waveRunning = true; requestAnimationFrame(drawW); }
      });
    }, { rootMargin: '120px' }).observe(wCvs);
  }

  /* ══════════════════════════════════════════════════════════
     PARTICLE SYSTEM — gravità zero + attrazione magnetica
     z-index 15: velo sopra tutte le sezioni
  ══════════════════════════════════════════════════════════ */
  const Particles = (() => {
    let pCvs, pCtx, pDpr=1, PW=0, PH=0;
    const pool       = [];
    const shockwaves = [];
    const mouse = {x:-9999,y:-9999};

    let overdriveInterval = null;
    let overdriveActive   = false;
    let loopStopped       = false;

    /* dimensioni del sistema modulate dal governor: su hardware in
       difficoltà meno particelle ambient — il campo resta identico
       per aspetto (stessi colori, stesse connessioni, stessa fisica) */
    let MAX_POOL   = 160;
    let AMBIENT    = 85;
    /* tetto combinato governor FPS × profilo grafico: vale il più basso.
       Il campo resta identico per aspetto (colori, connessioni, fisica). */
    function refreshPool() {
      const t = PERF.tier;
      let mp = t === 0 ? 160 : t === 1 ? 130 : 100;
      let am = t === 0 ? 85  : t === 1 ? 68  : 52;
      /* LAPTOP: campo neuronale più rado (stessi colori/connessioni/
         fisica, meno nodi) — meno lavoro per CPU e GPU sulla GTX 1050 */
      if (GFX.active === 'laptop') { mp = Math.min(mp, 120); am = Math.min(am, 60); }
      MAX_POOL = mp; AMBIENT = am;
    }
    PERF.onTier(refreshPool);
    GFX.on(refreshPool);
    refreshPool();
    const CONN_DIST  = 110;
    const CONN_DIST2 = CONN_DIST * CONN_DIST;
    const ATTRACT_R  = 220;
    const ATTRACT_STR= 0.95;
    const ORBIT_R    = 28;

    /* sprite pre-renderizzati del glow: il bagliore è disegnato UNA
       volta per colore (con lo stesso identico shadowBlur di prima)
       e poi stampato via drawImage — decine di volte più economico
       di uno shadowBlur per particella per frame. */
    const OVS = 3;                 /* oversampling per qualità */
    const SPR_R = 2;               /* raggio di riferimento */
    const SPR_EXT = SPR_R + 12;    /* raggio + estensione del blur */
    const sprCache = {};
    function glowSprite(r, g, b) {
      const key = r + ',' + g + ',' + b;
      let s = sprCache[key];
      if (!s) {
        s = document.createElement('canvas');
        s.width = s.height = SPR_EXT * 2 * OVS;
        const c = s.getContext('2d');
        c.shadowColor = `rgb(${r},${g},${b})`;
        c.shadowBlur  = 10 * OVS;
        c.fillStyle   = `rgb(${r},${g},${b})`;
        c.beginPath();
        c.arc(SPR_EXT * OVS, SPR_EXT * OVS, SPR_R * OVS, 0, Math.PI * 2);
        c.fill();
        sprCache[key] = s;
      }
      return s;
    }

    // Panel avoidance cache
    let panelBoxCache = [];
    let scrollVelocity = 0, lastScrollY = 0;
    function refreshPanelCache() {
      panelBoxCache = Array.from(
        document.querySelectorAll('.hud-frame,.projects-wrapper,.blackbox-wrapper')
      ).map(el => {
        const r = el.getBoundingClientRect();
        return { l: r.left-8, r: r.right+8, t: r.top-8, b: r.bottom+8 };
      }).filter(b => b.r>0 && b.l<window.innerWidth && b.b>0 && b.t<window.innerHeight);
    }
    let lastCacheRefresh = 0;
    window.addEventListener('scroll',  () => {
      scrollVelocity = Math.abs(window.scrollY - lastScrollY);
      lastScrollY = window.scrollY;
      /* getBoundingClientRect su più pannelli a OGNI evento scroll
         era un collo di bottiglia: basta un refresh ogni ~150ms */
      const now = performance.now();
      if (now - lastCacheRefresh > 150) { lastCacheRefresh = now; refreshPanelCache(); }
    }, { passive:true });
    window.addEventListener('resize',  refreshPanelCache, { passive:true });

    function pResize(){pDpr=effDpr();PW=window.innerWidth;PH=window.innerHeight;pCvs.width=Math.round(PW*pDpr);pCvs.height=Math.round(PH*pDpr);pCvs.style.width=PW+'px';pCvs.style.height=PH+'px';}

    function scrollP(){return Math.min(1,(window.scrollY||0)/docMaxScroll);}

    function pickColor(){
      return Math.random()<0.10+scrollP()*0.60
        ?{r:232,g:28,b:40}
        :{r:29,g:212,b:212};
    }

    function spawn(x,y,burst){
      if(pool.length>=(overdriveActive?MAX_POOL*2:MAX_POOL))return;
      const c=pickColor();
      pool.push({x,y,vx:(Math.random()-0.5)*(burst?2.6:0.4),vy:(Math.random()-0.5)*(burst?2.6:0.4)-(burst?0:0.15),size:burst?Math.random()*1.8+0.4:Math.random()*1.3+0.3,life:1,decay:burst?0.014+Math.random()*0.014:0.002+Math.random()*0.003,r:c.r,g:c.g,b:c.b,phi:Math.random()*Math.PI*2,ambient:!burst});
    }

    function update(){
      if(examActive)return;
      scrollVelocity *= 0.82;
      if(pool.length<AMBIENT&&Math.random()<0.22)spawn(Math.random()*PW,Math.random()*PH,false);
      const mx=mouse.x,my=mouse.y;
      for(let i=pool.length-1;i>=0;i--){
        const p=pool[i];
        const dx=p.x-mx,dy=p.y-my,d2=dx*dx+dy*dy;
        if(d2<ATTRACT_R*ATTRACT_R&&d2>0.01){
          const d=Math.sqrt(d2);
          if(d>ORBIT_R){const f=Math.pow(1-d/ATTRACT_R,1.6)*ATTRACT_STR;p.vx-=(dx/d)*f;p.vy-=(dy/d)*f;}
          else{const f=(1-d/ORBIT_R)*2.2;p.vx+=(dx/d)*f;p.vy+=(dy/d)*f;}
        }
        // Panel avoidance
        for (const box of panelBoxCache) {
          if (p.x > box.l && p.x < box.r && p.y > box.t && p.y < box.b) {
            const dL=p.x-box.l, dR=box.r-p.x, dT=p.y-box.t, dB=box.b-p.y;
            const m=Math.min(dL,dR,dT,dB);
            const f=1.4;
            if(m===dL)p.vx-=f; else if(m===dR)p.vx+=f;
            else if(m===dT)p.vy-=f; else p.vy+=f;
          }
        }
        // Warp burst from scroll
        if(scrollVelocity>0){ p.vx+=(Math.random()-0.5)*scrollVelocity*0.016; p.vy+=(Math.random()-0.5)*scrollVelocity*0.016; }
        p.vx*=0.958;p.vy*=0.958;p.x+=p.vx;p.y+=p.vy;p.life-=p.decay;p.phi+=0.048;
        if(p.ambient){if(p.x<-6)p.x=PW+6;if(p.x>PW+6)p.x=-6;if(p.y<-6)p.y=PH+6;if(p.y>PH+6)p.y=-6;}
        if(p.life<=0)pool.splice(i,1);
      }
    }

    function draw(){
      const cw=pCvs.width,ch=pCvs.height;
      pCtx.clearRect(0,0,cw,ch);
      /* il loop esterno gestisce il RAF: niente catene parallele */
      if(examActive)return;
      pCtx.save();pCtx.scale(pDpr,pDpr);
      pCtx.lineWidth=0.42;
      /* confronto su distanza al quadrato: sqrt solo per le coppie connesse */
      for(let i=0;i<pool.length;i++){const a=pool[i];for(let j=i+1;j<pool.length;j++){const b=pool[j];const dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;if(d2<CONN_DIST2){const d=Math.sqrt(d2);pCtx.globalAlpha=(1-d/CONN_DIST)*Math.min(a.life,b.life)*0.28;pCtx.strokeStyle=`rgb(${a.r},${a.g},${a.b})`;pCtx.beginPath();pCtx.moveTo(a.x,a.y);pCtx.lineTo(b.x,b.y);pCtx.stroke();}}}
      for(const p of pool){const r=p.size*(1+Math.sin(p.phi)*0.22);const spr=glowSprite(p.r,p.g,p.b);const ext=SPR_EXT*(r/SPR_R);pCtx.globalAlpha=p.life*0.75;pCtx.drawImage(spr,p.x-ext,p.y-ext,ext*2,ext*2);}
      pCtx.globalAlpha=1;
      // Shockwave rings
      for(let i=shockwaves.length-1;i>=0;i--){
        const sw=shockwaves[i];
        pCtx.save();
        pCtx.globalAlpha=sw.life*0.55;
        pCtx.strokeStyle='#1dd4d4'; pCtx.lineWidth=1.6;
        pCtx.shadowColor='#1dd4d4'; pCtx.shadowBlur=10;
        pCtx.beginPath(); pCtx.arc(sw.x,sw.y,sw.r,0,Math.PI*2); pCtx.stroke();
        pCtx.globalAlpha=sw.life*0.22;
        pCtx.lineWidth=0.8;
        pCtx.beginPath(); pCtx.arc(sw.x,sw.y,sw.r*0.66,0,Math.PI*2); pCtx.stroke();
        pCtx.restore();
        sw.r+=11; sw.life-=0.038;
        if(sw.life<=0)shockwaves.splice(i,1);
      }
      pCtx.restore();
    }

    function loop(){
      if(loopStopped)return;
      /* modal a tutto schermo aperto: campo congelato — zero fisica,
         zero draw, e il backdrop-filter del modal non viene più
         invalidato ad ogni frame */
      if(!uiModalOpen){update();draw();}
      requestAnimationFrame(loop);
    }
    let prevMX=0,prevMY=0;

    return{
      init(){
        pCvs=document.getElementById('particle-canvas');if(!pCvs)return;
        pCtx=pCvs.getContext('2d');pResize();
        window.addEventListener('resize',pResize,{passive:true});
        PERF.onTier(()=>pResize());
        GFX.on(()=>pResize());
        window.addEventListener('mousemove',e=>{
          /* profilo PERFORMANCE: niente effetti mouse — il campo
             ambient continua identico, ma non reagisce al puntatore */
          if(!GFX.fx.mouseFx){mouse.x=-9999;mouse.y=-9999;return;}
          const speed=Math.hypot(e.clientX-prevMX,e.clientY-prevMY);
          prevMX=e.clientX;prevMY=e.clientY;mouse.x=e.clientX;mouse.y=e.clientY;
          if(speed>5&&Math.random()<0.62)spawn(e.clientX,e.clientY,true);
        },{passive:true});
        window.addEventListener('mouseleave',()=>{mouse.x=-9999;mouse.y=-9999;});
        window.addEventListener('click', e => {
          if(examActive) return;
          const cx=e.clientX, cy=e.clientY;
          // Fase 1 — convergenza: gli Astrofagi vengono attratti verso il punto di energia
          if(GFX.fx.mouseFx)pool.forEach(p=>{
            const dx=p.x-cx, dy=p.y-cy, d=Math.sqrt(dx*dx+dy*dy);
            if(d>0&&d<340){ const f=Math.pow(1-d/340,1.4)*10; p.vx-=(dx/d)*f; p.vy-=(dy/d)*f; }
          });
          // Trasferimento energia alla UI: i bordi dei pannelli si caricano
          document.body.classList.add('ui-energy');
          setTimeout(()=>document.body.classList.remove('ui-energy'), 750);
          // Fase 2 — rilascio: shockwave + burst di particelle
          setTimeout(()=>{
            if(!GFX.fx.mouseFx) return;
            pool.forEach(p=>{
              const dx=p.x-cx, dy=p.y-cy, d=Math.sqrt(dx*dx+dy*dy);
              if(d>0&&d<300){ const f=Math.pow(1-d/300,2)*22; p.vx+=(dx/d)*f; p.vy+=(dy/d)*f; }
            });
            shockwaves.push({x:cx,y:cy,r:4,life:1});
            for(let i=0;i<24;i++) spawn(cx+(Math.random()-0.5)*12, cy+(Math.random()-0.5)*12, true);
          }, 230);
        });
        for(let i=0;i<AMBIENT;i++)spawn(Math.random()*window.innerWidth,Math.random()*window.innerHeight,false);
        setTimeout(refreshPanelCache, 800);
        loop();
      },
      triggerShockwave(x, y) {
        if(examActive) return;
        shockwaves.push({x, y, r:4, life:1});
      },
      warpBurst() {
        if(examActive) return;
        pool.forEach(p => {
          p.vx += (Math.random()-0.5)*9;
          p.vy += (Math.random()-0.5)*9;
        });
        for(let i=0;i<40;i++) spawn(
          window.innerWidth*0.5+(Math.random()-0.5)*window.innerWidth*0.8,
          window.innerHeight*0.5+(Math.random()-0.5)*window.innerHeight*0.8,
          true
        );
      },
      overdrive() {
        overdriveActive = true;
        // Force all particles red and blast velocities to 500%
        pool.forEach(p => {
          p.r=232; p.g=28; p.b=40;
          p.vx += (Math.random()-0.5)*22;
          p.vy += (Math.random()-0.5)*22;
          p.decay = 0.0005; // almost immortal
          p.life  = 1;
        });
        for(let i=0;i<60;i++) spawn(Math.random()*PW, Math.random()*PH, true);
        // Keep injecting chaos every 120ms
        overdriveInterval = setInterval(() => {
          pool.forEach(p => {
            p.r=232; p.g=28; p.b=40;
            p.vx += (Math.random()-0.5)*14;
            p.vy += (Math.random()-0.5)*14;
            p.life = Math.max(p.life, 0.55);
          });
          for(let i=0;i<18;i++) spawn(Math.random()*PW, Math.random()*PH, true);
        }, 120);
      },
      shutdown() {
        if(overdriveInterval) { clearInterval(overdriveInterval); overdriveInterval=null; }
        overdriveActive = false;
        loopStopped     = true;
        pool.length     = 0;
        shockwaves.length = 0;
        if(pCvs) { const c=pCvs.getContext('2d'); c.clearRect(0,0,pCvs.width,pCvs.height); }
      }
    };
  })();

  /* ══════════════════════════════════════════════════════════
     ROCKY KNOB — rotary drag interface
  ══════════════════════════════════════════════════════════ */
  function initRockyKnob() {
    const knobWrap    = document.getElementById('rocky-knob-wrap');
    const needleGroup = document.getElementById('knob-needle-group');
    const valText     = document.getElementById('knob-val-text');
    const activeArc   = document.getElementById('knob-active-arc');
    const freqDisplay = document.getElementById('rocky-freq-display');
    const slider      = document.getElementById('rocky-freq-slider');
    const ticksEl     = document.getElementById('knob-ticks');
    if (!knobWrap || !needleGroup || !slider) return;

    // Draw tick marks (-150° to +150°)
    if (ticksEl) {
      const N = 11;
      for (let i=0;i<N;i++) {
        const angleDeg = -150 + (i/(N-1))*300;
        const rad = (angleDeg - 90) * Math.PI / 180;
        const r1=33, r2=39;
        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1', 50 + Math.cos(rad)*r1);
        line.setAttribute('y1', 50 + Math.sin(rad)*r1);
        line.setAttribute('x2', 50 + Math.cos(rad)*r2);
        line.setAttribute('y2', 50 + Math.sin(rad)*r2);
        if(i===0||i===N-1) { line.setAttribute('stroke','rgba(29,212,212,0.55)'); line.setAttribute('stroke-width','1.8'); }
        ticksEl.appendChild(line);
      }
    }

    let knobVal = 50;
    let isDragging = false;
    let lastY = 0;

    // Full arc length for 300° range: 2*PI*38*(300/360) ≈ 198.97
    const ARC_LEN = 2 * Math.PI * 38 * (300/360);

    function setKnobVal(v) {
      knobVal = Math.max(0, Math.min(100, v));
      const rotation = -150 + (knobVal/100)*300;
      needleGroup.setAttribute('transform', `rotate(${rotation},50,50)`);
      if(valText)  valText.textContent = knobVal.toFixed(1);
      if(freqDisplay) freqDisplay.textContent = knobVal.toFixed(1);
      // Update active arc dash
      if(activeArc) {
        const filled = (knobVal/100)*ARC_LEN;
        activeArc.setAttribute('stroke-dasharray', `${filled.toFixed(2)} 202`);
      }
      slider.value = knobVal;
      slider.dispatchEvent(new Event('input'));
    }

    knobWrap.addEventListener('mousedown', e => {
      isDragging = true;
      lastY = e.clientY;
      knobWrap.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if(!isDragging) return;
      const delta = -(e.clientY - lastY);
      lastY = e.clientY;
      setKnobVal(knobVal + delta * 0.85);
    });
    document.addEventListener('mouseup', () => {
      if(isDragging){ isDragging=false; knobWrap.classList.remove('dragging'); }
    });
    knobWrap.addEventListener('touchstart', e => {
      isDragging=true; lastY=e.touches[0].clientY; e.preventDefault();
    }, {passive:false});
    document.addEventListener('touchmove', e => {
      if(!isDragging) return;
      const delta = -(e.touches[0].clientY - lastY);
      lastY = e.touches[0].clientY;
      setKnobVal(knobVal + delta * 0.85);
    }, {passive:false});
    document.addEventListener('touchend', ()=>{ isDragging=false; });

    setKnobVal(50);
  }

  /* ══════════════════════════════════════════════════════════
     STARFIELD MULTILAYER + PARALLAX CINEMATICO
     Layer 1: stelle lontane · Layer 2: nebulose · Layer 3: stelle vicine
     Profondità percepita: scroll + deriva del puntatore.
  ══════════════════════════════════════════════════════════ */
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plx = { x: 0, y: 0, tx: 0, ty: 0 };

  window.addEventListener('mousemove', e => {
    if (!GFX.fx.parallax) return;
    plx.tx = (e.clientX / Math.max(1, window.innerWidth)  - 0.5) * 2;
    plx.ty = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  }, { passive: true });
  /* profilo senza mouse parallax: la deriva rientra dolcemente a zero
     (il lerp del loop starfield porta --plx-x/y a 0, poi il deadband
     ferma le scritture) */
  GFX.on(() => { if (!GFX.fx.parallax) { plx.tx = 0; plx.ty = 0; } });

  function initStarfield() {
    const cvs = document.getElementById('starfield-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = 0, H = 0, dpr = 1, stars = [], nebulae = [], t = 0;

    const LAYERS = [
      { n: 95, sp: 0.10, size: [0.35, 0.95], a: 0.40 },  // stelle lontane
      { n: 50, sp: 0.26, size: [0.60, 1.40], a: 0.60 },  // campo intermedio
      { n: 22, sp: 0.55, size: [1.00, 2.10], a: 0.88 },  // stelle vicine
    ];

    function seed() {
      stars = [];
      LAYERS.forEach((L, li) => {
        for (let i = 0; i < L.n; i++) {
          stars.push({
            x: Math.random() * W, y: Math.random() * H,
            r: L.size[0] + Math.random() * (L.size[1] - L.size[0]),
            a: L.a * (0.45 + Math.random() * 0.55),
            sp: L.sp, tw: Math.random() * Math.PI * 2, li,
          });
        }
      });
      nebulae = [];
      for (let i = 0; i < 3; i++) {
        const r   = H * (0.35 + Math.random() * 0.40);
        const hue = Math.random() < 0.5 ? '29,140,212' : '70,40,160';
        const a   = 0.030 + Math.random() * 0.025;
        nebulae.push({
          x: Math.random() * W, y: Math.random() * H,
          r, hue, a,
          sp: 0.05 + Math.random() * 0.06,
          drift: Math.random() * Math.PI * 2,
          /* gradiente pre-renderizzato una volta (a mezza risoluzione:
             è già morbidissimo) invece di createRadialGradient +
             fillRect a tutto schermo per OGNI frame */
          sprite: makeNebulaSprite(r, hue, a),
        });
      }
    }

    function makeNebulaSprite(r, hue, a) {
      const s = document.createElement('canvas');
      const d = Math.max(2, Math.ceil(r));         /* metà risoluzione */
      s.width = s.height = d;
      const c = s.getContext('2d');
      const g = c.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
      g.addColorStop(0, `rgba(${hue},${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, d, d);
      return s;
    }

    /* sprite del bagliore per le stelle vicine (stesso shadowBlur,
       renderizzato una volta sola) */
    const starGlow = (() => {
      const s = document.createElement('canvas');
      const O = 4, R = 1.5, EXT = R + 6;
      s.width = s.height = EXT * 2 * O;
      const c = s.getContext('2d');
      c.shadowColor = '#9fe8ff'; c.shadowBlur = 6 * O;
      c.fillStyle = '#dff6ff';
      c.beginPath(); c.arc(EXT * O, EXT * O, R * O, 0, Math.PI * 2); c.fill();
      return { cvs: s, R, EXT };
    })();

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = window.innerWidth; H = window.innerHeight;
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    let lastPlxX = 99, lastPlxY = 99;
    function loop() {
      /* exam mode o modal a tutto schermo: cielo congelato, zero costo */
      if (examActive || uiModalOpen) { requestAnimationFrame(loop); return; }
      t += 0.012;
      // deriva morbida del parallax (lerp) + variabili CSS per i pannelli
      plx.x += (plx.tx - plx.x) * 0.035;
      plx.y += (plx.ty - plx.y) * 0.035;
      /* scrivere le variabili su :root invalida lo stile dell'INTERO
         documento: lo facciamo solo quando il valore cambia davvero
         (a puntatore fermo il costo scende a zero) */
      /* deadband 0.002 ≈ 0.003° di rotazione / 0.02px di traslazione:
         invisibile, ma le scritture si fermano ~1s prima a riposo */
      if (!reducedMotion && (Math.abs(plx.x - lastPlxX) > 0.002 || Math.abs(plx.y - lastPlxY) > 0.002)) {
        lastPlxX = plx.x; lastPlxY = plx.y;
        document.documentElement.style.setProperty('--plx-x', plx.x.toFixed(4));
        document.documentElement.style.setProperty('--plx-y', plx.y.toFixed(4));
      }

      const sy = window.scrollY || 0;
      ctx.clearRect(0, 0, W, H);

      // Layer 2 — nebulose profonde (sprite pre-renderizzati)
      for (const nb of nebulae) {
        const ox = Math.cos(t * 0.5 + nb.drift) * 14 - plx.x * nb.sp * 80;
        const oy = ((nb.y + sy * nb.sp * 0.10) % (H + nb.r * 2)) - nb.r + Math.sin(t * 0.4 + nb.drift) * 10;
        ctx.drawImage(nb.sprite, nb.x + ox - nb.r, oy - nb.r, nb.r * 2, nb.r * 2);
      }

      // Layer 1/3 — stelle con twinkle + parallax differenziale
      for (const s of stars) {
        const px = s.x - plx.x * s.sp * 26;
        const py = ((s.y + sy * s.sp * 0.16) % (H + 12)) - 6;
        const tw = 0.72 + Math.sin(t * 2 + s.tw) * 0.28;
        ctx.globalAlpha = s.a * tw;
        if (s.li === 2) {
          /* stella vicina: sprite con alone (ex shadowBlur) */
          const ext = starGlow.EXT * (s.r / starGlow.R);
          ctx.drawImage(starGlow.cvs, px - ext, py - ext, ext * 2, ext * 2);
        } else {
          ctx.fillStyle = '#bfe9f5';
          ctx.beginPath();
          ctx.arc(px, py, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(loop);
    }
    loop();
  }

  /* ══════════════════════════════════════════════════════════
     LIVE TELEMETRY — il sistema è realmente operativo.
     Valori in lieve movimento continuo, mai statici.
  ══════════════════════════════════════════════════════════ */
  function initTelemetry() {
    const panel = document.getElementById('telemetry-panel');
    const q = k => panel ? panel.querySelector(`[data-tlm="${k}"]`) : null;
    const f = k => panel ? panel.querySelector(`[data-fill="${k}"]`) : null;
    const els = {
      signal: q('signal'), voice: q('voice'), mission: q('mission'),
      reactor: q('reactor'), comms: q('comms'), nav: q('nav'), health: q('health'),
      signalFill: f('signal'), reactorFill: f('reactor'),
    };
    const botSpans = document.querySelectorAll('.hud-bottombar > span');
    const topSpans = document.querySelectorAll('.hud-topbar > span');

    const PHASES = [
      'PHASE 01 — LAUNCH',
      'PHASE 02 — CREW LOG',
      'PHASE 03 — CARGO BAY',
      'PHASE 04 — DEEP SPACE',
      'PHASE 05 — BLACK BOX',
      'PHASE 06 — ARRIVAL',
    ];
    const SECT_IDS = ['#intro','#chi-sono','#progetti','#sinergia','#black-box','#fine'];

    // smooth-noise: ogni valore insegue un target che cambia lentamente
    const sm = { signal: 98.2, reactor: 94.1, comms: 1.24, tSignal: 98.2, tReactor: 94.1, tComms: 1.24 };
    setInterval(() => {
      sm.tSignal  = 95.5 + Math.random() * 4.3;
      sm.tReactor = 88.0 + Math.random() * 9.5;
      sm.tComms   = 1.05 + Math.random() * 0.42;
    }, 2400);

    function scrollPct() {
      return Math.min(1, (window.scrollY || 0) / docMaxScroll);
    }
    /* sezioni risolte una volta sola: niente querySelector ogni 140ms */
    const sectEls = SECT_IDS.map(s => document.querySelector(s)).filter(Boolean);
    function sectionIdx() {
      const pivot = window.scrollY + window.innerHeight * 0.35;
      let idx = 0;
      for (let i = 0; i < sectEls.length; i++) {
        if (sectEls[i].offsetTop <= pivot) idx = i;
      }
      return idx;
    }

    /* scrive il testo solo se è davvero cambiato: settare textContent
       identico sostituisce comunque il nodo di testo e sporca lo stile */
    const lastTxt = new Map();
    function setText(el, txt) {
      if (!el || lastTxt.get(el) === txt) return;
      lastTxt.set(el, txt);
      el.textContent = txt;
    }

    setInterval(() => {
      if (examActive || document.hidden) return;
      const p = scrollPct();

      sm.signal  += (sm.tSignal  - sm.signal)  * 0.12;
      sm.reactor += (sm.tReactor - sm.reactor) * 0.12;
      sm.comms   += (sm.tComms   - sm.comms)   * 0.12;

      setText(els.signal,  sm.signal.toFixed(1) + '%');
      setText(els.reactor, sm.reactor.toFixed(1) + '%');
      setText(els.comms,   sm.comms.toFixed(2) + ' Mb/s');
      if (els.signalFill)  els.signalFill.style.width  = sm.signal.toFixed(1) + '%';
      if (els.reactorFill) els.reactorFill.style.width = sm.reactor.toFixed(1) + '%';
      setText(els.nav, 'HDG ' + (118.4 + p * 203.8 + Math.sin(Date.now() * 0.0011) * 0.4).toFixed(1) + '°');
      /* offsetTop delle sezioni letto UNA volta per tick, non due */
      const phase = PHASES[sectionIdx()];
      setText(els.mission, phase);
      setText(examLabel, 'MISSION STATUS — ' + phase);
      if (els.voice) {
        const on = document.body.classList.contains('jarvis-on');
        setText(els.voice, on ? 'ONLINE' : 'STANDBY');
        els.voice.classList.toggle('tlm-on', on);
      }
      if (els.health) {
        const alert = document.body.classList.contains('hud-alert');
        setText(els.health, alert ? 'ASTROPHAGE ZONE' : 'NOMINAL');
        els.health.classList.toggle('tlm-ok', !alert);
      }

      // ── Navigazione di bordo: la Terra si allontana con lo scroll ──
      setText(botSpans[0], 'DIST: ' + (p * 11.93).toFixed(2) + ' AU');
      setText(botSpans[1], 'VEL: ' + (0.012 + p * 0.913).toFixed(3) + ' c');
      setText(botSpans[2], 'DEST: TAU CETI — ' + ((1 - p) * 100).toFixed(1) + '% REMAINING');
      setText(topSpans[2], 'MISSION: ' + (p * 100).toFixed(0) + '% — ONLINE');
    }, 140);
  }

  /* ══════════════════════════════════════════════════════════
     JARVIS — AVATAR OLOGRAFICO ("Jarvis, presentati")
     Sfera wireframe rotante + anelli orbitali + scan verticale.
  ══════════════════════════════════════════════════════════ */
  const JarvisAvatar = (() => {
    let raf = null, t = 0, visible = false, hideTimer = null;

    // ── Costellazione neurale: nodi su sfera di Fibonacci.
    //    Non uno strumento tecnico — un'intelligenza cosciente. ──
    const NODES = (() => {
      const N = 44, pts = [];
      const ga = Math.PI * (3 - Math.sqrt(5)); // angolo aureo
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = ga * i;
        pts.push({
          x: Math.cos(th) * r, y, z: Math.sin(th) * r,
          tw: Math.random() * Math.PI * 2,
          sp: 0.7 + Math.random() * 0.6,
        });
      }
      return pts;
    })();
    const synapses = []; // impulsi che viaggiano tra i nodi

    /* le distanze 3D fra i nodi sono COSTANTI: le coppie connesse
       (d3 < 0.64) si calcolano una sola volta, non 946 hypot/frame */
    const PAIRS = (() => {
      const arr = [];
      for (let i = 0; i < NODES.length; i++) {
        for (let j = i + 1; j < NODES.length; j++) {
          const a = NODES[i], b = NODES[j];
          const d3 = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          if (d3 < 0.64) arr.push([i, j, d3]);
        }
      }
      return arr;
    })();

    function draw(cvs, ctx) {
      const W = cvs.clientWidth, H = cvs.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (cvs.width !== Math.round(W * dpr)) {
        cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const breathe = 1 + Math.sin(t * 1.3) * 0.035; // respiro: presenza viva
      const R = Math.min(W, H) * 0.30 * breathe;

      // rotazione 3D lenta + inclinazione
      const ry = t * 0.42, tilt = 0.34;
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const proj = NODES.map(n => {
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;
        const y1 = n.y * cosT - z1 * sinT;
        const z2 = n.y * sinT + z1 * cosT;
        const p = 1 / (1.65 - z2 * 0.45);
        return {
          x: cx + x1 * R * p, y: cy + y1 * R * p,
          depth: (z2 + 1) / 2, n,
        };
      });

      // ── connessioni neurali (alpha per profondità, coppie precalcolate) ──
      for (const [i, j, d3] of PAIRS) {
        const pa = proj[i], pb = proj[j];
        const depth = (pa.depth + pb.depth) / 2;
        ctx.globalAlpha = (1 - d3 / 0.64) * (0.06 + depth * 0.26);
        ctx.strokeStyle = '#5fe6ff';
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // ── impulsi sinaptici: pensieri che attraversano la rete ──
      if (Math.random() < 0.05 && synapses.length < 5) {
        const i = (Math.random() * NODES.length) | 0;
        let best = -1, bd = 9;
        for (let j = 0; j < NODES.length; j++) {
          if (j === i) continue;
          const d = Math.hypot(NODES[i].x - NODES[j].x, NODES[i].y - NODES[j].y, NODES[i].z - NODES[j].z);
          if (d < bd && d < 0.8) { bd = d; best = j; }
        }
        if (best >= 0) synapses.push({ a: i, b: best, p: 0 });
      }
      for (let s = synapses.length - 1; s >= 0; s--) {
        const sy = synapses[s];
        sy.p += 0.035;
        if (sy.p >= 1) { synapses.splice(s, 1); continue; }
        const pa = proj[sy.a], pb = proj[sy.b];
        const px = pa.x + (pb.x - pa.x) * sy.p;
        const py = pa.y + (pb.y - pa.y) * sy.p;
        ctx.globalAlpha = Math.sin(sy.p * Math.PI) * 0.95;
        ctx.fillStyle = '#e6fbff';
        ctx.shadowColor = '#00f2fe'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(px, py, 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // ── nodi: stelle della costellazione, twinkle individuale ──
      for (const p of proj) {
        const tw = 0.7 + Math.sin(t * 2.4 * p.n.sp + p.n.tw) * 0.3;
        const r = (0.9 + p.depth * 1.8) * tw;
        ctx.globalAlpha = 0.22 + p.depth * 0.78;
        ctx.fillStyle = p.depth > 0.55 ? '#bef6ff' : '#5fc8e0';
        if (p.depth > 0.72) { ctx.shadowColor = '#00f2fe'; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // ── coscienza centrale: nucleo morbido che respira ──
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.50);
      g.addColorStop(0, 'rgba(170,246,255,0.34)');
      g.addColorStop(0.5, 'rgba(0,190,235,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.50, 0, Math.PI * 2); ctx.fill();

      // ── unico anello orbitale, discreto ──
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.34, R * 0.30, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,242,254,0.16)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -t * 22;
      ctx.stroke();
      ctx.restore();

      // ── scan olografico verticale, più lento e morbido ──
      const scanY = cy - R * 1.25 + ((t * 44) % (R * 2.5));
      const sg = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
      sg.addColorStop(0, 'rgba(0,242,254,0)');
      sg.addColorStop(0.5, 'rgba(0,242,254,0.10)');
      sg.addColorStop(1, 'rgba(0,242,254,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(cx - R * 1.55, scanY - 10, R * 3.1, 20);

      // ── flicker olografico raro e leggero ──
      if (Math.random() < 0.015) {
        ctx.fillStyle = 'rgba(0,242,254,0.035)';
        ctx.fillRect(0, Math.random() * H, W, 1.5);
      }
    }

    function show() {
      const ov = document.getElementById('jarvis-avatar');
      const cvs = document.getElementById('jv-holo');
      if (!ov || !cvs || visible) return;
      visible = true;
      clearTimeout(hideTimer);
      ov.classList.add('visible');
      ov.setAttribute('aria-hidden', 'false');
      Sfx.beep(520, 0.14, 0.05, 'sine');
      Sfx.beep(780, 0.16, 0.045, 'sine', 0.16);
      Sfx.beep(1040, 0.20, 0.04, 'sine', 0.34);
      const ctx = cvs.getContext('2d');
      (function loop() {
        if (!visible && !ov.classList.contains('visible')) return;
        t += 0.016;
        draw(cvs, ctx);
        raf = requestAnimationFrame(loop);
      })();
      // sicurezza: mai oltre 40s a schermo
      hideTimer = setTimeout(hide, 40000);
    }

    function hide() {
      const ov = document.getElementById('jarvis-avatar');
      if (!ov || !visible) return;
      visible = false;
      clearTimeout(hideTimer);
      Sfx.beep(740, 0.12, 0.035, 'sine');
      Sfx.beep(420, 0.18, 0.03, 'sine', 0.14);
      ov.classList.remove('visible');
      ov.setAttribute('aria-hidden', 'true');
      setTimeout(() => { if (!visible && raf) { cancelAnimationFrame(raf); raf = null; } }, 800);
    }

    return { show, hide };
  })();

  /* ══════════════════════════════════════════════════════════
     ROCKY — TRADUZIONE LINGUAGGIO ERIDIANO (easter egg)
     "Jarvis, chi è Rocky?" → tributo a Project Hail Mary.
  ══════════════════════════════════════════════════════════ */
  const RockyOverlay = (() => {
    let visible = false, raf = null, t = 0, hideTimer = null;
    let noteTimes = []; // timestamp delle note: l'onda "parla" in sincrono

    // accordi eridiani: Rocky "parla" in note
    const ERIDIAN_NOTES = [392.0, 466.2, 523.3, 587.3, 698.5, 784.0];

    function drawWave(cvs, ctx) {
      const W = cvs.clientWidth, H = cvs.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (cvs.width !== Math.round(W * dpr)) {
        cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cy = H / 2;

      // sincronizzazione audio/onda: ogni nota produce un picco di ampiezza
      const now = performance.now();
      let boost = 0;
      for (const nt of noteTimes) {
        const dt = (now - nt) / 1000;
        if (dt >= 0 && dt < 0.5) boost += Math.exp(-dt * 8) * 1.1;
      }
      const amp = (H * 0.22) * (1 + Math.min(boost, 1.4));

      // tre armoniche sovrapposte = "voce" eridiana
      for (let h = 0; h < 3; h++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 1.5) {
          const env = Math.pow(Math.sin((x / W) * Math.PI), 1.2);
          const y = cy +
            Math.sin(x * (0.035 + h * 0.018) + t * (2.2 + h)) *
            amp * env * (1 - h * 0.28);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,196,107,${0.55 - h * 0.16})`;
        ctx.lineWidth = 1.4 - h * 0.4;
        ctx.shadowColor = 'rgba(255,180,80,0.5)';
        ctx.shadowBlur = h === 0 ? 8 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    function show() {
      const ov = document.getElementById('rocky-overlay');
      const cvs = document.getElementById('rk-wave');
      if (!ov || visible) return;
      visible = true;
      clearTimeout(hideTimer);
      ov.classList.add('visible');
      ov.setAttribute('aria-hidden', 'false');

      // sequenza di note eridiane (pentatonica, mai invasiva)
      // + registrazione dei tempi: l'onda pulsa in sincrono con l'audio
      noteTimes = [];
      const t0 = performance.now();
      [0, 2, 4, 1, 5, 3].forEach((n, i) => {
        const delay = 0.25 + i * 0.22;
        Sfx.beep(ERIDIAN_NOTES[n], 0.18, 0.045, 'triangle', delay);
        noteTimes.push(t0 + delay * 1000);
      });

      // traduzione progressiva con scramble (anche queste note pulsano l'onda)
      const lines = ov.querySelectorAll('.rk-it');
      lines.forEach((el, i) => {
        el.textContent = '';
        const ms = 1100 + i * 1150;
        setTimeout(() => {
          new TextScramble(el).run(el.dataset.text || '');
          Sfx.beep(620 + i * 140, 0.07, 0.035, 'sine');
        }, ms);
        noteTimes.push(t0 + ms);
      });

      if (cvs) {
        const ctx = cvs.getContext('2d');
        (function loop() {
          if (!visible) return;
          t += 0.016;
          drawWave(cvs, ctx);
          raf = requestAnimationFrame(loop);
        })();
      }
      hideTimer = setTimeout(hide, 30000);
    }

    function hide() {
      const ov = document.getElementById('rocky-overlay');
      if (!ov || !visible) return;
      visible = false;
      clearTimeout(hideTimer);
      ov.classList.remove('visible');
      ov.setAttribute('aria-hidden', 'true');
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    return { show, hide };
  })();

  /* Hook console per demo senza microfono: HM_DEBUG.jarvis.show() / .rocky.show() */
  window.HM_DEBUG = { jarvis: JarvisAvatar, rocky: RockyOverlay };

  /* ══════════════════════════════════════════════════════════
     VOICE CONTROL — SpeechRecognition + Autodestruction
  ══════════════════════════════════════════════════════════ */
  function initVoiceControl() {
    /* SINGLETON: una sola istanza di SpeechRecognition per pagina.
       Se initVoiceControl venisse chiamata due volte (HMR, doppio
       listener, ecc.) la seconda esce subito — niente recognizer
       doppi, niente listener duplicati, niente comandi doppi. */
    if (window.__voiceCtrlInit) return;
    window.__voiceCtrlInit = true;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceStatus = document.getElementById('voice-status');
    const cmdPanel    = document.getElementById('voice-commands-panel');

    if (!SR) {
      if (voiceStatus) voiceStatus.textContent = '◈ VOICE CTRL: NOT SUPPORTED';
      return;
    }

    let systemActive  = false;
    const recognition = new SR();
    recognition.lang            = 'it-IT';
    recognition.continuous      = true;
    /* risultati intermedi ATTIVI: il comando scatta appena il motore
       lo riconosce, senza aspettare la finalizzazione della frase
       (taglia ~0.5–1.5s di latenza percepita su ogni comando) */
    recognition.interimResults  = true;
    recognition.maxAlternatives = 5;

    const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
    if (SGL) {
      const grammar = '#JSGF V1.0; grammar commands; public <command> = ' +
        'accenditi | jarvis accenditi | jarvis accensione | ' +
        'jarvis procedi | jarvis avanti | ' +
        'jarvis indietro | jarvis precedente | ' +
        'jarvis apri sezione uno | jarvis apri sezione due | jarvis apri sezione tre | ' +
        'jarvis apri progetto uno | jarvis apri progetto due | jarvis apri progetto tre | jarvis apri progetto quattro | ' +
        'jarvis prima foto | jarvis seconda foto | jarvis terza foto | ' +
        'jarvis immagine successiva | jarvis immagine precedente | ' +
        'jarvis chiudi | ' +
        'jarvis autodistruzione | ' +
        'jarvis presentati | jarvis spiega chi sei | ' +
        'jarvis chi è rocky | jarvis rocky | ' +
        'jarvis mostra progetti | jarvis sezione progetti | ' +
        'jarvis mostra visione | jarvis visione e portfolio | ' +
        'jarvis mostra struttura | jarvis codici | jarvis documentazione;';
      const list = new SGL();
      list.addFromString(grammar, 1);
      recognition.grammars = list;
    }

    let destroyed     = false;
    let isRunning     = false;
    let cmdCooldown   = false;
    let restartTimer  = null;
    let feedbackTimer = null;

    /* ── ANTI-DOPPIONE ────────────────────────────────────────────
       Due livelli di protezione contro l'esecuzione doppia:
         · cmdCooldown  — un comando QUALSIASI alla volta (gate breve)
         · lastAction   — lo STESSO comando viene ignorato se ripetuto
                          entro ACTION_COOLDOWN. Copre i casi reali in
                          cui un comando arriva due volte: interim +
                          final della stessa frase, callback duplicati
                          del motore, e ri-riconoscimento dell'audio
                          residuo dopo il riavvio di recognition (dove
                          il guard per-indice non basta perché la lista
                          risultati riparte da zero). */
    const GLOBAL_COOLDOWN = 900;   /* ms — un comando alla volta */
    const ACTION_COOLDOWN = 1500;  /* ms — stesso comando non si ripete */
    let lastAction   = null;
    let lastActionAt = 0;

    const SECTIONS = ['#intro','#chi-sono','#progetti','#sinergia','#black-box','#fine'];

    function getCurrentSectionIdx() {
      const pivot    = window.scrollY + window.innerHeight * 0.35;
      const sections = SECTIONS.map(s => document.querySelector(s)).filter(Boolean);
      let idx = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].offsetTop <= pivot) idx = i;
      }
      return idx;
    }

    function scrollToSection(idx) {
      const sections = SECTIONS.map(s => document.querySelector(s)).filter(Boolean);
      if (idx >= 0 && idx < sections.length) {
        sections[idx].scrollIntoView({ behavior:'smooth', block:'start' });
      }
    }

    function matchCommand(raw) {
      const t = raw.toLowerCase()
        .replace(/[.,!?;:'''`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const modalOpen = modalEl && modalEl.classList.contains('open');

      // Wake-up: requires both "jarvis" and an activation keyword
      if (t.includes('jarvis') && (t.includes('accenditi') || t.includes('accensione') || t.includes('attiviti'))) return 'accensione';

      // All other commands require "jarvis" prefix
      if (!t.includes('jarvis')) return null;

      // Autodistruzione first — deliberate but mic-tolerant
      if (t.includes('autodistruzione') || t.includes('distruzione') ||
          t.includes('distruggi')       || t.includes('destruct')    ||
          t.includes('attiva autodi'))  return 'autodistruzione';

      // Presentazione e navigazione avanzata
      if (t.includes('presentati') || t.includes('spiega chi sei'))                                     return 'presentati';
      if (t.includes('rocky') || t.includes('roki') || t.includes('rocchi'))                            return 'rocky';
      if (t.includes('mostra progetti') || t.includes('sezione progetti'))                               return 'mostra-progetti';
      if (t.includes('mostra visione')  || t.includes('visione e portfolio'))                            return 'mostra-visione';
      if (t.includes('mostra struttura') || t.includes('codici') || t.includes('documentazione'))        return 'mostra-struttura';

      // Tab sections — most specific first
      if (t.includes('sezione tre')   || t.includes('sezione 3') || t.includes('terza sezione'))   return 'sezione-3';
      if (t.includes('sezione due')   || t.includes('sezione 2') || t.includes('seconda sezione')) return 'sezione-2';
      if (t.includes('sezione uno')   || t.includes('sezione 1') || t.includes('prima sezione') ||
          t.includes('sezione prima')) return 'sezione-1';

      // Apri progetto — project name aliases included, most specific first
      if (t.includes('progetto') && (t.includes('quattro') || t.includes('4') || t.includes('new')))                          return 'apri-progetto-4';
      if (t.includes('progetto') && (t.includes('tre')     || t.includes('3') || t.includes('wild')))                         return 'apri-progetto-3';
      if (t.includes('progetto') && (t.includes('due')     || t.includes('2') || t.includes('black') || t.includes('reverie'))) return 'apri-progetto-2';
      if (t.includes('progetto') && (t.includes('uno')     || t.includes('1') || t.includes('lotus')))                        return 'apri-progetto-1';

      // Image navigation (modal-aware)
      if (t.includes('immagine') && (t.includes('successiva') || t.includes('prossima') || t.includes('avanti'))) return 'foto-next';
      if (t.includes('immagine') && (t.includes('precedente') || t.includes('indietro')))                         return 'foto-prev';

      // Foto absolute navigation — ordine decrescente per evitare collisioni
      if (t.includes('terza foto')  || t.includes('foto tre')  || t.includes('foto 3')) return 'foto-3';
      if (t.includes('seconda foto')|| t.includes('foto due')  || t.includes('foto 2')) return 'foto-2';
      if (t.includes('prima foto')  || t.includes('foto uno')  || t.includes('foto 1')) return 'foto-1';

      // Close modal
      if (t.includes('chiudi') || t.includes('esci') || t.includes('close') ||
          t.includes('nascondi') || t.includes('archivia')) return 'chiudi';

      // Page navigation — only outside modal
      if (!modalOpen) {
        if (t.includes('procedi') || t.includes('avanti') || t.includes('prossim')) return 'procedi';
        if (t.includes('indietro') || t.includes('precedente'))                      return 'indietro';
      }

      return null;
    }

    function flashStatus(text, color, ms) {
      if (!voiceStatus) return;
      clearTimeout(feedbackTimer);
      voiceStatus.textContent      = text;
      voiceStatus.style.color      = color;
      voiceStatus.style.textShadow = `0 0 8px ${color}99`;
      feedbackTimer = setTimeout(() => {
        if (systemActive) {
          voiceStatus.textContent      = 'JARVIS_SYSTEM: LISTENING_';
          voiceStatus.style.color      = '#39ff6e';
          voiceStatus.style.textShadow = '0 0 12px #39ff6e55';
        } else {
          voiceStatus.textContent      = 'JARVIS_SYSTEM: SLEEP_MODE [PRONUNCIA: JARVIS ACCENDITI]';
          voiceStatus.style.color      = '';
          voiceStatus.style.textShadow = '';
        }
      }, ms || 1800);
    }

    function executeCommand(action) {
      const now = Date.now();
      /* gate globale: un solo comando in esecuzione alla volta */
      if (cmdCooldown) return;
      /* gate per-comando: ignora la STESSA azione ripetuta entro la
         finestra (interim+final, callback doppi, riavvio recognition) */
      if (action === lastAction && (now - lastActionAt) < ACTION_COOLDOWN) return;
      if (action !== 'accensione' && !systemActive) return;

      lastAction = action; lastActionAt = now;
      cmdCooldown = true;
      setTimeout(() => { cmdCooldown = false; }, GLOBAL_COOLDOWN);

      switch (action) {
        case 'accensione':
          if (systemActive) break;
          systemActive = true;
          document.body.classList.add('jarvis-on');
          if (voiceStatus) {
            voiceStatus.textContent      = 'JARVIS_SYSTEM: LISTENING_';
            voiceStatus.style.color      = '#39ff6e';
            voiceStatus.style.textShadow = '0 0 12px #39ff6e';
          }
          bootFx.play().catch(() => {});
          bgMusic.play().catch(() => {});
          JarvisVoice.play('accensione');
          if (cmdPanel) cmdPanel.classList.add('visible');
          break;

        case 'procedi':
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('procedi');
          flashStatus('◉ PROCEDI', '#39ff6e', 1200);
          scrollToSection(Math.min(getCurrentSectionIdx() + 1, SECTIONS.length - 1));
          break;

        case 'indietro':
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('indietro');
          flashStatus('◉ INDIETRO', '#39ff6e', 1200);
          scrollToSection(Math.max(getCurrentSectionIdx() - 1, 0));
          break;

        case 'sezione-1':
        case 'sezione-2':
        case 'sezione-3': {
          const tabIdx = parseInt(action.split('-')[1], 10) - 1;
          const tabBtns = document.querySelectorAll('.tab-btn');
          if (tabBtns[tabIdx]) {
            tabBtns[tabIdx].click();
            const blackBox = document.getElementById('black-box');
            if (blackBox) blackBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('sezione');
          flashStatus(`◉ SEZIONE ${tabIdx + 1}`, '#39ff6e', 1200);
          break;
        }

        case 'apri-progetto-1':
        case 'apri-progetto-2':
        case 'apri-progetto-3':
        case 'apri-progetto-4': {
          const pIdx = parseInt(action.split('-')[2], 10) - 1;
          if (pIdx < PROJECTS.length) {
            openModal(PROJECTS[pIdx]);
            bootFx.currentTime = 0; bootFx.play().catch(() => {});
            JarvisVoice.play('progetto');
            flashStatus(`◉ PROGETTO ${pIdx + 1}`, '#39ff6e', 1400);
          } else {
            flashStatus(`? PROGETTO ${pIdx + 1} NON ESISTE`, '#ffaa00', 1800);
          }
          break;
        }

        case 'foto-next':
          if (modalCarousel && modalCarousel.next) {
            modalCarousel.next();
            uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
            JarvisVoice.play('foto');
            flashStatus('◉ IMMAGINE SUCCESSIVA', '#39ff6e', 1200);
          } else {
            flashStatus('? APRI UN PROGETTO PRIMA', '#ffaa00', 1800);
          }
          break;

        case 'foto-prev':
          if (modalCarousel && modalCarousel.prev) {
            modalCarousel.prev();
            uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
            JarvisVoice.play('foto');
            flashStatus('◉ IMMAGINE PRECEDENTE', '#39ff6e', 1200);
          } else {
            flashStatus('? APRI UN PROGETTO PRIMA', '#ffaa00', 1800);
          }
          break;

        case 'foto-1':
        case 'foto-2':
        case 'foto-3': {
          const fIdx = parseInt(action.split('-')[1], 10) - 1;
          if (modalCarousel) {
            modalCarousel.goTo(fIdx);
            uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
            JarvisVoice.play('foto');
            flashStatus(`◉ FOTO ${fIdx + 1}`, '#39ff6e', 1200);
          } else {
            flashStatus('? APRI UN PROGETTO PRIMA', '#ffaa00', 1800);
          }
          break;
        }

        case 'chiudi':
          closeModal();
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('chiudi');
          flashStatus('◉ CHIUDI', '#39ff6e', 1200);
          break;

        case 'presentati': {
          // Avatar olografico: oscuramento, comparsa wireframe, presentazione, dissolvenza
          JarvisAvatar.show();
          const clipP = JarvisVoice.play('presentati');
          const endP = () => setTimeout(() => JarvisAvatar.hide(), 900);
          if (clipP) { clipP.onended = endP; }
          else       { setTimeout(endP, 14000); }
          flashStatus('◉ JARVIS_SYSTEM: PRESENTAZIONE_', '#39ff6e', 5000);
          break;
        }

        case 'rocky': {
          // Easter egg — TRADUZIONE LINGUAGGIO ERIDIANO
          RockyOverlay.show();
          const clipR = JarvisVoice.play('rocky');
          const endR = () => setTimeout(() => RockyOverlay.hide(), 1600);
          if (clipR) { clipR.onended = endR; }
          else       { setTimeout(endR, 13000); }
          flashStatus('◉ ERIDIAN TRANSLATION ACTIVE_', '#ffc46b', 5000);
          break;
        }

        case 'mostra-progetti':
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('mostra_progetti');
          flashStatus('◉ NAVIGAZIONE: PROGETTI_', '#39ff6e', 1400);
          { const s = document.querySelector('#progetti'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          break;

        case 'mostra-visione':
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('mostra_visione');
          flashStatus('◉ NAVIGAZIONE: VISIONE_', '#39ff6e', 1400);
          { const s = document.querySelector('#sinergia'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          break;

        case 'mostra-struttura':
          uiClickFx.currentTime = 0; uiClickFx.play().catch(() => {});
          JarvisVoice.play('mostra_struttura');
          flashStatus('◉ NAVIGAZIONE: STRUTTURA_', '#39ff6e', 1400);
          {
            const bb = document.getElementById('black-box');
            if (bb) bb.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const tbBtns = document.querySelectorAll('.tab-btn');
            if (tbBtns[2]) tbBtns[2].click();
          }
          break;

        case 'autodistruzione':
          destroyed = true;
          isRunning  = false;
          document.body.classList.remove('jarvis-on');
          clearTimeout(restartTimer);
          recognition.stop();
          if (cmdPanel) cmdPanel.classList.remove('visible');
          if (voiceStatus) {
            clearTimeout(feedbackTimer);
            voiceStatus.textContent      = '◈ VOICE CTRL: TERMINATED';
            voiceStatus.style.color      = '';
            voiceStatus.style.textShadow = '';
          }
          {
            const clip = JarvisVoice.play('autodistruzione');
            const doDestruct = () => {
              bgMusic.pause();
              bgMusic.currentTime = 0;
              glitchFx.loop = true;
              glitchFx.play().catch(() => {});
              triggerAutodestruction();
            };
            if (clip) { clip.onended = doDestruct; }
            else      { doDestruct(); }
          }
          break;
      }
    }

    /* indice dell'ultima frase già eseguita: un comando scattato su
       un risultato intermedio NON viene rieseguito quando arriva il
       risultato finale della stessa frase */
    let executedUtterance = -1;

    recognition.onresult = event => {
      const idx    = event.results.length - 1;
      const result = event.results[idx];

      if (idx !== executedUtterance) {
        for (let i = 0; i < result.length; i++) {
          const action = matchCommand(result[i].transcript);
          if (action) { executedUtterance = idx; executeCommand(action); return; }
        }
      }

      if (!result.isFinal) return;
      const heard = result[0].transcript.trim();
      if (heard && systemActive && idx !== executedUtterance) flashStatus(`? ${heard.slice(0, 26)}`, '#ffaa00', 2200);
    };

    recognition.onend = () => {
      executedUtterance = -1; /* la lista risultati riparte da zero */
      if (!destroyed && isRunning) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          try { recognition.start(); } catch(_) {}
        }, 150);
      }
    };

    recognition.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'network') {
        if (voiceStatus && systemActive) flashStatus('◈ VOICE CTRL: NET ERR — RETRY', '#ff6060', 2500);
        if (!destroyed && isRunning) {
          clearTimeout(restartTimer);
          restartTimer = setTimeout(() => {
            try { recognition.start(); } catch(_) {}
          }, 2000);
        }
      }
    };

    function triggerAutodestruction() {
      const redOv = document.getElementById('autodestruct-red');
      const warn  = document.getElementById('hud-meltdown-warning');

      // ── FASE 1 — allarme: warning lampeggiante + pulsazione rossa ──
      if (warn)  warn.classList.add('active');
      if (redOv) redOv.classList.add('active');
      [0, 0.5, 1.0].forEach(d => Sfx.beep(180, 0.32, 0.055, 'sawtooth', d));

      // ── FASE 2 — collasso plancia: i pannelli cadono nello spazio ──
      setTimeout(() => {
        if (warn) warn.classList.remove('active');
        document.body.classList.add('page-imploding');
        Particles.overdrive();
      }, 1700);

      // ── FASE 3 — ologramma finale: MISSION COMPLETED ──
      setTimeout(() => {
        if (redOv) redOv.classList.remove('active');
        const hologram = document.getElementById('hologram-final');
        if (hologram) hologram.classList.add('visible');
      }, 3500);

      // ── FASE 4 — spegnimento: energia in calo, glitch in dissolvenza,
      //    oscuramento progressivo, poi silenzio assoluto ──
      setTimeout(() => {
        document.body.classList.add('mission-end');
        const fade = setInterval(() => {
          glitchFx.volume = Math.max(0, glitchFx.volume - 0.045);
          if (glitchFx.volume <= 0.01) {
            glitchFx.pause();
            glitchFx.loop = false;
            clearInterval(fade);
          }
        }, 200);
        setTimeout(() => {
          Particles.shutdown();
          const hf = document.getElementById('hologram-final');
          if (hf) hf.classList.add('calm');
          JarvisVoice.stop();
        }, 4500);
      }, 9000);
    }

    // Auto-start on page load
    window.addEventListener('load', () => {
      isRunning = true;
      try { recognition.start(); } catch(_) {}
    });
  }

  /* ══════════════════════════════════════════════════════════
     TAB INTERFACE — Black Box
  ══════════════════════════════════════════════════════════ */
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false');});
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.add('hidden'));
        btn.classList.add('active'); btn.setAttribute('aria-selected','true');
        const panel = document.getElementById('tab-'+target);
        if(panel) panel.classList.remove('hidden');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     HUD CLOCK
  ══════════════════════════════════════════════════════════ */
  function tickClock(){
    const el=document.getElementById('hud-time'); if(!el)return;
    const n=new Date();
    el.textContent=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  }

  /* ══════════════════════════════════════════════════════════
     FADE-IN OBSERVER
  ══════════════════════════════════════════════════════════ */
  function initFadeObserver(){
    const obs=new IntersectionObserver(
      entries=>entries.forEach(e=>{ if(e.isIntersecting)e.target.classList.add('visible'); }),
      {threshold:0.09}
    );
    document.querySelectorAll('.fade-in-section').forEach(el=>obs.observe(el));
  }

  /* ══════════════════════════════════════════════════════════
     MK7 — PHYSICAL LIQUID GLASS ENGINE
     Ogni pannello è un oggetto ottico reale. Due sistemi:

     1) ANGOLO DI VISTA — il puntatore non è una torcia: inclina la
        sorgente di luce virtuale. Ogni pannello riceve l'ANGOLO di
        incidenza (--lga, in gradi) e la risposta fresnel (--lgi);
        i lobi conici CSS (.lg-edge/.lg-chroma) viaggiano lungo il
        perimetro e gli angoli curvi, il glint (--lgx/--lgy) segue
        lo spigolo più esposto.

     2) CAMPIONAMENTO AMBIENTE — la scena reale (bg-canvas con i
        frame astrofagi + starfield con le nebulose) viene ridotta
        in un sampler 64×36; ogni pannello legge il colore PER LATO
        (--lg-et/-er/-eb/-el) e la media (--lg-env): nebulosa verde
        sopra → spigolo superiore verde, particelle rosse a destra
        → riflesso rosso sul fianco destro. Il materiale reagisce
        davvero all'ambiente, non lo simula.
  ══════════════════════════════════════════════════════════ */
  function initLiquidGlass() {

    /* pannelli principali: tutti i layer. Sotto-pannelli: solo luce
       (la rifrazione di bordo annidata costerebbe troppo in GPU). */
    const MAIN = '.hud-frame,.projects-wrapper,.tab-content,.footer-panel,#telemetry-panel,#voice-commands-panel,.ld-body,.dcy-box,.rk-box';
    const SUB  = '.project-card,.rocky-widget';
    const panels = [];

    document.querySelectorAll(MAIN + ',' + SUB).forEach((el, i) => {
      /* vetro fotocromatico: strato sotto il contenuto (z -1) che si
         scurisce solo quanto serve quando la scena dietro è accecante */
      const shade = document.createElement('div');
      shade.className = 'lg-shade';
      shade.setAttribute('aria-hidden', 'true');
      el.appendChild(shade);

      const optics = document.createElement('div');
      optics.className = 'lg-optics';
      optics.setAttribute('aria-hidden', 'true');
      optics.innerHTML =
        (el.matches(MAIN) ? '<div class="lg-refract"></div>' : '') +
        '<div class="lg-glow"></div>' +
        '<div class="lg-tint"></div>' +
        '<div class="lg-streak" style="animation-delay:' + (i * 1.35).toFixed(2) + 's"></div>' +
        '<div class="lg-edge"></div><div class="lg-chroma"></div><div class="lg-glint"></div>';
      el.appendChild(optics);
      panels.push({
        el, lx: -999, ly: -999, ang: 0,
        /* colore ambiente per lato (t/r/b/l) + media — smussati nel tempo */
        et: [120, 190, 235], er: [120, 190, 235],
        eb: [120, 190, 235], el_: [120, 190, 235],
        ea: [120, 190, 235], lum: 0,
      });
    });
    if (!panels.length || reducedMotion) return; // vetro statico, niente luce mobile

    const light = {
      x: innerWidth * 0.5, y: innerHeight * 0.2,
      tx: innerWidth * 0.5, ty: innerHeight * 0.2,
    };
    let hasPointer = false, t = 0;
    let lastY = window.scrollY || 0, scrollV = 0;

    /* LAPTOP: i riflessi NON sono guidati dal mouse — la sorgente di
       luce orbita lentamente da sola (vedi ramo !hasPointer più sotto),
       evitando letture/scritture a ogni movimento del puntatore */
    window.addEventListener('pointermove', e => {
      if (!GFX.fx.parallax) return;
      light.tx = e.clientX; light.ty = e.clientY; hasPointer = true;
    }, { passive: true });

    /* ── sampler ambientale: la scena dietro il vetro, in miniatura ── */
    const bgCv = document.getElementById('bg-canvas');
    const sfCv = document.getElementById('starfield-canvas');
    const SW = 64, SH = 36;
    const smp = document.createElement('canvas');
    smp.width = SW; smp.height = SH;
    const sctx = smp.getContext('2d', { willReadFrequently: true });
    let envData = null, envOk = true, bgTainted = false;

    function sampleEnvironment() {
      if (!envOk) return;
      try {
        sctx.globalCompositeOperation = 'source-over';
        sctx.fillStyle = '#020610';
        sctx.fillRect(0, 0, SW, SH);
        if (!bgTainted && bgCv && bgCv.width) sctx.drawImage(bgCv, 0, 0, SW, SH);
        if (sfCv && sfCv.width) {
          sctx.globalCompositeOperation = 'screen';
          sctx.drawImage(sfCv, 0, 0, SW, SH);
          sctx.globalCompositeOperation = 'source-over';
        }
        envData = sctx.getImageData(0, 0, SW, SH).data;
      } catch (e) {
        /* canvas contaminato (apertura via file://): riprova senza i
           frame; se fallisce ancora, il vetro resta sul ciano base */
        if (!bgTainted) { bgTainted = true; sampleEnvironment(); }
        else { envOk = false; envData = null; }
      }
    }

    /* lettura di un punto del sampler (coordinate schermo) */
    function readPx(x, y) {
      const sx = Math.max(0, Math.min(SW - 1, Math.round(x / innerWidth  * SW)));
      const sy = Math.max(0, Math.min(SH - 1, Math.round(y / innerHeight * SH)));
      const i = (sy * SW + sx) * 4;
      return [envData[i], envData[i + 1], envData[i + 2]];
    }

    /* il vetro raccoglie e intensifica la dominante reale; al buio
       resta su una base fredda quasi neutra (ossidiana, non ciano) */
    function amplify(R, G, B) {
      const mx = Math.max(R, G, B, 1);
      const k  = Math.min(4.2, 235 / mx);
      const w  = Math.min(1, mx / 48);   // quanta scena c'è davvero dietro
      return [
        R * k * w + 120 * (1 - w),
        G * k * w + 190 * (1 - w),
        B * k * w + 235 * (1 - w),
      ];
    }

    /* colore campionato LUNGO ogni bordo del pannello: 3 punti per
       lato. Una nebulosa verde sopra il pannello tinge solo il bordo
       superiore; particelle rosse a destra, solo il bordo destro. */
    function envEdgesFor(r) {
      const xs = [r.left + r.width * 0.18, r.left + r.width * 0.5, r.left + r.width * 0.82];
      const ys = [r.top + r.height * 0.18, r.top + r.height * 0.5, r.top + r.height * 0.82];
      function edge(pts) {
        let R = 0, G = 0, B = 0;
        for (const pt of pts) { const c = readPx(pt[0], pt[1]); R += c[0]; G += c[1]; B += c[2]; }
        return [R / pts.length, G / pts.length, B / pts.length];
      }
      const t  = edge(xs.map(x => [x, r.top]));
      const b  = edge(xs.map(x => [x, r.bottom]));
      const l  = edge(ys.map(y => [r.left,  y]));
      const rr = edge(ys.map(y => [r.right, y]));
      const avg = [
        (t[0] + b[0] + l[0] + rr[0]) / 4,
        (t[1] + b[1] + l[1] + rr[1]) / 4,
        (t[2] + b[2] + l[2] + rr[2]) / 4,
      ];
      // luminanza percepita della scena retrostante (0..1)
      const lum = (0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]) / 255;
      return {
        t: amplify(t[0], t[1], t[2]),
        r: amplify(rr[0], rr[1], rr[2]),
        b: amplify(b[0], b[1], b[2]),
        l: amplify(l[0], l[1], l[2]),
        a: amplify(avg[0], avg[1], avg[2]),
        lum,
      };
    }

    /* inseguimento morbido di una terna RGB (il vetro assorbe, non scatta) */
    function chase(cur, target, k) {
      cur[0] += (target[0] - cur[0]) * k;
      cur[1] += (target[1] - cur[1]) * k;
      cur[2] += (target[2] - cur[2]) * k;
      return (cur[0] | 0) + ',' + (cur[1] | 0) + ',' + (cur[2] | 0);
    }

    /* ── CADENZA RIFLESSI — mai a 60fps ───────────────────────────
       Un tick ogni ~80ms (≈12 aggiornamenti/s, nel target 10-15;
       il governor allunga il passo sotto sforzo). Letture di layout,
       campionamento e scritture CSS avvengono SOLO al tick; le
       inerzie sono riparametrate sul tempo reale trascorso (dt):
       la velocità di convergenza al secondo — quindi la resa
       visiva — è identica, con ~1/5 del costo di stile e paint. */
    const TICK_MS = [80, 110, 145];               /* per PERF.tier 0/1/2 */
    const kdt = (k60, dt) => 1 - Math.pow(1 - k60, dt * 60);
    let lastTick = 0, sampleFlip = false;

    function frame(now) {
      requestAnimationFrame(frame);
      /* profilo PERFORMANCE: riflessi dinamici spenti (il CSS nasconde
         i layer ottici) — il loop resta armato per il rientro live */
      if (!GFX.fx.reflections) return;
      /* nei profili ridotti la cadenza minima sale (aggiornamenti
         riflessi più rari = meno style/paint), resa quasi identica */
      if (now - lastTick < Math.max(TICK_MS[PERF.tier], GFX.fx.glassTickMin)) return;
      const dt = lastTick ? Math.min(0.3, (now - lastTick) / 1000) : 0.08;
      lastTick = now;
      t += dt;

      const sy = window.scrollY || 0;
      /* velocità di scroll smussata, normalizzata alla scala
         per-frame-60 usata dal vecchio loop */
      scrollV += ((sy - lastY) / Math.max(1, dt * 60) - scrollV) * kdt(0.14, dt);
      lastY = sy;

      // senza puntatore (touch): la luce orbita lentamente da sola
      if (!hasPointer) {
        light.tx = innerWidth  * (0.5  + Math.sin(t * 0.22) * 0.34);
        light.ty = innerHeight * (0.24 + Math.cos(t * 0.16) * 0.20);
      }
      const kL = kdt(0.082, dt);
      light.x += (light.tx - light.x) * kL;
      light.y += (light.ty - scrollV * 2.6 - light.y) * kL;

      /* dietro il modal a tutto schermo o in exam mode i pannelli
         non si vedono: niente campionamento, letture o scritture */
      if (uiModalOpen || document.body.classList.contains('exam-mode')) return;

      /* UN campionamento condiviso ogni due tick (~6/s): tutti i
         pannelli leggono lo STESSO buffer envData — mai un sampler
         a testa, mai due letture dello stesso valore */
      sampleFlip = !sampleFlip;
      if (sampleFlip && GFX.fx.colorSampling) sampleEnvironment();

      const vh = innerHeight;
      /* Il puntatore NON posiziona il riflesso: inclina la sorgente.
         nx,ny ∈ -1..1 sono l'angolo della luce virtuale — muovere il
         mouse equivale a ruotare leggermente l'oggetto sotto la luce. */
      const nx = (light.x / innerWidth)  * 2 - 1;
      const ny = (light.y / innerHeight) * 2 - 1;
      /* FASE 1 — tutte le LETTURE di layout in blocco: mai
         intercalate con le scritture (addio layout-thrashing) */
      const rects = new Array(panels.length);
      for (let i = 0; i < panels.length; i++) {
        const r = panels[i].el.getBoundingClientRect();
        rects[i] = (!r.width || r.bottom < -120 || r.top > vh + 120) ? null : r;
      }
      /* FASE 2 — calcoli e SCRITTURE */
      const kAng = kdt(0.16, dt);
      const kEnv = kdt(0.055, dt);
      const kLum = kdt(0.05, dt);
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const r = rects[i];
        /* pannello fuori viewport: ferma anche la lama in transito
           (.lg-streak) — riparte identica quando torna visibile */
        p.el.classList.toggle('lg-off', !r);
        if (!r) continue;
        /* direzione della luce vista da QUESTO pannello: angolo
           globale + prospettiva data dalla posizione a schermo
           (pannelli a destra ricevono luce da alto-sinistra, ecc.) */
        const ox = (r.left + r.width  / 2) / innerWidth  * 2 - 1;
        const oy = (r.top  + r.height / 2) / innerHeight * 2 - 1;
        const dx = nx * 0.85 - ox * 0.30;
        const dy = (-0.62 + ny * 0.80) - oy * 0.22;
        /* ANGOLO DI INCIDENZA: il riflesso non è un punto che insegue
           il cursore ma un angolo — il CSS lo proietta come lobo
           conico che VIAGGIA lungo il perimetro e gli angoli curvi */
        let ang = Math.atan2(dx, -dy) * 57.29578;       // 0° = bordo sup., orario
        let da = ang - p.ang;
        while (da >  180) da -= 360;
        while (da < -180) da += 360;
        p.ang += da * kAng;                              // inerzia angolare del riflesso
        /* proiezione sul PERIMETRO per il glint puntiforme */
        const mg = Math.max(Math.abs(dx), Math.abs(dy), 0.0001);
        const lx = 50 + (dx / mg) * 50;
        const ly = 50 + (dy / mg) * 50;
        /* FRESNEL: quanto il pannello è "esposto" all'angolo di
           luce (incidenza radente = bordo più carico), non quanto
           è vicino al cursore */
        const inten = Math.max(0.30, Math.min(1, 0.38 + Math.hypot(dx, dy) * 0.55));
        if (Math.abs(lx - p.lx) > 0.25 || Math.abs(ly - p.ly) > 0.25 || Math.abs(da) > 0.2) {
          p.lx = lx; p.ly = ly;
          p.el.style.setProperty('--lga', p.ang.toFixed(2));
          p.el.style.setProperty('--lgx', lx.toFixed(2));
          p.el.style.setProperty('--lgy', ly.toFixed(2));
          p.el.style.setProperty('--lgi', inten.toFixed(3));
        }
        if (envData && GFX.fx.colorSampling) {
          const c = envEdgesFor(r);
          /* scrivi la variabile SOLO se il colore (troncato a interi)
             è cambiato: a convergenza il costo scende a zero */
          const sEt = chase(p.et,  c.t, kEnv);
          const sEr = chase(p.er,  c.r, kEnv);
          const sEb = chase(p.eb,  c.b, kEnv);
          const sEl = chase(p.el_, c.l, kEnv);
          const sEa = chase(p.ea,  c.a, kEnv);
          if (sEt !== p.vEt) { p.vEt = sEt; p.el.style.setProperty('--lg-et',  sEt); }
          if (sEr !== p.vEr) { p.vEr = sEr; p.el.style.setProperty('--lg-er',  sEr); }
          if (sEb !== p.vEb) { p.vEb = sEb; p.el.style.setProperty('--lg-eb',  sEb); }
          if (sEl !== p.vEl) { p.vEl = sEl; p.el.style.setProperty('--lg-el',  sEl); }
          if (sEa !== p.vEa) { p.vEa = sEa; p.el.style.setProperty('--lg-env', sEa); }
          // risposta fotocromatica: scena accecante → vetro più denso
          const targetLum = Math.min(1, Math.max(0, (c.lum - 0.07) * 2.1));
          p.lum += (targetLum - p.lum) * kLum;
          const sLum = p.lum.toFixed(3);
          if (sLum !== p.vLum) { p.vLum = sLum; p.el.style.setProperty('--lg-lum', sLum); }
        }
      }
    }

    /* cambio profilo: senza campionamento i pannelli rientrano sulla
       base neutra fissa (rimozione variabili → fallback CSS LAPTOP) */
    GFX.on(() => {
      /* riflessi non più guidati dal mouse: la luce torna a orbitare
         da sola al primo tick utile invece di restare ferma sul cursore */
      if (!GFX.fx.parallax) hasPointer = false;
      if (GFX.fx.colorSampling) return;
      envData = null;
      for (const p of panels) {
        p.et  = [120, 190, 235]; p.er = [120, 190, 235];
        p.eb  = [120, 190, 235]; p.el_ = [120, 190, 235];
        p.ea  = [120, 190, 235]; p.lum = 0;
        p.vEt = p.vEr = p.vEb = p.vEl = p.vEa = p.vLum = undefined;
        ['--lg-et', '--lg-er', '--lg-eb', '--lg-el', '--lg-env', '--lg-lum']
          .forEach(v => p.el.style.removeProperty(v));
      }
    });
    requestAnimationFrame(frame);
  }

  /* ══════════════════════════════════════════════════════════
     JARVIS SETTINGS — GRAPHICS PROFILE PANEL
     Selettore ULTRA / LAPTOP: cambio profilo all'istante, la
     scelta persiste in localStorage (hm-gfx-profile) e il
     profilo attivo è sempre mostrato in fondo al pannello.
  ══════════════════════════════════════════════════════════ */
  function initGfxSettings() {
    const root  = document.getElementById('gfx-settings');
    const tgl   = document.getElementById('gfx-toggle');
    const panel = document.getElementById('gfx-panel');
    if (!root || !tgl || !panel) return;
    const opts  = panel.querySelectorAll('[data-gfx-opt]');
    const state = document.getElementById('gfx-active-label');

    function sync() {
      opts.forEach(b => {
        const on = b.getAttribute('data-gfx-opt') === GFX.selected;
        b.classList.toggle('gfx-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      if (state) state.textContent = 'ACTIVE: ' + GFX.active.toUpperCase();
    }

    function setOpen(open) {
      root.classList.toggle('gfx-open', open);
      tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    tgl.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!root.classList.contains('gfx-open'));
      Sfx.beep(980, 0.06, 0.04);
    });
    opts.forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      GFX.select(b.getAttribute('data-gfx-opt'));
      Sfx.beep(1240, 0.07, 0.045);
      sync();
    }));
    document.addEventListener('click', e => {
      if (!root.contains(e.target)) setOpen(false);
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') setOpen(false);
    });

    GFX.on(sync);   /* in AUTO il profilo effettivo può cambiare live */
    sync();
  }

  /* ══════════════════════════════════════════════════════════
     SMOOTH WHEEL SCROLL — coalescenza + interpolazione per frame

     Il problema storico (vedi nota in style.css): scroll-behavior:smooth
     faceva passare OGNI delta di rotella attraverso l'easing di Chrome →
     doppio smoothing = lag. Qui il rimedio è opposto e corretto:

       · gli eventi wheel NON scrollano direttamente: accumulano un
         bersaglio (targetY), in PIXEL, senza alcun fattore di riduzione
         → la distanza per gesto resta IDENTICA al nativo (stessa
         velocità di scorrimento, nessun rallentamento);
       · un SINGOLO requestAnimationFrame interpola currentY → targetY e
         chiama scrollTo UNA volta per frame, mai per evento → niente
         repaint multipli per frame, niente jank;
       · ad inerzia esaurita il loop si ferma (zero costo a riposo).

     Tutti i sottosistemi leggono window.scrollY: pilotando lo scroll
     reale via scrollTo, restano sincronizzati senza modifiche.
  ══════════════════════════════════════════════════════════ */
  function initSmoothWheel() {
    if (!window.matchMedia) return;
    /* accessibilità: chi chiede meno movimento tiene lo scroll nativo */
    if (reducedMotion) return;
    /* touch/penna: lo scroll a dito ha già momentum nativo ottimale —
       intercettiamo solo i puntatori fini (mouse/trackpad) */
    if (window.matchMedia('(hover: none)').matches) return;

    let targetY  = window.scrollY || 0;
    let currentY = targetY;
    let running  = false;

    const maxScroll = () => Math.max(0,
      (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);

    /* delta di linea/pagina (mouse a rotella) → pixel, come il browser */
    function deltaPixels(e) {
      if (e.deltaMode === 1) return e.deltaY * 16;                 // DOM_DELTA_LINE
      if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // DOM_DELTA_PAGE
      return e.deltaY;                                             // DOM_DELTA_PIXEL
    }

    /* l'evento cade dentro un contenitore con scroll proprio (modal-info,
       blocco codice…) che può ancora scorrere nella direzione richiesta?
       In tal caso lasciamo fare al nativo: niente hijack del wheel. */
    function inScrollable(node, dir) {
      for (let el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        if (!(el instanceof Element)) continue;
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
          const atTop = el.scrollTop <= 0;
          const atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if (!((dir < 0 && atTop) || (dir > 0 && atBot))) return true;
        }
      }
      return false;
    }

    function frame() {
      /* interpolazione esponenziale: rapida ma morbida (~200ms a regime).
         Tracking stretto col trackpad (gap piccolo, sensazione 1:1),
         easing percepibile sul singolo "notch" di rotella = cinematico. */
      currentY += (targetY - currentY) * 0.18;
      if (Math.abs(targetY - currentY) < 0.5) {
        currentY = targetY;
        window.scrollTo(0, currentY);
        running = false;            // bersaglio raggiunto: loop a riposo
        return;
      }
      window.scrollTo(0, currentY);
      requestAnimationFrame(frame);
    }

    window.addEventListener('wheel', e => {
      if (e.ctrlKey) return;                          // pinch-zoom: non toccare
      if (inScrollable(e.target, e.deltaY)) return;   // scroll interno nativo
      e.preventDefault();
      /* a loop fermo, riallinea al punto reale: copre scroll programmatici
         intercorsi (scrollIntoview di voce/àncore, tastiera, drag) */
      if (!running) currentY = targetY = window.scrollY || 0;
      targetY = Math.max(0, Math.min(maxScroll(), targetY + deltaPixels(e)));
      if (!running) { running = true; requestAnimationFrame(frame); }
    }, { passive: false });
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    resizeBg();
    preloadFrames();
    startLoader();
    initEarthCover();
    initFooterCinematic();
    renderProjectCards();
    initNeuralNetwork();
    initRockyTranslator();
    initRockyKnob();
    Particles.init();
    initStarfield();
    initTelemetry();
    initVoiceControl();
    initTabs();
    initFadeObserver();
    initLiquidGlass();
    initGfxSettings();
    initSmoothWheel();
    tickClock();
    setInterval(tickClock, 1000);

    // Initial HUD phase
    updateHudPhase();

    // Text scramble — dopo loader
    const nameEl   = document.getElementById('scramble-name');
    const schoolEl = document.getElementById('scramble-school');
    if (nameEl && schoolEl) {
      const ns=new TextScramble(nameEl), ss=new TextScramble(schoolEl);
      nameEl.textContent=''; schoolEl.textContent='';
      setTimeout(()=>{
        // Massive RGB channel split burst
        nameEl.classList.add('glitch-burst');
        setTimeout(()=>nameEl.classList.remove('glitch-burst'), 1500);
        ns.run('PELLEGRINO FRANCESCO').then(()=>{
          setTimeout(()=>ss.run('IIS CARLO URBANI — GRAFICA PUBBLICITARIA'),180);
        });
      }, 3400);
    }

    // Global click sound for interactive elements
    document.addEventListener('click', e => {
      Sfx.ensure(); // sblocca AudioContext al primo gesto utente
      const target = e.target;
      const interactive = target.closest('button, a, [role="button"], [tabindex]');
      if (interactive) playClickSfx();
    });

    // Smooth anchor scroll
    document.querySelectorAll('a[href^="#"]').forEach(a=>{
      a.addEventListener('click',e=>{
        const t=document.querySelector(a.getAttribute('href'));
        if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});}
      });
    });
  });

})();
