// ============================================================================
// Eliza Beauty – Clientas
// Sección exclusiva en la barra lateral de VS Code para gestionar las cuentas
// de clientas y la fidelidad. Usa el mismo servidor y la misma base de datos
// que el panel web (/admin): entra con el usuario y la contraseña del panel.
// La sesión se guarda cifrada en el almacén seguro de VS Code (SecretStorage).
// ============================================================================
const vscode = require("vscode");

const SITIO = "https://eliza-rodriguez-beauty.netlify.app";
const CLAVE_SESION = "eliza.sesionAdmin";

/** Llama a la API del sitio con la sesión del panel. */
async function api(ctx, ruta, metodo = "GET", cuerpo) {
  const token = await ctx.secrets.get(CLAVE_SESION);
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  let ultimoError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(SITIO + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      const datos = await res.json().catch(() => ({}));
      return { status: res.status, ...datos };
    } catch (e) {
      ultimoError = e; // corte de red momentáneo: reintenta
      await new Promise((r) => setTimeout(r, 700 * intento));
    }
  }
  return { status: 0, ok: false, error: "Sin conexión a internet (" + (ultimoError?.message || "error") + ")" };
}

/** Coordina las pestañas: comparten la sesión y se actualizan juntas. */
const app = {
  vistas: [],
  recargar() { this.vistas.forEach((v) => v.cargar()); },
  async sesionVencida(texto = "La sesión venció. Vuelve a entrar.") {
    await this.vistas[0]?.ctx.secrets.delete(CLAVE_SESION);
    this.vistas.forEach((v) => v.enviar({ tipo: "login", error: texto }));
  },
  /** Abre la pestaña "Clientes nuevos" con los datos de una clienta ya escritos. */
  async prellenar(datos) {
    const nuevas = this.vistas.find((v) => v instanceof VistaNuevas);
    if (nuevas) nuevas.pendiente = datos;
    await vscode.commands.executeCommand("eliza.nuevas.focus");
    nuevas?.enviar({ tipo: "prellenar", datos });
  },
};

