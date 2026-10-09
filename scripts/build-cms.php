<?php
// Generate editable fields and private templates from the static source.
// Runtime content is separate and is never overwritten by this build.
declare(strict_types=1);
$root = dirname(__DIR__);
$out = $root . '/server/cms';
if (!is_dir($out . '/templates')) mkdir($out . '/templates', 0755, true);
$pages = ['home' => ['Главная', '/'], 'services' => ['Услуги', '/services/'], 'packages' => ['Варианты монтажа', '/packages/'], 'prices' => ['Цены', '/prices/'], 'works' => ['Примеры работ', '/works/'], 'contacts' => ['Контакты', '/contacts/']];
$schema = ['pages' => [], 'fields' => []];
$values = [];
function field(string $id, string $label, string $value, string $type, string $page, string $section, string $hint = ''): string {
    global $schema, $values;
    $schema['fields'][$id] = compact('id', 'label', 'type', 'page', 'section', 'hint');
    $values[$id] = $value;
    return '{{gvs:' . $id . '}}';
}
$global = [
    'company' => ['Название компании', 'GVS-Group', 'text'],
    'subtitle' => ['Подпись под логотипом', '(Грубляк и Волков — сантехническая группа)', 'text'],
    'phone' => ['Телефон', '+7 962 405-26-77', 'phone'],
    'email' => ['Электронная почта', 'Petr_petr1988_petrov@mail.ru', 'email'],
    'hours' => ['График работы', 'Ежедневно, 09:00–20:00', 'text'],
    'region' => ['Регион выезда', 'Город и область', 'text'],
    'copyright_year' => ['Год в подписи ©', '2026', 'text'],
    'logo_light' => ['Логотип на светлом фоне', '/assets/img/gvs-group-logo.svg', 'image'],
    'logo_dark' => ['Логотип на тёмном фоне', '/assets/img/gvs-group-logo-inverse.svg', 'image'],
];
foreach ($global as $key => $v) field('global.' . $key, $v[0], $v[1], $v[2], 'global', 'Компания и контакты');
function token(string $id): string { return '{{gvs:' . $id . '}}'; }
function textOf(DOMNode $node): string { return trim(preg_replace('/\s+/u', ' ', $node->textContent)); }
function walk(DOMNode $node, string $page, string $section): void {
    global $schema, $global;
    static $counters = [];
    if ($node instanceof DOMElement) {
        $tag = strtolower($node->tagName);
        if (in_array($tag, ['script', 'style', 'head'], true)) return;
        if ($tag === 'header') $section = 'Шапка и меню';
        if ($tag === 'footer') $section = 'Подвал страницы';
        if ($node->getAttribute('class') === 'modal') $section = 'Форма заявки';
        if ($tag === 'section' || ($tag === 'article' && ($node->hasAttribute('id') || strpos($node->getAttribute('class'), 'case') !== false))) {
            $heads = $node->getElementsByTagName('h1');
            if ($heads->length === 0) $heads = $node->getElementsByTagName('h2');
            if ($heads->length === 0) $heads = $node->getElementsByTagName('h3');
            $section = $heads->length ? textOf($heads->item(0)) : 'Содержание страницы';
            if (mb_strlen($section) > 85) $section = mb_substr($section, 0, 82) . '…';
        }
        // Sitewide links and logo assets are controlled by global settings.
        if ($tag === 'a' && strpos($node->getAttribute('href'), 'tel:') === 0) $node->setAttribute('href', token('computed.tel'));
        if ($tag === 'a' && strpos($node->getAttribute('href'), 'mailto:') === 0) $node->setAttribute('href', 'mailto:' . token('global.email'));
        foreach (['aria-label', 'placeholder'] as $attr) {
            if (!$node->hasAttribute($attr) || $node->getAttribute($attr) === '') continue;
            $val = $node->getAttribute($attr);
            if (strpos($val, 'GVS-Group') !== false) {
                $node->setAttribute($attr, str_replace('GVS-Group', token('global.company'), $val));
                continue;
            }
            $n = ($counters[$page] ?? 0) + 1; $counters[$page] = $n;
            $node->setAttribute($attr, field($page . '.t' . $n, $attr === 'placeholder' ? 'Подсказка в поле' : 'Подпись для доступности', $val, 'text', $page, $section));
        }
        if ($tag === 'img') {
            $n = ($counters[$page] ?? 0) + 1; $counters[$page] = $n;
            $src = $node->getAttribute('src'); $alt = $node->getAttribute('alt');
            if ($src === $global['logo_light'][1] || $src === $global['logo_dark'][1]) {
                $node->setAttribute('src', token($src === $global['logo_light'][1] ? 'global.logo_light' : 'global.logo_dark'));
                if ($alt !== '') $node->setAttribute('alt', token('global.company'));
            } else {
                $id = $page . '.image' . $n;
                $node->setAttribute('src', field($id, $alt ?: 'Фотография', $src, 'image', $page, $section));
                $node->setAttribute('alt', field($id . '.alt', 'Описание фотографии (alt)', $alt, 'text', $page, $section));
                $schema['fields'][$id]['altId'] = $id . '.alt';
                $node->setAttribute('data-cms-image', $id);
            }
        }
        foreach (iterator_to_array($node->childNodes) as $child) walk($child, $page, $section);
    } elseif ($node instanceof DOMText && trim($node->nodeValue) !== '') {
        $val = $node->nodeValue;
        $clean = trim($val);
        if (preg_match('/^[\s\d\/·×↗—−–→]+$/u', $clean)) return;
        foreach (['company', 'subtitle', 'phone', 'email', 'hours', 'region'] as $key) {
            if ($clean === $global[$key][1]) { $node->nodeValue = str_replace($clean, token('global.' . $key), $val); return; }
        }
        if (strpos($clean, '©') === 0 && strpos($clean, 'GVS-Group') !== false) {
            $node->nodeValue = str_replace(['2026', 'GVS-Group'], [token('global.copyright_year'), token('global.company')], $val); return;
        }
        $n = ($counters[$page] ?? 0) + 1; $counters[$page] = $n;
        $parent = $node->parentNode;
        $tag = strtolower($parent->nodeName);
        $label = in_array($tag, ['h1', 'h2', 'h3']) ? 'Заголовок' : (in_array($tag, ['button', 'a']) ? 'Кнопка или ссылка' : ($tag === 'figcaption' ? 'Подпись к фото' : ($tag === 'label' ? 'Название поля' : 'Текст')));
        $type = mb_strlen($clean) > 100 ? 'textarea' : 'text';
        $replacement = field($page . '.t' . $n, $label, $clean, $type, $page, $section);
        // Preserve surrounding whitespace and styled inline fragments.
        $node->nodeValue = preg_replace('/\S(?:.*\S)?/us', $replacement, $val, 1);
    }
}
foreach ($pages as $key => $info) {
    $dom = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $source = file_get_contents($root . '/site' . $info[1] . 'index.html');
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $source, LIBXML_NOERROR | LIBXML_NOWARNING);
    foreach (iterator_to_array($dom->childNodes) as $child) if ($child->nodeType === XML_PI_NODE) $dom->removeChild($child);
    $schema['pages'][$key] = ['id' => $key, 'name' => $info[0], 'url' => $info[1]];
    $title = $dom->getElementsByTagName('title')->item(0);
    $title->nodeValue = field($key . '.seo.title', 'Заголовок в поиске (title)', $title->textContent, 'text', $key, 'SEO');
    foreach ($dom->getElementsByTagName('meta') as $meta) if ($meta->getAttribute('name') === 'description') $meta->setAttribute('content', field($key . '.seo.description', 'Описание в поиске (description)', $meta->getAttribute('content'), 'textarea', $key, 'SEO'));
    field($key . '.seo.index', 'Разрешить индексацию страницы', '1', 'toggle', $key, 'SEO');
    field($key . '.seo.canonical', 'Канонический адрес', 'https://gvs-group.ru' . $info[1], 'url', $key, 'SEO');
    field($key . '.seo.image', 'Фото для социальных сетей', '/assets/img/hero-engineering.webp', 'image', $key, 'SEO');
    walk($dom->documentElement, $key, 'Содержание страницы');
    // The preload belongs to the default hero; dynamic sources must not preload an obsolete image.
    $xpath = new DOMXPath($dom);
    foreach ($xpath->query('//link[@rel="preload"]') as $el) $el->parentNode->removeChild($el);
    $template = preg_replace('/%7B%7Bgvs:([a-zA-Z0-9_.]+)%7D%7D/i', '{{gvs:$1}}', $dom->saveHTML());
    $template = preg_replace('/[ \t]+$/m', '', $template);
    file_put_contents($out . '/templates/' . $key . '.html', $template);
}
file_put_contents($out . '/schema.json', json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
file_put_contents($out . '/defaults.json', json_encode($values, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
echo count($schema['fields']) . " editable fields on " . count($pages) . " pages\n";
