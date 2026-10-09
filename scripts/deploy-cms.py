"""Incremental FTPS deploy. Credentials are read from hidden stdin.

Only explicit CMS code paths are uploaded. Existing runtime content and
photographs are never replaced. The previous .htaccess is backed up.
"""
import ftplib
import getpass
import io
import json
import posixpath
import ssl
import sys
from pathlib import Path

class FTP(ftplib.FTP_TLS):
    def ntransfercmd(self, command, rest=None):
        connection, size = ftplib.FTP.ntransfercmd(self, command, rest)
        return self.context.wrap_socket(connection, server_hostname=self.host, session=self.sock.session), size

def ensure(ftp, directory):
    current = '/'
    for part in directory.strip('/').split('/'):
        current = posixpath.join(current, part)
        try:
            ftp.mkd(current)
        except ftplib.error_perm as error:
            if not str(error).startswith('550'):
                raise

def exists(ftp, name):
    try:
        ftp.size(name)
        return True
    except ftplib.error_perm:
        return False

def same_contents(ftp, name, content):
    try:
        if ftp.size(name) != len(content):
            return False
        previous = io.BytesIO()
        ftp.retrbinary('RETR ' + name, previous.write)
        return previous.getvalue() == content
    except ftplib.error_perm:
        return False

config = json.loads(getpass.getpass('Deployment JSON (hidden): '))
root = '/petrpebt.beget.tech/public_html'
source = Path(sys.argv[1]).resolve()
ftp = FTP(context=ssl.create_default_context())
ftp.connect('petrpebt.beget.tech', 21, timeout=40)
ftp.login('petrpebt', config['password'])
ftp.prot_p()
ensure(ftp, root + '/.cms/private/sessions')
ensure(ftp, root + '/.cms/private/versions')
ensure(ftp, root + '/assets/uploads')
for directory in ['/private', '/private/sessions', '/private/versions']:
    ftp.sendcmd('SITE CHMOD 700 ' + root + '/.cms' + directory)
ftp.sendcmd('TYPE I')
if not exists(ftp, root + '/.cms/private/account.json'):
    if 'account' not in config:
        raise RuntimeError('Initial admin account required.')
    ftp.storbinary('STOR ' + root + '/.cms/private/account.json', io.BytesIO(json.dumps(config['account']).encode()))
    ftp.sendcmd('SITE CHMOD 600 ' + root + '/.cms/private/account.json')

files = [p for p in source.rglob('*') if p.is_file() and (
    '/.cms/' in str(p) or '/admin/' in str(p) or p.name == 'index.php'
    or p.relative_to(source).as_posix() in ['robots.php', 'sitemap.php', 'assets/uploads/.htaccess']
)]
for file in files:
    relative = file.relative_to(source).as_posix()
    if relative.startswith('.cms/private/'):
        continue
    remote = root + '/' + relative
    ensure(ftp, posixpath.dirname(remote))
    content = file.read_bytes()
    if same_contents(ftp, remote, content):
        continue
    ftp.storbinary('STOR ' + remote, io.BytesIO(content))
    print('Uploaded ' + relative, flush=True)
# Beget's nginx serves existing static files before Apache rewrite rules.
# Move the old SEO files to private backups so the PHP routes can take over.
for name in ['robots.txt', 'sitemap.xml']:
    remote = root + '/' + name
    backup = root + '/.cms/private/pre-cms.' + name
    if exists(ftp, remote):
        if exists(ftp, backup):
            raise RuntimeError('Static SEO file exists alongside its backup: ' + name)
        ftp.rename(remote, backup)
        ftp.sendcmd('SITE CHMOD 600 ' + backup)
        print('Preserved static SEO file as private backup: ' + name, flush=True)
# Activate PHP last, once all application files are present.
htaccess = root + '/.htaccess'
backup = root + '/.cms/private/pre-cms.htaccess'
if exists(ftp, htaccess) and not exists(ftp, backup):
    original = io.BytesIO()
    ftp.retrbinary('RETR ' + htaccess, original.write)
    original.seek(0)
    ftp.storbinary('STOR ' + backup, original)
content = (source / '.htaccess').read_bytes()
if not same_contents(ftp, htaccess, content):
    ftp.storbinary('STOR ' + htaccess, io.BytesIO(content))
print('Activated production PHP routing.', flush=True)
ftp.quit()
