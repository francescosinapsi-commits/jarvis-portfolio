/* ════════════════════════════════════════════════════════════
   JARVIS CINEMATIC BOOT SEQUENCE V2 — controller ISOLATO
   ────────────────────────────────────────────────────────────
   NON contiene logica vocale: OSSERVA soltanto.
     • Attende la fine del LOADING SCREEN esistente (#loader),
       poi rivela lo standby JARVIS con la sua atmosfera.
     • Quando il sistema vocale esistente attiva JARVIS
       (classe `jarvis-on` sul <body>, settata da
       executeCommand('accensione') in script.js) esegue il boot
       cinematico + messaggio pre-launch e rimuove il layer.

   Nessuna modifica a scroll, responsive, preset, performance,
   sistema vocale, comandi, navigazione o animazioni esistenti.
   Il layer è completamente rimovibile (display:none a fine boot).
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function init() {
    var standby = document.getElementById('jarvis-standby');
    if (!standby) return;

    var statusVal = document.getElementById('jsb-status');
    var ignited = false, shown = false;

    /* ── micro particelle lentissime (CSS-driven, nessun loop JS) ── */
    var pc = standby.querySelector('.jsb-particles');
    if (pc) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < 16; i++) {
        var p = document.createElement('span');
        p.className = 'jsb-particle';
        var sz = (Math.random() * 1.6 + 0.6).toFixed(2);
        p.style.left = (Math.random() * 100).toFixed(2) + '%';
        p.style.top  = (Math.random() * 100).toFixed(2) + '%';
        p.style.width = sz + 'px';
        p.style.height = sz + 'px';
        p.style.setProperty('--dx', ((Math.random() * 2 - 1) * 42).toFixed(1) + 'px');
        p.style.setProperty('--dy', ((Math.random() * 2 - 1) * 42).toFixed(1) + 'px');
        p.style.animationDuration = (Math.random() * 26 + 34).toFixed(1) + 's';
        p.style.animationDelay = (-Math.random() * 50).toFixed(1) + 's';
        p.style.opacity = (Math.random() * 0.35 + 0.12).toFixed(2);
        frag.appendChild(p);
      }
      pc.appendChild(frag);
    }

    /* ── HUM elettronico ambientale — best-effort, isolato ──
       AudioContext autonomo (non tocca l'audio del portfolio).
       Per le policy di autoplay parte solo dopo un gesto utente;
       viene spento PRIMA dell'ingresso nel portfolio. */
    var humCtx = null, humMaster = null;
    function startHum() {
      if (ignited) return;            /* mai riavviare l'hum dopo il boot */
      if (humCtx) { if (humCtx.state === 'suspended') humCtx.resume().catch(function(){}); return; }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        humCtx = new AC();
        humMaster = humCtx.createGain();
        humMaster.gain.value = 0.0001;
        humMaster.connect(humCtx.destination);

        function osc(freq, type, g) {
          var o = humCtx.createOscillator(), og = humCtx.createGain();
          o.type = type; o.frequency.value = freq; og.gain.value = g;
          o.connect(og); og.connect(humMaster); o.start();
          return og;
        }
        osc(58, 'sine', 0.6);
        osc(87, 'sine', 0.22);
        var sub = osc(116, 'triangle', 0.06);

        /* leggerissima "vita": LFO sulla gain di un singolo oscillatore */
        var lfo = humCtx.createOscillator(), lg = humCtx.createGain();
        lfo.frequency.value = 0.1; lg.gain.value = 0.03;
        lfo.connect(lg); lg.connect(sub.gain); lfo.start();

        /* fade-in lentissimo a volume bassissimo (più percepito che udito) */
        humMaster.gain.setTargetAtTime(0.016, humCtx.currentTime, 2.0);
        if (humCtx.state === 'suspended') humCtx.resume().catch(function(){});
      } catch (_) { humCtx = null; }
    }
    function stopHum() {
      if (!humCtx) return;
      try {
        humMaster.gain.setTargetAtTime(0.00001, humCtx.currentTime, 0.25);
        var c = humCtx; humCtx = null;
        setTimeout(function () { try { c.close(); } catch (_) {} }, 600);
      } catch (_) {}
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, startHum, { passive: true });
    });
    startHum(); /* tentativo immediato (sbloccato dal gesto se necessario) */

    /* ── reveal dello standby DOPO il loading screen esistente ── */
    function showStandby() {
      if (shown) return;
      shown = true;
      standby.classList.add('boot-ready');
    }
    var loader = document.getElementById('loader');
    if (loader && !loader.classList.contains('done')) {
      var lObs = new MutationObserver(function () {
        if (loader.classList.contains('imploding') || loader.classList.contains('done')) {
          lObs.disconnect();
          showStandby();
        }
      });
      lObs.observe(loader, { attributes: true, attributeFilter: ['class'] });
      setTimeout(showStandby, 5000); /* fallback difensivo se il loader non implode */
    } else {
      showStandby();
    }

    /* ── BOOT CINEMATICO — innescato SOLO dal sistema vocale esistente ── */
    function ignite() {
      if (ignited) return;
      ignited = true;
      if (bodyObs) bodyObs.disconnect();
      showStandby();
      stopHum(); /* lascia pulita la risposta vocale di JARVIS */

      /* il loader VisionOS, se ancora attivo dietro, viene chiuso */
      var loaderEl = document.getElementById('loader');
      if (loaderEl) loaderEl.classList.add('imploding', 'done');

      /* STANDBY → ONLINE */
      if (statusVal) {
        statusVal.textContent = 'ONLINE';
        statusVal.classList.add('online');
      }

      /* pulse centrale + accensione HUD + coordinate + indicatori +
         voice control + attivazione interfaccia (staggered via CSS) */
      standby.classList.add('igniting');

      /* messaggio pre-launch (SYSTEMS ONLINE / … / WELCOME ABOARD) */
      setTimeout(function () { standby.classList.add('prelaunch'); }, 2200);

      /* reveal nebulosa → ingresso portfolio */
      setTimeout(function () { standby.classList.add('boot-hidden'); }, 3250);
      setTimeout(function () {
        standby.classList.add('boot-removed');
        standby.setAttribute('aria-hidden', 'true');
      }, 4350);
    }

    var bodyObs = new MutationObserver(function () {
      if (document.body.classList.contains('jarvis-on')) ignite();
    });
    bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (document.body.classList.contains('jarvis-on')) ignite();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
