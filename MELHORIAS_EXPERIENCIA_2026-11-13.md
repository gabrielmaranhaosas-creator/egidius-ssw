# Consolidação da experiência do EGIDIUS — 13/11/2026

## Mudanças desta versão

- Aviso global de formulários e operações pendentes em fichas, viagem, importadores e arquivos. Navegação pede decisão de descarte; operações em andamento bloqueiam saída da área; fechamento/recarregamento tem aviso. Não existe salvamento automático de fichas: a pessoa usa Salvar ficha.
- Cada súmula é uma cópia da escalação ao criar o jogo. Confirmar nova montagem não reescreve partidas criadas, abertas ou encerradas. O servidor também recusa alteração direta de jogos encerrados sem reabertura separada.
- Saída e retorno preservam a presença histórica. A saída libera a vaga da montagem futura; o retorno não escolhe um time pela pessoa.
- Montagem manual principal, busca sem exigência de acentos, lista geral/trocas recolhida. Súmula completa e ferramentas avançadas também ficam recolhidas para não duplicar a operação principal.
- Data do sábado compartilhada com Mídia e PDFs; destino explícito de envio. Navegação representada no endereço, retorno à área após recarga e foco no título da tela.
- Consulta, operação e administração verificadas no servidor. Convite coletivo permanece operador; não recebe administração. Contas individuais administrativas anteriores mantêm o acesso na migração. Não há troca de senhas.
- Administração oferece convites individuais de consulta/operação e revogação que encerra suas sessões. O segredo do convite é exibido apenas ao gerá-lo, não integra o histórico de ações.
- Backup completo e exclusão definitiva exigem administração. Há histórico de conta/ação/horário, sem registrar senhas ou conteúdo de formulários.
- Mídia vai à lixeira recuperável, inclusive retratos. Purga exige administração e arquivo já na lixeira. A lixeira integra o backup e ocupa quota até eliminação deliberada; não há expiração automática de arquivos.
- Mesclagem de alterações independentes por registro; a mesma partida é atômica. Conflitos restantes têm revisão de versões por registro, com nova conferência de revisão no envio. JSON local continua disponível como salvaguarda.
- Carregamento de jogadores, mídia, importações e viagem em módulos separados, com aviso de carregamento e recuperação de falha de abertura.
- Vocabulário, resumos de times completos, critério dos rankings e identificação do evento antigo de viagem revisados.

## Compatibilidade e migração

Formato esportivo permanece versão 5. `indisponiveis` é um campo opcional nas rodadas; backups anteriores continuam legíveis. Identificadores de times nas súmulas são referências históricas e não obrigam o time a continuar na montagem atual. O elenco do jogo permanece na própria súmula.

A inicialização adiciona tabelas de privilégios, convites individuais, lixeira e auditoria. O backup portátil inclui essas tabelas; ao restaurar um backup antigo sem privilégios, as contas individuais anteriores preservam a administração. Não são apagados ou regravados placares na inicialização. Scripts antigos de restauração precisam ser atualizados para reconhecer as novas tabelas.

A reversão para uma versão antiga da aplicação deve ser avaliada antes de executar: a versão antiga não aplica as novas permissões nem entende a lixeira. Restaurar dados não deve ser confundido com reverter código.

## Validação

Testes automatizados de regras, sincronização, papéis, convites, revogação, snapshots, lixeira, backup e restauração. A execução local completa desta rodada teve 94 testes de frontend aprovados e 76 testes de API aprovados. Três integrações externas foram puladas localmente por falta dos serviços isolados PostgreSQL/S3; são exercitadas pela CI com seus próprios serviços.

Percursos na interface: edição de ficha mostra pendência, saída exige decisão e cancelar preserva o texto; salvamento limpa pendência; times podem mudar após resultado e o jogo antigo mantém seu nome/placar; busca manual sem acento encontra nomes; Mídia recebe o sábado ativo; atualizar mantém a área; lixeira está acessível.

## Trabalho ainda dependente de homologação ou evolução específica

- Uso real em Android/iPhone, teclado virtual, leitor de tela, rede móvel e pessoas sem treinamento. Não há certificação de acessibilidade nem pesquisa de satisfação concluída.
- Rascunhos de times continuam neste navegador; não são colaboração simultânea de montagem entre dispositivos.
- Não há editor de substituições durante partidas de sete; a disponibilidade criada nesta versão trata partidas futuras.
- A restauração integral segue sendo um procedimento administrativo assistido. Não foi criado um botão de substituição de banco em produção nem configurada uma automação de backup externo.
- Consolidação ampla das 31 folhas CSS e métricas reais de desempenho/satisfação permanecem evoluções separadas. Esta versão reduz duplicação visível, sem alegar uma reescrita visual integral.
- Confirmar versões em conflito continua sendo uma decisão humana; o sistema não tenta somar gols registrados simultaneamente na mesma partida.
