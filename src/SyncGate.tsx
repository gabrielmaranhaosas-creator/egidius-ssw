import { RevisarConflitos } from './RevisarConflitos';
import type { Mescla } from './MesclarEstados';
import { mesclarEstados } from './MesclarEstados';
import { useResumoPendencias,podeAbandonarEdicao } from './TrabalhoPendente';
import { definirPapel,usePapel } from './Permissoes';
import { EntradaOrganizacao,Organizacao } from './Organizacao';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { criarAcessoSemSenha } from './Acesso';
import { Cloud, CloudOff, RefreshCw, ShieldCheck, Download, LogOut, AlertTriangle } from 'lucide-react';
import { adotarDadosDoServidor, definirGravacaoPermitida, exportarBackup, observarMudancas, obterDadosAtuais } from './SSWStore';
import type { DadosSSW } from './SSWStore';
import './SyncGate.css';
import { definirOperadorMontagem, podeSairDaMontagem, useMontagensPendentes } from './MontagemDrafts';

type Remote = { revision: number; data: DadosSSW };
type View = 'review'|'loading'|'offline'|'closed'|'choice'|'ready';
type Status = 'saved'|'sending'|'offline'|'conflict';
type Connection = { revision: number; lastSaved: string; csrf: string; pending: boolean; blocked: boolean; alive: boolean };
const empty = (d:DadosSSW) => !d.jogadores.length && !d.rodadas.length;
// A API normaliza os campos dos objetos; igualdade sem depender da ordem das chaves.
function stableStringify(value:unknown):string {
  const normalizar = (v:unknown):unknown => Array.isArray(v) ? v.map(normalizar)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalizar(item)]))
      : v;
  return JSON.stringify(normalizar(value));
}

async function api<T>(path:string, options: RequestInit = {}):Promise<T> {
  let response:Response;
  try { response = await fetch(`/api${path}`, { ...options, credentials:'same-origin', cache:'no-store' }); }
  catch { throw new Error('Não foi possível falar com o servidor. Confira sua conexão e tente novamente; suas alterações locais foram mantidas.'); }
  if (!response.ok) {
    const body = await response.json().catch(()=>null) as {detail?:string}|null;
    const err = new Error(body?.detail || `Erro HTTP ${response.status}`) as Error & {code?:number};
    err.code = response.status;
    throw err;
  }
  return response.json() as Promise<T>;
}

const entrarSemSenha = criarAcessoSemSenha(api, () => new URL(window.location.href), () => {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
});

function salvarJSON(data:unknown, titulo:string) {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);const a = document.createElement('a');
  a.href=url; a.download=titulo;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10_000);
}

