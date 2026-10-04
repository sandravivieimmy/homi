<?php

namespace Controllers;

use Model\Uci;

class UciController
{
    public static function index()
    {
        $ucis = Uci::all();

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($ucis);
        exit;
    }

    public static function show($id)
    {
        return Uci::find($id);
    }

    public static function store($datos)
    {
        $uci = new Uci($datos);

        return $uci->guardar();
    }

    public static function update($id, $datos)
    {
        $uci = Uci::find($id);

        if (!$uci) {
            return [
                'error' => true,
                'mensaje' => 'Uci no encontrado'
            ];
        }

        $uci->sincronizar($datos);

        return $uci->guardar();
    }

    public static function delete($id)
    {
        $uci = Uci::find($id);

        if (!$uci) {
            return [
                'error' => true,
                'mensaje' => 'Uci no encontrado'
            ];
        }

        return $uci->eliminar();
    }
}
