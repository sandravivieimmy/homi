<?php

namespace Model;

class Mantenimiento extends ActiveRecord
{
    protected static $tabla = 'mantenimientos';

    protected static $columnasDB = [
        'id',
        'equipo_id',
        'frecuencia',
        'fecha_realizado',
        'fecha_proxima',
    ];

    public $id;
    public $equipo_id;
    public $fecha_realizado;
    public $fecha_proxima;
    public $frecuencia;
    public $observaciones;
    public $created_at;
    public $updated_at;

    public function __construct($args = [])
    {
        $this->id = $args['id'] ?? null;
        $this->equipo_id = $args['equipo_id'] ?? null;
        $this->frecuencia = $args['frecuencia'] ?? '';
        $this->fecha_realizado = $args['fecha_realizado'] ?? '';
        $this->fecha_proxima = $args['fecha_proxima'] ?? '';
    }
}
