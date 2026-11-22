# Team Spin

A wheel picker with three team sets: 12OAD, 12OAD German, and 12INOAD. Choose a set and spin to randomly pick a different name each time. When only one name is left, it appears on the wheel; select **Final pick** to reveal it without another spin. Picks are independent per visitor and reset on refresh. Switching sets or changing names during a spin cancels that spin.

Use **Manage names** to add or remove names from the selected set. Choose **This game only** for temporary changes, or **Save for everyone** to update the shared database. Other open pages check for updates every four seconds. Names must be unique within a set (ignoring capitalization). **Reset wheel** discards temporary changes and picks, and loads the currently saved shared names. Previously browser-only saved names are not automatically imported into the shared database.

## Run

1. Install Python 3 if it is not already installed.
2. In this folder, run `python app.py` (or `py app.py` on Windows).
3. Open `http://127.0.0.1:8000` in your browser.
4. Press Ctrl+C in the terminal to stop the server.

No Python packages are required. The optional Google Fonts load when an internet connection is available; local fallback fonts work offline.

## Deploy for sharing

The shared database requires a host that runs Python; GitHub Pages alone cannot run it. Deploy this entire project to a Python web host, start it with `python app.py`, and share that host's HTTPS URL. The server uses the host-provided `PORT` environment variable, or port 8000 locally. It stores the SQLite database in `data/` by default; set `WHEEL_DATA_DIR` to a persistent mounted directory on your host. A temporary filesystem will lose saved names on restart or redeployment. Use a single server instance with persistent storage; separate instances with separate SQLite files will not share changes. Back up the database file regularly.

**Access warning:** There are no user accounts or permissions. Anyone who can access the link can see the names and save or remove shared names. This is a simple demonstration server, not a hardened public production service. Do not publish sensitive personal information; add authentication, request limits, and production-grade hosting before using this for a restricted group.