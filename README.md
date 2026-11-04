# Eliza Rodriguez Beauty – Landing page

Sitio de una sola página para **Eliza Rodriguez Beauty – Estética Avanzada** (Bahía Solano, Chocó).
Su objetivo principal es que las visitantes agenden su cita por **WhatsApp**.

Sitio estático (HTML, CSS y JavaScript sin frameworks) publicado en **Netlify**, con dos pequeñas funciones de servidor que guardan las reservas en una base de datos **Neon (Postgres)** y alimentan el panel privado `/admin`.

---

## Estructura

```
/
├── index.html            ← Estructura y textos de la página
├── css/
│   └── styles.css        ← Estilos (colores y tipografías al inicio del archivo)
├── js/
│   ├── config.js         ← Número de WhatsApp, redes, dirección y horarios
│   ├── services.js       ← Servicios: nombres, descripciones, duración y precios
│   ├── content.js        ← Resultados antes/después, certificaciones y testimonios
│   └── main.js           ← Lógica (no necesitas editarlo)
├── assets/img/
│   ├── logo.svg          ← Logo (header y footer; vectorial)
│   ├── logo.png          ← Logo en PNG transparente (Google / redes)
│   ├── eliza.jpg / eliza.webp   ← Foto principal (portada)
│   ├── eliza-sobre.webp  ← Foto de la sección "Sobre mí"
│   ├── servicios/        ← Una foto por servicio
│   ├── resultados/       ← Fotos de antes y después
│   ├── og-image.jpg      ← Imagen de vista previa al compartir el enlace
│   └── favicon.ico, favicon-32.png, apple-touch-icon.png
├── admin/index.html      ← Panel privado (reservas, servicios, resultados, textos, fotos)
├── cancelar/index.html   ← Página donde la clienta cancela su cita (enlace del correo)
├── cuenta/index.html     ← Club de clientas: iniciar sesión, nivel, sellos y citas
├── legal/                ← Términos y condiciones · Política de datos
├── netlify/
│   ├── functions/reserva.mjs          ← POST /api/reserva: guarda la reserva y envía correos
│   ├── functions/cancelar.mjs         ← /api/cancelar: cancelación hasta 3 h antes
│   ├── functions/recordatorios.mjs    ← Programada cada 10 min: recordatorio 2 h antes
│   ├── functions/contenido.mjs        ← GET /api/contenido: textos/fotos/precios editados
│   ├── functions/cuenta.mjs           ← Cuentas de clientas: login, contraseña, mi cuenta
│   ├── functions/admin-login.mjs      ← Entrar/salir del panel (usuario + contraseña)
│   ├── functions/admin-*.mjs          ← Panel: reservas, clientas, contenido y fotos
│   ├── functions/fotos.mjs            ← Sirve las fotos subidas (/fotos/…)
│   ├── lib/fidelidad.mjs              ← Niveles, sellos, cuentas y contraseñas
│   └── lib/shared.mjs                 ← Base de datos, correo, validación
├── netlify.toml          ← Configuración de Netlify (publicación, funciones, cabeceras)
├── package.json          ← Dependencia del conector de base de datos
└── robots.txt            ← Oculta /admin y /api de Google
```

> Las fotos de portada, "Sobre mí" y labios ya son reales; el resto son **placeholders** con la paleta de la marca. Reemplázalas manteniendo el mismo nombre de archivo.

---

## Ver el sitio en tu computador

Abre `index.html` con doble clic, o mejor, levanta un servidor local en la carpeta del proyecto:

```bash
python -m http.server 8000
# y abre http://localhost:8000
```

---

## Cómo cambiar…

> **Lo más fácil es el panel `/admin`** (servicios, precios, fotos, resultados y textos, sin tocar código). Lo de abajo explica cómo cambiar los **valores originales** en los archivos.

### 1. El número de WhatsApp
Abre `js/config.js` y cambia **una sola línea**:

```js
const WHATSAPP_NUMBER = "573001234567";
```

Formato: indicativo del país (57) + número celular, **sin** `+`, espacios ni guiones.
Todos los botones (menú, portada, tarjetas, formulario, botón flotante y footer) usan este número.

También actualiza el `"telephone"` en el bloque `application/ld+json` del `<head>` de `index.html` (lo usa Google).

### 2. Los precios y textos de los servicios
Abre `js/services.js`. Cada servicio se ve así:

```js
{
  id: "botox",
  nombre: "Botox",
  descripcion: "Suaviza líneas de expresión…",   // ideal: máximo ~110 caracteres (se muestran 2 líneas)
  duracion: "30 min",
  precio: "$350.000",                             // en la página se verá "desde $350.000"
  imagen: "assets/img/servicios/botox.webp",
  alt: "Rostro con líneas de expresión suavizadas", // descripción de la foto (accesibilidad)
},
```