export function SyncGate({children}:{children:ReactNode}) {
  const [revisao,setRevisao]=useState<{mescla:Mescla;remoto:Remote}|null>(null);
  const pendencias=useResumoPendencias();
  const papel=usePapel();
  const [loginAberto,setLoginAberto]=useState(false);
  const [adminAberto,setAdminAberto]=useState(false);
  const montagensPendentes = useMontagensPendentes();
  const [view,setView] = useState<View>('loading');
  const [status,setStatus] = useState<Status>('saved');
  const [message,setMessage] = useState('');
  const [username,setUsername] = useState('');
  const [backupConfirmed,setBackupConfirmed] = useState(false);
  const [selected,setSelected] = useState<Remote|null>(null);
  const [decision,setDecision] = useState<'first'|'divergent'>('first');
  const session = useRef<Connection|null>(null);
  const stopped = useRef(false);
  const user = useRef('');

  async function sync() {
    const s = session.current;
    if (!s || !s.alive || s.pending || s.blocked || stopped.current) return;
    const snap = stableStringify(obterDadosAtuais());
    let envioBemSucedido = false;
    if (snap === s.lastSaved) { setStatus('saved');return; }
    s.pending = true; setStatus('sending');
    try {
      const update = await api<{revision:number}>('/state',{
        method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},
        body: JSON.stringify({expected_revision:s.revision,data:JSON.parse(snap)}),
      });
      // Nunca confirme como salvo aquilo que foi editado durante o request.
      s.revision = update.revision;
      s.lastSaved = snap;
      envioBemSucedido = true;
      setMessage('');setStatus('saved');
    } catch(err) {
      const error=err as Error & {code?:number};
      if (error.code===409) {
        try {
          const remoto=await api<Remote>('/state');
          const resultado=mesclarEstados(JSON.parse(s.lastSaved),obterDadosAtuais(),remoto.data);
          if(!resultado.data)throw new Error(`Edições simultâneas no mesmo registro: ${resultado.conflitos.join(', ')}.`);
          // A validação do store impede aplicar uma combinação esportiva inconsistente.
          adotarDadosDoServidor(resultado.data);s.revision=remoto.revision;s.lastSaved=stableStringify(remoto.data);envioBemSucedido=true;
          setStatus(stableStringify(resultado.data)===s.lastSaved?'saved':'sending');setMessage(stableStringify(resultado.data)===s.lastSaved?'':'Alterações independentes reunidas. Confirmando o salvamento…');
        } catch(e) {s.blocked=true;setStatus('conflict');setMessage(`${(e as Error).message} Seus ajustes foram preservados. Baixe uma cópia antes de escolher a versão.`);}
      }
      else if (error.code===401 || error.code===403) {
        s.blocked=true;setStatus('offline');setMessage(error.code===401?'Sessão expirada. Salve seu backup e abra novamente o EGIDIUS.':`${error.message} Seus ajustes locais foram mantidos. Entre novamente para atualizar seu acesso.`);
      } else { setStatus('offline');setMessage(error.message); }
    } finally {
      s.pending=false;
    }
    if (envioBemSucedido && session.current===s && !s.blocked && stableStringify(obterDadosAtuais())!==s.lastSaved) {
      // Atraso curto para agrupar mudanças consecutivas; em caso de rede indisponível, o poll fará retry.
      window.setTimeout(()=>void sync(),350);
    }
  }

  function conectar(remote:Remote, csrf:string, nome:string) {
    definirOperadorMontagem(nome);
    session.current={revision:remote.revision,lastSaved:stableStringify(remote.data),csrf,pending:false,blocked:false,alive:true};
    user.current=nome;setUsername(nome);setStatus('saved');setMessage('');
    setView('ready');
  }
  function escolher(remote:Remote, csrf:string, nome:string) {
    const local = obterDadosAtuais();
    if (stableStringify(local) === stableStringify(remote.data)) { conectar(remote,csrf,nome);return; }
    if (empty(local)) { adotarDadosDoServidor(remote.data);conectar(remote,csrf,nome);return; }
    setSelected(remote);user.current=nome;setUsername(nome);
    session.current={revision:remote.revision,lastSaved:stableStringify(remote.data),csrf,pending:false,blocked:true,alive:true};
    setDecision(empty(remote.data)?'first':'divergent');setBackupConfirmed(false);setView('choice');
  }
  async function restoreSession() {
    setMessage('');setView('loading');
    try {
      const auth = await entrarSemSenha();
      if (!auth.authenticated || !auth.csrf || !auth.username) throw new Error('Acesso indisponível. Abra novamente o EGIDIUS.');
      definirPapel(auth.role ?? 'operator');definirGravacaoPermitida(auth.role!=='viewer');
      const remote=await api<Remote>('/state');
      if (auth.role==='viewer' || auth.username === 'confrade_ssw') {
        // Convite coletivo: nunca oferecer importação automática do histórico
        // local de testes do celular para a base pública recém-criada.
        adotarDadosDoServidor(remote.data);
        conectar(remote,auth.csrf,auth.username);
        return;
      }
      escolher(remote,auth.csrf,auth.username);
    } catch(err) {setMessage((err as Error).message);setView('offline');}
  }
  useEffect(()=>{stopped.current=false;void restoreSession();return()=>{stopped.current=true;if(session.current)session.current.alive=false;};},[]);
  useEffect(()=>{
    if (view!=='ready') return;
    const unsub=observarMudancas(()=>void sync());
    const timer=window.setInterval(()=>{
      if(window.document?.visibilityState==='hidden')return;
      void refresh();
    },12_000);
    const onFocus=()=>void refresh();window.addEventListener('focus',onFocus);
    const onVisible=()=>{if(window.document?.visibilityState==='visible')void refresh();};
    window.document?.addEventListener('visibilitychange',onVisible);
    return ()=>{unsub();window.clearInterval(timer);window.removeEventListener('focus',onFocus);
      window.document?.removeEventListener('visibilitychange',onVisible);};
  },[view]);

  async function refresh(){
    const s=session.current;
    if (!s || s.pending || s.blocked || stopped.current) return;
    if (stableStringify(obterDadosAtuais()) !== s.lastSaved) {void sync();return;}
    const revisionAtStart=s.revision;
    const savedAtStart=s.lastSaved;
    try {
      const remote=await api<Remote>('/state');
      // Uma leitura iniciada antes de uma gravação não pode desfazer essa gravação.
      if (session.current!==s || !s.alive || stopped.current || s.pending || s.blocked
          || s.revision!==revisionAtStart || s.lastSaved!==savedAtStart) return;
      if (remote.revision<s.revision) return;
      if (stableStringify(obterDadosAtuais())!==s.lastSaved) {
        if (remote.revision!==s.revision) {
          s.blocked=true;setStatus('conflict');
          setMessage('Outra sessão atualizou o EGIDIUS. Seus dados locais foram mantidos. Exporte o backup antes de resolver o conflito.');
        } else {void sync();}
        return;
      }
      if (remote.revision!==s.revision) {
        s.revision=remote.revision;
        s.lastSaved=stableStringify(remote.data);
        adotarDadosDoServidor(remote.data);
      }
      setStatus('saved');setMessage('');
    }catch(e){
      if (session.current===s && s.alive && !stopped.current && !s.pending && !s.blocked
          && s.revision===revisionAtStart && s.lastSaved===savedAtStart) {
        setStatus('offline');setMessage((e as Error).message);
      }
    }
  }
  async function escolherServidor() {
    if (!selected || !session.current) return;
    if (!backupConfirmed) {setMessage('Baixe uma cópia dos registros locais e confirme antes de substituir.');return;}
    adotarDadosDoServidor(selected.data);conectar(selected,session.current.csrf,user.current);
  }
  async function enviarLocal() {
    const s=session.current;if(!selected||!s) return;
    if (!empty(selected.data)) {
      if(!window.confirm('SUBSTITUIR os registros do servidor por estes dados locais? Um backup do servidor será baixado antes do envio. Outros usuários podem ter registros diferentes.'))return;
      salvarJSON({...selected.data,revision:selected.revision},`egidius-servidor-antes-importacao-${selected.revision}.json`);
    }
    const local=obterDadosAtuais();
    try {
      const updated=await api<{revision:number}>('/state', {method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},
        body:JSON.stringify({expected_revision:selected.revision,data:local})});
      conectar({revision:updated.revision,data:local},s.csrf,user.current);
    }catch(e){setMessage((e as Error).message);if((e as Error & {code?:number}).code===409) setDecision('divergent');}
  }
  async function resolverConflito() {
    const s=session.current;if(!s)return;
    if(!podeAbandonarEdicao()||!podeSairDaMontagem())return;
    exportarBackup();
    try {
      const remote=await api<Remote>('/state');
      const mescla=mesclarEstados(JSON.parse(s.lastSaved),obterDadosAtuais(),remote.data);
      setRevisao({mescla,remoto:remote});setView('review');return;
    }catch(e){setMessage((e as Error).message);}
  }
  async function logout() {
    if (!podeAbandonarEdicao() || !podeSairDaMontagem()) return;
    const s=session.current;if(!s)return;
    if(stableStringify(obterDadosAtuais())!==s.lastSaved && !window.confirm('Existem alterações ainda não sincronizadas. Deseja sair? Exporte um backup primeiro.'))return;
    try {await api('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':s.csrf}});}catch{ /* servidor pode estar offline */ }
    s.alive=false;session.current=null;setView('closed');setStatus('saved');
  }
  if(view==='review'&&revisao)return <RevisarConflitos mescla={revisao.mescla} cancelar={()=>setView('ready')} salvar={async data=>{const s=session.current;if(!s)throw Error('Sessão expirada. Abra novamente o EGIDIUS.');const result=await api<{revision:number}>('/state',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({expected_revision:revisao.remoto.revision,data})});adotarDadosDoServidor(data);conectar({revision:result.revision,data},s.csrf,user.current);setRevisao(null);}}/>;
  if (view==='ready') return <>
    <div className={`sync-banner sync-banner--${status}`} role="status">
      {status==='saved'?<ShieldCheck size={20}/>:status==='sending'?<RefreshCw size={20}/>:<CloudOff size={20}/>}
      <strong>{status==='saved'&&pendencias?'Alterações ainda não salvas':status==='saved'?(montagensPendentes ? 'Times por confirmar' : 'Salvo no servidor'):status==='sending'?'Sincronizando…':status==='offline'?'Sem conexão com servidor':'Conflito entre dispositivos'}</strong>
      <span>{message || pendencias || (montagensPendentes ? 'Rascunho guardado neste navegador; confirme os times para aplicar.' : username === 'operador_local' ? 'Acesso pelo Mac · dados sincronizados' : 'Dados sincronizados entre dispositivos')}</span>
      {papel==='viewer'&&<span>Acesso de consulta</span>}
      <button type="button" onClick={()=>{if(podeAbandonarEdicao()&&podeSairDaMontagem())setLoginAberto(true);}}>Acesso de organização</button>
      {papel==='admin'&&<button type="button" onClick={()=>{if(podeAbandonarEdicao()&&podeSairDaMontagem())setAdminAberto(true);}}>Organização e acessos</button>}
      {montagensPendentes>0 && <button type="button" onClick={() => window.dispatchEvent(new Event('egidius:abrir-montagem'))}>Retomar montagem</button>}
      {status==='offline'&&<button onClick={()=>void refresh()} type="button">Tentar novamente</button>}
      {status==='conflict'&&<button onClick={()=>void resolverConflito()} type="button">Resolver conflito</button>}
      <button onClick={()=>exportarBackup()} type="button" title="Baixar cópia de segurança"><Download size={19}/><span className="sync-small">Backup JSON</span></button>
      <button onClick={()=>void logout()} type="button" title="Sair"><LogOut size={19}/><span className="sync-small">Sair</span></button>
    </div>
    {loginAberto?<EntradaOrganizacao cancelar={()=>setLoginAberto(false)} concluido={()=>{setLoginAberto(false);void restoreSession();}}/>:adminAberto?<Organizacao usuario={username} voltar={()=>setAdminAberto(false)}/>:children}
  </>;
  if(loginAberto)return <div className="gate-wrap"><EntradaOrganizacao cancelar={()=>setLoginAberto(false)} concluido={()=>{setLoginAberto(false);void restoreSession();}}/></div>;
  return <div className="gate-wrap"><main className="gate-card">
    <div className="gate-logo"><img src="/ssw-escudo-real.jpg" alt="Escudo do Sábado Show"/><div><b>EGIDIUS<span>.</span></b><small>SÁBADO SHOW</small></div></div>
    {view==='loading'&&<><Cloud size={32}/><h1>Conectando ao servidor</h1><p>Conferindo sua sessão e os registros das súmulas.</p></>}
    {view==='offline'&&<><CloudOff size={32}/><h1>{message.toLocaleLowerCase().includes('convite') ? 'Convite de acesso necessário' : 'Não foi possível conectar'}</h1><p>{message}</p><p>{message.toLocaleLowerCase().includes('convite') ? 'Abra o link completo de convite recebido. O endereço simples do site ainda não libera o primeiro acesso neste dispositivo.' : 'Tente novamente. Se estiver usando a versão local no Mac, confira se o servidor está iniciado.'}</p><button className="gate-primary" onClick={()=>void restoreSession()}>{message.toLocaleLowerCase().includes('convite')?'Já tenho o convite — verificar acesso':'Tentar novamente'}</button><button type="button" onClick={()=>setLoginAberto(true)}>Acesso de organização</button></>}
    {view==='closed'&&<><ShieldCheck size={32}/><h1>Acesso encerrado</h1><p>No Mac, clique abaixo para abrir novamente. Em outro dispositivo, utilize seu convite.</p><button className="gate-primary" onClick={()=>void restoreSession()}>Abrir EGIDIUS</button><button type="button" onClick={()=>setLoginAberto(true)}>Acesso de organização</button></>}
    {view==='choice'&&selected&&<><AlertTriangle size={32}/><h1>{decision==='first'?'Trazer seus dados antigos':'Escolher a base de trabalho'}</h1>
      <p>{decision==='first'?'O servidor está vazio, mas este navegador contém atletas ou rodadas. Nada será importado sem sua escolha.':'Este navegador e o servidor possuem dados diferentes. Nenhuma fonte foi sobrescrita.'}</p>
      <div className="gate-choice"><strong>Neste navegador</strong><span>{obterDadosAtuais().rodadas.length} rodadas · {obterDadosAtuais().jogadores.length} atletas</span></div>
      <div className="gate-choice"><strong>No servidor</strong><span>{selected.data.rodadas.length} rodadas · {selected.data.jogadores.length} atletas</span></div>
      {papel==='admin'&&<button className="gate-primary" onClick={()=>void enviarLocal()}>{decision==='first'?'Enviar os dados deste navegador ao servidor':'Substituir servidor pelos meus registros locais (com confirmação)'}</button>}
      <button className="gate-secondary" onClick={()=>{exportarBackup();setBackupConfirmed(true);}}>1. Baixar backup deste navegador</button>
      <label className="gate-confirm"><input type="checkbox" checked={backupConfirmed} onChange={e=>setBackupConfirmed(e.target.checked)}/> Já conferi que tenho uma cópia dos registros locais.</label>
      <button className="gate-secondary" disabled={!backupConfirmed} onClick={()=>void escolherServidor()}>2. Abrir os dados armazenados no servidor</button>
      <p className="gate-hint">Nenhuma importação é automática. Verifique seus downloads antes de substituir registros.</p></>}
    {message&&view!=='offline'&&<p role="alert" className="gate-warning">{message}</p>}
  </main></div>;
}