class VistaClientas {
  constructor(ctx) { this.ctx = ctx; this.view = null; app.vistas.push(this); }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m) => this.mensaje(m));
  }

  enviar(msg) { this.view?.webview.postMessage(msg); }

  async mensaje(m) {
    const ctx = this.ctx;
    try {
      switch (m.tipo) {
        case "inicio": {
          const token = await ctx.secrets.get(CLAVE_SESION);
          if (!token) return this.enviar({ tipo: "login" });
          return this.cargar();
        }
        case "login": {
          const r = await api(ctx, "/api/admin/sesion", "POST", { usuario: m.usuario, clave: m.clave });
          if (!r.ok) return this.enviar({ tipo: "login", error: r.error || "No se pudo entrar." });
          await ctx.secrets.store(CLAVE_SESION, r.token);
          return app.recargar();
        }
        case "cargar": return this.cargar();
        case "prellenar": return app.prellenar(m.datos);
        case "accion": {
          // Contraseñas: se piden con el cuadro seguro de VS Code
          if (m.accion === "clave") {
            const clave = await vscode.window.showInputBox({
              title: `Nueva contraseña para ${m.nombre}`,
              prompt: "Mínimo 8 caracteres. Deja el campo vacío para generar una al azar.",
              password: true, ignoreFocusOut: true,
              validateInput: (v) => (v && v.length < 8 ? "Debe tener al menos 8 caracteres" : null),
            });
            if (clave === undefined) return;
            m.datos.clave = clave || generarClave();
          }
          if (m.accion === "sellos") {
            const nota = await vscode.window.showInputBox({
              title: `${m.datos.sellos > 0 ? "Sumar" : "Quitar"} 1 sello a ${m.nombre}`,
              prompt: "Motivo (opcional)", value: m.datos.sellos > 0 ? "Sello de cortesía" : "Corrección", ignoreFocusOut: true,
            });
            if (nota === undefined) return;
            m.datos.nota = nota;
          }
          if (m.confirmar) {
            const ok = await vscode.window.showWarningMessage(m.confirmar, { modal: true }, "Sí, continuar");
            if (ok !== "Sí, continuar") return;
          }
          if (m.accion === "crear" && !m.datos.clave) m.datos.clave = generarClave();
          const r = await api(ctx, "/api/admin/clientas", "POST", { accion: m.accion, ...m.datos });
          if (r.status === 401) return this.sesionVencida();
          if (!r.ok) return vscode.window.showErrorMessage(r.error || "No se pudo completar la acción.");
          const mensajes = {
            crear: "Cuenta creada.", clave: "Contraseña cambiada.", sellos: "Sellos actualizados.",
            canjear: "Regalo registrado. ¡Tarjeta nueva!", activar: "Cuenta activada.", desactivar: "Cuenta desactivada.",
          };
          if (m.accion === "crear") {
            // La pestaña "Clientes nuevos" muestra Nombre, Usuario y Contraseña con botones
            this.enviar({ tipo: "creada", nombre: m.datos.nombre, correo: m.datos.correo, clave: m.datos.clave, whatsapp: m.datos.whatsapp || "" });
            vscode.window.showInformationMessage(`Cuenta creada para ${m.datos.nombre}.`);
          } else if (m.accion === "clave") {
            const c = { nombre: m.nombre, correo: m.datos.correo, whatsapp: m.whatsapp };
            await this.credenciales(c, m.datos.clave, mensajes[m.accion]);
          } else {
            vscode.window.showInformationMessage(mensajes[m.accion] || "Listo.");
          }
          return app.recargar();
        }
        case "web": return vscode.env.openExternal(vscode.Uri.parse(SITIO + "/admin/"));
        case "aviso": return vscode.window.showWarningMessage(m.texto);
        case "copiar": {
          await vscode.env.clipboard.writeText(textoCredenciales(m.c, m.c.clave));
          return vscode.window.showInformationMessage("Datos copiados. Pégalos en WhatsApp o donde quieras.");
        }
        case "whatsapp": return abrirWhatsApp(m.c, m.c.clave);
      }
    } catch (e) {
      vscode.window.showErrorMessage("Eliza Beauty: " + (e?.message || e));
    }
  }

  async cargar() {
    this.enviar({ tipo: "cargando" });
    const r = await api(this.ctx, "/api/admin/clientas");
    if (r.status === 401) return this.sesionVencida();
    if (!r.ok) return this.enviar({ tipo: "error", error: r.error || "No se pudieron cargar las clientas." });
    this.enviar({ tipo: "datos", clientas: r.clientas, resumen: r.resumen, config: r.config });
  }

  sesionVencida() { return app.sesionVencida(); }

  /** Muestra usuario y contraseña, con botones para copiar o enviar por WhatsApp. */
  async credenciales(c, clave, titulo) {
    const texto = textoCredenciales(c, clave);
    const opciones = c.whatsapp ? ["Enviar por WhatsApp", "Copiar mensaje"] : ["Copiar mensaje"];
    const eleccion = await vscode.window.showInformationMessage(
      `${titulo}\n\nUsuario: ${c.correo}\nContraseña: ${clave}`, { modal: true }, ...opciones);
    if (eleccion === "Copiar mensaje") {
      await vscode.env.clipboard.writeText(texto);
      vscode.window.showInformationMessage("Mensaje copiado. Pégalo en WhatsApp.");
    }
    if (eleccion === "Enviar por WhatsApp") abrirWhatsApp(c, clave);
  }

  html(webview) {
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    return /* html */ `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --gold: #B8945A; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 10px 24px; }
  h2 { font-size: 1.05em; margin: 14px 0 6px; font-weight: 600; }
  .muted { opacity: .75; font-size: .92em; }
  input, select { width: 100%; box-sizing: border-box; padding: 5px 7px; margin: 3px 0 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font: inherit; }
  input:focus { outline: 1px solid var(--vscode-focusBorder); }
  button { font: inherit; cursor: pointer; border: 0; border-radius: 3px; padding: 5px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.sec { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.sec:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.peligro { background: transparent; color: var(--vscode-errorForeground); border: 1px solid var(--vscode-errorForeground); }
  .fila { display: flex; gap: 6px; flex-wrap: wrap; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; }
  .stat { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 6px 8px; }
  .stat b { font-size: 1.3em; display: block; }
  .card { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 8px 10px; margin: 8px 0; }
  .card.off { border-style: dashed; opacity: .7; }
  .card .top { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
  .nivel { font-size: .8em; padding: 1px 7px; border-radius: 10px; background: var(--gold); color: #2B2420; font-weight: 600; white-space: nowrap; }
  .datos { margin: 6px 0; font-size: .92em; line-height: 1.5; }
  .sellos { letter-spacing: 2px; }
  details { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 6px 10px; margin: 10px 0; }
  summary { cursor: pointer; font-weight: 600; }
  .chips { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0; }
  .chips button { padding: 3px 8px; font-size: .9em; }
  .chips button[aria-pressed="false"] { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .error { color: var(--vscode-errorForeground); }
  [hidden] { display: none !important; }
</style></head>
<body>
  <div id="app"><p class="muted">Cargando…</p></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (n) => "$" + Number(n || 0).toLocaleString("es-CO");
  const ESTADO = { activa: "Cuenta activa", sin_clave: "Sin contraseña", desactivada: "Desactivada", no: "Sin cuenta" };
  let datos = null, filtro = "con", busqueda = "";

  function login(error) {
    app.innerHTML = \`
      <h2>Entrar al panel</h2>
      <p class="muted">Escribe <b>tus</b> datos de administradora (los del panel de admin). No son los de una clienta.</p>
      <form id="f-login">
        <label>Tu usuario de admin<input id="u" autocomplete="username" required></label>
        <label>Tu contraseña de admin<input id="p" type="password" autocomplete="current-password" required></label>
        <button type="submit">Entrar</button>
        <p class="error">\${esc(error || "")}</p>
      </form>\`;
    document.getElementById("f-login").addEventListener("submit", (e) => {
      e.preventDefault();
      vscode.postMessage({ tipo: "login", usuario: document.getElementById("u").value, clave: document.getElementById("p").value });
      app.querySelector("button").disabled = true;
    });
    document.getElementById("u").focus();
  }

  function pintar() {
    const { clientas, resumen, config } = datos;
    const q = busqueda.toLowerCase();
    const lista = clientas.filter((c) => {
      if (filtro === "con" && c.cuenta === "no") return false;
      if (filtro === "sin" && c.cuenta !== "no") return false;
      if (filtro === "regalo" && !(c.cuenta !== "no" && c.sellos >= c.sellosMeta)) return false;
      return !q || [c.nombre, c.correo, c.whatsapp, c.nivel].join(" ").toLowerCase().includes(q);
    });
    app.innerHTML = \`
      <div class="stats">
        <div class="stat"><b>\${resumen.conCuenta}</b>Con cuenta</div>
        <div class="stat"><b>\${resumen.sinCuenta}</b>Sin cuenta</div>
        <div class="stat"><b>\${resumen.regalosListos}</b>Regalos por entregar</div>
        <div class="stat"><b>\${resumen.regalosEntregados}</b>Regalos entregados</div>
      </div>
      <p class="muted">\${config.niveles.map((n) => esc(n.nombre) + ": " + (resumen.porNivel[n.nombre] || 0)).join(" · ")}</p>

      <p><button type="button" id="ir-nuevas">+ Crear cuenta (pestaña Clientes nuevos)</button></p>

      <div class="chips">
        \${[["con", "Con cuenta"], ["sin", "Sin cuenta"], ["regalo", "Regalo listo"], ["todas", "Todas"]].map(([k, t]) => \`<button type="button" data-f="\${k}" aria-pressed="\${filtro === k}">\${t}</button>\`).join("")}
      </div>
      <input id="buscar" placeholder="Buscar clienta…" value="\${esc(busqueda)}">
      <div id="lista">\${lista.length ? lista.map(tarjeta).join("") : '<p class="muted">No hay clientas en esta vista.</p>'}</div>\`;

    document.getElementById("ir-nuevas").addEventListener("click", () => vscode.postMessage({ tipo: "prellenar", datos: {} }));
    document.getElementById("buscar").addEventListener("input", (e) => { busqueda = e.target.value; const pos = e.target.selectionStart; pintar(); const b = document.getElementById("buscar"); b.focus(); b.setSelectionRange(pos, pos); });
    app.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.f; pintar(); }));
    app.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => accion(b)));
  }

  function tarjeta(c) {
    const tiene = c.cuenta !== "no";
    const llenos = Math.min(c.sellos, c.sellosMeta);
    return \`
      <div class="card \${c.cuenta === "desactivada" ? "off" : ""}" data-correo="\${esc(c.correo)}">
        <div class="top"><b>\${esc(c.nombre)}</b>\${tiene ? \`<span class="nivel">\${esc(c.nivel)}</span>\` : ""}</div>
        <div class="muted">\${esc(c.correo)}\${c.whatsapp ? " · " + esc(c.whatsapp) : ""}</div>
        <div class="datos">
          Visitas: <b>\${c.visitas}</b>\${c.faltas ? \` · \${c.faltas} sin asistir\` : ""} · Consumo: \${esc(peso(c.consumo))}<br>
          \${tiene ? \`Sellos: <span class="sellos">\${"●".repeat(llenos)}\${"○".repeat(Math.max(0, c.sellosMeta - llenos))}</span> \${llenos}/\${c.sellosMeta}\${c.sellos >= c.sellosMeta ? " · <b>¡regalo listo!</b>" : ""}<br>\` : ""}
          \${esc(ESTADO[c.cuenta])}
        </div>
        <div class="fila">
          \${!tiene ? \`<button data-a="prellenar">Crear cuenta</button>\` : \`
            \${c.cuenta !== "desactivada" ? \`<button class="sec" data-a="clave">Contraseña</button>\` : ""}
            <button class="sec" data-a="mas">+1 sello</button>
            <button class="sec" data-a="menos">−1 sello</button>
            \${c.sellos >= c.sellosMeta && c.cuenta !== "desactivada" ? \`<button data-a="canjear">Entregar regalo</button>\` : ""}
            \${c.cuenta === "desactivada" ? \`<button class="sec" data-a="activar">Activar</button>\` : \`<button class="peligro" data-a="desactivar">Desactivar</button>\`}\`}
        </div>
      </div>\`;
  }

  function accion(b) {
    const correo = b.closest("[data-correo]").dataset.correo;
    const c = datos.clientas.find((x) => x.correo === correo);
    const base = { tipo: "accion", nombre: c.nombre, whatsapp: c.whatsapp, datos: { correo } };
    switch (b.dataset.a) {
      case "prellenar":
        return vscode.postMessage({ tipo: "prellenar", datos: { nombre: c.nombre || "", correo: c.correo, whatsapp: c.whatsapp || "" } });
      case "clave": return vscode.postMessage({ ...base, accion: "clave" });
      case "mas": return vscode.postMessage({ ...base, accion: "sellos", datos: { correo, sellos: 1 } });
      case "menos": return vscode.postMessage({ ...base, accion: "sellos", datos: { correo, sellos: -1 } });
      case "canjear": return vscode.postMessage({ ...base, accion: "canjear", confirmar: \`¿Entregar el regalo a \${c.nombre} (\${datos.config.premio})? Se descontarán \${datos.config.sellos} sellos.\` });
      case "desactivar": return vscode.postMessage({ ...base, accion: "desactivar", confirmar: \`¿Desactivar la cuenta de \${c.nombre}? No podrá iniciar sesión hasta que la actives.\` });
      case "activar": return vscode.postMessage({ ...base, accion: "activar" });
    }
  }

  window.addEventListener("message", ({ data: m }) => {
    if (m.tipo === "login") login(m.error);
    if (m.tipo === "cargando" && !datos) app.innerHTML = '<p class="muted">Cargando clientas…</p>';
    if (m.tipo === "error") app.innerHTML = \`<p class="error">\${esc(m.error)}</p><button id="re">Reintentar</button>\`, document.getElementById("re").onclick = () => vscode.postMessage({ tipo: "cargar" });
    if (m.tipo === "datos") { datos = m; pintar(); }
  });
  vscode.postMessage({ tipo: "inicio" });
</script>
</body></html>`;
  }
}

