import sqlite3
import sys
from types import SimpleNamespace
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bridge


@pytest.fixture
def office(tmp_path):
    db = sqlite3.connect(tmp_path / 'office.sqlite')
    db.row_factory = sqlite3.Row
    db.executescript('''
    PRAGMA foreign_keys=ON;
    CREATE TABLE agents(id TEXT PRIMARY KEY,name TEXT,emoji TEXT,role TEXT,description TEXT,
      position_x INTEGER,position_y INTEGER,current_status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,description TEXT,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id), title TEXT,description TEXT,status TEXT,
      priority TEXT,assigned_to TEXT REFERENCES agents(id),updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE agent_status_history(id TEXT PRIMARY KEY,agent_id TEXT REFERENCES agents(id),status TEXT,status_text TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,ended_at TEXT);
    CREATE TABLE activity_logs(id TEXT PRIMARY KEY,entity_type TEXT,entity_id TEXT,action TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO agents(id,name) VALUES('vanya','Ванечка'),('tema','Тёма');
    INSERT INTO tasks(id,title,assigned_to) VALUES('legacy-task','Сохранить историю','vanya');
    INSERT INTO agent_status_history(id,agent_id,status,status_text) VALUES('history','vanya','idle','Старый статус');
    ''')
    yield db
    db.close()


@pytest.fixture(autouse=True)
def isolate_routine_sources(monkeypatch, tmp_path):
    """Tick tests never read real profiles, analytics, or provider transcripts."""
    monkeypatch.setattr(bridge, "limits_observer", SimpleNamespace(observe=lambda home, work: {}))
    monkeypatch.setattr(bridge, "REVIEWED_FILE", tmp_path / "REVIEWED.txt")
    observer = bridge.observe_jh
    monkeypatch.setattr(bridge, 'observe_jh', lambda root, procs: observer(
        tmp_path / 'empty-jh' if root == Path.home() / '.job-hunter' else root, procs))
