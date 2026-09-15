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
}
