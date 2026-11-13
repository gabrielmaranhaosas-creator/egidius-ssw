import { Component,useEffect } from 'react';
import type { ReactNode } from 'react';
export class RecuperarTela extends Component<{children:ReactNode},{falhou:boolean}>{
 state={falhou:false};
 static getDerivedStateFromError(){return {falhou:true};}
 render(){return this.state.falhou?<section className="surface ux-organization" role="alert"><h1>Não foi possível abrir esta área</h1><p>Use o menu para voltar ou atualize a página para tentar novamente. Os registros já salvos permanecem no servidor.</p><button type="button" onClick={()=>window.location.reload()}>Atualizar página</button></section>:this.props.children;}
}
export function ConteudoComFoco({children}:{children:ReactNode}){
 useEffect(()=>{const title=document.querySelector<HTMLElement>('main h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}},[]);
 return <>{children}</>;
}
