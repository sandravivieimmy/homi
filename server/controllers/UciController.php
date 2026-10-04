<?php

namespace Controllers;

use Model\Uci;
use MVC\Http;

class UciController
{
    public static function index()
    {
        Http::json(Uci::all());
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
