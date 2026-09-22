#!/usr/bin/env node
// MCP server do Sistema SP3 (controle.sp3company.com).
// Conecta a IA do membro ao sistema via token pessoal — vê e atualiza atividades por conversa.
// Config: env SP3_TOKEN (obrigatório, gerado em Configurações) e SP3_URL (opcional).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

const BASE = (process.env.SP3_URL || 'https://controle.sp3company.com').replace(/\/$/, '')
const TOKEN = process.env.SP3_TOKEN
const CONTRACT_GENERATOR = process.env.SP3_CONTRACT_GENERATOR
const CONTRACT_CWD = process.env.SP3_CONTRACT_CWD
const CONTRACT_OUTPUT_DIR = process.env.SP3_CONTRACT_OUTPUT_DIR || 'output/contracts'
const execFileAsync = promisify(execFile)

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

function brDate() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date())
}

async function generateContract({ clientId, ...input }) {
  if (!CONTRACT_GENERATOR) {
    throw new Error('Geração local não configurada. Defina SP3_CONTRACT_GENERATOR no Hermes.')
  }

  const source = await api('GET', `/contracts/${encodeURIComponent(clientId)}/briefing`)
  const client = source.client
  const data = {
    contractCity: input.contract_city || null,
    contractDate: input.contract_date || brDate(),
    client: {
      name: client.name,
      type: client.type,
      document: client.document,
      address: client.address,
      legalRepresentative: client.legal_representative,
      representativeRole: client.representative_role,
      rg: client.representative_rg,
    },
    commercial: {
      monthlyFee: source.commercial_defaults.monthly_fee,
      monthlyFeeText: input.monthly_fee_text || null,
      firstPaymentDate: input.first_payment_date || null,
      recurringPaymentDay: input.recurring_payment_day || source.commercial_defaults.recurring_payment_day || null,
      paymentMethod: input.payment_method || source.commercial_defaults.payment_method || null,
      initialTerm: input.initial_term || null,
      noticePeriodDays: input.notice_period_days || 30,
      minimumMediaBudget: input.minimum_media_budget || null,
      minimumMediaBudgetText: input.minimum_media_budget_text || null,
    },
    scope: {
      googleAds: input.google_ads,
      tracking: input.tracking,
      site: { enabled: input.site, domain: input.site_domain || null, marketValue: input.site_market_value || null, marketValueText: input.site_market_value_text || null },
      googleBusinessProfile: input.google_business_profile,
      socialConsulting: input.social_consulting,
      reportsAndSupport: input.reports_and_support,
    },
    outputDir: CONTRACT_OUTPUT_DIR,
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'sp3-contract-'))
  const briefingPath = path.join(dir, 'briefing.json')
  try {
    await writeFile(briefingPath, JSON.stringify(data), { mode: 0o600 })
    const { stdout } = await execFileAsync(process.execPath, [CONTRACT_GENERATOR, briefingPath], {
      cwd: CONTRACT_CWD || path.dirname(CONTRACT_GENERATOR),
      maxBuffer: 1024 * 1024,
    })
    return { ...JSON.parse(stdout), client: client.display_name, missing_fields: source.missing_fields }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

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
  {
    title: 'Listar clientes',
    description: 'Lista clientes ativos e seus projetos. Use nome para localizar cliente antes de criar atividade ou contrato.',
    inputSchema: { nome: z.string().optional().describe('Nome parcial do cliente') },
  },
  async ({ nome }) => {
    try {
      const qs = new URLSearchParams()
      if (nome) qs.set('search', nome)
      return ok(await api('GET', `/clients${qs.size ? `?${qs}` : ''}`))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('criar_cliente_e_projeto',
  {
    title: 'Criar cliente e projeto',
    description: 'Cadastra um cliente com dados mínimos e cria seu projeto inicial em uma operação atômica. Exige token de sócio. Cliente começa como lead; não cria contrato, cobrança ou ciclo financeiro. Se já houver cliente ativo com o mesmo nome, retorna conflito sem duplicar. Depois use criar_atividade com o ID do projeto retornado.',
    inputSchema: {
      company_name: z.string().min(1).max(160).describe('Nome do cliente ou clínica'),
      monthly_fee: z.number().min(0).nullable().optional().describe('Mensalidade em reais, se já definida'),
      project_name: z.string().min(1).max(160).describe('Nome do projeto inicial'),
      project_type: z.enum(['recurring', 'one_time', 'campaign']).optional().describe('Tipo do projeto. Padrão: one_time.'),
      idempotency_key: z.string().uuid().optional().describe('UUID para reconhecer repetição da mesma chamada; gere um novo para uma nova operação.'),
    },
  },
  async ({ idempotency_key, ...args }) => {
    try {
      return ok(await api('POST', '/clients/create', {
        ...args,
        idempotency_key: idempotency_key || randomUUID(),
      }))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('atividades_paradas',
  {
    title: 'Atividades paradas',
    description: 'Lista atividades abertas com prazo vencido. Não inclui tarefas sem prazo.',
    inputSchema: {},
  },
  async () => { try { return ok(await api('GET', '/tasks/stalled')) } catch (e) { return fail(e) } }
)

server.registerTool('ver_financeiro',
  {
    title: 'Ver financeiro',
    description: 'Mostra MRR, carteira, KPIs de recebíveis e cobranças do mês. Exige token de sócio.',
    inputSchema: { mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('Mês no formato YYYY-MM') },
  },
  async ({ mes }) => {
    try {
      const qs = mes ? `?month=${encodeURIComponent(mes)}` : ''
      return ok(await api('GET', `/finance${qs}`))
    } catch (e) { return fail(e) }
  }
)

server.registerTool('preparar_contrato',
  {
    title: 'Preparar contrato',
    description: 'Lê os dados cadastrais e financeiros necessários para contrato de um cliente. Exige token de sócio; não gera nem envia arquivo.',
    inputSchema: { client_id: z.string().describe('ID do cliente, obtido em listar_clientes') },
  },
  async ({ client_id }) => { try { return ok(await api('GET', `/contracts/${encodeURIComponent(client_id)}/briefing`)) } catch (e) { return fail(e) } }
)

server.registerTool('gerar_contrato',
  {
    title: 'Gerar contrato',
    description: 'Gera DOCX e PDF no Hermes usando o cadastro do cliente no Sistema SP3. Não envia, assina ou publica contrato. Campos comerciais ausentes ficam destacados no arquivo.',
    inputSchema: {
      client_id: z.string().describe('ID do cliente, obtido em listar_clientes'),
      contract_city: z.string().optional().describe('Cidade do contrato'),
      contract_date: z.string().optional().describe('Data do contrato por extenso'),
      monthly_fee_text: z.string().optional().describe('Mensalidade por extenso'),
      first_payment_date: z.string().optional().describe('Primeiro vencimento por extenso'),
      recurring_payment_day: z.string().optional().describe('Dia de vencimento'),
      payment_method: z.string().optional().describe('Forma de pagamento'),
      initial_term: z.string().optional().describe('Prazo inicial de vigência'),
      notice_period_days: z.number().int().min(1).max(365).optional(),
      minimum_media_budget: z.string().optional().describe('Verba mínima de mídia'),
      minimum_media_budget_text: z.string().optional().describe('Verba mínima por extenso'),
      google_ads: z.boolean().default(false),
      tracking: z.boolean().default(false),
      site: z.boolean().default(false),
      site_domain: z.string().optional(),
      site_market_value: z.string().optional(),
      site_market_value_text: z.string().optional(),
      google_business_profile: z.boolean().default(false),
      social_consulting: z.boolean().default(false),
      reports_and_support: z.boolean().default(true),
    },
  },
  async (args) => { try { return ok(await generateContract(args)) } catch (e) { return fail(e) } }
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
    description: 'Edita uma atividade existente: responsável, prazo, prioridade, status e/ou recorrência. Informe ao menos um campo. Use "recorrencia" para ligar (mensal/semanal/quinzenal) ou "nenhuma" para desligar; em mensal, "dia_do_mes".',
    inputSchema: {
      id: z.string().describe('ID da atividade'),
      responsavel: z.string().optional().describe('Nome do responsável (parcial). String vazia limpa o responsável.'),
      due_date: z.string().optional().describe('Novo prazo YYYY-MM-DD. String vazia remove o prazo.'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
      recorrencia: z.enum(['mensal', 'semanal', 'quinzenal', 'nenhuma']).optional().describe('Liga/desliga recorrência. "nenhuma" volta a atividade a avulsa.'),
      dia_do_mes: z.number().int().min(1).max(31).optional().describe('Dia do mês da recorrência mensal (ex.: 20).'),
    },
  },
  async ({ id, recorrencia, dia_do_mes, ...patch }) => {
    try {
      if (recorrencia === 'nenhuma') patch.recurrence_type = null
      else if (recorrencia) patch.recurrence_type = RECORRENCIA_MAP[recorrencia]
      if (dia_do_mes != null) patch.recurring_day = dia_do_mes
      return ok(await api('PATCH', `/tasks/${id}`, patch))
    } catch (e) { return fail(e) }
  }
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
