#!/usr/bin/env python3
"""
app.py — Flask application and all API routes
عيادة النور البصرية — Optical Clinic Management System

Database: Supabase (PostgreSQL)
Deployment: Vercel (WSGI via Gunicorn)
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime, date, timedelta

from flask import Flask, request, jsonify, send_from_directory
from supabase import create_client, Client

# ── App setup ─────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

app = Flask(__name__, static_folder=STATIC_DIR)

# ── Supabase client ────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ekzvzaviejiovwnixpcq.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_DcUzLlY-_wCeD78pZTGOSg_ByR82M5d")

_supabase: Client = None

def get_db() -> Client:
    """Return (or lazily create) the Supabase client."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def init_db():
    """
    Supabase uses PostgreSQL — tables are created via the Supabase dashboard
    or SQL editor. This function is a no-op kept for start.py compatibility.

    Run the SQL in `schema.sql` once in your Supabase SQL editor to create
    all required tables.
    """
    pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def today():
    return date.today().isoformat()

def calc_next_review(d=None):
    """Return a date 6 months after d (or today)."""
    try:
        dt = datetime.strptime(d or today(), "%Y-%m-%d")
        m  = dt.month + 6
        y  = dt.year + (m - 1) // 12
        m  = (m - 1) % 12 + 1
        dt = dt.replace(year=y, month=m)
    except Exception:
        dt = datetime.now() + timedelta(days=180)
    return dt.strftime("%Y-%m-%d")

def sb_rows(response):
    """Extract list of dicts from a Supabase response."""
    return response.data or []

def sb_one(response):
    """Extract first row from a Supabase response."""
    data = response.data
    return data[0] if data else None


# ══════════════════════════════════════════════════════════════════════════════
# STATIC FILE
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


# ══════════════════════════════════════════════════════════════════════════════
# PATIENTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/patients", methods=["GET"])
def get_patients():
    db   = get_db()
    rows = sb_rows(
        db.table("patients")
          .select("*, lens1:lenses!lens1_id(sph,cyl,filter_type,lens_type), lens2:lenses!lens2_id(sph,cyl,filter_type,lens_type)")
          .order("admission_date", desc=True)
          .order("id", desc=True)
          .execute()
    )
    for p in rows:
        if p.get("lens1"):
            p["lens1_info"] = p.pop("lens1")
        if p.get("lens2"):
            p["lens2_info"] = p.pop("lens2")
    return jsonify(rows)


@app.route("/api/patients", methods=["POST"])
def save_patient():
    d   = request.json
    pid = d.get("id")
    db  = get_db()

    fields = [
        "name","age","phone","address","admission_date","next_review","notes",
        "od_sph","od_cyl","od_axis","od_add","od_va","od_bcva",
        "os_sph","os_cyl","os_axis","os_add","os_va","os_bcva","pd",
        "checkup_done","checkup_paid","checkup_fee","lenses_qty",
        "lens1_id","lens1_cost","lens2_id","lens2_cost",
        "frame_name","frame_type","frame_cost",
        "total_cost","amount_paid","rxtype","material","features",
    ]

    def _int_or_none(v):
        try: return int(v) if v is not None and v != "" else None
        except: return None

    vals = {f: d.get(f) for f in fields}
    vals["next_review"] = calc_next_review(vals.get("admission_date"))
    # coerce numeric IDs
    vals["lens1_id"] = _int_or_none(vals.get("lens1_id"))
    vals["lens2_id"] = _int_or_none(vals.get("lens2_id"))

    try:
        if pid:
            # Fetch old lens IDs for stock adjustment
            old = sb_one(db.table("patients").select("lens1_id,lens2_id,lenses_qty").eq("id", pid).execute())
            old_l1 = _int_or_none(old.get("lens1_id")) if old else None
            old_l2 = _int_or_none(old.get("lens2_id")) if old else None

            db.table("patients").update(vals).eq("id", pid).execute()

            new_l1 = vals["lens1_id"]
            new_l2 = vals["lens2_id"]
            lqty   = int(vals.get("lenses_qty") or 2)

            # Restore stock for swapped-out lenses
            if old_l1 and old_l1 != new_l1:
                _lens_adjust(db, old_l1, +1)
            if old_l2 and old_l2 != new_l2:
                _lens_adjust(db, old_l2, +1)
            # Deduct stock for newly assigned lenses
            if new_l1 and new_l1 != old_l1:
                _lens_adjust(db, new_l1, -1)
            if new_l2 and lqty == 2 and new_l2 != old_l2:
                _lens_adjust(db, new_l2, -1)

        else:
            res = db.table("patients").insert(vals).execute()
            pid = sb_one(res)["id"]

            new_l1 = vals["lens1_id"]
            new_l2 = vals["lens2_id"]
            lqty   = int(vals.get("lenses_qty") or 2)
            if new_l1:
                _lens_adjust(db, new_l1, -1)
            if new_l2 and lqty == 2:
                _lens_adjust(db, new_l2, -1)

            # Auto-post sale to ledger
            total     = float(vals.get("total_cost") or 0)
            collected = float(vals.get("amount_paid") or 0)
            pname     = vals.get("name", "")
            sale_date = vals.get("admission_date") or today()
            if total > 0:
                db.table("ledger").insert({
                    "date": sale_date, "entry_type": "income",
                    "category": "مبيعات مرضى",
                    "description": f"بيع للمريض: {pname}",
                    "total_amount": total, "paid_amount": collected,
                    "is_expense": False, "source_ref": f"patient:{pid}",
                }).execute()

        return jsonify({"id": pid})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


