/* ==========================================================================
   Eliza Rodriguez Beauty – Interacciones
   Depende de: config.js, services.js y content.js (cargados antes).
   No necesitas editar este archivo para cambiar textos, precios o fotos.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Escapa texto antes de insertarlo como HTML. */
  /**
   * Precio en pesos colombianos: "350000", "$350.000" o "350.000 - 500.000"
   * se muestran como "$350.000 COP" / "$350.000 - $500.000 COP".
   * Si no tiene números (p. ej. "Consultar"), se muestra tal cual.
   */
  const precioCOP = (p) => {
    const t = String(p ?? "").trim();
    if (!/\d/.test(t)) return t;
    const sinMoneda = t.replace(/\s*(cop|pesos?)\s*$/i, "").replace(/\$\s*/g, "");
    return sinMoneda.replace(/\d[\d.,]*/g, (num) => "$" + Number(num.replace(/[.,]/g, "")).toLocaleString("es-CO")) + " COP";
  };
  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ------------------------------------------------------------------------
     WhatsApp
     ------------------------------------------------------------------------ */
  const waNumber = String(WHATSAPP_NUMBER).replace(/\D/g, "");
  if (/x/i.test(WHATSAPP_NUMBER)) {
    console.warn("[Eliza Rodriguez Beauty] Configura WHATSAPP_NUMBER en js/config.js");
  }

  /** Construye un enlace wa.me con el mensaje prellenado. */
  function waLink(message) {
    const text = message ? `?text=${encodeURIComponent(message)}` : "";
    return `https://wa.me/${waNumber}${text}`;
  }

  /** Todos los elementos con [data-wa] abren WhatsApp (mensaje opcional en data-wa-msg). */
  function initWhatsAppLinks() {
    $$("[data-wa]").forEach((el) => {
      el.href = waLink(el.dataset.waMsg || SITE_CONFIG.mensajeGeneral);
      el.target = "_blank";
      el.rel = "noopener";
    });
  }

  /** Enlaces de redes sociales desde config.js */
  function initSocialLinks() {
    $$("[data-social]").forEach((el) => {
      const url = SITE_CONFIG[el.dataset.social];
      if (url) el.href = url;
    });
    $$("[data-social-label]").forEach((el) => (el.textContent = SITE_CONFIG.instagramUsuario));
  }

  /* ------------------------------------------------------------------------
     Servicios
     ------------------------------------------------------------------------ */
  const clockIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function renderServices() {
    const grid = $("#services-grid");
    if (!grid || !Array.isArray(SERVICES)) return;

    grid.innerHTML = SERVICES.map((s, i) => {
      const msg = `Hola Eliza, quiero agendar una cita para ${s.nombre}`;
      return `
        <article class="card reveal" style="--d:${(i % 3) * 0.1}s">
          <div class="card__media">
            ${s.imagen
              ? `<img src="${esc(s.imagen)}" alt="${esc(s.alt || s.nombre)}" width="640" height="480" loading="lazy" decoding="async">`
              : `<div class="card__ph" aria-hidden="true"><span>${esc((s.nombre || "?").trim().charAt(0).toUpperCase())}</span></div>`}
          </div>
          <div class="card__body">
            <h3 class="card__title">${esc(s.nombre)}</h3>
            <p class="card__desc">${esc(s.descripcion)}</p>
            <div class="card__meta">
              <span class="card__duration">${clockIcon}${esc(s.duracion)}</span>
              <span class="card__price">desde <strong>${esc(precioCOP(s.precio))}</strong></span>
            </div>
            <a class="btn btn--gold btn--sm" href="${waLink(msg)}" target="_blank" rel="noopener"
               aria-label="Agendar ${esc(s.nombre)} por WhatsApp">Agendar</a>
          </div>
        </article>`;
    }).join("");

    // Opciones del selector del formulario
    const select = $("#f-servicio");
    if (select) {
      SERVICES.forEach((s) => select.add(new Option(s.nombre, s.nombre)));
      select.add(new Option("Valoración / no estoy segura", "una valoración"));
    }
  }

  /* ------------------------------------------------------------------------
     Header: estado al hacer scroll, menú móvil y enlace activo
     ------------------------------------------------------------------------ */
  function initHeader() {
    const header = $("#header");
    const toggle = $("#nav-toggle");
    const nav = $("#nav");

    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    };

    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    $$(".nav__link", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("is-open") && !header.contains(e.target)) setOpen(false);
    });

    // Resalta la sección visible en el menú
    if ("IntersectionObserver" in window) {
      const links = $$(".nav__link");
      const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((a) => a.classList.remove("is-active"));
            const link = map.get(entry.target.id);
            if (link) link.classList.add("is-active");
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      $$("main section[id]").forEach((s) => io.observe(s));
    }
  }

  /* ------------------------------------------------------------------------
     Resultados: pestañas + comparador antes/después
     ------------------------------------------------------------------------ */
  function initResults() {
    const tabsEl = $("#results-tabs");
    const ba = $("#ba");
    if (!tabsEl || !ba || !Array.isArray(RESULTADOS) || !RESULTADOS.length) return;

    const imgBefore = $("#ba-before");
    const imgAfter = $("#ba-after");
    const handle = $("#ba-handle");
    const note = $("#results-note");

    // --- Pestañas ---
    tabsEl.innerHTML = RESULTADOS.map(
      (r, i) =>
        `<button class="tab" type="button" role="tab" id="tab-${i}" aria-controls="ba"
           aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(r.servicio)}</button>`
    ).join("");
    const tabs = $$(".tab", tabsEl);

    function select(i, focus) {
      const r = RESULTADOS[i];
      tabs.forEach((t, j) => {
        t.setAttribute("aria-selected", String(j === i));
        t.tabIndex = j === i ? 0 : -1;
      });
      if (focus) tabs[i].focus();
      ba.setAttribute("aria-labelledby", `tab-${i}`);

      ba.classList.add("is-loading");
      let pending = 2;
      const done = () => { if (--pending <= 0) ba.classList.remove("is-loading"); };
      [[imgBefore, r.antes, "Antes"], [imgAfter, r.despues, "Después"]].forEach(([img, src, label]) => {
        img.alt = `${label} – ${r.servicio}`;
        if (img.getAttribute("src") === src && img.complete) return done();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        img.src = src;
      });
      note.textContent = r.nota || "";
      setPos(50);
    }

    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      // Navegación con flechas entre pestañas (patrón ARIA)
      t.addEventListener("keydown", (e) => {
        const n = tabs.length;
        let next = null;
        if (e.key === "ArrowRight") next = (i + 1) % n;
        if (e.key === "ArrowLeft") next = (i - 1 + n) % n;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = n - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });

    // --- Comparador ---
    let pos = 50;
    function setPos(value) {
      pos = Math.min(100, Math.max(0, value));
      ba.style.setProperty("--pos", `${pos}%`);
      handle.setAttribute("aria-valuenow", String(Math.round(pos)));
      handle.setAttribute("aria-valuetext", `${Math.round(pos)} % antes`);
    }
    const posFromEvent = (e) => {
      const rect = ba.getBoundingClientRect();
      return ((e.clientX - rect.left) / rect.width) * 100;
    };

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let decided = false; // decide si el gesto es horizontal (slider) o vertical (scroll)

    ba.addEventListener("pointerdown", (e) => {
      dragging = true;
      decided = e.pointerType === "mouse";
      startX = e.clientX;
      startY = e.clientY;
      if (decided) {
        ba.setPointerCapture(e.pointerId);
        ba.classList.add("is-dragging");
        setPos(posFromEvent(e));
      }
    });
    ba.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (!decided) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < 6 && dy < 6) return;
        if (dy > dx) { dragging = false; return; } // gesto vertical: dejar hacer scroll
        decided = true;
        ba.setPointerCapture(e.pointerId);
        ba.classList.add("is-dragging");
      }
      setPos(posFromEvent(e));
    });
    const stop = (e) => {
      // Un toque corto (sin arrastre) también mueve la línea
      if (dragging && !decided && e.type === "pointerup") setPos(posFromEvent(e));
      dragging = false;
      ba.classList.remove("is-dragging");
    };
    ba.addEventListener("pointerup", stop);
    ba.addEventListener("pointercancel", stop);

    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") setPos(pos - step);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") setPos(pos + step);
      else if (e.key === "Home") setPos(0);
      else if (e.key === "End") setPos(100);
      else return;
      e.preventDefault();
    });

    select(0);
  }

  /* ------------------------------------------------------------------------
     Sobre Eliza: certificaciones
     ------------------------------------------------------------------------ */
  function renderCertifications() {
    const list = $("#cert-list");
    if (!list || !Array.isArray(CERTIFICACIONES)) return;
    list.innerHTML = CERTIFICACIONES.map((c) => `<li>${esc(c)}</li>`).join("");
  }

  /* ------------------------------------------------------------------------
     Testimonios: carrusel con scroll-snap
     ------------------------------------------------------------------------ */
  const star =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';

  function initTestimonials() {
    const track = $("#testi-track");
    const dotsEl = $("#testi-dots");
    if (!track || !Array.isArray(TESTIMONIOS)) return;

    track.innerHTML = TESTIMONIOS.map(
      (t, i) => `
      <figure class="testimonial" role="group" aria-roledescription="testimonio" aria-label="${i + 1} de ${TESTIMONIOS.length}">
        <div class="testimonial__stars" role="img" aria-label="5 de 5 estrellas">${star.repeat(5)}</div>
        <blockquote class="testimonial__text">“${esc(t.texto)}”</blockquote>
        <figcaption>
          <cite class="testimonial__name">${esc(t.nombre)}</cite>
          <span class="testimonial__service">${esc(t.servicio)}</span>
        </figcaption>
      </figure>`
    ).join("");

    const slides = $$(".testimonial", track);
    dotsEl.innerHTML = slides
      .map((_, i) => `<button class="carousel__dot" type="button" aria-label="Ir al testimonio ${i + 1}"></button>`)
      .join("");
    const dots = $$(".carousel__dot", dotsEl);

    const step = () => slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth;
    const maxScroll = () => track.scrollWidth - track.clientWidth;
    const current = () => Math.round(track.scrollLeft / step());
    const goTo = (i) => track.scrollTo({ left: i * step(), behavior: prefersReducedMotion ? "auto" : "smooth" });

    function updateDots() {
      // En el último tramo se marca el último punto aunque queden varias tarjetas visibles
      const idx = track.scrollLeft >= maxScroll() - 4 ? slides.length - 1 : current();
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === idx)));
    }

    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { updateDots(); ticking = false; });
    }, { passive: true });

    const next = () => (track.scrollLeft >= maxScroll() - 4 ? goTo(0) : goTo(current() + 1));
    const prev = () => (track.scrollLeft <= 4 ? track.scrollTo({ left: maxScroll() }) : goTo(current() - 1));
    $("#testi-next").addEventListener("click", next);
    $("#testi-prev").addEventListener("click", prev);
    dots.forEach((d, i) => d.addEventListener("click", () => goTo(i)));
    updateDots();

    // Avance automático suave; se pausa al interactuar
    if (!prefersReducedMotion) {
      let timer = null;
      const start = () => { stopAuto(); timer = setInterval(next, 6500); };
      const stopAuto = () => clearInterval(timer);
      const carousel = track.closest(".carousel");
      ["pointerenter", "focusin", "touchstart"].forEach((ev) => carousel.addEventListener(ev, stopAuto, { passive: true }));
      ["pointerleave", "focusout"].forEach((ev) => carousel.addEventListener(ev, start));
      document.addEventListener("visibilitychange", () => (document.hidden ? stopAuto() : start()));
      start();
    }
  }

  /* ------------------------------------------------------------------------
     Formulario de reserva → WhatsApp
     ------------------------------------------------------------------------ */
  function formatDate(value) {
    if (!value) return "";
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  /** "15:30" → "3:30 p. m." */
  function formatTime(value) {
    if (!value) return "";
    const [h, m] = value.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  }

  function initForm() {
    const form = $("#booking-form");
    if (!form) return;

    // No permitir fechas pasadas
    const fecha = $("#f-fecha");
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    fecha.min = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Reglas de validación: "required" = obligatorio; "check" = formato
    const digits = (v) => v.replace(/\D/g, "");
    const fields = [
      { input: $("#f-nombre"), error: $("#err-nombre"), required: true },
      { input: $("#f-whatsapp"), error: $("#err-whatsapp"), required: true, check: (v) => digits(v).length >= 7 && digits(v).length <= 15 },
      { input: $("#f-correo"), error: $("#err-correo"), required: true, check: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) },
      { input: $("#f-servicio"), error: $("#err-servicio"), required: true },
      { input: $("#f-fecha"), error: $("#err-fecha"), required: true, check: (v) => v >= fecha.min },
      { input: $("#f-hora"), error: $("#err-hora"), required: true },
      { input: $("#f-autorizo"), error: $("#err-autorizo"), required: true },
    ];

    const validate = ({ input, error, required, check }) => {
      const value = input.type === "checkbox" ? (input.checked ? "si" : "") : input.value.trim();
      const ok = value === "" ? !required : !check || check(value);
      input.setAttribute("aria-invalid", String(!ok));
      if (ok) input.removeAttribute("aria-describedby");
      else input.setAttribute("aria-describedby", error.id);
      error.hidden = ok;
      return ok;
    };
    fields.forEach((f) => {
      f.input.addEventListener("input", () => f.input.getAttribute("aria-invalid") === "true" && validate(f));
      f.input.addEventListener("change", () => f.input.getAttribute("aria-invalid") === "true" && validate(f));
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const results = fields.map(validate);
      const firstInvalid = fields.find((_, i) => !results[i]);
      if (firstInvalid) { firstInvalid.input.focus(); return; }

      const data = new FormData(form);
      const get = (k) => (data.get(k) || "").trim();
      const servicio = get("servicio");
      const correo = get("correo");
      const comentario = get("comentario");

      const lines = [
        `Hola Eliza, quiero agendar una cita para ${servicio}.`,
        "",
        `• Nombre: ${get("nombre")}`,
        `• WhatsApp: ${get("whatsapp")}`,
      ];
      if (correo) lines.push(`• Correo: ${correo}`);
      lines.push(
        `• Servicio: ${servicio}`,
        `• Fecha: ${formatDate(get("fecha"))}`,
        `• Hora: ${formatTime(get("hora"))}`
      );
      if (comentario) lines.push(`• Comentario: ${comentario}`);
      lines.push("", "¿Me confirmas si hay disponibilidad? Gracias.");

      // 1) Guardar la reserva en la base de datos (en segundo plano).
      //    keepalive permite que el envío termine aunque la página cambie a WhatsApp.
      const saved = saveBooking(data);
      if (window.erbEvento) window.erbEvento("reserva");

      // 2) Abrir WhatsApp de inmediato (debe ser en el mismo clic para que el
      //    navegador no lo bloquee).
      const url = waLink(lines.join("\n"));
      const win = window.open(url, "_blank");
      if (win) win.opener = null;
      else window.location.href = url; // si el navegador bloquea la ventana nueva

      // 3) Confirmación en pantalla
      saved.then((ok) => {
        status.hidden = false;
        status.classList.toggle("is-error", ok !== true);
        status.textContent = ok === true
          ? "¡Listo! Tu reserva quedó registrada. Termina de enviar el mensaje en WhatsApp para confirmarla."
          : ok === "ocupado"
            ? "Ese horario se acaba de ocupar. Envía el mensaje de WhatsApp y Eliza te propondrá otra hora, o elige otro horario aquí."
            : "Abrimos WhatsApp con tu reserva. Envía el mensaje para confirmarla con Eliza.";
        if (ok === true) form.reset();
        agendaRecargar(); // los horarios libres cambian después de reservar
      });
    });

    const status = $("#booking-status");
    initAgenda(fields);
  }

  /* ------------------------------------------------------------------------
     Agenda en línea (se activa en el panel → Agenda). Si está activa, la
     clienta solo puede elegir los horarios libres que devuelve el servidor.
     ------------------------------------------------------------------------ */
  let agenda = null;
  function initAgenda(fields) {
    if (!/^https?:$/.test(location.protocol)) return;
    const fecha = $("#f-fecha"), hora = $("#f-hora");
    const box = $("#slots"), diasEl = $("#slots-dias"), horasEl = $("#slots-horas");
    const campoHora = fields.find((f) => f.input === hora);
    const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const corta = (f) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };

    function pintarHoras() {
      const libres = agenda.dias[fecha.value] || [];
      const proximos = Object.keys(agenda.dias).filter((f) => f !== fecha.value).slice(0, 6);
      diasEl.innerHTML = (fecha.value && !libres.length
        ? '<p class="slots__aviso">Ese día no hay horarios libres. Prueba con uno de estos días:</p>'
        : `<p class="slots__aviso">${fecha.value ? "Otros días disponibles:" : "Próximos días disponibles:"}</p>`) +
        (proximos.length
          ? proximos.map((f) => `<button type="button" class="slots__dia" data-fecha="${f}">${esc(corta(f))}</button>`).join("")
          : '<p class="slots__aviso">No hay horarios libres por ahora. Escríbele a Eliza por WhatsApp.</p>');
      horasEl.innerHTML = libres.map((h) =>
        `<button type="button" class="slots__hora" role="radio" aria-checked="${h === hora.value}" data-hora="${h}">${esc(formatTime(h))}</button>`).join("");
      if (!libres.includes(hora.value)) hora.value = "";
    }

    function aplicar(d) {
      agenda = d;
      box.hidden = false;
      $("#hora-libre").hidden = true;
      hora.type = "hidden"; // la hora se elige con los botones de horarios libres
      campoHora.error = $("#err-slot");
      fecha.max = d.hasta;
      const primero = Object.keys(d.dias)[0];
      if (primero && fecha.min < primero) fecha.min = primero;
      $("#agenda-hint").textContent = `Elige un día y uno de los horarios libres (cada cita dura unos ${d.duracion} minutos). Eliza te confirmará por WhatsApp.`;
      pintarHoras();
    }

    const cargar = () => fetch("api/disponibilidad")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok && d.activa) aplicar(d); })
      .catch(() => {}); // sin servidor: se queda el campo de hora normal
    cargar();
    agendaRecargar = cargar;

    fecha.addEventListener("change", () => agenda && pintarHoras());
    diasEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fecha]"); if (!b) return;
      fecha.value = b.dataset.fecha;
      fecha.dispatchEvent(new Event("change", { bubbles: true }));
      horasEl.querySelector("button")?.focus();
    });
    horasEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-hora]"); if (!b) return;
      hora.value = b.dataset.hora;
      horasEl.querySelectorAll("[data-hora]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      $("#err-slot").hidden = true;
    });
  }
  let agendaRecargar = () => {};

  /**
   * Guarda la reserva en la base de datos (función /api/reserva en Vercel).
   * Devuelve true si se guardó. Sin servidor (p. ej. en local) devuelve false sin romper nada.
   */
  function saveBooking(data) {
    const body = {};
    data.forEach((value, key) => (body[key] = value));
    return fetch("api/reserva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) console.warn("[Reserva] No se guardó. Código:", res.status);
        return res.ok ? true : res.status === 409 ? "ocupado" : false;
      })
      .catch((err) => {
        console.warn("[Reserva] No se pudo guardar:", err);
        return false;
      });
  }

  /* ------------------------------------------------------------------------
     Contacto: dirección y horarios desde config.js
     ------------------------------------------------------------------------ */
  function renderContact() {
    const address = $("#contact-address");
    if (address && SITE_CONFIG.direccion) address.textContent = SITE_CONFIG.direccion;
    const hours = $("#hours");
    if (hours && Array.isArray(SITE_CONFIG.horarios)) {
      hours.innerHTML = SITE_CONFIG.horarios.map((h) => `<dt>${esc(h.dias)}</dt><dd>${esc(h.horas)}</dd>`).join("");
    }
  }

  /* ------------------------------------------------------------------------
     Aparición suave al hacer scroll
     ------------------------------------------------------------------------ */
  function initReveal() {
    const items = $$(".reveal:not(.is-visible)"); // solo los que aún no aparecieron
    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     Inicio
     ------------------------------------------------------------------------ */
  /** Ejecuta un paso sin que un error en él detenga los demás. */
  const safe = (fn) => { try { fn(); } catch (err) { console.error("[sitio]", fn.name, err); } };

  // 1) Lo que no depende del contenido editable: de inmediato
  safe(initHeader);
  safe(initSocialLinks);
  safe(renderContact);
  safe(initForm);
  safe(initReveal); // secciones fijas visibles desde el primer momento
  // Clienta con sesión iniciada: el enlace dice "Mi cuenta"
  safe(function marcarCuenta() {
    if (localStorage.getItem("erb-cuenta")) $$("[data-cuenta]").forEach((el) => (el.textContent = "Mi cuenta"));
  });

  // 2) Contenido editable desde el panel /admin (textos, fotos, servicios, precios,
  //    resultados…). Si no responde a tiempo, se usan los valores por defecto.
  loadContent().finally(() => {
    safe(renderServices);
    safe(renderCertifications);
    safe(initWhatsAppLinks);
    safe(initResults);
    safe(initTestimonials);
    safe(initReveal); // de nuevo, para incluir las tarjetas generadas
    // Aviso para otros scripts (p. ej. js/burst.js) de que ya están las fotos del panel
    window.erbContenido = { servicios: SERVICES, resultados: RESULTADOS };
    document.dispatchEvent(new CustomEvent("erb:contenido", { detail: window.erbContenido }));
  });

  /* ------------------------------------------------------------------------
     Contenido editable (panel /admin → /api/contenido)
     ------------------------------------------------------------------------ */
  function loadContent() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1800);
    return fetch("api/contenido", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.ok) applyContent(d.contenido || {}); })
      .catch(() => {}) // sin servidor (local / GitHub Pages): valores por defecto
      .finally(() => clearTimeout(timer));
  }

  /** Reemplaza el contenido de un arreglo global (SERVICES, RESULTADOS…) sin cambiar su referencia. */
  const replaceArray = (arr, nuevo) => {
    if (Array.isArray(arr) && Array.isArray(nuevo) && nuevo.length) arr.splice(0, arr.length, ...nuevo);
  };

  function applyContent(c) {
    // Textos: cualquier elemento con data-edit="clave"
    if (c.textos) {
      $$("[data-edit]").forEach((el) => {
        const v = c.textos[el.dataset.edit];
        if (typeof v === "string" && v.trim()) el.textContent = v;
      });
    }
    // Fotos fijas (portada y Sobre mí)
    if (c.fotos) {
      $$("[data-edit-img]").forEach((el) => {
        const url = c.fotos[el.dataset.editImg];
        if (!url) return;
        if (el.tagName === "PICTURE") {
          el.querySelectorAll("source").forEach((s) => s.remove());
          const img = el.querySelector("img");
          if (img) img.src = url;
        } else {
          el.src = url;
        }
      });
      // la foto de portada se precarga en el <head>: se quita para no descargar la anterior
      if (c.fotos.portada) $$('link[rel="preload"][as="image"]').forEach((l) => l.remove());
    }
    replaceArray(SERVICES, c.servicios);
    replaceArray(RESULTADOS, c.resultados);
    replaceArray(CERTIFICACIONES, c.certificaciones);
    replaceArray(TESTIMONIOS, c.testimonios);
  }
})();
