<?php

namespace App\Http\Controllers;

use App\Models\Expediente;
use App\Models\HistorialEvento;
use App\Services\Schema\DeclaracionTransitoSchema;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ExpedienteController extends Controller
{
    public function index(Request $request)
    {
        $expedientes = Expediente::query()
            ->with(['documentos:id,expediente_id,tipo_detectado', 'declaracion:id,expediente_id,confianza_global,advertencias'])
            ->latest()
            ->limit(50)
            ->get()
            ->map(function (Expediente $e) {
                return [
                    'id'              => $e->id,
                    'referencia'      => $e->referencia,
                    'estado'          => $e->estado,
                    'cliente'         => $e->cliente,
                    'mrn'             => $e->mrn,
                    'aduana_partida'  => $e->aduana_partida,
                    'aduana_destino'  => $e->aduana_destino,
                    'documentos_count'=> $e->documentos->count(),
                    'confianza'       => optional($e->declaracion)->confianza_global,
                    'advertencias'    => count(optional($e->declaracion)->advertencias ?? []),
                    'creado'          => $e->created_at?->diffForHumans(),
                ];
            });

        $resumen = [
            'total'      => Expediente::count(),
            'borrador'   => Expediente::where('estado', 'borrador')->count(),
            'analizando' => Expediente::where('estado', 'analizando')->count(),
            'revision'   => Expediente::where('estado', 'revision')->count(),
            'validado'   => Expediente::where('estado', 'validado')->count(),
        ];

        return Inertia::render('transito/index', [
            'expedientes' => $expedientes,
            'resumen'     => $resumen,
        ]);
    }

    public function create()
    {
        return Inertia::render('transito/nuevo', [
            'siguiente_referencia' => $this->siguienteReferencia(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'cliente'         => 'nullable|string|max:255',
            'aduana_partida'  => 'nullable|string|max:120',
            'aduana_destino'  => 'nullable|string|max:120',
        ]);

        $expediente = Expediente::create([
            'referencia'     => $this->siguienteReferencia(),
            'modulo'         => 'transito',
            'estado'         => 'borrador',
            'cliente'        => $data['cliente'] ?? null,
            'aduana_partida' => $data['aduana_partida'] ?? null,
            'aduana_destino' => $data['aduana_destino'] ?? null,
            'creado_por'     => $request->user()?->id,
        ]);

        HistorialEvento::create([
            'expediente_id' => $expediente->id,
            'user_id'       => $request->user()?->id,
            'accion'        => 'expediente.creado',
            'detalle'       => "Expediente {$expediente->referencia} creado.",
        ]);

        return redirect()->route('transito.show', $expediente);
    }

    public function show(Expediente $expediente)
    {
        $expediente->load(['documentos', 'declaracion', 'historial.user:id,name']);

        return Inertia::render('transito/expediente', [
            'expediente' => [
                'id'              => $expediente->id,
                'referencia'      => $expediente->referencia,
                'estado'          => $expediente->estado,
                'cliente'         => $expediente->cliente,
                'mrn'             => $expediente->mrn,
                'aduana_partida'  => $expediente->aduana_partida,
                'aduana_destino' => $expediente->aduana_destino,
                'validado_en'     => optional($expediente->validado_en)->format('d/m/Y H:i'),
                'creado'          => optional($expediente->created_at)->format('d/m/Y H:i'),
            ],
            'documentos' => $expediente->documentos->map(function ($d) use ($expediente) {
                return [
                    'id'              => $d->id,
                    'nombre_original' => $d->nombre_original,
                    // Servimos por PHP con auth: evita 403 de Nginx y protege documentos sensibles.
                    'url'             => route('transito.documentos.ver', ['expediente' => $expediente->id, 'documento' => $d->id]),
                    'mime'            => $d->mime,
                    'tamano'          => $d->tamano,
                    'tipo_detectado'  => $d->tipo_detectado,
                    'tipo_label'      => \App\Models\Documento::TIPOS[$d->tipo_detectado] ?? '—',
                    'confianza'       => $d->confianza,
                    'estado'          => $d->estado,
                    'nota_ia'         => $d->nota_ia,
                    'datos_extraidos' => $d->datos_extraidos,
                ];
            }),
            'declaracion' => $expediente->declaracion ? [
                'id'               => $expediente->declaracion->id,
                'estado'           => $expediente->declaracion->estado,
                'datos'            => $expediente->declaracion->datos,
                'advertencias'     => $expediente->declaracion->advertencias ?? [],
                'confianza_global' => $expediente->declaracion->confianza_global,
                'generado_en'      => optional($expediente->declaracion->generado_en)->format('d/m/Y H:i'),
            ] : null,
            'historial' => $expediente->historial->map(function ($h) {
                return [
                    'id'      => $h->id,
                    'accion'  => $h->accion,
                    'detalle' => $h->detalle,
                    'usuario' => optional($h->user)->name ?? 'Sistema',
                    'cuando'  => $h->created_at?->format('d/m/Y H:i'),
                ];
            }),
            // Glosario "ruta de campo → nombre a mostrar": para que las advertencias
            // de la IA (y cualquier otro uso futuro) nunca expongan claves técnicas.
            'etiquetas_campos' => DeclaracionTransitoSchema::etiquetas(),
        ]);
    }

    public function validar(Request $request, Expediente $expediente)
    {
        if (! $expediente->declaracion) {
            return back()->withErrors(['declaracion' => 'No hay declaración generada aún.']);
        }

        DB::transaction(function () use ($request, $expediente) {
            $expediente->declaracion->update(['estado' => 'validada']);
            $expediente->update([
                'estado'        => 'validado',
                'validado_por'  => $request->user()?->id,
                'validado_en'   => now(),
            ]);
            HistorialEvento::create([
                'expediente_id' => $expediente->id,
                'user_id'       => $request->user()?->id,
                'accion'        => 'declaracion.validada',
                'detalle'       => 'Declaración de tránsito validada y lista para S-4.',
            ]);
        });

        return back();
    }

    public function actualizarDeclaracion(Request $request, Expediente $expediente)
    {
        if (! $expediente->declaracion) {
            return back()->withErrors(['declaracion' => 'No hay declaración generada.']);
        }
        $data = $request->validate([
            'datos' => 'required|array',
        ]);

        $expediente->declaracion->update(['datos' => $data['datos']]);

        HistorialEvento::create([
            'expediente_id' => $expediente->id,
            'user_id'       => $request->user()?->id,
            'accion'        => 'declaracion.editada',
            'detalle'       => 'Operador ajustó campos de la declaración.',
        ]);

        return back();
    }

    protected function siguienteReferencia(): string
    {
        $anio = date('Y');
        $sec  = str_pad((string) (Expediente::whereYear('created_at', $anio)->count() + 1), 4, '0', STR_PAD_LEFT);
        return "WX-{$anio}-{$sec}-".Str::upper(Str::random(3));
    }
}
