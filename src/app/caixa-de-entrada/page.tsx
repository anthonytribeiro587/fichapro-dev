'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ConversaWhatsapp, Empresa, MensagemWhatsapp } from '@/lib/types';
import styles from './page.module.css';

type InboxFilter = 'aguardando' | 'todas' | 'resolvidas';
type ConversationWithPreview = ConversaWhatsapp & { ultima_mensagem?: MensagemWhatsapp | null };

const statusLabel: Record<ConversaWhatsapp['status'], string> = {
  aberta: 'Aberta',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_equipe: 'Precisa de resposta',
  resolvida: 'Resolvida',
  arquivada: 'Arquivada'
};

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function messagePreview(message?: MensagemWhatsapp | null) {
  if (!message) return 'Sem mensagens registradas';
  if (message.conteudo) return message.conteudo;
  return `[${message.tipo || 'mensagem'}]`;
}

export default function CaixaDeEntradaPage() {
  return <AppShell><InboxContent /></AppShell>;
}

function InboxContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [conversations, setConversations] = useState<ConversationWithPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MensagemWhatsapp[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('aguardando');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    return fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {})
      }
    });
  }, []);

  const loadConversations = useCallback(async (preserveSelection = true) => {
    setError(null);
    const { data: companies, error: companyError } = await supabase
      .from('empresas')
      .select('id,nome,plano,status,perfil_negocio,modulos,configuracoes')
      .order('created_at')
      .limit(1);

    if (companyError || !companies?.[0]) {
      setError('Empresa não encontrada para este login.');
      setLoading(false);
      return;
    }

    const current = companies[0] as Empresa;
    setEmpresa(current);

    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversas_whatsapp')
      .select('*,clientes(id,nome,telefone,email,categoria)')
      .eq('empresa_id', current.id)
      .neq('status', 'arquivada')
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false });

    if (conversationError) {
      setError(`Não foi possível carregar as conversas: ${conversationError.message}`);
      setLoading(false);
      return;
    }

    const rows = (conversationRows || []) as ConversationWithPreview[];
    const ids = rows.map((item) => item.id);
    let latestByConversation = new Map<string, MensagemWhatsapp>();

    if (ids.length) {
      const { data: messageRows } = await supabase
        .from('mensagens_whatsapp')
        .select('*')
        .eq('empresa_id', current.id)
        .in('conversa_id', ids)
        .order('enviada_em', { ascending: false });

      latestByConversation = new Map<string, MensagemWhatsapp>();
      for (const item of (messageRows || []) as MensagemWhatsapp[]) {
        if (!latestByConversation.has(item.conversa_id)) latestByConversation.set(item.conversa_id, item);
      }
    }

    const withPreview = rows.map((item) => ({ ...item, ultima_mensagem: latestByConversation.get(item.id) || null }));
    setConversations(withPreview);

    const requested = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversa') : null;
    const previous = preserveSelection ? selectedId : null;
    const next = requested && withPreview.some((item) => item.id === requested)
      ? requested
      : previous && withPreview.some((item) => item.id === previous)
        ? previous
        : withPreview[0]?.id || null;
    setSelectedId(next);
    setLoading(false);
  }, [selectedId]);

  const loadThread = useCallback(async (conversationId: string | null) => {
    if (!conversationId || !empresa) {
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    const { data, error: threadError } = await supabase
      .from('mensagens_whatsapp')
      .select('*')
      .eq('empresa_id', empresa.id)
      .eq('conversa_id', conversationId)
      .order('enviada_em', { ascending: true });
    if (threadError) setError(`Não foi possível carregar a conversa: ${threadError.message}`);
    else setMessages((data || []) as MensagemWhatsapp[]);
    setLoadingThread(false);
  }, [empresa]);

  useEffect(() => { loadConversations(false); }, [loadConversations]);
  useEffect(() => { loadThread(selectedId); }, [loadThread, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => loadConversations(true), 12000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesFilter = filter === 'todas'
        || (filter === 'aguardando' && conversation.status === 'aguardando_equipe')
        || (filter === 'resolvidas' && conversation.status === 'resolvida');
      const haystack = `${conversation.clientes?.nome || ''} ${conversation.nome_contato || ''} ${conversation.telefone} ${messagePreview(conversation.ultima_mensagem)}`.toLowerCase();
      return matchesFilter && (!term || haystack.includes(term));
    });
  }, [conversations, filter, search]);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const waitingCount = conversations.filter((item) => item.status === 'aguardando_equipe').length;

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresa || !selected || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authFetch('/api/whatsapp/mensagens', {
        method: 'POST',
        body: JSON.stringify({ empresa_id: empresa.id, conversa_id: selected.id, mensagem: draft.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');
      setDraft('');
      setMessage('Mensagem enviada e conversa movida para “Aguardando cliente”.');
      await loadConversations(true);
      await loadThread(selected.id);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function updateConversationStatus(status: ConversaWhatsapp['status']) {
    if (!empresa || !selected) return;
    setError(null);
    const { error: updateError } = await supabase
      .from('conversas_whatsapp')
      .update({ status })
      .eq('empresa_id', empresa.id)
      .eq('id', selected.id);
    if (updateError) setError(updateError.message);
    else {
      setMessage(status === 'resolvida' ? 'Conversa marcada como resolvida.' : 'Conversa reaberta.');
      await loadConversations(true);
    }
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    setMessage(null);
    setError(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('conversa', id);
      window.history.replaceState({}, '', url.toString());
    }
  }

  return (
    <div className={styles.page}>
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className={styles.summaryBar}>
        <div>
          <span>Central de atendimento</span>
          <h2>Caixa de entrada</h2>
          <p>Converse com clientes sem misturar atendimento com tarefas de entrega, cobrança ou renovação.</p>
        </div>
        <div className={styles.summaryMetrics}>
          <article><strong>{waitingCount}</strong><span>precisam de resposta</span></article>
          <article><strong>{conversations.length}</strong><span>conversas recentes</span></article>
        </div>
      </section>

      <section className={styles.inbox}>
        <aside className={`${styles.conversationPanel} ${selected ? styles.hasSelection : ''}`}>
          <div className={styles.panelTop}>
            <div>
              <strong>Conversas</strong>
              <small>{waitingCount ? `${waitingCount} aguardando você` : 'Tudo respondido'}</small>
            </div>
            <button type="button" onClick={() => loadConversations(true)} aria-label="Atualizar conversas">↻</button>
          </div>

          <input
            className={styles.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nome, telefone ou mensagem"
          />

          <div className={styles.filters}>
            <button type="button" className={filter === 'aguardando' ? styles.active : ''} onClick={() => setFilter('aguardando')}>Aguardando</button>
            <button type="button" className={filter === 'todas' ? styles.active : ''} onClick={() => setFilter('todas')}>Todas</button>
            <button type="button" className={filter === 'resolvidas' ? styles.active : ''} onClick={() => setFilter('resolvidas')}>Resolvidas</button>
          </div>

          <div className={styles.conversationList}>
            {loading && <div className={styles.empty}>Carregando conversas...</div>}
            {!loading && filteredConversations.length === 0 && <div className={styles.empty}>Nenhuma conversa neste filtro.</div>}
            {filteredConversations.map((conversation) => {
              const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone;
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`${styles.conversationItem} ${selectedId === conversation.id ? styles.selected : ''}`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <span className={styles.avatar}>{initials(name)}</span>
                  <span className={styles.conversationCopy}>
                    <span className={styles.nameLine}><strong>{name}</strong><small>{formatTime(conversation.ultima_mensagem_em)}</small></span>
                    <span className={styles.preview}>{messagePreview(conversation.ultima_mensagem)}</span>
                    <span className={`${styles.status} ${styles[conversation.status]}`}>{statusLabel[conversation.status]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`${styles.threadPanel} ${selected ? styles.open : ''}`}>
          {!selected && <div className={styles.threadEmpty}><strong>Escolha uma conversa</strong><p>As mensagens aparecerão aqui.</p></div>}
          {selected && <>
            <header className={styles.threadHeader}>
              <button type="button" className={styles.backButton} onClick={() => setSelectedId(null)}>←</button>
              <span className={styles.avatar}>{initials(selected.clientes?.nome || selected.nome_contato || selected.telefone)}</span>
              <div>
                <strong>{selected.clientes?.nome || selected.nome_contato || selected.telefone}</strong>
                <small>{selected.telefone} · {statusLabel[selected.status]}</small>
              </div>
              <div className={styles.threadActions}>
                {selected.status === 'resolvida'
                  ? <button type="button" onClick={() => updateConversationStatus('aguardando_equipe')}>Reabrir</button>
                  : <button type="button" onClick={() => updateConversationStatus('resolvida')}>Resolver</button>}
              </div>
            </header>

            <div className={styles.messages}>
              {loadingThread && <div className={styles.threadEmpty}>Carregando mensagens...</div>}
              {!loadingThread && messages.length === 0 && <div className={styles.threadEmpty}>Nenhuma mensagem registrada.</div>}
              {messages.map((item) => (
                <article key={item.id} className={`${styles.bubbleRow} ${item.direcao === 'saida' ? styles.outgoing : styles.incoming}`}>
                  <div className={styles.bubble}>
                    <p>{item.conteudo || `[${item.tipo}]`}</p>
                    <small>{formatTime(item.enviada_em)}{item.direcao === 'saida' ? ` · ${item.status}` : ''}</small>
                  </div>
                </article>
              ))}
            </div>

            <form className={styles.composer} onSubmit={sendMessage}>
              <textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Digite uma resposta..."
                disabled={sending}
              />
              <button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar'}</button>
            </form>
          </>}
        </main>

        <aside className={styles.contactPanel}>
          {!selected && <div className={styles.contactEmpty}>Selecione uma conversa para ver o cliente.</div>}
          {selected && <>
            <span className={styles.contactAvatar}>{initials(selected.clientes?.nome || selected.nome_contato || selected.telefone)}</span>
            <h3>{selected.clientes?.nome || selected.nome_contato || 'Contato não cadastrado'}</h3>
            <p>{selected.telefone}</p>
            <div className={styles.contactStatus}><span>Situação</span><strong>{statusLabel[selected.status]}</strong></div>
            {selected.cliente_id
              ? <Link href={`/clientes/${selected.cliente_id}`}>Abrir ficha do cliente</Link>
              : <Link href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>Cadastrar como cliente</Link>}
            <Link href={`/operacao?cliente=${selected.cliente_id || ''}`}>Criar próxima ação</Link>
            <small>Responder nesta tela conclui automaticamente a tarefa “Responder cliente”.</small>
          </>}
        </aside>
      </section>
    </div>
  );
}
