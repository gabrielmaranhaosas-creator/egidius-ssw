# EGIDIUS — experiência, layout e uso em campo

Revisão de 17/11/2026. Testes interativos realizados em ambiente isolado, com atletas fictícios. Nenhum cadastro, placar ou arquivo real foi alterado para os testes.

## Diagnóstico e decisões implementadas

| Atrito observado | Mudança |
| --- | --- |
| Evento antigo de viagem vinha antes da operação atual | A viagem fica nas opções secundárias; o sábado selecionado abre a experiência. |
| Quase todos os botões competiam pelo destaque | Fundo marfim, navegação escura, dourado na orientação principal e vermelho na confirmação. |
| Marcar chegada era sempre a principal ação | A entrada acompanha chegadas, montagem manual, partida aberta ou próximo confronto. |
| Etapas do uso ficavam espalhadas por painéis | Jornada visível: Chegadas → Times → Partidas → Resultados, com atalhos livres e indicadores reais. |
| Criar outro sábado abria uma área com o formulário recolhido | O atalho abre diretamente a data; o campo recebe eventos de entrada e mudança. |
| Lista de chegadas exigia localizar nomes visualmente | Busca por nome, com ou sem acento, na página inicial e na organização. |
| Comandos da conta podiam cortar em largura reduzida | Barra superior quebra em linhas; botões mantêm rótulos e área de toque. |
| Confirmação fixa ocupava parte excessiva da tela dos times | Resumo duplicado e botão secundário desabilitado saem da barra em telas estreitas; confirmação fica acessível acima do menu inferior. |
| Mensagem antiga de exclusão permanecia após restaurar mídia | A restauração limpa a mensagem anterior; a lixeira confirma o retorno à galeria. |

## Experiência do usuário

1. A página inicial apresenta o sábado em foco, seus números e a próxima ação recomendada.
2. A pessoa registra as chegadas individualmente. Com 14 presentes e sem formação válida, a ação passa a ser montar os times manualmente.
3. Cada time tem seu cartão, nome, vagas e seleção individual. Jogadores já escolhidos não podem ocupar outro time ao mesmo tempo. Nenhuma formação é criada pela orientação da página inicial.
4. Confirmar abre o confronto. A criação da partida continua exigindo uma ação explícita; a recomendação nunca cria um jogo sozinha.
5. Se houver jogo em edição, a página inicial oferece retomá-lo pelo número correto, mesmo que a montagem futura esteja incompleta.
6. Goleiros, autoria dos gols e conferência precedem o encerramento. Partidas antigas preservam sua escalação e resultado.
7. Resultados permanecem acessíveis. É possível preparar outro confronto sem declarar artificialmente o sábado concluído.

## Validação executada

- 99 testes automatizados de frontend/regras aprovados, incluindo cinco novos cenários da jornada: primeiro uso, progressão, retomada, preservação de resultados e disponibilidade.
- 76 testes locais da API aprovados; três integrações externas não executadas localmente por ausência dos serviços PostgreSQL/S3 isolados. A CI do repositório fornece essas integrações.
- Compilação TypeScript e Vite aprovada.
- Percurso interativo: criação de um sábado fictício, 14 chegadas individuais, busca sem acento, escolha manual de 7 + 7, confirmação, criação da súmula, goleiros, gol, saída e retomada da partida e encerramento.
- Mídia: destino manteve o sábado selecionado, envio de imagem de teste, exclusão recuperável, restauração e download.
- Conferência visual da página inicial, organização, seleção dos times, súmula e jogadores.
- Conferência responsiva em quadros com viewport útil de 390 e 320 pixels. A montagem em 320 pixels apresentou largura de conteúdo igual à largura útil, sem rolagem horizontal.
- Navegação por teclado preservada; atalho para o conteúdo, foco nos títulos, indicação de página/etapa e redução de movimento continuam disponíveis.

Os quadros de largura reduzida não simulam teclado virtual, Safari/iOS ou hardware de telefone. Não se trata de certificação de acessibilidade nem pesquisa com usuários externos.

## Compatibilidade e limites

A atualização altera a interface e a orientação da jornada. Não exige novas variáveis, banco, armazenamento ou migração de dados. O backend e o formato esportivo permanecem os mesmos. As proteções anteriores de edição, sincronização, permissões e histórico continuam em uso.

Rascunhos de times continuam locais ao navegador. Não foi criado editor de substituições durante a partida. Permanecem pendentes a homologação em celulares físicos, com rede móvel e com pessoas sem orientação prévia, e uma avaliação completa com leitor de tela. A revisão visual não representa reescrita integral das folhas CSS antigas.

## Roteiro rápido de homologação

Abrir o endereço habitual, atualizar a página e selecionar o sábado correto. Conferir a recomendação inicial. Registrar uma chegada, localizar um nome sem acento, escolher manualmente os jogadores, confirmar, criar o jogo e registrar goleiros e gols. Voltar ao início antes de encerrar e usar a retomada. Encerrar, consultar o placar e conferir a sincronização. Testar uma imagem sem dados privados e sua restauração pela lixeira.
