import base64
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
import importlib.util
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
from datetime import timedelta
from uuid import uuid4

spec = importlib.util.spec_from_file_location('visits', Path(__file__).parents[2] / 'stats/server.py')
visits = importlib.util.module_from_spec(spec)
spec.loader.exec_module(visits)


class StatisticsTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        visits.DATA_DIR = Path(self.directory.name)
        visits.Handler.auth = visits.initialize()
        self.server = visits.ThreadingHTTPServer(('127.0.0.1', 0), visits.Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def request(self, method='GET', path='/api/stats', body=None, headers=None):
        connection = HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def visit(self):
        return self.request('POST', '/api/visits', '{"event":"visit"}', {'Content-Type': 'application/json'})[0]

    def test_authentication_and_password_survive_restart(self):
        self.assertEqual(self.request()[0], 401)
        self.assertEqual(self.request(path='/stats')[0], 401)
        password = (visits.DATA_DIR / 'admin-password').read_text()
        auth = 'Basic ' + base64.b64encode(f'admin:{password}'.encode()).decode()
        status, headers, body = self.request(path='/stats', headers={'Authorization': auth})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn(password.encode(), body)
        self.assertEqual(visits.initialize(), auth)

    def test_visits_are_aggregated_and_persistent_without_personal_data(self):
        with ThreadPoolExecutor(max_workers=5) as pool:
            self.assertEqual(list(pool.map(lambda _: self.visit(), range(20))), [204] * 20)
        visits.initialize()
        status, headers, body = self.request(headers={'Authorization': visits.Handler.auth})
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data['total'], 20)
        self.assertEqual(data['today'], 20)
        self.assertEqual(data['last30Days'], 20)
        self.assertEqual(len(data['days']), 30)
        self.assertNotIn('Set-Cookie', headers)
        with visits.database() as connection:
            self.assertEqual([row[1] for row in connection.execute('PRAGMA table_info(visits)')], ['day', 'count'])
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM visits').fetchone()[0], 1)

    def test_invalid_and_cross_site_requests_do_not_count(self):
        self.assertEqual(self.request('POST', '/api/visits', '{}', {'Content-Type': 'application/json'})[0], 400)
        self.assertEqual(self.request('POST', '/api/visits', '{"event":"visit"}', {'Content-Type': 'application/json', 'Origin': 'https://other.example'})[0], 403)
        self.assertEqual(self.request('POST', '/api/visits', '{"event":"visit"}', {'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.request(path='/healthz')[0], 200)
        self.assertEqual(visits.summary()['total'], 0)

    def test_last_30_days_excludes_old_days_and_fills_zeroes(self):
        with visits.database() as connection:
            connection.execute('INSERT INTO visits VALUES (?, ?)', ('2020-01-01', 12))
        self.visit()
        data = visits.summary()
        self.assertEqual(data['total'], 13)
        self.assertEqual(data['last30Days'], 1)
        self.assertEqual(data['days'][-1]['count'], 1)
        self.assertTrue(all(day['count'] == 0 for day in data['days'][:-1]))

    def visitor(self, identity):
        return self.request('POST', '/api/visitors', json.dumps({'visitorId': identity}), {'Content-Type': 'application/json'})[0]

    def test_unique_browsers_deduplicate_per_day_and_period_without_counting_extra_openings(self):
        identity = str(uuid4())
        with ThreadPoolExecutor(max_workers=5) as pool:
            self.assertEqual(list(pool.map(lambda _: self.visitor(identity), range(20))), [204] * 20)
        today = visits.utc_day()
        with patch.object(visits, 'utc_day', return_value=today - timedelta(days=1)):
            self.assertEqual(self.visitor(identity), 204)
            self.assertEqual(self.visitor(str(uuid4())), 204)
        data = visits.summary()
        self.assertEqual(data['total'], 0)
        self.assertEqual(data['uniqueToday'], 1)
        self.assertEqual(data['uniqueLast30Days'], 2)
        self.assertEqual(data['uniqueTotal'], 2)
        self.assertEqual(sum(day['unique'] for day in data['days']), 3)
        with visits.database() as connection:
            hashes = [row[0] for row in connection.execute('SELECT visitor_hash FROM unique_visits')]
            self.assertTrue(all(len(value) == 64 and value != identity for value in hashes))
            self.assertEqual(len(set(hashes)), 2)
        key = (visits.DATA_DIR / 'visitor-secret').read_bytes()
        visits.initialize()
        self.assertEqual((visits.DATA_DIR / 'visitor-secret').read_bytes(), key)
        self.assertEqual(self.visitor(identity), 204)
        self.assertEqual(visits.summary()['uniqueTotal'], 2)

    def test_invalid_unique_requests_are_rejected_and_old_unique_visits_only_count_in_total(self):
        for identity in ['bad', str(uuid4()).upper(), 123]:
            self.assertEqual(self.visitor(identity), 400)
        self.assertEqual(self.request('POST', '/api/visitors', '{"visitorId":"bad","name":"private"}', {'Content-Type': 'application/json'})[0], 400)
        with patch.object(visits, 'utc_day', return_value=visits.utc_day() - timedelta(days=31)):
            self.assertEqual(self.visitor(str(uuid4())), 204)
        data = visits.summary()
        self.assertEqual(data['uniqueTotal'], 1)
        self.assertEqual(data['uniqueLast30Days'], 0)
        self.assertEqual(data['uniqueToday'], 0)


if __name__ == '__main__':
    unittest.main()
