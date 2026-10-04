<?php

namespace Model;

class EquipoAll extends ActiveRecord
{
    protected static $tabla = 'calibraciones';

    protected static $columnasDB = [
        'id',
        'equipo_id',
        'fecha_realizada',
        'fecha_proxima',
        'certificado_calibracion'
    ];

    public $id;
    public $equipo_id;
    public $fecha_realizada;
    public $fecha_proxima;
    public $certificado_calibracion;

    public function __construct($args = [])
    {
        $this->id = $args['id'] ?? null;
        $this->equipo_id = $args['equipo_id'] ?? null;
        $this->fecha_realizada = $args['fecha_realizada'] ?? '';
        $this->fecha_proxima = $args['fecha_proxima'] ?? '';
        $this->certificado_calibracion = $args['certificado_calibracion'] ?? '';
    }
}