def _lens_adjust(db: Client, lid: int, delta: int):
    """Increment or decrement lens stock safely."""
    row = sb_one(db.table("lenses").select("stock").eq("id", lid).execute())
    if row:
        new_stock = max(0, (row.get("stock") or 0) + delta)
        db.table("lenses").update({"stock": new_stock}).eq("id", lid).execute()


@app.route("/api/patients/<int:pid>", methods=["DELETE"])
def delete_patient(pid):
    db  = get_db()
    row = sb_one(db.table("patients").select("lens1_id,lens2_id,lenses_qty").eq("id", pid).execute())
    if row:
        if row.get("lens1_id"):
            _lens_adjust(db, row["lens1_id"], +1)
        if row.get("lens2_id") and (row.get("lenses_qty") or 2) == 2:
            _lens_adjust(db, row["lens2_id"], +1)
    db.table("patients").delete().eq("id", pid).execute()
    return jsonify({"ok": True})


@app.route("/api/patients/<int:pid>/pay", methods=["POST"])
def pay_patient(pid):
    d      = request.json
    amount = float(d.get("amount", 0))
    db     = get_db()
    row    = sb_one(db.table("patients").select("amount_paid").eq("id", pid).execute())
    if row:
        new_paid = (row.get("amount_paid") or 0) + amount
        db.table("patients").update({"amount_paid": new_paid}).eq("id", pid).execute()
    db.table("patient_payments").insert({
        "patient_id": pid, "amount": amount,
        "date": d.get("date", today()),
    }).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# DEBTORS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/debtors", methods=["GET"])
def get_debtors():
    db   = get_db()
    rows = sb_rows(db.table("debtors").select("*").order("created_at", desc=True).execute())
    return jsonify(rows)


@app.route("/api/debtors", methods=["POST"])
def save_debtor():
    d         = request.json
    did       = d.get("id")
    total     = float(d.get("total_we_owe", 0))
    init_paid = float(d.get("initial_paid", 0))
    remaining = max(0.0, total - init_paid)
    status    = "settled" if remaining <= 0 else ("partial" if init_paid > 0 else "unpaid")
    db        = get_db()

    payload = {
        "name": d.get("name"), "phone": d.get("phone"),
        "category": d.get("category"), "what_bought": d.get("what_bought"),
        "total_we_owe": total, "remaining": remaining,
        "status": status, "due_date": d.get("due_date"), "notes": d.get("notes"),
    }

    if did:
        db.table("debtors").update(payload).eq("id", did).execute()
    else:
        payload["total_paid"] = init_paid
        res = db.table("debtors").insert(payload).execute()
        did = sb_one(res)["id"]

    return jsonify({"id": did})


@app.route("/api/debtors/<int:did>", methods=["DELETE"])
def delete_debtor(did):
    get_db().table("debtors").delete().eq("id", did).execute()
    return jsonify({"ok": True})


