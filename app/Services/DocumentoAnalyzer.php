<?php

namespace App\Services;

use App\Models\Documento;
use App\Services\Schema\DeclaracionTransitoSchema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class DocumentoAnalyzer
{
    public function __construct(protected OpenAIService $openai) {}

    /**
     * Analiza un documento: extrae texto, clasifica y estructura datos.
     */
    public function analizar(Documento $documento): void
    {
        $documento->update(['estado' => 'analizando']);

        $extraido = $this->extraerContenido($documento);

        $mensajes = [
            [
                'role'    => 'system',
                'content' => <<<'SYS'
                Eres un asistente experto del departamento de aduanas de una empresa española (Wixia) especializado en documentación de tránsito comunitario (T1/T2/TIR).
                Tu misión es clasificar el documento recibido y extraer con precisión los campos relevantes para preparar una declaración de tránsito NCTS.
                Trabaja siempre en español. Devuelve valores tal como aparecen en el documento (no traduzcas nombres de empresas o direcciones).
                Si un campo no está presente, deja la cadena vacía o el array vacío — nunca inventes datos.

                El campo 'datos' sigue EXACTAMENTE la estructura del impreso oficial "Datos a cumplimentar en declaración de tránsito"
                (secciones FIGURAS · EXPEDICIÓN · EXPEDICIÓN (2) · GARANTÍAS · Doc. Adjuntados · PARTIDAS). No renombres ni inventes
                claves fuera de ese esquema. Distingue bien las figuras, que en un documento comercial suelen confundirse:
                · 'exportador' = quien expide/vende la mercancía (Nombre, Código, Domicilio, Ciudad, CP, País, EORI).
                · 'consignatario' = quien la recibe (mismas columnas que exportador).
                · 'declarante' = quien presenta la declaración ante aduana; se identifica por NIF (no EORI), Nombre, Teléfono, Email.
                · 'representante' = si el declarante actúa como representante de otro (EORI + 'caracter_repres', el código 1/2/3 del carácter de representación).
                No mezcles el NIF del declarante con el EORI del exportador/consignatario/representante: son campos distintos.
                SYS,
            ],
            [
                'role'    => 'user',
                'content' => $this->construirContenidoUsuario($documento, $extraido),
            ],
        ];

        $schema = $this->schemaDocumento();

        $resultado = $this->openai->json($mensajes, $schema);

        $documento->update([
            'tipo_detectado'   => $resultado['tipo'] ?? 'otro',
            'confianza'        => (float) ($resultado['confianza'] ?? 0),
            // Solo guardamos texto si de verdad lo extrajimos (fallback);
            // cuando enviamos el archivo directo al modelo, no hay texto local.
            'texto_extraido'   => $extraido['texto'] ?? null,
            'datos_extraidos'  => $resultado['datos'] ?? [],
            'nota_ia'          => $resultado['resumen'] ?? null,
            'estado'           => 'analizado',
        ]);
    }

    /**
     * Tamaño máximo del archivo (bytes) para inyectarlo directo al modelo.
     * 15 MB del PDF → ~20 MB en base64, dentro del límite de la API.
     */
    protected const MAX_ARCHIVO_DIRECTO = 15 * 1024 * 1024;

    /**
     * Devuelve el "content" listo para GPT: prioriza envío directo del
     * documento (imagen o PDF) para que el modelo lea tablas, casillas,
     * sellos y firmas. Solo cae a texto plano si el archivo es TXT o si
     * excede el límite y necesitamos extracción por fallback.
     *
     * @return array{modo: string, texto: ?string, archivo_base64: ?string, archivo_mime: ?string}
     */
    protected function extraerContenido(Documento $documento): array
    {
        $ruta = Storage::disk('public')->path($documento->ruta);
        $mime = strtolower((string) $documento->mime);
        $nombre = strtolower((string) $documento->nombre_original);
        $tamano = is_file($ruta) ? filesize($ruta) : 0;

        // Imágenes → base64 → visión
        if (str_starts_with($mime, 'image/')) {
            if ($tamano > 0 && $tamano <= self::MAX_ARCHIVO_DIRECTO) {
                return [
                    'modo'            => 'imagen',
                    'texto'           => null,
                    'archivo_base64'  => base64_encode((string) @file_get_contents($ruta)),
                    'archivo_mime'    => $mime,
                ];
            }
        }

        // PDF → base64 → adjunto directo al modelo (Chat Completions "file")
        if ($mime === 'application/pdf' || str_ends_with($nombre, '.pdf')) {
            if ($tamano > 0 && $tamano <= self::MAX_ARCHIVO_DIRECTO) {
                return [
                    'modo'            => 'pdf',
                    'texto'           => null,
                    'archivo_base64'  => base64_encode((string) @file_get_contents($ruta)),
                    'archivo_mime'    => 'application/pdf',
                ];
            }
            // Fallback: PDF demasiado grande → extraer texto con pdftotext
            return [
                'modo'            => 'texto',
                'texto'           => $this->pdfATexto($ruta),
                'archivo_base64'  => null,
                'archivo_mime'    => null,
            ];
        }

        // Texto plano (.txt) → contenido directo
        return [
            'modo'            => 'texto',
            'texto'           => (string) @file_get_contents($ruta),
            'archivo_base64'  => null,
            'archivo_mime'    => null,
        ];
    }

    protected function pdfATexto(string $ruta): string
    {
        $bin = trim((string) @shell_exec('command -v pdftotext'));
        if ($bin === '') {
            return '[PDF demasiado grande y sin extractor de texto en el servidor]';
        }
        $tmp = tempnam(sys_get_temp_dir(), 'wixia_pdf_').'.txt';
        @shell_exec(sprintf('%s -layout %s %s 2>/dev/null', escapeshellcmd($bin), escapeshellarg($ruta), escapeshellarg($tmp)));
        $texto = @file_get_contents($tmp) ?: '';
        @unlink($tmp);
        return mb_substr($texto, 0, 20000);
    }

    /**
     * @param  array{modo: string, texto: ?string, archivo_base64: ?string, archivo_mime: ?string}  $extraido
     * @return string|array<int, array<string, mixed>>
     */
    protected function construirContenidoUsuario(Documento $documento, array $extraido)
    {
        $encabezado = "Documento adjunto: {$documento->nombre_original}\n\n";
        $encabezado .= "Instrucciones:\n";
        $encabezado .= "1. Determina el TIPO del documento entre: factura_comercial, cmr, conocimiento_embarque, certificado_fitosanitario, certificado_conformidad, ics2, packing_list, otro. Una \"Declaración de tránsito emitida\" (T1/T2 con MRN) clasifícala como 'otro' con tipo real en observaciones.\n";
        $encabezado .= "2. Estima tu confianza (0-100). Fíjate también en sellos, firmas, casillas marcadas y anotaciones manuscritas.\n";
        $encabezado .= "3. Redacta un resumen breve (máx. 240 caracteres) en español.\n";
        $encabezado .= "4. Extrae los CAMPOS relevantes para una declaración de tránsito NCTS y devuélvelos en 'datos', siguiendo EXACTAMENTE la estructura del impreso oficial \"Datos a cumplimentar en declaración de tránsito\":\n";
        $encabezado .= "   · Declaración: tipo_declaracion (T1/T2/T2F/TIR), seguridad, datos_reducidos, mrn, lrn (mrn/lrn solo si el documento ES una declaración de tránsito ya emitida, no aparecen en facturas/CMR).\n";
        $encabezado .= "   · exportador{nombre,codigo,domicilio,ciudad,cp,pais,eori} y consignatario{nombre,codigo,domicilio,ciudad,cp,pais,eori}.\n";
        $encabezado .= "   · representante{eori,caracter_repres} y declarante{nif,nombre,telefono,email} (NIF, no EORI).\n";
        $encabezado .= "   · referencias{ucr,interna,facturar_a}.\n";
        $encabezado .= "   · transporte{peso_bruto,num_partidas,pais_despacho,pais_destino,aduana_salida,aduana_destino,trans_interior,trans_frontera}.\n";
        $encabezado .= "   · transportista{contenedores,precintos}, ubicacion_origen_mercancias{identificacion}, lugar_carga{codigo_un}.\n";
        $encabezado .= "   · autorizaciones[]{tipo,numero} (p.ej. tipo C523), paises_paso[] (códigos de país de tránsito).\n";
        $encabezado .= "   · medios_transporte_partida[]{tipo,documento,pais}, medios_transporte_frontera[]{aduana,tipo,documento,pais}.\n";
        $encabezado .= "   · garantias[]{tipo,garantia,importe} (importe puede ser un número o texto como \"Automatico\").\n";
        $encabezado .= "   · documentos_transporte[]{tipo,documento} (p.ej. N730, N705) y documentos_adicionales[]{tipo,documento} (p.ej. Y024, Y025).\n";
        $encabezado .= "   · partidas[]{pos_estadistica,pais_destino,peso_bruto,neto,unidad_suplementaria,factura_cod,factura_num,descripcion,bultos[]{tipo,bultos,marcas},valor_estadistico,moneda,cambio,documentos_precedentes[]{tipo,documento,partida},documentos_apoyo[]{tipo,documento,linea}} — una partida por línea de mercancía/posición estadística.\n";
        $encabezado .= "   · observaciones.\n\n";
        $encabezado .= "REGLAS CRÍTICAS DE NÚMEROS:\n";
        $encabezado .= "· En documentos aduaneros europeos el separador de miles suele ser '.' y el decimal ','. Ejemplo: '22.153,00' = 22153.00 (veintidós mil ciento cincuenta y tres), NO 22,153.\n";
        $encabezado .= "· '1.234,56' → 1234.56 · '15.355' (sin coma) suele ser 15355 unidades enteras (kg, cajas) → devuelve 15355, no 15.355.\n";
        $encabezado .= "· Si un peso o cantidad parece anormalmente pequeño para la operación descrita, revisa si estás cayendo en la trampa del separador europeo.\n";
        $encabezado .= "· Códigos EORI conservan formato original (letras + cifras, ej. ESB72145238, GB123456789000).\n";

        // Imagen directa (JPG/PNG/WEBP)
        if ($extraido['modo'] === 'imagen' && $extraido['archivo_base64']) {
            return [
                ['type' => 'text', 'text' => $encabezado],
                ['type' => 'image_url', 'image_url' => [
                    'url' => 'data:'.$extraido['archivo_mime'].';base64,'.$extraido['archivo_base64'],
                ]],
            ];
        }

        // PDF directo (Chat Completions acepta type: file con file_data en base64)
        if ($extraido['modo'] === 'pdf' && $extraido['archivo_base64']) {
            return [
                ['type' => 'text', 'text' => $encabezado],
                ['type' => 'file', 'file' => [
                    'filename'  => $documento->nombre_original,
                    'file_data' => 'data:application/pdf;base64,'.$extraido['archivo_base64'],
                ]],
            ];
        }

        // Texto plano o fallback
        $texto = ($extraido['texto'] ?? '') !== '' ? $extraido['texto'] : '[Documento sin contenido extraíble]';
        return $encabezado."---\nCONTENIDO DEL DOCUMENTO:\n---\n".$texto;
    }

    protected function schemaDocumento(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'tipo'      => ['type' => 'string', 'enum' => array_keys(\App\Models\Documento::TIPOS)],
                'confianza' => ['type' => 'number', 'minimum' => 0, 'maximum' => 100],
                'resumen'   => ['type' => 'string'],
                'datos'     => DeclaracionTransitoSchema::datos(),
            ],
            'required' => ['tipo', 'confianza', 'resumen', 'datos'],
        ];
    }
}