/** Pestaña "Clientes nuevos": solo el formulario para crear cuentas. */
class VistaNuevas extends VistaClientas {
  constructor(ctx) { super(ctx); this.pendiente = null; }

  async cargar() {
    const r = await api(this.ctx, "/api/admin/clientas");
    if (r.status === 401) return this.sesionVencida();
    this.enviar({ tipo: "listo", niveles: (r.config?.niveles || []).map((n) => n.nombre) });
    if (this.pendiente) { this.enviar({ tipo: "prellenar", datos: this.pendiente }); this.pendiente = null; }
  }

  html() {
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
    return /* html */ `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 10px 24px; }
  h2 { font-size: 1.05em; margin: 14px 0 4px; font-weight: 600; }
  .muted { opacity: .75; font-size: .92em; }
  label { display: block; margin-top: 8px; }
  input { width: 100%; box-sizing: border-box; padding: 5px 7px; margin: 3px 0 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font: inherit; }
  input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .fila { display: flex; gap: 6px; }
  .fila input { flex: 1; }
  button { font: inherit; cursor: pointer; border: 0; border-radius: 3px; padding: 6px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.sec { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.sec:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button[disabled] { opacity: .6; cursor: wait; }
  select { width: 100%; box-sizing: border-box; padding: 5px 7px; margin: 3px 0 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font: inherit; }
  details.fid { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 6px 10px; margin: 10px 0 0; }
  details.fid summary { cursor: pointer; font-weight: 600; }
  .ok { border: 1px solid var(--vscode-panel-border, #8884); border-radius: 6px; padding: 10px; margin: 14px 0; }
  .ok h3 { margin: 0 0 8px; font-size: 1em; }
  .ok dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0 0 10px; }
  .ok dt { opacity: .75; }
  .ok dd { margin: 0; font-weight: 600; word-break: break-all; font-family: var(--vscode-editor-font-family, monospace); }
  .ok .fila { flex-wrap: wrap; }
  .error { color: var(--vscode-errorForeground); }
</style></head>
<body>
  <div id="app"><p class="muted">Cargando…</p></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let ultima = null, verClave = true, niveles = [];
  /** Conserva lo escrito en el formulario al volver a pintarlo. */
  const datosForm = () => ({
    nombre: document.getElementById("c-nombre")?.value || "",
    correo: document.getElementById("c-correo")?.value || "",
    whatsapp: document.getElementById("c-wa")?.value || "",
  });

  function login(error) {
    app.innerHTML = \`
      <h2>Entrar al panel</h2>
      <p class="muted">Paso 1 de 2 · Escribe <b>tus</b> datos de administradora (los del panel de admin). No son los de la clienta.</p>
      <form id="f-login">
        <label>Tu usuario de admin<input id="u" autocomplete="username" required></label>
        <label>Tu contraseña de admin<input id="p" type="password" autocomplete="current-password" required></label>
        <p><button type="submit">Entrar</button></p>
        <p class="muted">Después verás el formulario para crear la clienta con su <b>Nombre</b>, <b>Usuario</b> y <b>Contraseña</b>.</p>
        <p class="error">\${esc(error || "")}</p>
      </form>\`;
    document.getElementById("f-login").addEventListener("submit", (e) => {
      e.preventDefault();
      app.querySelector("button").disabled = true;
      vscode.postMessage({ tipo: "login", usuario: document.getElementById("u").value, clave: document.getElementById("p").value });
    });
    document.getElementById("u").focus();
  }

  function formulario(d = {}) {
    app.innerHTML = \`
      <h2>Crear cuenta de clienta</h2>
      <p class="muted">Paso 2 de 2 · Datos de la <b>clienta</b>.</p>
      <form id="f-crear" autocomplete="off">
        <label>Nombre<input id="c-nombre" value="\${esc(d.nombre)}" placeholder="Ana Pérez" required></label>
        <p class="muted" id="saludo" style="margin:2px 0 0">\${d.nombre ? "En su cuenta verá: <b>Hola, " + esc(String(d.nombre).trim().split(" ")[0]) + "</b>" : "Es el nombre que verá la clienta en su cuenta: «Hola, Ana»."}</p>
        <label>Usuario (su correo)<input id="c-correo" value="\${esc(d.correo)}" placeholder="ana@correo.com" required></label>
        <label>Contraseña
          <div class="fila"><input id="c-clave" type="password" autocomplete="new-password" placeholder="Vacía = se genera una al azar"><button class="sec" type="button" id="ver">Ver</button></div>
        </label>
        <label>WhatsApp (opcional, para enviarle sus datos)<input id="c-wa" value="\${esc(d.whatsapp)}" placeholder="300 123 4567"></label>
        <details class="fid">
          <summary>Fidelidad (opcional)</summary>
          <label>Nivel<select id="c-nivel"><option value="auto">Automático (según sus visitas)</option>\${niveles.map((n) => \`<option value="\${esc(n)}">\${esc(n)} (fijo)</option>\`).join("")}</select></label>
          <label>Visitas anteriores<input id="c-visitas" inputmode="numeric" placeholder="0"></label>
          <label>Consumo anterior ($)<input id="c-consumo" inputmode="numeric" placeholder="0"></label>
          <label>Sellos iniciales<input id="c-sellos" inputmode="numeric" placeholder="0"></label>
          <p class="muted">Para clientas que ya venían antes del sistema.</p>
        </details>
        <p class="muted">Usa el mismo correo con el que la clienta reserva para que se sumen sus visitas.</p>
        <p><button type="submit" id="crear">Crear cuenta</button></p>
      </form>
      \${ultima ? \`
        <div class="ok" aria-live="polite">
          <h3>✓ Cuenta creada</h3>
          <dl>
            <dt>Nombre</dt><dd>\${esc(ultima.nombre)}</dd>
            <dt>Usuario</dt><dd>\${esc(ultima.correo)}</dd>
            <dt>Contraseña</dt><dd id="ult-clave">\${verClave ? esc(ultima.clave) : "••••••••••"}</dd>
          </dl>
          <div class="fila">
            <button class="sec" type="button" id="ult-ver">\${verClave ? "Ocultar contraseña" : "Ver contraseña"}</button>
            <button type="button" id="ult-copiar">Copiar datos</button>
            \${ultima.whatsapp ? \`<button type="button" id="ult-wa">Enviar por WhatsApp</button>\` : ""}
          </div>
          <p class="muted" style="margin:8px 0 0">Entra en: eliza-rodriguez-beauty.netlify.app/cuenta/<br>La contraseña solo se ve aquí hasta que cierres VS Code.</p>
        </div>\` : ""}\`;
    if (ultima) {
      document.getElementById("ult-ver").addEventListener("click", () => { verClave = !verClave; formulario(datosForm()); });
      document.getElementById("ult-copiar").addEventListener("click", () => vscode.postMessage({ tipo: "copiar", c: ultima }));
      document.getElementById("ult-wa")?.addEventListener("click", () => vscode.postMessage({ tipo: "whatsapp", c: ultima }));
    }
    const clave = document.getElementById("c-clave");
    document.getElementById("ver").addEventListener("click", (e) => {
      clave.type = clave.type === "password" ? "text" : "password";
      e.target.textContent = clave.type === "password" ? "Ver" : "Ocultar";
    });
    document.getElementById("f-crear").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (id) => document.getElementById(id).value.trim();
      if (!v("c-nombre") || !v("c-correo")) return;
      if (clave.value && clave.value.length < 8) return vscode.postMessage({ tipo: "aviso", texto: "La contraseña debe tener al menos 8 caracteres." });
      document.getElementById("crear").disabled = true;
      vscode.postMessage({ tipo: "accion", accion: "crear", datos: { nombre: v("c-nombre"), correo: v("c-correo").toLowerCase(), whatsapp: v("c-wa"), clave: clave.value,
        nivel: document.getElementById("c-nivel").value, visitas_previas: v("c-visitas"), consumo_previo: v("c-consumo"), sellos_iniciales: v("c-sellos") } });
      setTimeout(() => { const b = document.getElementById("crear"); if (b) b.disabled = false; }, 4000);
    });
    // Vista previa del saludo que verá la clienta
    document.getElementById("c-nombre").addEventListener("input", (e) => {
      const n = e.target.value.trim().split(" ")[0];
      document.getElementById("saludo").innerHTML = n ? "En su cuenta verá: <b>Hola, " + esc(n) + "</b>" : "Es el nombre que verá la clienta en su cuenta: «Hola, Ana».";
    });
    document.getElementById(d.correo ? "c-clave" : "c-nombre").focus();
  }

  window.addEventListener("message", ({ data: m }) => {
    if (m.tipo === "login") login(m.error);
    if (m.tipo === "listo") { if (m.niveles) niveles = m.niveles; formulario(); }
    if (m.tipo === "prellenar") formulario(m.datos || {});
    if (m.tipo === "creada") { ultima = { nombre: m.nombre, correo: m.correo, clave: m.clave, whatsapp: m.whatsapp }; verClave = true; formulario(); }
  });
  vscode.postMessage({ tipo: "inicio" });
</script>
</body></html>`;
  }
}

