# SexyRose · Render en el servidor (SEO)

Cada dirección pública llega ya armada desde el servidor, con su título, descripción, canonical, hreflang y datos estructurados. Así Google la indexa sin depender de JavaScript. Después el navegador carga `/assets/app.js` y la web sigue funcionando como la demo.

## Direcciones

| Página | Español | Inglés | Portugués |
|---|---|---|---|
| Portada | `/` | `/en/` | `/pt/` |
| País | `/argentina` | `/en/argentina` | `/pt/argentina` |
| Lugar (provincia, zona o ciudad) | `/argentina/buenos-aires` | `/en/argentina/buenos-aires` | `/pt/argentina/buenos-aires` |
| Lugar + tipo de salida | `/argentina/buenos-aires/cena` | `/en/argentina/buenos-aires/dinner` | `/pt/argentina/buenos-aires/jantar` |
| Perfil | `/perfil/valentina` | `/en/profile/valentina` | `/pt/perfil/valentina` |
| Secciones privadas (no se indexan) | `/panel`, `/admin`, `/cuenta`, `/chat` | con `/en/` | con `/pt/` |

Reglas:

- **Redirecciones 301 a la dirección principal.** Se aplican a mayúsculas, barras finales y slugs viejos. Si cambiás la dirección de un lugar en Admin → SEO, la anterior queda redirigiendo.
- **Páginas que no existen:** responden 404.
- **Páginas fuera de Google (noindex):** las que tienen menos perfiles que el mínimo, y las provincias o zonas que tienen perfiles en una sola ciudad.
- **Idioma:** nunca se cambia solo según el navegador, porque Google tiene que ver cada versión. A quien llega en otro idioma se le muestra un aviso para cambiar. Si ya eligió un idioma antes, se lo lleva a esa versión.

## Probar en tu computadora

```bash
python3 build.py          # arma build/full.html
cd ssr
npm install               # instala jsdom (una vez)
node server.mjs           # http://localhost:8080
```

Para probarlo, abrí estas direcciones:

- http://localhost:8080/argentina/buenos-aires/cena
- http://localhost:8080/en/argentina/buenos-aires/dinner
- http://localhost:8080/sitemap.xml
- http://localhost:8080/robots.txt

Para ver lo que recibe Google: `curl -s http://localhost:8080/argentina/buenos-aires/cena | less`

## Sitio estático para el servidor

```bash
node build-static.mjs --site https://tudominio.com
```

Genera `ssr/dist/` con:

- una carpeta por dirección, en los 3 idiomas;
- `sitemap.xml` y `robots.txt`;
- `404.html`;
- `app.html`, la página para las secciones privadas;
- `/assets`.

Configuración para nginx:

```nginx
location /assets/ { expires 7d; }
location / {
  try_files $uri $uri/index.html /app.html;
}
error_page 404 /404.html;
```

## En producción

`render.mjs` recibe `db` con los datos reales de la API (Postgres). Hay dos formas de usarlo:

1. **Render en cada pedido** (`server.mjs` dentro de la API Node, detrás de nginx), con caché por dirección. La caché se borra cuando cambia un perfil, una ubicación o un texto de SEO.
2. **Regenerar el sitio estático** (`build-static.mjs`) cada vez que cambian esos datos.

Hay que cargar la dirección del sitio en Admin → SEO y enviar `https://tudominio.com/sitemap.xml` en Google Search Console.
