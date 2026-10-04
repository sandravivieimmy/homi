<?php

namespace Model;

class Equipo extends ActiveRecord
{
    protected static $tabla = 'equipos';

    protected static $columnasDB = [
        'id',
        'uci_id',
        'ubicacion',
        'equipo',
        'marca',
        'modelo',
        'serie',
        'placa',
        'registro_invima',
        'clasificacion_invima',
        'fuera_servicio'
    ];

    public $id;
    public $uci_id;
    public $ubicacion;
    public $equipo;
    public $marca;
    public $modelo;
    public $serie;
    public $placa;
    public $registro_invima;
    public $clasificacion_invima;
    public $fuera_servicio;

    public function __construct($args = [])
    {
        $this->id = $args['id'] ?? null;
        $this->uci_id = $args['uci_id'] ?? null;
        $this->ubicacion = $args['ubicacion'] ?? '';
        $this->equipo = $args['equipo'] ?? '';
        $this->marca = $args['marca'] ?? '';
        $this->modelo = $args['modelo'] ?? '';
        $this->serie = $args['serie'] ?? '';
        $this->placa = $args['placa'] ?? '';
        $this->registro_invima = $args['registro_invima'] ?? '';
        $this->clasificacion_invima = $args['clasificacion_invima'] ?? '';
        $this->fuera_servicio = !empty($args['fuera_servicio']) ? 1 : 0;
    }
}
