<?php

namespace MVC;

// Validaciones de entrada comunes a los controladores (error 422 si el dato no es válido)
class Validar
{
    public static function texto($valor, string $campo, int $max, bool $obligatorio = false): string
    {
        if (is_array($valor) || is_object($valor)) {
            throw new HttpException("El campo {$campo} no es válido", 422);
        }
        $valor = trim((string) ($valor ?? ''));
        if ($obligatorio && $valor === '') {
            throw new HttpException("El campo {$campo} es obligatorio", 422);
        }
        if (mb_strlen($valor) > $max) {
            throw new HttpException("El campo {$campo} no puede superar {$max} caracteres", 422);
        }
        return $valor;
    }

    // Fecha Y-m-d real o null cuando viene vacía
    public static function fecha($valor, string $campo): ?string
    {
        if ($valor === null || $valor === '') {
            return null;
        }
        $f = is_string($valor) ? \DateTime::createFromFormat('!Y-m-d', $valor) : false;
        if (!$f || $f->format('Y-m-d') !== $valor) {
            throw new HttpException("El campo {$campo} debe ser una fecha válida (AAAA-MM-DD)", 422);
        }
        return $valor;
    }

    public static function entero($valor, string $campo): int
    {
        if (!is_numeric($valor) || (int) $valor != $valor || (int) $valor < 1) {
            throw new HttpException("El campo {$campo} no es válido", 422);
        }
        return (int) $valor;
    }
}
