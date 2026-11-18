import type { FormEvent } from 'react';
import { useState } from 'react';
import { ArrowRight, CalendarDays, ChevronRight, ClipboardList, Plus, Shield, UsersRound } from 'lucide-react';
import { atualizarDados, dataFormatada, novoId, proximoSabado, useDadosSSW } from './SSWStore';
import { rodadaCentral, statusRodada, ultimosJogos } from './CampoRules';
import { jornadaSabado } from './JornadaSabado';
import { prepararSabado } from './InicioRules';
import { usePapel } from './Permissoes';
import type { CampoDestino } from './CampoRules';
export type { CampoDestino } from './CampoRules';
import './CampoPage.css';
import './styles/ssw-inicio-celular.css';

export function CampoPage({ abrir, abrirExpressa, rodadaId, onRodadaChange }: {
  abrir: (destino: CampoDestino, rodadaId?: string, partidaId?: string) => void;
  abrirExpressa: (rodadaId?: string, partidaId?: string) => void;
  rodadaId: string;
  onRodadaChange: (id: string) => void;
}) {
  const dados=useDadosSSW(), rodada=rodadaCentral(dados,rodadaId);
  const resumo=statusRodada(rodada,dados.jogadores), jornada=jornadaSabado(rodada,dados);
  const consulta=usePapel()==='viewer';
  const [criando,setCriando]=useState(false), [data,setData]=useState(proximoSabado);
  const [erro,setErro]=useState(''), [todos,setTodos]=useState(false);
  const jogos=ultimosJogos(rodada), visiveis=todos?jogos:jogos.slice(0,3);
  function ir(destino:CampoDestino){abrir(destino,rodada?.id);}
  function continuar(){
    if(jornada.tipo==='sumula')abrirExpressa(rodada?.id,jornada.jogoId);
    else if(jornada.tipo==='chegadas')ir('presencas');
    else ir(jornada.destino);
  }
  function criar(event:FormEvent){
    event.preventDefault();if(consulta)return;
    try{
      const resultado=prepararSabado(dados,data,novoId());
      atualizarDados(()=>resultado.dados,'criação de sábado pelo Início');
      onRodadaChange(resultado.id);setCriando(false);setErro('');
      abrir(dados.jogadores.length?'presencas':'cadastro',resultado.id);
    }catch(e){setErro(e instanceof Error?e.message:'Não foi possível criar o sábado.');}
  }
  return <div className="campo-page inicio-celular">
    <header className="inicio-cabecalho"><span>SÁBADO SHOW</span><h1>Vamos jogar.</h1></header>
    <section className="inicio-data" aria-label="Sábado selecionado">
      {dados.rodadas.length>0 && <label><CalendarDays size={20} aria-hidden="true"/><span>Qual sábado?</span><select aria-label="Selecionar sábado" value={rodada?.id??''} onChange={e=>{onRodadaChange(e.target.value);setTodos(false);setCriando(false);setErro('');}}>{[...dados.rodadas].sort((a,b)=>b.data.localeCompare(a.data)).map(r=><option key={r.id} value={r.id}>{dataFormatada(r.data)}</option>)}</select></label>}
      {rodada && <div className="inicio-numeros" aria-label="Resumo do sábado"><span><strong>{resumo.presentes}</strong> presentes</span><span><strong>{resumo.timesCompletos}</strong> times completos</span><span><strong>{resumo.encerrados}</strong> encerrados</span></div>}
      {(!rodada||criando) ? <form onSubmit={criar} className="inicio-criar" aria-label="Criar sábado">
        <h2>{rodada?'Novo sábado':'Seu primeiro sábado'}</h2><p>Escolha a data para começar. Depois, cadastre os jogadores e marque as presenças.</p>
        <label htmlFor="inicio-data-sabado">Data do sábado</label><input id="inicio-data-sabado" type="date" value={data} required onChange={e=>{setData(e.target.value);setErro('');}}/>
        {erro && <p role="alert" className="campo-error">{erro}</p>}
        <button type="submit" className="inicio-principal" disabled={consulta}>Criar sábado e continuar <ArrowRight size={20}/></button>
        {rodada && <button type="button" onClick={()=>{setCriando(false);setErro('');}}>Cancelar</button>}
      </form> : <button type="button" className="inicio-outra-data" disabled={consulta} onClick={()=>setCriando(true)}><Plus size={17}/> Novo sábado</button>}
    </section>
    {rodada && <>
      {!consulta && <section className="inicio-continuar" aria-label="Próximo passo"><span>AGORA</span><h2>{jornada.titulo}</h2><p>{jornada.texto}</p><button type="button" className="inicio-principal" onClick={continuar}>{jornada.acao}<ArrowRight size={21}/></button></section>}
      {consulta && <p>Você está no modo consulta. A organização registra as alterações.</p>}
      <nav className="inicio-atalhos" aria-label="Organizar o sábado">
        <button type="button" onClick={()=>ir(dados.jogadores.length?'presencas':'cadastro')}><UsersRound size={23}/><span><strong>Presenças</strong><small>{dados.jogadores.length?`${resumo.presentes} de ${dados.jogadores.length} com presença`:'Cadastrar os primeiros jogadores'}</small></span><ChevronRight size={20}/></button>
        <button type="button" onClick={()=>ir('times')}><Shield size={23}/><span><strong>Montar times</strong><small>Escolha os jogadores e faça as trocas</small></span><ChevronRight size={20}/></button>
        <button type="button" onClick={()=>abrirExpressa(rodada.id)}><ClipboardList size={23}/><span><strong>Partidas e súmulas</strong><small>{resumo.rascunhos?`${resumo.rascunhos} em edição`:'Criar jogo, marcar gols e encerrar'}</small></span><ChevronRight size={20}/></button>
      </nav>
      <section className="inicio-jogos" aria-label="Jogos deste sábado"><h2>Jogos deste sábado</h2>
        {!jogos.length && <p>Nenhum jogo criado. Monte os times para começar.</p>}
        {visiveis.map(j=><button type="button" key={j.id} onClick={()=>abrirExpressa(rodada.id,j.id)} aria-label={`Abrir jogo ${j.numero}: ${j.timeA} ${j.golsA} a ${j.golsB} ${j.timeB}`}><span className="inicio-jogo-meta">Jogo {j.numero} · {j.status==='encerrada'?'Encerrado':'Em edição'}</span><span className="inicio-placar"><span>{j.timeA}</span><strong>{j.golsA} × {j.golsB}</strong><span>{j.timeB}</span></span><ChevronRight size={20}/></button>)}
        {jogos.length>3 && <button type="button" className="inicio-ver-todos" onClick={()=>setTodos(!todos)}>{todos?'Mostrar menos':`Ver os ${jogos.length} jogos`}</button>}
      </section>
    </>}
  </div>;
}
