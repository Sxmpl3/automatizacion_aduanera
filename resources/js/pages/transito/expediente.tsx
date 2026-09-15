import { Head, Link, router, useForm } from '@inertiajs/react';
import TransitoShell from '@/layouts/transito/shell';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type EstadoExp = 'borrador' | 'analizando' | 'revision' | 'validado';

interface Expediente {
    id: number;
    referencia: string;
    estado: EstadoExp;
    cliente: string | null;
    mrn: string | null;
    aduana_partida: string | null;
    aduana_destino: string | null;
    validado_en: string | null;
    creado: string | null;
}

interface Documento {
    id: number;
    nombre_original: string;
    url: string | null;
    mime: string | null;
    tamano: number;
    tipo_detectado: string | null;
    tipo_label: string;
    confianza: number | null;
    estado: string;
    nota_ia: string | null;
    datos_extraidos: Record<string, unknown> | null;
}

interface Declaracion {
    id: number;
    estado: string;
    datos: Record<string, any>;
    advertencias: string[];
    confianza_global: number | null;
    generado_en: string | null;
}

interface Historial {
    id: number; accion: string; detalle: string | null; usuario: string; cuando: string | null;
}

interface Props {
    expediente: Expediente;
    documentos: Documento[];
    declaracion: Declaracion | null;
    historial: Historial[];
}

const estadoLabel: Record<EstadoExp, string> = {
    borrador: 'Borrador', analizando: 'Analizando IA',
    revision: 'En revisión', validado: 'Validado',
};
const estadoTone: Record<EstadoExp, string> = {
    borrador: 'muted', analizando: 'warn', revision: 'signal', validado: 'ok',
};

export default function ExpedienteView({ expediente, documentos, declaracion, historial }: Props) {
    const [tab, setTab] = useState<'declaracion' | 'documentos' | 'historial'>(
        declaracion ? 'declaracion' : 'documentos'
    );
    const [analizando, setAnalizando] = useState(false);
    const [preview, setPreview] = useState<Documento | null>(null);

    const puedeAnalizar = documentos.length > 0 && expediente.estado !== 'validado';

    const lanzarAnalisis = () => {
        setAnalizando(true);
        router.post(`/transito/${expediente.id}/analizar`, {}, {
            preserveScroll: true,
            onFinish: () => setAnalizando(false),
        });
    };

    return (
        <TransitoShell
            section="transito"
            breadcrumb={expediente.referencia}
            actions={
                <div className="flex items-center gap-2">
                    <Link href="/transito" className="wx-btn wx-btn-ghost !px-3 sm:!px-4" title="Volver">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="sm:hidden"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="hidden sm:inline">Volver</span>
                    </Link>
                    {puedeAnalizar && (
                        <button onClick={lanzarAnalisis} disabled={analizando} className="wx-btn !px-3 sm:!px-4">
                            {analizando
                                ? 'Analizando…'
                                : (
                                    <>
                                        <span className="sm:hidden">{declaracion ? '↻ IA' : 'IA'}</span>
                                        <span className="hidden sm:inline">{declaracion ? 'Reanalizar' : 'Analizar con IA'}</span>
                                    </>
                                )
                            }
                        </button>
                    )}
                </div>
            }
        >
            <Head title={`${expediente.referencia} · Wixia`} />

            {/* Header del expediente */}
            <section className="mb-6 sm:mb-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 lg:gap-6">
                    <div className="min-w-0">
                        <div className="wx-eyebrow mb-2">Expediente de tránsito</div>
                        <h1 className="font-display font-bold text-[28px] sm:text-[36px] lg:text-[46px] leading-[1.05] tabular-nums break-all">
                            {expediente.referencia}
                        </h1>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span className="wx-chip" data-tone={estadoTone[expediente.estado]}>
                                <span className="dot" />{estadoLabel[expediente.estado]}
                            </span>
                            {declaracion?.confianza_global != null && (
                                <span
                                    className="wx-chip whitespace-nowrap"
                                    data-tone={
                                        declaracion.confianza_global >= 85 ? 'ok' :
                                        declaracion.confianza_global >= 60 ? 'warn' : 'error'
                                    }
                                    title="Confianza global de la declaración consolidada"
                                >
                                    <span className="dot" />Declaración · {Math.round(declaracion.confianza_global)}%
                                </span>
                            )}
                            {expediente.mrn && <span className="wx-chip max-w-full truncate"><span className="dot shrink-0" />MRN {expediente.mrn}</span>}
                        </div>
                    </div>
                    <dl className="grid grid-cols-[max-content_1fr] sm:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-2 text-[12px] lg:min-w-[260px]">
                        <dt className="text-[color:var(--color-wx-muted)]">Cliente</dt>
                        <dd className="truncate">{expediente.cliente ?? '—'}</dd>
                        <dt className="text-[color:var(--color-wx-muted)]">Partida</dt>
                        <dd className="tabular-nums truncate">{expediente.aduana_partida ?? '—'}</dd>
                        <dt className="text-[color:var(--color-wx-muted)]">Destino</dt>
                        <dd className="tabular-nums truncate">{expediente.aduana_destino ?? '—'}</dd>
                        <dt className="text-[color:var(--color-wx-muted)]">Creado</dt>
                        <dd>{expediente.creado}</dd>
                        {expediente.validado_en && <>
                            <dt className="text-[color:var(--color-wx-muted)]">Validado</dt>
                            <dd className="text-[color:var(--color-wx-ok)]">{expediente.validado_en}</dd>
                        </>}
                    </dl>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-8">
                {/* Panel izquierdo: documentos */}
                <section>
                    <DocumentosPanel
                        expedienteId={expediente.id}
                        documentos={documentos}
                        onPreview={setPreview}
                        bloqueado={expediente.estado === 'validado'}
                    />
                </section>

                {/* Panel derecho: tabs */}
                <section>
                    <nav className="flex items-center gap-4 sm:gap-6 border-b border-[color:var(--color-wx-inkline)] mb-6 overflow-x-auto">
                        {[
                            { k: 'declaracion', l: 'Declaración', disabled: !declaracion },
                            { k: 'documentos',  l: 'Detalle documentos' },
                            { k: 'historial',   l: 'Historial' },
                        ].map(t => (
                            <button
                                key={t.k}
                                disabled={!!t.disabled}
                                onClick={() => setTab(t.k as any)}
                                className={[
                                    'py-3 text-[13px] border-b-2 -mb-px transition-colors whitespace-nowrap',
                                    tab === t.k
                                        ? 'border-[color:var(--color-wx-ink)] text-[color:var(--color-wx-ink)]'
                                        : 'border-transparent text-[color:var(--color-wx-muted)] hover:text-[color:var(--color-wx-ink)]',
                                    t.disabled ? 'opacity-40 cursor-not-allowed' : '',
                                ].join(' ')}
                            >
                                {t.l}
                            </button>
                        ))}
                    </nav>

                    {tab === 'declaracion' && declaracion && (
                        <DeclaracionEditor
                            expedienteId={expediente.id}
                            declaracion={declaracion}
                            estadoExpediente={expediente.estado}
                        />
                    )}
                    {tab === 'declaracion' && !declaracion && (
                        <div className="wx-card p-8 text-center">
                            <div className="font-display font-bold text-[26px] mb-2">Sin declaración aún.</div>
                            <p className="text-[13px] text-[color:var(--color-wx-ink-2)] max-w-[46ch] mx-auto">
                                Sube al menos un documento y lanza el análisis con IA para que Wixia
                                proponga la declaración de tránsito.
                            </p>
                        </div>
                    )}
                    {tab === 'documentos' && (
                        <DocumentosDetalle documentos={documentos} onPreview={setPreview} />
                    )}
                    {tab === 'historial' && (
                        <HistorialLista historial={historial} />
                    )}
                </section>
            </div>

            {preview && <VisorDocumento documento={preview} onClose={() => setPreview(null)} />}
        </TransitoShell>
    );
}

