/* ==========================================================================
   Contador de visitas propio (sin cookies ni Google Analytics).
   Envía a /api/visita: la página, de dónde llegó la persona y los clics en
   WhatsApp, Instagram, Facebook, teléfono y mapa. El navegador guarda solo un
   número al azar ("erb-v") para saber si la persona ya había venido antes.
   Para que tus propias visitas no cuenten: panel → Tráfico → "No contar mis visitas".
   ========================================================================== */
(function () {
  "use strict";
  if (location.protocol === "file:" || /^(localhost|127\.|192\.168\.)/.test(location.hostname)) return;
  var guardar = function (st, k, v) { try { st.setItem(k, v); } catch (_) {} };
  var leer = function (st, k) { try { return st.getItem(k) || ""; } catch (_) { return ""; } };
  if (leer(localStorage, "erb-no-contar")) return;

  var azar = function () { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20); };
  var visitante = leer(localStorage, "erb-v");
  var nuevo = !visitante;
  if (nuevo) { visitante = azar(); guardar(localStorage, "erb-v", visitante); }
  var sesion = leer(sessionStorage, "erb-s");
  if (!sesion) { sesion = azar(); guardar(sessionStorage, "erb-s", sesion); }
  var clienta = leer(localStorage, "erb-cuenta") || leer(sessionStorage, "erb-cuenta");

  function enviar(datos) {
    datos.v = visitante; datos.s = sesion;
    if (clienta) datos.k = clienta;
    return fetch("/api/visita", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos), keepalive: true, credentials: "same-origin",
    }).then(function (r) { return r.json(); }).catch(function () { return {}; });
  }

  // Página vista
  // De dónde llegó: se recuerda durante toda la visita (al pasar a otra página no cuenta como "Directo")
  var q = new URLSearchParams(location.search);
  var externo = "";
  try { externo = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : ""; } catch (_) {}
  var origen = { r: externo, u: q.get("utm_source") || q.get("fuente") || "", c: q.get("utm_campaign") || "" };
  if (origen.r || origen.u) guardar(sessionStorage, "erb-o", JSON.stringify(origen));
  else { try { origen = JSON.parse(leer(sessionStorage, "erb-o")) || origen; } catch (_) {} }

  var vistaId = null, visible = 0, desde = document.visibilityState === "visible" ? Date.now() : 0;
  enviar({ t: "vista", p: location.pathname, n: nuevo, r: origen.r, u: origen.u, c: origen.c })
    .then(function (r) { vistaId = r && r.id; });

  // Tiempo en la página (solo mientras está a la vista)
  function sumar() { if (desde) { visible += Date.now() - desde; desde = 0; } }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") desde = Date.now();
    else {
      sumar();
      if (vistaId && visible > 1000) enviar({ t: "dur", id: vistaId, d: Math.round(visible / 1000) });
    }
  });

  // Acciones importantes
  var evento = function (e) { enviar({ t: "evento", e: e, p: location.pathname }); };
  window.erbEvento = evento;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (/wa\.me|whatsapp\.com/i.test(h)) evento("whatsapp");
    else if (/instagram\.com/i.test(h)) evento("instagram");
    else if (/facebook\.com/i.test(h)) evento("facebook");
    else if (/^tel:/i.test(h)) evento("llamada");
    else if (/google\.[^/]+\/maps|maps\.app\.goo|goo\.gl\/maps/i.test(h)) evento("mapa");
  }, true);
})();