@app.route("/api/debtors/<int:did>/pay", methods=["POST"])
def pay_debtor(did):
    d      = request.json
    amount = float(d.get("amount", 0))
    db     = get_db()
    row    = sb_one(db.table("debtors").select("total_paid,remaining").eq("id", did).execute())
    if row:
        new_paid      = (row.get("total_paid") or 0) + amount
        new_remaining = max(0.0, (row.get("remaining") or 0) - amount)
        status = "settled" if new_remaining <= 0 else ("partial" if new_paid > 0 else "unpaid")
        db.table("debtors").update({
            "total_paid": new_paid, "remaining": new_remaining, "status": status
        }).eq("id", did).execute()
    db.table("debtor_payments").insert({
        "debtor_id": did, "amount": amount,
        "method": d.get("method", "cash"),
        "note": d.get("note", ""),
        "date": d.get("date", today()),
    }).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# LENSES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/lenses", methods=["GET"])
def get_lenses():
    rows = sb_rows(get_db().table("lenses").select("*").order("lens_type").order("sph").execute())
    return jsonify(rows)


@app.route("/api/lenses", methods=["POST"])
def save_lens():
    d   = request.json
    lid = d.get("id")
    db  = get_db()

    payload = {
        "lens_type": d.get("lens_type"), "category": d.get("category"),
        "sph": d.get("sph"), "cyl": d.get("cyl"),
        "material": d.get("material"), "filter_type": d.get("filter_type"),
        "tint": d.get("tint"),
        "stock": int(d.get("stock", 0)),
        "reorder_point": int(d.get("reorder_point", 5)),
        "cost": float(d.get("cost", 0)),
        "price": float(d.get("price", 0)),
    }

    if lid:
        db.table("lenses").update(payload).eq("id", lid).execute()
    else:
        db.table("lenses").insert(payload).execute()

    return jsonify({"ok": True})


@app.route("/api/lenses/<int:lid>/restock", methods=["POST"])
def restock_lens(lid):
    d    = request.json
    qty  = int(d.get("qty", 0))
    cost = float(d.get("cost", 0))
    db   = get_db()

    row = sb_one(db.table("lenses").select("*").eq("id", lid).execute())
    if not row:
        return jsonify({"error": "Lens not found"}), 404

    new_stock = (row.get("stock") or 0) + qty
    update = {"stock": new_stock}
    if cost > 0:
        update["cost"] = cost
    db.table("lenses").update(update).eq("id", lid).execute()

    db.table("lens_restocks").insert({
        "lens_id": lid, "qty": qty, "cost_per_unit": cost,
        "date": d.get("date", today()),
    }).execute()

    total_cost = qty * cost
    if total_cost > 0:
        lens_name = f"{row['lens_type']} SPH{row['sph']} CYL{row.get('cyl','0')}"
        db.table("ledger").insert({
            "date": d.get("date", today()),
            "entry_type": "expense", "category": "شراء عدسات",
            "description": f"تجديد مخزون: {lens_name} × {qty} وحدة",
            "total_amount": total_cost, "paid_amount": total_cost,
            "is_expense": True, "source_ref": f"restock:lens:{lid}",
        }).execute()

    return jsonify({"ok": True, "new_stock": new_stock})


@app.route("/api/lenses/<int:lid>", methods=["DELETE"])
def delete_lens(lid):
    get_db().table("lenses").delete().eq("id", lid).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# OPERATIONAL COSTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/op-costs", methods=["GET"])
def get_op_costs():
    rows = sb_rows(get_db().table("op_costs").select("*").order("created_at", desc=True).execute())
    return jsonify(rows)


@app.route("/api/op-costs", methods=["POST"])
def save_op_cost():
    d   = request.json
    oid = d.get("id")
    db  = get_db()

    payload = {
        "name": d.get("name"), "amount": d.get("amount"),
        "frequency": d.get("frequency"), "category": d.get("category"),
    }

    if oid:
        db.table("op_costs").update(payload).eq("id", oid).execute()
    else:
        db.table("op_costs").insert(payload).execute()

    return jsonify({"ok": True})


@app.route("/api/op-costs/<int:oid>", methods=["DELETE"])
def delete_op_cost(oid):
    get_db().table("op_costs").delete().eq("id", oid).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/settings", methods=["GET"])
def get_settings():
    rows = sb_rows(get_db().table("settings").select("key,value").execute())
    return jsonify({r["key"]: r["value"] for r in rows})


