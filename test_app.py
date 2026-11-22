"""Regression tests for the shared roster server; uses an isolated database."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json
import unittest

import app


class RosterServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.database = Path(self.temporary.name) / "rosters.sqlite3"
        self.server = app.create_server(("127.0.0.1", 0), self.database)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temporary.cleanup()

    def request(self, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.base + path, data=data, headers=headers or {})
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            try:
                return error.code, error.read()
            finally:
                error.close()

    def test_shared_changes_and_persistence(self):
        status, rosters = self.request("/api/rosters")
        self.assertEqual(status, 200)
        self.assertEqual(rosters, app.DEFAULTS)
        status, result = self.request("/api/rosters/12OAD", {"action": "add", "name": "New Person"})
        self.assertEqual(status, 200)
        self.assertIn("New Person", result["members"])
        app.initialize_database(self.database)
        self.assertIn("New Person", self.request("/api/rosters")[1]["12OAD"])
        self.assertEqual(self.request("/api/rosters/12OAD", {"action": "add", "name": "new person"})[0], 400)
        self.assertEqual(self.request("/api/rosters/12OAD", {"action": "remove", "name": "New Person"})[0], 200)
        self.assertNotIn("New Person", self.request("/api/rosters")[1]["12OAD"])

    def test_simultaneous_updates_do_not_overwrite_each_other(self):
        def add(index):
            return self.request("/api/rosters/12INOAD", {"action": "add", "name": f"Test {index}"})[0]
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(list(pool.map(add, range(8))), [200] * 8)
        members = self.request("/api/rosters")[1]["12INOAD"]
        self.assertTrue(all(f"Test {index}" in members for index in range(8)))

    def test_validation_and_private_files(self):
        self.assertEqual(self.request("/api/rosters/no-such-set", {"action": "add", "name": "A"})[0], 404)
        self.assertEqual(self.request("/api/rosters/12OAD", {"action": "add", "name": " "})[0], 400)
        self.assertEqual(self.request("/api/rosters/12OAD", {"action": "add", "name": "A"}, {"Origin": "https://example.com"})[0], 403)
        for path in ("/app.py", "/defaults.json", "/data/rosters.sqlite3"):
            self.assertEqual(self.request(path)[0], 404)


if __name__ == "__main__":
    unittest.main()