<?php

namespace Controllers;

use Model\Equipo;
use Model\Mantenimiento;
use MVC\Http;
use MVC\HttpException;
use MVC\Validar;

class MantenimientoController
{
    public static function index()
    {
        Http::json(Mantenimiento::all());
    }

    public static function show($id)
    {
        return Mantenimiento::find($id);
    }

    public static function store($router)
    {
        $d = Http::body();

        $equipoId = Validar::entero($d['equipo_id'] ?? null, 'equipo_id');
        if (!Equipo::find($equipoId)) {
            throw new HttpException('El equipo indicado no existe', 422);
        }

        $mantenimiento = new Mantenimiento([
            'equipo_id' => $equipoId,
            'frecuencia' => Validar::texto($d['frecuencia'] ?? '', 'frecuencia', 50),
            'fecha_realizado' => Validar::fecha($d['fecha_realizado'] ?? null, 'fecha_realizado'),
            'fecha_proxima' => Validar::fecha($d['fecha_proxima'] ?? null, 'fecha_proxima'),
        ]);

        Http::json($mantenimiento->guardar());
    }

    public static function update($id, $datos)
    {
        $mantenimiento = Mantenimiento::find($id);

        if (!$mantenimiento) {
            return [
                'error' => true,
                'mensaje' => 'Mantenimiento no encontrado'
            ];
        }

        $mantenimiento->sincronizar($datos);

        return $mantenimiento->guardar();
    }

    public static function delete($id)
    {
        $mantenimiento = Mantenimiento::find($id);

        if (!$mantenimiento) {
            return [
                'error' => true,
                'mensaje' => 'Mantenimiento no encontrado'
            ];
        }

        return $mantenimiento->eliminar();
    }
}
