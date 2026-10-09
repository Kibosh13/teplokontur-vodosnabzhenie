<?php
declare(strict_types=1);
require dirname(__DIR__) . '/.cms/bootstrap.php';
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('X-Frame-Options: SAMEORIGIN');
cms_require_auth();
$page = (string)($_GET['page'] ?? 'home');
if (!isset(cms_schema()['pages'][$page])) { http_response_code(404); exit('Страница не найдена.'); }
header('Content-Type: text/html; charset=utf-8');
echo cms_render($page, cms_state()['draft'], true);
