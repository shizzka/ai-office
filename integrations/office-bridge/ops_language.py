"""Owner-facing DCM language. Pure functions: no configuration, network or secrets."""
from __future__ import annotations

import datetime as dt
import re
from statistics import median

DEFAULTS = {'code': (45, '30–60'), 'regression': (35, '30–40'),
            'critic': (22.5, '5–40'), 'night': (15, '10–20'), 'acceptance': (45, '30–60')}


def safe_log(text):
    # Defense in depth only; never load bot configuration to redact a log.
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = re.sub(r'\b\d{5,}:[A-Za-z0-9_-]{20,}\b', '[скрыто]', text)
    return re.sub(r'(?i)\b((?:chat[_ -]?id|token|токен|id чата)\s*[=:]\s*)\S+', r'\1[скрыто]', text)[:4000]


def phase_key(text):
    value = text.lower()
    if 'лимит' in value or 'перегруз' in value:
        return 'limit'
    if 'сеть codex' in value:
        return 'limit'
    if 'ночн' in value or 'ярик' in value:
        return 'night'
    if 'регресси' in value:
        return 'regression'
    if 'критик' in value:
        return 'critic'
    if 'ася' in value or 'приёмк' in value:
        return 'acceptance'
    if 'лёха' in value or 'работе' in value or 'старт' in value:
        return 'code'
    return 'unknown'


def describe_event(body, code):
    """The queue scripts' log vocabulary, plus forward-compatible raw fallback."""
    value = body.lower()
    circle = f' круга {code}' if code else ''
    direct = f' круг {code}' if code else ' работу'
    on_circle = f' на круге {code}' if code else ''
    result = {'eventType': 'unknown', 'humanText': safe_log(body), 'phase': None}

    def event(kind, text, phase=None):
        result.update(eventType=kind, humanText=text, phase=phase)
        return result

    # Notes can quote failures, starts and ORDER names without changing the queue.
    note = re.match(r'^(?:действующий\s+)?архитектор\b\s*:?', body, re.I)
    if note:
        return event('note', 'Архитектор: ' + safe_log(body[note.end():].lstrip()))
    if 'сеть codex' in value and 'стоп' in value:
        return event('stop', 'Сеть Codex недоступна 8 часов — нужен архитектор', 'stopped')
    if 'лимит' in value or 'перегруз' in value or 'сеть codex' in value and 'чекпоинт сохранён' in value:
        return event('limit', 'Лимит/перегрузка модели — ждём 30 мин, работа сохранена (чекпоинт)', 'limit')
    if re.match(r'продолжение\s+', value):
        return event('resume', 'Лёха продолжает прерванный круг' + (f' {code}' if code else ''), 'code')
    if 'нет результата от воркера' in value and 'стоп' not in value:
        retry = re.search(r'повтор\s+(\d+)\s*/\s*(\d+)\s+через\s+(\d+)\s+мин', value)
        suffix = f', повтор {retry[1]} из {retry[2]} через {retry[3]} мин' if retry else ', ждём повтор'
        return event('worker-retry', 'Воркер не ответил' + suffix, 'regression')
    if 'ночное ревью' in value and 'очередь идёт дальше' in value:
        return event('review-info', f'Ночное ревью{circle}: ждём ревью архитектора, очередь идёт дальше')
    if 'принята архитектором без повторного прогона' in value:
        return event('tests-waived', f'Архитектор принял тесты{circle} без повторного прогона', 'critic')
    if 'готовит одну попытку' in value:
        return event('fix-plan', f'Ночной Ярик готовит исправление{circle}', 'night')
    if 'нет связи с воркером' in value and 'стоп' not in value:
        return event('worker-retry', f'Обрыв связи с воркером{circle}, повтор через 10 мин', 'regression')
    if 'ревью стопки' in value or 'ждёт ревью' in value and 'зелён' not in value and 'зелен' not in value and 'стоп' not in value:
        return event('review', f'Стопка кругов ждёт ревью и решения архитектора{circle}', 'review')
    if 'пауза по команде' in value:
        return event('pause', 'Очередь остановилась после круга по вашей команде', 'pause')
    if 'не починился с одной попытки' in value:
        return event('stop', f'Автоисправление{circle} не помогло — нужен архитектор', 'stopped')
    if 'нет задания на исправление' in value:
        return event('stop', f'Ночной Ярик не смог подготовить исправление{circle}', 'stopped')
    if 'acceptance/' in value and ('изменил' in value or 'нарушение' in value):
        return event('stop', f'Изменены защищённые проверки{circle} — нужен архитектор', 'stopped')
    if 'воркер недоступен' in value and 'стоп' in value:
        return event('stop', f'Рабочая машина недоступна уже 2 часа{circle}', 'stopped')
    if 'ошибка codex' in value:
        return event('stop', f'Лёха не смог продолжить{direct}: ошибка запуска модели', 'stopped')
    if 'воркер 12 раз не отдал результат' in value and 'стоп' in value:
        return event('stop', f'Очередь встала{on_circle}: воркер 12 раз не отдал результат — нужен архитектор', 'stopped')
    if 'стоп' in value:
        return event('stop', f'Очередь встала{on_circle} — нужен архитектор', 'stopped')
    if 'красн' in value:
        failed = re.search(r'(?:шаг\s+|FAIL\s*[: ]\s*)([\w.-]+)', body, re.I)
        return event('tests-red', f'Тесты{circle} красные' + (f': не прошёл шаг {failed[1]}' if failed else ''), 'stopped')
    if 'критик' in value and 'блокер' in value:
        count = re.search(r'блокер\w*\s*[:(]?\s*(\d+)', value)
        return event('critic-blockers', f'Ася: критик нашёл блокеры{circle}' + (f' ({count[1]})' if count else ''), 'stopped')
    if ('зелён' in value or 'зелен' in value) and 'регресси' not in value:
        verdict = 'доработать' if 'доработать' in value else 'рекомендует в dev' if 'рекомендую в dev' in value else 'ревью завершено'
        return event('complete', 'Круг' + (f' {code}' if code else '') + f' завершён зелёным. Ночной Ярик: {verdict}', 'done')
    if 'ярик:' in value or 'ночной ревью:' in value:
        verdict = 'доработать' if 'доработать' in value else 'рекомендует в dev'
        return event('night-result', f'Ночной Ярик: ревью{circle} — {verdict}', 'done')
    if 'регресси' in value and ('зелён' in value or 'зелен' in value or 'RESULT True' in body):
        return event('tests-green', f'Тесты{circle} зелёные', 'critic')
    if 'возобновление' in value:
        return event('resume', f'Работа{circle} сохранена, повторяем тесты', 'regression')
    if 'старт' in value:
        if 'ася' in value:
            return event('acceptance-start', f'Ася готовит проверки{circle}', 'acceptance')
        return event('code-start', f'Лёха начал код{circle}', 'code')
    if 'влит в' in value:
        return event('merged', f'Проверки{circle} добавлены в общую ветку', 'done')
    if 'коммит' in value:
        commit = re.search(r'коммит\s+([a-f0-9]{6,40})\b', body, re.I)
        return event('commit', f'Лёха закончил код{circle}' + (f' (коммит {commit[1][:7]})' if commit else ''), 'regression')
    if 'очередь пройдена до конца' in value:
        return event('queue-done', 'Все круги очереди пройдены', 'done')
    if 'нет base' in value:
        return event('preparing', 'Ждём готовности общей ветки перед запуском', 'preparing')
    if 'критик' in value:
        if 'ок' in value:
            return event('critic-green', f'Ася проверила код{circle}: блокеров нет', 'night')
        return event('critic-start', f'Ася проверяет код{circle}', 'critic')
    if 'ночн' in value or 'ярик' in value:
        return event('night-start', f'Ночной Ярик проверяет{direct}', 'night')
    if 'регресси' in value:
        return event('tests-start', f'Идут тесты{circle}', 'regression')
    return result


