# Story 143: Enviar contrato para assinatura pelo MCP

**Epic:** Hermes MCP Operações
**Status:** Ready

## Contexto

O contrato é gerado no ambiente do Hermes e salvo no Drive Juan. O Sistema SP3 já possui upload de PDF e integração com Clicksign na interface, mas o MCP atual não consegue enviar o arquivo nem devolver o resultado da assinatura.

## Escopo IN

- Receber um PDF local, cliente e título pelo MCP.
- Criar o documento de contrato no Sistema SP3 usando o token pessoal do sócio.
- Enviar o documento para a integração Clicksign já existente.
- Usar o representante do cliente, o signatário SP3 e as testemunhas configuradas no ambiente.
- Retornar os IDs do contrato, envelope, documento e notificação, além do status.
- Impedir duplicidade quando o documento já tiver envelope Clicksign.
- Registrar auditoria no Sistema SP3.

## Escopo OUT

- Assinar automaticamente por qualquer signatário.
- Expor tokens, variáveis de ambiente ou credenciais.
- Alterar o gerador de contratos ou o modelo visual do PDF.
- Cancelar envelopes ou baixar automaticamente o PDF final assinado.

## Critérios de aceite

1. O MCP aceita um PDF válido e cria o registro no módulo de contratos.
2. O MCP envia o registro para Clicksign sem abrir navegador.
3. O retorno contém `contract_id`, `envelope_id`, `document_id`, `notification_id` e `status`.
4. Token ausente, token de colaborador, cliente inexistente, PDF inválido ou e-mail do representante ausente geram erro claro sem envio parcial não auditado.
5. A integração existente continua funcionando pela interface web.
6. Lint, typecheck e testes passam.
