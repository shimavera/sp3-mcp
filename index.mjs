#!/usr/bin/env node
// MCP server do Sistema SP3 (controle.sp3company.com).
// Conecta a IA do membro ao sistema via token pessoal — vê e atualiza atividades por conversa.
// Config: env SP3_TOKEN (obrigatório, gerado em Configurações) e SP3_URL (opcional).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE = (process.env.SP3_URL || 'https://controle.sp3company.com').replace(/\/$/, '')
const TOKEN = process.env.SP3_TOKEN

if (!TOKEN) {
  console.error('[sp3-mcp] Falta SP3_TOKEN. Gere o seu em Configurações no sistema e configure no Claude.')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/mcp${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true })

const server = new McpServer({ name: 'sp3-mcp', version: '1.0.0' })

server.registerTool('quem_sou_eu',
  { title: 'Quem sou eu', description: 'Mostra o usuário dono do token (nome e papel no sistema SP3).', inputSchema: {} },
  async () => { try { return ok(await api('GET', '/me')) } catch (e) { return fail(e) } }
)

server.registerTool('visao_geral',
  { title: 'Visão geral', description: 'Resumo das atividades: totais por status, suas pendências e resumo por cliente.', inputSchema: {} },
  async () => { try { return ok(await api('GET', '/overview')) } catch (e) { return fail(e) } }
)

server.registerTool('minhas_atividades',
  {
    title: 'Minhas atividades',
    description: 'Lista as atividades atribuídas a você. Filtros opcionais por status e cliente.',
    inputSchema: {
      status: z.enum(['todo', 'in_progress', 'review', 'done']).optional().describe('Filtrar por status'),
      cliente: z.string().optional().describe('Filtrar por nome do cliente (parcial)'),
    },
  },
  async ({ status, cliente }) => {
    try {
      const qs = new URLSearchParams({ scope: 'mine' })
      if (status) qs.set('status', status)
      if (cliente) qs.set('client', cliente)
      return ok(await api('GET', `/tasks?${qs}`))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('atividades',
  {
    title: 'Atividades (todas)',
    description: 'Lista atividades de toda a agência. Filtre por cliente e/ou status.',
    inputSchema: {
      cliente: z.string().optional().describe('Nome do cliente (parcial)'),
      status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
    },
  },
  async ({ cliente, status }) => {
    try {
      const qs = new URLSearchParams({ scope: 'all' })
      if (cliente) qs.set('client', cliente)
      if (status) qs.set('status', status)
      return ok(await api('GET', `/tasks?${qs}`))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('listar_clientes',
  { title: 'Listar clientes', description: 'Lista os clientes ativos e seus projetos (útil para criar atividades).', inputSchema: {} },
  async () => { try { return ok(await api('GET', '/clients')) } catch (e) { return fail(e) } }
)

server.registerTool('listar_membros',
  { title: 'Listar membros', description: 'Lista os membros ativos do time (id, nome e papel) — para atribuir responsável a uma atividade.', inputSchema: {} },
  async () => { try { return ok(await api('GET', '/members')) } catch (e) { return fail(e) } }
)

const RECORRENCIA_MAP = { mensal: 'monthly', semanal: 'weekly', quinzenal: 'biweekly' }

server.registerTool('criar_atividade',
  {
    title: 'Criar atividade',
    description: 'Cria uma nova atividade num projeto. Use listar_clientes para o project_id. O responsável pode ser passado pelo nome (ex.: "João") — o sistema resolve no time. Para uma atividade RECORRENTE (repete sozinha), passe "recorrencia" (mensal/semanal/quinzenal); em mensal, informe "dia_do_mes" (ex.: 20). O sistema recria a próxima ocorrência automaticamente conforme cada uma é concluída.',
    inputSchema: {
      project_id: z.string().describe('ID do projeto (de listar_clientes)'),
      title: z.string().describe('Título da atividade'),
      responsavel: z.string().optional().describe('Nome do responsável (parcial, ex.: "João"). Resolvido no time. Use listar_membros se houver dúvida.'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      due_date: z.string().optional().describe('Data de vencimento YYYY-MM-DD. Em recorrência, é a 1ª ocorrência (opcional — o sistema calcula se faltar).'),
      recorrencia: z.enum(['mensal', 'semanal', 'quinzenal']).optional().describe('Torna a atividade recorrente. Ela se repete sozinha (uma ocorrência aberta por vez).'),
      dia_do_mes: z.number().int().min(1).max(31).optional().describe('Dia do mês da recorrência mensal (ex.: 20). Só para recorrencia="mensal".'),
    },
  },
  async ({ recorrencia, dia_do_mes, ...args }) => {
    try {
      const body = { ...args }
      if (recorrencia) body.recurrence_type = RECORRENCIA_MAP[recorrencia]
      if (dia_do_mes != null) body.recurring_day = dia_do_mes
      return ok(await api('POST', '/tasks', body))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('editar_atividade',
  {
    title: 'Editar atividade',
    description: 'Edita uma atividade existente: responsável, prazo, prioridade e/ou status. Informe ao menos um campo.',
    inputSchema: {
      id: z.string().describe('ID da atividade'),
      responsavel: z.string().optional().describe('Nome do responsável (parcial). String vazia limpa o responsável.'),
      due_date: z.string().optional().describe('Novo prazo YYYY-MM-DD. String vazia remove o prazo.'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
    },
  },
  async ({ id, ...patch }) => { try { return ok(await api('PATCH', `/tasks/${id}`, patch)) } catch (e) { return fail(e) } }
)

server.registerTool('concluir_atividade',
  {
    title: 'Concluir atividade',
    description: 'Marca uma atividade como concluída (done).',
    inputSchema: { id: z.string().describe('ID da atividade') },
  },
  async ({ id }) => { try { return ok(await api('PATCH', `/tasks/${id}`, { status: 'done' })) } catch (e) { return fail(e) } }
)

server.registerTool('atualizar_status',
  {
    title: 'Atualizar status',
    description: 'Muda o status de uma atividade.',
    inputSchema: {
      id: z.string(),
      status: z.enum(['todo', 'in_progress', 'review', 'done']),
    },
  },
  async ({ id, status }) => { try { return ok(await api('PATCH', `/tasks/${id}`, { status })) } catch (e) { return fail(e) } }
)

server.registerTool('comentar_atividade',
  {
    title: 'Comentar atividade',
    description: 'Adiciona um comentário (e opcionalmente link de evidência) numa atividade.',
    inputSchema: {
      id: z.string(),
      comment: z.string().describe('Texto do comentário'),
      attachment_url: z.string().optional().describe('URL de evidência (imagem/arquivo)'),
    },
  },
  async ({ id, comment, attachment_url }) => {
    try { return ok(await api('PATCH', `/tasks/${id}`, { comment, attachment_url })) } catch (e) { return fail(e) }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[sp3-mcp] conectado — pronto.')
