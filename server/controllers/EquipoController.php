<?php

namespace Controllers;

use Model\Calibracion;
use Model\Equipo;
use Model\Mantenimiento;
use Model\Uci;
use MVC\Http;
use MVC\HttpException;
use MVC\Validar;

class EquipoController
{
    public static function index()
    {
        Http::json(Equipo::all());
    }

    // Equipo + último mantenimiento + última calibración (un registro por equipo, aunque no tenga fechas)
    public static function equiposAll()
    {
        $equipos = Equipo::ejecutarSQL('SELECT
                e.id,
                e.uci_id,
                u.nombre as uci,
                e.ubicacion,
                e.equipo,
                e.marca,
                e.modelo,
                e.serie,
                e.placa,
                e.registro_invima,
                e.clasificacion_invima,
                e.fuera_servicio,
                m.frecuencia,
                m.fecha_realizado as mttoRealizado,
                m.fecha_proxima as mttoProximo,
                c.fecha_realizada as calibracion,
                c.fecha_proxima as proximaCalibracion,
                c.certificado_calibracion
                FROM equipos as e
            INNER JOIN ucis as u ON u.id = e.uci_id
            LEFT JOIN mantenimientos as m
                ON m.id = (SELECT MAX(m2.id) FROM mantenimientos as m2 WHERE m2.equipo_id = e.id)
            LEFT JOIN calibraciones as c
                ON c.id = (SELECT MAX(c2.id) FROM calibraciones as c2 WHERE c2.equipo_id = e.id)
            ORDER BY e.id');
        Http::json($equipos);
    }

    public static function show($id)
    {
        return Equipo::find($id);
    }

    // Acepta el formato plano (solo equipo) o anidado: { equipo:{...}, mantenimiento:{...}, calibracion:{...} }
    private static function separar(array $body): array
    {
        if (isset($body['equipo']) && is_array($body['equipo'])) {
            return [
                $body['equipo'],
                is_array($body['mantenimiento'] ?? null) ? $body['mantenimiento'] : null,
                is_array($body['calibracion'] ?? null) ? $body['calibracion'] : null,
            ];
        }
        return [$body, null, null];
    }

    private static function validarEquipo(array $d): array
    {
        $uciId = Validar::entero($d['uci_id'] ?? null, 'uci_id');
        if (!Uci::find($uciId)) {
            throw new HttpException('La UCI indicada no existe', 422);
        }
        return [
            'uci_id' => $uciId,
            'ubicacion' => Validar::texto($d['ubicacion'] ?? '', 'ubicacion', 100),
            'equipo' => Validar::texto($d['equipo'] ?? '', 'equipo', 100, true),
            'marca' => Validar::texto($d['marca'] ?? '', 'marca', 100),
            'modelo' => Validar::texto($d['modelo'] ?? '', 'modelo', 100),
            'serie' => Validar::texto($d['serie'] ?? '', 'serie', 150),
            'placa' => Validar::texto($d['placa'] ?? '', 'placa', 100),
            'registro_invima' => Validar::texto($d['registro_invima'] ?? '', 'registro_invima', 150),
            'clasificacion_invima' => Validar::texto($d['clasificacion_invima'] ?? '', 'clasificacion_invima', 20),
            'fuera_servicio' => !empty($d['fuera_servicio']) ? 1 : 0,
        ];
    }

    private static function validarMantenimiento(?array $d): ?array
    {
        if ($d === null) {
            return null;
        }
        return [
            'frecuencia' => Validar::texto($d['frecuencia'] ?? '', 'frecuencia', 50),
            'fecha_realizado' => Validar::fecha($d['fecha_realizado'] ?? null, 'fecha_realizado'),
            'fecha_proxima' => Validar::fecha($d['fecha_proxima'] ?? null, 'fecha_proxima'),
        ];
    }

    private static function validarCalibracion(?array $d): ?array
    {
        if ($d === null) {
            return null;
        }
        return [
            'fecha_realizada' => Validar::fecha($d['fecha_realizada'] ?? null, 'fecha_realizada'),
            'fecha_proxima' => Validar::fecha($d['fecha_proxima'] ?? null, 'fecha_proxima'),
            'certificado_calibracion' => Validar::texto($d['certificado_calibracion'] ?? '', 'certificado_calibracion', 30),
        ];
    }

    private static function tieneDatos(?array $d): bool
    {
        return $d !== null && count(array_filter($d, fn($v) => $v !== null && $v !== '')) > 0;
    }

    // Guarda mantenimiento y calibración del equipo: actualiza el último registro o crea uno si no hay
    private static function guardarFechas(int $equipoId, ?array $mtto, ?array $cal): void
    {
        if (self::tieneDatos($mtto)) {
            $actual = Mantenimiento::SQL("SELECT * FROM mantenimientos WHERE equipo_id = {$equipoId} ORDER BY id DESC LIMIT 1")[0]
                ?? new Mantenimiento(['equipo_id' => $equipoId]);
            $actual->equipo_id = $equipoId;
            foreach ($mtto as $campo => $valor) {
                $actual->$campo = $valor;
            }
            $actual->guardar();
        }
        if (self::tieneDatos($cal)) {
            $actual = Calibracion::SQL("SELECT * FROM calibraciones WHERE equipo_id = {$equipoId} ORDER BY id DESC LIMIT 1")[0]
                ?? new Calibracion(['equipo_id' => $equipoId]);
            $actual->equipo_id = $equipoId;
            foreach ($cal as $campo => $valor) {
                $actual->$campo = $valor;
            }
            $actual->guardar();
        }
    }

    public static function store($router)
    {
        [$eq, $mtto, $cal] = self::separar(Http::body());
        $equipo = new Equipo(self::validarEquipo($eq));
        $mtto = self::validarMantenimiento($mtto);
        $cal = self::validarCalibracion($cal);

        Equipo::iniciarTransaccion();
        try {
            $resultado = $equipo->guardar();
            self::guardarFechas((int) $resultado['id'], $mtto, $cal);
            Equipo::confirmarTransaccion();
        } catch (\Throwable $e) {
            Equipo::revertirTransaccion();
            throw $e;
        }

        Http::json($resultado);
    }

    public static function update($router)
    {
        [$eq, $mtto, $cal] = self::separar(Http::body());
        $id = Validar::entero($eq['id'] ?? null, 'id');

        $equipo = Equipo::find($id);
        if (!$equipo) {
            throw new HttpException('Equipo no encontrado', 404);
        }

        $datos = self::validarEquipo($eq);
        $mtto = self::validarMantenimiento($mtto);
        $cal = self::validarCalibracion($cal);

        Equipo::iniciarTransaccion();
        try {
            foreach ($datos as $campo => $valor) {
                $equipo->$campo = $valor;
            }
            $equipo->guardar();
            self::guardarFechas($id, $mtto, $cal);
            Equipo::confirmarTransaccion();
        } catch (\Throwable $e) {
            Equipo::revertirTransaccion();
            throw $e;
        }

        Http::json(['resultado' => true, 'id' => $id]);
    }

    // Elimina el equipo; sus mantenimientos y calibraciones se borran en cascada (llaves foráneas)
    public static function delete($router)
    {
        $id = Validar::entero(Http::body()['id'] ?? null, 'id');

        $equipo = Equipo::find($id);
        if (!$equipo) {
            throw new HttpException('Equipo no encontrado', 404);
        }

        Http::json(['resultado' => (bool) $equipo->eliminar(), 'id' => $id]);
    }
}
