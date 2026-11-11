#!/usr/bin/env python3
"""Close the seven historical OFFICE-22c cards; defaults to a read-only dry run."""
import argparse
import datetime as dt
import json
from pathlib import Path
import sqlite3

CODES = ("TASK", "TASK-TZ", "TASK-1.1", "ACC2", "CRITIC-4", "CRITIC-5", "VISUAL-4")
NOTE = "закрыто при чистке доски 22c"


def cleanup(db, apply=False):
    ids = ["bridge-dcm-task-" + code.lower() for code in CODES]
    changes = []
    for tid in ids:
        row = db.execute("SELECT title,status,status_detail FROM tasks WHERE id=?", (tid,)).fetchone()
        if row:
            changes.append(dict(id=tid, title=row[0], before=row[1], after="done"))
    if apply:
        with db:
            db.execute("BEGIN IMMEDIATE")
            for change in changes:
                db.execute("UPDATE tasks SET status='done',status_detail=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (status!='done' OR status_detail IS NOT ?)",
                           (NOTE, change["id"], NOTE))
            # Persist explicit historical closures independently of rotated logs.
            row = db.execute("SELECT value FROM office_bridge_state WHERE key='office22c:closed'").fetchone()
            closed = sorted(set(ids) | set(json.loads(row[0]) if row else []))
            db.execute("INSERT INTO office_bridge_state(key,value) VALUES('office22c:closed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                       (json.dumps(closed),))
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path.home() / "ai-office/data/database.sqlite")
    parser.add_argument("--apply", action="store_true", help="Back up SQLite and apply the cleanup")
    args = parser.parse_args()
    db = sqlite3.connect(f"file:{args.db}?mode={'rw' if args.apply else 'ro'}", uri=True)
    if args.apply:
        backup = args.db.with_name(args.db.name + dt.datetime.now().strftime(".22c-%Y%m%d-%H%M%S.bak"))
        with sqlite3.connect(backup) as target:
            db.backup(target)
        print("Backup:", backup)
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "cards": cleanup(db, args.apply)}, ensure_ascii=False, indent=2))
    db.close()


if __name__ == "__main__":
    main()
