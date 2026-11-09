import importlib.util
from pathlib import Path
import pytest


def load():
    path = Path(__file__).resolve().parents[2] / 'tools/preparar_publicacao.py'
    spec = importlib.util.spec_from_file_location('preparar_render', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(root, module):
    root.mkdir()
    for folder in module.FOLDERS:
        (root / folder).mkdir(parents=True)
    for name in module.REQUIRED:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('fixture')
    (root / 'public/escudo.jpg').write_bytes(b'publico')
    (root / 'backend/egidius_api/main.py').write_text('fixture')
    return root


def test_exportacao_render_exclui_dados_e_mantem_configuracao(tmp_path):
    module = load()
    root = fixture(tmp_path / 'origem', module)
    for name in ('src/.env', 'public/privado.sqlite3', 'backend/egidius_api/__pycache__/x.pyc'):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('NAO PUBLICAR')
    (root / 'railway.toml').write_text('legado')
    target = module.preparar(root, tmp_path / 'publicacao')
    assert (target / 'render.yaml').read_text() == 'fixture'
    assert (target / 'public/escudo.jpg').read_bytes() == b'publico'
    assert not (target / 'railway.toml').exists()
    assert not (target / 'src/.env').exists()
    assert not (target / 'public/privado.sqlite3').exists()
    assert not (target / 'backend/egidius_api/__pycache__').exists()
    assert (root / 'src/.env').read_text() == 'NAO PUBLICAR'


def test_exportacao_recusa_destino_existente_e_symlink_sem_sobrescrever(tmp_path):
    module = load()
    root = fixture(tmp_path / 'origem', module)
    existing = tmp_path / 'existente'
    existing.mkdir()
    marker = existing / 'preservar'
    marker.write_text('original')
    with pytest.raises(RuntimeError):
        module.preparar(root, existing)
    assert marker.read_text() == 'original'
    (root / 'src/atalho.py').symlink_to(marker)
    with pytest.raises(RuntimeError):
        module.preparar(root, tmp_path / 'novo')
    assert not (tmp_path / 'novo').exists()
