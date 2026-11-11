import json
from pathlib import Path
from office_moments import observe, read_bugs


def event(run, count, **extra):
    return json.dumps(dict(event='search_finished', run_id=run, mode='search', new=count,
                           created_at='2026-11-01T12:00:00', **extra)) + '\n'


def test_bugs_hot_reload_and_fallback(tmp_path):
    path = tmp_path / 'marina.json'
    assert read_bugs(path) == 'вагон 🚃'
    for value in [0, 12, 'вагон 🚃', '42']:
        path.write_text(json.dumps({'bugs': value}))
        assert read_bugs(path) == value
    for content in ['{', '[]', '{"bugs":false}', '{"bugs":{}}', '{"bugs":NaN}']:
        path.write_text(content)
        assert read_bugs(path) == 'вагон 🚃'


def vacancies(root, count, profile='qa'):
    path = root / 'profiles' / profile / 'seen_vacancies.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({str(i): {} for i in range(count)}))
    return path


def test_first_read_growth_restart_threshold_and_reset(tmp_path):
    config = tmp_path/'marina.json'
    vacancies(tmp_path, 717)
    state, public = observe(tmp_path, None, config)
    assert public['total'] == public['latestCount'] == 0
    assert state['count'] == 717
    vacancies(tmp_path, 720)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == public['latestCount'] == 3
    # Persisted bridge state is sufficient; no private IDs are kept.
    state = json.loads(json.dumps(state))
    state, again = observe(tmp_path, state, config)
    assert again == public
    vacancies(tmp_path, 725)
    state, public = observe(tmp_path, state, config, baseline=True)
    assert public['total'] == 3  # startup baseline suppresses downtime growth
    vacancies(tmp_path, 775)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 53  # fifty is accepted
    vacancies(tmp_path, 826)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 53  # fifty-one is a silent rebase
    vacancies(tmp_path, 2)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 53
    vacancies(tmp_path, 4)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 55
    assert set(public) == {'bugs','total','latestCount'}
    assert set(state) == {'version','total','latestCount','count'}


def test_only_qa_first_successful_read_malformed_missing_and_old_migration(tmp_path):
    config = tmp_path/'marina.json'
    state, public = observe(tmp_path, {'total':717,'latestCount':717}, config)
    for name in ['marina','qa-dev','client_1']:
        vacancies(tmp_path, 20, name)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 0
    path = vacancies(tmp_path, 12)
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 0  # new file's first read is baseline only
    for bad in ['{', '[]', 'null']:
        path.write_text(bad)
        state, public = observe(tmp_path, state, config)
        assert state['count'] == 12
    path.unlink()
    state, public = observe(tmp_path, state, config)
    assert state['count'] == 12
    vacancies(tmp_path, 15)
    before = path.read_bytes()
    state, public = observe(tmp_path, state, config)
    assert public['total'] == 3
    assert path.read_bytes() == before
