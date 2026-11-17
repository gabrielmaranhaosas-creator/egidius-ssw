# Continuidade da experiência — correções da montagem e navegação

## O que mudou

A montagem tinha um único estado anterior para algumas operações. O botão Desfazer não cobria renomeação ou inclusão de time, embora seu rótulo sugerisse a última alteração em geral.

Agora há até 20 alterações locais no histórico da tela, cobrindo nomes, inclusão/remoção de times, escolha de jogadores, limpeza, trocas e distribuição opcional por chegada. Desfazer percorre as alterações em ordem inversa; Refazer permite reaplicá-las. Digitar no mesmo campo de nome forma uma ação até sair dele. Uma nova alteração após desfazer inicia outro caminho e elimina as versões de refazer anteriores.

A confirmação dos times continua separada. O histórico não altera súmulas já criadas, não salva times automaticamente e não substitui as proteções de sincronização. Ao confirmar, descartar, carregar formação externa ou atualizar a página, o histórico da tela é reiniciado. O rascunho dos times continua seguindo sua persistência própria no navegador; o histórico de desfazer não é compartilhado entre dispositivos.

No menu móvel Mais, a abertura leva o foco ao primeiro comando. Tab e Shift+Tab circulam pelo painel e pelo botão Mais. Escape e o fechamento pelo fundo devolvem o foco ao botão Mais. Navegar para uma tela deixa o foco seguir para seu título. Ao aumentar a janela para a navegação de desktop, o painel é fechado.

## Validação

- 105 testes de frontend/regras aprovados, incluindo cinco novos cenários do histórico.
- Casos: nomes, adição e alocação manual, sequência de desfazer/refazer, agrupamento da digitação, invalidação de refazer por uma nova edição, limite de 20, isolamento das cópias e limpeza/restauração da ordem dos jogadores e digitação que retorna ao nome original.
- Compilação TypeScript/Vite aprovada.
- Teste interativo isolado: renomear time, adicionar outro, desfazer ambos, refazer e verificar a preservação da partida encerrada.
- Teste por teclado em viewport útil de 390 pixels: abertura focou Jogadores; Shift+Tab retornou a Mais; Tab avançou novamente; Escape fechou o painel e devolveu o foco a Mais. Largura de conteúdo igual a 390 pixels.
- Backend, esquema, credenciais e dados de produção sem alterações nesta entrega. A CI completa exercita API, integrações isoladas e imagens nas duas arquiteturas antes da publicação.

A verificação em largura reduzida não substitui teste com aparelhos físicos, Safari/iOS, teclado virtual ou leitor de tela. Esses itens continuam pendentes de homologação.
