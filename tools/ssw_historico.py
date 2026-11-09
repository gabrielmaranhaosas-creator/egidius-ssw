#!/usr/bin/env python3
"""EGIDIUS 09H1: inventário histórico, extração e prévia SOMENTE LEITURA.

NÃO conecta ao banco do EGIDIUS. Nenhuma importação automática é executada.
Suporta CSV/TXT/XLSX/DOCX/PDF textuais; Excel .xls e Word .doc são sinalizados.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import html
import io
import os
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

MAX_BYTES = 30 * 1024 * 1024
MAX_ZIP_ITEMS = 2000
MAX_ZIP_EXPANDED = 75 * 1024 * 1024
MAX_ROWS = 20_000
MAX_TEXT_CHARS = 800_000
SUPPORT = {'.csv', '.txt', '.xlsx', '.docx', '.pdf'}
LEGACY = {'.xls', '.doc'}
YEAR_RE = re.compile(r'(?<!\d)(?:19\d{2}|20\d{2})(?!\d)')
DATE_RE = re.compile(r'(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-]((?:19|20)\d{2})(?!\d)')
SCORE_RE = re.compile(r'^\s*(\d{1,2})\s*[-xX×:]\s*(\d{1,2})\s*$')
NS_S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

HEADER_MAP = {
    'nome': 'nome', 'nome_completo': 'nome', 'jogador': 'nome', 'atleta': 'nome', 'jogadores': 'nome',
    'apelido': 'apelido', 'alcunha': 'apelido', 'numero': 'numero', 'numero_camisa': 'numero',
    'numero_da_camisa': 'numero', 'camisa': 'numero', 'n': 'numero',
    'posicao': 'posicao', 'funcao': 'posicao', 'ano': 'ano', 'temporada': 'ano',
    'data': 'data', 'data_jogo': 'data', 'dia': 'data',
    'time_a': 'time_a', 'equipe_a': 'time_a', 'mandante': 'time_a',
    'time_b': 'time_b', 'equipe_b': 'time_b', 'visitante': 'time_b',
    'placar': 'placar', 'resultado': 'placar',
    'gols_a': 'gols_a', 'gols_mandante': 'gols_a', 'gols_b': 'gols_b', 'gols_visitante': 'gols_b',
    'gols': 'gols', 'gols_marcados': 'gols', 'autor': 'nome',
}
ATHLETE_HEADER = {'nome'}
MATCH_HEADER = {'time_a', 'time_b'}


def norm(s: object) -> str:
    t = unicodedata.normalize('NFKD', str(s or '').strip()).casefold()
    t = ''.join(c for c in t if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '_', t).strip('_')


def plain(s: object, limit: int = 4000) -> str:
    return re.sub(r'\s+', ' ', str(s or '')).strip()[:limit]


def safe_zip(z: zipfile.ZipFile) -> None:
    parts = z.infolist()
    if len(parts) > MAX_ZIP_ITEMS or sum(p.file_size for p in parts) > MAX_ZIP_EXPANDED:
        raise ValueError('Contêiner Office excessivamente grande ou suspeito')
    if any(p.filename.startswith('/') or '..' in Path(p.filename).parts for p in parts):
        raise ValueError('Caminho suspeito dentro do documento')


def open_csv(raw: bytes) -> tuple[list[list[str]], list[str]]:
    issues = []
    for enc in ('utf-8-sig', 'cp1252'):
        try:
            text = raw.decode(enc)
            if enc != 'utf-8-sig':
                issues.append('CSV em codificação legada (cp1252); conferir acentos')
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError('CSV sem codificação legível')
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=',;\t|')
    except csv.Error:
        dialect = csv.excel
    return [r for r in csv.reader(io.StringIO(text), dialect) if any(x.strip() for x in r)][:MAX_ROWS], issues


def csv_text(text: str) -> list[list[str]]:
    candidates = []
    for row in csv.reader(io.StringIO(text), delimiter=';'):
        if len(row) > 1:
            candidates.append(row)
        elif '|' in (row[0] if row else ''):
            candidates.append(row[0].split('|'))
        else:
            candidates.append(row)
    return candidates[:MAX_ROWS]


def xlsx_sheets(raw: bytes) -> list[tuple[str, list[list[str]]]]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        safe_zip(z)
        ns_r = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            strings = [''.join(t.text or '' for t in si.iter(NS_S+'t')) for si in root.findall(NS_S+'si')]
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        relxml = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        relmap = {r.attrib['Id']:r.attrib['Target'] for r in relxml}
        ret = []
        for sheet in wb.find(NS_S+'sheets'):
            title = sheet.attrib.get('name', 'Planilha')
            target = relmap.get(sheet.attrib.get(ns_r+'id', ''), '')
            target = target.lstrip('/')
            if not target.startswith('xl/'):
                target = 'xl/' + target
            if '..' in Path(target).parts or target not in z.namelist():
                raise ValueError('Referência de aba inválida')
            root = ET.fromstring(z.read(target))
            out = []
            sd = root.find(NS_S+'sheetData')
            if sd is None:
                continue
            for row in sd.findall(NS_S+'row')[:MAX_ROWS]:
                vals = {}
                for c in row.findall(NS_S+'c'):
                    coord = c.attrib.get('r', '')
                    m = re.match(r'([A-Z]+)', coord)
                    if not m:
                        continue
                    index = 0
                    for ch in m.group(1):
                        index = index * 26 + ord(ch) - 64
                    if index > 300:
                        continue
                    v = c.find(NS_S+'v')
                    inline = c.find(NS_S+'is')
                    vtext = v.text if v is not None else ''
                    if c.attrib.get('t') == 's' and vtext is not None:
                        idx = int(vtext)
                        val = strings[idx] if idx < len(strings) else ''
                    elif inline is not None:
                        val = ''.join(x.text or '' for x in inline.iter(NS_S+'t'))
                    else:
                        val = vtext or ''
                    vals[index-1] = plain(val)
                if vals:
                    out.append([vals.get(i, '') for i in range(min(max(vals)+1, 300))])
            if out:
                ret.append((title, out))
        return ret


def docx_content(raw: bytes) -> tuple[list[str], list[tuple[str, list[list[str]]]]]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        safe_zip(z)
        root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(NS_W+'body')
    if body is None:
        return [], []
    text, tables = [], []
    for node in body:
        if node.tag == NS_W+'p':
            para = ''.join(t.text or '' for t in node.iter(NS_W+'t')).strip()
            if para:
                text.append(plain(para))
        if node.tag == NS_W+'tbl':
            rows = []
            for tr in node.findall(NS_W+'tr')[:MAX_ROWS]:
                cells=[]
                for cell in tr.findall(NS_W+'tc')[:300]:
                    cells.append(plain(' '.join(''.join(t.text or '' for t in p.iter(NS_W+'t')) for p in cell.iter(NS_W+'p'))))
                rows.append(cells)
            if rows:
                tables.append((f'Tabela {len(tables)+1}', rows))
    return text, tables


def pdf_text(raw: bytes, path: Path) -> tuple[str, list[str]]:
    issues=[]
    try:
        from pypdf import PdfReader  # type: ignore
        reader = PdfReader(io.BytesIO(raw), strict=False)
        if reader.is_encrypted:
            raise ValueError('PDF protegido por senha')
        pages = min(len(reader.pages), 150)
        result='\n'.join((p.extract_text() or '') for p in reader.pages[:pages])
        if len(reader.pages)>pages:
            issues.append(f'PDF com mais de {pages} páginas: leitura limitada')
        return result[:MAX_TEXT_CHARS], issues
    except ImportError:
        pass
    if shutil.which('pdftotext'):
        try:
            cp = subprocess.run(['pdftotext', '-layout', str(path), '-'],capture_output=True,timeout=40,check=True)
            return cp.stdout.decode('utf-8', 'replace')[:MAX_TEXT_CHARS], issues
        except (subprocess.SubprocessError, OSError) as e:
            issues.append(f'Não foi possível usar pdftotext: {e}')
    return '', issues+['Leitura de PDF indisponível: instale pypdf no Python utilizado ou pdftotext no Mac']


def select_year(path: Path, root: Path) -> str:
    rel = path.relative_to(root)
    for part in reversed(rel.parts[:-1]):
        m = YEAR_RE.search(part)
        if m:
            return m.group()
    m = YEAR_RE.search(path.stem)
    return m.group() if m else ''


def discover_tables(rows: list[list[str]], origin: dict, athletes: list, matches: list, issues: list) -> int:
    """Only structured explicit-header tables become proposed records."""
    count = 0
    for header_index, header in enumerate(rows[:min(len(rows),30)]):
        fields = [HEADER_MAP.get(norm(h), '') for h in header]
        kind = 'partida' if MATCH_HEADER.issubset(set(fields)) else 'atleta' if ATHLETE_HEADER.issubset(set(fields)) else ''
        if not kind:
            continue
        for idx,row in enumerate(rows[header_index+1:header_index+1+MAX_ROWS],start=header_index+2):
            values = {name: plain(row[i] if i<len(row) else '') for i,name in enumerate(fields) if name}
            if not any(values.values()):
                continue
            source = dict(origin, linha=idx)
            if kind=='atleta':
                if not values.get('nome'):
                    continue
                item={k:values.get(k,'') for k in ('nome','apelido','numero','posicao','ano','gols')}
                item['temporada']=item.pop('ano') or origin.get('ano','')
                item['fonte']=source
                item['avisos']=[]
                if not item['temporada']:
                    item['avisos'].append('Ano não identificado')
                if item['numero'] and not re.fullmatch(r'\d{1,3}',item['numero']):
                    item['avisos'].append('Número precisa de conferência')
                athletes.append(item)
            else:
                if not values.get('time_a') or not values.get('time_b'):
                    continue
                item={k:values.get(k,'') for k in ('data','time_a','time_b','placar','gols_a','gols_b')}
                item['temporada']=values.get('ano','') or origin.get('ano','')
                item['fonte']=source
                item['avisos']=[]
                dat=item.get('data','')
                if re.fullmatch(r'\d{5}(?:\.0+)?', dat):
                    n=int(float(dat))
                    if 20000<=n<=80000:
                        dat=(dt.date(1899,12,30)+dt.timedelta(days=n)).isoformat()
                        item['data']=dat
                        item['avisos'].append('Data numérica Excel convertida: conferir')
                dm=DATE_RE.search(dat)
                if dm:
                    try:
                        parsed=dt.date(int(dm.group(3)),int(dm.group(2)),int(dm.group(1)))
                        item['data']=parsed.isoformat()
                        if not item['temporada']:
                            item['temporada']=str(parsed.year)
                        elif item['temporada']!=str(parsed.year):
                            item['avisos'].append('Ano da linha diferente do ano da pasta')
                    except ValueError:
                        item['avisos'].append('Data inválida')
                elif dat:
                    try:
                        dt.date.fromisoformat(dat)
                    except ValueError:
                        item['avisos'].append('Formato de data não reconhecido')
                score=SCORE_RE.match(item['placar'])
                if score:
                    item['gols_a'],item['gols_b']=score.groups()
                elif item['placar']:
                    item['avisos'].append('Placar não reconhecido')
                if not item['data']:
                    item['avisos'].append('Data não identificada')
                matches.append(item)
            count+=1
        break
    return count


def fingerprint(path: Path) -> str:
    dig=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            dig.update(chunk)
    return dig.hexdigest()


def add_excerpt(excerpts, origin, text):
    count=0
    for index,line in enumerate(text.splitlines(),start=1):
        s=plain(line,2000)
        if s:
            excerpts.append({'arquivo':origin['arquivo'],'aba':origin.get('aba',''),'linha':index,'ano':origin['ano'],'texto':s})
            count+=1
        if count>=3000:
            break


def scan_file(path: Path, root: Path, athletes: list, matches: list, excerpts: list, issues: list) -> dict:
    rel=str(path.relative_to(root)); ext=path.suffix.lower(); size=path.stat().st_size
    entry={'arquivo':rel,'tipo':ext,'bytes':size,'sha256':fingerprint(path),'ano':select_year(path,root),
           'status':'lido','registros':0,'trechos':0,'avisos':[]}
    if ext in LEGACY:
        entry['status']='converter';entry['avisos'].append('Formato legado: converter para .xlsx ou .docx')
        return entry
    if ext not in SUPPORT:
        entry['status']='ignorado';entry['avisos'].append('Extensão fora do escopo')
        return entry
    if size>MAX_BYTES:
        entry['status']='revisar';entry['avisos'].append('Arquivo maior que 30 MB; não analisado')
        return entry
    origin={'arquivo':rel,'ano':entry['ano']}
    try:
        raw=path.read_bytes()
        tables=[]; lines=[]
        if ext=='.csv':
            rows,w=open_csv(raw);entry['avisos']+=w;tables=[('CSV',rows)]
        elif ext=='.xlsx':
            tables=xlsx_sheets(raw)
        elif ext=='.docx':
            lines,tables=docx_content(raw)
        elif ext=='.pdf':
            text,w=pdf_text(raw,path);entry['avisos']+=w;lines=text.splitlines()
            # Structured pipe or semicolon-separated rows in textual PDF only.
            structured=[l for l in lines if ';' in l or '|' in l]
            if structured:
                tables.append(('Tabela textual (prévia)',csv_text('\n'.join(structured))))
        elif ext=='.txt':
            lines=raw.decode('utf-8-sig','replace')[:MAX_TEXT_CHARS].splitlines()
            if any(';' in l or '|' in l for l in lines):
                tables.append(('Tabela textual (prévia)',csv_text('\n'.join(l for l in lines if ';' in l or '|' in l))))
        for tab,rows in tables:
            before=len(athletes)+len(matches)
            entry['registros']+=discover_tables(rows,dict(origin,aba=tab),athletes,matches,issues)
            # nonstructured tables still represented in excerpts so information isn't hidden
            for index,row in enumerate(rows[:150],start=1):
                excerpts.append({'arquivo':rel,'aba':tab,'linha':index,'ano':entry['ano'],'texto':plain(' | '.join(row))})
            entry['trechos']+=min(150,len(rows))
        before=len(excerpts)
        add_excerpt(excerpts,origin,'\n'.join(lines))
        entry['trechos']+=len(excerpts)-before
        if not entry['registros']:
            entry['avisos'].append('Nenhum registro com cabeçalho explícito encontrado; conferir trechos')
        if ext=='.pdf' and not lines:
            entry['avisos'].append('PDF sem texto extraível; verificar digitalização/OCR')
        if entry['avisos']:
            entry['status']='revisar'
    except Exception as e:  # um documento quebrado nunca interrompe todo o inventário
        entry['status']='erro';entry['avisos'].append(f'Falha de leitura: {str(e)[:200]}')
    return entry


def flag_duplicates(athletes: list, matches: list) -> None:
    names=defaultdict(list)
    for row in athletes:
        names[norm(row['nome'])].append(row)
    for grouped in names.values():
        if len(grouped)>1:
            for row in grouped:
                row['avisos'].append('Nome repetido em diferentes registros; não foi mesclado')
    keys=defaultdict(list)
    for r in matches:
        if r['data']:
            keys[(r['data'],norm(r['time_a']),norm(r['time_b']))].append(r)
    for rows in keys.values():
        if len(rows)>1:
            for row in rows:
                row['avisos'].append('Possível partida duplicada; não foi mesclada')


def write_csv(path: Path, records: list, columns: list[str]) -> None:
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=columns,extrasaction='ignore',delimiter=';')
        writer.writeheader()
        for r in records:
            flattened=dict(r)
            origin=flattened.pop('fonte',{})
            flattened.update({f'fonte_{k}':v for k,v in origin.items()})
            flattened['avisos']=' | '.join(flattened.get('avisos',[]))
            # Impede interpretação de células de origem externa como fórmulas no Excel.
            safe={key:("'"+val if isinstance(val,str) and val.lstrip().startswith(('=', '+', '-', '@')) else val)
                  for key,val in flattened.items()}
            writer.writerow(safe)


def make_html(folder: Path, report: dict) -> None:
    def table(title,values,columns,max_rows=200):
        bits=[f'<details open><summary>{html.escape(title)} ({len(values)})</summary>']
        bits.append('<div class="scroll"><table><thead><tr>'+''.join(f'<th>{html.escape(c)}</th>' for c in columns)+'</tr></thead><tbody>')
        for row in values[:max_rows]:
            bits.append('<tr>'+''.join(f'<td>{html.escape(plain(row.get(c,""),300))}</td>' for c in columns)+'</tr>')
        bits.append('</tbody></table></div></details>')
        if len(values)>max_rows:
            bits.append(f'<p>Exibindo somente {max_rows} registros. Consulte os arquivos CSV completos.</p>')
        return '\n'.join(bits)
    inventory=[{'arquivo':r['arquivo'],'ano':r['ano'] or 'Não identificado','tipo':r['tipo'],
            'status':r['status'],'registros':str(r['registros']),'avisos':' | '.join(r['avisos'])} for r in report['arquivos']]
    athletes=[{'nome':r['nome'],'apelido':r['apelido'],'numero':r['numero'],'temporada':r['temporada'],
               'fonte':r['fonte']['arquivo'],'avisos':' | '.join(r['avisos'])} for r in report['atletas']]
    matches=[{'data':r['data'],'temporada':r['temporada'],'time_a':r['time_a'],'time_b':r['time_b'],
              'placar':r['placar'] or (r['gols_a']+' x '+r['gols_b'] if r['gols_a'] and r['gols_b'] else ''),
              'fonte':r['fonte']['arquivo'],'avisos':' | '.join(r['avisos'])} for r in report['partidas']]
    header='''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EGIDIUS · Prévia histórica</title><style>
    body{background:#fff9ef;color:#352415;font-family:system-ui,-apple-system,Arial;margin:0 auto;max-width:1200px;padding:24px}h1{color:#aa4910}small{color:#744e38}details{border:1px solid #dabca0;border-radius:14px;margin:16px 0;background:#fff;padding:16px}summary{font-size:20px;font-weight:700;cursor:pointer;min-height:40px}th{background:#f4ca84}td,th{border:1px solid #e6d8c9;padding:10px;text-align:left}table{border-collapse:collapse;width:100%;font-size:14px}.scroll{overflow:auto;margin-top:12px}.notice{background:#fff1d5;padding:14px;border-left:5px solid #c77518;border-radius:8px} @media(max-width:600px){body{padding:12px}td,th{padding:7px}}</style></head><body>
    <h1>EGIDIUS 2.0 · Acervo histórico</h1><p class="notice"><strong>Prévia de leitura, não importação oficial.</strong> Nenhuma informação foi gravada no banco SQLite. Confirme nomes, partidas, datas e fontes antes de aprovar.</p>'''
    contents=[header,'<p><strong>Arquivos:</strong> '+str(len(inventory))+' · <strong>Atletas candidatos:</strong> '+str(len(athletes))+' · <strong>Partidas candidatas:</strong> '+str(len(matches))+'</p>',
        table('Fontes analisadas',inventory,['arquivo','ano','tipo','status','registros','avisos']),
        table('Atletas identificados em tabelas',athletes,['nome','apelido','numero','temporada','fonte','avisos']),
        table('Partidas identificadas em tabelas',matches,['data','temporada','time_a','time_b','placar','fonte','avisos']),
        '<p><small>Linhas não estruturadas e textos de PDF estão no CSV de trechos, para revisão manual. Não há reconhecimento OCR nem identificação automática de pessoas em prosa.</small></p></body></html>']
    (folder/'PREVIA.html').write_text('\n'.join(contents),encoding='utf-8')


def init(base: Path):
    root=base/'fontes';out=base/'previews';models=base/'modelos'
    for p in (root/'2026',root/'ano_desconhecido',out,models):p.mkdir(parents=True,exist_ok=True)
    def make_template(name,headers):
        path=models/name
        if not path.exists():
            write_csv(path,[],headers)
    make_template('modelo_atletas.csv',['nome','apelido','numero','posicao','ano'])
    make_template('modelo_partidas.csv',['data','time_a','time_b','placar','ano'])
    print(f'ACERVO PREPARADO: {base}')
    print(f'Coloque os arquivos originais em: {root}/ANO/ (por exemplo, fontes/2012/)')
    print('Arquivos de modelos criados. Nenhum dado do EGIDIUS foi alterado.')


def analyze(base: Path):
    root=base/'fontes'
    if not root.is_dir():
        raise SystemExit('Pasta de fontes não existe. Execute primeiro: iniciar')
    files=sorted((p for p in root.rglob('*') if p.is_file() and not p.name.startswith('.')),
                 key=lambda p:str(p).casefold())
    if len(files)>2000:
        raise SystemExit('Mais de 2000 arquivos: divida a importação em lotes menores.')
    athletes=[];matches=[];excerpts=[];issues=[];inventory=[];hashes={}
    for path in files:
        info=scan_file(path,root,athletes,matches,excerpts,issues)
        if info['sha256'] in hashes:
            info['avisos'].append('Cópia idêntica ao arquivo '+hashes[info['sha256']]);info['status']='duplicado'
            # Remove candidates from duplicated source to avoid double counts
            rel=info['arquivo']
            athletes[:]=[x for x in athletes if x['fonte']['arquivo']!=rel]
            matches[:]=[x for x in matches if x['fonte']['arquivo']!=rel]
            excerpts[:]=[x for x in excerpts if x['arquivo']!=rel]
        else:
            hashes[info['sha256']]=info['arquivo']
        inventory.append(info)
    flag_duplicates(athletes,matches)
    # deterministic version suffix without overwriting previews
    folder=base/'previews'/dt.datetime.now().strftime('ANALISE_%Y%m%d_%H%M%S_%f')
    folder.mkdir(parents=True,exist_ok=False)
    report={'versao':'09H1','gerado_em':dt.datetime.now(dt.timezone.utc).isoformat(),
            'aviso':'PRÉVIA. NENHUMA GRAVAÇÃO NO SQLITE.',
            'arquivos':inventory,'atletas':athletes,'partidas':matches,'trechos':excerpts,'alertas':issues}
    (folder/'inventario.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    write_csv(folder/'arquivos.csv',inventory,['arquivo','tipo','bytes','sha256','ano','status','registros','trechos','avisos'])
    write_csv(folder/'atletas_candidatos.csv',athletes,['nome','apelido','numero','posicao','temporada','gols','fonte_arquivo','fonte_aba','fonte_linha','avisos'])
    write_csv(folder/'partidas_candidatas.csv',matches,['data','time_a','time_b','placar','gols_a','gols_b','temporada','fonte_arquivo','fonte_aba','fonte_linha','avisos'])
    write_csv(folder/'trechos_para_conferencia.csv',excerpts,['arquivo','aba','linha','ano','texto'])
    make_html(folder,report)
    print('LEITURA CONCLUÍDA — NENHUMA ALTERAÇÃO NO BANCO')
    print(f'Arquivos: {len(inventory)} | Atletas candidatos: {len(athletes)} | Partidas candidatas: {len(matches)}')
    print('Resultado:',folder)
    print('Abra PREVIA.html e confira os CSV. Ainda não existem registros oficialmente importados.')
    return folder


def main(argv=None):
    parser=argparse.ArgumentParser(description='EGIDIUS 09H1 — triagem histórica somente leitura')
    parser.add_argument('comando',choices=['iniciar','analisar','status'])
    parser.add_argument('--pasta',type=Path,default=Path(os.environ.get('EGIDIUS_ACERVO_HOME', str(Path.home()/'Documents'/'EGIDIUS_ACERVO'))))
    args=parser.parse_args(argv)
    base=args.pasta.expanduser().resolve()
    if args.comando=='iniciar': init(base)
    elif args.comando=='analisar': analyze(base)
    else:
        root=base/'fontes'
        print('Pasta:',root)
        print('Arquivos encontrados:',sum(1 for p in root.rglob('*') if p.is_file()) if root.is_dir() else 0)
        print('Banco esportivo: não acessado.')

if __name__=='__main__':
    main()
