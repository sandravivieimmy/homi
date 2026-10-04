<?php

// En PHP >= 8.1 mysqli lanza mysqli_sql_exception si falla la conexión (la captura public/index.php)
$db = mysqli_connect(
    $_ENV['DB_HOST'],
    $_ENV['DB_USER'],
    $_ENV['DB_PASS'],
    $_ENV['DB_NAME']
);

if (!$db) {
    error_log('[HOMI] No se pudo conectar a MySQL: ' . mysqli_connect_errno() . ' ' . mysqli_connect_error());
    throw new RuntimeException('No se pudo conectar a la base de datos');
}

mysqli_set_charset($db, 'utf8mb4');

// Modo estricto: rechaza datos truncados o fechas inválidas en vez de guardarlos mal en silencio
mysqli_query($db, "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
