"""End-to-end CMS checks against an isolated local preview.

Accept the temporary test password through hidden stdin. Content is restored
in finally, including after a failed assertion. Not run against production.
"""
import getpass
import html
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

base = sys.argv[1].rstrip('/')
if not base.startswith('http://127.0.0.1:'):
    raise RuntimeError('These mutation tests require an isolated local server.')
password = getpass.getpass('Test password (hidden): ')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = ''
def request(path, body=None, token=True):
    headers = {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
        if token: headers['X-CSRF-Token'] = csrf
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = client.open(req)
        return response.status, response.read().decode(errors='replace'), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode(), error.headers
def api(action, body=None, token=True):
    status, raw, headers = request('/admin/api.php?action=' + action, body, token)
    return status, json.loads(raw), headers

def upload(content, filename, mime):
    boundary = 'gvs-cms-fixture-boundary'
    body = ('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="' + filename + '"\r\nContent-Type: ' + mime + '\r\n\r\n').encode() + content + ('\r\n--' + boundary + '--\r\n').encode()
    req = urllib.request.Request(base + '/admin/api.php?action=upload', data=body, headers={'Content-Type':'multipart/form-data; boundary=' + boundary,'X-CSRF-Token':csrf})
    try:
        response = client.open(req)
        return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

assert api('bootstrap')[0] == 401
assert request('/admin/preview.php?page=home')[0] == 401
assert request('/.cms/defaults.json')[0] == 403
assert request('/.cms/private/account.json')[0] == 403
_, session, _ = api('session'); csrf = session['csrf']
assert api('login', {'username':'admin','password':password}, False)[0] == 403
_, login, _ = api('login', {'username':'admin','password':password}); csrf = login['csrf']
assert login['ok']
_, boot, _ = api('bootstrap')
original = boot['state']['published']
state = boot['state']
fields = boot['schema']['fields']
text_id = next(k for k, v in fields.items() if v['page'] == 'home' and v['label'] == 'Заголовок')
image_id = next(k for k, v in fields.items() if v['page'] == 'home' and v['type'] == 'image' and v['section'] != 'SEO')
fixture = 'Проверка <script>alert("xss")</script> & текста'
try:
    assert api('save', {'revision':state['revision'], 'changes':{'unknown':'x'}})[0] == 422
    assert api('save', {'revision':state['revision'], 'changes':{image_id:'/assets/uploads/test.php'}})[0] == 422
    assert upload(b'<?php echo "bad"; ?>', 'bad.php', 'application/x-php')[0] == 422
    code, uploaded = upload(Path('site/assets/img/package-economy.webp').read_bytes(), 'example.webp', 'image/webp')
    assert code == 200, uploaded
    assert uploaded['url'].endswith('.webp') and request(uploaded['url'])[0] == 200
    code, result, _ = api('save', {'revision':state['revision'], 'changes':{text_id:fixture,'global.phone':'+7 999 123-45-67','home.seo.title':'Проверка SEO','home.seo.index':'0',image_id:'/assets/img/service-water.webp'}})
    assert code == 200, result
    state = result['state']
    assert api('save', {'revision':state['revision']-1,'changes':{}})[0] == 409
    _, preview, _ = request('/admin/preview.php?page=home')
    assert html.escape(fixture, quote=True).replace('&#x27;', '&#039;') in preview
    assert '<script>alert' not in preview
    assert 'tel:+79991234567' in preview
    assert '/assets/img/service-water.webp' in preview
    assert 'noindex' in preview
    assert fixture not in request('/')[1] and 'Проверка SEO' not in request('/')[1]
    code, result, _ = api('publish', {'revision':state['revision']})
    assert code == 200, result
    state = result['state']
    _, live, headers = request('/')
    assert 'Проверка SEO' in live and '<script>alert' not in live
    assert headers['X-Robots-Tag'] == 'noindex, nofollow'
    assert 'https://gvs-group.ru/</loc>' not in request('/sitemap.xml')[1]
    assert 'tel:+79991234567' in request('/contacts/')[1]
    assert result['history']
    code, result, _ = api('restore', {'revision':state['revision'],'id':result['history'][0]['id']})
    assert code == 200, result
    state = result['state']
    assert state['published'] == original
    assert 'index, follow' in request('/')[1]
    print('PASS: authentication, CSRF, private storage, validation, uploads, draft isolation, safe rendering, images, shared contacts, SEO, sitemap, publish, stale revisions and rollback.')
finally:
    _, boot, _ = api('bootstrap')
    if boot['state']['published'] != original or boot['state']['draft'] != original:
        code, result, _ = api('save', {'revision':boot['state']['revision'],'changes':original})
        if code == 200: api('publish', {'revision':result['state']['revision']})
