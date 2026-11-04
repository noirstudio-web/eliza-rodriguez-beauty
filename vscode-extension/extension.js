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

class VistaClientas {
  constructor(ctx) { this.ctx = ctx; this.view = null; }

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
          return this.cargar();
        }
        case "cargar": return this.cargar();
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
          if (m.accion === "crear" || m.accion === "clave") {
            const c = { nombre: m.nombre || m.datos.nombre, correo: m.datos.correo, whatsapp: m.whatsapp || m.datos.whatsapp };
            await this.credenciales(c, m.datos.clave, mensajes[m.accion]);
          } else {
            vscode.window.showInformationMessage(mensajes[m.accion] || "Listo.");
          }
          return this.cargar();
        }
        case "web": return vscode.env.openExternal(vscode.Uri.parse(SITIO + "/admin/"));
        case "aviso": return vscode.window.showWarningMessage(m.texto);
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

  async sesionVencida() {
    await this.ctx.secrets.delete(CLAVE_SESION);
    this.enviar({ tipo: "login", error: "La sesión venció. Vuelve a entrar." });
  }

  /** Muestra usuario y contraseña, con botones para copiar o enviar por WhatsApp. */
  async credenciales(c, clave, titulo) {
    const texto = `Hola ${String(c.nombre).split(" ")[0]}, ¡bienvenida al club de clientas de Eliza Rodriguez Beauty! 💛\n\nEntra a ${SITIO}/cuenta/ con:\nUsuario: ${c.correo}\nContraseña: ${clave}\n\nPuedes cambiar la contraseña desde tu cuenta.`;
    const opciones = c.whatsapp ? ["Enviar por WhatsApp", "Copiar mensaje"] : ["Copiar mensaje"];
    const eleccion = await vscode.window.showInformationMessage(
      `${titulo}\n\nUsuario: ${c.correo}\nContraseña: ${clave}`, { modal: true }, ...opciones);
    if (eleccion === "Copiar mensaje") {
      await vscode.env.clipboard.writeText(texto);
      vscode.window.showInformationMessage("Mensaje copiado. Pégalo en WhatsApp.");
    }
    if (eleccion === "Enviar por WhatsApp") {
      let n = String(c.whatsapp).replace(/\D/g, "");
      if (n.length === 10 && n.startsWith("3")) n = "57" + n;
      vscode.env.openExternal(vscode.Uri.parse(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`));
    }
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
      <h2>Eliza Beauty · Clientas</h2>
      <p class="muted">Entra con el usuario y la contraseña del panel de admin.</p>
      <form id="f-login">
        <label>Usuario<input id="u" autocomplete="username" required></label>
        <label>Contraseña<input id="p" type="password" autocomplete="current-password" required></label>
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

      <details id="crear-box">
        <summary>+ Crear cuenta de clienta</summary>
        <form id="f-crear" autocomplete="off">
          <label>Nombre<input id="c-nombre" required></label>
          <label>Correo (será su usuario)<input id="c-correo" required></label>
          <label>WhatsApp<input id="c-wa" placeholder="300 123 4567"></label>
          <label>Contraseña (vacía = se genera una al azar)<input id="c-clave" type="password" autocomplete="new-password"></label>
          <button type="submit">Crear cuenta</button>
          <p class="muted">Usa el mismo correo con el que la clienta reserva para que se sumen sus visitas.</p>
        </form>
      </details>

      <div class="chips">
        \${[["con", "Con cuenta"], ["sin", "Sin cuenta"], ["regalo", "Regalo listo"], ["todas", "Todas"]].map(([k, t]) => \`<button type="button" data-f="\${k}" aria-pressed="\${filtro === k}">\${t}</button>\`).join("")}
      </div>
      <input id="buscar" placeholder="Buscar clienta…" value="\${esc(busqueda)}">
      <div id="lista">\${lista.length ? lista.map(tarjeta).join("") : '<p class="muted">No hay clientas en esta vista.</p>'}</div>\`;

    document.getElementById("f-crear").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (id) => document.getElementById(id).value.trim();
      if (!v("c-nombre") || !v("c-correo")) return;
      const clave = document.getElementById("c-clave").value;
      if (clave && clave.length < 8) { vscode.postMessage({ tipo: "aviso", texto: "La contraseña debe tener al menos 8 caracteres." }); return; }
      vscode.postMessage({ tipo: "accion", accion: "crear", datos: { nombre: v("c-nombre"), correo: v("c-correo").toLowerCase(), whatsapp: v("c-wa"), clave } });
    });
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
      case "prellenar": {
        const box = document.getElementById("crear-box"); box.open = true;
        document.getElementById("c-nombre").value = c.nombre || "";
        document.getElementById("c-correo").value = c.correo;
        document.getElementById("c-wa").value = c.whatsapp || "";
        box.scrollIntoView({ behavior: "smooth" });
        return;
      }
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

function generarClave() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = require("crypto").randomBytes(10);
  return Array.from(bytes, (b) => c[b % c.length]).join("");
}

function activate(ctx) {
  const vista = new VistaClientas(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("eliza.clientas", vista, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("eliza.actualizar", () => vista.cargar()),
    vscode.commands.registerCommand("eliza.abrirWeb", () => vscode.env.openExternal(vscode.Uri.parse(SITIO + "/admin/"))),
    vscode.commands.registerCommand("eliza.cerrarSesion", async () => {
      const token = await ctx.secrets.get(CLAVE_SESION);
      if (token) await fetch(SITIO + "/api/admin/sesion", { method: "DELETE", headers: { Authorization: "Bearer " + token } }).catch(() => {});
      await ctx.secrets.delete(CLAVE_SESION);
      vista.enviar({ tipo: "login", error: "Cerraste sesión." });
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