/* -------------------------------------------------------------------- */
/* Panel izquierdo: documentos + dropzone                                */
/* -------------------------------------------------------------------- */

function DocumentosPanel({
    expedienteId, documentos, onPreview, bloqueado,
}: {
    expedienteId: number;
    documentos: Documento[];
    onPreview: (d: Documento) => void;
    bloqueado: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [drag, setDrag] = useState(false);
    const [subiendo, setSubiendo] = useState(false);

    const enviar = (files: FileList | File[]) => {
        if (!files || (files as FileList).length === 0) return;
        const fd = new FormData();
        Array.from(files).forEach(f => fd.append('archivos[]', f));
        setSubiendo(true);
        router.post(`/transito/${expedienteId}/documentos`, fd, {
            forceFormData: true,
            preserveScroll: true,
            onFinish: () => setSubiendo(false),
        });
    };

    return (
        <div className="wx-card">
            <div className="p-5 border-b border-[color:var(--color-wx-inkline)]">
                <div className="wx-eyebrow mb-1">Documentación del expediente</div>
                <div className="text-[13px] text-[color:var(--color-wx-ink-2)]">
                    Factura, CMR, B/L, certificados, ICS2… todo lo que llegue.
                </div>
            </div>

            {/* Dropzone */}
            {!bloqueado && (
                <div className="p-4">
                    <label
                        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={(e) => {
                            e.preventDefault(); setDrag(false);
                            enviar(e.dataTransfer.files);
                        }}
                        className={[
                            'block border border-dashed p-6 text-center cursor-pointer transition-colors',
                            drag
                                ? 'border-[color:var(--color-wx-signal)] bg-[color:var(--color-wx-signal)]/5'
                                : 'border-[color:var(--color-wx-rule)] hover:border-[color:var(--color-wx-ink-2)]',
                        ].join(' ')}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                            className="sr-only"
                            onChange={(e) => e.target.files && enviar(e.target.files)}
                        />
                        <div className="font-display font-bold text-[20px] leading-tight mb-1">
                            {subiendo ? 'Subiendo…' : 'Arrastra documentos aquí'}
                        </div>
                        <div className="text-[12px] text-[color:var(--color-wx-muted)]">
                            o haz clic — PDF, imagen o texto · máx 20 MB
                        </div>
                    </label>
                </div>
            )}

            {/* Lista */}
            <ul className="divide-y divide-[color:var(--color-wx-inkline)]">
                {documentos.length === 0 && (
                    <li className="p-6 text-center text-[13px] text-[color:var(--color-wx-muted)]">
                        Aún no hay documentos adjuntos.
                    </li>
                )}
                {documentos.map((d) => {
                    const esPdf = d.mime === 'application/pdf' || d.nombre_original.toLowerCase().endsWith('.pdf');
                    // PDFs → pestaña nueva (visor nativo del OS, infalible en Safari).
                    // Imágenes/otros → modal con <img>.
                    const abrirDoc = () => {
                        if (esPdf && d.url) window.open(d.url, '_blank', 'noopener,noreferrer');
                        else onPreview(d);
                    };
                    return (
                    <li key={d.id} className="p-4 flex items-start gap-3">
                        <div className="w-8 h-10 border border-[color:var(--color-wx-inkline)] bg-[color:var(--color-wx-paper)] flex items-center justify-center text-[9px] tracking-widest text-[color:var(--color-wx-muted)]">
                            {formatoAbreviado(d.mime, d.nombre_original)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <button
                                onClick={abrirDoc}
                                className="text-[13px] text-left leading-tight hover:text-[color:var(--color-wx-signal)] truncate block w-full"
                                title={esPdf ? 'Abrir PDF en pestaña nueva' : 'Ver documento'}
                            >
                                {d.nombre_original}{esPdf && ' ↗'}
                            </button>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                {d.tipo_detectado ? (
                                    <span className="wx-chip"><span className="dot" />{d.tipo_label}</span>
                                ) : (
                                    <span className="wx-chip" data-tone="muted"><span className="dot" />sin analizar</span>
                                )}
                                {d.confianza != null && (
                                    <span
                                        className="text-[11px] tabular-nums text-[color:var(--color-wx-muted)]"
                                        title="Confianza de lectura de este documento (calidad OCR/interpretación)"
                                    >
                                        lectura {Math.round(d.confianza)}%
                                    </span>
                                )}
                                <span className="text-[11px] text-[color:var(--color-wx-muted)] tabular-nums">{formatoBytes(d.tamano)}</span>
                            </div>
                            {d.nota_ia && <p className="mt-2 text-[11px] text-[color:var(--color-wx-ink-2)] leading-snug">{d.nota_ia}</p>}
                        </div>
                        {!bloqueado && (
                            <button
                                onClick={() => {
                                    if (confirm('¿Eliminar este documento?')) {
                                        router.delete(`/transito/${expedienteId}/documentos/${d.id}`, { preserveScroll: true });
                                    }
                                }}
                                className="text-[11px] text-[color:var(--color-wx-muted)] hover:text-[color:var(--color-wx-error)] mt-0.5"
                                title="Eliminar"
                            >
                                ✕
                            </button>
                        )}
                    </li>
                    );
                })}
            </ul>
        </div>
    );
}

/* -------------------------------------------------------------------- */
/* Editor de declaración                                                 */
/* -------------------------------------------------------------------- */

function DeclaracionEditor({
    expedienteId, declaracion, estadoExpediente,
}: {
    expedienteId: number;
    declaracion: Declaracion;
    estadoExpediente: EstadoExp;
}) {
    const [datos, setDatos] = useState<Record<string, any>>(declaracion.datos ?? {});
    const [guardando, setGuardando] = useState(false);
    const [validando, setValidando] = useState(false);

    const validado = estadoExpediente === 'validado';

    const set = (path: string, valor: any) => {
        setDatos((prev) => {
            const copia = structuredClone(prev);
            const keys = path.split('.');
            let cursor: any = copia;
            for (let i = 0; i < keys.length - 1; i++) {
                cursor[keys[i]] = cursor[keys[i]] ?? {};
                cursor = cursor[keys[i]];
            }
            cursor[keys[keys.length - 1]] = valor;
            return copia;
        });
    };

    const guardar = (e?: FormEvent) => {
        e?.preventDefault();
        setGuardando(true);
        router.patch(`/transito/${expedienteId}/declaracion`, { datos }, {
            preserveScroll: true,
            onFinish: () => setGuardando(false),
        });
    };

    const validar = () => {
        if (!confirm('¿Confirmas la validación definitiva? Se marcará como listo para S-4.')) return;
        setValidando(true);
        router.post(`/transito/${expedienteId}/validar`, {}, {
            preserveScroll: true,
            onFinish: () => setValidando(false),
        });
    };

    return (
        <form onSubmit={guardar} className="space-y-6">
            {/* Advertencias IA */}
            {declaracion.advertencias.length > 0 && (
                <div className="border-l-2 border-[color:var(--color-wx-warn)] pl-4 py-2 bg-[color:var(--color-wx-warn)]/8">
                    <div className="text-[11px] text-[color:var(--color-wx-warn)] uppercase tracking-wider mb-1">
                        {declaracion.advertencias.length} advertencia{declaracion.advertencias.length > 1 ? 's' : ''} de la IA
                    </div>
                    <ul className="text-[12px] text-[color:var(--color-wx-ink)] space-y-0.5">
                        {declaracion.advertencias.map((a, i) => <li key={i}>· {a}</li>)}
                    </ul>
                </div>
            )}

            <Bloque titulo="Declaración">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Tipo"            value={datos?.tipo_declaracion} onChange={v => set('tipo_declaracion', v)} disabled={validado} />
                    <Field label="Seguridad"       value={datos?.seguridad}        onChange={v => set('seguridad', v)} disabled={validado} />
                    <Field label="Datos Reducidos" value={datos?.datos_reducidos}  onChange={v => set('datos_reducidos', v)} disabled={validado} />
                    <Field label="MRN" value={datos?.mrn} onChange={v => set('mrn', v)} disabled={validado} />
                    <Field label="LRN" value={datos?.lrn} onChange={v => set('lrn', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Consignatario">
                <EntidadCompleta prefix="consignatario" datos={datos} set={set} disabled={validado} />
            </Bloque>

            <Bloque titulo="Representante">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="EORI"        value={datos?.representante?.eori}            onChange={v => set('representante.eori', v)} disabled={validado} />
                    <Field label="Car. Repres" value={datos?.representante?.caracter_repres}  onChange={v => set('representante.caracter_repres', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Declarante">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="NIF"      value={datos?.declarante?.nif}      onChange={v => set('declarante.nif', v)} disabled={validado} />
                    <Field label="Nombre"   value={datos?.declarante?.nombre}   onChange={v => set('declarante.nombre', v)} disabled={validado} />
                    <Field label="Teléfono" value={datos?.declarante?.telefono} onChange={v => set('declarante.telefono', v)} disabled={validado} />
                    <Field label="Email"    value={datos?.declarante?.email}    onChange={v => set('declarante.email', v)} disabled={validado} full />
                </div>
            </Bloque>

            <Bloque titulo="Exportador">
                <EntidadCompleta prefix="exportador" datos={datos} set={set} disabled={validado} />
            </Bloque>

            <Bloque titulo="Referencias">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="UCR"        value={datos?.referencias?.ucr}         onChange={v => set('referencias.ucr', v)} disabled={validado} />
                    <Field label="Interna"    value={datos?.referencias?.interna}     onChange={v => set('referencias.interna', v)} disabled={validado} />
                    <Field label="Facturar a" value={datos?.referencias?.facturar_a}  onChange={v => set('referencias.facturar_a', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Transporte">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Field label="Peso Bruto"      value={datos?.transporte?.peso_bruto}     onChange={v => set('transporte.peso_bruto', v)} disabled={validado} />
                    <Field label="Nº Partidas"     value={datos?.transporte?.num_partidas}   onChange={v => set('transporte.num_partidas', v)} disabled={validado} />
                    <Field label="País Despacho"   value={datos?.transporte?.pais_despacho}  onChange={v => set('transporte.pais_despacho', v)} disabled={validado} />
                    <Field label="País Destino"    value={datos?.transporte?.pais_destino}   onChange={v => set('transporte.pais_destino', v)} disabled={validado} />
                    <Field label="Aduana Salida"   value={datos?.transporte?.aduana_salida}  onChange={v => set('transporte.aduana_salida', v)} disabled={validado} />
                    <Field label="Aduana Destino"  value={datos?.transporte?.aduana_destino} onChange={v => set('transporte.aduana_destino', v)} disabled={validado} />
                    <Field label="Trans Interior"  value={datos?.transporte?.trans_interior} onChange={v => set('transporte.trans_interior', v)} disabled={validado} />
                    <Field label="Trans. Frontera" value={datos?.transporte?.trans_frontera} onChange={v => set('transporte.trans_frontera', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Transportista">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Contened."  value={datos?.transportista?.contenedores} onChange={v => set('transportista.contenedores', v)} disabled={validado} />
                    <Field label="Precintos"  value={datos?.transportista?.precintos}    onChange={v => set('transportista.precintos', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Ubicación origen mercancías">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Identif." value={datos?.ubicacion_origen_mercancias?.identificacion}
                           onChange={v => set('ubicacion_origen_mercancias.identificacion', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Lugar Carga">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Código UN" value={datos?.lugar_carga?.codigo_un}
                           onChange={v => set('lugar_carga.codigo_un', v)} disabled={validado} />
                </div>
            </Bloque>

            <Bloque titulo="Autorizaciones">
                <ListaObjetos
                    items={datos?.autorizaciones ?? []}
                    campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'numero', label: 'Nº Autorización' }]}
                    onChange={(arr) => set('autorizaciones', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo="Países de paso">
                <ListaTexto
                    items={datos?.paises_paso ?? []}
                    onChange={(arr) => set('paises_paso', arr)}
                    disabled={validado}
                    placeholder="Código de país"
                />
            </Bloque>

            <Bloque titulo="Medios de Transporte a la Partida">
                <ListaObjetos
                    items={datos?.medios_transporte_partida ?? []}
                    campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }, { key: 'pais', label: 'País' }]}
                    onChange={(arr) => set('medios_transporte_partida', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo="Medios de Transporte Frontera">
                <ListaObjetos
                    items={datos?.medios_transporte_frontera ?? []}
                    campos={[{ key: 'aduana', label: 'Aduana' }, { key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }, { key: 'pais', label: 'País' }]}
                    onChange={(arr) => set('medios_transporte_frontera', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo="Garantías">
                <ListaObjetos
                    items={datos?.garantias ?? []}
                    campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'garantia', label: 'Garantía' }, { key: 'importe', label: 'Importe' }]}
                    onChange={(arr) => set('garantias', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo="Documentos Transporte">
                <ListaObjetos
                    items={datos?.documentos_transporte ?? []}
                    campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }]}
                    onChange={(arr) => set('documentos_transporte', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo="Documentos Adicionales">
                <ListaObjetos
                    items={datos?.documentos_adicionales ?? []}
                    campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }]}
                    onChange={(arr) => set('documentos_adicionales', arr)}
                    disabled={validado}
                />
            </Bloque>

            <Bloque titulo={`Partidas · ${Array.isArray(datos?.partidas) ? datos.partidas.length : 0}`}>
                <PartidasEditor datos={datos} set={set} disabled={validado} />
            </Bloque>

            <Bloque titulo="Observaciones">
                <Field label="Observaciones" value={datos?.observaciones} onChange={v => set('observaciones', v)} disabled={validado} full />
            </Bloque>

            <div className="flex items-center gap-3 pt-4 border-t border-[color:var(--color-wx-inkline)]">
                {!validado && (
                    <>
                        <button type="submit" disabled={guardando} className="wx-btn">
                            {guardando ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                        <button type="button" onClick={validar} disabled={validando} className="wx-btn wx-btn">
                            {validando ? 'Validando…' : 'Validar declaración'}
                        </button>
                    </>
                )}
                {validado && (
                    <div className="wx-chip" data-tone="ok"><span className="dot" />Declaración validada y bloqueada</div>
                )}
                <p className="text-[11px] text-[color:var(--color-wx-muted)] ml-auto">
                    Generado {declaracion.generado_en} · confianza global {declaracion.confianza_global != null ? Math.round(declaracion.confianza_global) : '—'}%
                </p>
            </div>
        </form>
    );
}

function EntidadCompleta({ prefix, datos, set, disabled }: { prefix: string; datos: any; set: (p: string, v: any) => void; disabled: boolean; }) {
    const d = datos?.[prefix] ?? {};
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Nombre"    value={d.nombre}    onChange={v => set(`${prefix}.nombre`, v)}    disabled={disabled} />
            <Field label="Código"    value={d.codigo}    onChange={v => set(`${prefix}.codigo`, v)}    disabled={disabled} />
            <Field label="EORI"      value={d.eori}      onChange={v => set(`${prefix}.eori`, v)}      disabled={disabled} />
            <Field label="Domicilio" value={d.domicilio} onChange={v => set(`${prefix}.domicilio`, v)} disabled={disabled} full />
            <Field label="Ciudad"    value={d.ciudad}    onChange={v => set(`${prefix}.ciudad`, v)}    disabled={disabled} />
            <Field label="CP"        value={d.cp}        onChange={v => set(`${prefix}.cp`, v)}        disabled={disabled} />
            <Field label="País"      value={d.pais}      onChange={v => set(`${prefix}.pais`, v)}      disabled={disabled} />
        </div>
    );
}

/* -------------------------------------------------------------------- */
/* Editores genéricos de listas (Autorizaciones, Garantías, Partidas…)  */
/* -------------------------------------------------------------------- */

function ListaObjetos({
    items, campos, onChange, disabled,
}: {
    items: Record<string, any>[];
    campos: { key: string; label: string }[];
    onChange: (items: Record<string, any>[]) => void;
    disabled: boolean;
}) {
    const actualizar = (i: number, key: string, valor: string) => {
        onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: valor } : it)));
    };
    const eliminar = (i: number) => onChange(items.filter((_, idx) => idx !== i));
    const anadir = () => onChange([...items, Object.fromEntries(campos.map(c => [c.key, '']))]);

    return (
        <div className="space-y-3">
            {items.length === 0 && (
                <p className="text-[12px] text-[color:var(--color-wx-muted)]">Sin datos.</p>
            )}
            {items.map((item, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                    {campos.map(c => (
                        <div key={c.key} className="flex-1 min-w-[120px]">
                            <label className="wx-label">{c.label}</label>
                            <input
                                className="wx-input"
                                value={item[c.key] ?? ''}
                                disabled={disabled}
                                onChange={(e) => actualizar(i, c.key, e.target.value)}
                            />
                        </div>
                    ))}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => eliminar(i)}
                            className="text-[11px] text-[color:var(--color-wx-muted)] hover:text-[color:var(--color-wx-error)] pb-2 shrink-0"
                        >
                            ✕
                        </button>
                    )}
                </div>
            ))}
            {!disabled && (
                <button type="button" onClick={anadir} className="wx-btn wx-btn-ghost text-[12px]">+ Añadir</button>
            )}
        </div>
    );
}

function ListaTexto({
    items, onChange, disabled, placeholder,
}: {
    items: string[];
    onChange: (items: string[]) => void;
    disabled: boolean;
    placeholder?: string;
}) {
    const actualizar = (i: number, valor: string) => onChange(items.map((v, idx) => (idx === i ? valor : v)));
    const eliminar = (i: number) => onChange(items.filter((_, idx) => idx !== i));
    const anadir = () => onChange([...items, '']);

    return (
        <div className="space-y-2">
            {items.length === 0 && (
                <p className="text-[12px] text-[color:var(--color-wx-muted)]">Sin datos.</p>
            )}
            {items.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        className="wx-input"
                        value={v}
                        disabled={disabled}
                        placeholder={placeholder}
                        onChange={(e) => actualizar(i, e.target.value)}
                    />
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => eliminar(i)}
                            className="text-[11px] text-[color:var(--color-wx-muted)] hover:text-[color:var(--color-wx-error)]"
                        >
                            ✕
                        </button>
                    )}
                </div>
            ))}
            {!disabled && (
                <button type="button" onClick={anadir} className="wx-btn wx-btn-ghost text-[12px]">+ Añadir</button>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------- */
/* PARTIDAS: mercancía + desglose de bultos + importes + documentos     */
/* -------------------------------------------------------------------- */

const PARTIDA_VACIA = {
    pos_estadistica: '', pais_destino: '', peso_bruto: '', neto: '', unidad_suplementaria: '',
    factura_cod: '', factura_num: '', descripcion: '',
    bultos: [] as any[],
    valor_estadistico: '', moneda: '', cambio: '',
    documentos_precedentes: [] as any[],
    documentos_apoyo: [] as any[],
};

function PartidasEditor({ datos, set, disabled }: { datos: any; set: (p: string, v: any) => void; disabled: boolean; }) {
    const partidas: any[] = datos?.partidas ?? [];

    const actualizarPartida = (i: number, cambios: Record<string, any>) => {
        set('partidas', partidas.map((p, idx) => (idx === i ? { ...p, ...cambios } : p)));
    };
    const eliminarPartida = (i: number) => set('partidas', partidas.filter((_, idx) => idx !== i));
    const anadirPartida = () => set('partidas', [...partidas, { ...PARTIDA_VACIA }]);

    return (
        <div className="space-y-5">
            {partidas.length === 0 && (
                <p className="text-[12px] text-[color:var(--color-wx-muted)]">Sin partidas detectadas.</p>
            )}
            {partidas.map((p, i) => (
                <div key={i} className="border border-[color:var(--color-wx-inkline)] p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[12px] font-medium">Partida {i + 1}</div>
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => eliminarPartida(i)}
                                className="text-[11px] text-[color:var(--color-wx-muted)] hover:text-[color:var(--color-wx-error)]"
                            >
                                Eliminar partida
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <Field label="Pos. Estadística" value={p.pos_estadistica} onChange={v => actualizarPartida(i, { pos_estadistica: v })} disabled={disabled} />
                        <Field label="País Destino"     value={p.pais_destino}    onChange={v => actualizarPartida(i, { pais_destino: v })} disabled={disabled} />
                        <Field label="Peso Bruto"       value={p.peso_bruto}      onChange={v => actualizarPartida(i, { peso_bruto: v })} disabled={disabled} />
                        <Field label="Neto"             value={p.neto}            onChange={v => actualizarPartida(i, { neto: v })} disabled={disabled} />
                        <Field label="Und. Suplement."  value={p.unidad_suplementaria} onChange={v => actualizarPartida(i, { unidad_suplementaria: v })} disabled={disabled} />
                        <Field label="Factura – Cod"    value={p.factura_cod}     onChange={v => actualizarPartida(i, { factura_cod: v })} disabled={disabled} />
                        <Field label="Factura – Num"    value={p.factura_num}     onChange={v => actualizarPartida(i, { factura_num: v })} disabled={disabled} />
                        <Field label="Descripción"      value={p.descripcion}     onChange={v => actualizarPartida(i, { descripcion: v })} disabled={disabled} full />
                    </div>

                    <div>
                        <div className="wx-label mb-1">Desglose de Bultos</div>
                        <ListaObjetos
                            items={p.bultos ?? []}
                            campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'bultos', label: 'Bultos' }, { key: 'marcas', label: 'Marcas' }]}
                            onChange={(arr) => actualizarPartida(i, { bultos: arr })}
                            disabled={disabled}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Field label="Valor Estadístico" value={p.valor_estadistico} onChange={v => actualizarPartida(i, { valor_estadistico: v })} disabled={disabled} />
                        <Field label="Moneda"            value={p.moneda}            onChange={v => actualizarPartida(i, { moneda: v })} disabled={disabled} />
                        <Field label="Cambio"            value={p.cambio}            onChange={v => actualizarPartida(i, { cambio: v })} disabled={disabled} />
                    </div>

                    <div>
                        <div className="wx-label mb-1">Documentos Precedentes</div>
                        <ListaObjetos
                            items={p.documentos_precedentes ?? []}
                            campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }, { key: 'partida', label: 'Partida' }]}
                            onChange={(arr) => actualizarPartida(i, { documentos_precedentes: arr })}
                            disabled={disabled}
                        />
                    </div>

                    <div>
                        <div className="wx-label mb-1">Documentos Apoyo</div>
                        <ListaObjetos
                            items={p.documentos_apoyo ?? []}
                            campos={[{ key: 'tipo', label: 'Tipo' }, { key: 'documento', label: 'Documento' }, { key: 'linea', label: 'Línea' }]}
                            onChange={(arr) => actualizarPartida(i, { documentos_apoyo: arr })}
                            disabled={disabled}
                        />
                    </div>
                </div>
            ))}
            {!disabled && (
                <button type="button" onClick={anadirPartida} className="wx-btn wx-btn-ghost text-[12px]">+ Añadir partida</button>
            )}
        </div>
    );
}

