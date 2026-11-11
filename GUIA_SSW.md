# EGIDIUS — guia de operação do SSW

## Entrar e cuidar dos registros

Use o endereço permanente e o convite privado recebido. No Mac que hospeda uma cópia local, a entrada pode ser direta. Aguarde o indicador **Salvo no servidor** antes de sair. Se aparecer um conflito, preserve o backup do navegador antes de escolher qual base manter.

O elenco habitual e os integrantes da viagem são cadastros separados. Cadastrar jogadores não marca presenças nem altera a viagem. Não lance resultados fictícios na base de uso real.

## Preparar o elenco e o álbum

1. Abra **Importar e arquivos → Importar elenco**.
2. Baixe o modelo Excel ou CSV, preencha um nome por linha e envie. Também é possível colar uma tabela do Excel ou Google Sheets ou uma lista com um nome por linha.
3. Para tabelas, a primeira linha contém os títulos das colunas. Em XLSX, mantenha a aba do elenco ativa ao salvar. Se o título dos nomes não for reconhecido, escolha a coluna na prévia.
4. Revise os nomes e a seleção. Nomes existentes e repetidos são sinalizados; acentos são preservados. Confirme para criar os jogadores selecionados. O lote tem até 300 registros e 3 MB.
5. Em **Atualizar fichas**, envie CSV, XLSX ou JSON com nome ou ID e os campos do perfil. A prévia permite conferir a associação. Use os títulos apresentados na tela, como apelido, posicao e numero_figurinha. Essa área atualiza os perfis dos jogadores já cadastrados.
6. Em **Fotos e caricaturas**, use a prévia do ZIP para associar cada imagem ao jogador e ao tipo correto. Confira todas as associações antes de gravar.

## Operar o sábado

Em **Sábado completo**, escolha ou crie a data. Registre as chegadas reais, monte os times, salve a formação e abra a súmula. Informe os goleiros e os gols, confira as pendências e encerre a partida. Os rankings consideram partidas encerradas. Reabrir uma súmula permite corrigir o resultado preservando os demais jogos.

A formação ainda não salva fica somente no formulário aberto. Salve antes de trocar de tela ou de sábado. Quando outro dispositivo alterar a formação, o sistema pede conferência antes de substituir ajustes locais.

## Fotos, vídeos e documentos

- Na **Mídia**, selecione o sábado e, opcionalmente, a partida. Envie até 12 arquivos por lote.
- Fotografias: JPG, PNG e WebP, até 12 MB cada.
- Vídeos: MP4, MOV e WebM, até 100 MB cada. O navegador precisa suportar o codec do arquivo; MP4 H.264 foi utilizado no teste de reprodução.
- Em **Importar e arquivos → Documentos PDF**, envie PDFs sem senha, até 20 MB e 300 páginas, associados ao sábado. O PDF permanece como documento para download e consulta; seu texto não é convertido automaticamente em jogadores, gols ou resultados.
- Os arquivos têm botões de download. Exclusões da galeria são definitivas e precisam ser confirmadas. Faça backup antes de remover conteúdo.
- A reserva de mídia atual do aplicativo é de 2 GB. Organize os arquivos e guarde cópias externas. A capacidade da hospedagem deve ser expandida antes de o uso atingir os limites.

## Backup e restauração

Abra **Importar e arquivos → Guia e backup → Baixar backup completo**. O ZIP inclui SQLite, contas, cadastros, viagem, fichas e todos os arquivos referenciados no banco. Guarde-o em local privado fora da hospedagem. Faça isso após a operação e antes de importações ou exclusões importantes.

O botão **Backup JSON** no topo preserva os registros do navegador. Ele não contém fotos, vídeos ou PDFs e não substitui o backup completo.

A restauração é uma manutenção offline. Em uma cópia instalada no Mac, o responsável técnico pode conferir o arquivo sem mudar nada:

```bash
cd "$HOME/Downloads/EGIDIUS-2"
python3 tools/restaurar_backup.py "/caminho/do/EGIDIUS_BACKUP_COMPLETO.zip"
```

Para aplicar, pare primeiro o EGIDIUS com `bash egidius.sh parar` e execute o mesmo comando acrescentando `--aplicar`. A rotina confere banco e mídia, bloqueia serviços ativos e conserva a cópia anterior. Na hospedagem, o procedimento deve ser executado em manutenção, diretamente no volume persistente. Nunca copie apenas um SQLite por cima de uma aplicação em execução.

## Responsabilidades da equipe

O SSW administra nomes, fichas, documentos, mídia, presenças, escalações e resultados pela interface. O responsável pela hospedagem mantém as contas dos provedores, o domínio se houver, o acesso ao repositório e as cópias de segurança. O acesso por convite é coletivo; trate o convite como uma credencial privada.

Na hospedagem gratuita proposta, o primeiro acesso após um período sem uso pode levar aproximadamente um minuto. O banco e os arquivos ficam em armazenamento externo; fechar a aplicação ou reiniciar o serviço não os remove. A disponibilidade definitiva só é confirmada após a publicação e os testes no endereço real.
