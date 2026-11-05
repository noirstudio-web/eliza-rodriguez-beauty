/* ==========================================================================
   Animación de scroll de la sección #experiencia ("Tu mejor versión")
   - La escena se queda fija (position: sticky) mientras se baja.
   - 0 → 22 %: el título grande se abre hacia los lados y desaparece.
   - 14 → 32 %: entra el segundo título con su párrafo.
   - 22 → 100 %: las fotos "salen disparadas" desde detrás de la foto central,
     primero 4 y luego el resto, de pequeñas y transparentes a su tamaño final.
   Todo va atado al scroll: si se sube, la animación se devuelve.
   Sin librerías (la política de seguridad del sitio solo permite scripts propios).
   ========================================================================== */
(function () {
  "use strict";

  const sec = document.querySelector(".burst");
  if (!sec) return;

  /* Fotos: las mismas de Resultados ("después") y Servicios, incluidas las que
     Eliza suba desde el panel. Se alternan: resultado, servicio, resultado… */
  function ponerFotos(d) {
    const res = (d?.resultados || []).map((r) => r.despues);
    const svc = (d?.servicios || []).map((s) => s.imagen);
    const urls = [];
    for (let i = 0; i < Math.max(res.length, svc.length); i++) urls.push(res[i], svc[i]);
    const lista = [...new Set(urls.filter((u) => typeof u === "string" && u))];
    if (!lista.length) return;
    sec.querySelectorAll(".burst__photo img").forEach((img, i) => {
      const url = lista[i % lista.length];
      if (img.getAttribute("src") !== url) img.src = url;
    });
  }
  if (window.erbContenido) ponerFotos(window.erbContenido); // por si ya llegó
  document.addEventListener("erb:contenido", (e) => ponerFotos(e.detail));
  // Quien pidió "reducir movimiento" en su dispositivo ve el estado final, quieto.
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (quieto.matches) return;

  const track = sec.querySelector(".burst__track");
  const stage = sec.querySelector(".burst__stage");
  const big = sec.querySelector(".burst__big");
  const [bigA, bigB] = big.querySelectorAll("span");
  const intro = sec.querySelector(".burst__intro");
  const head = sec.querySelector(".burst__head");
  const center = sec.querySelector(".burst__center");
  const fotos = Array.from(sec.querySelectorAll(".burst__photo"));

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const tramo = (p, desde, hasta) => clamp((p - desde) / (hasta - desde));
  const salida = (t) => 1 - Math.pow(1 - t, 3); // ease-out cúbico
  const pulso = (p, c, ancho) => clamp(1 - Math.abs(p - c) / ancho);

  sec.classList.add("burst--anim");

  /* Medidas: cuánto tiene que viajar cada foto desde el centro hasta su sitio. */
  let datos = [];
  function medir() {
    const cx = center.offsetLeft, cy = center.offsetTop; // centro de la foto central
    const visibles = fotos.filter((f) => f.offsetParent !== null);
    datos = visibles.map((el, i) => ({
      el,
      dx: cx - el.offsetLeft,
      dy: cy - el.offsetTop,
      giro: parseFloat(getComputedStyle(el).getPropertyValue("--r")) || 0,
      // 1.ª tanda: 4 fotos; 2.ª tanda: el resto
      inicio: i < 4 ? 0.22 + i * 0.05 : 0.48 + (i - 4) * (0.24 / Math.max(1, visibles.length - 5)),
      dur: i < 4 ? 0.3 : 0.26,
    }));
  }

  function pintar() {
    pendiente = false;
    const r = track.getBoundingClientRect();
    const recorrido = r.height - window.innerHeight;
    if (r.bottom < -50 || r.top > window.innerHeight + 50) return; // fuera de pantalla
    const p = recorrido > 0 ? clamp(-r.top / recorrido) : 1;

    // Título grande: se abre hacia los lados y se desvanece
    const t1 = salida(tramo(p, 0, 0.22));
    big.style.opacity = String(1 - t1);
    bigA.style.transform = `translate3d(${-t1 * 10}vw, ${-t1 * 30}px, 0)`;
    bigB.style.transform = `translate3d(${t1 * 10}vw, ${t1 * 30}px, 0)`;

    // Botón y texto inicial
    const t0 = tramo(p, 0, 0.14);
    intro.style.opacity = String(1 - t0);
    intro.style.transform = `translate3d(0, ${t0 * 24}px, 0)`;
    intro.style.visibility = t0 >= 1 ? "hidden" : "visible";

    // Segundo título + párrafo
    const t2 = salida(tramo(p, 0.14, 0.32));
    head.style.opacity = String(t2);
    head.style.transform = `translate3d(0, ${(1 - t2) * 36}px, 0)`;

    // Foto central: se encoge un poco y "destella" al disparar cada tanda
    center.style.transform = `translate(-50%, -50%) scale(${1 - 0.07 * salida(tramo(p, 0, 0.35))})`;
    center.style.setProperty("--flash", String(Math.max(pulso(p, 0.23, 0.035), pulso(p, 0.49, 0.035))));

    // Fotos alrededor
    for (const d of datos) {
      const e = salida(tramo(p, d.inicio, d.inicio + d.dur));
      d.el.style.opacity = String(e);
      d.el.style.transform =
        `translate(-50%, -50%) translate3d(${d.dx * (1 - e)}px, ${d.dy * (1 - e)}px, 0) rotate(${d.giro * e}deg) scale(${0.25 + 0.75 * e})`;
    }
  }

  let pendiente = false;
  const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } };

  medir();
  pintar();
  window.addEventListener("scroll", pedir, { passive: true });
  window.addEventListener("resize", () => { medir(); pedir(); });
  // Si el usuario activa "reducir movimiento" con la página abierta, se recarga quieta
  quieto.addEventListener?.("change", () => location.reload());
})();