/** Mensaje para la clienta con su usuario y contraseña. */
function textoCredenciales(c, clave) {
  return `Hola ${String(c.nombre).split(" ")[0]}, ¡bienvenida al club de clientas de Eliza Rodriguez Beauty! 💛\n\nEntra a ${SITIO}/cuenta/ con:\nUsuario: ${c.correo}\nContraseña: ${clave}\n\nPuedes cambiar la contraseña desde tu cuenta.`;
}
function abrirWhatsApp(c, clave) {
  let n = String(c.whatsapp || "").replace(/\D/g, "");
  if (!n) return vscode.window.showWarningMessage("Esta clienta no tiene WhatsApp registrado. Usa “Copiar datos”.");
  if (n.length === 10 && n.startsWith("3")) n = "57" + n;
  return vscode.env.openExternal(vscode.Uri.parse(`https://wa.me/${n}?text=${encodeURIComponent(textoCredenciales(c, clave))}`));
}

function generarClave() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = require("crypto").randomBytes(10);
  return Array.from(bytes, (b) => c[b % c.length]).join("");
}

function activate(ctx) {
  const nuevas = new VistaNuevas(ctx);
  const vista = new VistaClientas(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("eliza.nuevas", nuevas, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewViewProvider("eliza.clientas", vista, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("eliza.actualizar", () => app.recargar()),
    vscode.commands.registerCommand("eliza.abrirWeb", () => vscode.env.openExternal(vscode.Uri.parse(SITIO + "/admin/"))),
    vscode.commands.registerCommand("eliza.cerrarSesion", async () => {
      const token = await ctx.secrets.get(CLAVE_SESION);
      if (token) await fetch(SITIO + "/api/admin/sesion", { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
      await app.sesionVencida("Cerraste sesión.");
    }),
    vscode.commands.registerCommand("eliza.abrir", abrirSeccion),
    // Enlace vscode://noirstudio.eliza-clientas/abrir → abre la sección
    vscode.window.registerUriHandler({ handleUri: () => abrirSeccion() })
  );

  // Primera vez con esta versión: abre la sección sola y avisa
  const version = ctx.extension.packageJSON.version;
  if (ctx.globalState.get("eliza.version") !== version) {
    ctx.globalState.update("eliza.version", version);
    abrirSeccion().then(() =>
      vscode.window.showInformationMessage("Eliza Beauty está lista: usa la pestaña “Clientes nuevos” para crear cuentas y “Clientas” para gestionarlas."));
  }
}

/** Muestra la sección Eliza Beauty con la pestaña "Clientes nuevos" al frente. */
async function abrirSeccion() {
  await vscode.commands.executeCommand("workbench.view.extension.elizaBeauty");
  await vscode.commands.executeCommand("eliza.nuevas.focus");
}

function deactivate() {}

module.exports = { activate, deactivate };