@app.route("/api/settings", methods=["POST"])
def save_settings():
    d  = request.json
    db = get_db()
    for k, v in d.items():
        db.table("settings").upsert(
            {"key": k, "value": str(v) if v is not None else ""},
            on_conflict="key"
        ).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    db       = get_db()
    t        = today()
    week_ago = (date.today() - timedelta(days=7)).isoformat()

    today_pts = sb_rows(
        db.table("patients").select("total_cost,amount_paid").eq("admission_date", t).execute()
    )
    today_sales     = sum(p.get("total_cost") or 0 for p in today_pts)
    today_collected = sum(p.get("amount_paid") or 0 for p in today_pts)

    week_pts   = sb_rows(
        db.table("patients").select("total_cost").gte("admission_date", week_ago).execute()
    )
    week_sales = sum(p.get("total_cost") or 0 for p in week_pts)

    op_costs   = sb_rows(db.table("op_costs").select("amount").execute())
    total_oc   = sum(r.get("amount") or 0 for r in op_costs)
    week_net   = week_sales - total_oc

    pt_debt_rows = sb_rows(db.table("patients").select("total_cost,amount_paid").execute())
    pt_debt = sum(max(0, (p.get("total_cost") or 0) - (p.get("amount_paid") or 0)) for p in pt_debt_rows)

    we_owe_rows = sb_rows(
        db.table("debtors").select("remaining").gt("remaining", 0).execute()
    )
    we_owe = sum(r.get("remaining") or 0 for r in we_owe_rows)

    low_stock_rows = sb_rows(db.table("lenses").select("id,stock,reorder_point").execute())
    low_stock = sum(1 for r in low_stock_rows if (r.get("stock") or 0) <= (r.get("reorder_point") or 5))

    return jsonify({
        "today": {
            "sales": today_sales, "collected": today_collected,
            "patients": len(today_pts),
        },
        "week": {"sales": week_sales, "net": week_net},
        "pt_debt": pt_debt,
        "we_owe": we_owe,
        "low_stock": low_stock,
    })


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/reports", methods=["GET"])
def reports():
    start = request.args.get("start", (date.today() - timedelta(days=7)).isoformat())
    end   = request.args.get("end", today())
    db    = get_db()

    pts = sb_rows(
        db.table("patients").select("*")
          .gte("admission_date", start).lte("admission_date", end)
          .order("admission_date", desc=True).execute()
    )

    total_sales     = sum(p.get("total_cost") or 0 for p in pts)
    total_collected = sum(p.get("amount_paid") or 0 for p in pts)
    total_debt      = sum(max(0, (p.get("total_cost") or 0) - (p.get("amount_paid") or 0)) for p in pts)

    op_costs = sb_rows(db.table("op_costs").select("*").execute())
    op_est   = 0.0
    for r in op_costs:
        amt  = float(r.get("amount") or 0)
        freq = r.get("frequency", "")
        try:
            s = datetime.strptime(start, "%Y-%m-%d")
            e = datetime.strptime(end, "%Y-%m-%d")
            days = max(1, (e - s).days + 1)
        except Exception:
            days = 7
        if freq == "weekly":
            op_est += amt * (days / 7)
        elif freq == "monthly":
            op_est += amt * (days / 30)
        elif freq == "yearly":
            op_est += amt * (days / 365)
        elif freq == "daily":
            op_est += amt * days
        elif freq == "once":
            op_est += amt / 52

    return jsonify({
        "patients": pts,
        "total_sales": total_sales,
        "total_collected": total_collected,
        "total_debt": total_debt,
        "op_est": round(op_est, 2),
        "net": round(total_sales - op_est, 2),
    })


# ══════════════════════════════════════════════════════════════════════════════
# WEEKLY SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/weekly-summary", methods=["GET"])
def weekly_summary():
    week_ago = (date.today() - timedelta(days=7)).isoformat()
    db       = get_db()
    week_pts = sb_rows(
        db.table("patients").select("total_cost").gte("admission_date", week_ago).execute()
    )
    week_sales = sum(p.get("total_cost") or 0 for p in week_pts)

    op_costs = sb_rows(db.table("op_costs").select("amount,frequency").execute())
    op_est = 0.0
    for r in op_costs:
        amt  = float(r.get("amount") or 0)
        freq = r.get("frequency", "")
        if freq == "weekly":
            op_est += amt
        elif freq == "monthly":
            op_est += amt / 4
        elif freq == "yearly":
            op_est += amt / 52
        elif freq == "daily":
            op_est += amt * 7
        elif freq == "once":
            op_est += amt / 52

    return jsonify({"sales": week_sales, "op_est": round(op_est, 2), "net": round(week_sales - op_est, 2)})