def phase_timing(records, key, circle, now, state_at=0):
    """Only completed, uninterrupted stages count; never learn across a failure/limit."""
    samples = []
    current = None
    for row in records:
        phase = row.get('phase')
        if not phase:
            continue
        identity = (row.get('code'), phase)
        if current and identity != current[:2]:
            code, previous, started = current
            minutes = (row['at'] - started) / 60
            if code == row.get('code') and previous == key and phase not in ('stopped', 'limit') and 1 <= minutes <= 240:
                samples.append(minutes)
        if not current or identity != current[:2]:
            current = (*identity, row['at'])
    relevant = [r for r in records if r.get('code') == circle and r.get('phase')]
    started = state_at or None
    # Prefer the first event in the current contiguous stage, not its latest retry.
    for row in reversed(relevant):
        if row['phase'] != key:
            break
        started = row['at']
    default, label = DEFAULTS.get(key, (45, '30–60'))
    typical = round(median(samples)) if len(samples) >= 3 else default
    return {'key': key, 'startedAt': started, 'elapsedMinutes': max(0, int((now - started) / 60)) if started else None,
            'expectedMinutes': typical, 'typicalLabel': f'~{typical}' if len(samples) >= 3 else label,
            'source': 'journal' if len(samples) >= 3 else 'default', 'samples': len(samples)}


