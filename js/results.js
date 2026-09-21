/* =====================================================================
   js/results.js — Estado de la sesión y renderizado de resultados
   ===================================================================== */
BB.Results = (() => {
  const U = BB.Utils, E = BB.ESTADOS, esc = U.esc;
  const S = { registros: [], filtro: 'TODOS', orden: 'num', abiertos: new Set(), ordenCand: {}, siguiente: 1 };

  const CLASE_ESTADO = {
    [E.CONFIRMADO]: 'confirmado', [E.PROBABLE]: 'probable', [E.DIFERENTE]: 'diferente',
    [E.REVISION]: 'revision', [E.NO_ENCONTRADO]: 'noenc', [E.PENDIENTE]: 'pendiente', [E.PROCESANDO]: 'procesando'
  };
  const FILTROS = [
    ['TODOS', 'Todos'], [E.CONFIRMADO, 'Confirmados'], [E.PROBABLE, 'Probables'], [E.DIFERENTE, 'Edición diferente'],
    [E.REVISION, 'Revisión manual'], [E.NO_ENCONTRADO, 'No encontrados'], [E.PENDIENTE, 'Pendientes']
  ];

  /* ---------------------------- Consultas --------------------------- */
  const seleccionado = reg => (reg.candidatos || []).find(c => c.id === reg.seleccion) || null;

  function portadaDe(reg) {
    if (reg.portadaOverride) return reg.portadaOverride;
    const c = seleccionado(reg);
    if (c && c.edicion.portadaEstado === 'verificada') return { url: c.edicion.portadaUrl, fuente: c.fuente, nivel: c.edicion.portadaNivel };
    return null;
  }

  function observaciones(reg) {
    const o = [].concat(reg.obsEntrada || []);
    if (reg.duplicadoDe) o.push(`Registro duplicado del n.º ${reg.duplicadoDe}`);
    if (reg.motivo) o.push(reg.motivo);
    const c = seleccionado(reg);
    if (c) {
      o.push(...BB.Matcher.discrepancias(reg.req, c));
      if (reg.portadaOverride) o.push(reg.portadaOverride.nota);
      else if (!c.edicion.portadaUrl) o.push('La fuente no ofrece portada para este resultado');
      else if (c.edicion.portadaEstado === 'inaccesible') o.push('Portada no disponible: ' + c.edicion.portadaMotivo);
      else if (c.edicion.portadaNivel === 'obra') o.push('Portada asociada a la obra, no verificada para esta edición');
      else if (c.edicion.portadaNivel === 'volumen') o.push('Portada de un volumen sin ISBN: no se puede asegurar la edición');
    }
    (reg.errores || []).forEach(e => o.push(`${e.fuente}: ${e.mensaje}`));
    if (reg.validadoManual) o.push(`Validado manualmente el ${U.fechaLegible(reg.validadoManual)}`);
    else if (reg.seleccionManual) o.push('Resultado elegido manualmente, pendiente de confirmar');
    if (reg.marcadoNoEncontrado) o.push('Marcado manualmente como no encontrado');
    return [...new Set(o.filter(Boolean))];
  }

  function contar() {
    const c = { total: S.registros.length, encontrados: 0 };
    Object.values(E).forEach(e => { c[e] = 0; });
    S.registros.forEach(r => {
      const e = r.estado === E.PROCESANDO ? E.PENDIENTE : r.estado;
      c[e]++;
      if (seleccionado(r) && ![E.NO_ENCONTRADO, E.PENDIENTE, E.PROCESANDO].includes(r.estado)) c.encontrados++;
    });
    return c;
  }

  /* ------------------------------ Vista ----------------------------- */
  const guion = v => (U.limpio(v) ? esc(v) : '<span class="nd">—</span>');

  function claseCampo(c, campo) {
    if (!c || !c.ev || !(campo in c.ev.det)) return '';
    const v = c.ev.det[campo];
    return v >= 0.85 ? 'coincide' : v >= 0.5 ? 'parcial' : 'difiere';
  }
  function solicitado(c, campo, valor) {
    const k = claseCampo(c, campo);
    return valor && k && k !== 'coincide' ? `<div class="solicitado">Solicitado: ${esc(valor)}</div>` : '';
  }
  function barraConfianza(score) {
    const n = Math.max(0, Math.min(100, score));
    const tono = n >= 85 ? 'alta' : n >= 60 ? 'media' : 'baja';
    return `<div class="confianza ${tono}"><div class="pista"><span style="width:${n}%"></span></div><b>${n}%</b></div>`;
  }
  function enlaceCorto(url, texto) {
    if (!url) return '<span class="nd">—</span>';
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { host = 'enlace'; }
    return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(texto || host)}</a>`;
  }

  function filaHTML(reg) {
    const c = seleccionado(reg), p = portadaDe(reg), e = reg.entrada, abierto = S.abiertos.has(reg.id);
    const k = CLASE_ESTADO[reg.estado] || 'pendiente';
    const obs = reg.estado === E.PENDIENTE || reg.estado === E.PROCESANDO ? [] : observaciones(reg);
    const isbnSol = reg.req && reg.req.isbn ? reg.req.isbn.normal : U.limpio(e.isbn);
    const n = (reg.candidatos || []).length;
    return `<tr class="fila e-${k}${abierto ? ' abierta' : ''}" data-id="${reg.id}">
      <td class="c-estado">
        <span class="insignia e-${k}">${esc(reg.estado)}</span>
        ${reg.validadoManual ? '<span class="sello-manual">Validado a mano</span>' : ''}
        <div class="num">n.º ${reg.num}${e.fila ? ' · ' + esc(e.fila) : ''}</div>
        <div class="botones-fila">
          ${n ? `<button type="button" class="mini" data-accion="detalle" aria-expanded="${abierto}">${abierto ? 'Cerrar detalle' : `Detalle (${n})`}</button>` : ''}
          ${reg.reintentable ? '<button type="button" class="mini" data-accion="reintentar">Reintentar</button>' : ''}
        </div>
      </td>
      <td class="c-portada">${p
        ? `<button type="button" class="miniatura" data-accion="ver-portada" title="Ampliar portada"><img src="${esc(p.url)}" alt="Portada" loading="lazy" referrerpolicy="no-referrer"></button>`
        : `<div class="sin-portada">${reg.estado === E.PROCESANDO ? 'Buscando…' : 'Sin portada'}</div>`}</td>
      <td class="c-titulo ${claseCampo(c, 'titulo')}"><span class="titulo-libro">${c ? esc(c.obra.titulo) : `<span class="nd">${esc(e.titulo) || '—'}</span>`}</span>${c ? solicitado(c, 'titulo', reg.req.titulo) : ''}</td>
      <td class="${claseCampo(c, 'autor')}">${c ? guion(c.obra.autores.join('; ')) : guion('')}${solicitado(c, 'autor', reg.req && reg.req.autor)}</td>
      <td class="${claseCampo(c, 'editorial')}">${c ? guion(c.edicion.editorial) : guion('')}${solicitado(c, 'editorial', reg.req && reg.req.editorial)}</td>
      <td class="cod ${claseCampo(c, 'isbn')}">${c ? guion(c.edicion.isbn10) : guion('')}</td>
      <td class="cod ${claseCampo(c, 'isbn')}">${c ? guion(c.edicion.isbn13) : guion('')}${solicitado(c, 'isbn', isbnSol)}</td>
      <td class="cod ${claseCampo(c, 'anio')}">${c ? guion(c.edicion.anio) : guion('')}${solicitado(c, 'anio', reg.req && reg.req.anio)}</td>
      <td>${c ? esc(c.fuente) : guion('')}</td>
      <td>${c ? barraConfianza(c.ev.score) : guion('')}</td>
      <td class="c-url">${c ? enlaceCorto(c.urlFuente) : guion('')}</td>
      <td class="c-url">${p ? enlaceCorto(p.url) : guion('')}</td>
      <td class="c-obs">${obs.length ? `<ul>${obs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : guion('')}</td>
    </tr>${abierto && reg.candidatos && reg.candidatos.length ? detalleHTML(reg) : ''}`;
  }

  function ordenarCandidatos(reg) {
    const lista = (reg.candidatos || []).slice();
    const modo = S.ordenCand[reg.id] || 'confianza';
    const f = {
      confianza: (a, b) => b.ev.score - a.ev.score,
      anio: (a, b) => (+b.edicion.anio || 0) - (+a.edicion.anio || 0),
      fuente: (a, b) => a.fuente.localeCompare(b.fuente) || b.ev.score - a.ev.score,
      editorial: (a, b) => a.edicion.editorial.localeCompare(b.edicion.editorial, 'es') || b.ev.score - a.ev.score
    }[modo];
    return lista.sort(f);
  }

  function detalleHTML(reg) {
    const c = seleccionado(reg), r = reg.req || {}, d = c ? c.ev.det : {};
    const filaComp = (nombre, sol, enc, campo) => {
      const k = claseCampo(c, campo);
      const val = campo in d ? `${Math.round(d[campo] * 100)}%` : 'No solicitado';
      return `<tr class="${k}"><th scope="row">${nombre}</th><td>${guion(sol)}</td><td>${guion(enc)}</td><td class="valor">${val}</td></tr>`;
    };
    const comparacion = c ? `<table class="comparacion"><thead><tr><th>Campo</th><th>Dato solicitado</th><th>Dato encontrado</th><th>Similitud</th></tr></thead><tbody>
      ${filaComp('ISBN', r.isbn ? `${r.isbn.normal}${r.isbn.tipo === 'ISBN-10' && r.isbn.isbn13 ? ' (= ' + r.isbn.isbn13 + ')' : ''}` : '', [c.edicion.isbn13, c.edicion.isbn10].filter(Boolean).join(' / '), 'isbn')}
      ${filaComp('Título', r.titulo, [c.obra.titulo, c.obra.subtitulo].filter(Boolean).join(': '), 'titulo')}
      ${filaComp('Autor', r.autor, c.obra.autores.join('; '), 'autor')}
      ${filaComp('Editorial', r.editorial, c.edicion.editorial, 'editorial')}
      ${filaComp('Año', r.anio, c.edicion.anio, 'anio')}
    </tbody></table>` : '<p class="aviso-vacio">No hay un resultado seleccionado.</p>';

    const modo = S.ordenCand[reg.id] || 'confianza';
    const candidatos = ordenarCandidatos(reg).map(k => {
      const sel = k.id === reg.seleccion, ed = k.edicion;
      const img = ed.portadaEstado === 'verificada'
        ? `<img src="${esc(ed.portadaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span>${ed.portadaEstado === 'sin verificar' ? 'Verificando…' : 'Sin portada'}</span>`;
      return `<article class="candidato${sel ? ' elegido' : ''}">
        <div class="cand-portada">${img}</div>
        <div class="cand-datos">
          <h4>${esc(k.obra.titulo) || '—'}</h4>
          <p>${guion(k.obra.autores.join('; '))}</p>
          <p>${guion(ed.editorial)}, ${guion(ed.anio)}</p>
          <p class="cod">ISBN-13 ${guion(ed.isbn13)} · ISBN-10 ${guion(ed.isbn10)}</p>
          <p class="cand-fuente">${esc(k.fuente)} · ${enlaceCorto(k.urlFuente, 'ver ficha')}${ed.portadaNivel === 'obra' ? ' · portada de la obra' : ''}</p>
        </div>
        <div class="cand-accion">
          ${barraConfianza(k.ev.score)}
          ${sel ? '<span class="marca-elegido">Resultado elegido</span>' : `<button type="button" class="mini" data-accion="elegir" data-cand="${k.id}">Elegir este</button>`}
        </div>
      </article>`;
    }).join('');

    const vistas = new Set();
    const portadas = (reg.candidatos || []).filter(k => k.edicion.portadaEstado === 'verificada' && !vistas.has(k.edicion.portadaUrl) && vistas.add(k.edicion.portadaUrl));
    const pActual = portadaDe(reg);
    const selector = portadas.length > 1 ? `<section class="selector-portadas"><h3>Portadas disponibles</h3>
      <p class="ayuda">Si elige una portada de otra edición quedará indicado en observaciones.</p>
      <div class="rejilla-portadas">${portadas.map(k => {
        const misma = c && c.edicion.isbn13 && k.edicion.isbns13.includes(c.edicion.isbn13);
        const actual = pActual && pActual.url === k.edicion.portadaUrl;
        const rotulo = c && k.id === c.id ? 'Edición elegida' : misma ? 'Misma edición' : 'Otra edición';
        return `<button type="button" class="opcion-portada${actual ? ' actual' : ''}" data-accion="usar-portada" data-cand="${k.id}" title="${esc(k.fuente)}: ${esc(k.edicion.editorial)} ${esc(k.edicion.anio)}">
          <img src="${esc(k.edicion.portadaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
          <span>${rotulo}<br>${esc(k.edicion.editorial || k.fuente)}${k.edicion.anio ? ', ' + esc(k.edicion.anio) : ''}</span></button>`;
      }).join('')}</div></section>` : '';

    return `<tr class="detalle" data-id="${reg.id}"><td colspan="13"><div class="detalle-caja">
      <div class="detalle-cabecera">
        <h3>Comparación del registro n.º ${reg.num}</h3>
        <div class="detalle-acciones">
          ${reg.validadoManual
            ? '<button type="button" class="secundario" data-accion="deshacer">Deshacer validación</button>'
            : `<button type="button" class="primario" data-accion="confirmar" ${c ? '' : 'disabled'}>Confirmar este resultado</button>`}
          ${reg.marcadoNoEncontrado ? '' : '<button type="button" class="secundario" data-accion="no-encontrado">Marcar como no encontrado</button>'}
        </div>
      </div>
      ${comparacion}
      ${selector}
      <div class="candidatos-cabecera"><h3>Candidatos (${(reg.candidatos || []).length})</h3>
        <label>Ordenar por <select data-accion="orden-cand">
          ${[['confianza', 'Confianza'], ['anio', 'Año'], ['editorial', 'Editorial'], ['fuente', 'Fuente']].map(([v, t]) => `<option value="${v}"${v === modo ? ' selected' : ''}>${t}</option>`).join('')}
        </select></label></div>
      <div class="lista-candidatos">${candidatos}</div>
    </div></td></tr>`;
  }

  function visibles() {
    let lista = S.registros.filter(r => {
      if (S.filtro === 'TODOS') return true;
      if (S.filtro === E.PENDIENTE) return r.estado === E.PENDIENTE || r.estado === E.PROCESANDO;
      return r.estado === S.filtro;
    });
    const conf = r => { const c = seleccionado(r); return c ? c.ev.score : -1; };
    const orden = {
      num: (a, b) => a.num - b.num,
      'conf-desc': (a, b) => conf(b) - conf(a) || a.num - b.num,
      'conf-asc': (a, b) => conf(a) - conf(b) || a.num - b.num,
      estado: (a, b) => a.estado.localeCompare(b.estado, 'es') || a.num - b.num,
      titulo: (a, b) => (U.limpio(a.entrada.titulo) || 'zzz').localeCompare(U.limpio(b.entrada.titulo) || 'zzz', 'es')
    }[S.orden];
    return lista.sort(orden);
  }

  function renderContadores() {
    const c = contar();
    const items = [
      ['Registros', c.total, ''], ['Encontrados', c.encontrados, ''],
      ['Confirmados', c[E.CONFIRMADO], 'confirmado'], ['Probables', c[E.PROBABLE], 'probable'],
      ['Edición diferente', c[E.DIFERENTE], 'diferente'], ['Revisión manual', c[E.REVISION], 'revision'],
      ['No encontrados', c[E.NO_ENCONTRADO], 'noenc']
    ];
    document.getElementById('contadores').innerHTML = items.map(([t, n, k]) =>
      `<div class="contador ${k ? 'e-' + k : ''}"><strong>${n}</strong><span>${t}</span></div>`).join('');
    document.getElementById('filtros').innerHTML = FILTROS.map(([v, t]) => {
      const n = v === 'TODOS' ? c.total : v === E.PENDIENTE ? c[E.PENDIENTE] : c[v];
      return `<button type="button" class="filtro${S.filtro === v ? ' activo' : ''}" data-filtro="${esc(v)}" aria-pressed="${S.filtro === v}">${t} <span>${n}</span></button>`;
    }).join('');
  }

  function render() {
    renderContadores();
    const lista = visibles();
    document.getElementById('cuerpo').innerHTML = lista.map(filaHTML).join('');
    const vacio = document.getElementById('vacio');
    vacio.hidden = S.registros.length > 0 && lista.length > 0;
    vacio.textContent = S.registros.length
      ? 'Ningún registro coincide con el filtro elegido.'
      : 'Aún no hay búsquedas. Escriba un ISBN o un título en el panel de la izquierda, o importe un Excel con su inventario.';
    document.getElementById('btnExportar').disabled = !S.registros.some(r => r.estado !== E.PENDIENTE && r.estado !== E.PROCESANDO);
  }

  let temporizador = null;
  function programarRender(ms = 250) {
    if (temporizador) return;
    temporizador = setTimeout(() => { temporizador = null; render(); }, ms);
  }

  return { S, seleccionado, portadaDe, observaciones, contar, render, programarRender };
})();
