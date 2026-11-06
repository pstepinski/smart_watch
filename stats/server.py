"""First-party aggregates and separately opted-in pseudonymous visitor statistics."""
import base64
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
from urllib.parse import urlsplit
from uuid import UUID

DATA_DIR = Path(os.environ.get('STATS_DATA_DIR', '/data'))


def utc_day():
    return datetime.now(timezone.utc).date()


@contextmanager
def database():
    connection = sqlite3.connect(DATA_DIR / 'visits.sqlite3', timeout=15)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    password_file = DATA_DIR / 'admin-password'
    password = os.environ.get('STATS_PASSWORD') or (password_file.read_text().strip() if password_file.exists() else secrets.token_urlsafe(24))
    password_file.write_text(password)
    password_file.chmod(0o600)
    secret_file = DATA_DIR / 'visitor-secret'
    if not secret_file.exists():
        secret_file.write_bytes(secrets.token_bytes(32))
        secret_file.chmod(0o600)
    with database() as connection:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('CREATE TABLE IF NOT EXISTS visits (day TEXT PRIMARY KEY, count INTEGER NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS unique_visits (day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY(day, visitor_hash))')
        connection.execute('CREATE INDEX IF NOT EXISTS unique_visitors_hash ON unique_visits(visitor_hash)')
    return 'Basic ' + base64.b64encode(f'admin:{password}'.encode()).decode()


def summary():
    today = utc_day()
    start = today - timedelta(days=29)
    with database() as connection:
        total = connection.execute('SELECT COALESCE(SUM(count), 0) FROM visits').fetchone()[0]
        counts = dict(connection.execute('SELECT day, count FROM visits WHERE day >= ? AND day <= ?', (start.isoformat(), today.isoformat())))
        unique_total = connection.execute('SELECT COUNT(DISTINCT visitor_hash) FROM unique_visits').fetchone()[0]
        unique_period = connection.execute('SELECT COUNT(DISTINCT visitor_hash) FROM unique_visits WHERE day >= ? AND day <= ?', (start.isoformat(), today.isoformat())).fetchone()[0]
        unique_days = dict(connection.execute('SELECT day, COUNT(*) FROM unique_visits WHERE day >= ? AND day <= ? GROUP BY day', (start.isoformat(), today.isoformat())))
    days = [{'day': (start + timedelta(days=index)).isoformat(), 'count': counts.get((start + timedelta(days=index)).isoformat(), 0)} for index in range(30)]
    for item in days:
        item['unique'] = unique_days.get(item['day'], 0)
    return {'uniqueToday': unique_days.get(today.isoformat(), 0), 'uniqueLast30Days': unique_period, 'uniqueTotal': unique_total, 'today': counts.get(today.isoformat(), 0), 'last30Days': sum(item['count'] for item in days), 'total': total, 'days': days, 'timezone': 'UTC'}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    auth = ''

    def log_message(self, *_):
        # Do not record IP addresses, URLs, credentials or user agents in request logs.
        pass

    def respond(self, status, body=b'', content_type='application/json; charset=utf-8', extra=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if hmac.compare_digest(self.headers.get('Authorization', '').encode(), self.auth.encode()):
            return True
        self.respond(401, b'{"error":"Authentication required"}', extra={'WWW-Authenticate': 'Basic realm="SMART WATCH statistics", charset="UTF-8"'})
        return False

    def do_GET(self):
        if self.path == '/healthz':
            self.respond(200, b'ok', 'text/plain')
        elif self.path in ('/stats', '/stats/'):
            if self.authorized():
                self.respond(200, Path(__file__).with_name('dashboard.html').read_bytes(), 'text/html; charset=utf-8', {
                    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
                    'Referrer-Policy': 'no-referrer',
                })
        elif self.path == '/api/stats':
            if self.authorized():
                self.respond(200, json.dumps(summary()).encode())
        else:
            self.respond(404)

    def do_POST(self):
        if self.path not in ('/api/visits', '/api/visitors'):
            self.close_connection = True
            self.respond(404)
            return
        # No cross-site browser tracking or third-party embeddings.
        origin = self.headers.get('Origin')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and urlsplit(origin).netloc != self.headers.get('Host')):
            self.close_connection = True
            self.respond(403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if self.headers.get('Transfer-Encoding') or not 0 < size <= 128 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Invalid request')
            payload = json.loads(self.rfile.read(size))
            if self.path == '/api/visits':
                if payload != {'event': 'visit'}:
                    raise ValueError('Invalid event')
            else:
                if not isinstance(payload, dict) or set(payload) != {'visitorId'} or not isinstance(payload['visitorId'], str):
                    raise ValueError('Invalid visitor')
                visitor = UUID(payload['visitorId'])
                if visitor.version != 4 or str(visitor) != payload['visitorId']:
                    raise ValueError('Invalid visitor')
        except (ValueError, UnicodeDecodeError):
            self.close_connection = True
            self.respond(400)
            return
        try:
            with database() as connection:
                if self.path == '/api/visits':
                    connection.execute('INSERT INTO visits(day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1', (utc_day().isoformat(),))
                else:
                    digest = hmac.new((DATA_DIR / 'visitor-secret').read_bytes(), str(visitor).encode(), hashlib.sha256).hexdigest()
                    connection.execute('INSERT OR IGNORE INTO unique_visits(day, visitor_hash) VALUES (?, ?)', (utc_day().isoformat(), digest))
            self.respond(204)
        except sqlite3.Error:
            self.respond(503)


if __name__ == '__main__':
    Handler.auth = initialize()
    print('Statistics ready on port 8080. Dashboard: /stats. User: admin. Password: /data/admin-password.', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
