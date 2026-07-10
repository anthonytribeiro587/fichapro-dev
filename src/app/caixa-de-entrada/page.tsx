'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ConversaWhatsapp, Empresa, MensagemWhatsapp } from '@/lib/types';

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
  const [feedback, setFeedback] = useState<string | null>(null);

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
    const latestByConversation = new Map<string, MensagemWhatsapp>();

    if (ids.length) {
      const { data: messageRows } = await supabase
        .from('mensagens_whatsapp')
        .select('*')
        .eq('empresa_id', current.id)
        .in('conversa_id', ids)
        .order('enviada_em', { ascending: false });

      for (const item of (messageRows || []) as MensagemWhatsapp[]) {
        if (!latestByConversation.has(item.conversa_id)) latestByConversation.set(item.conversa_id, item);
      }
    }

    const withPreview = rows.map((item) => ({ ...item, ultima_mensagem: latestByConversation.get(item.id) || null }));
    setConversations(withPreview);

    const requested = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('conversa') : null;
    setSelectedId((currentSelected) => {
      const previous = preserveSelection ? currentSelected : null;
      if (requested && withPreview.some((item) => item.id === requested)) return requested;
      if (previous && withPreview.some((item) => item.id === previous)) return previous;
      return withPreview[0]?.id || null;
    });
    setLoading(false);
  }, []);

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

  useEffect(() => { void loadConversations(false); }, [loadConversations]);
  useEffect(() => { void loadThread(selectedId); }, [loadThread, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadConversations(true);
      if (selectedId) void loadThread(selectedId);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadThread, selectedId]);

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
  const waitingCustomerCount = conversations.filter((item) => item.status === 'aguardando_cliente').length;

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresa || !selected || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await authFetch('/api/whatsapp/mensagens', {
        method: 'POST',
        body: JSON.stringify({ empresa_id: empresa.id, conversa_id: selected.id, mensagem: draft.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');
      setDraft('');
      setFeedback('Mensagem enviada. Agora estamos aguardando o cliente.');
      await Promise.all([loadConversations(true), loadThread(selected.id)]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  async function updateConversationStatus(status: ConversaWhatsapp['status']) {
    if (!empresa || !selected) return;
    setError(null);
    setFeedback(null);
    const { error: updateError } = await supabase
      .from('conversas_whatsapp')
      .update({ status })
      .eq('empresa_id', empresa.id)
      .eq('id', selected.id);
    if (updateError) setError(updateError.message);
    else {
      setFeedback(status === 'resolvida' ? 'Conversa marcada como resolvida.' : 'Conversa reaberta para atendimento.');
      await loadConversations(true);
    }
  }

  function selectConversation(id: string) {
    setSelectedId(id);
    setFeedback(null);
    setError(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('conversa', id);
      window.history.replaceState({}, '', url.toString());
    }
  }

  return (
    <div className="inbox-page">
      {error && <Notice type="danger">{error}</Notice>}
      {feedback && <Notice type="success">{feedback}</Notice>}

      <section className="summary-bar">
        <div>
          <span className="eyebrow-local">Central de atendimento</span>
          <h2>Caixa de entrada</h2>
          <p>Atenda clientes, acompanhe retornos e mantenha as tarefas operacionais em uma fila separada.</p>
        </div>
        <div className="summary-metrics">
          <article className={waitingCount ? 'attention' : ''}><strong>{waitingCount}</strong><span>precisam de resposta</span></article>
          <article><strong>{waitingCustomerCount}</strong><span>aguardando cliente</span></article>
        </div>
      </section>

      <section className="inbox-shell">
        <aside className={`conversation-panel ${selected ? 'has-selection' : ''}`}>
          <div className="panel-top">
            <div><strong>Conversas</strong><small>{waitingCount ? `${waitingCount} aguardando você` : 'Tudo respondido'}</small></div>
            <button type="button" onClick={() => loadConversations(true)} aria-label="Atualizar conversas">↻</button>
          </div>

          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou mensagem" /></label>

          <div className="inbox-filters">
            <button type="button" className={filter === 'aguardando' ? 'active' : ''} onClick={() => setFilter('aguardando')}>Para responder</button>
            <button type="button" className={filter === 'todas' ? 'active' : ''} onClick={() => setFilter('todas')}>Todas</button>
            <button type="button" className={filter === 'resolvidas' ? 'active' : ''} onClick={() => setFilter('resolvidas')}>Resolvidas</button>
          </div>

          <div className="conversation-list">
            {loading && <div className="empty-state">Carregando conversas...</div>}
            {!loading && filteredConversations.length === 0 && <div className="empty-state"><strong>Nada por aqui</strong><span>Nenhuma conversa neste filtro.</span></div>}
            {filteredConversations.map((conversation) => {
              const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone;
              return (
                <button type="button" key={conversation.id} className={`conversation-item ${selectedId === conversation.id ? 'selected' : ''}`} onClick={() => selectConversation(conversation.id)}>
                  <span className="avatar">{initials(name)}</span>
                  <span className="conversation-copy">
                    <span className="name-line"><strong>{name}</strong><small>{formatTime(conversation.ultima_mensagem_em)}</small></span>
                    <span className="preview">{messagePreview(conversation.ultima_mensagem)}</span>
                    <span className={`conversation-status ${conversation.status}`}>{statusLabel[conversation.status]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`thread-panel ${selected ? 'open' : ''}`}>
          {!selected && <div className="thread-empty"><span>💬</span><strong>Escolha uma conversa</strong><p>O histórico e a caixa de resposta aparecerão aqui.</p></div>}
          {selected && <>
            <header className="thread-header">
              <button type="button" className="back-button" onClick={() => setSelectedId(null)} aria-label="Voltar para conversas">←</button>
              <span className="avatar">{initials(selected.clientes?.nome || selected.nome_contato || selected.telefone)}</span>
              <div className="thread-person"><strong>{selected.clientes?.nome || selected.nome_contato || selected.telefone}</strong><small>{selected.telefone} · {statusLabel[selected.status]}</small></div>
              <div className="thread-actions">
                {selected.status === 'resolvida'
                  ? <button type="button" onClick={() => updateConversationStatus('aguardando_equipe')}>Reabrir</button>
                  : <button type="button" onClick={() => updateConversationStatus('resolvida')}>Resolver</button>}
              </div>
            </header>

            <div className="messages">
              {loadingThread && <div className="thread-empty compact">Carregando mensagens...</div>}
              {!loadingThread && messages.length === 0 && <div className="thread-empty compact">Nenhuma mensagem registrada.</div>}
              {messages.map((item) => (
                <article key={item.id} className={`bubble-row ${item.direcao === 'saida' ? 'outgoing' : 'incoming'}`}>
                  <div className="bubble"><p>{item.conteudo || `[${item.tipo}]`}</p><small>{formatTime(item.enviada_em)}{item.direcao === 'saida' ? ` · ${item.status}` : ''}</small></div>
                </article>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit(); }} placeholder="Digite uma resposta..." disabled={sending} />
              <div><small>Ctrl + Enter para enviar</small><button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Enviando...' : 'Enviar mensagem'}</button></div>
            </form>
          </>}
        </main>

        <aside className="contact-panel">
          {!selected && <div className="contact-empty">Selecione uma conversa para ver o contexto do cliente.</div>}
          {selected && <>
            <span className="contact-avatar">{initials(selected.clientes?.nome || selected.nome_contato || selected.telefone)}</span>
            <h3>{selected.clientes?.nome || selected.nome_contato || 'Contato não cadastrado'}</h3>
            <p>{selected.telefone}</p>
            <div className="contact-facts">
              <div><span>Situação</span><strong>{statusLabel[selected.status]}</strong></div>
              <div><span>Cadastro</span><strong>{selected.cliente_id ? selected.clientes?.categoria || 'Cliente' : 'Novo contato'}</strong></div>
            </div>
            {selected.cliente_id
              ? <Link className="primary-link" href={`/clientes/${selected.cliente_id}`}>Abrir ficha do cliente</Link>
              : <Link className="primary-link" href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>Cadastrar como cliente</Link>}
            <Link className="secondary-link" href={`/operacao?cliente=${selected.cliente_id || ''}`}>Criar ação operacional</Link>
            <small className="helper">Ao responder, a tarefa antiga de “Responder cliente” é concluída automaticamente.</small>
          </>}
        </aside>
      </section>

      <style jsx>{`
        .inbox-page{display:grid;gap:16px;min-width:0}.summary-bar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 24px;border:1px solid rgba(112,80,62,.1);border-radius:22px;background:rgba(255,255,255,.84);box-shadow:0 18px 44px rgba(67,46,32,.045)}.eyebrow-local{display:block;color:#9a5639;font-size:.67rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.summary-bar h2{margin:4px 0 7px;font-size:1.55rem;letter-spacing:-.04em}.summary-bar p{margin:0;color:#7d6d64;font-size:.86rem}.summary-metrics{display:flex;gap:10px}.summary-metrics article{min-width:132px;padding:13px 15px;border-radius:16px;background:#f8f1ed}.summary-metrics article.attention{background:#fff0e5}.summary-metrics strong{display:block;font-size:1.28rem}.summary-metrics span{color:#8a776d;font-size:.68rem}.inbox-shell{display:grid;grid-template-columns:minmax(270px,.72fr) minmax(420px,1.45fr) minmax(230px,.62fr);min-height:610px;border:1px solid rgba(112,80,62,.11);border-radius:24px;background:#fff;box-shadow:0 18px 46px rgba(67,46,32,.055);overflow:hidden}.conversation-panel,.contact-panel{min-width:0;background:#fffdfb}.conversation-panel{display:flex;flex-direction:column;border-right:1px solid #eee2dc}.panel-top{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 12px}.panel-top strong{display:block;font-size:.94rem}.panel-top small{display:block;margin-top:3px;color:#947f74;font-size:.68rem}.panel-top button{width:34px;height:34px;border:1px solid #e3d5cd;border-radius:11px;background:#fff;color:#754331;font-size:1rem}.search-box{display:flex;align-items:center;gap:8px;margin:0 14px 10px;padding:0 12px;border:1px solid #e2d5cd;border-radius:13px;background:#fff}.search-box span{color:#a38d82}.search-box input{width:100%;height:42px;border:0;background:transparent;outline:0;font-size:.76rem}.inbox-filters{display:flex;gap:5px;padding:0 14px 12px}.inbox-filters button{flex:1;min-height:34px;border:0;border-radius:10px;background:#f6efeb;color:#806b61;font-size:.66rem;font-weight:800}.inbox-filters button.active{background:#754331;color:#fff}.conversation-list{display:grid;align-content:start;overflow:auto}.conversation-item{display:flex;width:100%;gap:11px;padding:14px 15px;border:0;border-top:1px solid #f2e9e4;background:transparent;text-align:left;cursor:pointer}.conversation-item:hover{background:#fff8f4}.conversation-item.selected{background:#faeee7;box-shadow:inset 3px 0 #a65738}.avatar{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:13px;background:#efded5;color:#7b4835;font-size:.68rem;font-weight:900}.conversation-copy{display:grid;min-width:0;flex:1;gap:4px}.name-line{display:flex;justify-content:space-between;gap:8px}.name-line strong{overflow:hidden;color:#33251f;font-size:.76rem;text-overflow:ellipsis;white-space:nowrap}.name-line small{color:#9b887e;font-size:.6rem}.preview{overflow:hidden;color:#7d6c63;font-size:.68rem;text-overflow:ellipsis;white-space:nowrap}.conversation-status{justify-self:start;padding:4px 7px;border-radius:999px;background:#f0e9e5;color:#785e52;font-size:.56rem;font-weight:850}.conversation-status.aguardando_equipe{background:#fff0d9;color:#996211}.conversation-status.aguardando_cliente{background:#e9f0fb;color:#3c6596}.conversation-status.resolvida{background:#e3f3e8;color:#2b7b4a}.empty-state{display:grid;gap:5px;margin:16px;padding:24px;border:1px dashed #dccdc5;border-radius:15px;color:#8d7b72;text-align:center;font-size:.75rem}.thread-panel{display:flex;min-width:0;flex-direction:column;background:linear-gradient(180deg,#fffaf7 0%,#fbf5f1 100%)}.thread-header{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid #eadfd9;background:rgba(255,255,255,.9)}.thread-person{display:grid;min-width:0;flex:1}.thread-person strong{overflow:hidden;font-size:.82rem;text-overflow:ellipsis;white-space:nowrap}.thread-person small{margin-top:3px;color:#8e7c72;font-size:.64rem}.thread-actions button,.back-button{min-height:35px;padding:0 12px;border:1px solid #d9c8be;border-radius:10px;background:#fff;color:#704738;font-weight:800;font-size:.68rem}.back-button{display:none;padding:0;width:36px}.messages{display:flex;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:22px}.bubble-row{display:flex}.bubble-row.outgoing{justify-content:flex-end}.bubble{max-width:min(76%,620px);padding:10px 12px;border:1px solid #e6d8d0;border-radius:15px 15px 15px 4px;background:#fff;box-shadow:0 5px 16px rgba(60,40,30,.035)}.outgoing .bubble{border-color:#cde3d6;border-radius:15px 15px 4px 15px;background:#eaf6ef}.bubble p{margin:0;color:#3b2d27;font-size:.77rem;line-height:1.5;white-space:pre-wrap}.bubble small{display:block;margin-top:5px;color:#8c7c73;font-size:.58rem;text-align:right}.composer{display:grid;gap:9px;padding:14px 16px;border-top:1px solid #e7dbd4;background:#fff}.composer textarea{width:100%;min-height:70px;resize:none;border:1px solid #dccdc4;border-radius:14px;padding:11px 12px;outline:0;font:inherit;font-size:.78rem}.composer textarea:focus{border-color:#a66045;box-shadow:0 0 0 3px rgba(166,96,69,.1)}.composer>div{display:flex;align-items:center;justify-content:space-between;gap:10px}.composer small{color:#9a887e;font-size:.6rem}.composer button{min-height:38px;padding:0 16px;border:0;border-radius:11px;background:#754331;color:#fff;font-size:.72rem;font-weight:850}.composer button:disabled{opacity:.5}.thread-empty{display:grid;place-items:center;align-content:center;flex:1;gap:8px;min-height:280px;color:#8c796e;text-align:center}.thread-empty>span{font-size:2rem}.thread-empty strong{color:#49352d}.thread-empty p{margin:0;font-size:.75rem}.thread-empty.compact{min-height:120px}.contact-panel{padding:22px;border-left:1px solid #eee2dc;text-align:center}.contact-avatar{display:grid;place-items:center;width:58px;height:58px;margin:4px auto 12px;border-radius:19px;background:#efdcd1;color:#78442f;font-weight:900}.contact-panel h3{margin:0;color:#33241f;font-size:1rem}.contact-panel>p{margin:5px 0 18px;color:#8d7b72;font-size:.72rem}.contact-facts{display:grid;gap:8px;margin-bottom:16px;text-align:left}.contact-facts div{display:flex;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:12px;background:#f8f2ee}.contact-facts span{color:#8b7970;font-size:.64rem}.contact-facts strong{font-size:.68rem}.primary-link,.secondary-link{display:grid;place-items:center;min-height:40px;margin-top:8px;border-radius:12px;text-decoration:none;font-size:.7rem;font-weight:850}.primary-link{background:#754331;color:#fff}.secondary-link{border:1px solid #d9c8be;color:#704738}.helper{display:block;margin-top:16px;color:#98867c;font-size:.62rem;line-height:1.5}.contact-empty{display:grid;min-height:220px;place-items:center;color:#96847a;font-size:.74rem}.back-button{flex:0 0 36px}
        @media(max-width:1180px){.inbox-shell{grid-template-columns:minmax(260px,.78fr) minmax(420px,1.4fr)}.contact-panel{display:none}}
        @media(max-width:820px){.summary-bar{align-items:flex-start;flex-direction:column}.summary-metrics{width:100%}.summary-metrics article{min-width:0;flex:1}.inbox-shell{display:block;min-height:calc(100dvh - 250px)}.conversation-panel{min-height:540px;border-right:0}.conversation-panel.has-selection{display:none}.thread-panel{display:none;min-height:540px}.thread-panel.open{display:flex}.back-button{display:inline-grid;place-items:center}.messages{min-height:330px;padding:16px}.bubble{max-width:88%}}
        @media(max-width:560px){.summary-bar{padding:17px}.summary-bar h2{font-size:1.25rem}.summary-bar p{font-size:.76rem}.summary-metrics article{padding:11px}.inbox-shell{border-radius:18px}.thread-header{padding:11px}.composer>div{align-items:stretch;flex-direction:column}.composer button{width:100%}}
      `}</style>
    </div>
  );
}
