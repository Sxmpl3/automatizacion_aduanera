<?php

namespace App\Services;

use App\Models\Declaracion;
use App\Models\Expediente;
use App\Services\Schema\DeclaracionTransitoSchema;

class DeclaracionBuilder
{
    public function __construct(protected OpenAIService $openai) {}

    public function construir(Expediente $expediente): Declaracion
    {
        $expediente->loadMissing('documentos');

        $porTipo = $expediente->documentos->groupBy('tipo_detectado')->map(function ($grupo) {
            return $grupo->map(fn ($d) => [
                'archivo'         => $d->nombre_original,
                'confianza'       => $d->confianza,
                'resumen'         => $d->nota_ia,
                'datos_extraidos' => $d->datos_extraidos ?? [],
            ])->values();
        });

        $mensajes = [
            [
                'role'    => 'system',
                'content' => <<<'SYS'
                Eres el motor de consolidación de Wixia para declaraciones de tránsito NCTS (T1/T2/T2F/TIR).
                Recibes los datos ya extraídos de todos los documentos del expediente (facturas, CMR, B/L, certificados, ICS2 o incluso una declaración T1/T2 ya emitida).
                Cada documento trae su 'datos_extraidos' en la MISMA estructura que debes devolver tú en 'datos': la del impreso oficial
                "Datos a cumplimentar en declaración de tránsito" (FIGURAS · EXPEDICIÓN · EXPEDICIÓN (2) · GARANTÍAS · Doc. Adjuntados · PARTIDAS).
                Tu trabajo es fusionar esa información en una ÚNICA declaración coherente, resolviendo conflictos y priorizando por fuente:
                - Declaración de tránsito emitida (si viene) → mrn, lrn, tipo_declaracion, seguridad, datos_reducidos, aduanas (transporte.aduana_salida/destino), declarante, representante, garantias, transportista.precintos, autorizaciones.
                - CMR y B/L → transportista, transporte (modo/matrícula vía trans_interior/trans_frontera), aduanas, medios_transporte_partida/frontera.
                - Factura comercial → exportador, consignatario, referencias, partidas (valor_estadistico, moneda, descripcion).
                - Packing list → partidas.peso_bruto/neto, partidas.bultos.
                - Certificados → documentos_adicionales, partidas.pos_estadistica, país de origen dentro de observaciones si no hay campo dedicado.

                REGLAS DE MAPEO ESTRICTAS:
                · No renombres claves: usa exactamente las del esquema (exportador, consignatario, declarante, representante, transporte, transportista, garantias, partidas...).
                · Si el documento ya trae mrn/lrn, cópialos tal cual, no los generes.
                · 'declarante' se identifica por NIF (no EORI); no lo confundas con 'exportador'/'consignatario'/'representante', que sí llevan EORI.
                · Une las partidas de todos los documentos en un único array 'partidas' (una entrada por línea de mercancía/posición estadística), sin duplicar la misma línea si varios documentos la describen.
                · EORI y NIF se conservan con formato completo (letras+dígitos, ej. ESB72145238).

                NÚMEROS EUROPEOS: en aduanas ES/UE el separador de miles es '.' y el decimal ','.
                '22.153,00' = 22153.0 · '1.500,50' = 1500.5 · '15.355' (sin coma) suele ser 15355 entero.
                Nunca conviertas '22.153' a 22.153: eso serían 22 gramos de mercancía, incoherente para tránsito.

                Nunca inventes datos. Si un campo falta en TODOS los documentos, déjalo vacío y añade una advertencia.
                Cada advertencia es un objeto {campo, mensaje}: 'campo' es la ruta del campo afectado tal como aparece en el
                esquema 'datos' (ej. 'consignatario.eori', 'partidas.valor_estadistico'), o 'general' si no aplica a un campo
                concreto. 'mensaje' es una frase breve en español que NO debe repetir la ruta técnica ni el nombre en snake_case
                del campo — la interfaz ya muestra el nombre legible del campo junto al mensaje, así que ve directo al motivo
                (ej. campo 'consignatario.eori', mensaje "No aparece en ningún documento del expediente").
                Estima una confianza global (0-100) según la cobertura y coherencia de los datos.
                Trabaja en español.
                SYS,
            ],
            [
                'role'    => 'user',
                'content' => "Referencia expediente: {$expediente->referencia}\n\nDATOS EXTRAÍDOS POR DOCUMENTO:\n".json_encode($porTipo, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
            ],
        ];

        $schema = $this->schemaDeclaracion();
        $resultado = $this->openai->json($mensajes, $schema);

        $declaracion = Declaracion::updateOrCreate(
            ['expediente_id' => $expediente->id],
            [
                'tipo'             => 'transito',
                'estado'           => 'propuesta',
                'datos'            => $resultado['datos'] ?? [],
                'advertencias'     => $resultado['advertencias'] ?? [],
                'confianza_global' => (float) ($resultado['confianza_global'] ?? 0),
                'generado_en'      => now(),
            ]
        );

        // Actualizar cabecera del expediente con campos clave si vienen
        $datos = $resultado['datos'] ?? [];
        $expediente->update([
            'estado'          => 'revision',
            'cliente'         => data_get($datos, 'exportador.nombre') ?: $expediente->cliente,
            'mrn'             => data_get($datos, 'mrn') ?: $expediente->mrn,
            'aduana_partida'  => data_get($datos, 'transporte.aduana_salida') ?: $expediente->aduana_partida,
            'aduana_destino'  => data_get($datos, 'transporte.aduana_destino') ?: $expediente->aduana_destino,
        ]);

        return $declaracion;
    }

    protected function schemaDeclaracion(): array
    {
        $advertencia = [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'campo'   => ['type' => 'string', 'enum' => array_keys(DeclaracionTransitoSchema::etiquetas())],
                'mensaje' => ['type' => 'string'],
            ],
            'required' => ['campo', 'mensaje'],
        ];

        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'confianza_global' => ['type' => 'number', 'minimum' => 0, 'maximum' => 100],
                'advertencias'     => ['type' => 'array', 'items' => $advertencia],
                'datos'            => DeclaracionTransitoSchema::datos(),
            ],
            'required' => ['confianza_global', 'advertencias', 'datos'],
        ];
    }
}
