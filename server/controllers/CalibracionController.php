<?php

namespace Controllers;

use Model\Calibracion;

class CalibracionController
{
    public static function index()
    {
        return Calibracion::all();
    }

    public static function show($id)
    {
        return Calibracion::find($id);
    }

    public static function store($router)
    {
        $datos = json_decode(file_get_contents('php://input'), true);
        $calibracion = new Calibracion($datos);

        $resultado = $calibracion->guardar();

        header('Content-Type: application/json');
        echo json_encode($resultado);
        exit;
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
