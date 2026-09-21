/* =====================================================================
   js/isbn.js — Normalización, validación y conversión de ISBN
   ===================================================================== */
BB.ISBN = (() => {
  function normalizarISBN(s) {
    return BB.Utils.limpio(s).toUpperCase()
      .replace(/^ISBN(-1[03])?\s*:?\s*/, '')
      .replace(/[\s\-\u2010-\u2015.]/g, '');
  }

  function validarISBN10(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += (s[i] === 'X' ? 10 : +s[i]) * (10 - i);
    return suma % 11 === 0;
  }

  function validarISBN13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    let suma = 0;
    for (let i = 0; i < 13; i++) suma += (+s[i]) * (i % 2 ? 3 : 1);
    return suma % 10 === 0;
  }

  function convertirISBN10a13(s) {
    if (!validarISBN10(s)) return '';
    const base = '978' + s.slice(0, 9);
    let suma = 0;
    for (let i = 0; i < 12; i++) suma += (+base[i]) * (i % 2 ? 3 : 1);
    return base + ((10 - (suma % 10)) % 10);
  }

  /** Solo los ISBN-13 con prefijo 978 tienen equivalente ISBN-10. */
  function convertirISBN13a10(s) {
    if (!validarISBN13(s) || !s.startsWith('978')) return '';
    const base = s.slice(3, 12);
    let suma = 0;
    for (let i = 0; i < 9; i++) suma += (+base[i]) * (10 - i);
    const c = (11 - (suma % 11)) % 11;
    return base + (c === 10 ? 'X' : String(c));
  }

  /** Análisis completo de una cadena: tipo, validez, equivalencias y mensaje de error legible. */
  function analizar(raw) {
    const normal = normalizarISBN(raw);
    const r = { entrada: BB.Utils.limpio(raw), normal, tipo: '', valido: false, isbn10: '', isbn13: '', error: '' };
    if (!normal) return r;
    if (normal.length === 10) {
      r.tipo = 'ISBN-10'; r.valido = validarISBN10(normal);
      if (r.valido) { r.isbn10 = normal; r.isbn13 = convertirISBN10a13(normal); }
      else r.error = /^\d{9}[\dX]$/.test(normal) ? 'ISBN-10 con dígito de control incorrecto' : 'ISBN-10 con caracteres no válidos';
    } else if (normal.length === 13) {
      r.tipo = 'ISBN-13'; r.valido = validarISBN13(normal);
      if (r.valido) { r.isbn13 = normal; r.isbn10 = convertirISBN13a10(normal); }
      else r.error = /^\d{13}$/.test(normal) ? 'ISBN-13 con dígito de control incorrecto' : 'ISBN-13 con caracteres no válidos';
    } else {
      r.error = `Longitud no válida para un ISBN (${normal.length} caracteres; se esperan 10 o 13)`;
    }
    return r;
  }

  /** ¿La cadena tiene forma de ISBN (aunque su dígito de control sea incorrecto)? */
  function pareceISBN(s) {
    const n = normalizarISBN(s);
    return /^\d{9}[\dX]$/.test(n) || /^\d{13}$/.test(n);
  }

  return { normalizarISBN, validarISBN10, validarISBN13, convertirISBN10a13, convertirISBN13a10, analizar, pareceISBN };
})();
