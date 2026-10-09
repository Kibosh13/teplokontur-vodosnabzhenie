"""Replace the single administrator account through FTPS.

Use only for owner-authorized provisioning or password recovery. JSON with
the hosting password and the new account is read through hidden stdin. This
does not print/store a plaintext administrator password or change content.
"""
import ftplib
import getpass
import io
import json
import secrets
import ssl

class FTP(ftplib.FTP_TLS):
    def ntransfercmd(self, command, rest=None):
        connection, size = ftplib.FTP.ntransfercmd(self, command, rest)
        return self.context.wrap_socket(connection, server_hostname=self.host, session=self.sock.session), size

config = json.loads(getpass.getpass('Account provisioning JSON (hidden): '))
account = config['account']
if set(account) != {'username', 'hash', 'generation', 'mustChange'} or not account['mustChange']:
    raise RuntimeError('Recovery must use a temporary account requiring password replacement.')
if not account['username'] or not account['hash'].startswith(('$2y$', '$argon2')) or len(account['generation']) < 32:
    raise RuntimeError('Invalid administrator account.')
root = '/petrpebt.beget.tech/public_html/.cms/private'
ftp = FTP(context=ssl.create_default_context())
ftp.connect('petrpebt.beget.tech', 21, timeout=40)
ftp.login('petrpebt', config['password'])
ftp.prot_p()
temporary = root + '/.account-' + secrets.token_hex(8)
ftp.storbinary('STOR ' + temporary, io.BytesIO(json.dumps(account).encode()))
ftp.sendcmd('SITE CHMOD 600 ' + temporary)
ftp.rename(temporary, root + '/account.json')
ftp.quit()
print('Temporary account installed. Existing sessions are invalidated. Password replacement is required on first login.')
