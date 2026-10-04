<?php

namespace Controllers;

use Model\Equipo;

class EquipoController
{
    public static function index()
    {
        $equipos = Equipo::all();

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($equipos);
        exit;
    }

    // Equipo Mantenimiento Calibracion
    public static function equiposAll()
    {
        $equipos = Equipo::ejecutarSQL('SELECT 
                e.id, 
                u.nombre as uci,
                e.ubicacion,
                e.equipo, 
                e.marca, 
                e.modelo, 
                e.serie, 
                e.placa, 
                e.registro_invima, 
                e.clasificacion_invima,
                m.fecha_realizado as mttoRealizado,
                m.fecha_proxima as mttoProximo,
                c.fecha_realizada as calibracion,
                c.fecha_proxima as proximaCalibracion
                FROM equipos as e
            INNER JOIN ucis as u ON u.id = e.uci_id
            INNER JOIN mantenimientos as m ON m.equipo_id = e.id
              INNER JOIN calibraciones as c ON c.equipo_id = e.id');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($equipos);
        exit;
    }

    public static function show($id)
    {
        return Equipo::find($id);
    }

    public static function store($router)
    {
        $datos = json_decode(file_get_contents('php://input'), true);
        $equipo = new Equipo($datos);

        $resultado = $equipo->guardar();

        header('Content-Type: application/json');
        echo json_encode($resultado);
        exit;
    }

    public static function update($id, $datos)
    {
        $equipo = Equipo::find($id);

        if (!$equipo) {
            return [
                'error' => true,
                'mensaje' => 'Equipo no encontrado'
            ];
        }

        $equipo->sincronizar($datos);

        return $equipo->guardar();
    }

    public static function delete($id)
    {
        $equipo = Equipo::find($id);

        if (!$equipo) {
            return [
                'error' => true,
                'mensaje' => 'Equipo no encontrado'
            ];
        }

        return $equipo->eliminar();
    }
}