# ══════════════════════════════════════════════════════════════════════════════
# LEDGER
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/ledger", methods=["GET"])
def get_ledger():
    rows = sb_rows(
        get_db().table("ledger").select("*").order("date", desc=True).order("id", desc=True).execute()
    )
    return jsonify(rows)


@app.route("/api/ledger", methods=["POST"])
def save_ledger():
    d  = request.json
    db = get_db()
    db.table("ledger").insert({
        "date": d.get("date", date.today().isoformat()),
        "entry_type": d.get("entry_type", "expense"),
        "category": d.get("category", ""),
        "description": d.get("description", ""),
        "total_amount": float(d.get("total_amount", 0)),
        "paid_amount": float(d.get("paid_amount", 0)),
        "is_expense": bool(d.get("is_expense", True)),
        "source_ref": d.get("source_ref", ""),
    }).execute()
    return jsonify({"ok": True})


@app.route("/api/ledger/<int:lid>", methods=["DELETE"])
def delete_ledger(lid):
    get_db().table("ledger").delete().eq("id", lid).execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# CUSTOM SALES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/custom-sales", methods=["GET"])
def get_custom_sales():
    start = request.args.get("start", (date.today() - timedelta(days=30)).isoformat())
    end   = request.args.get("end", today())
    rows  = sb_rows(
        get_db().table("custom_sales").select("*")
          .gte("date", start).lte("date", end)
          .order("date", desc=True).order("id", desc=True).execute()
    )
    return jsonify(rows)


@app.route("/api/custom-sales", methods=["POST"])
def save_custom_sale():
    d         = request.json
    sid       = d.get("id")
    qty       = int(d.get("qty", 1))
    price     = float(d.get("unit_price", 0))
    total     = round(qty * price, 2)
    sale_date = d.get("date", today())
    item_name = (d.get("item_name") or "").strip()
    category  = (d.get("category") or "متنوعة").strip() or "متنوعة"
    notes     = (d.get("notes") or "").strip()
    db        = get_db()

    payload = {
        "date": sale_date, "item_name": item_name, "category": category,
        "qty": qty, "unit_price": price, "total": total, "notes": notes,
    }

    if sid:
        db.table("custom_sales").update(payload).eq("id", sid).execute()
        db.table("ledger").update({
            "date": sale_date,
            "description": f"{item_name} × {qty}",
            "total_amount": total, "paid_amount": total, "category": category,
        }).eq("source_ref", f"custom_sale:{sid}").execute()
    else:
        res = db.table("custom_sales").insert(payload).execute()
        sid = sb_one(res)["id"]
        db.table("ledger").insert({
            "date": sale_date, "entry_type": "income", "category": category,
            "description": f"{item_name} × {qty}",
            "total_amount": total, "paid_amount": total,
            "is_expense": False, "source_ref": f"custom_sale:{sid}",
        }).execute()

    return jsonify({"ok": True, "id": sid})


@app.route("/api/custom-sales/<int:sid>", methods=["DELETE"])
def delete_custom_sale(sid):
    db = get_db()
    db.table("custom_sales").delete().eq("id", sid).execute()
    db.table("ledger").delete().eq("source_ref", f"custom_sale:{sid}").execute()
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
# AI PROXY  (Anthropic API key stays server-side)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/ai", methods=["POST"])
def ai_proxy():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return jsonify({"error": "no_api_key", "message": "ANTHROPIC_API_KEY not set."}), 503

    body    = request.json or {}
    payload = json.dumps({
        "model":      body.get("model", "claude-haiku-4-5-20251001"),
        "max_tokens": body.get("max_tokens", 500),
        "messages":   body.get("messages", []),
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return app.response_class(response=resp.read(), status=resp.status, mimetype="application/json")
    except urllib.error.HTTPError as exc:
        return app.response_class(response=exc.read(), status=exc.code, mimetype="application/json")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Gunicorn / Vercel entry-point ─────────────────────────────────────────────
# Vercel calls this module directly; Gunicorn uses:  gunicorn app:app
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
