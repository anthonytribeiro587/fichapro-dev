'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import type { Automacao, AutomacaoExecucao, Empresa, IntegracaoEmpresa } from '@/lib/types';
import styles from './page.module.css';

type Tab = 'visao' | 'regras' | 'integracoes' | 'historico';
type ConnectionState = { loading: boolean; ok: boolean; configured: boolean; label: string; detail: string };

type Template = {
  key: string;
  icon: string;
  title: string;
  description: string;
  trigger: string;
  channel: string;
  result: string;
  premium?: boolean;
  actions: Array<Record<string, unknown>>;
  conditions: Record<string, unknown>;
};

const templates: Template[] = [
  {
    key: 'payment-task', icon: '✓', title: 'Pagamento confirmado',
    description: 'Ao receber a confirmação do Mercado Pago, cria a ação correta para entregar, separar ou renovar.',
    trigger: 'pagamento_confirmado', channel: 'interno', result: 'Criar próxima ação',
    actions: [{ type: 'criar_tarefa_pos_pagamento' }], conditions: { provider: 'mercadopago' }
  },
  {
    key: 'due-reminder', icon: '◷', title: 'Lembrete de vencimento',
    description: 'Seleciona cobranças próximas do vencimento e prepara uma mensagem personalizada para o cliente.',
    trigger: 'vencimento_proximo', channel: 'whatsapp', result: 'Enviar lembrete', premium: true,
    actions: [{ type: 'enviar_whatsapp', template: 'lembrete_vencimento' }], conditions: { days_before: 3 }
  },
  {
    key: 'incoming-message', icon: '✦', title: 'Triagem de mensagens',
    description: 'Organiza mensagens recebidas pela Evolution, identifica o cliente e cria uma tarefa de atendimento.',
    trigger: 'mensagem_recebida', channel: 'whatsapp', result: 'Classificar e encaminhar', premium: true,
    actions: [{ type: 'classificar_intencao' }, { type: 'criar_tarefa_atendimento' }], conditions: { incoming_only: true }
  },
  {
    key: 'inactive-client', icon: '↗', title: 'Reativação de clientes',
    description: 'Encontra clientes que pararam de comprar e cria uma oportunidade de contato sem disparar spam.',
    trigger: 'cliente_inativo', channel: 'interno', result: 'Criar lista de retorno',
    actions: [{ type: 'criar_tarefa_pos_venda' }], conditions: { inactive_days: 60 }
  }
];

const emptyConnection: ConnectionState = { loading: true, ok: false, configured: false, label: 'Verificando', detail: 'Aguarde...' };

export default function AutomacoesPage() {
  return <AppShell><AutomacoesContent /></AppShell>;
}

