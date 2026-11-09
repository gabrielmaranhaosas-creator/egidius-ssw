import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / 'preparar.py'
spec = importlib.util.spec_from_file_location('preparar_oracle', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparacaoOracleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.database = self.base / 'origem.sqlite3'
        with sqlite3.connect(self.database) as con:
            for table, columns in module.validar_banco.__globals__['REQUIRED'].items():
                con.execute('CREATE TABLE ' + table + ' (' + ','.join(sorted(columns)) + ')')
            con.execute('INSERT INTO state(id,revision,payload) VALUES(1,31,?)',
                        (json.dumps({'versao': 5, 'jogadores': [], 'rodadas': []}),))
        self.archive = self.base / 'dados.zip'
        self.root = self.base / 'servidor'

    def bundle(self, media=False, missing=False):
        if media:
            with sqlite3.connect(self.database) as con:
                con.execute("INSERT INTO media_assets(stored_name,size) VALUES('foto.jpg',3)")
        with zipfile.ZipFile(self.archive, 'w') as out:
            out.write(self.database, 'dados/egidius.sqlite3')
            if media and not missing:
                out.writestr('media/foto.jpg', b'abc')
            out.writestr('../../fora.txt', 'não deve ser extraído')

    def prepare(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            report = module.preparar(self.archive, self.root, 'ssw.exemplo.org')
        return report, output.getvalue()

    def test_preserva_bytes_midia_e_segredo_em_arquivo_privado(self):
        self.bundle(media=True)
        report, output = self.prepare()
        self.assertEqual(self.database.read_bytes(), (self.root / 'data/egidius.sqlite3').read_bytes())
        self.assertEqual((self.root / 'data/media/foto.jpg').read_bytes(), b'abc')
        self.assertEqual(report['sha256_database'], hashlib.sha256(self.database.read_bytes()).hexdigest())
        self.assertFalse((self.base / 'fora.txt').exists())
        invite = (self.root / 'private/convite.txt').read_text().strip()
        self.assertNotIn(invite, output)
        self.assertEqual((self.root / 'private/app.env').stat().st_mode & 0o777, 0o600)
        self.assertIn('EGIDIUS_LOCAL_ACCESS=false', (self.root / 'private/app.env').read_text())
        self.assertNotIn('INITIAL_DATABASE', (self.root / 'private/app.env').read_text())

    def test_recusa_repeticao_sem_trocar_banco_ou_convite(self):
        self.bundle()
        self.prepare()
        before = (self.root / 'private/convite.txt').read_bytes()
        with self.assertRaises(ValueError):
            self.prepare()
        self.assertEqual(before, (self.root / 'private/convite.txt').read_bytes())

    def test_midia_ausente_nao_deixa_destino_parcial(self):
        self.bundle(media=True, missing=True)
        with self.assertRaises(KeyError):
            self.prepare()
        self.assertFalse(self.root.exists())
        self.assertEqual(list(self.base.glob('.egidius-preparar-*')), [])

    def test_rejeita_dominio_injetado_e_ip(self):
        for bad in ('https://ssw.exemplo.org', '127.0.0.1', 'localhost', 'x\nEGIDIUS_LOCAL_ACCESS=true', 'ssw.exemplo.org:80', 'a.test'):
            with self.subTest(domain=bad), self.assertRaises(ValueError):
                module.validar_dominio(bad)

    def test_recusa_link_simbolico_no_destino(self):
        self.bundle()
        link = self.base / 'atalho'
        link.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(ValueError):
            module.preparar(self.archive, link / 'novo', 'ssw.exemplo.org')
        self.assertFalse((self.base / 'novo').exists())


if __name__ == '__main__':
    unittest.main()
