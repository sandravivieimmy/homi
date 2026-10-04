FROM php:8.2-cli

# Extensión mysqli (usada por includes/database.php) + utilidades para composer
RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install mysqli

# database.php lee $_ENV: garantizamos que PHP exponga las variables de entorno de Render ahí
RUN printf "variables_order=EGPCS\ndisplay_errors=Off\nlog_errors=On\nerror_log=/dev/stderr\n" > "$PHP_INI_DIR/conf.d/zz-env.ini"

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Dependencias primero (aprovecha la caché de capas)
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction

# Código de la aplicación (vendor y .env se excluyen vía .dockerignore)
COPY . .
RUN composer dump-autoload --no-dev --no-interaction

# Render inyecta PORT; las credenciales DB_* se definen como variables de entorno en Render
ENV PORT=10000
EXPOSE 10000

# Servidor embebido de PHP: las rutas que no son archivos caen en public/index.php (Router)
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} -t public"]
