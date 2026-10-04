<?php

namespace MVC;

class Http
{
    // Responde JSON con el código indicado y termina la ejecución
    public static function json($data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    // Cuerpo JSON de la petición como arreglo; 400 si no es JSON válido
    public static function body(): array
    {
        $datos = json_decode(file_get_contents('php://input'), true);
        if (!is_array($datos)) {
            throw new HttpException('El cuerpo de la petición debe ser un JSON válido', 400);
        }
        return $datos;
    }
}
