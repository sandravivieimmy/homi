<?php


header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Manejar preflight del navegador
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../includes/app.php';

use Controllers\UciController;
use Controllers\EquipoController;
use Controllers\MantenimientoController;
use Controllers\CalibracionController;

use MVC\Router;

$router = new Router();



$router->get('/ucis', [UciController::class, 'index']);

$router->get('/equipos', [EquipoController::class, 'index']);
$router->post('/equipos/crear', [EquipoController::class, 'store']);
$router->get('/equipos/all', [EquipoController::class, 'equiposAll']);
$router->post('/equipos/eliminar', [EquipoController::class, 'delete']);


$router->get('/mantenimientos', [MantenimientoController::class, 'index']);
$router->post('/mantenimientos/crear', [MantenimientoController::class, 'store']);


$router->get('/calibraciones', [CalibracionController::class, 'index']);
$router->post('/calibraciones/crear', [CalibracionController::class, 'store']);



// Comprueba y valida las rutas, que existan y les asigna las funciones del Controlador
$router->comprobarRutas();
