<?php
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-cache');
echo "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /.cms/\n\nSitemap: https://gvs-group.ru/sitemap.xml\n";