function Field({ label, value, onChange, disabled, full }: {
    label: string; value: any; onChange: (v: string) => void; disabled?: boolean; full?: boolean;
}) {
    return (
        <div className={full ? 'md:col-span-3' : ''}>
            <label className="wx-label">{label}</label>
            <input
                className="wx-input"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            />
        </div>
    );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <section className="wx-card p-5 lg:p-6">
            <div className="wx-eyebrow mb-4">{titulo}</div>
            {children}
        </section>
    );
}

/* -------------------------------------------------------------------- */
/* Detalle documentos                                                    */
/* -------------------------------------------------------------------- */

function DocumentosDetalle({ documentos, onPreview }: { documentos: Documento[]; onPreview: (d: Documento) => void; }) {
    if (documentos.length === 0) {
        return (
            <div className="wx-card p-8 text-center">
                <div className="font-display font-bold text-[24px] mb-2">No hay documentos.</div>
                <p className="text-[13px] text-[color:var(--color-wx-ink-2)]">Sube documentos en el panel izquierdo.</p>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            {documentos.map((d) => {
                const esPdf = d.mime === 'application/pdf' || d.nombre_original.toLowerCase().endsWith('.pdf');
                return (
                <article key={d.id} className="wx-card p-5">
                    <header className="flex items-center justify-between gap-4 mb-3">
                        <div className="min-w-0">
                            <div className="text-[13px] font-medium truncate">{d.nombre_original}</div>
                            <div className="text-[11px] text-[color:var(--color-wx-muted)] mt-1">
                                {d.tipo_label} · lectura {d.confianza != null ? Math.round(d.confianza) + '%' : '—'} · {formatoBytes(d.tamano)}
                            </div>
                        </div>
                        {esPdf && d.url ? (
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="wx-btn wx-btn-ghost text-[12px] shrink-0">
                                Ver PDF ↗
                            </a>
                        ) : (
                            <button onClick={() => onPreview(d)} className="wx-btn wx-btn-ghost text-[12px] shrink-0">
                                Ver documento
                            </button>
                        )}
                    </header>
                    {d.nota_ia && (
                        <p className="text-[12px] text-[color:var(--color-wx-ink-2)] mb-3 border-l-2 border-[color:var(--color-wx-signal)] pl-3">
                            {d.nota_ia}
                        </p>
                    )}
                    {d.datos_extraidos && (
                        <DatosGrid datos={d.datos_extraidos} />
                    )}
                </article>
                );
            })}
        </div>
    );
}

function DatosGrid({ datos }: { datos: Record<string, any> }) {
    const pares: [string, string][] = useMemo(() => aplanar(datos), [datos]);
    if (pares.length === 0) return null;
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
            {pares.map(([k, v]) => (
                <div key={k}>
                    <dt className="text-[11px] text-[color:var(--color-wx-muted)]">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function aplanar(obj: any, prefix = ''): [string, string][] {
    const out: [string, string][] = [];
    if (obj === null || obj === undefined) return out;
    if (Array.isArray(obj)) {
        if (obj.length === 0) return out;
        out.push([prefix || 'items', `${obj.length} elemento(s)`]);
        return out;
    }
    if (typeof obj !== 'object') {
        return [[prefix, String(obj)]];
    }
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '' ||
            (Array.isArray(v) && v.length === 0)) continue;
        const nombre = prefix ? `${prefix} · ${k}` : k;
        if (typeof v === 'object' && !Array.isArray(v)) {
            out.push(...aplanar(v, nombre));
        } else if (Array.isArray(v)) {
            out.push([nombre, `${v.length} elemento(s)`]);
        } else {
            out.push([nombre, String(v)]);
        }
    }
    return out;
}

/* -------------------------------------------------------------------- */
/* Historial                                                             */
/* -------------------------------------------------------------------- */

function HistorialLista({ historial }: { historial: Historial[] }) {
    if (historial.length === 0) return (
        <div className="wx-card p-8 text-center text-[13px] text-[color:var(--color-wx-muted)]">
            Aún no hay actividad registrada.
        </div>
    );
    return (
        <ol className="relative pl-6 border-l border-[color:var(--color-wx-rule)] space-y-5">
            {historial.map((h) => (
                <li key={h.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 w-2 h-2 rounded-full bg-[color:var(--color-wx-signal)]" />
                    <div className="text-[12px] text-[color:var(--color-wx-muted)] tabular-nums">{h.cuando}</div>
                    <div className="text-[13px] leading-snug">{h.detalle}</div>
                    <div className="text-[11px] text-[color:var(--color-wx-muted)] mt-0.5">
                        <span className="uppercase tracking-wider">{h.accion}</span> · {h.usuario}
                    </div>
                </li>
            ))}
        </ol>
    );
}

/* -------------------------------------------------------------------- */
/* Visor modal                                                           */
/* -------------------------------------------------------------------- */

function VisorDocumento({ documento, onClose }: { documento: Documento; onClose: () => void; }) {
    const esImagen = documento.mime?.startsWith('image/');
    const esPdf = documento.mime === 'application/pdf' || documento.nombre_original.toLowerCase().endsWith('.pdf');

    // Cerrar con ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 bg-[color:var(--color-wx-ink)]/80 flex items-stretch justify-center p-2 sm:p-4 md:p-6 overflow-auto"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-5xl flex flex-col shadow-xl rounded-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[color:var(--color-wx-rule)]">
                    <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{documento.nombre_original}</div>
                        <div className="text-[11px] text-[color:var(--color-wx-muted)]">{documento.tipo_label}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {documento.url && (
                            <a
                                href={documento.url}
                                target="_blank"
                                rel="noreferrer"
                                className="wx-btn wx-btn-outline !py-1.5 !px-3 text-[12px]"
                            >
                                Abrir en pestaña ↗
                            </a>
                        )}
                        <button onClick={onClose} className="wx-btn wx-btn-ghost !py-1.5 !px-3 text-[12px]">
                            Cerrar
                        </button>
                    </div>
                </header>

                <div className="flex-1 min-h-[60vh] bg-[color:var(--color-wx-paper-2)] flex items-center justify-center">
                    {esImagen && documento.url && (
                        <img src={documento.url} alt={documento.nombre_original} className="max-h-[85vh] max-w-full" />
                    )}
                    {esPdf && documento.url && (
                        // iframe funciona mejor que <object> en Safari macOS/iOS.
                        // En iOS Safari el visor nativo se abre igualmente si el iframe
                        // no renderiza — por eso mantenemos el CTA "Abrir en pestaña".
                        <iframe
                            src={documento.url}
                            title={documento.nombre_original}
                            className="w-full h-[85vh] bg-white border-0"
                        />
                    )}
                    {!esImagen && !esPdf && documento.url && (
                        <a href={documento.url} target="_blank" rel="noreferrer" className="wx-btn">
                            Descargar {documento.nombre_original}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------- */

function formatoBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatoAbreviado(mime: string | null, nombre: string) {
    const ext = nombre.split('.').pop()?.toUpperCase();
    if (mime?.includes('pdf') || ext === 'PDF') return 'PDF';
    if (mime?.startsWith('image/')) return 'IMG';
    return ext ?? 'DOC';
}
