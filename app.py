"""Serve Team Spin and its shared SQLite-backed roster API."""

from contextlib import closing
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import os
import sqlite3


ROOT = Path(__file__).resolve().parent
DEFAULTS = json.loads((ROOT / "defaults.json").read_text(encoding="utf-8"))
STATIC_FILES = {"/", "/index.html", "/styles.css", "/picker.js", "/app.js"}


def initialize_database(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=10)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS rosters (name TEXT PRIMARY KEY, members TEXT NOT NULL)")
        for name, members in DEFAULTS.items():
            db.execute("INSERT OR IGNORE INTO rosters (name, members) VALUES (?, ?)", (name, json.dumps(members)))


class WheelHandler(SimpleHTTPRequestHandler):
    def json_response(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/rosters":
            with closing(sqlite3.connect(self.server.db_path, timeout=10)) as db:
                rows = db.execute("SELECT name, members FROM rosters").fetchall()
            self.json_response(200, {name: json.loads(members) for name, members in rows})
        elif path in STATIC_FILES:
            super().do_GET()
        else:
            self.send_error(404)

    def do_HEAD(self):
        if urlsplit(self.path).path in STATIC_FILES:
            super().do_HEAD()
        else:
            self.send_error(404)

    def do_POST(self):
        path = urlsplit(self.path).path
        if not path.startswith("/api/rosters/"):
            self.json_response(404, {"error": "Not found."})
            return
        name = unquote(path[len("/api/rosters/"):])
        if name not in DEFAULTS:
            self.json_response(404, {"error": "Unknown set."})
            return
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc.lower() != self.headers.get("Host", "").lower():
            self.json_response(403, {"error": "Cross-origin requests are not allowed."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096 or self.headers.get_content_type() != "application/json":
                raise ValueError("Invalid request.")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Invalid request.")
            action, member = payload.get("action"), payload.get("name")
            if action not in ("add", "remove") or not isinstance(member, str):
                raise ValueError("Invalid action or name.")
            member = member.strip()
            if not member or len(member) > 60:
                raise ValueError("Enter a name between 1 and 60 characters.")
            with closing(sqlite3.connect(self.server.db_path, timeout=10)) as db, db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT members FROM rosters WHERE name = ?", (name,)).fetchone()
                members = json.loads(row[0])
                match = next((item for item in members if item.lower() == member.lower()), None)
                if action == "add":
                    if match is not None:
                        raise ValueError("That name is already saved in this set.")
                    if len(members) >= 200:
                        raise ValueError("A set can contain at most 200 names.")
                    members.append(member)
                else:
                    if match is None:
                        raise ValueError("That name is not saved in this set.")
                    members.remove(match)
                db.execute("UPDATE rosters SET members = ? WHERE name = ?", (json.dumps(members), name))
            self.json_response(200, {"name": name, "members": members})
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self.json_response(400, {"error": str(error) or "Invalid request."})


def create_server(address, db_path):
    initialize_database(db_path)
    server = ThreadingHTTPServer(address, partial(WheelHandler, directory=str(ROOT)))
    server.db_path = str(db_path)
    return server


def main():
    data_dir = Path(os.environ.get("WHEEL_DATA_DIR", ROOT / "data"))
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    server = create_server((host, port), data_dir / "rosters.sqlite3")
    print(f"Wheel picker is running on {host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping the wheel picker.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()