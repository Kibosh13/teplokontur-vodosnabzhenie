<?php
// Development-only router for the PHP built-in server. Never deployed.
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
if (strpos($uri, '/.cms') === 0 || basename($uri) === '.htaccess' || strpos($uri, '..') !== false) { http_response_code(403); exit('Forbidden'); }
if ($uri === '/robots.txt') { require $root . '/robots.php'; return true; }
if ($uri === '/sitemap.xml') { require $root . '/sitemap.php'; return true; }
if (is_file($root . $uri)) return false;
if (is_file($root . rtrim($uri, '/') . '/index.php')) { require $root . rtrim($uri, '/') . '/index.php'; return true; }
return false;
