# Consulta pública do futebol

O endereço principal agora abre sábados, times e escalações, placares e rankings sem convite. O botão Entrar para organizar mantém a entrada por conta ou convite para operar o sistema. A consulta indica placares provisórios, mostra o horário da última leitura e conserva os últimos dados com aviso se uma atualização falhar.

## Separação de acesso

- Apenas GET /api/public/football é liberado no middleware, com lista explícita de campos do futebol.
- Não há criação automática de conta, sessão, cookie ou histórico de operação para o visitante.
- O estado privado, fichas, mídia, viagem, notas de partidas, lixeiras, auditoria e configuração de contas ficam fora da resposta pública.
- As rotas de edição e os endpoints privados mantêm autenticação, permissões e proteção CSRF.
- A consulta não usa o armazenamento local dos registros operacionais e não pode importá-lo para o servidor.
- Nenhuma tabela nova, migração de dados, alteração de ambiente ou mudança de armazenamento foi introduzida.

## Verificação

Testes cobrem acesso anônimo sem efeitos no banco, projeção pública sem campos privados, rankings de jogos encerrados, preservação do histórico, bloqueio de métodos de gravação e de rotas privadas, continuidade da operação autenticada, entrada anônima no componente, renderização de conteúdo com escape e ordenação dos rankings.

A validação visual usa somente dados fictícios em uma base de testes separada. Os dados reais não são alterados para simular partidas.
