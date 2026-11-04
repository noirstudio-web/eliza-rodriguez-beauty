# Eliza Rodriguez Beauty – Landing page

Sitio de una sola página para **Eliza Rodriguez Beauty – Estética Avanzada** (Bahía Solano, Chocó).
Su objetivo principal es que las visitantes agenden su cita por **WhatsApp**.

Es un sitio estático: HTML, CSS y JavaScript sin frameworks, sin backend y sin proceso de *build*.

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
└── netlify.toml          ← Configuración opcional para Netlify
```

> Todas las imágenes incluidas son **placeholders** con la paleta de la marca. Reemplázalas por las fotos reales manteniendo el mismo nombre de archivo.

---

## Ver el sitio en tu computador

Abre `index.html` con doble clic, o mejor, levanta un servidor local en la carpeta del proyecto:

```bash
python -m http.server 8000
# y abre http://localhost:8000
```

---

## Cómo cambiar…

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

## Antes de publicar (checklist)

- [ ] Número real en `WHATSAPP_NUMBER` (`js/config.js`) y en el JSON-LD.
- [ ] URL real de Facebook en `js/config.js` y en el JSON-LD.
- [ ] Precios reales en `js/services.js`.
- [ ] Fotos reales en `assets/img/`.
- [ ] Reemplazar `https://elizarodriguezbeauty.com/` por tu dominio real en `index.html`
      (etiquetas `canonical`, `og:url`, `og:image` y JSON-LD). La imagen de Open Graph **necesita la URL completa** para verse al compartir por WhatsApp.
- [ ] Mapa con la dirección exacta.
- [ ] Revisar horarios y medios de pago en la sección de preguntas.

---

## Publicar

### Netlify
1. Entra a [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta completa del proyecto. ¡Listo!

(O conecta el repositorio de GitHub: no requiere comando de build; la carpeta a publicar es la raíz.)

### Vercel
1. Sube el proyecto a GitHub.
2. En [vercel.com/new](https://vercel.com/new) importa el repositorio.
3. *Framework Preset*: **Other**. Sin comando de build. Deploy.

Después de publicar, prueba la vista previa del enlace en
[opengraph.xyz](https://www.opengraph.xyz) y el rendimiento en
[PageSpeed Insights](https://pagespeed.web.dev).

---

## Reservas guardadas (Netlify Forms)

Cada vez que alguien usa el formulario **Agenda tu cita**:
1. La reserva se guarda en Netlify (nombre, WhatsApp, correo, servicio, fecha, hora, comentario y autorización de datos).
2. Se abre WhatsApp con el mensaje listo para confirmar con Eliza.

**Dónde ver las reservas:** en [app.netlify.com](https://app.netlify.com) → tu sitio → **Forms** → formulario **reserva**.
Desde ahí se pueden exportar a CSV (Excel).

**Activar el formulario (una sola vez, después del primer deploy):**
1. En el panel del sitio, ve a **Forms** y pulsa **Enable form detection** si aparece.
2. Vuelve a publicar el sitio (arrastra la carpeta otra vez o haz *Trigger deploy*).

**Recibir cada reserva por correo:** *Site configuration → Notifications → Emails and webhooks → Form submission notifications →* **Add notification → Email notification**, formulario `reserva`.

**Límites del plan gratuito:** 100 envíos al mes. Incluye filtro anti-spam (campo trampa oculto).

> En tu computador (`localhost`) no se guarda nada: el guardado solo funciona en el sitio publicado en Netlify. WhatsApp sí abre en ambos casos.

**Protección de datos:** el formulario pide autorización expresa (Ley 1581 de 2012). Se recomienda publicar también una política de tratamiento de datos y no usar estos datos para otros fines sin permiso.

---

## Notas técnicas

- **Formulario:** guarda la reserva en **Netlify Forms** y además abre `wa.me` con el mensaje prellenado (ver sección *Reservas guardadas*).
- **Rendimiento:** imágenes WebP con `loading="lazy"` (excepto la portada, que se precarga), fuentes de Google sin bloquear el render, sin librerías externas.
- **Accesibilidad:** HTML semántico, textos `alt`, contraste AA (el dorado de texto usa `--gold-ink`), navegación con teclado en el menú, pestañas, comparador (flechas ← →) y carrusel, y respeto por `prefers-reduced-motion`.
- **SEO:** título y descripción, Open Graph, favicon y datos estructurados Schema.org `BeautySalon`.

---

© 2026 Eliza Rodriguez Beauty · Desarrollado por Noir Studio
