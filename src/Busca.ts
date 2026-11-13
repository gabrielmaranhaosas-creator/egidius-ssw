export function normalizarBusca(texto:string) { return texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim(); }
