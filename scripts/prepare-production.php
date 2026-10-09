<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$target = $argv[1] ?? '';
if (!$target || $target[0] !== '/' || $target === '/' || $target === $root) throw new RuntimeException('Pass an absolute empty output directory.');
if (is_dir($target) && count(array_diff(scandir($target), ['.', '..'])) > 0) throw new RuntimeException('Output directory must be empty.');
if (!is_dir($target)) mkdir($target, 0755, true);
function copyTree(string $from, string $to, array $skip = [], string $relative = ''): void {
    if (!is_dir($to)) mkdir($to, 0755, true);
    foreach (scandir($from) as $name) {
        if ($name === '.' || $name === '..') continue;
        $path = $relative === '' ? $name : $relative . '/' . $name;
        if (in_array($path, $skip, true)) continue;
        if (is_dir($from . '/' . $name)) copyTree($from . '/' . $name, $to . '/' . $name, $skip, $path);
        else copy($from . '/' . $name, $to . '/' . $name);
    }
}
copyTree($root . '/site', $target, ['.cms', 'admin', 'assets/uploads']);
copyTree($root . '/server/cms', $target . '/.cms', ['private']);
copyTree($root . '/server/admin', $target . '/admin');
copy($root . '/server/production.htaccess', $target . '/.htaccess');
copy($root . '/server/robots.php', $target . '/robots.php');
copy($root . '/server/sitemap.php', $target . '/sitemap.php');
mkdir($target . '/assets/uploads', 0755, true);
copy($root . '/server/uploads.htaccess', $target . '/assets/uploads/.htaccess');
$schema = json_decode(file_get_contents($root . '/server/cms/schema.json'), true);
foreach ($schema['pages'] as $key => $page) {
    $prefix = $key === 'home' ? '__DIR__' : 'dirname(__DIR__)';
    file_put_contents($target . $page['url'] . 'index.php', "<?php\nrequire " . $prefix . " . '/.cms/bootstrap.php';\ncms_public('" . $key . "');\n");
}
echo $target . "\n";