def intervention(reason):
    value = reason.lower()
    if 'красн' in value or 'код 10' in value:
        return 'Тесты не прошли', 'Попросите архитектора разобрать упавшие проверки и выбрать исправление или повтор.'
    if 'блокер' in value or 'код 11' in value:
        return 'Ася нашла блокер в коде', 'Передайте замечания архитектору для исправления.'
    if 'codex' in value or 'код 12' in value:
        return 'Лёха не смог продолжить: ошибка модели', 'Попросите архитектора проверить ошибку и возобновить круг с сохранённой работы.'
    if 'приёмк' in value or 'acceptance' in value:
        return 'Изменены защищённые проверки', 'Попросите архитектора проверить изменения приёмки перед продолжением.'
    if 'сессии' in value:
        return 'Процесс очереди завершился (сессия очереди пропала)', 'Попросите архитектора проверить журнал и возобновить очередь.'
    if 'воркер' in value:
        return 'Нет связи с рабочей машиной', 'Проверьте рабочую машину и попросите архитектора повторить тесты.'
    return reason or 'Очередь завершила работу раньше времени', 'Передайте причину архитектору и возобновите очередь после проверки.'


def presentation(line, records, now, state_at=0):
    key = phase_key(line['stage'])
    last_phase = next((r for r in reversed(records) if r.get('phase') and r.get('code') == line['circle']), None)
    if key == 'unknown' and last_phase:
        key = last_phase['phase']
    timing = phase_timing(records, key, line['circle'], now, state_at)
    active = line['tmux'] or any(line['processes'].values())
    limit = key == 'limit' and active
    level, reason, action = 'none', '', ''
    circle = f' круга {line["circle"]}' if line['circle'] else ''
    expected_at = timing['startedAt'] + timing['expectedMinutes'] * 60 if timing['startedAt'] else None
    if line['status'] == 'awaiting-start':
        doing = line['reason']
        if doing.startswith('Линия ждёт слияния стопки щита'):
            doing = 'Ждём, пока архитектор объединит готовые круги Щита в общую ветку'
        elif doing.startswith('Линия ещё не подготовлена:'):
            doing = 'Архитектор ещё готовит линию к первому запуску'
    elif line.get('completed'):
        doing = 'Все круги очереди пройдены'
    elif line['status'] == 'stopped':
        level = 'intervention'
        reason, action = intervention(line['reason'])
        doing = f'Работа{circle} остановилась'
    elif limit:
        retry_at = (last_phase['at'] + 1800) if last_phase and last_phase['phase'] == 'limit' else (timing['startedAt'] + 1800 if timing['startedAt'] else None)
        if retry_at and retry_at > now:
            doing = 'Ждём лимит/перегрузку модели, продолжим в ' + dt.datetime.fromtimestamp(retry_at).astimezone().strftime('%H:%M')
            expected_at = retry_at
        else:
            doing, expected_at = 'Лимит/перегрузка модели: повторное продолжение уже запланировано', None
    elif line['status'] == 'waiting':
        level, reason = 'decision', line['reason'] or 'нужно ревью стопки кругов'
        doing = 'Пауза после текущего круга' if 'пауз' in reason.lower() else f'Ждём решения архитектора{circle}'
        action = 'Разберите стопку вместе с архитектором и продолжите после ревью.'
    else:
        phrases = {'code': 'Лёха пишет код', 'regression': 'Идут тесты', 'critic': 'Ася — критик — проверяет код',
                   'night': 'Ночной Ярик делает ревью', 'acceptance': 'Ася готовит проверки'}
        doing = phrases.get(key, 'Очередь работает') + circle
        elapsed = timing['elapsedMinutes']
        doing += (f' (идёт {elapsed} мин, обычно {timing["typicalLabel"]} мин)' if elapsed is not None
                  else f' (обычно {timing["typicalLabel"]} мин; время начала неизвестно)')
        if line.get('pauseRequested'):
            doing += '. После круга очередь уйдёт на паузу'
    attention = {'level': level, 'reason': reason, 'action': action,
                 'text': ('Ничего делать не нужно' if level == 'none' else
                          f'Нужно ваше решение: {reason}' if level == 'decision' else
                          f'Встало — нужно вмешательство: {reason}. Что делать: {action}')}
    silence = (line['status'] == 'running' and key in DEFAULTS and
               line['idleSeconds'] > timing['expectedMinutes'] * 120)
    return {'doing': doing, 'attention': attention, 'timing': timing, 'showSilence': silence,
            'expectedAt': expected_at if level == 'none' and expected_at and expected_at > now and not line.get('completed') else None,
            'queueActive': active}


def stop_message(name, code, reason):
    human, action = intervention(reason)
    return f'Очередь {name} встала: {human}' + (f' · {code}' if code else '') + f'. Что делать: {action}'
