<?php

namespace Controllers;

use Model\Mantenimiento;

class MantenimientoController
{
    public static function index()
    {
        return Mantenimiento::all();
    }

    public static function show($id)
    {
        return Mantenimiento::find($id);
    }

    public static function store($router)
    {
        $datos = json_decode(file_get_contents('php://input'), true);
        $mantenimiento = new Mantenimiento($datos);

        $resultado = $mantenimiento->guardar();

        header('Content-Type: application/json');
        echo json_encode($resultado);
        exit;
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
