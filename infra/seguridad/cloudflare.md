# Ajustes de seguridad en Cloudflare (los hacés vos, una sola vez)

Todo esto está en el panel de Cloudflare, dominio **sexyrose.net**. No hay que tocar el servidor ni hacer deploy.

## 1. HTTPS siempre

**SSL/TLS → Edge Certificates** (en el panel nuevo puede estar en **SSL/TLS → Certificados perimetrales**):

1. **Always Use HTTPS**: activado. Todo lo que entre por `http://` se redirige a `https://`.
2. **Minimum TLS Version**: **TLS 1.2**. Deja afuera navegadores de hace más de 10 años, que ya no son seguros.
3. **HTTP Strict Transport Security (HSTS)** → **Enable HSTS**. Cloudflare avisa que es difícil de deshacer: aceptá y configurá así:
   - **Status**: On.
   - **Max Age**: **6 months** (15768000).
   - **Include subdomains**: On. `www` sirve el sitio por HTTPS y `mg.sexyrose.net` es solo para emails (Mailgun), así que no se rompe nada.
   - **Preload**: **Off por ahora**.
   - **No-Sniff header**: On.

**Qué hace HSTS:** le dice al navegador "a este sitio entrá siempre por HTTPS, aunque te escriban http". Así nadie puede desviar la primera visita en una red Wi-Fi pública antes de la redirección.

**Por qué sin Preload:** "preload" mete el dominio en una lista que viene dentro de los navegadores, y sacarlo de ahí lleva meses. Conviene activarlo recién cuando el sitio lleve un tiempo estable con HTTPS en todo, incluidos los subdominios que agregues. Mientras tanto, con 6 meses alcanza.

**Si algún día tenés que desactivarlo:** primero bajá **Max Age a 0**, esperá unos días y recién ahí apagalo. Los navegadores que ya lo vieron lo recuerdan hasta que vence el Max Age.

## 2. Límite de intentos en ingreso, registro y contraseña

El sitio ya limita los intentos por su cuenta. Esta regla frena antes, en Cloudflare, a quien prueba contraseñas en masa, y no llega a tu servidor.

**Security → WAF → Rate limiting rules → Create rule:**

- **Rule name**: `Ingreso y registro`.
- **If incoming requests match** → **Edit expression** y pegá:

  ```
  (http.request.uri.path in {"/api/cuenta/login" "/api/cuenta/registro" "/api/cuenta/olvide" "/api/cuenta/restablecer" "/api/cliente/login" "/api/cliente/registro" "/api/cliente/olvide" "/api/cliente/restablecer"})
  ```

  Son las direcciones reales del sitio para ingresar, registrarse, pedir el cambio de contraseña y cambiarla, para acompañantes (`/api/cuenta/`) y para interesados (`/api/cliente/`).
- **With the same characteristics**: **IP**.
- **When rate exceeds**: **5 requests** per **10 seconds**.
- **Then take action**: **Block**, por **10 seconds**.
- **Deploy**.

**Qué permite el plan gratis** (según la documentación de Cloudflare; no la pude abrir desde acá, así que fijate si la pantalla te ofrece otros valores):
- **1 sola regla** de límite. Por eso todas las direcciones van juntas en una.
- **Período de 10 segundos** y **bloqueo de 10 segundos**.
- **Contar por IP.**
- **Filtrar solo por dirección (path).** El plan gratis no deja filtrar por método (POST), pero estas direcciones solo reciben POST, así que da igual.

Si la pantalla te deja elegir más tiempo de bloqueo, usá 1 minuto.

**Probar que no molesta:** después de activarla, entrá a tu panel de acompañante normalmente. Un humano no llega a 5 intentos en 10 segundos. Si alguien queda bloqueado, en **Security → Events** ves la regla que lo frenó.

## 3. Ya hecho (no hace falta tocar)

- **Admin protegido con Cloudflare Access**: pide un código por email antes de llegar a la dirección secreta.
- **Túnel**: el servidor no tiene puertos web abiertos; el tráfico entra solo por Cloudflare.
