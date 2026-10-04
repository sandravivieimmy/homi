<?php

// Nunca mostrar errores internos al cliente (rutas, SQL, credenciales); van al log del servidor
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Manejar preflight del navegador
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../vendor/autoload.php';

use Controllers\UciController;
use Controllers\EquipoController;
use Controllers\MantenimientoController;
use Controllers\CalibracionController;

use MVC\Http;
use MVC\HttpException;
use MVC\Router;

try {
    require_once __DIR__ . '/../includes/app.php';

    $router = new Router();

    $router->get('/ucis', [UciController::class, 'index']);

    $router->get('/equipos', [EquipoController::class, 'index']);
    $router->post('/equipos/crear', [EquipoController::class, 'store']);
    $router->get('/equipos/all', [EquipoController::class, 'equiposAll']);
    $router->post('/equipos/actualizar', [EquipoController::class, 'update']);
    $router->post('/equipos/eliminar', [EquipoController::class, 'delete']);

    $router->get('/mantenimientos', [MantenimientoController::class, 'index']);
    $router->post('/mantenimientos/crear', [MantenimientoController::class, 'store']);

    $router->get('/calibraciones', [CalibracionController::class, 'index']);
    $router->post('/calibraciones/crear', [CalibracionController::class, 'store']);

    // Comprueba y valida las rutas, que existan y les asigna las funciones del Controlador
    $router->comprobarRutas();
} catch (HttpException $e) {
    Http::json(['error' => $e->getMessage()], $e->status);
} catch (\mysqli_sql_exception $e) {
    error_log('[HOMI] SQL ' . $e->getCode() . ': ' . $e->getMessage());
    // 1452: llave foránea inexistente · 1406/1265/1292/1366: dato inválido para la columna
    if (in_array($e->getCode(), [1452, 1406, 1265, 1292, 1366, 1048], true)) {
        Http::json(['error' => 'Los datos enviados no son válidos o hacen referencia a un registro que no existe'], 422);
    }
    Http::json(['error' => 'Error interno del servidor'], 500);
} catch (\Throwable $e) {
    error_log('[HOMI] ' . get_class($e) . ': ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    Http::json(['error' => 'Error interno del servidor'], 500);
}
