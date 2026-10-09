<?php
require __DIR__ . '/.cms/bootstrap.php';
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-cache');
$state = cms_state(); $values = $state['published'];
echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
foreach (cms_schema()['pages'] as $key => $page) {
    if ($values[$key . '.seo.index'] !== '1') continue;
    echo '<url><loc>' . cms_e($values[$key . '.seo.canonical']) . '</loc>';
    if ($state['publishedAt']) echo '<lastmod>' . substr($state['publishedAt'], 0, 10) . '</lastmod>';
    echo '</url>';
}
echo '</urlset>';
