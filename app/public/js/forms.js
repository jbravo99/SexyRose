/* SexyRose — formularios de pre-registro y denuncia.
   Sin dependencias. Envía JSON con fetch y muestra la respuesta de la API ({ok:true} o {ok:false,error}).
   La validación replica la del servidor para dar aviso antes de enviar; el servidor siempre valida igual. */
(function () {
  "use strict";

  var GENEROS = ["mujer", "trans", "hombre"];
  var CONTACTO_TIPOS = ["whatsapp", "telegram", "email"];
  var PLANES = ["bronce", "plata", "oro", "platino", "diamante", "star", "no_se"];
  var CATEGORIAS = ["abuso_infantil", "imagen_sin_consentimiento", "trata", "otro"];
  /* Igual que en el servidor (server.js EMAIL_RE). */
  var EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
  var TELEGRAM_USER_RE = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;

  /* Textos editables desde el editor de textos del admin: la página trae un bloque oculto #textos-form con un
     <span data-t="clave"> por mensaje. Si falta (o está vacío), se usa el texto de acá. */
  function T(key, fallback) {
    var el = document.querySelector('#textos-form [data-t="' + key + '"]');
    var v = el ? el.textContent.trim() : "";
    return v || fallback;
  }

  /* Largo en caracteres (code points), como cuenta el servidor. */
  function len(v) { return String(v || "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "_").length; }

  /* El servidor acepta también enlaces t.me/usuario. */
  function telegramUserOk(v) { return TELEGRAM_USER_RE.test(v.replace(/^(https?:\/\/)?(www\.)?t\.me\//i, "")); }

  /* Misma regla que el servidor: http(s), con dominio; sin esquema se asume https://. */
  function urlOk(v) {
    var u;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); } catch (e) { return false; }
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.indexOf(".") !== -1;
  }

  function phoneOk(v) {
    if (!/^\+?[\d\s().-]+$/.test(v)) return false;
    var digits = v.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  var CONTACTO_UI = {
    whatsapp: { label: "Tu número de WhatsApp", type: "tel", inputmode: "tel", autocomplete: "tel",
      hint: "Con código de área. Ejemplo: 11 2345 6789. No lo publicamos." },
    telegram: { label: "Tu usuario o número de Telegram", type: "text", inputmode: "text", autocomplete: "off",
      hint: "Tu usuario (por ejemplo, @tunombre) o tu número. No lo publicamos." },
    email: { label: "Tu email", type: "email", inputmode: "email", autocomplete: "email",
      hint: "Te escribimos solo por el lanzamiento. No lo publicamos." }
  };

  /* Reglas por formulario: cada una devuelve un mensaje de error o "" si está bien. */
  var RULES = {
    "form-preregistro": {
      nombre_artistico: function (v) {
        if (!v) return T("error-nombre-vacio", "Escribí tu nombre artístico.");
        if (len(v) < 2 || len(v) > 40) return T("error-nombre-largo", "El nombre artístico tiene que tener entre 2 y 40 caracteres.");
        return "";
      },
      genero: function (v) { return GENEROS.indexOf(v) === -1 ? T("error-genero", "Elegí tu género.") : ""; },
      provincia: function (v) { return !v ? T("error-provincia", "Elegí tu provincia.") : ""; },
      ciudad: function (v) {
        if (!v) return T("error-ciudad-vacia", "Escribí tu ciudad o localidad.");
        if (len(v) < 2 || len(v) > 80) return T("error-ciudad-largo", "La ciudad tiene que tener entre 2 y 80 caracteres.");
        return "";
      },
      contacto_tipo: function (v) { return CONTACTO_TIPOS.indexOf(v) === -1 ? T("error-contacto-tipo", "Elegí cómo te contactamos.") : ""; },
      contacto: function (v, data) {
        var tipo = data.contacto_tipo;
        if (!v) return tipo === "email" ? T("error-email-vacio", "Escribí tu email.") : T("error-contacto-vacio", "Escribí tu dato de contacto.");
        if (len(v) > 120) return T("error-contacto-largo", "El dato de contacto es demasiado largo.");
        if (tipo === "whatsapp" && !phoneOk(v)) return T("error-whatsapp", "Revisá el número: tiene que tener entre 8 y 15 dígitos, con código de área.");
        if (tipo === "telegram" && !telegramUserOk(v) && !phoneOk(v)) return T("error-telegram", "Escribí tu usuario de Telegram (por ejemplo, @tunombre) o tu número.");
        if (tipo === "email" && (len(v) > 254 || !EMAIL_RE.test(v))) return T("error-email", "Revisá el email: parece que no está bien escrito.");
        return "";
      },
      plan_interes: function (v) { return PLANES.indexOf(v) === -1 ? T("error-plan", "Elegí un plan o la opción \"Todavía no sé\".") : ""; },
      mayor_edad: function (v) { return v !== true ? T("error-mayor-edad", "Tenés que confirmar que sos mayor de 18 años.") : ""; },
      acepta_terminos: function (v) { return v !== true ? T("error-terminos", "Tenés que aceptar los Términos y la Política de privacidad.") : ""; }
    },
    "form-denuncia": {
      categoria: function (v) { return CATEGORIAS.indexOf(v) === -1 ? T("error-categoria", "Elegí qué querés denunciar.") : ""; },
      url: function (v) {
        if (!v) return "";
        if (len(v) > 2000) return T("error-url-largo", "El enlace es demasiado largo.");
        return urlOk(v) ? "" : T("error-url", "Revisá el enlace: pegá la dirección completa (por ejemplo, https://sexyrose.net/...) o dejalo vacío.");
      },
      descripcion: function (v) {
        if (!v) return T("error-descripcion-vacia", "Contanos qué pasó.");
        if (len(v) < 10) return T("error-descripcion-corta", "La descripción tiene que tener al menos 10 caracteres.");
        if (len(v) > 4000) return T("error-descripcion-larga", "La descripción puede tener hasta 4000 caracteres.");
        return "";
      },
      email: function (v) { return v && (len(v) > 254 || !EMAIL_RE.test(v)) ? T("error-email", "Revisá el email: parece que no está bien escrito.") : ""; }
    }
  };

  /* Campos opcionales que no se envían si quedan vacíos. */
  var OPTIONAL = { "form-denuncia": ["url", "email"] };

  var SUCCESS = {
    "form-preregistro": function () {
      return T("ok-preregistro", "Listo, recibimos tu pre-registro. Te vamos a contactar por el medio que elegiste cuando abran las cuentas.");
    },
    "form-denuncia": function (res) {
      var msg = T("ok-denuncia", "Recibimos tu denuncia. La vamos a revisar según los plazos de la Política de contenido.");
      if (res && res.id) msg += " " + T("ok-denuncia-referencia", "Número de referencia:") + " " + String(res.id) + ".";
      return msg;
    }
  };

  function collect(form) {
    var data = {};
    var els = form.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.disabled) continue;
      if (el.type === "checkbox") { data[el.name] = el.checked; continue; }
      if (el.type === "radio") { if (el.checked) data[el.name] = el.value; else if (!(el.name in data)) data[el.name] = ""; continue; }
      if (el.type === "submit" || el.type === "button") continue;
      data[el.name] = el.name === "website" ? el.value : String(el.value || "").trim();
    }
    return data;
  }

  function fieldEls(form, name) {
    var list = form.querySelectorAll('[name="' + name + '"]');
    return Array.prototype.slice.call(list);
  }

  function errorEl(form, name) {
    var first = fieldEls(form, name)[0];
    if (!first) return null;
    var holder = first.closest(".field");
    return holder ? holder.querySelector(".field-error") : null;
  }

  function setFieldError(form, name, msg) {
    var err = errorEl(form, name);
    if (err) err.textContent = msg;
    fieldEls(form, name).forEach(function (el) {
      if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    });
  }

  function validate(form, data) {
    var rules = RULES[form.id] || {};
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      var msg = rules[name](data[name], data);
      setFieldError(form, name, msg);
      if (msg && !firstBad) firstBad = name;
    });
    return firstBad;
  }

  function setStatus(form, kind, msg) {
    var box = form.querySelector(".status");
    if (!box) return;
    box.className = "status" + (kind ? " " + kind : "");
    box.textContent = msg || "";
  }

  function parseJson(res) {
    return res.text().then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { return null; }
    });
  }

  function fallbackError(status) {
    if (status === 429) return T("error-429", "Hiciste muchos envíos seguidos. Probá de nuevo en un rato.");
    if (status >= 500) return T("error-500", "Hubo un problema en el servidor. Probá de nuevo en unos minutos.");
    return T("error-envio", "No pudimos enviar el formulario. Revisá los datos y probá de nuevo.");
  }

  function onSubmit(ev) {
    var form = ev.currentTarget;
    ev.preventDefault();
    if (form.getAttribute("data-sending") === "1") return;

    var data = collect(form);
    var bad = validate(form, data);
    if (bad) {
      setStatus(form, "error", T("revisar-campos", "Revisá los campos marcados."));
      var el = fieldEls(form, bad)[0];
      if (el) el.focus();
      return;
    }
    (OPTIONAL[form.id] || []).forEach(function (name) { if (data[name] === "") delete data[name]; });

    var btn = form.querySelector('button[type="submit"]');
    var label = btn ? btn.textContent : "";
    form.setAttribute("data-sending", "1");
    form.setAttribute("aria-busy", "true");
    if (btn) { btn.disabled = true; btn.textContent = T("enviando", "Enviando…"); }
    setStatus(form, "info", T("enviando", "Enviando…"));

    var endpoint = form.getAttribute("action");
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(data)
    }).then(function (res) {
      return parseJson(res).then(function (json) {
        if (res.ok && json && json.ok) {
          form.reset();
          syncContacto(form);
          updateCounters(form);
          setStatus(form, "ok", SUCCESS[form.id] ? SUCCESS[form.id](json) : T("ok-generico", "Listo, recibimos tu envío."));
        } else {
          var msg = json && json.error ? String(json.error) : fallbackError(res.status);
          setStatus(form, "error", msg);
        }
      });
    }).catch(function () {
      setStatus(form, "error", T("error-conexion", "No pudimos conectarnos. Revisá tu conexión y probá de nuevo."));
    }).then(function () {
      form.removeAttribute("data-sending");
      form.removeAttribute("aria-busy");
      if (btn) { btn.disabled = false; btn.textContent = label; }
    });
  }

  /* Ajusta el campo de contacto según el tipo elegido. */
  function syncContacto(form) {
    var tipo = form.querySelector('[name="contacto_tipo"]');
    var input = form.querySelector('[name="contacto"]');
    if (!tipo || !input) return;
    var ui = CONTACTO_UI[tipo.value] || CONTACTO_UI.whatsapp;
    var label = form.querySelector('label[for="' + input.id + '"]');
    var hint = document.getElementById(input.id + "-hint");
    var t = CONTACTO_UI[tipo.value] ? tipo.value : "whatsapp";
    if (label) label.textContent = T("contacto-" + t + "-etiqueta", ui.label);
    if (hint) hint.textContent = T("contacto-" + t + "-ayuda", ui.hint);
    input.type = ui.type;
    input.setAttribute("inputmode", ui.inputmode);
    input.setAttribute("autocomplete", ui.autocomplete);
  }

  function updateCounters(form) {
    var counters = form.querySelectorAll("[data-counter-for]");
    Array.prototype.forEach.call(counters, function (c) {
      var field = document.getElementById(c.getAttribute("data-counter-for"));
      if (!field) return;
      var max = field.getAttribute("maxlength") || "";
      c.textContent = field.value.length + (max ? " de " + max : "") + " caracteres";
    });
  }

  function init(form) {
    form.setAttribute("novalidate", "");
    form.addEventListener("submit", onSubmit);

    /* Al corregir un campo, se limpia su error. */
    form.addEventListener("input", function (ev) {
      var name = ev.target && ev.target.name;
      if (name && ev.target.getAttribute("aria-invalid") === "true") {
        var rules = RULES[form.id] || {};
        var data = collect(form);
        if (rules[name] && !rules[name](data[name], data)) setFieldError(form, name, "");
      }
      if (ev.target && ev.target.id) {
        var c = form.querySelector('[data-counter-for="' + ev.target.id + '"]');
        if (c) updateCounters(form);
      }
    });
    form.addEventListener("change", function (ev) {
      if (ev.target && ev.target.name === "contacto_tipo") {
        syncContacto(form);
        setFieldError(form, "contacto", "");
      }
      if (ev.target && (ev.target.type === "checkbox" || ev.target.type === "radio" || ev.target.tagName === "SELECT")) {
        var rules = RULES[form.id] || {};
        var data = collect(form);
        var name = ev.target.name;
        if (rules[name] && !rules[name](data[name], data)) setFieldError(form, name, "");
      }
    });

    syncContacto(form);
    updateCounters(form);
  }

  function start() {
    ["form-preregistro", "form-denuncia"].forEach(function (id) {
      var form = document.getElementById(id);
      if (form) init(form);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