function AutomacoesContent() {
  const [tab, setTab] = useState<Tab>('visao');
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [automations, setAutomations] = useState<Automacao[]>([]);
  const [executions, setExecutions] = useState<AutomacaoExecucao[]>([]);
  const [integrations, setIntegrations] = useState<IntegracaoEmpresa[]>([]);
  const [evolution, setEvolution] = useState<ConnectionState>(emptyConnection);
  const [mercadoPago, setMercadoPago] = useState<ConnectionState>(emptyConnection);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    return fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: companyRows, error: companyError } = await supabase
      .from('empresas').select('id,nome,plano,status,perfil_negocio,modulos,configuracoes').order('created_at').limit(1);
    if (companyError || !companyRows?.[0]) {
      setError('Não foi possível localizar a empresa. Confirme as migrations do ambiente DEV.');
      setLoading(false);
      return;
    }
    const company = companyRows[0] as Empresa;
    setEmpresa(company);

    const [automationResult, executionResult, integrationResult] = await Promise.all([
      supabase.from('automacoes').select('*').eq('empresa_id', company.id).order('created_at', { ascending: false }),
      supabase.from('automacao_execucoes').select('*, automacoes(id,nome)').eq('empresa_id', company.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('integracoes_empresa').select('*').eq('empresa_id', company.id).order('provedor')
    ]);

    if (automationResult.error) setError('Execute a migration v55 para ativar a Central de Automações.');
    setAutomations((automationResult.data || []) as Automacao[]);
    setExecutions((executionResult.data || []) as AutomacaoExecucao[]);
    setIntegrations((integrationResult.data || []) as IntegracaoEmpresa[]);
    setLoading(false);
  }, []);

  const testConnections = useCallback(async () => {
    setEvolution(emptyConnection);
    setMercadoPago(emptyConnection);

    const [evolutionResult, mpResult] = await Promise.allSettled([
      authFetch('/api/integracoes/evolution/webhook'),
      authFetch('/api/integracoes/mercadopago/status')
    ]);

    if (evolutionResult.status === 'fulfilled') {
      const payload = await evolutionResult.value.json().catch(() => ({}));
      const state = String(payload?.connection?.instance?.state || payload?.connection?.state || '').toLowerCase();
      const connected = evolutionResult.value.ok && ['open', 'connected', 'online'].includes(state);
      setEvolution({
        loading: false, ok: connected, configured: evolutionResult.value.status !== 503,
        label: connected ? 'Conectado' : 'Precisa de atenção',
        detail: connected ? 'Instância online e pronta para mensagens.' : payload?.error || `Estado atual: ${state || 'não identificado'}`
      });
    } else setEvolution({ loading: false, ok: false, configured: false, label: 'Indisponível', detail: 'Não foi possível consultar a Evolution.' });

    if (mpResult.status === 'fulfilled') {
      const payload = await mpResult.value.json().catch(() => ({}));
      setMercadoPago({
        loading: false, ok: mpResult.value.ok && payload.ok, configured: payload.configured !== false,
        label: mpResult.value.ok && payload.ok ? 'Conectado' : 'Precisa configurar',
        detail: payload.ok ? `Conta ${payload.account?.nickname || payload.account?.email || 'Mercado Pago'} validada.` : payload.error || 'Credencial não validada.'
      });
    } else setMercadoPago({ loading: false, ok: false, configured: false, label: 'Indisponível', detail: 'Não foi possível consultar o Mercado Pago.' });
  }, [authFetch]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (empresa) testConnections(); }, [empresa, testConnections]);

  const metrics = useMemo(() => ({
    active: automations.filter((item) => item.status === 'ativa').length,
    drafts: automations.filter((item) => item.status === 'rascunho').length,
    completed: executions.filter((item) => item.status === 'concluida').length,
    errors: executions.filter((item) => item.status === 'erro').length
  }), [automations, executions]);

  const setupSteps = useMemo(() => [
    { label: 'Modelo de negócio', done: Boolean(empresa?.perfil_negocio), href: '/configuracoes/negocio' },
    { label: 'WhatsApp', done: evolution.ok, href: '#integracoes' },
    { label: 'Mercado Pago', done: mercadoPago.ok, href: '#integracoes' },
    { label: 'Primeira regra', done: automations.length > 0, href: '#modelos' }
  ], [empresa, evolution.ok, mercadoPago.ok, automations.length]);

  async function createFromTemplate(template: Template) {
    if (!empresa) return;
    setActionKey(template.key);
    setError(null);
    setMessage(null);
    const existing = automations.find((item) => item.gatilho === template.trigger && item.nome === template.title);
    if (existing) {
      setMessage('Este modelo já foi adicionado. Abra a aba Regras para configurá-lo.');
      setTab('regras');
      setActionKey(null);
      return;
    }
    const { error: insertError } = await supabase.from('automacoes').insert({
      empresa_id: empresa.id,
      nome: template.title,
      descricao: template.description,
      gatilho: template.trigger,
      canal: template.channel,
      status: 'rascunho',
      condicoes: template.conditions,
      acoes: template.actions,
      dias_semana: [1, 2, 3, 4, 5]
    });
    setActionKey(null);
    if (insertError) setError(insertError.message);
    else {
      setMessage('Modelo adicionado como rascunho. Revise antes de ativar.');
      await loadData();
      setTab('regras');
    }
  }

  async function changeStatus(item: Automacao, status: Automacao['status']) {
    setActionKey(item.id);
    const { error: updateError } = await supabase.from('automacoes').update({ status }).eq('id', item.id).eq('empresa_id', item.empresa_id);
    setActionKey(null);
    if (updateError) setError(updateError.message);
    else await loadData();
  }

  async function configureEvolutionWebhook() {
    if (!empresa) return;
    setActionKey('evolution-webhook');
    setError(null);
    const response = await authFetch('/api/integracoes/evolution/webhook', {
      method: 'POST', body: JSON.stringify({ empresa_id: empresa.id })
    });
    const payload = await response.json().catch(() => ({}));
    setActionKey(null);
    if (!response.ok) setError(payload.error || 'Não foi possível configurar o webhook.');
    else {
      setMessage('Webhook da Evolution configurado no ambiente DEV.');
      await Promise.all([loadData(), testConnections()]);
    }
  }

  const tabLabels: Record<Tab, string> = { visao: 'Visão geral', regras: 'Regras', integracoes: 'Integrações', historico: 'Histórico' };

  return (
    <div className={styles.page}>
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Automação com controle</span>
          <h2>Menos tarefas repetitivas.<br /><em>Mais ações concluídas.</em></h2>
          <p>Conecte pagamento, WhatsApp e operação em fluxos claros. Toda regra começa como rascunho e só executa depois da sua aprovação.</p>
          <div className={styles.heroActions}>
            <button type="button" onClick={() => setTab('regras')}>Ver minhas regras</button>
            <Link href="/pagamentos">Abrir pagamentos</Link>
          </div>
        </div>
        <div className={styles.setupCard}>
          <div className={styles.setupHeader}>
            <div><span>Implantação</span><strong>{setupSteps.filter((step) => step.done).length} de {setupSteps.length} etapas</strong></div>
            <b>{Math.round((setupSteps.filter((step) => step.done).length / setupSteps.length) * 100)}%</b>
          </div>
          <div className={styles.progress}><span style={{ width: `${(setupSteps.filter((step) => step.done).length / setupSteps.length) * 100}%` }} /></div>
          <div className={styles.stepList}>
            {setupSteps.map((step) => <Link href={step.href} key={step.label} className={step.done ? styles.done : ''}><i>{step.done ? '✓' : '○'}</i><span>{step.label}</span><small>{step.done ? 'pronto' : 'configurar'}</small></Link>)}
          </div>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Seções da Central de Automações">
        {(Object.keys(tabLabels) as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ''} onClick={() => setTab(item)}>{tabLabels[item]}{item === 'regras' && automations.length > 0 ? <span>{automations.length}</span> : null}</button>)}
      </nav>

      {tab === 'visao' && <>
        <section className={styles.metrics}>
          <article><span>Regras ativas</span><strong>{loading ? '—' : metrics.active}</strong><small>{metrics.drafts} rascunho(s)</small></article>
          <article><span>Execuções concluídas</span><strong>{loading ? '—' : metrics.completed}</strong><small>últimos 30 registros</small></article>
          <article className={styles.connectionMetric}><span>Integrações online</span><strong>{[evolution.ok, mercadoPago.ok].filter(Boolean).length}/2</strong><small>Evolution + Mercado Pago</small></article>
          <article className={metrics.errors ? styles.errorMetric : ''}><span>Falhas recentes</span><strong>{metrics.errors}</strong><small>{metrics.errors ? 'requer atenção' : 'operação saudável'}</small></article>
        </section>

        <section className={styles.section} id="modelos">
          <div className={styles.sectionHead}><div><span className={styles.kicker}>Comece por um modelo</span><h3>Automações úteis desde o primeiro dia</h3><p>Adicione como rascunho, revise as condições e só depois ative.</p></div><button type="button" className={styles.textButton} onClick={() => setTab('regras')}>Ver todas as regras →</button></div>
          <div className={styles.templateGrid}>
            {templates.map((template) => <article className={styles.templateCard} key={template.key}>
              <div className={styles.templateTop}><span className={styles.templateIcon}>{template.icon}</span>{template.premium && <b>Premium</b>}</div>
              <h4>{template.title}</h4><p>{template.description}</p>
              <div className={styles.flowMini}><span>{template.trigger.replaceAll('_', ' ')}</span><i>→</i><strong>{template.result}</strong></div>
              <button type="button" disabled={actionKey === template.key} onClick={() => createFromTemplate(template)}>{actionKey === template.key ? 'Adicionando...' : 'Usar este modelo'}</button>
            </article>)}
          </div>
        </section>
      </>}

      {tab === 'regras' && <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.kicker}>Motor de regras</span><h3>O que o FichaPRO deve fazer sozinho?</h3><p>Rascunhos não executam. Regras pausadas preservam a configuração sem realizar novas ações.</p></div><button type="button" className={styles.primarySmall} onClick={() => setTab('visao')}>Adicionar por modelo</button></div>
        <div className={styles.rulesList}>
          {!loading && automations.length === 0 && <div className={styles.emptyState}><span>✦</span><h4>Nenhuma regra criada</h4><p>Use um dos modelos da visão geral para começar com segurança.</p><button type="button" onClick={() => setTab('visao')}>Explorar modelos</button></div>}
          {automations.map((item) => <article className={styles.ruleCard} key={item.id}>
            <div className={`${styles.ruleStatus} ${styles[item.status]}`}><i /></div>
            <div className={styles.ruleCopy}><div><strong>{item.nome}</strong><span className={`${styles.statusPill} ${styles[item.status]}`}>{item.status}</span></div><p>{item.descricao || 'Sem descrição.'}</p><small>Quando <b>{item.gatilho.replaceAll('_', ' ')}</b> → canal <b>{item.canal}</b></small></div>
            <div className={styles.ruleActions}>
              {item.status !== 'ativa' && <button type="button" disabled={actionKey === item.id} onClick={() => changeStatus(item, 'ativa')}>Ativar</button>}
              {item.status === 'ativa' && <button type="button" disabled={actionKey === item.id} onClick={() => changeStatus(item, 'pausada')}>Pausar</button>}
              {item.status === 'pausada' && <button type="button" className={styles.ghost} onClick={() => changeStatus(item, 'rascunho')}>Voltar a rascunho</button>}
            </div>
          </article>)}
        </div>
      </section>}

      {tab === 'integracoes' && <section className={styles.section} id="integracoes">
        <div className={styles.sectionHead}><div><span className={styles.kicker}>Conexões do negócio</span><h3>Integrações e webhooks</h3><p>O FichaPRO nunca exibe tokens. Esta tela mostra apenas estado, finalidade e última validação.</p></div><button type="button" className={styles.textButton} onClick={testConnections}>Testar novamente</button></div>
        <div className={styles.integrationGrid}>
          <article className={styles.integrationCard}>
            <header><span className={`${styles.providerIcon} ${styles.whatsapp}`}>W</span><div><strong>Evolution API</strong><small>WhatsApp e eventos de atendimento</small></div><span className={`${styles.connectionBadge} ${evolution.ok ? styles.online : styles.offline}`}>{evolution.loading ? 'testando' : evolution.label}</span></header>
            <p>{evolution.detail}</p>
            <div className={styles.capabilityList}><span>Enviar mensagens</span><span>Receber mensagens</span><span>Criar tarefas de resposta</span></div>
            <div className={styles.integrationActions}><button type="button" disabled={actionKey === 'evolution-webhook'} onClick={configureEvolutionWebhook}>{actionKey === 'evolution-webhook' ? 'Configurando...' : 'Configurar webhook'}</button><button type="button" className={styles.ghost} onClick={testConnections}>Testar conexão</button></div>
          </article>

          <article className={styles.integrationCard}>
            <header><span className={`${styles.providerIcon} ${styles.mp}`}>MP</span><div><strong>Mercado Pago</strong><small>Pix individual e confirmação automática</small></div><span className={`${styles.connectionBadge} ${mercadoPago.ok ? styles.online : styles.offline}`}>{mercadoPago.loading ? 'testando' : mercadoPago.label}</span></header>
            <p>{mercadoPago.detail}</p>
            <div className={styles.capabilityList}><span>Gerar Pix por cliente</span><span>Webhook assinado</span><span>Criar ação após pagamento</span></div>
            <div className={styles.integrationActions}><Link href="/pagamentos">Abrir pagamentos</Link><button type="button" className={styles.ghost} onClick={testConnections}>Testar conexão</button></div>
          </article>
        </div>
        <div className={styles.securityNote}><span>🔒</span><div><strong>Credenciais protegidas no servidor</strong><p>Configure os tokens somente nas variáveis da Vercel DEV. O navegador recebe apenas o resultado dos testes e das operações autorizadas.</p></div></div>
      </section>}

      {tab === 'historico' && <section className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.kicker}>Auditoria</span><h3>Histórico de execuções</h3><p>Veja o que rodou, o que foi ignorado e o que precisa de correção.</p></div></div>
        <div className={styles.historyList}>
          {!loading && executions.length === 0 && <div className={styles.emptyState}><span>◷</span><h4>Ainda não há execuções</h4><p>Os registros aparecerão aqui quando os webhooks e regras começarem a processar eventos.</p></div>}
          {executions.map((item) => <article key={item.id}><span className={`${styles.historyDot} ${styles[item.status]}`} /><div><strong>{item.automacoes?.nome || item.evento_origem.replaceAll('_', ' ')}</strong><small>{new Date(item.created_at).toLocaleString('pt-BR')}</small></div><span className={`${styles.statusPill} ${styles[item.status]}`}>{item.status}</span>{item.erro && <p>{item.erro}</p>}</article>)}
        </div>
      </section>}

      <footer className={styles.pageFooter}><div><strong>{empresa?.configuracoes?.nome_exibicao || empresa?.nome || 'FichaPRO DEV'}</strong><span>{integrations.length} integração(ões) registrada(s)</span></div><Link href="/configuracoes/negocio">Personalizar experiência →</Link></footer>
    </div>
  );
}
