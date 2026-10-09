<?php
declare(strict_types=1);
require dirname(__DIR__) . '/.cms/bootstrap.php';
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('X-Content-Type-Options: nosniff');
cms_session();
$action = (string)($_GET['action'] ?? 'session');
$method = $_SERVER['REQUEST_METHOD'];
try {
    if ($method === 'GET' && $action === 'session') {
        $authenticated = cms_auth();
        cms_reply(['authenticated' => $authenticated, 'csrf' => $_SESSION['csrf'], 'user' => $authenticated ? $_SESSION['user'] : null, 'mustChange' => $authenticated && !empty(cms_config()['mustChange'])]);
    }
    if ($method === 'GET') {
        cms_require_auth();
        if ($action === 'bootstrap') cms_reply(['schema' => cms_schema(), 'state' => cms_state(), 'media' => cms_media(), 'history' => cms_history(), 'user' => $_SESSION['user']]);
        cms_reply(['error' => 'Неизвестный запрос.'], 404);
    }
    if ($method !== 'POST') cms_reply(['error' => 'Метод не разрешён.'], 405);
    cms_csrf();
    if ($action === 'upload') {
        cms_require_auth();
        $file = $_FILES['image'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) throw new InvalidArgumentException('Не удалось загрузить фото. Размер файла должен быть до 8 МБ.');
        if ($file['size'] > 8 * 1024 * 1024) throw new InvalidArgumentException('Максимальный размер фотографии — 8 МБ.');
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) throw new InvalidArgumentException('Можно загрузить JPG, PNG или WebP.');
        $dimensions = getimagesize($file['tmp_name']);
        if (!$dimensions || $dimensions[0] * $dimensions[1] > 20000000) throw new InvalidArgumentException('Изображение слишком большое: максимум 20 мегапикселей.');
        if (!extension_loaded('gd')) throw new RuntimeException('Обработка изображений недоступна на сервере.');
        $im = imagecreatefromstring(file_get_contents($file['tmp_name']));
        if (!$im) throw new InvalidArgumentException('Файл изображения повреждён.');
        $scale = min(1, 2560 / max($dimensions[0], $dimensions[1]));
        if ($scale < 1) { $new = imagescale($im, (int)round($dimensions[0] * $scale), (int)round($dimensions[1] * $scale)); imagedestroy($im); $im = $new; }
        imagealphablending($im, false); imagesavealpha($im, true);
        $dir = CMS_WEBROOT . 'assets/uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $filename = gmdate('Ymd') . '-' . bin2hex(random_bytes(12)) . '.webp';
        if (!imagewebp($im, $dir . '/' . $filename, 88)) throw new RuntimeException('Не удалось сохранить изображение.');
        imagedestroy($im); chmod($dir . '/' . $filename, 0644);
        cms_reply(['url' => '/assets/uploads/' . $filename, 'media' => cms_media()]);
    }
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 1500000) throw new InvalidArgumentException('Запрос слишком большой.');
    $input = json_decode($raw, true);
    if (!is_array($input)) throw new InvalidArgumentException('Неверный формат запроса.');
    if ($action === 'login') {
        $username = (string)($input['username'] ?? ''); $password = (string)($input['password'] ?? '');
        $key = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'local');
        $ok = cms_locked(function () use ($key, $username, $password) {
            $limits = cms_json_read(CMS_PRIVATE . '/attempts.json');
            $now = time();
            foreach ($limits as $ip => $entry) if ($entry['at'] < $now - 900) unset($limits[$ip]);
            $entry = $limits[$key] ?? ['count' => 0, 'at' => $now];
            if ($entry['count'] >= 8 && $entry['at'] > $now - 900) cms_reply(['error' => 'Слишком много попыток. Попробуйте через 15 минут.'], 429);
            $config = cms_config();
            $ok = password_verify($password, $config['hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG') && hash_equals($config['username'] ?? '', $username);
            if ($ok) unset($limits[$key]); else $limits[$key] = ['count' => $entry['count'] + 1, 'at' => $entry['at']];
            cms_atomic(CMS_PRIVATE . '/attempts.json', $limits);
            return $ok;
        });
        if (!$ok) cms_reply(['error' => 'Неверный логин или пароль.'], 401);
        session_regenerate_id(true);
        $_SESSION['user'] = $username; $_SESSION['activity'] = time(); $_SESSION['generation'] = cms_config()['generation'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        cms_reply(['ok' => true, 'csrf' => $_SESSION['csrf'], 'mustChange' => !empty(cms_config()['mustChange'])]);
    }
    cms_require_auth(true);
    if ($action === 'logout') { $_SESSION = []; session_destroy(); cms_reply(['ok' => true]); }
    if ($action === 'password') {
        $current = (string)($input['current'] ?? ''); $new = (string)($input['password'] ?? '');
        if (strlen($new) < 12 || strlen($new) > 128) throw new InvalidArgumentException('Пароль должен содержать от 12 до 128 символов.');
        cms_locked(function () use ($current, $new) {
            $config = cms_config();
            if (!password_verify($current, $config['hash'])) throw new InvalidArgumentException('Текущий пароль указан неверно.');
            if (password_verify($new, $config['hash'])) throw new InvalidArgumentException('Новый пароль должен отличаться от текущего.');
            $config['hash'] = password_hash($new, PASSWORD_DEFAULT); $config['mustChange'] = false; $config['generation'] = bin2hex(random_bytes(16));
            cms_atomic(CMS_PRIVATE . '/account.json', $config);
            $_SESSION['generation'] = $config['generation'];
        });
        session_regenerate_id(true); cms_reply(['ok' => true]);
    }
    cms_require_auth();
    if (in_array($action, ['save', 'publish', 'restore'], true)) {
        $state = cms_locked(function () use ($action, $input) {
            $state = cms_state();
            if (!isset($input['revision']) || (int)$input['revision'] !== $state['revision']) cms_reply(['error' => 'Сайт изменён в другой вкладке. Обновите страницу перед сохранением.'], 409);
            if ($action === 'save') {
                $changes = $input['changes'] ?? null;
                if (!is_array($changes)) throw new InvalidArgumentException('Нет данных для сохранения.');
                $state['draft'] = array_replace($state['draft'], cms_validate($changes));
            } elseif ($action === 'publish') {
                cms_validate($state['draft']);
                cms_version($state, 'Версия до публикации');
                $state['published'] = $state['draft']; $state['publishedAt'] = gmdate('c');
            } else {
                $id = (string)($input['id'] ?? '');
                if (!preg_match('/^\d{8}-\d{6}-[a-f0-9]{6}$/D', $id) || !is_file(CMS_PRIVATE . '/versions/' . $id . '.json')) throw new InvalidArgumentException('Версия не найдена.');
                $version = cms_json_read(CMS_PRIVATE . '/versions/' . $id . '.json');
                cms_validate($version['values']);
                cms_version($state, 'Версия до восстановления');
                $state['draft'] = array_replace(cms_defaults(), $version['values']);
                $state['published'] = $state['draft']; $state['publishedAt'] = gmdate('c');
            }
            $state['revision']++; $state['updatedAt'] = gmdate('c');
            cms_atomic(CMS_PRIVATE . '/state.json', $state);
            return $state;
        });
        cms_reply(['ok' => true, 'state' => $state, 'history' => cms_history()]);
    }
    cms_reply(['error' => 'Неизвестное действие.'], 404);
} catch (InvalidArgumentException $e) { cms_reply(['error' => $e->getMessage()], 422); }
catch (Throwable $e) { error_log('GVS CMS: ' . $e->getMessage()); cms_reply(['error' => 'Не удалось выполнить операцию. Изменения не опубликованы. Повторите попытку.'], 500); }
