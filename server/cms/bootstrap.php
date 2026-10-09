<?php
declare(strict_types=1);
ini_set('display_errors', '0');
const CMS_ROOT = __DIR__;
const CMS_PRIVATE = __DIR__ . '/private';
const CMS_WEBROOT = __DIR__ . '/../';
function cms_json_read(string $file, array $fallback = []): array {
    if (!is_file($file)) return $fallback;
    $data = json_decode((string)file_get_contents($file), true);
    if (!is_array($data)) throw new RuntimeException('Не удалось прочитать данные сайта.');
    return $data;
}
function cms_schema(): array { static $schema; return $schema ?? ($schema = cms_json_read(CMS_ROOT . '/schema.json')); }
function cms_defaults(): array { static $data; return $data ?? ($data = cms_json_read(CMS_ROOT . '/defaults.json')); }
function cms_state(): array {
    $defaults = cms_defaults();
    $data = cms_json_read(CMS_PRIVATE . '/state.json', ['revision' => 0, 'draft' => $defaults, 'published' => $defaults, 'publishedAt' => null, 'updatedAt' => null]);
    $data['draft'] = array_replace($defaults, $data['draft']);
    $data['published'] = array_replace($defaults, $data['published']);
    return $data;
}
function cms_atomic(string $file, array $data): void {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $tmp = tempnam(dirname($file), '.write-');
    if ($tmp === false) throw new RuntimeException('Не удалось создать временный файл.');
    chmod($tmp, 0600);
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $file)) { @unlink($tmp); throw new RuntimeException('Не удалось сохранить изменения.'); }
}
function cms_locked(callable $fn) {
    if (!is_dir(CMS_PRIVATE) && !mkdir(CMS_PRIVATE, 0700, true)) throw new RuntimeException('Хранилище недоступно.');
    $lock = fopen(CMS_PRIVATE . '/state.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Не удалось заблокировать хранилище.');
    try { return $fn(); } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function cms_config(): array { return cms_json_read(CMS_PRIVATE . '/account.json'); }
function cms_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    if (is_dir(CMS_PRIVATE . '/sessions')) session_save_path(CMS_PRIVATE . '/sessions');
    session_name('gvs_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function cms_auth(): bool {
    cms_session();
    if (empty($_SESSION['user']) || time() - (int)($_SESSION['activity'] ?? 0) > 7200) return false;
    $config = cms_config();
    if (!hash_equals((string)($config['generation'] ?? ''), (string)($_SESSION['generation'] ?? ''))) return false;
    $_SESSION['activity'] = time();
    return true;
}
function cms_reply(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function cms_require_auth(bool $allowChange = false): void {
    if (!cms_auth()) cms_reply(['error' => 'Войдите в админ-панель.'], 401);
    if (!$allowChange && !empty(cms_config()['mustChange'])) cms_reply(['error' => 'Сначала установите собственный пароль.'], 403);
}
function cms_csrf(): void {
    cms_session();
    if (!hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) cms_reply(['error' => 'Защитный токен устарел. Обновите страницу.'], 403);
}
function cms_validate(array $changes): array {
    $schema = cms_schema()['fields'];
    foreach ($changes as $key => $value) {
        if (!isset($schema[$key]) || !is_string($value)) throw new InvalidArgumentException('Неизвестное поле или неверный формат.');
        if (mb_strlen($value) > 10000) throw new InvalidArgumentException('Текст слишком длинный (максимум 10 000 символов).');
        $type = $schema[$key]['type'];
        if ($type === 'email' && !filter_var($value, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Проверьте адрес электронной почты.');
        if ($type === 'phone' && !preg_match('/^\+?[\d\s()\-]{7,30}$/', $value)) throw new InvalidArgumentException('Проверьте номер телефона.');
        if ($type === 'toggle' && !in_array($value, ['0', '1'], true)) throw new InvalidArgumentException('Неверное значение переключателя.');
        if ($type === 'url' && (!filter_var($value, FILTER_VALIDATE_URL) || !preg_match('~^https://[^\s]+$~', $value))) throw new InvalidArgumentException('Канонический адрес должен начинаться с https://.');
        if ($type === 'image' && !cms_valid_image($value)) throw new InvalidArgumentException('Выберите фотографию из медиатеки.');
    }
    return $changes;
}
function cms_valid_image(string $url): bool {
    if (!preg_match('~^/assets/(img|uploads)/[a-zA-Z0-9_.-]+\.(webp|png|jpe?g|svg)$~D', $url)) return false;
    if (strpos($url, '..') !== false) return false;
    // SVG is allowed only for the two trusted bundled logos, never for uploads.
    if (substr($url, -4) === '.svg' && !in_array($url, ['/assets/img/gvs-group-logo.svg', '/assets/img/gvs-group-logo-inverse.svg'], true)) return false;
    return is_file(CMS_WEBROOT . ltrim($url, '/'));
}
function cms_e(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function cms_render(string $page, ?array $values = null, bool $preview = false): string {
    $schema = cms_schema();
    if (!isset($schema['pages'][$page])) throw new InvalidArgumentException('Страница не найдена.');
    $values = $values ?? cms_state()['published'];
    $values['computed.tel'] = 'tel:' . preg_replace('/[^\d+]/', '', $values['global.phone']);
    $template = file_get_contents(CMS_ROOT . '/templates/' . $page . '.html');
    $html = preg_replace_callback('/\{\{gvs:([a-zA-Z0-9_.]+)\}\}/', function ($m) use ($values) { return cms_e((string)($values[$m[1]] ?? '')); }, $template);
    $title = $values[$page . '.seo.title']; $description = $values[$page . '.seo.description'];
    $canonical = $values[$page . '.seo.canonical']; $image = 'https://gvs-group.ru' . $values[$page . '.seo.image'];
    $index = !$preview && $values[$page . '.seo.index'] === '1';
    $meta = '<meta name="robots" content="' . ($index ? 'index, follow' : 'noindex, nofollow') . '"><link rel="canonical" href="' . cms_e($canonical) . '"><meta property="og:type" content="website"><meta property="og:title" content="' . cms_e($title) . '"><meta property="og:description" content="' . cms_e($description) . '"><meta property="og:url" content="' . cms_e($canonical) . '"><meta property="og:image" content="' . cms_e($image) . '"><meta name="twitter:card" content="summary_large_image">';
    if ($preview) $meta .= '<style>body:before{content:"ПРЕДПРОСМОТР ЧЕРНОВИКА";position:fixed;right:12px;bottom:12px;z-index:9999;background:#173449;color:white;padding:9px 14px;border-radius:20px;font:11px sans-serif;pointer-events:none}</style>';
    return str_replace('</head>', $meta . '</head>', $html);
}
function cms_public(string $page): void {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    $values = cms_state()['published'];
    if ($values[$page . '.seo.index'] !== '1') header('X-Robots-Tag: noindex, nofollow');
    echo cms_render($page, $values);
}
function cms_version(array $state, string $action): void {
    if (!is_dir(CMS_PRIVATE . '/versions')) mkdir(CMS_PRIVATE . '/versions', 0700, true);
    $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3));
    cms_atomic(CMS_PRIVATE . '/versions/' . $id . '.json', ['id' => $id, 'at' => gmdate('c'), 'action' => $action, 'author' => $_SESSION['user'] ?? 'admin', 'values' => $state['published']]);
}
function cms_history(): array {
    $files = glob(CMS_PRIVATE . '/versions/*.json') ?: [];
    rsort($files);
    $result = [];
    foreach (array_slice($files, 0, 50) as $file) { $v = cms_json_read($file); unset($v['values']); $result[] = $v; }
    return $result;
}
function cms_media(): array {
    $result = [];
    foreach (['img', 'uploads'] as $folder) {
        foreach (glob(CMS_WEBROOT . 'assets/' . $folder . '/*') ?: [] as $file) {
            if (!is_file($file)) continue;
            $url = '/assets/' . $folder . '/' . basename($file);
            if (!cms_valid_image($url)) continue;
            $size = @getimagesize($file);
            $result[] = ['url' => $url, 'name' => basename($file), 'bytes' => filesize($file), 'width' => $size[0] ?? 0, 'height' => $size[1] ?? 0, 'uploaded' => $folder === 'uploads'];
        }
    }
    return $result;
}
