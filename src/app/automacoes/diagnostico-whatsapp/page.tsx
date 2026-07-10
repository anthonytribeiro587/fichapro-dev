'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

type Diagnostic = {
  ok: boolean;
  integration: {
    status?: string;
    ultimo_teste_em?: string | null;
    ultimo_erro?: string | null;
    configuracao_publica?: Record<string, unknown>;
  } | null;
  events: Array<{ id: string; tipo?: string; status?: string; erro?: string | null; created_at: string; processado_em?: string | null }>;
  incomingMessages: Array<{ id: string; conversa_id: string; cliente_id?: string | null; tipo?: string; conteudo?: string | null; enviada_em: string }>;
  responseTasks: Array<{ id: string; titulo: string; status: string; descricao?: string | null; created_at: string }>;
  conversations: Array<{ id: string; telefone: string; nome_contato?: string | null; status: string; ultima_mensagem_em?: string | null }>;
  provider?: {
    reachable: boolean;
    error?: string | null;
    connectionReachable: boolean;
    connectionError?: string | null;
    enabled: boolean;
    url: string;
    expectedUrl: string;
    urlMatches: boolean;
    events: string[];
    receivesMessages: boolean;
  };
  queryErrors?: string[];
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Ainda não registrado';
  return new Date(value).toLocaleString('pt-BR');
}

export default function DiagnosticoWhatsappPage() {
  return <AppShell><DiagnosticContent /></AppShell>;
}

