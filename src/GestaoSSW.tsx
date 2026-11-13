import { usePapel } from './Permissoes';
import { Download, ShieldCheck } from 'lucide-react';

export function GestaoSSW(){
  const papel=usePapel();
  return <section className="import-page">
    <div className="import-hero"><p>GESTÃO DO SSW</p><h1>Guia e backup<span>.</span></h1><div>O SSW cuida do conteúdo e da operação do EGIDIUS por estas telas.</div></div>
    <section className="import-panel"><h2>Rotina de trabalho</h2><ol className="ssw-guide-list">
      <li><strong>Prepare o elenco.</strong> Em Importar elenco, envie a planilha ou cole a tabela, escolha a coluna e confirme os nomes. Em Atualizar fichas, associe apelidos, posição e dados do álbum aos jogadores cadastrados.</li>
      <li><strong>Organize o sábado.</strong> Em Organizar sábado, escolha a data. Registre chegadas reais, escolha os jogadores de cada time e confirme. Quem saiu pode ficar indisponível para os próximos jogos sem perder a presença histórica. Escolha goleiros e confira a súmula antes de encerrar cada partida.</li>
      <li><strong>Envie os arquivos.</strong> Fotos e vídeos ficam na galeria de cada sábado. PDFs ficam em Documentos PDF. Retratos e caricaturas podem ser associados aos jogadores na importação de imagens.</li>
      <li><strong>Confira o salvamento.</strong> Aguarde Salvo no servidor antes de trocar de dispositivo ou desligar o Mac. Os rankings usam somente partidas encerradas.</li>
      <li><strong>Guarde uma cópia.</strong> Baixe o backup completo após a operação e antes de alterações em lote. Mantenha uma cópia privada fora deste computador.</li>
    </ol></section>
    <section className="import-panel"><h2>Backup completo do SSW</h2><p>Inclui os registros dos sábados e da viagem, fichas, fotos, vídeos e PDFs já salvos no servidor. Inclui também arquivos recuperáveis da lixeira e a configuração de acessos. O arquivo contém dados e contas do grupo: guarde-o em local privado. Rascunhos de times deste navegador não entram nessa cópia.</p>
      {papel==='admin'?<a className="ssw-download-link" href="/api/backup/download" download target="_blank" rel="noopener"><Download size={22}/> Baixar backup completo</a>:<p>O backup completo contém contas e arquivos privados. Entre em Acesso de organização com uma conta de administração para baixá-lo.</p>}
      <p>O botão Backup JSON no topo preserva os registros deste navegador. Ele é útil se houver uma edição ainda não sincronizada, mas não inclui os arquivos de mídia.</p>
    </section>
    <section className="import-panel"><h2>Formatos e limites</h2><dl className="ssw-guide-limits">
      <dt>Elenco e fichas</dt><dd>CSV, XLSX e JSON · 3 MB · 300 linhas. O elenco também aceita tabela colada, TXT e TSV.</dd>
      <dt>Fotos</dt><dd>JPG, PNG ou WebP · 12 MB por arquivo.</dd><dt>Vídeos</dt><dd>MP4, MOV ou WebM · 100 MB por arquivo. A reprodução depende do formato de vídeo suportado pelo navegador.</dd>
      <dt>Documentos</dt><dd>PDF sem senha · 20 MB · até 300 páginas. O arquivo é guardado para consulta e download.</dd>
      <dt>Envio pela galeria</dt><dd>Até 12 arquivos por lote. O espaço reservado para os arquivos do grupo é de 2 GB.</dd>
    </dl></section>
    <div className="import-note"><ShieldCheck size={23}/> No Mac, use a entrada direta. Para outro dispositivo, utilize o convite privado configurado para o grupo. No endereço permanente, os dados e arquivos ficam no serviço de hospedagem. Uma instalação local depende do computador ligado.</div>
  </section>;
}
