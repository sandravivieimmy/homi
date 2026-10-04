<?php

use Model\ActiveRecord;

require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::CreateImmutable(__DIR__);
$dotenv->safeLoad();

require 'database.php';

// Conectarnos a la base de datos
ActiveRecord::setDB($db);
