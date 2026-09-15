<?php

namespace App\Services\Schema;

/**
 * Estructura de datos de la declaración de tránsito NCTS, calcada campo a
 * campo del formulario "Datos a cumplimentar en declaración de tránsito"
 * (FIGURAS · EXPEDICIÓN · EXPEDICIÓN 2 · GARANTÍAS · Doc. Adjuntados · PARTIDAS).
 *
 * La usan tanto DocumentoAnalyzer (extracción por documento) como
 * DeclaracionBuilder (declaración consolidada) para que ambos JSON schema
 * compartan exactamente la misma forma y no puedan desincronizarse.
 */
class DeclaracionTransitoSchema
{
    protected static function s(): array
    {
        return ['type' => ['string', 'null']];
    }

    protected static function n(): array
    {
        return ['type' => ['number', 'null']];
    }

    protected static function objeto(array $propiedades): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => $propiedades,
            'required' => array_keys($propiedades),
        ];
    }

    protected static function lista(array $itemSchema): array
    {
        return ['type' => 'array', 'items' => $itemSchema];
    }

    protected static function listaTexto(): array
    {
        return self::lista(['type' => 'string']);
    }

    /**
     * FIGURAS · Consignatario / Exportador: mismas columnas en el formulario
     * (Nombre, Código, Domicilio, Ciudad, CP, País, EORI).
     */
    protected static function entidadConEori(): array
    {
        $s = self::s();

        return self::objeto([
            'nombre'    => $s,
            'codigo'    => $s,
            'domicilio' => $s,
            'ciudad'    => $s,
            'cp'        => $s,
            'pais'      => $s,
            'eori'      => $s,
        ]);
    }

    public static function datos(): array
    {
        $s = self::s();
        $n = self::n();

        $declarante = self::objeto([
            'nif'      => $s,
            'nombre'   => $s,
            'telefono' => $s,
            'email'    => $s,
        ]);

        $representante = self::objeto([
            'eori'           => $s,
            'caracter_repres' => $s,
        ]);

        $referencias = self::objeto([
            'ucr'        => $s,
            'interna'    => $s,
            'facturar_a' => $s,
        ]);

        $transporte = self::objeto([
            'peso_bruto'     => $n,
            'num_partidas'   => $n,
            'pais_despacho'  => $s,
            'pais_destino'   => $s,
            'aduana_salida'  => $s,
            'aduana_destino' => $s,
            'trans_interior' => $s,
            'trans_frontera' => $s,
        ]);

        $transportista = self::objeto([
            'contenedores' => $s,
            'precintos'    => $s,
        ]);

        $ubicacionOrigenMercancias = self::objeto([
            'identificacion' => $s,
        ]);

        $lugarCarga = self::objeto([
            'codigo_un' => $s,
        ]);

        $autorizacion = self::objeto([
            'tipo'   => $s,
            'numero' => $s,
        ]);

        $medioTransportePartida = self::objeto([
            'tipo'      => $s,
            'documento' => $s,
            'pais'      => $s,
        ]);

        $medioTransporteFrontera = self::objeto([
            'aduana'    => $s,
            'tipo'      => $s,
            'documento' => $s,
            'pais'      => $s,
        ]);

        $garantia = self::objeto([
            'tipo'      => $s,
            'garantia'  => $s,
            // Puede ser un importe numérico o texto libre como "Automatico".
            'importe'   => $s,
        ]);

        $documentoRef = self::objeto([
            'tipo'      => $s,
            'documento' => $s,
        ]);

        $bulto = self::objeto([
            'tipo'   => $s,
            'bultos' => $n,
            'marcas' => $s,
        ]);

        $documentoPrecedente = self::objeto([
            'tipo'      => $s,
            'documento' => $s,
            'partida'   => $s,
        ]);

        $documentoApoyo = self::objeto([
            'tipo'      => $s,
            'documento' => $s,
            'linea'     => $n,
        ]);

        $partida = self::objeto([
            'pos_estadistica'       => $s,
            'pais_destino'          => $s,
            'peso_bruto'            => $n,
            'neto'                  => $n,
            'unidad_suplementaria'  => $s,
            'factura_cod'           => $s,
            'factura_num'           => $s,
            'descripcion'           => $s,
            'bultos'                => self::lista($bulto),
            'valor_estadistico'     => $n,
            'moneda'                => $s,
            'cambio'                => $n,
            'documentos_precedentes'=> self::lista($documentoPrecedente),
            'documentos_apoyo'      => self::lista($documentoApoyo),
        ]);

        return self::objeto([
            // FIGURAS · Declaración. MRN/LRN no están en el impreso de captura
            // (los asigna la aduana al validar), pero se conservan si el
            // documento fuente es una declaración YA EMITIDA.
            'tipo_declaracion' => ['type' => 'string', 'enum' => ['T1', 'T2', 'T2F', 'TIR', '']],
            'seguridad'        => $s,
            'datos_reducidos'  => $s,
            'mrn'              => $s,
            'lrn'              => $s,

            // FIGURAS
            'consignatario'  => self::entidadConEori(),
            'representante'  => $representante,
            'declarante'     => $declarante,
            'exportador'     => self::entidadConEori(),
            'referencias'    => $referencias,

            // EXPEDICIÓN
            'transporte'                  => $transporte,
            'transportista'               => $transportista,
            'ubicacion_origen_mercancias' => $ubicacionOrigenMercancias,
            'lugar_carga'                 => $lugarCarga,

            // EXPEDICIÓN (2)
            'autorizaciones'             => self::lista($autorizacion),
            'paises_paso'                => self::listaTexto(),
            'medios_transporte_partida'  => self::lista($medioTransportePartida),
            'medios_transporte_frontera' => self::lista($medioTransporteFrontera),

            // GARANTÍAS
            'garantias' => self::lista($garantia),

            // Doc. Adjuntados
            'documentos_transporte'  => self::lista($documentoRef),
            'documentos_adicionales' => self::lista($documentoRef),

            // PARTIDAS
            'partidas' => self::lista($partida),

            'observaciones' => $s,
        ]);
    }

    /**
     * Glosario "ruta de campo → nombre a mostrar en la web", para no exponer
     * nunca claves técnicas (p.ej. 'consignatario.eori') al usuario: se usa
     * tanto para que la IA elija 'campo' en las advertencias como para que
     * el frontend traduzca esa ruta a una etiqueta legible.
     *
     * @return array<string, string>
     */
    public static function etiquetas(): array
    {
        return [
            'general' => 'General',

            // FIGURAS · Declaración
            'tipo_declaracion' => 'Tipo de declaración',
            'seguridad'        => 'Seguridad',
            'datos_reducidos'  => 'Datos reducidos',
            'mrn'              => 'MRN',
            'lrn'              => 'LRN',

            // Consignatario
            'consignatario'          => 'Consignatario',
            'consignatario.nombre'   => 'Nombre del consignatario',
            'consignatario.codigo'   => 'Código del consignatario',
            'consignatario.domicilio'=> 'Domicilio del consignatario',
            'consignatario.ciudad'   => 'Ciudad del consignatario',
            'consignatario.cp'       => 'Código postal del consignatario',
            'consignatario.pais'     => 'País del consignatario',
            'consignatario.eori'     => 'EORI del consignatario',

            // Representante
            'representante'                  => 'Representante',
            'representante.eori'             => 'EORI del representante',
            'representante.caracter_repres'  => 'Carácter de representación',

            // Declarante
            'declarante'          => 'Declarante',
            'declarante.nif'      => 'NIF del declarante',
            'declarante.nombre'   => 'Nombre del declarante',
            'declarante.telefono' => 'Teléfono del declarante',
            'declarante.email'    => 'Email del declarante',

            // Exportador
            'exportador'          => 'Exportador',
            'exportador.nombre'   => 'Nombre del exportador',
            'exportador.codigo'   => 'Código del exportador',
            'exportador.domicilio'=> 'Domicilio del exportador',
            'exportador.ciudad'   => 'Ciudad del exportador',
            'exportador.cp'       => 'Código postal del exportador',
            'exportador.pais'     => 'País del exportador',
            'exportador.eori'     => 'EORI del exportador',

            // Referencias
            'referencias'             => 'Referencias',
            'referencias.ucr'         => 'UCR',
            'referencias.interna'     => 'Referencia interna',
            'referencias.facturar_a'  => 'Facturar a',

            // EXPEDICIÓN
            'transporte'                 => 'Transporte',
            'transporte.peso_bruto'      => 'Peso bruto',
            'transporte.num_partidas'    => 'Número de partidas',
            'transporte.pais_despacho'   => 'País de despacho',
            'transporte.pais_destino'    => 'País de destino',
            'transporte.aduana_salida'   => 'Aduana de salida',
            'transporte.aduana_destino'  => 'Aduana de destino',
            'transporte.trans_interior'  => 'Transporte interior',
            'transporte.trans_frontera'  => 'Transporte frontera',

            'transportista'              => 'Transportista',
            'transportista.contenedores' => 'Contenedores',
            'transportista.precintos'    => 'Precintos',

            'ubicacion_origen_mercancias'                 => 'Ubicación origen mercancías',
            'ubicacion_origen_mercancias.identificacion'  => 'Identificación de ubicación de origen de mercancías',

            'lugar_carga'            => 'Lugar de carga',
            'lugar_carga.codigo_un'  => 'Código UN del lugar de carga',

            // EXPEDICIÓN (2)
            'autorizaciones'        => 'Autorizaciones',
            'autorizaciones.tipo'   => 'Tipo de autorización',
            'autorizaciones.numero' => 'Número de autorización',

            'paises_paso' => 'Países de paso',

            'medios_transporte_partida'           => 'Medios de transporte a la partida',
            'medios_transporte_partida.tipo'      => 'Tipo de medio de transporte a la partida',
            'medios_transporte_partida.documento' => 'Documento del medio de transporte a la partida',
            'medios_transporte_partida.pais'      => 'País del medio de transporte a la partida',

            'medios_transporte_frontera'           => 'Medios de transporte en frontera',
            'medios_transporte_frontera.aduana'    => 'Aduana del medio de transporte en frontera',
            'medios_transporte_frontera.tipo'      => 'Tipo de medio de transporte en frontera',
            'medios_transporte_frontera.documento' => 'Documento del medio de transporte en frontera',
            'medios_transporte_frontera.pais'      => 'País del medio de transporte en frontera',

            // GARANTÍAS
            'garantias'          => 'Garantías',
            'garantias.tipo'     => 'Tipo de garantía',
            'garantias.garantia' => 'Referencia de la garantía',
            'garantias.importe'  => 'Importe de la garantía',

            // Doc. Adjuntados
            'documentos_transporte'           => 'Documentos de transporte',
            'documentos_transporte.tipo'      => 'Tipo de documento de transporte',
            'documentos_transporte.documento' => 'Documento de transporte',

            'documentos_adicionales'           => 'Documentos adicionales',
            'documentos_adicionales.tipo'      => 'Tipo de documento adicional',
            'documentos_adicionales.documento' => 'Documento adicional',

            // PARTIDAS
            'partidas'                        => 'Partidas',
            'partidas.pos_estadistica'        => 'Posición estadística',
            'partidas.pais_destino'           => 'País de destino de la partida',
            'partidas.peso_bruto'             => 'Peso bruto de la partida',
            'partidas.neto'                   => 'Peso neto de la partida',
            'partidas.unidad_suplementaria'   => 'Unidad suplementaria',
            'partidas.factura_cod'            => 'Código de factura',
            'partidas.factura_num'            => 'Número de factura',
            'partidas.descripcion'            => 'Descripción de la mercancía',
            'partidas.valor_estadistico'      => 'Valor estadístico',
            'partidas.moneda'                 => 'Moneda',
            'partidas.cambio'                 => 'Cambio',

            'partidas.bultos'         => 'Desglose de bultos',
            'partidas.bultos.tipo'    => 'Tipo de bulto',
            'partidas.bultos.bultos'  => 'Número de bultos',
            'partidas.bultos.marcas'  => 'Marcas de los bultos',

            'partidas.documentos_precedentes'          => 'Documentos precedentes',
            'partidas.documentos_precedentes.tipo'     => 'Tipo de documento precedente',
            'partidas.documentos_precedentes.documento'=> 'Documento precedente',
            'partidas.documentos_precedentes.partida'  => 'Partida del documento precedente',

            'partidas.documentos_apoyo'           => 'Documentos de apoyo',
            'partidas.documentos_apoyo.tipo'      => 'Tipo de documento de apoyo',
            'partidas.documentos_apoyo.documento'  => 'Documento de apoyo',
            'partidas.documentos_apoyo.linea'      => 'Línea del documento de apoyo',

            'observaciones' => 'Observaciones',
        ];
    }
}
