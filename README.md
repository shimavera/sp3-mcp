# SP3 MCP

Conecta a IA (Claude) ao **Sistema SP3** (`controle.sp3company.com`). Você conversa com a IA e ela vê e atualiza suas atividades — sem abrir o sistema.

Exemplos: *"quais minhas atividades hoje?"*, *"marca a tarefa X como feita"*, *"o que falta no cliente Vr Odontologia?"*, *"visão geral da agência"*.

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
| `criar_atividade` | Cria atividade num projeto |
| `concluir_atividade` | Marca como concluída |
| `atualizar_status` | Muda o status |
| `comentar_atividade` | Comenta / anexa evidência |

## Segurança

O token é pessoal e age **em seu nome** — tudo que você faz fica registrado como seu. Pode revogá-lo a qualquer momento em Configurações. Nunca compartilhe.

## Variáveis

| Env | Obrigatório | Padrão |
|---|---|---|
| `SP3_TOKEN` | sim | — |
| `SP3_URL` | não | `https://controle.sp3company.com` |