function DiagnosticContent() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selfTesting, setSelfTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    return fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) }
    });
  }, []);

  const loadDiagnostic = useCallback(async (companyId?: string) => {
    setLoading(true);
    setError(null);

    try {
      let currentCompanyId: string | null = companyId || empresaId;
      if (!currentCompanyId) {
        const { data: companies, error: companyError } = await supabase
          .from('empresas')
          .select('id')
          .order('created_at')
          .limit(1);
        if (companyError || !companies?.[0]) throw new Error('Empresa não encontrada para este login.');
        currentCompanyId = String(companies[0].id);
        setEmpresaId(currentCompanyId);
      }
      if (!currentCompanyId) throw new Error('Empresa não encontrada para este login.');

      const response = await authFetch(`/api/integracoes/evolution/diagnostico?empresa_id=${encodeURIComponent(currentCompanyId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o diagnóstico.');
      setDiagnostic(payload as Diagnostic);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível consultar o diagnóstico.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, empresaId]);

  useEffect(() => { loadDiagnostic(); }, [loadDiagnostic]);

  async function runAction(action: 'self_test' | 'reprocess_latest') {
    if (!empresaId) return;
    const isSelfTest = action === 'self_test';
    if ((isSelfTest && selfTesting) || (!isSelfTest && processing)) return;

    if (isSelfTest) setSelfTesting(true);
    else setProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authFetch('/api/integracoes/evolution/diagnostico', {
        method: 'POST',
        body: JSON.stringify({ empresa_id: empresaId, action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível executar o teste.');
      setMessage(payload.message || 'Teste concluído.');
      await loadDiagnostic(empresaId);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Não foi possível executar o teste.');
    } finally {
      if (isSelfTest) setSelfTesting(false);
      else setProcessing(false);
    }
  }

  const lastEvent = diagnostic?.events?.[0];
  const lastMessage = diagnostic?.incomingMessages?.[0];
  const lastTask = diagnostic?.responseTasks?.[0];
  const integrationError = diagnostic?.integration?.ultimo_erro;
  const provider = diagnostic?.provider;

  const steps = [
    {
      label: 'Webhook recebeu evento',
      done: Boolean(lastEvent),
      detail: lastEvent ? `${lastEvent.tipo || 'Evento'} · ${formatDateTime(lastEvent.created_at)}` : 'Nenhum evento da Evolution chegou ao FichaPRO.'
    },
    {
      label: 'Mensagem entrou no banco',
      done: Boolean(lastMessage),
      detail: lastMessage ? `${lastMessage.tipo || 'mensagem'} · ${formatDateTime(lastMessage.enviada_em)}` : 'Nenhuma mensagem de entrada foi registrada.'
    },
    {
      label: 'Tarefa de resposta criada',
      done: Boolean(lastTask),
      detail: lastTask ? `${lastTask.titulo} · ${lastTask.status}` : 'Ainda não existe uma tarefa do tipo responder.'
    }
  ];

  const providerChecks = [
    { label: 'Evolution respondeu à consulta', done: Boolean(provider?.reachable), detail: provider?.error || 'API acessível.' },
    { label: 'Webhook está habilitado', done: Boolean(provider?.enabled), detail: provider?.enabled ? 'Configuração ativa.' : 'A configuração está desabilitada.' },
    { label: 'URL salva é a esperada', done: Boolean(provider?.urlMatches), detail: provider?.urlMatches ? 'A URL confere com o FichaPRO DEV.' : 'A URL salva não corresponde ao endpoint atual.' },
    { label: 'Evento de mensagens está ativo', done: Boolean(provider?.receivesMessages), detail: provider?.receivesMessages ? 'MESSAGES_UPSERT configurado.' : 'MESSAGES_UPSERT não foi encontrado.' }
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span>Diagnóstico da integração</span>
          <h2>WhatsApp, da mensagem à próxima ação</h2>
          <p>Teste separadamente o FichaPRO e a entrega real da Evolution. Assim fica claro em qual lado o fluxo parou.</p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" onClick={() => runAction('self_test')} disabled={selfTesting || loading}>{selfTesting ? 'Testando FichaPRO...' : 'Testar FichaPRO internamente'}</button>
          <button type="button" onClick={() => loadDiagnostic(empresaId || undefined)} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar diagnóstico'}</button>
          <Link href="/operacao">Abrir próximas ações</Link>
        </div>
      </section>

      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      {integrationError && <Notice type="danger">Último erro registrado pela Evolution: {integrationError}</Notice>}
      {diagnostic?.queryErrors?.length ? <Notice type="danger">{diagnostic.queryErrors.join(' | ')}</Notice> : null}

      <section className={styles.providerPanel}>
        <div className={styles.providerHead}>
          <div>
            <span>Configuração lida diretamente da Evolution</span>
            <h3>{provider?.urlMatches && provider?.receivesMessages && provider?.enabled ? 'Webhook configurado corretamente' : 'Webhook precisa de atenção'}</h3>
          </div>
          <b className={provider?.urlMatches && provider?.receivesMessages && provider?.enabled ? styles.success : styles.warning}>
            {provider?.urlMatches && provider?.receivesMessages && provider?.enabled ? 'configurado' : 'verificar'}
          </b>
        </div>
        <div className={styles.providerChecks}>
          {providerChecks.map((check) => (
            <article key={check.label} className={check.done ? styles.checkDone : styles.checkPending}>
              <i>{check.done ? '✓' : '!'}</i>
              <div><strong>{check.label}</strong><small>{check.detail}</small></div>
            </article>
          ))}
        </div>
        <dl className={styles.urlList}>
          <div><dt>URL salva na Evolution</dt><dd>{provider?.url || 'Não localizada'}</dd></div>
          <div><dt>URL esperada</dt><dd>{provider?.expectedUrl || 'Não calculada'}</dd></div>
          <div><dt>Eventos</dt><dd>{provider?.events?.join(', ') || 'Nenhum evento retornado'}</dd></div>
        </dl>
      </section>

      <section className={styles.pipeline}>
        {steps.map((step, index) => (
          <article key={step.label} className={step.done ? styles.done : styles.pending}>
            <div className={styles.stepNumber}>{step.done ? '✓' : index + 1}</div>
            <div><strong>{step.label}</strong><p>{step.detail}</p></div>
          </article>
        ))}
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <header><div><span>Último evento</span><h3>{lastEvent?.tipo || 'Nenhum evento'}</h3></div><b className={lastEvent?.status === 'processado' ? styles.success : styles.warning}>{lastEvent?.status || 'aguardando'}</b></header>
          <dl>
            <div><dt>Recebido em</dt><dd>{formatDateTime(lastEvent?.created_at)}</dd></div>
            <div><dt>Processado em</dt><dd>{formatDateTime(lastEvent?.processado_em)}</dd></div>
            <div><dt>Erro</dt><dd>{lastEvent?.erro || 'Nenhum erro registrado'}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <header><div><span>Última mensagem recebida</span><h3>{lastMessage ? 'Entrada localizada' : 'Sem entrada'}</h3></div></header>
          <p className={styles.messagePreview}>{lastMessage?.conteudo || (lastMessage ? `[${lastMessage.tipo || 'mensagem'}]` : 'Envie uma nova mensagem de outro número para o WhatsApp conectado.')}</p>
          <small>{formatDateTime(lastMessage?.enviada_em)}</small>
        </section>

        <section className={styles.card}>
          <header><div><span>Próxima ação</span><h3>{lastTask?.titulo || 'Tarefa não criada'}</h3></div></header>
          <p>{lastTask?.descricao || 'Use o autoteste para validar o FichaPRO ou transforme a última mensagem real recebida em tarefa.'}</p>
          <button type="button" onClick={() => runAction('reprocess_latest')} disabled={processing || !lastMessage}>{processing ? 'Criando tarefa...' : lastTask ? 'Verificar/reaproveitar tarefa' : 'Criar tarefa da última mensagem'}</button>
        </section>
      </div>

      <section className={styles.help}>
        <strong>Como interpretar o autoteste</strong>
        <p>Se o botão “Testar FichaPRO internamente” criar evento, mensagem e tarefa, o banco e o endpoint estão funcionando. Se depois uma mensagem real continuar sem aparecer, o problema está exclusivamente na entrega da Evolution, na instância ou na rede onde ela está hospedada.</p>
      </section>
    </div>
  );
}
