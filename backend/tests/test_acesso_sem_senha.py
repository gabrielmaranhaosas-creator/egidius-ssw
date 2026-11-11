import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def local(tmp_path, monkeypatch):
    monkeypatch.setenv('EGIDIUS_LOCAL_ACCESS', 'true')
    monkeypatch.delenv('EGIDIUS_SECURE_COOKIES', raising=False)
    from egidius_api.main import create_app
    app = create_app(f'sqlite:///{tmp_path / "teste.sqlite3"}')
    with TestClient(app, base_url='http://127.0.0.1:8017', client=('127.0.0.1', 12345)) as c:
        yield c, app
    app.state.engine.dispose()


def test_abre_sem_senha_preserva_documentos_e_reutiliza_sessao(local):
    c, app = local
    from egidius_api.db import State, Session
    with app.state.db_factory() as db:
        antes = db.get(State, 1).payload
    r = c.post('/api/auth/local', headers={'Origin': 'http://127.0.0.1:5173'})
    assert r.status_code == 200
    assert r.json()['authenticated']
    assert r.json()['username'] == 'operador_local'
    assert 'httponly' in r.headers['set-cookie'].lower()
    assert 'samesite=strict' in r.headers['set-cookie'].lower()
    assert r.headers['cache-control'] == 'no-store'
    assert c.get('/api/state').status_code == 200
    assert c.get('/api/viagem-ssw').status_code == 200
    assert c.post('/api/auth/local').json()['csrf'] == r.json()['csrf']
    with app.state.db_factory() as db:
        assert db.get(State, 1).payload == antes
        assert db.query(Session).count() == 1


@pytest.mark.parametrize('headers', [
    {'Origin': 'https://externo.example'},
    {'Origin': 'http://127.0.0.1:5173.evil.example'},
    {'Origin': 'null'},
    {'Origin': 'http://127.0.0.1:5173/caminho'},
    {'Host': 'externo.trycloudflare.com'},
    {'Sec-Fetch-Site': 'cross-site'},
])
def test_bloqueia_origens_externas(local, headers):
    c, _ = local
    assert c.post('/api/auth/local', headers=headers).status_code == 403
    assert c.get('/api/state').status_code == 401


def test_desativado_por_padrao(local, monkeypatch):
    c, _ = local
    monkeypatch.delenv('EGIDIUS_LOCAL_ACCESS')
    assert c.post('/api/auth/local').status_code == 404


def test_producao_https_nao_abre_acesso_local(local, monkeypatch):
    c, _ = local
    monkeypatch.setenv('EGIDIUS_SECURE_COOKIES', 'true')
    assert c.post('/api/auth/local').status_code == 403


def test_peer_externo_nao_e_local(local):
    _, app = local
    with TestClient(app, base_url='http://127.0.0.1:8017', client=('203.0.113.9', 123)) as c:
        assert c.post('/api/auth/local').status_code == 403


def test_gravacao_exige_csrf_e_bloqueia_concorrencia(local):
    c, _ = local
    auth = c.post('/api/auth/local').json()
    estado = c.get('/api/state').json()
    payload = {'expected_revision': estado['revision'], 'data': estado['data']}
    assert c.put('/api/state', json=payload).status_code == 403
    headers = {'X-CSRF-Token': auth['csrf'], 'Origin': 'http://127.0.0.1:5173'}
    assert c.put('/api/state', json=payload, headers=headers).status_code == 200
    assert c.put('/api/state', json=payload, headers=headers).status_code == 409
    assert c.post('/api/auth/logout', headers=headers).status_code == 200
    assert c.get('/api/state').status_code == 401


def test_convite_externo_continua_funcionando(local, monkeypatch):
    c, _ = local
    monkeypatch.setenv('EGIDIUS_PUBLIC_INVITE_TOKEN', 'a' * 48)
    with TestClient(c.app, base_url='https://exemplo.trycloudflare.com') as externo:
        r = externo.post('/api/auth/invite', json={'token': 'a' * 48},
                         headers={'Origin': 'https://exemplo.trycloudflare.com'})
        assert r.status_code == 200
        assert externo.get('/api/state').status_code == 200
        assert externo.post('/api/auth/local').status_code == 403


def test_duas_entradas_iniciais_nao_duplicam_operador(local):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from egidius_api.db import User
    _, app = local
    barreira = Barrier(2)
    def entrar(_):
        with TestClient(app, base_url='http://127.0.0.1:8017', client=('127.0.0.1', 12345)) as c:
            barreira.wait(timeout=5)
            r = c.post('/api/auth/local')
            assert r.status_code == 200
            assert c.get('/api/state').status_code == 200
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(entrar, range(2)))
    with app.state.db_factory() as db:
        assert db.query(User).filter_by(username='operador_local').count() == 1
