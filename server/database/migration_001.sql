-- Migración 001 (aplicar una sola vez sobre la base existente)
-- Compatible hacia atrás: no elimina ni renombra nada.

-- 1) Marca "fuera de servicio" por equipo (antes se simulaba con texto en las fechas)
ALTER TABLE equipos ADD COLUMN fuera_servicio TINYINT(1) NOT NULL DEFAULT 0;

-- 2) Las fechas son opcionales (equipo sin mantenimiento/calibración programado)
ALTER TABLE mantenimientos MODIFY fecha_realizado DATE NULL, MODIFY fecha_proxima DATE NULL;
ALTER TABLE calibraciones  MODIFY fecha_realizada DATE NULL, MODIFY fecha_proxima DATE NULL;

-- 3) Codificación completa (la conexión ya usa utf8mb4; las tablas eran latin1)
ALTER TABLE equipos        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE mantenimientos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
ALTER TABLE calibraciones  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
