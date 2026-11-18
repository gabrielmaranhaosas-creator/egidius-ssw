const CHAVE='egidius.servidor.geracao';
export function geracaoAtual(value?:number){return Number.isSafeInteger(value)&&Number(value)>=0?Number(value):0;}
export function geracaoLocal(){try{return geracaoAtual(Number(window.localStorage.getItem(CHAVE)??0));}catch{return 0;}}
export function guardarGeracao(value?:number){try{window.localStorage.setItem(CHAVE,String(geracaoAtual(value)));}catch{/* A geração da sessão continua protegendo os envios. */}}
