# SP3 MCP

Conecta a IA (Claude) ao **Sistema SP3** (`controle.sp3company.com`). Você conversa com a IA e ela vê e atualiza suas atividades — sem abrir o sistema.

Exemplos: *"quais minhas atividades hoje?"*, *"quais estão paradas?"*, *"como está o financeiro?"*, *"gera contrato da Dentalkids"*.

## 1. Gere seu token

No sistema, vá em **Configurações → Conexão com IA (MCP)** e clique em **Gerar**. Copie o token (`sp3_...`) — ele aparece só uma vez.

## 2. Configure no Claude

### Claude Desktop
Edite o arquivo de config (no Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sp3": {
      "command": "npx",
      "args": ["-y", "github:shimavera/sp3-mcp"],
      "env": { "SP3_TOKEN": "COLE_SEU_TOKEN_AQUI" }
    }
  }
}
```

Reinicie o Claude Desktop.

### Claude Code
```bash
claude mcp add sp3 --env SP3_TOKEN=COLE_SEU_TOKEN_AQUI -- npx -y github:shimavera/sp3-mcp
```

## Ferramentas disponíveis

| Ferramenta | O que faz |
|---|---|
| `quem_sou_eu` | Confirma quem está conectado |
| `visao_geral` | Resumo: totais, suas pendências, por cliente |
| `minhas_atividades` | Suas atividades (filtra por status/cliente) |
| `atividades` | Atividades de toda a agência |
| `listar_clientes` | Clientes e projetos |
| `criar_cliente_e_projeto` | Cria cliente mínimo e projeto inicial (sócio) |
| `criar_atividade` | Cria atividade num projeto |
| `concluir_atividade` | Marca como concluída |
| `atualizar_status` | Muda o status |
| `comentar_atividade` | Comenta / anexa evidência |
| `atividades_paradas` | Atividades abertas com prazo vencido |
| `ver_financeiro` | MRR, recebíveis e cobranças do mês (sócio) |
| `preparar_contrato` | Dados cadastrais e comerciais para contrato (sócio) |
| `gerar_contrato` | Gera DOCX/PDF no Hermes, sem assinar nem enviar (sócio) |

## Segurança

O token é pessoal e age **em seu nome** — tudo que você faz fica registrado como seu. Pode revogá-lo a qualquer momento em Configurações. Nunca compartilhe.

Financeiro e dados usados em contrato exigem token de sócio. O MCP não assina,
envia contratos, cria cobranças ou movimenta valores.

`criar_cliente_e_projeto` também exige token de sócio. O cliente é criado como
lead, sem contrato, cobrança ou ciclo financeiro. A mensalidade é opcional e
fica registrada no cadastro. Depois, use `criar_atividade` com o `project.id`
retornado. Cadastros ativos com o mesmo nome retornam conflito em vez de criar
duplicata.

## Hermes

No ambiente do Hermes, configure um token pessoal de sócio fora do repositório:

```bash
SP3_TOKEN=sp3_seu_token_pessoal
SP3_URL=https://controle.sp3company.com
SP3_CONTRACT_GENERATOR=/root/hermes-content-os/contracts/sp3/generate-sp3-contract.mjs
SP3_CONTRACT_CWD=/root/hermes-content-os
SP3_CONTRACT_OUTPUT_DIR=output/contracts
```

Com `SP3_CONTRACT_GENERATOR`, a ferramenta `gerar_contrato` executa o gerador
local do Hermes e retorna os caminhos do DOCX e PDF. O arquivo continua pendente
de revisão e assinatura humana.

## Variáveis

| Env | Obrigatório | Padrão |
|---|---|---|
| `SP3_TOKEN` | sim | — |
| `SP3_URL` | não | `https://controle.sp3company.com` |
