<?php

namespace Controllers;

use Model\Calibracion;
use Model\Equipo;
use MVC\Http;
use MVC\HttpException;
use MVC\Validar;

class CalibracionController
{
    public static function index()
    {
        Http::json(Calibracion::all());
    }

    public static function show($id)
    {
        return Calibracion::find($id);
    }

    public static function store($router)
    {
        $d = Http::body();

        $equipoId = Validar::entero($d['equipo_id'] ?? null, 'equipo_id');
        if (!Equipo::find($equipoId)) {
            throw new HttpException('El equipo indicado no existe', 422);
        }

        $calibracion = new Calibracion([
            'equipo_id' => $equipoId,
            'fecha_realizada' => Validar::fecha($d['fecha_realizada'] ?? null, 'fecha_realizada'),
            'fecha_proxima' => Validar::fecha($d['fecha_proxima'] ?? null, 'fecha_proxima'),
            'certificado_calibracion' => Validar::texto($d['certificado_calibracion'] ?? '', 'certificado_calibracion', 30),
        ]);

        Http::json($calibracion->guardar());
    }

    public static function update($id, $datos)
    {
        $calibracion = Calibracion::find($id);

        if (!$calibracion) {
            return [
                'error' => true,
                'mensaje' => 'calibracion no encontrado'
            ];
        }

        $calibracion->sincronizar($datos);

        return $calibracion->guardar();
    }

    public static function delete($id)
    {
        $calibracion = Calibracion::find($id);

        if (!$calibracion) {
            return [
                'error' => true,
                'mensaje' => 'calibracion no encontrado'
            ];
        }

        return $calibracion->eliminar();
    }
}
