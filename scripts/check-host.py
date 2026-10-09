"""Read hosting capabilities through a temporary, non-secret PHP probe."""
import ftplib
import getpass
import io
import json
import secrets
import ssl
import urllib.request

class FTP(ftplib.FTP_TLS):
    def ntransfercmd(self, command, rest=None):
        connection, size = ftplib.FTP.ntransfercmd(self, command, rest)
        return self.context.wrap_socket(connection, server_hostname=self.host, session=self.sock.session), size

password = getpass.getpass('Hosting password (hidden): ')
ftp = FTP(context=ssl.create_default_context())
ftp.connect('petrpebt.beget.tech', 21, timeout=30)
ftp.login('petrpebt', password)
ftp.prot_p()
root = '/petrpebt.beget.tech/public_html'
try:
    existing = io.BytesIO()
    ftp.retrbinary('RETR ' + root + '/.htaccess', existing.write)
    print('Existing .htaccess found (%d bytes).' % len(existing.getvalue()))
except ftplib.error_perm as error:
    if not str(error).startswith('550'): raise
    print('No existing .htaccess.')
name = 'cms-check-' + secrets.token_hex(10) + '.php'
probe = b'<?php header("Content-Type: application/json"); echo json_encode(["php"=>PHP_VERSION,"gd"=>extension_loaded("gd"),"mbstring"=>extension_loaded("mbstring"),"fileinfo"=>extension_loaded("fileinfo"),"writable"=>is_writable(__DIR__),"uploadMax"=>ini_get("upload_max_filesize"),"postMax"=>ini_get("post_max_size")]);'
try:
    ftp.storbinary('STOR ' + root + '/' + name, io.BytesIO(probe))
    request = urllib.request.Request('https://gvs-group.ru/' + name, headers={'Cookie':'beget=begetok'})
    with urllib.request.urlopen(request) as response:
        print(json.dumps(json.load(response)))
finally:
    ftp.delete(root + '/' + name)
    ftp.quit()
