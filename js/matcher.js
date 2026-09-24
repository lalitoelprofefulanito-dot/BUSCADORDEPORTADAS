/* =====================================================================
   js/matcher.js — Motor de coincidencia y clasificación
   Cada campo produce una similitud 0–1; la confianza es el promedio
   ponderado (BB.CONFIG.pesos) SOLO sobre los campos que el usuario aportó.
   Si la fuente no informa un campo solicitado, ese campo cuenta como 0.
   ===================================================================== */
BB.Matcher = (() => {
  const U = BB.Utils, E = BB.ESTADOS;

  function bigramas(s) {
    const t = s.replace(/ /g, ''), m = new Map();
    for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); }
    return m;
  }
  function diceBigramas(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigramas(a), B = bigramas(b);
    let inter = 0, total = 0;
    A.forEach((v, k) => { total += v; if (B.has(k)) inter += Math.min(v, B.get(k)); });
    B.forEach(v => { total += v; });
    return total ? (2 * inter) / total : 0;
  }

  /** Similitud general de textos: máximo entre Dice de tokens, contención y bigramas. */
  function simTexto(a, b) {
    const ta = U.tokens(a), tb = U.tokens(b);
    if (!ta.length || !tb.length) return 0;
    const na = ta.join(' '), nb = tb.join(' ');
    if (na === nb) return 1;
    const sa = new Set(ta), sb = new Set(tb);
    let inter = 0; sa.forEach(t => { if (sb.has(t)) inter++; });
    const dice = (2 * inter) / (sa.size + sb.size);
    // La contención vale según cuánto del texto largo cubre el corto:
    // «Agua» dentro de «Como agua para chocolate» ya no cuenta como coincidencia fuerte.
    const cobertura = Math.sqrt(Math.min(sa.size, sb.size) / Math.max(sa.size, sb.size));
    const contencion = (inter / Math.min(sa.size, sb.size)) * cobertura;
    return Math.min(1, Math.max(dice, contencion * 0.9, diceBigramas(na, nb) * 0.95));
  }

  function simTitulo(solicitado, cand) {
    const completo = [cand.obra.titulo, cand.obra.subtitulo].filter(Boolean).join(' ');
    return Math.max(simTexto(solicitado, cand.obra.titulo), simTexto(solicitado, completo));
  }

  /** Proporción de palabras del autor solicitado presentes en los autores de la fuente (tolera erratas). */
  function simAutor(solicitado, autores) {
    const req = U.tokens(solicitado).filter(t => t.length > 1);
    const disp = U.tokens((autores || []).join(' ')).filter(t => t.length > 1);
    if (!req.length || !disp.length) return 0;
    let ok = 0;
    req.forEach(t => { if (disp.some(d => d === t || diceBigramas(d, t) >= 0.85)) ok++; });
    return ok / req.length;
  }

  const RUIDO_EDITORIAL = /\b(editorial|editora|editores|editor|ediciones|edicion|ed|eds|sa|s a|de|cv|c v|sl|s l|grupo|libros|publishing|publishers|press|inc|ltd|co|company)\b/g;
  function limpiarEditorial(s) {
    let n = U.normalizarTexto(s).replace(/secretaria de educacion publica/g, 'sep');
    const limpia = n.replace(RUIDO_EDITORIAL, ' ').replace(/\s+/g, ' ').trim();
    return limpia || n;
  }
  /** Siglas: «FCE» ↔ «Fondo de Cultura Económica», «UNAM», «SEP», etc. */
  function iniciales(s) { return U.tokens(s).map(t => t[0]).join(''); }
  function coincideSigla(a, b) {
    const ta = U.normalizarTexto(a).replace(/ /g, ''), tb = U.normalizarTexto(b).replace(/ /g, '');
    return (ta.length >= 2 && ta.length <= 6 && !/\d/.test(ta) && ta === iniciales(b)) ||
           (tb.length >= 2 && tb.length <= 6 && !/\d/.test(tb) && tb === iniciales(a));
  }
  function simEditorial(a, b) {
    const pa = limpiarEditorial(a), pb = limpiarEditorial(b);
    if (!pa || !pb) return 0;
    if (String(b).split('/').some(x => coincideSigla(pa, limpiarEditorial(x)))) return 1;
    // Varias editoriales separadas por "/" en la fuente: se toma la mejor
    return Math.max(...String(b).split('/').map(x => simTexto(pa, limpiarEditorial(x))), simTexto(pa, pb));
  }

  function simAnio(a, b) {
    if (!a || !b) return 0;
    const d = Math.abs(+a - +b);
    return d === 0 ? 1 : d === 1 ? 0.6 : d <= 3 ? 0.3 : 0;
  }

  /** Evalúa un candidato frente a la solicitud. Devuelve {score, det}. */
  function evaluar(req, cand) {
    const P = BB.CONFIG.pesos, det = {};
    if (req.isbn) det.isbn = cand.edicion.isbns13.includes(req.isbn.isbn13) ? 1 : 0;
    if (req.titulo) det.titulo = cand.obra.titulo ? simTitulo(req.titulo, cand) : 0;
    if (req.autor) det.autor = simAutor(req.autor, cand.obra.autores);
    if (req.editorial) det.editorial = cand.edicion.editorial ? simEditorial(req.editorial, cand.edicion.editorial) : 0;
    if (req.anio) det.anio = simAnio(req.anio, cand.edicion.anio);
    let num = 0, den = 0;
    Object.keys(det).forEach(k => { num += (P[k] || 0) * det[k]; den += (P[k] || 0); });
    let score = den ? (num / den) * 100 : 0;
    // Procedencia: señales que no son campos ponderados, sino alertas sobre la edición encontrada.
    const Pr = BB.CONFIG.procedencia, alertas = {};
    if (!req.isbn && Pr.prefijosISBN.length && cand.edicion.isbn13 && !Pr.prefijosISBN.some(x => cand.edicion.isbn13.startsWith(x))) {
      alertas.fueraRegion = true; score *= Pr.factorFueraDeRegion;
    }
    if (Pr.autoedicion && new RegExp(Pr.autoedicion, 'i').test(cand.edicion.editorial)) alertas.autoedicion = true;
    return { score: Math.round(score), det, alertas };
  }

  /** Lista explícita de discrepancias: nunca se ocultan diferencias de ISBN, editorial o año. */
  function discrepancias(req, cand) {
    const obs = [], d = (cand.ev && cand.ev.det) || {}, ed = cand.edicion;
    if ('isbn' in d && d.isbn === 0) {
      obs.push(ed.isbn13 || ed.isbn10
        ? `ISBN distinto: solicitado ${req.isbn.normal}, encontrado ${ed.isbn13 || ed.isbn10}`
        : 'La fuente no informa ISBN para este resultado; no se puede confirmar la edición');
    }
    if ('titulo' in d && d.titulo < 0.85) obs.push(`Título con diferencias: solicitado «${req.titulo}»`);
    if ('autor' in d && d.autor < 0.6) obs.push(cand.obra.autores.length ? `Autor distinto: solicitado «${req.autor}»` : 'La fuente no informa autor');
    if ('editorial' in d && d.editorial < BB.CONFIG.umbrales.editorialEdicion) {
      obs.push(ed.editorial ? `Editorial distinta: solicitada «${req.editorial}», encontrada «${ed.editorial}»` : 'La fuente no informa editorial');
    }
    if ('anio' in d && d.anio < 1) obs.push(ed.anio ? `Año distinto: solicitado ${req.anio}, encontrado ${ed.anio}` : 'La fuente no informa año de publicación');
    const al = (cand.ev && cand.ev.alertas) || {};
    if (al.fueraRegion) obs.push(`Edición de otro país (ISBN ${ed.isbn13}); se esperaba una edición mexicana`);
    if (al.autoedicion) obs.push(`Autoedición («${ed.editorial}»): casi nunca corresponde a un libro escolar`);
    if (!req.isbn && !req.autor && !req.editorial && !req.anio) obs.push('Solo se buscó por título: sin autor, editorial ni año no se puede distinguir entre obras con títulos parecidos');
    return obs;
  }

  /** Clave de edición: ISBN-13 o, si no hay, editorial + año normalizados. */
  function esOtraEdicion(a, b) {
    if (a.edicion.isbn13 && b.edicion.isbn13) return a.edicion.isbn13 !== b.edicion.isbn13;
    return limpiarEditorial(a.edicion.editorial) !== limpiarEditorial(b.edicion.editorial) || a.edicion.anio !== b.edicion.anio;
  }

  /**
   * Clasifica el resultado de un registro.
   * @param forzado candidato elegido manualmente (omite la comprobación de ambigüedad)
   */
  function clasificar(req, cands, forzado) {
    const T = BB.CONFIG.umbrales;
    if (!cands.length) {
      return { estado: E.NO_ENCONTRADO, motivo: req.isbn || req.titulo ? 'Ninguna fuente devolvió resultados' : 'Datos insuficientes: falta ISBN válido o título' };
    }
    const best = forzado || cands[0], d = best.ev.det, s = best.ev.score;

    if (req.isbn) {
      if (d.isbn === 1) {
        if (req.titulo && d.titulo < 0.5) return { estado: E.REVISION, motivo: 'El ISBN coincide, pero el título difiere mucho: posible error de captura' };
        if (s >= T.confirmado) return { estado: E.CONFIRMADO, motivo: req.titulo ? 'ISBN exacto y datos concordantes' : 'ISBN exacto' };
        return { estado: E.PROBABLE, motivo: 'ISBN exacto, pero algunos datos secundarios difieren' };
      }
      const obra = (d.titulo || 0) >= T.tituloObra && (!req.autor || (d.autor || 0) >= T.autorObra);
      if (obra) return { estado: E.DIFERENTE, motivo: 'La obra coincide, pero el ISBN solicitado no aparece: el resultado corresponde a otra edición' };
      return { estado: E.NO_ENCONTRADO, motivo: req.titulo ? 'Ni el ISBN ni el título producen una coincidencia suficiente' : 'No se encontró ningún registro con ese ISBN' };
    }

    if (!req.titulo) return { estado: E.NO_ENCONTRADO, motivo: 'Datos insuficientes: falta ISBN válido o título' };
    if ((d.titulo || 0) < 0.5 || s < T.minimo) return { estado: E.NO_ENCONTRADO, motivo: 'Ningún resultado alcanza la coincidencia mínima' };
    if (best.ev.alertas && best.ev.alertas.autoedicion) return { estado: E.REVISION, motivo: 'El mejor resultado es una autoedición; verifique que sea el mismo libro' };

    if (!req.autor && !req.editorial && !req.anio) {
      const palabras = U.tokens(req.titulo).length;
      if (palabras < T.tituloSoloPalabras || d.titulo < T.tituloSoloSimilitud) {
        return { estado: E.REVISION, motivo: 'Solo se dio el título y es breve o no coincide completo; agregue autor o editorial para identificar la obra' };
      }
      return { estado: E.PROBABLE, motivo: 'Solo se dio el título: la obra parece coincidir, pero sin autor ni editorial no se puede confirmar' };
    }

    const obraOK = d.titulo >= T.tituloObra && (!req.autor || d.autor >= T.autorObra);
    const edicionDistinta = (req.editorial && d.editorial < 0.5) || (req.anio && d.anio < 0.5);
    if (obraOK && edicionDistinta) return { estado: E.DIFERENTE, motivo: 'La obra coincide, pero la editorial o el año no corresponden a la edición solicitada' };

    if (!forzado) {
      const rivales = cands.filter(c => c !== best && esOtraEdicion(c, best) && c.ev.score >= T.probable && best.ev.score - c.ev.score < T.margenAmbiguedad);
      if (rivales.length) return { estado: E.REVISION, motivo: `Hay ${rivales.length + 1} ediciones plausibles con puntuación similar; elija la correcta` };
    }

    const edicionOK = req.editorial && req.anio && d.editorial >= T.editorialEdicion && d.anio === 1;
    if (obraOK && edicionOK && s >= T.confirmado) return { estado: E.CONFIRMADO, motivo: 'Título, autor, editorial y año concuerdan (sin ISBN de contraste)' };
    if (s >= T.probable) return { estado: E.PROBABLE, motivo: obraOK ? 'La obra coincide; falta confirmar la edición (ISBN, editorial o año)' : 'Coincidencia parcial de datos' };
    return { estado: E.REVISION, motivo: 'Coincidencia débil; requiere revisión' };
  }

  return { simTexto, simAutor, simEditorial, simAnio, evaluar, discrepancias, clasificar, esOtraEdicion };
})();
