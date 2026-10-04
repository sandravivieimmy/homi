<?php

namespace MVC;

// Error controlado de la API: se traduce en una respuesta JSON con el código HTTP indicado
class HttpException extends \Exception
{
    public int $status;

    public function __construct(string $mensaje, int $status = 400)
    {
        parent::__construct($mensaje);
        $this->status = $status;
    }
}
