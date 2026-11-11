#!/usr/bin/env python3
"""Read-only DCM/JH observer. The only writes are to the AI Office database.

Runtime dependencies: Python 3 stdlib, tmux (optional), git (optional).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shlex
import signal
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, replace
from jh_observer import observe as observe_jh
from office_moments import observe as observe_moments
from provider_limits import observer as limits_observer
from office_dcm import observer as dcm_observer

HOME = Path.home()
WORK = HOME / "work"
DEFAULT_DB = HOME / "ai-office/data/database.sqlite"
LOG = logging.getLogger("office-bridge")
REVIEWED_FILE = Path(__file__).with_name("REVIEWED.txt")
REVIEWED_DETAIL = "Принято Яриком"
FRESH_SECONDS = 120
TEAM = {
    "yarik": ("Ярик", "🏗️", "Архитектор и ревьюер", 480, 180),
    "leha": ("Лёха", "💻", "Разработчик", 310, 445),
    "asya": ("Ася", "🔍", "Критик кода и приёмка QA", 140, 310),
    "ivanych": ("Иваныч", "📐", "Нормоконтроль: ГОСТ, ПУЭ, СП", 770, 240),
    "taya": ("Тая", "🎨", "Визуал и оформление документов", 310, 310),
    "sanya": ("Саня", "🧪", "Тестировщик", 480, 310),
    "motya": ("Мотя", "⚙️", "Прогонщик на воркере (регрессия)", 140, 575),
    # Stable database key preserves task assignments and status history.
    "mihalych": ("whoami", "🛡️", "Безопасник", 310, 575),
    "lyuda": ("Люда", "📟", "Диспетчер эксплуатации JH", 750, 500),
    "sharik": ("Шарик", "🐕", "Поиск и отклики (бот job-hunter)", 855, 500),
}
PROJECTS = {"dcm": ("DCM Lab", "Конвейер DCM, ревью и регрессия"),
            "jh": ("job-hunter", "Разработка, тестирование и эксплуатация JH"),
            "office": ("Офис", "Развитие офиса и моста"),
            "other": ("Прочее", "Задания вне известных проектов")}
PROJECT_LABELS = {k: v[0] for k, v in PROJECTS.items()}
SECRET_TITLE = "Очень секретное задание 🤫"
NIGHT_ARCHITECT = "Ярик (ночная смена)"
STAGES = ("FIX-4", "F1A", "F1B", "F1C", "F2", "F3", "ACC")
TASK_RE = re.compile(r"(?<![\w-])(FIX-?\d+|F1[ABC]|F[0-9]+|ACC[0-9]*(?:-[\w]+)?|CRITIC(?:-\d+)?|VISUAL(?:-[\w]+)?|TABLES(?:-[\w]+)?|NORM(?:-[\w]+)?|TESTER(?:-[\w]+)?|MISSION(?:-[\w]+)?|REBRAND-\d+|DOCS-\d+)(?![\w-])", re.I)


def agent_id(key: str) -> str:
    return "bridge-" + key


def office_text(text: str) -> str:
    """Old source logs can still mention the hero by their former display name."""
    return text.replace("Михалыча", "whoami").replace("Михалыч", "whoami").replace("михалыч", "whoami")


def run_readonly(argv: list[str], timeout: int = 5) -> str:
    """Never accepts shell code; all call sites are read-only git/tmux queries."""
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                                env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"}, check=False)
        return result.stdout if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def option(args: list[str], *names: str) -> str:
    for i, arg in enumerate(args):
        for name in names:
            if arg == name and i + 1 < len(args):
                return args[i + 1]
            if arg.startswith(name + "="):
                return arg[len(name) + 1:]
    return ""


def project_for(path: str) -> str | None:
    """Recognize worktrees/sibling DCM repos, without mistaking this bridge for JH."""
    if not path:
        return None
    path = os.path.abspath(os.path.expanduser(path))
    if path == str(HOME / "ai-office") or path.startswith(str(HOME / "ai-office") + "/"):
        return "office"
    if re.match(r"^/mnt/work/(?:jh-[^/]+|job-hunter[^/]*|c14-c15-review|c15-fix-review)(?:/|$)", path):
        return "jh"
    # Worktrees with arbitrary names retain the owning repository in .git.
    for directory in (Path(path), *Path(path).parents):
        gitfile = directory / ".git"
        if gitfile.is_file():
            owner = read_tail(gitfile, 4096)
            if re.search(r"/(?:job-hunter[^/]*|jh-[^/]+)/\.git/worktrees/", owner):
                return "jh"
            break
    root = str(WORK) + "/"
    if not path.startswith(root):
        return None
    first = path[len(root):].split("/", 1)[0]
    if first == "office-bridge":
        return "office"
    if first.startswith("dcm"):
        return "dcm"
    if first.startswith(("job-hunter", "jh-")) or first == "security-audit":
        return "jh"
    return None


def role_for(task: str, model: str = "") -> str | None:
    upper = task.upper()
    if upper.startswith(("MISSION", "TESTER")):
        return "sanya"
    if model.endswith("-astra"):
        if upper.startswith(("TABLES", "NORM")):
            return "ivanych"
        if upper.startswith(("CRITIC", "ACC")):
            return "asya"
        return "asya"  # Astra по умолчанию — Ася (критик/QA/аналитик); Иваныч только TABLES/NORM
    if model.endswith("-terra"):
        return "taya"  # Terra — всегда Тая (визуал, арт-ревью, рисование офиса)
    if model.endswith("-sol"):
        return "leha"
    # pipeline actor inference, where model is not included in the log
    if not model:
        if upper.startswith(("TABLES", "NORM")):
            return "ivanych"
        if upper.startswith(("CRITIC", "ACC")):
            return "asya"
        if upper.startswith("VISUAL"):
            return "taya"
        return "leha"
    return None


@dataclass(frozen=True)
class Assignment:
    agent: str
    project: str
    task: str
    cwd: str
    pid: int = 0
    source: str = ""
    output: str = ""
    logs: tuple[str, ...] = ()
    run_id: str = ""
    external_actor: str = ""
    started_at: float = 0


def parse_codex(command: list[str] | str, cwd: str = "", stdin: str = "") -> Assignment | None:
    args = shlex.split(command) if isinstance(command, str) else command
    if not args:
        return None
    # Accept the node launcher and its native child, never a shell mentioning codex.
    start = next((i for i in range(min(2, len(args)))
                  if Path(args[i]).name == "codex"), None)
    if start is None:
        return None
    args = args[start + 1:]
    if "exec" not in args:  # app-server / interactive clients are not background jobs
        return None
    target = option(args, "-C", "--cd") or cwd
    if not os.path.isabs(target):
        target = os.path.join(cwd, target)
    added = [args[i + 1] for i, a in enumerate(args[:-1]) if a == "--add-dir"]
    added += [a.split("=", 1)[1] for a in args if a.startswith("--add-dir=")]
    output = option(args, "-o", "--output-last-message")
    def absolute(path):
        return os.path.abspath(os.path.join(cwd or target, os.path.expanduser(path))) if path else ""
    project = (project_for(target) or next((p for a in added if (p := project_for(absolute(a)))), None)
               or project_for(absolute(output)) or "other")
    input_file = stdin if stdin and not stdin.startswith(("pipe:", "socket:", "/dev/")) else ""
    if not input_file and output:
        out = Path(absolute(output))
        stem = re.sub(r"(?i)(?:-out|-last)$", "", out.stem)
        candidates = [out.with_name(re.sub(r"(?i)^OUT-", "TASK-", out.stem) + ".md")] if out.stem.upper().startswith("OUT-") else []
        candidates += [out.with_name(stem + "-task.md"), out.with_name(stem + "-prompt.md"),
                       out.with_name("prompt-" + stem + "-task.md"),
                       out.parent.parent / "tasks" / (stem + ".md")]
        input_file = next((str(p) for p in candidates if p != out and p.is_file()), "")
    source = input_file or output
    if not source:
        source = next((a for a in args if re.search(r"(?i)(?:-task|-out)\.md$", a)), "")
    if source:
        task = re.sub(r"(?i)(?:-task|-out)?\.md$", "", Path(source).name)
    else:
        # Unknown stdin pipe contents are deliberately not read (would consume input).
        task = "задание не определено"
    model = option(args, "--model", "-m")
    title, _ = job_text(absolute(input_file), task)
    code = task_code(title)
    if code and not task_code(task):
        task = code
    role = role_for(task, model)
    external = NIGHT_ARCHITECT if "Ты — Ярик в ночную смену" in read_task(Path(absolute(input_file))) else ""
    return Assignment(role or "leha", project, task, target, source=absolute(input_file),
                      output=absolute(output), external_actor=external)


@dataclass(frozen=True)
class Process:
    pid: int
    ppid: int
    args: list[str]
    cwd: str
    stdin: str = ""
    stdout: str = ""
    tty: int = 0
    start_ticks: int = 0
    stderr: str = ""


def processes(proc: Path = Path("/proc")) -> list[Process]:
    result = []
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            args = [p.decode(errors="replace") for p in (entry / "cmdline").read_bytes().split(b"\0") if p]
            if not args:
                continue
            # /proc/PID/stat comm may contain spaces and parentheses.
            stat = (entry / "stat").read_text().rsplit(") ", 1)[1].split()
            if stat[0] == "Z":
                continue
            def link(name: str) -> str:
                try:
                    return os.readlink(entry / name)
                except OSError:
                    return ""
            result.append(Process(int(entry.name), int(stat[1]), args, link("cwd"),
                                  link("fd/0"), link("fd/1"), int(stat[4]), int(stat[19]), link("fd/2")))
        except (OSError, ValueError, IndexError):
            continue  # races with exits / another UID / restricted proc
    return result


def read_tail(path: Path, limit: int = 8192) -> str:
    try:
        if not path.is_file():
            return ""
        with path.open("rb") as stream:
            stream.seek(max(0, path.stat().st_size - limit))
            return stream.read(limit).decode(errors="replace")
    except OSError:
        return ""


def latest(paths) -> Path | None:
    found = []
    for path in paths:
        try:
            if path.is_file():
                found.append((path.stat().st_mtime, str(path), path))
        except OSError:
            continue
    return max(found)[2] if found else None


def transcript_for(cwd: str, args: list[str], claude_root: Path) -> Path | None:
    directory = claude_root / re.sub(r"[^a-zA-Z0-9-]", "-", cwd)
    resume = option(args, "--resume", "-r", "--session-id")
    if resume and (directory / (resume + ".jsonl")).is_file():
        return directory / (resume + ".jsonl")
    if resume:
        # A resumed session can keep its transcript under the original cwd.
        return latest(claude_root.glob("**/" + Path(resume).name + ".jsonl"))
    return latest(directory.glob("*.jsonl"))


def transcript_context(path: Path | None) -> tuple[str | None, str]:
    """Infer the latest project and activity from bounded, complete JSONL records.

    Project names in old context must not beat a newer tool call or user message.
    The process can live in /home/q while its tools operate in either project.
    """
    if path is None:
        return None, "working"
    project = None
    status = None
    for line in reversed(read_tail(path, 65536).splitlines()):
        try:
            record = json.loads(line)
        except (ValueError, TypeError):
            continue  # partial first/last records, including a concurrent append
        if not isinstance(record, dict):
            continue
        message = record.get("message", {})
        if record.get("type") not in ("user", "assistant") or not isinstance(message, dict):
            continue
        content = message.get("content", [])
        if status is None and record.get("type") == "assistant":
            blocks = content if isinstance(content, list) else []
            last = next((block for block in reversed(blocks) if isinstance(block, dict)), {})
            status = "thinking" if last.get("type") == "thinking" else "working"
        if project is None:
            text = json.dumps(content, ensure_ascii=False)
            matches = list(re.finditer(
                r"(?<![\w-])(?:work/dcm[\w-]*|dcm-qa|dcm-local|job-hunter)(?![\w-])", text))
            if matches:
                project = "jh" if matches[-1].group() == "job-hunter" else "dcm"
        if project is not None and status is not None:
            break
    return project, status or "working"


def stamp(path: Path | None) -> str:
    if not path:
        return "нет локального отчёта"
    return dt.datetime.fromtimestamp(path.stat().st_mtime).astimezone().strftime("%d.%m.%Y %H:%M")


def collect_status(now: float | None = None, procs: list[Process] | None = None,
                   work: Path = WORK, claude_root: Path = HOME / ".claude/projects") -> tuple[dict, list[Assignment]]:
    now = time.time() if now is None else now
    procs = processes() if procs is None else procs
    statuses = {key: ("idle", "Нет активного задания") for key in TEAM if key != "sharik"}
    assignments = []
    grouped: dict[str, set[str]] = {}
    seen = set()
    boot = read_tail(Path("/proc/sys/kernel/random/boot_id")).strip()
    try:
        boot_time = time.time() - float(read_tail(Path("/proc/uptime")).split()[0])
    except (ValueError, IndexError):
        boot_time = 0
    ops = run_readonly(["tmux", "list-panes", "-a", "-F",
                         "#{session_name}\t#{pane_pid}\t#{session_activity}\t#{pane_current_path}"])
    ops_pids = {int(row.split("\t")[1]) for row in ops.splitlines()
                if row.startswith("jh-ops\t") and row.split("\t")[1].isdigit()}
    by_pid = {p.pid: p for p in procs}

    def in_ops(p: Process) -> bool:
        visited = set()
        while p.pid not in visited:
            visited.add(p.pid)
            if p.pid in ops_pids:
                return True
            if p.ppid not in by_pid:
                break
            p = by_pid[p.ppid]
        return False

    for p in procs:
        assignment = parse_codex(p.args, p.cwd, p.stdin)
        if assignment:
            root = p
            visited = {p.pid}
            while root.ppid in by_pid and root.ppid not in visited:
                parent = by_pid[root.ppid]
                if not parse_codex(parent.args, parent.cwd, parent.stdin):
                    break
                root = parent
                visited.add(root.pid)
            run_id = f"{boot}:{root.pid}:{root.start_ticks}"
            signature = run_id
            if signature not in seen:
                logs = tuple(dict.fromkeys(path for path in (root.stdout, root.stderr, p.stdout, p.stderr)
                                           if path and os.path.isabs(path) and not path.startswith("/dev/")))
                root_assignment = parse_codex(root.args, root.cwd, root.stdin)
                assignment = root_assignment if root_assignment and root_assignment.source else assignment
                born = boot_time + root.start_ticks / os.sysconf("SC_CLK_TCK") if boot_time and root.start_ticks else 0
                assignment = replace(assignment, pid=root.pid, run_id=run_id, logs=logs, started_at=born)
                assignments.append(assignment)
                seen.add(signature)
            else:
                at = next(i for i, a in enumerate(assignments) if a.run_id == run_id)
                old = assignments[at]
                merged_logs = tuple(dict.fromkeys((*old.logs, *(path for path in (p.stdout, p.stderr)
                                    if path and os.path.isabs(path) and not path.startswith("/dev/")))))
                chosen = assignment if not old.source and assignment.source else old
                assignments[at] = replace(chosen, pid=root.pid, run_id=run_id, logs=merged_logs, started_at=old.started_at)
        if Path(p.args[0]).name == "claude":
            transcript = transcript_for(p.cwd, p.args, claude_root)
            transcript_project, transcript_status = transcript_context(transcript)
            project = transcript_project or project_for(p.cwd)
            is_ops = in_ops(p) or option(p.args, "-n", "--name") == "jh-ops"
            if project and (is_ops or project in ("dcm", "jh")):
                fresh = transcript is not None and 0 <= now - transcript.stat().st_mtime < FRESH_SECONDS
                key = "lyuda" if is_ops else "yarik"
                if fresh:
                    statuses[key] = (transcript_status, f"{PROJECT_LABELS[project]} · " +
                                     ("диспетчер jh-ops" if is_ops else "Claude Code: активная сессия"))
                elif statuses[key][0] == "idle":
                    statuses[key] = ("idle", f"{PROJECT_LABELS[project]} · сессия открыта · последняя запись: {stamp(transcript)}")
        # Check a script token, not arbitrary shell text containing its path.
        script_tokens = [a for a in p.args[:3] if not a.startswith("-")]
        if any(a == str(work / "dcm-qa/worker-run.sh") or
               (a in ("./worker-run.sh", "worker-run.sh") and p.cwd == str(work / "dcm-qa")) for a in script_tokens):
            at = next(i for i, a in enumerate(p.args) if a.endswith("worker-run.sh"))
            command = " ".join(p.args[at + 1:]) or "регрессия"
            tail = read_tail(Path(p.stdout)) if p.stdout and not p.stdout.startswith(("pipe:", "/dev/")) else ""
            steps = re.findall(r"(?im)^.*(?:шаг|step|\[\d+/\d+\]).*$", tail)
            statuses["motya"] = ("working", "DCM Lab · " + command[:240] +
                                  (" · " + steps[-1][:160] if steps else ""))
        if any(a in (str(work / "sec-watch/nightly.sh"), str(work / "sec-watch/weekly.sh")) or
               (a in ("./nightly.sh", "./weekly.sh", "nightly.sh", "weekly.sh") and p.cwd == str(work / "sec-watch"))
               for a in script_tokens):
            statuses["mihalych"] = ("working", "Аудит безопасности · " + Path(p.args[-1]).name)
        if (p.cwd.startswith(str(work / "jh-qa-agent")) and
            (Path(p.args[0]).name in ("python", "python3", "bash") and
             any(Path(a).name in ("tq3_night.py", "nightly-regression.sh", "night-loop.sh", "tq2_pipeline.py")
                 for a in p.args[1:3]))):
            grouped.setdefault("sanya", set()).add("job-hunter · тестер на LLM-ноуте")
    for assignment in assignments:
        if not assignment.external_actor:
            title, _ = job_text(assignment.source, assignment.task)
            grouped.setdefault(assignment.agent, set()).add(
                SECRET_TITLE if title == SECRET_TITLE else
                f"Офис: {title}" if assignment.project == "office" else
                f"{PROJECT_LABELS[assignment.project]} · {assignment.task}")
    for key, texts in grouped.items():
        statuses[key] = ("working", " | ".join(sorted(texts)))
    if statuses["sanya"][0] == "idle":
        # Bounded, known tester logs only. Never infer from general bot log freshness.
        roots = [work / "jh-qa-agent/runs", work / "jh-qa-agent/bench", work / "jh-qa-agent/reports"]
        logs = []
        for root in roots:
            try:
                # newest run dirs; avoid recursively walking all historical evidence
                directories = sorted((p for p in root.iterdir() if p.is_dir()),
                                     key=lambda p: p.stat().st_mtime, reverse=True)[:3]
                logs.extend(root.glob("*.log"))
                logs.extend(root.glob("*.md"))
                for directory in directories:
                    logs.extend(directory.glob("*.log"))
                    logs.extend(directory.glob("*.jsonl"))
                    logs.extend(directory.glob("report.md"))
            except OSError:
                pass
        log = latest(logs)
        fresh = log is not None and 0 <= now - log.stat().st_mtime < FRESH_SECONDS
        statuses["sanya"] = ("working" if fresh else "idle",
                             f"job-hunter · {'свежий лог (косвенно)' if fresh else 'последний лог'}: {stamp(log)}")
    if statuses["mihalych"][0] == "idle":
        report = latest((work / "sec-watch/runs").glob("*/report.md"))
        statuses["mihalych"] = ("idle", "Последний отчёт: " + stamp(report))
    if statuses["lyuda"][0] == "idle" and ops_pids and statuses["lyuda"][1] == "Нет активного задания":
        statuses["lyuda"] = ("idle", "tmux jh-ops открыт · свежая активность не определена")
    return statuses, assignments


@dataclass
class PipelineTask:
    code: str
    status: str = "todo"
    agent: str = "leha"
    priority: str = "medium"
    error: bool = False
    detail: str = "В очереди конвейера"
    commit: str = ""
    title: str = ""
    description: str = ""
    secret: bool = False
    external_actor: str = ""
    lifecycle: bool = False
    queue_name: str = ""
    progress_at: float = 0
    review_source: str = ""


QUEUE_MARKERS = ("[очередь]", "[смета]")


def is_queue_line(line: str, markers=QUEUE_MARKERS) -> bool:
    return any(marker in line for marker in markers)


def task_codes(line: str) -> list[str]:
    # A short Git hash can itself look like F + digits (e.g. f123456).
    # Exclude hashes before identifying stage tokens.
    line = re.sub(r"\b[a-fA-F0-9]{7,40}\b", "", line)
    return list(dict.fromkeys("FIX-" + x[3:] if re.fullmatch(r"FIX\d+", x) else x
                             for x in (m.upper() for m in TASK_RE.findall(line))))


def pipeline_actor(line: str) -> str:
    if "регресс" in line.lower() or "worker" in line.lower():
        return "motya"
    codes = task_codes(line)
    if codes:
        return role_for(codes[0]) or "yarik"
    if "регресс" in line.lower() or "worker" in line.lower():
        return "motya"
    return "yarik"


def parse_pipeline(lines: list[str], planned=STAGES, generic: bool = False,
                   queue_markers=QUEUE_MARKERS) -> dict[str, PipelineTask]:
    result = {code: PipelineTask(code, agent=role_for(code) or "leha") for code in planned}
    current = None
    for line in lines:
        if is_queue_line(line, queue_markers):
            continue  # The queue has its own block/task model below.
        if generic:
            match = re.search(r"(?:старт\s+|конец\s+)([^\s:]+)", line, re.I)
            codes = [match.group(1)] if match else [code for code in result
                    if re.search(r"(?<![\w-])" + re.escape(code) + r"(?![\w-])", line)]
        else:
            codes = task_codes(line)
        lower = line.lower()
        if not codes and ("приёмк" in lower or "приемк" in lower):
            codes = ["ACC"]
        if codes:
            current = codes[0]
        code = codes[0] if codes else current
        error = "стоп" in lower or "красная" in lower or "result false" in lower
        if not code:
            if not error:
                continue
            code = "PIPELINE-STOP"
        if not codes and not error and not any(s in lower for s in ("регресс", "приёмк", "приемк", "коммит")):
            continue
        task = result.setdefault(code, PipelineTask(code, agent=role_for(code) or "leha"))
        if error:
            task.status, task.priority, task.error = "in_progress", "urgent", True
        elif "старт" in lower or "запущен" in lower:
            task.status, task.priority, task.error = "in_progress", "medium", False
        elif "регресс" in lower and "зелёная" in lower:
            task.status, task.priority, task.error = "review", "medium", False
        elif re.search(r"EXIT=(?!0(?:\D|$))\d+", line):
            task.status, task.priority, task.error = "in_progress", "urgent", True
        elif ("в dev" in lower or "into dev" in lower) and any(s in lower for s in ("слит", "merged", "влит")):
            task.status, task.priority, task.error = "done", "medium", False
        elif "ждёт ревью" in lower or "ждет ревью" in lower or "конец" in lower or "коммит" in lower or (code == "ACC" and "приёмка влита" in lower):
            task.status, task.priority, task.error = "review", "medium", False
            if generic and "конец" in lower and re.search(r"EXIT=0(?:\D|$)", line):
                task.status, task.priority, task.error = "done", "medium", False
        task.detail = line.strip()
        commit = re.search(r"(?:коммит|влита)\s+([a-f0-9]{7,40})\b", line, re.I)
        if commit:
            task.commit = commit.group(1).lower()
    return result


def planned_stages(chain: Path) -> tuple[str, ...]:
    text = read_tail(chain, 65536)
    match = re.search(r"for\s+S\s+in\s+([^;\n]+)", text)
    extras = task_codes(match.group(1)) if match else []
    return tuple(dict.fromkeys((*STAGES, *extras)))


def queue_actor(text: str) -> str:
    lower = text.lower()
    if "ночная смена" in lower or "арх_ревью" in lower or "ярик:" in lower:
        return "night"
    if "регресс" in lower or "воркер" in lower:
        return "motya"
    if "критик" in lower or "ася" in lower or "qa-smeta" in lower:
        return "asya"
    if "ревью архитектора" in lower or "одобрено" in lower:
        return "yarik"
    return "leha"


def queue_task_code(assignment: Assignment, tasks: dict) -> str:
    text = assignment.source + " " + assignment.output
    return next((code for code in sorted(tasks, key=len, reverse=True)
                 if re.search(r"(?<![\w-])" + re.escape(code) + r"(?=[-./\s]|$)", text, re.I)), "")


def queue_source(work: Path, root: Path | None = None) -> Path:
    # dcm-queue.sh currently appends [очередь] records to fixes/pipeline.log;
    # support a dedicated journal if the queue is configured to use one later.
    root = root if root is not None else work / "dcm-qa/queue"
    script = read_task(root / "dcm-queue.sh")
    match = re.search(r"(?:^|[;\s])L=([^;\s]+)", script)
    if match:
        configured = match.group(1).strip("\"'")
        if "/dcm-qa/" in configured:
            return work / "dcm-qa" / configured.split("/dcm-qa/", 1)[1]
        if configured.startswith("$Q/"):
            return root / configured[3:]
    return work / "dcm-qa/fixes/pipeline.log"


@dataclass(frozen=True)
class QueueLine:
    path: Path
    log_marker: str = "[очередь]"
    name: str = "Щит"
    log: Path | None = None


def configured_queues(work: Path, config_path: Path | None = None) -> list[QueueLine]:
    """Read the shared office config each tick; retain the single-queue layout."""
    config_path = config_path or Path(os.environ.get(
        "OFFICE_PROJECTS_CONFIG", str(work.parent / "ai-office/config/office-projects.json")))
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        projects = raw if isinstance(raw, list) else raw.get("projects", [])
        project = next((p for p in projects if p.get("id") == "dcm"), {})
    except (OSError, ValueError, TypeError, AttributeError):
        project = {}

    def local_path(value: str) -> Path:
        path = Path(value).expanduser()
        return path if path.is_absolute() else config_path.parent.parent / path

    if isinstance(project.get("queues"), list):
        result, seen = [], set()
        for item in project["queues"]:
            if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not item["path"]:
                continue
            marker, name = item.get("logMarker", "[очередь]"), item.get("name", "Щит")
            if not isinstance(marker, str) or not re.fullmatch(r"\[[^\[\]\r\n]+\]", marker):
                continue
            if not isinstance(name, str) or not name.strip():
                continue
            root = local_path(item["path"])
            if root in seen:
                continue
            seen.add(root)
            journal = local_path(item["log"]) if isinstance(item.get("log"), str) else None
            result.append(QueueLine(root, marker, name.strip(), journal))
        return result
    legacy = project.get("queue")
    if isinstance(legacy, str) and legacy:
        path = local_path(legacy)
        # OFFICE-25/29 used queue as an alias for a pipeline log path.
        if path.suffix == ".log":
            return [QueueLine(work / "dcm-qa/queue", log=path)]
        return [QueueLine(path)]
    return [QueueLine(work / "dcm-qa/queue")]


def queue_log_times(lines: list[str], modified: float) -> list[float]:
    """Date clock-only journal entries backwards, including midnight rollovers."""
    anchor = dt.datetime.fromtimestamp(modified)
    result = []
    for line in reversed(lines):
        iso = re.match(r"^\[?(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?)", line)
        clock = re.match(r"^\[?(\d\d):(\d\d)(?::(\d\d))?\]?\s", line)
        at = modified
        try:
            if iso:
                at = dt.datetime.fromisoformat(iso[1].replace("Z", "+00:00")).timestamp()
                anchor = dt.datetime.fromtimestamp(at)
            elif clock:
                stamp = anchor.replace(hour=int(clock[1]), minute=int(clock[2]),
                                       second=int(clock[3] or 0), microsecond=0)
                if stamp > anchor:
                    stamp -= dt.timedelta(days=1)
                anchor, at = stamp, stamp.timestamp()
        except ValueError:
            pass
        result.append(at)
    return list(reversed(result))


def queue_error(state: str) -> bool:
    lower = re.sub(r"жд[её]т\s+лимит\w*", "", state.lower())
    return any(word in lower for word in ("стоп", "ошибка", "красная", "лимит", "не прошёл", "нарушение"))


def queue_tasks(work: Path, lines: list[str], merge_lines: list[str] = (), *,
                queue: QueueLine | None = None, queue_markers=QUEUE_MARKERS) -> dict[str, PipelineTask]:
    queue = queue or QueueLine(work / "dcm-qa/queue")
    root = queue.path
    journal = queue.log or queue_source(work, root)
    try:
        modified = journal.stat().st_mtime
    except OSError:
        modified = time.time()
    dated_lines = list(zip(lines, queue_log_times(lines, modified)))
    result = {}
    for row in read_task(root / "ORDER").splitlines():
        if row.startswith("#") or len(parts := row.split("|")) != 3:
            continue
        block, code, kind = (part.strip() for part in parts)
        title, description = job_text(str(root / "tasks" / (code + ".md")), code)
        task = PipelineTask(code, agent="asya" if kind == "qa" else "yarik" if kind == "pause" else "leha",
                            title="DCM · " + title, description=description, lifecycle=True, queue_name=queue.name)
        state, signal, signal_at = "", "", 0
        circle = re.escape(code) + r"(?:-FIX)*(?![\w-])"
        for line, at in dated_lines:
            if queue.log_marker not in line:
                continue
            body = line.split(queue.log_marker, 1)[-1].strip()
            if re.match(r"(?:действующий\s+)?архитектор\b", body, re.I):
                continue
            if not re.search(r"(?<![\w-])" + circle, body, re.I):
                continue
            state = body
            recovery = (re.match(r"(?:старт|продолжение)\s+(?:существующей\s+)?" + circle, body, re.I)
                        or re.match(r"коммит\s+[a-f0-9]{7,40}\s+на\s+(?:ветке\s+)?feat/" + circle, body, re.I))
            if queue_error(body) or recovery:
                signal, signal_at = body, at
        state_path = root / "state" / code
        file_state = read_task(state_path).strip()
        try:
            state_at = state_path.stat().st_mtime if file_state else 0
        except OSError:
            state_at = 0
        state = file_state or state
        healthy = bool(re.search(r"в работе|регресс|критик|ночн|ревью|жд[её]т\s+лимит|готово|одобрено", state, re.I)) and not queue_error(state)
        # A normal state newer than the journal error owns the circle. Only an
        # explicit restart/commit clears a journal stop without a fresh state.
        if signal and (not file_state or signal_at >= state_at or (queue_error(signal) and not healthy and not queue_error(state))):
            if queue_error(signal) or not healthy:
                state = signal
            if not queue_error(signal):
                task.progress_at = signal_at
        if healthy and file_state:
            task.progress_at = max(task.progress_at, state_at)
        lower = state.lower()
        closed_by = re.search(r"\bчинит\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b", state, re.I) if lower.startswith("готово") else None
        if closed_by:
            task.status = "done"
        elif lower.startswith("готово"):
            task.status, task.agent = ("done", task.agent) if kind in ("qa", "pause") else ("review", "yarik")
        elif queue_error(state):
            task.status, task.priority, task.error = "in_progress", "urgent", True
        elif "одобрено" in lower:
            task.status = "done" if kind in ("qa", "pause") else "review"
        elif kind == "qa" and ("готово" in lower or "влит" in lower):
            task.status = "done"
        elif "ждёт ревью" in lower or "ждет ревью" in lower or "готово" in lower:
            task.status, task.agent = "review", "yarik"
        elif state:
            task.status = "in_progress"
        actor = queue_actor(state)
        if state and task.status == "in_progress":
            if actor == "night":
                task.external_actor = NIGHT_ARCHITECT
            else:
                task.agent = actor
        stages = "dev → регрессия → критик → ночной архитектор → ждёт ревью Ярика"
        task.detail = f"Блок {block} · {stages} · {state or 'В очереди'}"
        if closed_by:
            task.detail = f"закрыт кругом {closed_by[1].upper()}"
        # Queue state files survive a merge; an explicit journal entry closes it.
        for line in (*lines, *merge_lines):
            if is_queue_line(line, queue_markers) and queue.log_marker not in line:
                continue
            if (re.search(r"(?<![\w-])" + re.escape(code) + r"(?![\w-])", line, re.I)
                    and re.search(r"(?:влит\w*|слит\w*|merged)\s+(?:в|into)\s+dev\b", line, re.I)):
                task.status, task.priority, task.error = "done", "medium", False
                task.detail = line.strip()
        approved = root / "state" / (code + ".approved")
        if approved.is_file():
            task.status, task.priority, task.error, task.detail = "done", "medium", False, REVIEWED_DETAIL
            task.review_source = str(approved)
        if title == SECRET_TITLE:
            task.title, task.description, task.secret = SECRET_TITLE, "", True
            task.detail = "⚠ ошибка" if task.error else "В работе" if state else "В очереди"
        result[code] = task
    return result


def git_evidence(repo: Path, tasks: dict[str, PipelineTask]) -> None:
    """Only query Git; never checkout/fetch/update-index. dev ancestry decides done."""
    merged_log = run_readonly(["git", "-C", str(repo), "log", "dev", "--format=%H%x09%s", "-n", "2000"])
    merged_commits = {}
    for line in merged_log.splitlines():
        if "\t" in line:
            commit, subject = line.split("\t", 1)
            merged_commits[commit] = subject
    merged_codes = {code for subject in merged_commits.values() for code in task_codes(subject)}
    branches = run_readonly(["git", "-C", str(repo), "for-each-ref", "--format=%(refname:short)", "refs/heads/feat/"])
    for branch in branches.splitlines():
        for code in task_codes(branch.removeprefix("feat/").upper()):
            if code in tasks and tasks[code].status == "todo":
                tasks[code].status = "review"
                tasks[code].detail = f"Ветка {branch} ждёт ревью; слияние в dev не подтверждено"
    for code, task in tasks.items():
        # A named latest commit wins over an older commit of the same stage.
        # ACC has no ACC marker in its subject, so use the pipeline's logged hash.
        if task.commit:
            # rev-parse resolves short hashes; merge-base checks any depth, without
            # depending on a bounded log window or changing the repository.
            commit = run_readonly(["git", "-C", str(repo), "rev-parse", "--verify", task.commit + "^{commit}"]).strip()
            ancestor = run_readonly(["git", "-C", str(repo), "merge-base", "dev", commit]).strip() if commit else ""
            is_merged = bool(commit) and ancestor == commit
        else:
            is_merged = code in merged_codes
        if is_merged and not task.error:
            task.status = "done"
            task.detail = "Коммит этапа присутствует в истории dev"


def task_log_evidence(work: Path, tasks: dict[str, PipelineTask]) -> None:
    """Finished specialist jobs may precede their next pipeline.log entry."""
    for code, task in tasks.items():
        if task.status not in ("todo", "in_progress") or task.error:
            continue
        path = (work / "dcm-qa/acceptance-ws/ACC.log" if code == "ACC" else
                work / "dcm-qa/fixes" / (code + ".log"))
        tail = read_tail(path, 4096).rstrip()
        match = re.search(r"(?:^|\n)EXIT=(\d+)$", tail)
        if match:
            if match.group(1) == "0":
                task.status = "review"
                task.detail = f"{code}: EXIT=0 · задание завершено, ожидает ревью/слияния в dev"
            else:
                task.status, task.priority, task.error = "in_progress", "urgent", True
                task.detail = f"{code}: EXIT={match.group(1)} · ошибка выполнения"
        elif task.status == "todo":
            report = (work / "dcm-qa/acceptance-ws/ACC-out.md" if code == "ACC" else
                      work / "dcm-qa/fixes" / (code + "-out.md"))
            if report.is_file() and report.stat().st_size:
                task.status = "review"
                task.detail = f"{code}: отчёт исполнителя готов, ожидает ревью/слияния в dev"


def connect(db_path: Path) -> sqlite3.Connection:
    # mode=rw prevents accidentally creating an empty office at a misspelled path.
    db = sqlite3.connect(db_path.resolve().as_uri() + "?mode=rw", uri=True, timeout=10)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=10000")
    db.row_factory = sqlite3.Row
    return db


def get_state(db: sqlite3.Connection, key: str, default=None):
    row = db.execute("SELECT value FROM office_bridge_state WHERE key=?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def set_state(db: sqlite3.Connection, key: str, value) -> None:
    db.execute("INSERT INTO office_bridge_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, json.dumps(value, ensure_ascii=False)))


def bootstrap(db: sqlite3.Connection) -> None:
    """Idempotent, transactional additive migration + one-time legacy snapshot."""
    with db:
        db.execute("BEGIN IMMEDIATE")
        if "archived" not in {row[1] for row in db.execute("PRAGMA table_info(agents)")}:
            db.execute("ALTER TABLE agents ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
        db.execute("CREATE TABLE IF NOT EXISTS office_bridge_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS office_bridge_legacy(agent_id TEXT PRIMARY KEY REFERENCES agents(id), was_archived INTEGER NOT NULL)")
        if not get_state(db, "initialized", False):
            ids = tuple(agent_id(key) for key in TEAM)
            marks = ",".join("?" for _ in ids)
            db.execute(f"INSERT OR IGNORE INTO office_bridge_legacy SELECT id, archived FROM agents WHERE id NOT IN ({marks})", ids)
            db.execute("UPDATE agents SET archived=1 WHERE id IN (SELECT agent_id FROM office_bridge_legacy)")
            set_state(db, "initialized", True)
            set_state(db, "legacy_restored", False)
        for table in ("tasks", "projects"):
            if "archived" not in {row[1] for row in db.execute(f"PRAGMA table_info({table})")}:
                db.execute(f"ALTER TABLE {table} ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
            db.execute(f"CREATE TABLE IF NOT EXISTS office_bridge_legacy_{table}(id TEXT PRIMARY KEY REFERENCES {table}(id), was_archived INTEGER NOT NULL)")
        if "status_detail" not in {row[1] for row in db.execute("PRAGMA table_info(tasks)")}:
            db.execute("ALTER TABLE tasks ADD COLUMN status_detail TEXT")
        if not get_state(db, "legacy_content_initialized", False):
            db.execute("INSERT OR IGNORE INTO office_bridge_legacy_tasks SELECT id,archived FROM tasks WHERE id NOT LIKE 'bridge-%'")
            db.execute("INSERT OR IGNORE INTO office_bridge_legacy_projects SELECT id,archived FROM projects WHERE id NOT LIKE 'bridge-%' AND name NOT IN ('DCM Lab','job-hunter')")
            if not get_state(db, "legacy_restored", False):
                for table in ("tasks", "projects"):
                    db.execute(f"UPDATE {table} SET archived=1 WHERE id IN (SELECT id FROM office_bridge_legacy_{table})")
            set_state(db, "legacy_content_initialized", True)
        if "archived" not in {row[1] for row in db.execute("PRAGMA table_info(activity_logs)")}:
            db.execute("ALTER TABLE activity_logs ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
        db.execute("CREATE TABLE IF NOT EXISTS office_bridge_legacy_activity(id TEXT PRIMARY KEY REFERENCES activity_logs(id), was_archived INTEGER NOT NULL)")
        if not get_state(db, "legacy_activity_initialized", False):
            db.execute("INSERT OR IGNORE INTO office_bridge_legacy_activity SELECT id,archived FROM activity_logs WHERE id NOT LIKE 'bridge-event-%'")
            if not get_state(db, "legacy_restored", False):
                db.execute("UPDATE activity_logs SET archived=1 WHERE id IN (SELECT id FROM office_bridge_legacy_activity)")
            set_state(db, "legacy_activity_initialized", True)
        for key, (name, emoji, role, x, y) in TEAM.items():
            db.execute("""INSERT INTO agents(id,name,emoji,role,description,position_x,position_y,current_status,archived)
                          VALUES(?,?,?,?,?,?,?,'idle',0) ON CONFLICT(id) DO UPDATE SET
                          name=excluded.name,emoji=excluded.emoji,role=excluded.role,description=excluded.description""",
                       (agent_id(key), name, emoji, role, "Проект job-hunter · дежурный админ Люда" if key == "sharik" else "Общая команда DCM Lab и job-hunter", x, y))
        if not get_state(db, "office18_whoami", False):
            # JSON may use escaped Unicode; decode before replacing display text.
            for row_id, details in db.execute("SELECT id,details FROM activity_logs WHERE details IS NOT NULL").fetchall():
                try:
                    decoded = json.dumps(json.loads(details), ensure_ascii=False)
                except (ValueError, TypeError):
                    decoded = details
                updated = office_text(decoded)
                if updated != decoded:
                    db.execute("UPDATE activity_logs SET details=? WHERE id=?", (updated, row_id))
            for table, fields in (("tasks", ("title", "description", "status_detail")),
                                  ("agent_status_history", ("status_text",))):
                for field in fields:
                    for row_id, text in db.execute(f"SELECT id,{field} FROM {table} WHERE {field} IS NOT NULL").fetchall():
                        updated = office_text(text)
                        if updated != text:
                            db.execute(f"UPDATE {table} SET {field}=? WHERE id=?", (updated, row_id))
            set_state(db, "office18_whoami", True)
        for key, (name, description) in PROJECTS.items():
            existing = db.execute("SELECT id FROM projects WHERE name=? ORDER BY created_at LIMIT 1", (name,)).fetchone()
            pid = existing[0] if existing else "bridge-" + key
            db.execute("INSERT OR IGNORE INTO projects(id,name,description,status) VALUES(?,?,?,'active')", (pid, name, description))
            set_state(db, "project:" + key, pid)


def legacy_visibility(db: sqlite3.Connection, restore: bool) -> int:
    with db:
        cursor = db.execute("""UPDATE agents SET archived=(SELECT was_archived FROM office_bridge_legacy WHERE agent_id=agents.id)
                              WHERE id IN (SELECT agent_id FROM office_bridge_legacy)""" if restore else
                            "UPDATE agents SET archived=1 WHERE id IN (SELECT agent_id FROM office_bridge_legacy)")
        count = cursor.rowcount
        for table in ("tasks", "projects"):
            db.execute(f"UPDATE {table} SET archived=(SELECT was_archived FROM office_bridge_legacy_{table} WHERE id={table}.id) WHERE id IN (SELECT id FROM office_bridge_legacy_{table})" if restore else
                       f"UPDATE {table} SET archived=1 WHERE id IN (SELECT id FROM office_bridge_legacy_{table})")
        db.execute("UPDATE activity_logs SET archived=(SELECT was_archived FROM office_bridge_legacy_activity WHERE id=activity_logs.id) WHERE id IN (SELECT id FROM office_bridge_legacy_activity)" if restore else
                   "UPDATE activity_logs SET archived=1 WHERE id IN (SELECT id FROM office_bridge_legacy_activity)")
        set_state(db, "legacy_restored", restore)
    return count


def pipeline_lines(path: Path) -> tuple[list[str], list[int], dict]:
    """Read a stable snapshot, excluding incomplete final lines; offsets are bytes."""
    try:
        with path.open("rb") as stream:
            stat = os.fstat(stream.fileno())
            data = stream.read(stat.st_size)
        lines, offsets, offset = [], [], 0
        for raw in data.splitlines(keepends=True):
            offset += len(raw)
            if not raw.endswith(b"\n"):
                break
            lines.append(raw.decode(errors="replace").rstrip("\r\n"))
            offsets.append(offset)
        return lines, offsets, {"inode": stat.st_ino, "device": stat.st_dev,
                                "size": offsets[-1] if offsets else 0,
                                "prefix": hashlib.sha256(data[:min(256, offsets[-1] if offsets else 0)]).hexdigest()}
    except FileNotFoundError:
        return [], [], {}


def sync(db: sqlite3.Connection, statuses: dict, pipeline: dict[str, PipelineTask],
         lines: list[str], offsets: list[int], identity: dict, source: Path,
         project: str = "dcm", jobs: dict | None = None, cursor_key: str = "",
         reviewed: dict | None = None, queue_markers=QUEUE_MARKERS,
         approvals: dict | None = None) -> dict:
    counts = {"statuses": 0, "tasks": 0, "events": 0}
    with db:
        db.execute("BEGIN IMMEDIATE")
        for key, (status, text) in statuses.items():
            text = office_text(text)
            aid = agent_id(key)
            row = db.execute("SELECT status,status_text FROM agent_status_history WHERE agent_id=? AND ended_at IS NULL ORDER BY rowid DESC LIMIT 1", (aid,)).fetchone()
            if row and tuple(row) == (status, text):
                continue
            db.execute("UPDATE agents SET current_status=? WHERE id=?", (status, aid))
            db.execute("UPDATE agent_status_history SET ended_at=CURRENT_TIMESTAMP WHERE agent_id=? AND ended_at IS NULL", (aid,))
            history_id = "bridge-status-" + os.urandom(12).hex()
            db.execute("INSERT INTO agent_status_history(id,agent_id,status,status_text) VALUES(?,?,?,?)", (history_id, aid, status, text))
            counts["statuses"] += 1
        for code, task in pipeline.items():
            tid = f"bridge-{project}-task-" + code.lower()
            if tid in get_state(db, "office22c:closed", []):
                continue  # Historical logs cannot resurrect the cleaned cards.
            review_source = task.review_source or review_match(approvals or {}, code, tid, task.title)
            accepted = Path(review_source).stem if review_source else review_match(reviewed or {}, code, tid, task.title)
            if accepted:
                task.status, task.priority, task.error, task.detail = "done", "medium", False, REVIEWED_DETAIL
            title = ("⚠ " if task.error else "") + (task.title or ("DCM · " if project == "dcm" else "JH · ") + code)
            if task.queue_name and not task.secret:
                title = title.replace("DCM · ", f"DCM · {task.queue_name} · ", 1)
            old = db.execute("SELECT title,description,status,priority,assigned_to,status_detail FROM tasks WHERE id=?", (tid,)).fetchone()
            # Log rotation or a missing completion marker is absence of evidence,
            # not a new queue transition. Preserve an already observed work/review
            # state until a start, error, or merge gives a positive new signal.
            preserve = old and task.status == "todo" and old["status"] in ("in_progress", "review", "done")
            if preserve:
                task.status, task.priority = old["status"], old["priority"]
                title = (("⚠ " if task.priority == "urgent" else "") + title) if task.queue_name else old["title"]
                task.detail = old["status_detail"] or old["description"] or task.detail
            description = task.description or (old["description"] if old else "") or task.detail
            if task.secret:
                title, description = SECRET_TITLE, ""
            values = (office_text(title), office_text(description), task.status, task.priority,
                      old["assigned_to"] if preserve else None if task.external_actor else agent_id(task.agent), office_text(task.detail))
            if old and tuple(old) == values:
                continue
            db.execute("""INSERT INTO tasks(id,project_id,title,description,status,priority,assigned_to,status_detail)
                          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,
                          description=excluded.description,status=excluded.status,priority=excluded.priority,
                          assigned_to=excluded.assigned_to,status_detail=excluded.status_detail,updated_at=CURRENT_TIMESTAMP""",
                       (tid, get_state(db, "project:" + project), *values))
            counts["tasks"] += 1
            if accepted and (not old or old["status"] != "done" or old["status_detail"] != REVIEWED_DETAIL):
                review_event(db, tid, project, accepted, review_source or "REVIEWED.txt")
                counts["events"] += 1
            # Source-level run IDs and task state make transitions durable and
            # idempotent, including a restart between process start and exit.
            transition = ("ошибка" if task.error else "старт" if task.status == "in_progress" else
                          "завершение" if task.status in ("done", "review") else "")
            if not accepted and task.lifecycle and transition and (not old or (old["status"], old["priority"], old["assigned_to"]) !=
                               (task.status, task.priority, values[4])):
                actor = task.external_actor or TEAM[task.agent][0]
                aid = "bridge-external-night" if task.external_actor else agent_id(task.agent)
                message = f"{transition.capitalize()}: {title}"
                if task.error and not task.secret:
                    message += " · " + task.detail
                details = json.dumps({"agentId": aid, "agentName": actor, "message": message,
                                      "projectId": get_state(db, "project:" + project),
                                      "source": PROJECT_LABELS[project], "taskId": tid}, ensure_ascii=False)
                db.execute("INSERT INTO activity_logs(id,entity_type,entity_id,action,details) VALUES(?,'agent',?,'pipeline',?)",
                           ("bridge-event-" + os.urandom(16).hex(), aid, details))
                counts["events"] += 1
        if jobs is not None:
            set_state(db, project + ":jobs", jobs)
        if identity:
            state_key = cursor_key or ("pipeline" if project == "dcm" else "pipeline:" + project)
            previous = get_state(db, state_key, {})
            # Prefix check handles truncate+rewrite with same inode, without treating
            # normal append to a short file as rotation (compare old committed bytes).
            same = previous.get("inode") == identity["inode"] and previous.get("device") == identity["device"] and previous.get("size", 0) <= identity["size"]
            if same and previous.get("size", 0):
                try:
                    with source.open("rb") as stream:
                        prefix = stream.read(min(256, previous["size"]))
                    same = hashlib.sha256(prefix).hexdigest() == previous.get("prefix")
                except OSError:
                    same = False
            after = previous.get("size", 0) if same else 0
            generation = previous.get("generation", 0) + (0 if same else 1)
            for line, end in zip(lines, offsets):
                if end <= after:
                    continue
                key = queue_actor(line) if is_queue_line(line, queue_markers) else pipeline_actor(line)
                aid = "bridge-external-night" if key == "night" else agent_id(key)
                eid = "bridge-event-" + hashlib.sha256(f"{identity['device']}:{identity['inode']}:{generation}:{end}:{line}".encode()).hexdigest()[:32]
                details = json.dumps({"agentId": aid, "agentName": NIGHT_ARCHITECT if key == "night" else TEAM[key][0], "message": office_text(line),
                                      "source": f"{PROJECT_LABELS[project]} pipeline.log", "projectId": get_state(db, "project:" + project)}, ensure_ascii=False)
                cursor = db.execute("INSERT OR IGNORE INTO activity_logs(id,entity_type,entity_id,action,details) VALUES(?,'agent',?,'pipeline',?)", (eid, aid, details))
                counts["events"] += cursor.rowcount
            set_state(db, state_key, {**identity, "generation": generation})
    return counts


def notify(ws_url: str, counts: dict) -> None:
    for kind, count in counts.items():
        if not count:
            continue
        event = {"type": {"statuses": "agents:refresh", "tasks": "tasks:refresh", "events": "activity:new"}[kind]}
        request = urllib.request.Request(ws_url, data=json.dumps(event).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                response.read(512)
        except (OSError, urllib.error.URLError):
            LOG.debug("WS unavailable; database already committed")


def read_task(path: Path) -> str:
    try:
        with path.open() as stream:
            return stream.read(65536)
    except (OSError, UnicodeError):
        return ""


def describe_pipeline(work: Path, tasks: dict[str, PipelineTask]) -> None:
    # Small local files are reread each tick, including after atomic replacement.
    root = work / "dcm-qa/fixes"
    try:
        titles = json.loads(read_task(root / "board-titles.json"))
        titles = titles if isinstance(titles, dict) else {}
    except ValueError:
        titles = {}
    for code, task in tasks.items():
        title = titles.get(code)
        if isinstance(title, str) and title.strip():
            task.description = " ".join(title.split())
            continue
        match = re.search(r"^#[ \t]+Задание[^\n:]*:[ \t]*([^\n]+)",
                          read_task(root / (code + "-task.md")), re.M)
        if match:
            task.description = match.group(1).strip()


def task_code(title: str) -> str:
    """A task filename such as TASK.md is never itself a useful task code."""
    match = re.search(r"(?<![\w-])(?:OFFICE-\d+[a-z]?|SPEC-\d+|(?:JH[ ·:—-]+)?B\d+[a-z]?|(?:QA-)?SMETA-\d+(?:-FIX)?|"
                      r"FIX-\d+|F\d+[ABC]?|ACC\d*|(?:CRITIC|VISUAL|TABLES|NORM|MISSION|TESTER|REBRAND|DOCS)-[\w.]+)(?![\w-])",
                      title, re.I)
    return re.sub(r"^JH[ ·:—-]+", "", match.group(), flags=re.I) if match else ""


def secret_task(text: str) -> bool:
    heading = re.search(r"(?m)^#\s+(.+)", text)
    return bool((heading and re.search(r"очень\s+секретное\s+задание|сюрприз[^\n]*Марин", heading[1], re.I)) or
                re.search(r"(?im)^(?:#{1,6}\s+|(?:пометка|режим|тип)\s*:\s*|\*{0,2})(?:это\s+)?сюрприз\s+для\s+Марины", text))


def read_reviewed() -> dict[str, str]:
    return {code.casefold(): code for line in read_task(REVIEWED_FILE).splitlines()
            if (code := line.split("#", 1)[0].strip())}


def review_match(reviewed: dict, code: str, tid: str, title: str) -> str:
    return next((reviewed[key.casefold()] for key in (code, tid, task_code(title))
                 if key.casefold() in reviewed), "")


def review_event(db: sqlite3.Connection, tid: str, project: str, code: str, source: str = "REVIEWED.txt") -> None:
    aid = agent_id("yarik")
    details = json.dumps({"agentId": aid, "agentName": TEAM["yarik"][0],
                          "message": f"Ярик принял ревью: {code}", "taskId": tid,
                          "projectId": get_state(db, "project:" + project),
                          "source": source}, ensure_ascii=False)
    db.execute("INSERT INTO activity_logs(id,entity_type,entity_id,action,details) VALUES(?,'agent',?,'pipeline',?)",
               ("bridge-event-" + os.urandom(16).hex(), aid, details))


def sync_stored_reviews(db: sqlite3.Connection, reviewed: dict, approvals: dict | None = None) -> dict:
    """Also accept stored cards whose process/journal is no longer available."""
    counts = {"statuses": 0, "tasks": 0, "events": 0}
    with db:
        for row in db.execute("SELECT id,title,status,status_detail,project_id FROM tasks WHERE archived=0").fetchall():
            tid = row["id"]
            code = re.sub(r"^bridge-[^-]+-task-", "", tid)
            source = review_match(approvals or {}, code, tid, row["title"] or "") if row["project_id"] == get_state(db, "project:dcm") else ""
            accepted = Path(source).stem if source else review_match(reviewed, code, tid, row["title"] or "")
            if not accepted or (row["status"] == "done" and row["status_detail"] == REVIEWED_DETAIL):
                continue
            db.execute("UPDATE tasks SET status='done', priority='medium', status_detail=?, title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                       (REVIEWED_DETAIL, (row["title"] or "").removeprefix("⚠ "), tid))
            project = next((p for p in PROJECTS if get_state(db, "project:" + p) == row["project_id"]), "other")
            review_event(db, tid, project, accepted, source or "REVIEWED.txt")
            counts["tasks"] += 1
            counts["events"] += 1
    return counts


def job_text(source: str, fallback: str) -> tuple[str, str]:
    text = read_task(Path(source)) if source else ""
    if secret_task(text):
        return SECRET_TITLE, ""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        match = re.match(r"^#\s+(.+)", line)
        if match:
            description = next((line.strip() for line in lines[i + 1:]
                                if line.strip() and not re.match(r"^(?:#+\s|---+$|```|<!--)", line.strip())), "")
            return match.group(1).strip(), description
    for line in lines:
        if task_code(line) and re.match(r"^[A-Z][\w-]*\s+[—:·-]\s+", line, re.I):
            return line.strip()[:240], ""
    # Don't display generic TASK / TASK-TZ names. A meaningful heading wins.
    return ("Задание Codex" if re.match(r"(?i)^TASK(?:[-.]|$)", fallback) else fallback), ""


def job_result(job: dict) -> tuple[bool, str]:
    tails = [read_tail(Path(path), 16384) for path in job.get("logs", [])]
    # Every fd can be a separate file. An error in stderr must not disappear
    # just because stdout was modified more recently.
    results = []
    for tail in tails:
        events = [(m.start(), m.group(1) == "0", f"EXIT={m.group(1)}")
                  for m in re.finditer(r"(?m)^EXIT=(\d+)\s*$", tail)]
        events += [(m.start(), False, "ошибка в последнем логе") for m in re.finditer(
            r'(?im)^(?:error(?:\s*:|\s|$)|fatal:|traceback \(most recent call last\))|"type"\s*:\s*"(?:error|turn.failed)"', tail)]
        events += [(m.start(), False, "лимит Codex") for m in re.finditer(
            r"(?im)^.*(?:usage limit|rate limit reached|you.ve hit your|quota exceeded|429 Too Many).*$", tail)]
        # Command failures inside a transcript are not a failed Codex turn when
        # a later final answer completed successfully. Separate stderr still wins.
        events += [(m.start(), True, "ответ Codex готов") for m in re.finditer(
            r'(?m)^codex\r?\n(?=\S)|"type"\s*:\s*"turn.completed"', tail)]
        if events:
            results.append(max(events)[1:])
    failure = next((detail for ok, detail in results if not ok), "")
    if failure:
        return False, "Процесс завершён · " + failure
    output = read_task(Path(job["output"])) if job.get("output") else ""
    if not output.strip():
        return False, "Процесс завершён · выходной файл отсутствует или пуст"
    if re.match(r"(?i)\s*(?:you.ve hit your|usage limit|rate limit reached|quota exceeded|429 Too Many)", output):
        return False, "Процесс завершён · лимит Codex"
    return True, "Процесс завершён · " + ("EXIT=0" if results else "отчёт готов")


def process_tasks(db: sqlite3.Connection, assignments: list[Assignment],
                  pipeline: dict[str, PipelineTask], project: str) -> tuple[dict[str, PipelineTask], dict]:
    jobs = get_state(db, project + ":jobs", {})
    live = set()
    closed = get_state(db, "office22c:closed", [])
    for assignment in assignments:
        if assignment.project != project:
            continue
        key = "run-" + hashlib.sha256(assignment.run_id.encode()).hexdigest()[:24]
        live.add(key)
        title, description = job_text(assignment.source, assignment.task)
        secret = title == SECRET_TITLE
        code = task_code(assignment.task) or task_code(title)
        if code and project in ("jh", "dcm") and not secret:
            title = re.sub(r"^Задание\s+", "", title, flags=re.I)
            prefix = "JH" if project == "jh" else "DCM"
            if not re.search(r"(?<![\w-])" + re.escape(code) + r"(?![\w-])", title, re.I):
                title = code + " — " + title
            if not title.startswith(prefix + " · "):
                title = prefix + " · " + title
        task_key = key
        # Pipeline and queue cards represent a whole task, rather than each
        # substep. Keep the run's identity separately for completion tracking.
        queue_code = queue_task_code(assignment, pipeline)
        stage_code = code.upper() if code else ""
        if not secret and project == "dcm":
            candidate = queue_code or stage_code
            if candidate in pipeline and f"bridge-dcm-task-{candidate.lower()}" not in closed:
                task_key = candidate
        previous = jobs.get(key, {})
        jobs[key] = dict(title=title, description=description, agent=assignment.agent,
                         source=assignment.source, output=assignment.output, logs=list(assignment.logs),
                         active=True, task_key=task_key, secret=secret, external_actor=assignment.external_actor,
                         started_at=assignment.started_at,
                         review=(project == "office" or (project == "dcm" and assignment.agent == "leha" and
                                 bool(re.match(r"(?:F\d|FIX-|SMETA-)", code, re.I)))) and bool(code) and not assignment.external_actor,
                         evidence_before=previous.get("evidence_before", pipeline[task_key].detail if task_key in pipeline else ""),
                         output_before=previous.get("output_before", output_stamp(assignment.output)))
    tasks = dict(pipeline)
    for key, job in jobs.items():
        target = job.get("task_key", key)
        # Older completed runs cannot override a newer live run of the same stage.
        if key not in live and any(jobs[k].get("task_key", k) == target for k in live):
            if job.get("active"):
                job["result_ok"], job["result_detail"] = finished_job_result(job)
                job["active"] = False
            continue
        task = PipelineTask(target, lifecycle=True)
        task.title, task.description, task.agent = job["title"], job["description"], job["agent"]
        task.secret, task.external_actor = job.get("secret", False), job.get("external_actor", "")
        if key in live:
            task.status = "in_progress"
            task.detail = "В работе · процесс Codex запущен"
        else:
            evidence = [output_stamp(path) for path in [*job.get("logs", []), job.get("output", "")]]
            if job.get("active"):
                job["result_ok"], job["result_detail"] = finished_job_result(job)
                job["result_evidence"] = evidence
                job["active"] = False
                job["finished_at"] = time.time()
            elif not job.get("result_ok") and (evidence != job.get("result_evidence") or time.time() - job.get("finished_at", 0) < 60):
                # The shell writes EXIT just after the native process vanishes.
                # Allow that evidence to settle, but never borrow a later run's
                # output when the launcher reuses the same file.
                later_keys = list(jobs)[list(jobs).index(key) + 1:]
                reused = any(jobs[k].get("output") == job.get("output") for k in later_keys)
                if not reused:
                    job["result_ok"], job["result_detail"] = finished_job_result(job)
                    job["result_evidence"] = evidence
            ok, detail = job["result_ok"], job["result_detail"]
            task.status, task.priority, task.error = ("review" if job.get("review") else "done", "medium", False) if ok else ("in_progress", "urgent", True)
            task.detail = ("⚠ ошибка · " if not ok else "") + detail + (" · ждёт ревью Ярика" if ok and job.get("review") else "")
        if task.secret:
            task.detail = "В работе" if key in live else "⚠ ошибка" if task.error else "Готово"
        existing = pipeline.get(target)
        # A queue card represents the whole circle. Its state and journal own
        # every stage (and any error); a Codex substep only updates job history.
        if existing and (existing.queue_name or existing.detail.startswith("Блок ")):
            continue
        if existing and not job.get("active"):
            # Pipeline completion evidence still owns the next stage.
            changed = existing.detail != job.get("evidence_before", "")
            if existing.status == "done" or (existing.status == "review" and (changed or existing.lifecycle)):
                continue
        if existing and target in pipeline:
            task.queue_name = existing.queue_name
            task.review_source = existing.review_source
            task.title = existing.title or task.title
            task.description = existing.description or task.description
            if "Блок " in existing.detail:
                task.detail = existing.detail
        tasks[target] = task
    # Keep historical attempts visible, but close a failed attempt once a later
    # run of the same input/output succeeds. A different SPEC module is distinct.
    ordered = sorted(jobs, key=lambda key: jobs[key].get("started_at", 0))
    latest_target = {jobs[key].get("task_key", key): key for key in ordered}
    for i, key in enumerate(ordered):
        job = jobs[key]
        target = job.get("task_key", key)
        if (latest_target[target] != key or job.get("active") or job.get("result_ok")
                or target not in tasks or not tasks[target].error):
            continue
        if tasks[target].queue_name or tasks[target].detail.startswith("Блок "):
            continue  # A successful process retry cannot clear a queue error.
        retry = next((jobs[k] for k in ordered[i + 1:]
                      if not jobs[k].get("active") and jobs[k].get("result_ok")
                      and job.get("source") and job.get("output")
                      and (jobs[k].get("source"), jobs[k].get("output")) == (job["source"], job["output"])), None)
        if retry:
            task = tasks[target]
            task.status, task.priority, task.error = "done", "medium", False
            task.detail = "Завершено повторным запуском"
    return tasks, jobs


def output_stamp(path: str):
    if not path:
        return None
    try:
        stat = Path(path).stat()
        return [stat.st_mtime_ns, stat.st_size]
    except OSError:
        return None


def finished_job_result(job: dict) -> tuple[bool, str]:
    ok, detail = job_result(job)
    if ok:
        current = output_stamp(job["output"])
        if job.get("started_at"):
            stale = current is None or current[0] / 1e9 < job["started_at"] - 1
        else:
            stale = job.get("output_before") and current == job["output_before"] and "EXIT=0" not in detail
        if stale:
            return False, "Процесс завершён · выходной файл не обновлён"
    return ok, detail


def jh_tasks(db: sqlite3.Connection, assignments: list[Assignment],
             pipeline: dict[str, PipelineTask]) -> tuple[dict[str, PipelineTask], dict]:
    return process_tasks(db, assignments, pipeline, "jh")


_moments_started = False


def sync_routine(db: sqlite3.Connection, root: Path, procs: list[Process]) -> dict:
    global _moments_started
    status, events = observe_jh(root, procs)
    counts = sync(db, {"sharik": status}, {}, [], [], {}, root, project="jh")
    with db:
        moments_state, moments_public = observe_moments(root, get_state(db, 'office12:observer'), Path(__file__).with_name('marina.json'), baseline=not _moments_started)
        _moments_started = True
        set_state(db, 'office12:observer', moments_state)
        set_state(db, 'office12:public', moments_public)
        for token, message, when in events:
            details = json.dumps({"agentId": agent_id("sharik"), "agentName": "Шарик",
                                  "message": message, "source": "Плановый прогон job-hunter",
                                  "projectId": get_state(db, "project:jh")}, ensure_ascii=False)
            cursor = db.execute("""INSERT INTO activity_logs(id,entity_type,entity_id,action,details,created_at)
                                   VALUES(?,'agent',?,'pipeline',?,?) ON CONFLICT(id) DO UPDATE SET details=excluded.details
                                   WHERE activity_logs.details != excluded.details""",
                                ("bridge-event-jh-" + token, agent_id("sharik"), details, when))
            counts["events"] += cursor.rowcount
    return counts


def tick(db: sqlite3.Connection, work: Path, ws_url: str, jh_root: Path = HOME / ".job-hunter",
         config_path: Path | None = None) -> dict:
    reviewed = read_reviewed()
    statuses, assignments = collect_status(work=work)
    pipeline_path = work / "dcm-qa/fixes/pipeline.log"
    lines, offsets, identity = pipeline_lines(pipeline_path)
    queues = configured_queues(work, config_path)
    approvals = {path.stem.casefold(): str(path) for queue in queues
                 for path in (queue.path / "state").glob("*.approved") if path.is_file()}
    markers = tuple(dict.fromkeys((*QUEUE_MARKERS, *(q.log_marker for q in queues))))
    pipeline = parse_pipeline(lines, planned_stages(work / "dcm-qa/fixes/chain.sh"), queue_markers=markers)
    task_log_evidence(work, pipeline)
    git_evidence(work / "dcm-local", pipeline)
    describe_pipeline(work, pipeline)
    dcm_signal = dcm_observer.observe(work)
    regression = dcm_signal['regression']
    if regression['status'] != 'unknown':
        failed = regression['status'] == 'fail'
        status, text = statuses.get("motya", ("idle", "Нет активного задания"))
        statuses["motya"] = (status, text + " · Последняя регрессия: " + ("⚠ красная" if failed else "зелёная"))
    journals = {pipeline_path: (lines, offsets, identity)}
    for queue in queues:
        qpath = queue.log or queue_source(work, queue.path)
        if qpath not in journals:
            journals[qpath] = pipeline_lines(qpath)
        qlines, _, _ = journals[qpath]
        pipeline.update(queue_tasks(work, qlines, lines if qpath != pipeline_path else (),
                                    queue=queue, queue_markers=markers))
    pipeline, jobs = process_tasks(db, assignments, pipeline, "dcm")
    counts = sync(db, statuses, pipeline, lines, offsets, identity, pipeline_path,
                  jobs=jobs, reviewed=reviewed, queue_markers=markers, approvals=approvals)
    for qpath, (qlines, qoffsets, qidentity) in journals.items():
        if qpath == pipeline_path:
            continue
        cursor = "pipeline:dcm-queue:" + hashlib.sha256(str(qpath).encode()).hexdigest()[:16]
        extra = sync(db, {}, {}, qlines, qoffsets, qidentity, qpath, cursor_key=cursor, queue_markers=markers)
        counts = {key: counts[key] + extra[key] for key in counts}
    jh_path = work / "job-hunter/pipeline.log"
    lines, offsets, identity = pipeline_lines(jh_path)
    pipeline = parse_pipeline(lines, planned=(), generic=True)
    pipeline, jobs = jh_tasks(db, assignments, pipeline)
    extra = sync(db, {}, pipeline, lines, offsets, identity, jh_path, project="jh", jobs=jobs, reviewed=reviewed)
    counts = {key: counts[key] + extra[key] for key in counts}
    for project in ("office", "other"):
        pipeline, jobs = process_tasks(db, assignments, {}, project)
        extra = sync(db, {}, pipeline, [], [], {}, work, project=project, jobs=jobs, reviewed=reviewed)
        counts = {key: counts[key] + extra[key] for key in counts}
    extra = sync_stored_reviews(db, reviewed, approvals)
    counts = {key: counts[key] + extra[key] for key in counts}
    routine_counts = sync_routine(db, jh_root, processes())
    counts = {key: count + routine_counts[key] for key, count in counts.items()}
    with db:
        set_state(db, "office13:public", limits_observer.observe(HOME, work))
        set_state(db, "office17:public", dcm_signal)
    notify(ws_url, counts)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--work-root", type=Path, default=WORK)
    parser.add_argument("--interval", type=float, default=18)
    parser.add_argument("--ws-url", default="http://127.0.0.1:3101/emit")
    parser.add_argument("--projects-config", type=Path, help="Shared office-projects.json (or OFFICE_PROJECTS_CONFIG)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--restore-legacy", action="store_true")
    mode.add_argument("--archive-legacy", action="store_true")
    args = parser.parse_args()
    if args.interval < 1:
        parser.error("--interval must be >= 1")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    db = connect(args.db)
    bootstrap(db)
    if args.restore_legacy or args.archive_legacy:
        count = legacy_visibility(db, args.restore_legacy)
        notify(args.ws_url, {"statuses": count, "tasks": count})
        print(f"{'Восстановлено' if args.restore_legacy else 'Архивировано'} агентов: {count}")
        db.close()
        return
    stopping = False
    def stop(signum, frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while not stopping:
            started = time.monotonic()
            try:
                LOG.info("sync %s", json.dumps(tick(db, args.work_root, args.ws_url, config_path=args.projects_config)))
            except Exception:
                db.rollback()
                LOG.exception("Observation failed; retry next interval")
                if args.once:
                    raise
            if args.once:
                break
            deadline = started + args.interval
            while not stopping and time.monotonic() < deadline:
                time.sleep(min(0.5, max(0, deadline - time.monotonic())))
    finally:
        db.close()


if __name__ == "__main__":
    main()
