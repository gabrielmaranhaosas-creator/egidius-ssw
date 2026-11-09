# EGIDIUS na Oracle Cloud — implantação em máquina nova

Este roteiro usa uma VM Ubuntu 24.04 LTS, Docker Compose, Caddy e SQLite em diretório persistente. Não cria recursos Oracle, não habilita recursos pagos e não altera a máquina local. O preparador recusa destinos já existentes, preserva o SQLite do ZIP e confere todas as mídias referenciadas antes de instalar os dados.

## 1. Conta e capacidade gratuita

Crie ou entre na conta OCI pela página oficial: https://www.oracle.com/cloud/sign-in.html. Se precisar cadastrar a conta, faça pessoalmente a verificação de identidade/cartão e a aceitação dos termos. A região principal deve ser escolhida com cuidado: os recursos Always Free ficam nessa região.

Na região principal, procure uma VM **Always Free eligible**, `VM.Standard.A1.Flex`, Ubuntu 24.04 LTS ARM, inicialmente **1 OCPU e 6 GB de RAM**, com disco de inicialização de **50 GB**, respeitando as cotas já usadas pela conta. Isso é uma configuração proposta, não uma confirmação de capacidade ou gratuidade da conta. Confira a elegibilidade no console antes de criar. Não troque automaticamente por uma forma paga se houver falta de capacidade.

As cotas podem mudar. Fontes oficiais: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm e https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm. Instâncias ociosas podem ser recuperadas pela Oracle; cópias fora da VM são necessárias.

Guarde a chave SSH privada no seu computador. Não envie chave privada, senha, cartão ou token ao chat/GitHub. Precisamos apenas do IP público e do estado da VM para orientar a próxima etapa.

Na VCN/NSG, permita TCP 80 e 443 para o site. Restrinja SSH 22 ao IP administrativo. Não abra 8080 ou portas de banco ao público. O firewall do Ubuntu também deve permitir as conexões necessárias; não desative globalmente o firewall. Configure um nome DNS público para o IP da VM (domínio existente ou subdomínio gratuito). Não é necessário comprar um domínio para preparar a VM, mas a publicação exige um nome público para HTTPS confiável.

## 2. Código e Docker

Na VM, instale Docker Engine e o plugin Compose pelo repositório oficial para Ubuntu: https://docs.docker.com/engine/install/ubuntu/. Não remova instalações de outros projetos. A VM deve ser dedicada ao EGIDIUS.

Busque o código deste repositório na revisão aprovada pelos testes. Enquanto a PR de consolidação estiver aberta, use `preparacao-render-20261109`; a branch tem nome histórico e também contém a implantação Oracle. Não utilize a `main` antiga de Streamlit. Registre a revisão exata em uso:

```bash
git clone --branch preparacao-render-20261109 --single-branch https://github.com/gabrielmaranhaosas-creator/egidius-ssw.git "$HOME/egidius-codigo"
cd "$HOME/egidius-codigo"
git rev-parse HEAD
```

Nenhum banco privado faz parte do repositório. Transfira o ZIP de dados conferido via SCP/SFTP para a pasta pessoal da VM e restrinja seu acesso com `chmod 600`. Não use URL pública para esse arquivo.

## 3. Primeira carga — somente em destino novo

O comando abaixo é um modelo: substitua os dois valores antes de executar na VM.

```bash
cd "$HOME/egidius-codigo"
sudo python3 deploy/oracle/preparar.py \
  --backup "$HOME/SEU_BACKUP_PRIVADO.zip" \
  --domain "SEU_NOME_DNS_PUBLICO" \
  --root /opt/egidius
```

O diretório `/opt/egidius` deve estar ausente. Em caso de repetição, o preparador interrompe sem substituir dados. Não apague esse diretório para tentar novamente. Se houver uma instalação existente, use o procedimento de manutenção e backup.

O preparador grava banco e mídia em `/opt/egidius/data`, gera um convite forte e salva os arquivos de configuração em `/opt/egidius/private`, com acesso restrito. Não imprime o convite nem usa variáveis de primeira carga depois da importação. Registra apenas hash e contagens para a conferência. O diretório de dados fica fora do checkout, sobrevive à reconstrução dos containers e deve estar no disco persistente da VM. A exclusão da VM/disco continua sendo um evento de recuperação por backup.

## 4. Inicialização e aceite

```bash
cd "$HOME/egidius-codigo"
sudo bash deploy/oracle/operar.sh iniciar
sudo bash deploy/oracle/operar.sh status
curl --fail http://127.0.0.1:8080/api/health
```

Depois de apontar o DNS e liberar 80/443, confira `https://SEU_NOME_DNS_PUBLICO/api/health`, a página inicial e o certificado no navegador. Caddy emite e renova HTTPS: https://caddyserver.com/docs/automatic-https. Não ignore alertas de certificado e não distribua convite antes do HTTPS estar válido. O script confirmar containers iniciados não significa que o certificado público já foi emitido.

Recupere o convite privadamente no arquivo `/opt/egidius/private/convite.txt`. Ele dá acesso de operação ao grupo: só compartilhe com os responsáveis autorizados. Não o inclua em logs, issues ou capturas públicas.

Confira os dados iniciais, baixe um backup completo na interface e guarde fora da VM. Pare e inicie os serviços com `operar.sh parar` / `operar.sh iniciar`, confirme a preservação dos dados, teste em outro dispositivo e registre a revisão em produção. Novas sessões/convites podem alterar as contagens de usuários e sessões; compare os dados operacionais com o relatório inicial privado, não apenas o hash após o uso.

## 5. Backup e manutenção

A cópia de segurança completa disponível na interface inclui SQLite consistente e mídias. O JSON de registros não substitui esse backup. Armazene as cópias fora da VM, em local privado. O diretório `backups` criado pelo preparador é apenas uma pasta reservada: **não há agendamento de backup ou cópia externa automática neste pacote**.

Antes da liberação definitiva, configurar rotina externa de backup, retenção e ensaio de restauração em destino separado. `preparar.py` pode conferir e carregar o ZIP completo em diretório novo nesse ensaio; nunca restaure por cima de uma instalação ativa. Não use `restaurar_backup.py --project` para restaurar diretamente em `/opt/egidius/data`: aquele utilitário tem o layout local do Mac.

Atualizações: baixe backup fora da VM, confira a revisão aprovada, atualize o checkout e rode `operar.sh iniciar`. Há um único processo de API; não acrescente réplicas com acesso concorrente ao mesmo SQLite. Atualizações e restaurações podem exigir breve indisponibilidade. Atualizar o checkout e reconstruir a imagem não remove `/opt/egidius/data`.
