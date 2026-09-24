/* =====================================================================
   js/app.js — Controlador de la interfaz
   ===================================================================== */
(() => {
  const U = BB.Utils, E = BB.ESTADOS, R = BB.Results, S = BB.Results.S;
  const $ = id => document.getElementById(id);
  let modo = 'isbn13';
  let loteActual = null;

  /* ------------------------------ Avisos ----------------------------- */
  let tAviso = null;
  function avisar(texto, tipo = 'info') {
    const a = $('aviso');
    a.textContent = texto; a.className = `aviso visible ${tipo}`;
    clearTimeout(tAviso);
    tAviso = setTimeout(() => { a.className = 'aviso'; }, 5000);
  }

  /* ------------------------ Registros y duplicados ------------------- */
  function claveDuplicado(e) {
    const a = e.isbn ? BB.ISBN.analizar(e.isbn) : null;
    if (a && a.valido) return 'isbn:' + (a.isbn13 || a.normal);
    const t = U.normalizarTexto(e.titulo);
    return t ? `t:${t}|${U.normalizarTexto(e.autor)}|${U.normalizarTexto(e.editorial)}|${U.extraerAnio(e.anio)}` : '';
  }

  function crearRegistros(entradas) {
    const indice = new Map(S.registros.map(r => [claveDuplicado(r.entrada), r.num]));
    return entradas.map(entrada => {
      const reg = { id: U.uid('r'), num: S.siguiente++, entrada, estado: E.PENDIENTE, candidatos: null, obsEntrada: [] };
      const k = claveDuplicado(entrada);
      if (k && indice.has(k)) reg.duplicadoDe = indice.get(k); else if (k) indice.set(k, reg.num);
      return reg;
    });
  }

  /* ------------------------------ Progreso --------------------------- */
  function mostrarProgreso(lote) {
    $('progreso').hidden = false;
    $('txtProgreso').textContent = `${lote.hechos} de ${lote.total} procesados`;
    $('barraProgreso').style.width = `${lote.total ? (lote.hechos / lote.total) * 100 : 0}%`;
    $('btnPausa').textContent = lote.pausado ? 'Reanudar' : 'Pausar';
  }

  /**
   * Los registros que no pudieron consultar alguna fuente por límite de solicitudes (HTTP 429)
   * se vuelven a procesar una vez, cuando termina la pausa de esa fuente.
   */
  async function segundaPasada(lote, registros) {
    if (lote.cancelado || !BB.CONFIG.red.segundaPasada) return;
    const pendientes = registros.filter(r => (r.errores || []).some(e => e.code === 'LIMITE'));
    if (!pendientes.length) return;
    for (let ms = BB.Search.esperaPendienteMs(); ms > 0 && !lote.cancelado; ms = BB.Search.esperaPendienteMs()) {
      $('txtProgreso').textContent = `Una fuente pidió pausa: ${pendientes.length} registro(s) se consultarán de nuevo en ${Math.ceil(ms / 1000)} s`;
      await U.esperar(Math.min(ms, 1000));
    }
    if (lote.cancelado) return;
    const repaso = BB.Search.crearLote(pendientes, l => { $('txtProgreso').textContent = `Segunda pasada: ${l.hechos} de ${l.total}`; R.programarRender(); });
    lote.repaso = repaso;
    await repaso.promesa;
  }

  async function procesar(registros) {
    if (!BB.Fuentes.activas().length) { avisar('Active al menos una fuente en Configuración.', 'error'); return; }
    if (loteActual && !loteActual.cancelado && loteActual.hechos < loteActual.total) {
      avisar('Espere a que termine el lote en curso o cancélelo.', 'error'); return;
    }
    S.registros.push(...registros);
    R.render();
    const lote = BB.Search.crearLote(registros, l => { mostrarProgreso(l); R.programarRender(); });
    loteActual = lote;
    mostrarProgreso(lote);
    $('panelLote').classList.add('ocupado');
    await lote.promesa;
    await segundaPasada(lote, registros);
    if (lote.cancelado) registros.filter(r => r.estado === E.PROCESANDO).forEach(r => { r.estado = E.PENDIENTE; });
    $('panelLote').classList.remove('ocupado');
    R.render();
    const c = R.contar();
    $('txtProgreso').textContent = lote.cancelado
      ? `Cancelado: ${lote.hechos} de ${lote.total} procesados`
      : `Listo: ${lote.hechos} de ${lote.total} procesados · ${c[E.CONFIRMADO]} confirmados`;
    $('btnPausa').hidden = true; $('btnCancelar').hidden = true;
    setTimeout(() => { if (loteActual === lote) { $('progreso').hidden = true; $('btnPausa').hidden = false; $('btnCancelar').hidden = false; } }, 6000);
  }

  /* -------------------------- Búsqueda individual -------------------- */
  function actualizarModo(nuevo) {
    modo = nuevo;
    document.querySelectorAll('#modo button').forEach(b => {
      const activo = b.dataset.modo === modo;
      b.classList.toggle('activo', activo); b.setAttribute('aria-checked', activo);
    });
    const esTitulo = modo === 'titulo';
    $('lblPrincipal').textContent = esTitulo ? 'Título de la obra' : (modo === 'isbn10' ? 'ISBN-10' : 'ISBN-13');
    $('campoPrincipal').placeholder = esTitulo ? 'Ej.: El llano en llamas' : (modo === 'isbn10' ? 'Ej.: 0-14-032872-X' : 'Ej.: 978-607-…');
    $('campoPrincipal').inputMode = esTitulo ? 'text' : 'numeric';
    $('grupoTituloSec').hidden = esTitulo;
    $('leyendaSec').textContent = esTitulo ? 'Datos secundarios (opcionales)' : 'Datos para contrastar la edición (opcionales)';
    validarEnVivo();
  }

  function validarEnVivo() {
    const ayuda = $('ayudaISBN'), v = $('campoPrincipal').value;
    ayuda.className = 'ayuda';
    if (modo === 'titulo' || !v.trim()) { ayuda.textContent = modo === 'titulo' ? '' : 'Se aceptan guiones y espacios; se eliminan al normalizar.'; return; }
    const a = BB.ISBN.analizar(v);
    if (a.valido) {
      if ((modo === 'isbn10' && a.tipo === 'ISBN-13') || (modo === 'isbn13' && a.tipo === 'ISBN-10')) {
        actualizarModo(a.tipo === 'ISBN-13' ? 'isbn13' : 'isbn10'); return;
      }
      ayuda.classList.add('ok');
      ayuda.textContent = a.tipo === 'ISBN-10'
        ? `ISBN-10 válido. Equivale a ISBN-13 ${a.isbn13}.`
        : (a.isbn10 ? `ISBN-13 válido. Equivale a ISBN-10 ${a.isbn10}.` : 'ISBN-13 válido (prefijo 979: no tiene equivalente ISBN-10).');
    } else if (a.normal.length >= 10) {
      ayuda.classList.add('error'); ayuda.textContent = a.error;
    } else {
      ayuda.textContent = `${a.normal.length} de ${modo === 'isbn10' ? 10 : 13} caracteres.`;
    }
  }

  function buscarIndividual() {
    const principal = $('campoPrincipal').value.trim();
    if (!principal) { avisar(modo === 'titulo' ? 'Escriba el título de la obra.' : 'Escriba el ISBN.', 'error'); $('campoPrincipal').focus(); return; }
    const entrada = {
      isbn: modo === 'titulo' ? '' : principal,
      titulo: modo === 'titulo' ? principal : $('campoTituloSec').value.trim(),
      autor: $('campoAutor').value.trim(), editorial: $('campoEditorial').value.trim(), anio: $('campoAnio').value.trim(),
      fila: 'Búsqueda individual'
    };
    if (entrada.isbn && !BB.ISBN.analizar(entrada.isbn).valido && !entrada.titulo) {
      avisar('El ISBN no es válido. Se registrará para revisión; agregue el título para buscar por obra.', 'error');
    }
    const regs = crearRegistros([entrada]);
    S.abiertos.add(regs[0].id);
    procesar(regs);
  }

  function limpiarFormulario() {
    ['campoPrincipal', 'campoTituloSec', 'campoAutor', 'campoEditorial', 'campoAnio'].forEach(id => { $(id).value = ''; });
    validarEnVivo();
    $('campoPrincipal').focus();
  }

  /* ------------------------------ Lote ------------------------------- */
  const pareceCodigo = s => BB.ISBN.pareceISBN(s) || /^[\dxX][\d\s\-xX]{8,16}$/.test(U.limpio(s));

  function parsearLista(texto) {
    const lineas = texto.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lineas.length) return [];
    const sep = lineas[0].includes('\t') ? '\t' : (lineas.some(l => l.includes('|')) ? '|' : null);
    const filas = lineas.map((l, i) => ({ celdas: sep ? l.split(sep).map(s => s.trim()) : [l.trim()], n: i + 1 }));
    if (sep) {
      const mapa = BB.Excel.mapearEncabezados(filas[0].celdas);
      if (mapa) return filas.slice(1).map(f => BB.Excel.registroDesdeCeldas(f.celdas, mapa, `Lista línea ${f.n}`)).filter(r => r.isbn || r.titulo);
    }
    return filas.map(f => {
      const c = f.celdas, fila = `Lista línea ${f.n}`;
      if (c.length === 1) return pareceCodigo(c[0]) ? { isbn: c[0], fila } : { titulo: c[0], fila };
      if (pareceCodigo(c[0])) return { isbn: c[0], titulo: c[1] || '', autor: c[2] || '', editorial: c[3] || '', anio: c[4] || '', fila };
      return { titulo: c[0], autor: c[1] || '', editorial: c[2] || '', anio: c[3] || '', fila };
    });
  }

  function vistaPreviaLista() {
    const n = parsearLista($('areaLote').value).length;
    $('infoLote').textContent = n ? `${n} registro(s) detectados.` : '';
  }

  function procesarEntradas(entradas, origen) {
    if (!entradas.length) { avisar('No se detectaron registros con ISBN o título.', 'error'); return; }
    const regs = crearRegistros(entradas);
    const dup = regs.filter(r => r.duplicadoDe).length;
    $('infoLote').textContent = `${origen}: ${regs.length} registro(s)${dup ? `, ${dup} duplicado(s) (se consultan una sola vez)` : ''}.`;
    procesar(regs);
  }

  async function importarArchivo(file) {
    if (!file) return;
    try {
      $('infoLote').textContent = `Leyendo ${file.name}…`;
      const entradas = await BB.Excel.leerArchivo(file);
      procesarEntradas(entradas, file.name);
    } catch (e) {
      $('infoLote').textContent = '';
      avisar(e.message, 'error');
    } finally {
      $('archivoLote').value = '';
    }
  }

  /* ------------------------- Acciones en la tabla --------------------- */
  function registroDe(el) {
    const tr = el.closest('tr[data-id]');
    return tr ? S.registros.find(r => r.id === tr.dataset.id) : null;
  }

  async function accionTabla(ev) {
    const btn = ev.target.closest('[data-accion]');
    if (!btn || btn.tagName === 'SELECT') return;
    const reg = registroDe(btn);
    if (!reg) return;
    const accion = btn.dataset.accion;

    if (accion === 'detalle') {
      if (S.abiertos.has(reg.id)) S.abiertos.delete(reg.id);
      else {
        S.abiertos.add(reg.id);
        BB.Search.verificarPortadas(reg, reg.candidatos.length).then(() => R.programarRender(50));
      }
      R.render();
    } else if (accion === 'reintentar') {
      procesar([reg].map(r => { S.registros.splice(S.registros.indexOf(r), 1); return r; }));
    } else if (accion === 'ver-portada') {
      abrirModal(reg);
    } else if (accion === 'elegir') {
      reg.seleccion = btn.dataset.cand; reg.seleccionManual = true; reg.validadoManual = ''; reg.portadaManual = null;
      BB.Search.reevaluar(reg);
      await BB.Search.verificarPortadas(reg, 0);
      R.render();
    } else if (accion === 'confirmar') {
      if (reg.estadoAuto !== E.CONFIRMADO) {
        const sel = R.seleccionado(reg), dif = sel ? BB.Matcher.discrepancias(reg.req, sel) : [];
        const aviso = `El resultado automático es «${reg.estadoAuto}»: ${reg.motivo || ''}` +
          (dif.length ? `\n\n• ${dif.join('\n• ')}` : '') +
          '\n\n¿Confirma que este resultado corresponde al libro buscado?';
        if (!confirm(aviso)) return;
      }
      reg.validadoManual = U.fechaISO(); reg.marcadoNoEncontrado = false; reg.seleccionManual = true;
      BB.Search.reevaluar(reg); R.render(); avisar(`Registro n.º ${reg.num} confirmado manualmente.`);
    } else if (accion === 'deshacer') {
      reg.validadoManual = ''; BB.Search.reevaluar(reg); R.render();
    } else if (accion === 'no-encontrado') {
      reg.marcadoNoEncontrado = true; reg.validadoManual = ''; BB.Search.reevaluar(reg); R.render();
    } else if (accion === 'usar-portada') {
      const k = reg.candidatos.find(c => c.id === btn.dataset.cand), sel = R.seleccionado(reg);
      const misma = sel && sel.edicion.isbn13 && k.edicion.isbns13.includes(sel.edicion.isbn13);
      reg.portadaManual = (k === sel) ? null : {
        url: k.edicion.portadaUrl, fuente: k.fuente, nivel: misma ? 'edición' : 'otra edición',
        nota: misma
          ? `Portada elegida manualmente (misma edición, ${k.fuente})`
          : `Portada elegida manualmente de OTRA edición (${k.fuente}: ${k.edicion.editorial || 's/ed.'} ${k.edicion.anio || 's/a.'}); no corresponde con certeza a la edición registrada`
      };
      BB.Search.verificarPortadas(reg, 0).then(() => R.render());
    }
  }

  /* ------------------------------ Modal ------------------------------ */
  function abrirModal(reg) {
    const p = R.portadaDe(reg), c = R.seleccionado(reg);
    if (!p) return;
    $('modalImg').src = BB.Covers.urlGrande(p.url);
    $('modalImg').onerror = () => { $('modalImg').onerror = null; $('modalImg').src = p.url; };
    $('modalTitulo').textContent = c ? c.obra.titulo : '';
    $('modalPie').innerHTML = `Fuente de la portada: ${U.esc(p.fuente)}. Asociada a: ${U.esc(p.nivel || 'edición')}.<br><a href="${U.esc(p.url)}" target="_blank" rel="noopener">Abrir URL de la portada</a>`;
    $('modal').hidden = false;
    $('modalCerrar').focus();
  }
  const cerrarModal = () => { $('modal').hidden = true; $('modalImg').src = ''; };

  /* --------------------------- Configuración ------------------------- */
  function cargarConfiguracion() {
    const C = BB.CONFIG;
    $('cfgOL').checked = C.fuentes.openLibrary.activa;
    $('cfgGB').checked = C.fuentes.googleBooks.activa;
    $('cfgUPN').checked = C.fuentes.upn.activa;
    $('cfgUPNProxy').value = C.fuentes.upn.proxy;
    $('cfgConc').value = C.red.concurrencia;
    Object.entries(C.pesos).forEach(([k, v]) => { $('peso_' + k).value = v; });
    pintarFuentes();
  }
  function aplicarConfiguracion() {
    const C = BB.CONFIG;
    C.fuentes.openLibrary.activa = $('cfgOL').checked;
    C.fuentes.googleBooks.activa = $('cfgGB').checked;
    C.fuentes.googleBooks.apiKey = $('cfgKey').value.trim();
    C.fuentes.upn.proxy = $('cfgUPNProxy').value.trim();
    C.fuentes.upn.activa = $('cfgUPN').checked;
    if (C.fuentes.upn.activa && !C.fuentes.upn.proxy) avisar('La Biblioteca UPN necesita la dirección del proxy para funcionar (vea el README, sección 7).', 'error');
    C.red.concurrencia = Math.max(1, Math.min(6, parseInt($('cfgConc').value, 10) || 3));
    Object.keys(C.pesos).forEach(k => { const n = parseFloat($('peso_' + k).value); C.pesos[k] = isFinite(n) && n >= 0 ? n : C.pesos[k]; });
    S.registros.forEach(r => { if (r.candidatos) { BB.Search.reevaluar(r); } });
    pintarFuentes();
    R.render();
    avisar('Configuración aplicada y resultados recalculados.');
  }
  function pintarFuentes() {
    $('fuentesActivas').innerHTML = BB.Fuentes.todas().map(f =>
      `<span class="fuente-chip${f.activa() ? '' : ' inactiva'}">${U.esc(f.nombre)}</span>`).join('');
  }

  /* ----------------------------- Exportar ---------------------------- */
  async function exportar() {
    const lista = S.registros.filter(r => r.estado !== E.PENDIENTE && r.estado !== E.PROCESANDO);
    if (!lista.length) return;
    const b = $('btnExportar');
    b.disabled = true;
    const original = b.textContent;
    try {
      const r = await BB.Excel.exportar(lista.sort((a, c) => a.num - c.num), t => { b.textContent = t; });
      avisar(`Excel generado: ${r.total} registros, ${r.imagenes} portadas insertadas` +
        (r.fallidas ? `; ${r.fallidas} no se pudieron insertar (el servidor de imágenes no lo permite), pero su URL se conserva.` : '.'));
    } catch (e) {
      avisar('No se pudo generar el Excel: ' + e.message, 'error');
    } finally {
      b.textContent = original; b.disabled = false;
    }
  }

  /* ------------------------------ Eventos ---------------------------- */
  function iniciar() {
    document.querySelectorAll('#modo button').forEach(b => b.addEventListener('click', () => { actualizarModo(b.dataset.modo); $('campoPrincipal').focus(); }));
    $('campoPrincipal').addEventListener('input', validarEnVivo);
    $('formIndividual').addEventListener('submit', ev => { ev.preventDefault(); buscarIndividual(); });
    $('btnLimpiar').addEventListener('click', limpiarFormulario);

    $('areaLote').addEventListener('input', vistaPreviaLista);
    $('btnLote').addEventListener('click', () => procesarEntradas(parsearLista($('areaLote').value), 'Lista pegada'));
    $('archivoLote').addEventListener('change', e => importarArchivo(e.target.files[0]));
    const zona = $('zonaArchivo');
    ['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add('encima'); }));
    ['dragleave', 'drop'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove('encima'); }));
    zona.addEventListener('drop', e => importarArchivo(e.dataTransfer.files[0]));
    $('btnPlantilla').addEventListener('click', () => {
      if (!window.ExcelJS) return avisar('No se pudo cargar la biblioteca de Excel (se requiere conexión).', 'error');
      BB.Excel.descargarPlantilla();
    });

    $('btnPausa').addEventListener('click', () => { if (loteActual) { loteActual.pausado = !loteActual.pausado; mostrarProgreso(loteActual); } });
    $('btnCancelar').addEventListener('click', () => {
      if (!loteActual) return;
      loteActual.cancelado = true; loteActual.pausado = false;
      if (loteActual.repaso) loteActual.repaso.cancelado = true;
    });

    $('cuerpo').addEventListener('click', accionTabla);
    $('cuerpo').addEventListener('change', e => {
      if (e.target.dataset.accion === 'orden-cand') { const reg = registroDe(e.target); S.ordenCand[reg.id] = e.target.value; R.render(); }
    });
    $('filtros').addEventListener('click', e => { const b = e.target.closest('[data-filtro]'); if (b) { S.filtro = b.dataset.filtro; R.render(); } });
    $('ordenTabla').addEventListener('change', e => { S.orden = e.target.value; R.render(); });
    $('btnExportar').addEventListener('click', exportar);
    $('btnVaciar').addEventListener('click', () => {
      if (!S.registros.length) return;
      if (loteActual && !loteActual.cancelado && loteActual.hechos < loteActual.total) return avisar('Cancele el lote en curso antes de vaciar.', 'error');
      if (!confirm(`¿Quitar los ${S.registros.length} registros de la tabla? Exporte antes si los necesita.`)) return;
      S.registros.length = 0; S.abiertos.clear(); S.siguiente = 1; R.render();
    });

    $('btnAplicarCfg').addEventListener('click', aplicarConfiguracion);
    $('btnCache').addEventListener('click', () => { BB.Search.limpiarCache(); avisar('Caché de consultas vaciada.'); });

    $('modalCerrar').addEventListener('click', cerrarModal);
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrarModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) cerrarModal(); });

    if (!window.ExcelJS) avisar('Sin la biblioteca de Excel: la búsqueda funciona, pero importar y exportar XLSX requiere conexión.', 'error');
    cargarConfiguracion();
    actualizarModo('isbn13');
    R.render();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