- Para **agregar** un servicio, copia un bloque `{ … },` y edítalo.
- Para **quitarlo**, borra su bloque.
- El selector del formulario y el mensaje de WhatsApp ("Hola Eliza, quiero agendar una cita para …") se actualizan solos.

### 3. Las fotos
Reemplaza los archivos en `assets/img/` **con el mismo nombre**. Recomendaciones:

| Imagen | Tamaño sugerido | Formato |
|---|---|---|
| `eliza.webp` y `eliza.jpg` (portada) | 900 × 1125 px (vertical 4:5) | WebP + JPG de respaldo |
| `eliza-sobre.webp` | 800 × 1000 px (4:5) | WebP |
| `servicios/*.webp` | 640 × 480 px (4:3) | WebP |
| `resultados/*-antes.webp` / `*-despues.webp` | 900 × 900 px (cuadradas) | WebP |
| `logo.svg` | Exportado desde Illustrator, **sin el fondo crema** | SVG |
| `logo.png` | ~960 px de ancho, fondo transparente | PNG |
| `og-image.jpg` | 1200 × 630 px | JPG |

- Para convertir a WebP puedes usar [squoosh.app](https://squoosh.app) (gratis, en el navegador), calidad 70–80.
- Intenta que cada foto pese **menos de 150 KB** para que la página cargue rápido.
- En el comparador de resultados, la foto de **antes** y la de **después** deben tener el **mismo encuadre**.

### 4. Los resultados (antes y después)
En `js/content.js`, lista `RESULTADOS`. Cada elemento crea una pestaña:

```js
{
  servicio: "Labios",
  antes: "assets/img/resultados/labios-antes.webp",
  despues: "assets/img/resultados/labios-despues.webp",
  nota: "Perfilamiento y aumento con 1 ml de ácido hialurónico.",
},
```

### 5. Certificaciones y testimonios
También en `js/content.js`:
- `CERTIFICACIONES`: una línea de texto por cada curso o certificación.
- `TESTIMONIOS`: `nombre`, `servicio` y `texto` de cada reseña.

### 6. Redes sociales, dirección y horarios
En `js/config.js` → `SITE_CONFIG`: `instagram`, `facebook`, `direccion` y la lista `horarios`.
Actualiza también la lista `"sameAs"` del bloque JSON-LD en `index.html`.

### 7. El mapa
En `index.html`, busca el `<iframe>` de la sección *Ubicación y contacto*. Para la ubicación exacta:
Google Maps → busca el local → **Compartir** → **Insertar un mapa** → copia solo la URL del `src` y pégala en el iframe.

### 8. Los demás textos
Los textos fijos (portada, "Sobre mí", "Por qué elegirnos", preguntas frecuentes, etc.) están directamente en `index.html`, organizados por secciones numeradas con comentarios.

### 9. Colores y tipografías
Al inicio de `css/styles.css`, en `:root`:

```css
--cream: #F8F1E7;   --beige: #EFE4D6;   --gold: #B8945A;
--gold-ink: #7E5F30; /* dorado más oscuro, para TEXTO sobre fondos claros (accesibilidad) */
--ink: #2B2420;
```

---

## Antes de compartir (checklist)

- [x] Número de WhatsApp (`js/config.js` y JSON-LD).
- [ ] URL real de Facebook en `js/config.js` y en el JSON-LD de `index.html`.
- [ ] Precios reales en `js/services.js`.
- [ ] Fotos reales de los demás servicios y resultados en `assets/img/`.
- [ ] Mapa con la dirección exacta.
- [ ] Revisar medios de pago en la sección de preguntas.
- [ ] Completar los `[COMPLETAR]` de `legal/terminos.html` y `legal/privacidad.html` y hacerlos revisar por un abogado.
- [ ] Configurar el correo (`SMTP_USER` y `SMTP_PASS`) para los avisos automáticos.

---

## Publicación

| | |
|---|---|
| **Sitio oficial** | https://eliza-rodriguez-beauty.netlify.app/ |
| **Panel de reservas** | https://eliza-rodriguez-beauty.netlify.app/admin/ |
| **Repositorio** | https://github.com/noirstudio-web/eliza-rodriguez-beauty |
| **Base de datos** | Neon, proyecto `eliza-rodriguez-beauty` (tabla `reservas`) |

**Cada `git push` a `main` se publica solo en Netlify** (1–2 minutos). Netlify instala la dependencia de `package.json` y empaqueta las funciones automáticamente; no hay comando de build.

También existe una copia en GitHub Pages (https://noirstudio-web.github.io/eliza-rodriguez-beauty/), pero ahí **no se guardan las reservas** (no tiene servidor). Comparte siempre la dirección de Netlify.

**Variables de entorno** (Netlify → *Project configuration → Environment variables*):

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a la base de datos Neon |
| `ADMIN_USER` | Usuario del panel `/admin` |
| `ADMIN_PASSWORD` | Contraseña del panel `/admin` |

Si cambias una variable, vuelve a publicar (*Deploys → Trigger deploy*) para que se aplique.

Si conectas un dominio propio, reemplaza `https://eliza-rodriguez-beauty.netlify.app/` en `index.html` (canonical, `og:url`, `og:image` y JSON-LD).

---

## Reservas

Cada vez que alguien usa el formulario **Agenda tu cita**:
1. La reserva se guarda en la base de datos (nombre, WhatsApp, correo, servicio, fecha, hora y comentario), con la autorización de datos.
2. Se abre WhatsApp con el mensaje listo para confirmar con Eliza.

El servidor vuelve a validar todo (no se fía del navegador), rechaza fechas pasadas y descarta los envíos de bots (campo trampa oculto).

### Panel privado `/admin`
Entra a **https://eliza-rodriguez-beauty.netlify.app/admin/** con tu usuario y contraseña. Pestañas: Reservas, **Clientas**, **Fidelidad**, Servicios y precios, Resultados, Textos y Fotos.

| Pestaña | Qué se puede hacer |
|---|---|
| **Reservas** | Ver citas de hoy, próximas y por confirmar · cambiar estado (Pendiente, Confirmada, **Asistió**, **No asistió**, Cancelada) · filtro **Marcar asistencia** con botones ✓ / ✗ · % de asistencia · WhatsApp a la clienta · descargar Excel |
| **Servicios y precios** | Cambiar foto, nombre, descripción, duración y **precio** · agregar, ordenar o eliminar servicios |
| **Resultados** | Subir fotos de **antes y después**, nombre de la pestaña y nota · agregar, ordenar o eliminar |
| **Textos** | Editar cualquier texto de la página (p. ej. “Servicios · texto de abajo del título”), las preguntas frecuentes y las certificaciones · “Restaurar” vuelve al original |
| **Fotos** | Cambiar la foto de portada y la de “Sobre mí” |

- Las fotos se reducen y se convierten a WebP en el navegador antes de subirse (la página sigue rápida). Se guardan en **Netlify Blobs** y se sirven en `/fotos/…`.
- Los cambios se ven en la página en menos de 1 minuto. Si la base de datos no responde, la página muestra los textos y fotos originales.
- Los valores originales siguen estando en `index.html`, `js/services.js` y `js/content.js`.


### Club de clientas (cuentas y fidelidad)
- **Crear la cuenta (a mano):** panel → **Clientas → “+ Crear cuenta de clienta”**: nombre, correo (= su usuario), WhatsApp y contraseña (botón **Generar** para una al azar). Al crearla, el panel ofrece **enviarle el usuario y la contraseña por WhatsApp**. Usa el mismo correo con el que reserva para que se sumen sus visitas.
- **Clientas con visitas pero sin cuenta:** filtro **“Sin cuenta”** → botón **Crear cuenta** (rellena sus datos).
- **Gestionar a cada clienta:** **Cambiar contraseña**, **+1 / −1 sello** (con motivo), **Entregar regalo**, **Desactivar / Activar** la cuenta. Se ve su nivel, visitas, consumo, sellos e historial.
- **Pestaña Fidelidad:** resumen (clientas con cuenta, regalos por entregar y entregados, clientas por nivel) y configuración de **niveles, sellos y regalo**.
- **Dónde entra la clienta:** “Iniciar sesión” en el menú y el pie → `/cuenta/`. Ve su **nivel** con el progreso, su **tarjeta de sellos**, sus citas (puede cancelar hasta 3 h antes) y puede **cambiar su contraseña**.
- Contraseñas cifradas (scrypt): nadie puede verlas, ni desde el panel. Sesiones de 30 días y bloqueo de 15 min tras 8 intentos fallidos.
- Para volver a crear cuentas automáticamente en la 2.ª visita: `CREAR_CUENTA_AUTOMATICA = true` en `netlify/lib/fidelidad.mjs`.

### Sección “Eliza Beauty” en Visual Studio Code
Extensión propia (carpeta `vscode-extension/`) que agrega un **ícono en la barra lateral izquierda de VS Code**. Al abrirlo:

1. Entras con el **usuario y contraseña del panel** (la sesión queda guardada de forma cifrada en VS Code).
2. Ves el resumen (clientas con cuenta, regalos por entregar…), los niveles y la lista de clientas con filtros y buscador.
3. **“+ Crear cuenta de clienta”**: nombre, correo (usuario), WhatsApp y contraseña (vacía = se genera una).
4. En cada clienta: **Contraseña** (cambiarla), **+1 / −1 sello**, **Entregar regalo**, **Activar / Desactivar**.
5. Al crear o cambiar una contraseña, VS Code muestra el usuario y la contraseña con botones **“Enviar por WhatsApp”** y **“Copiar mensaje”**.

Botones arriba de la sección: Actualizar · Abrir panel web · Cerrar sesión.

**Instalar o actualizar la extensión** (una vez por computadora):
```bash
cd vscode-extension
npx @vscode/vsce package --no-dependencies --skip-license --allow-missing-repository --out eliza-clientas.vsix
code --install-extension eliza-clientas.vsix --force
```
Luego en VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.

> Alternativa por terminal (opcional): `npm run clienta -- crear|clave|listar|desactivar|activar` (ver `scripts/clientas.mjs`).

### Usuario y contraseña del panel de admin
Variables `ADMIN_USER` (usuario) y `ADMIN_PASSWORD` (contraseña) en Netlify → *Project configuration → Environment variables* → *Edit* → luego *Deploys → Trigger deploy*. Al entrar se abre una sesión de 12 horas; tras 8 intentos fallidos se bloquea 15 minutos.

### Correos automáticos
| Cuándo | A quién |
|---|---|
| Al recibir una reserva | Eliza (aviso) y la clienta (constancia + **enlace para cancelar**) |
| **2 horas antes** de la cita | La clienta y Eliza (recordatorio) |
| Cuando la clienta cancela | Eliza, al instante |

- La clienta puede cancelar en línea **hasta 3 horas antes** (`/cancelar/?t=…`). Después, la página le pide escribir por WhatsApp.
- El recordatorio lo envía la función programada `recordatorios` cada 10 minutos (no aplica a citas canceladas ni a reservas hechas con menos de 2 h de anticipación).
- Las horas de cancelación y recordatorio se cambian en `netlify/lib/shared.mjs` (`HORAS_CANCELACION`, `HORAS_RECORDATORIO`).

**Activar los correos (Gmail de Eliza):**
1. En la cuenta de Google de Eliza, activa la **verificación en 2 pasos** (myaccount.google.com → Seguridad).
2. Entra a **myaccount.google.com/apppasswords**, crea una contraseña de aplicación llamada “Sitio web” y copia los 16 caracteres.
3. En Netlify → *Environment variables*, crea `SMTP_USER` = el Gmail de Eliza y `SMTP_PASS` = la contraseña de aplicación. Opcional: `AVISOS_EMAIL` si los avisos deben llegar a otro correo.
4. *Deploys → Trigger deploy*.

Mientras no estén configuradas, las reservas se guardan igual, pero no se envían correos.

> En tu computador (`localhost` con `python -m http.server`) no hay servidor de funciones: no se guardan reservas ni se carga el contenido editado. Para probar todo en local: `npx netlify-cli dev`.

### Páginas legales
- `legal/terminos.html` — Términos y condiciones (servicios de salud, Ley 1799 de 2016 sobre menores, reservas, cancelaciones, precios, fotos, Estatuto del Consumidor y PQR).
- `legal/privacidad.html` — Política de tratamiento de datos personales (Ley 1581 de 2012, Decreto 1377 de 2013).
- Están enlazadas en el pie de página y en la casilla de autorización del formulario.
- **Completa los campos marcados `[COMPLETAR]`** (titular, NIT, dirección, correo, ReTHUS, habilitación, política de abonos, tiempo de conservación) y **haz revisar ambos textos por un abogado**: son una base sólida, no asesoría legal.

**Protección de datos:** el formulario pide autorización expresa (Ley 1581 de 2012). Usa estos datos solo para gestionar las citas y publica una política de tratamiento de datos.

---

## Notas técnicas

- **Formulario:** guarda la reserva en la base de datos (`/api/reserva`) y además abre `wa.me` con el mensaje prellenado (ver sección *Reservas*).
- **Rendimiento:** imágenes WebP con `loading="lazy"` (excepto la portada, que se precarga), fuentes de Google sin bloquear el render, sin librerías externas.
- **Accesibilidad:** HTML semántico, textos `alt`, contraste AA (el dorado de texto usa `--gold-ink`), navegación con teclado en el menú, pestañas, comparador (flechas ← →) y carrusel, y respeto por `prefers-reduced-motion`.
- **SEO:** título y descripción, Open Graph, favicon y datos estructurados Schema.org `BeautySalon`.

---

© 2026 Eliza Rodriguez Beauty · Desarrollado por Noir Studio
