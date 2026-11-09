# Publicação permanente do EGIDIUS

O aplicativo é servido como um único serviço Docker: React compilado e API na mesma origem HTTPS. O SQLite e os arquivos enviados ficam em um disco persistente. O computador da Produceria deixa de ser o servidor do grupo após a transferência dos dados e a homologação do endereço público.

## Configuração preparada

O arquivo `render.yaml` define um serviço pago Starter, uma instância, região Virginia, disco de 5 GB em `/var/data`, verificação de saúde em `/api/health` e publicação automática desligada. Os uploads mantêm a reserva de 2 GB definida no aplicativo; o disco também acomoda o banco e a operação temporária de cópias. Expanda a capacidade antes de atingir esses limites.

O custo do serviço e do disco deve ser conferido no painel antes da contratação. Esta preparação não criou serviço nem assinatura. A configuração solicita um serviço pago Starter e disco de 5 GB; impostos, câmbio e excedentes dependem da cobrança efetiva. Referências oficiais: https://render.com/pricing e https://render.com/docs/disks.

Discos persistentes exigem serviço pago. Uma instância gratuita não atende a esta configuração. O disco permite uma única instância e causa uma pequena pausa durante substituições de versão. O EGIDIUS foi preparado para um único processo de API com controle de revisão nas gravações.

## Sequência de publicação

1. O repositório identificado para este projeto é `gabrielmaranhaosas-creator/egidius-ssw`. A branch principal encontrada em 09/11/2026 ainda contém a versão antiga em Streamlit. A versão React/API deve ser conferida em uma branch de preparação antes de substituir essa estrutura. O diagnóstico do Mac não contém um repositório Git na raiz do projeto.
2. Publicar somente os arquivos de código desta pasta. Não enviar bancos, mídia privada, backups ou variáveis de ambiente ao Git.
3. Conectar a conta Render e autorizar o acesso ao repositório. Criar o serviço a partir do Blueprint e revisar o plano e o disco no painel.
4. Preservar uma cópia atual do banco do Mac usando `tools/coletar_para_publicacao.py`. O ZIP gerado é privado e deve ficar separado do código.
5. Para a primeira carga atual, sem mídia cadastrada, preencher no painel as variáveis privadas `EGIDIUS_INITIAL_DATABASE_B64` e `EGIDIUS_INITIAL_DATABASE_SHA256`. A primeira contém o SQLite compactado com gzip e codificado em base64; a segunda contém o SHA-256 do SQLite sem compressão. Esses valores serão preparados a partir da cópia atual, sem expô-los no repositório. Se a cópia já tiver mídia, transfira banco e arquivos pelo procedimento de restauração offline no volume, em vez de usar a carga somente de banco.
6. O processo inicial verifica estrutura e integridade do SQLite. Quando o disco não tem banco e os dados iniciais não foram fornecidos, ele recusa a inicialização; não publica uma base vazia no lugar dos registros do grupo.
7. Depois da primeira carga, reiniciar e conferir que o banco persiste. Limpar as duas variáveis de carga inicial no painel e reiniciar outra vez. O banco existente nunca é sobrescrito pela rotina de primeira carga.
8. Montar o convite privado com o token gerado no ambiente. O valor do token deve ser codificado como parâmetro de URL: `https://ENDERECO/#convite=TOKEN_CODIFICADO`. A entrada externa não exige usuário ou senha; a sessão e a proteção de gravações permanecem.
9. Homologar abertura por convite, leitura do elenco e da viagem, importação com prévia, mídia, PDF e download do backup no endereço real. Fazer um teste de gravação somente em base de homologação ou com conteúdo real autorizado pelo SSW.

## Operação pelo SSW

O responsável pelo grupo mantém acesso à conta de hospedagem, ao repositório e aos backups. O convite funciona como credencial de acesso ao aplicativo e deve ser compartilhado apenas com os gestores autorizados. A versão atual não separa permissões por função: participantes com acesso ao app podem operar seus módulos.

Os snapshots do provedor não substituem o backup completo exportado pelo aplicativo e guardado fora do serviço. Para manutenção, faça backup antes de publicar outra versão. Não crie réplicas adicionais usando o mesmo SQLite. O download de backup já está implementado; a automação de cópias externas e sua retenção ainda precisam ser configuradas na etapa de operação do servidor.

O código e a configuração deste pacote estão preparados e testados localmente. A publicação no Render depende da conta, do plano escolhido, do repositório correto e da transferência dos dados atuais. Este pacote não representa um serviço já publicado.
