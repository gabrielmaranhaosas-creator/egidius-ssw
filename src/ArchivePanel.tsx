import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { usePapel } from './Permissoes';
import { useTrabalhoPendente } from './TrabalhoPendente';
import { getCsrf, listMedia, mediaSize, removeMedia, uploadMedia } from './mediaClient';
import type { MediaItem } from './mediaClient';
import { LixeiraArquivos } from './LixeiraArquivos';

const FORMATS = '.xlsx,.xls,.ods,.csv,.tsv,.txt,.json,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp';
const PAGE_SIZE = 50;

export function ArchivePanel() {
  const consulta = usePapel() === 'viewer';
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const serial = useRef(0);
  const offset = useRef(0);
  const inFlight = useRef(false);
  useTrabalhoPendente('arquivo-historico', busy || files.length > 0 || !!caption, 'Arquivos históricos ainda não enviados', busy);

  async function reload(more = false) {
    const request = ++serial.current;
    setLoading(true);
    try {
      const start = more ? offset.current : 0;
      const rows = await listMedia({ scope: 'archive', offset: start, limit: PAGE_SIZE });
      if (request !== serial.current) return;
      offset.current = start + rows.length;
      setItems(previous => more ? [...new Map([...previous, ...rows].map(item => [item.id, item])).values()] : rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      if (request === serial.current) setError(e instanceof Error ? e.message : 'Não foi possível consultar o arquivo.');
    } finally {
      if (request === serial.current) setLoading(false);
    }
  }
  useEffect(() => { void reload(); return () => { serial.current++; }; }, []);

  async function send() {
    if (inFlight.current || !files.length) return;
    inFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    let remaining = [...files];
    let sent = 0;
    try {
      if (files.length > 12) throw new Error('Selecione até 12 arquivos por envio.');
      if (files.some(file => file.size > 20 * 1024 * 1024 || file.size === 0)) {
        throw new Error('Cada arquivo deve ter conteúdo e até 20 MB.');
      }
      const csrf = await getCsrf();
      for (const file of files) {
        await uploadMedia(file, { scope: 'archive', kind: 'document', caption }, csrf);
        sent++;
        remaining = remaining.slice(1);
        setFiles(remaining);
        setMessage(`${sent} arquivo(s) guardado(s) no acervo.`);
      }
      setCaption('');
      if (picker.current) picker.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio. Confira os arquivos que ainda estão selecionados.');
    } finally {
      if (sent) await reload();
      setBusy(false); inFlight.current = false;
    }
  }
  async function remove(item: MediaItem) {
    if (inFlight.current || !window.confirm(`Enviar ${item.filename} à lixeira? Você poderá restaurá-lo.`)) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await removeMedia(item.id, await getCsrf());
      setMessage('Arquivo enviado à lixeira.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o arquivo.');
    } finally { setBusy(false); inFlight.current = false; }
  }

  return <div className="archive-panel">
    {!consulta && <section className="archive-upload">
      <h3><FileUp size={22}/> Guardar documentos históricos</h3>
      <p>Planilhas, PDFs, imagens, textos e apresentações. O acervo pode receber arquivos de qualquer época.</p>
      <p>Excel (XLSX/XLS), ODS, CSV, TSV, PDF, JPEG, PNG, WebP, Word (DOCX/DOC), ODT, RTF, TXT, JSON, PowerPoint (PPTX/PPT) e ODP. Até 20 MB por arquivo e 12 por envio. PDFs sem senha, com até 300 páginas. Textos em UTF-8 ou Windows-1252; JSON em UTF-8.</p>
      <label>Descrição ou período, se desejar
        <input maxLength={250} value={caption} disabled={busy} onChange={event => setCaption(event.target.value)} placeholder="Ex.: Escalações e resultados de 2015"/>
      </label>
      <label className="archive-picker"><FileUp size={22}/> Escolher arquivos
        <input ref={picker} aria-label="Arquivos do acervo histórico" type="file" accept={FORMATS} multiple disabled={busy}
          onChange={event => { setFiles(Array.from(event.target.files || [])); setMessage(''); setError(''); }}/>
      </label>
      {files.length > 0 && <div className="archive-selection">
        <ul>{files.map((file, index) => <li key={index}>{file.name} · {mediaSize(file.size)}</li>)}</ul>
        <button type="button" disabled={busy} onClick={() => { setFiles([]); if (picker.current) picker.current.value = ''; }}><Undo2 size={18}/> Limpar seleção</button>
      </div>}
      <button type="button" className="archive-send" disabled={busy || !files.length} onClick={() => void send()}>{busy ? 'Guardando arquivos…' : `Guardar ${files.length || ''} arquivo(s)`}</button>
    </section>}
    {error && <p role="alert" className="media-alert media-alert--error">{error}</p>}
    {message && <p role="status" className="media-alert">{message}</p>}
    <div className="archive-heading"><h3>Acervo histórico</h3><button type="button" disabled={busy || loading} onClick={() => { setError(''); void reload(); }}><RefreshCw size={18}/> Atualizar</button></div>
    {!loading && !items.length && <p>Nenhum documento guardado no acervo.</p>}
    {loading && <p role="status">Consultando o acervo…</p>}
    <ul className="archive-files">{items.map(item => <li key={item.id}>
      <div><strong>{item.filename}</strong>{item.caption && <p>{item.caption}</p>}<small>{mediaSize(item.size)} · Guardado em {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'data não informada'}</small></div>
      <div className="archive-file-actions"><a href={item.url} download={item.filename}><Download size={18}/> Baixar</a>{!consulta && <button type="button" disabled={busy} aria-label={`Excluir ${item.filename}`} onClick={() => void remove(item)}><Trash2 size={18}/> Excluir</button>}</div>
    </li>)}</ul>
    {hasMore && <button type="button" disabled={loading || busy} onClick={() => void reload(true)}>Carregar mais documentos</button>}
    <p className="archive-note">Os arquivos enviados ficam no acervo com seu conteúdo original. Para cadastrar jogadores a partir de uma planilha, use a importação em Jogadores.</p>
    {!consulta && <LixeiraArquivos atualizar={() => { void reload(); }}/>}
  </div>;
}
