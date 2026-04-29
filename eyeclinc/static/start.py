#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════╗
║      عيادة النور البصرية — Optical Clinic System        ║
║                        start.py                          ║
║                                                          ║
║  Double-click or run this file to launch the clinic app. ║
╚══════════════════════════════════════════════════════════╝

Usage:
    python3 start.py          (Mac / Linux)
    python start.py           (Windows)

Browser opens automatically at: http://localhost:5000

Environment variables (optional, override defaults in app.py):
    SUPABASE_URL        — your Supabase project URL
    SUPABASE_KEY        — your Supabase anon/service key
    ANTHROPIC_API_KEY   — your Anthropic API key (for AI features)
"""

import os
import sys
import subprocess
import threading
import webbrowser
import time

PORT = 5000
URL  = f"http://localhost:{PORT}"


# ── 1. Check / install dependencies ──────────────────────────────────────────
def pip_install(package):
    print(f"  Installing {package} ...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", package, "--quiet"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"  ✓ {package} ready.")

def ensure(package, import_as=None):
    try:
        __import__(import_as or package)
    except ImportError:
        pip_install(package)

print()
print("╔══════════════════════════════════════════════════════════╗")
print("║      عيادة النور البصرية — Optical Clinic System        ║")
print("╚══════════════════════════════════════════════════════════╝")
print()
print("  Checking dependencies ...")
ensure("flask")
ensure("supabase")
ensure("dotenv", import_as="dotenv")
print()

# ── 2. Load .env if present ───────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("  .env loaded (if present)")
except ImportError:
    pass

# ── 3. Ensure static dir exists ───────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# ── 4. Import app (init_db is a no-op for Supabase) ──────────────────────────
from app import app, init_db
init_db()

# ── 5. Open browser automatically ─────────────────────────────────────────────
def open_browser():
    time.sleep(1.5)
    webbrowser.open(URL)

threading.Thread(target=open_browser, daemon=True).start()

# ── 6. Banner and start Flask (dev only — Vercel uses Gunicorn) ───────────────
print(f"  Supabase URL : {os.environ.get('SUPABASE_URL', '(default in app.py)')}")
print(f"  Address      : {URL}")
print()
print("  Browser opening automatically ...")
print("  If it doesn't open, navigate to:  http://localhost:5000")
print()
print("  Press Ctrl+C to stop.")
print()

app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
