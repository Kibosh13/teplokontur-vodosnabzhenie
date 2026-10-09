"""Production smoke check: temporary edits stay in the private draft.

Accept the administrator password through hidden stdin. Published content is
never changed by the fixture; the publication test publishes original values.
"""
import concurrent.futures
import ftplib
import getpass
import http.cookiejar
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

base = 'https://gvs-group.ru'
password = getpass.getpass('Admin password (hidden): ')
hosting_password = getpass.getpass('Hosting password for upload fixture cleanup (hidden): ')
jar = http.cookiejar.CookieJar()
jar.set_cookie(http.cookiejar.Cookie(0, 'beget', 'begetok', None, False, 'gvs-group.ru', True, False, '/', True, True, None, True, None, None, {}))
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = ''

def request(path, body=None, token=True):
    headers = {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
        if token:
            headers['X-CSRF-Token'] = csrf
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = client.open(req, timeout=30)
        return response.status, response.read().decode(errors='replace'), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode(errors='replace'), error.headers

def api(action, body=None, token=True):
    status, raw, headers = request('/admin/api.php?action=' + action, body, token)
    return status, json.loads(raw), headers

def upload_fixture():
    boundary = 'gvs-production-fixture'
    content = (Path(__file__).resolve().parent.parent / 'site/assets/img/package-economy.webp').read_bytes()
    payload = ('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="cms-verification.webp"\r\nContent-Type: image/webp\r\n\r\n').encode() + content + ('\r\n--' + boundary + '--\r\n').encode()
    req = urllib.request.Request(base + '/admin/api.php?action=upload', data=payload, headers={'Content-Type':'multipart/form-data; boundary=' + boundary, 'X-CSRF-Token':csrf})
    with client.open(req, timeout=30) as response:
        assert response.status == 200
        return json.loads(response.read())['url']

def remove_fixture(url):
    if not re.fullmatch(r'/assets/uploads/\d{8}-[a-f0-9]{24}\.webp', url):
        raise RuntimeError('Unexpected fixture path; do not delete.')
    class FTP(ftplib.FTP_TLS):
        def ntransfercmd(self, command, rest=None):
            connection, size = ftplib.FTP.ntransfercmd(self, command, rest)
            return self.context.wrap_socket(connection, server_hostname=self.host, session=self.sock.session), size
    ftp = FTP(context=ssl.create_default_context())
    ftp.connect('petrpebt.beget.tech', 21, timeout=40)
    ftp.login('petrpebt', hosting_password)
    ftp.prot_p()
    # Only the file created by this exact verification run is removed.
    ftp.delete('/petrpebt.beget.tech/public_html' + url)
    ftp.quit()

resources = set(['/admin/admin.css', '/admin/admin.js', '/favicon.svg'])
class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = attrs.get('src') if tag in ('img', 'script') else attrs.get('href') if tag == 'link' and attrs.get('rel') in ('stylesheet', 'icon') else None
        if url and url.startswith('/'):
            resources.add(url)

pages = ['/', '/services/', '/packages/', '/prices/', '/works/', '/contacts/']
for page in pages:
    status, content, headers = request(page)
    assert status == 200 and 'GVS-Group' in content, (page, status)
    assert '{{gvs:' not in content and '%7Bgvs' not in content, page
    assert 'content="index, follow"' in content and not headers.get('X-Robots-Tag'), page
    assert 'tel:+79624052677' in content and 'mailto:Petr_petr1988_petrov@mail.ru' in content, page
    assert '<link rel="canonical" href="https://gvs-group.ru' in content, page
    Assets().feed(content)
css = request('/assets/style.css')[1]
for url in re.findall(r'url\([\'"]?([^\)\'\"]+)', css):
    if not url.startswith('data:'):
        resources.add(urllib.parse.urljoin('/assets/style.css', url))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    statuses = list(pool.map(lambda url: (url, request(url)[0]), sorted(resources)))
assert all(status == 200 for _, status in statuses), statuses
assert 'Disallow: /admin/' in request('/robots.txt')[1]
assert all('https://gvs-group.ru' + page + '</loc>' in request('/sitemap.xml')[1] for page in pages)
assert api('bootstrap')[0] == 401
assert request('/admin/preview.php?page=home')[0] == 401
for path in ['/.cms/defaults.json', '/.cms/schema.json', '/.cms/private/account.json', '/.cms/templates/home.html']:
    assert request(path)[0] == 403, path
assert 'noindex' in request('/admin/')[2]['X-Robots-Tag']
_, session, headers = api('session'); csrf = session['csrf']
admin_cookie = next(cookie for cookie in jar if cookie.name == 'gvs_admin')
assert admin_cookie.secure and admin_cookie.has_nonstandard_attr('HttpOnly')
assert admin_cookie.get_nonstandard_attr('SameSite', '').lower() == 'strict'
assert api('login', {'username':'admin', 'password':password}, False)[0] == 403
_, login, _ = api('login', {'username':'admin', 'password':password}); csrf = login['csrf']
assert login['ok'] and not login['mustChange']
_, boot, _ = api('bootstrap')
original = boot['state']['published']
original_draft = boot['state']['draft']
assert original_draft == original, 'Do not disturb an existing customer draft.'
state = boot['state']
text_id = next(k for k, v in boot['schema']['fields'].items() if v['page'] == 'home' and v['label'] == 'Заголовок')
fixture = 'ТЕСТ ЧЕРНОВИКА — НЕ ПУБЛИКОВАТЬ'
fixture_url = None
try:
    fixture_url = upload_fixture()
    assert request(fixture_url)[0] == 200
    code, result, _ = api('save', {'revision':state['revision'], 'changes':{text_id:fixture}})
    assert code == 200, result
    state = result['state']
    assert fixture not in request('/')[1]
    assert fixture in request('/admin/preview.php?page=home')[1]
    code, result, _ = api('save', {'revision':state['revision'], 'changes':{text_id:original[text_id]}})
    assert code == 200, result
    state = result['state']
    assert state['draft'] == original
    code, result, _ = api('publish', {'revision':state['revision']})
    assert code == 200 and result['state']['published'] == original, result.get('error')
    assert result['history'] and fixture not in request('/')[1]
    code, result, _ = api('restore', {'revision':result['state']['revision'], 'id':result['history'][0]['id']})
    assert code == 200 and result['state']['published'] == original
    print('PASS: 6 public pages, %d resources, indexing/canonicals, sitemap, private storage protection, HTTPS session cookies, login, CSRF, photo upload, draft preview, original-content publication and rollback.' % len(resources))
finally:
    _, boot, _ = api('bootstrap')
    if boot['state']['draft'] != original_draft:
        api('save', {'revision':boot['state']['revision'], 'changes':original_draft})
    api('logout', {})
    if fixture_url:
        remove_fixture(fixture_url)
        print('Verification-only photo removed; customer content is unchanged.')
