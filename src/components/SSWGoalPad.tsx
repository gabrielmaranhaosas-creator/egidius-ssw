import { Minus, Plus, Shield } from 'lucide-react';
import type { Partida } from '../SSWStore';
import type { Lado } from '../ExpressRules';

type Props = {
  jogo: Partida;
  nomes: Map<string, string>;
  lado: Lado;
  mudarLado: (lado: Lado) => void;
  adicionar: (lado: Lado, jogadorId: string) => void;
  remover: (lado: Lado, jogadorId: string) => void;
  presentes?: string[];
  escolherGoleiro?: (lado:Lado,id:string) => void;
  substituir?: (lado:Lado,sai:string,entra:string) => void;
};

/** Uma equipe por vez para facilitar o toque, com gol e correção na mesma linha. */
export function SSWGoalPad({ jogo, nomes, lado, mudarLado, adicionar, remover, presentes=[], escolherGoleiro, substituir }: Props) {
  const encerrada = jogo.status === 'encerrada';
  const atletas = lado === 'A' ? jogo.atletasA : jogo.atletasB;
  const goleiro = lado === 'A' ? jogo.goleiroA : jogo.goleiroB;
  const time = lado === 'A' ? jogo.timeA : jogo.timeB;
  return <section className="eg09d-goals" aria-labelledby="eg09d-goals-title">
    <div className="eg09d-goals-head">
      <h3 id="eg09d-goals-title">Quem fez o gol?</h3>
      <span>{encerrada ? 'Somente consulta' : 'Toque no jogador'}</span>
    </div>
    <div className="eg09d-team-tabs" role="group" aria-label="Escolher equipe para registrar gols">
      {(['A','B'] as const).map(l => <button
        key={l}
        type="button"
        className={lado === l ? 'is-active' : ''}
        aria-pressed={lado === l}
        onClick={() => mudarLado(l)}
      >
        <Shield size={18} aria-hidden="true"/>
        <span>{l === 'A' ? jogo.timeA : jogo.timeB}</span>
        <strong>{l === 'A' ? jogo.golsA : jogo.golsB}</strong>
      </button>)}
    </div>
    {escolherGoleiro&&<label className="jogo-goleiro-inline">Goleiro do {time}<select data-conferencia={`goleiro-${lado}`} aria-label={`Goleiro do ${time}`} disabled={encerrada} value={goleiro??''} onChange={e=>escolherGoleiro(lado,e.target.value)}><option value="">Escolher</option>{atletas.map(id=><option key={id} value={id}>{nomes.get(id)}</option>)}</select></label>}
    {substituir&&!encerrada&&<details className="jogo-escalacao-inline"><summary>Editar escalação deste jogo</summary>{atletas.map(id=><label key={id}>{nomes.get(id)}<select aria-label={`Substituir ${nomes.get(id)} neste jogo`} value={id} onChange={e=>substituir(lado,id,e.target.value)}><option value={id}>{nomes.get(id)}</option>{presentes.filter(p=>!atletas.includes(p)).map(p=><option key={p} value={p}>{(lado==='A'?jogo.atletasB:jogo.atletasA).includes(p)?'Trocar com ':''}{nomes.get(p)}</option>)}</select></label>)}</details>}
    <div className="eg09d-roster" aria-label={`Jogadores do ${time}`}>
      {atletas.map((id, idx) => {
        const nome = nomes.get(id) || `Jogador ${idx+1}`;
        const gols = jogo.golsPorAtleta[id] ?? 0;
        return <div key={id} className="eg09d-player-row">
          <div className="eg09d-player-info">
            <strong>{nome}</strong>
            <small>{id === goleiro ? 'Goleiro · ' : ''}{gols} {gols === 1 ? 'gol' : 'gols'}</small>
          </div>
          <button type="button" className="eg09d-minus" aria-label={`Retirar um gol de ${nome}`} disabled={encerrada || gols === 0} onClick={() => remover(lado,id)}><Minus size={22} aria-hidden="true"/></button>
          <button type="button" className="eg09d-add" aria-label={`Adicionar um gol para ${nome}`} disabled={encerrada} onClick={() => adicionar(lado,id)}><Plus size={20} aria-hidden="true"/><span>Gol</span></button>
        </div>;
      })}
      {!atletas.length && <p className="eg09d-no-players">Nenhum jogador escalado neste time. Abra a súmula completa para conferir a escalação.</p>}
    </div>
    <p className="eg09d-help">Cada toque em <strong>+ Gol</strong> atribui um gol ao jogador e ajusta o placar quando necessário. Use <strong>−</strong> para corrigir.</p>
  </section>;
}
