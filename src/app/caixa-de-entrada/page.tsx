'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ConversaWhatsapp, Empresa, MensagemWhatsapp } from '@/lib/types';

type InboxFilter = 'aguardando' | 'cliente' | 'todas' | 'resolvidas';
type ConversationWithPreview = ConversaWhatsapp & { ultima_mensagem?: MensagemWhatsapp | null };
type MediaKind = 'imagem' | 'audio' | 'video' | 'documento';

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
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function messagePreview(message?: MensagemWhatsapp | null) {
  if (!message) return 'Sem mensagens registradas';
  if (message.tipo !== 'texto') {
    return message.conteudo && !message.conteudo.startsWith('[')
      ? message.conteudo
      : `[${message.tipo}]`;
  }
  return message.conteudo || 'Mensagem sem texto';
}

function metadataString(source: { metadata?: Record<string, unknown> }, key: string) {
  const value = source.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function isGroupConversation(conversation: ConversaWhatsapp) {
  const jid = metadataString(conversation, 'remote_jid').toLowerCase();
  const phone = conversation.telefone.replace(/\D/g, '');
  return jid.endsWith('@g.us') || phone.startsWith('120363');
}

function mediaKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'imagem';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'documento';
}

function deliveryStatus(status: string) {
  const value = status.toLowerCase();
  if (['lida', 'read', 'played'].includes(value)) return { icon: '✓✓', label: 'Lida', className: 'read' };
  if (['entregue', 'delivered', 'delivery_ack'].includes(value)) return { icon: '✓✓', label: 'Entregue', className: 'delivered' };
  if (['falhou', 'failed', 'error'].includes(value)) return { icon: '!', label: 'Falhou', className: 'failed' };
  return { icon: '✓', label: 'Enviada', className: 'sent' };
}

function sameMessages(current: MensagemWhatsapp[], next: MensagemWhatsapp[]) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => {
    const other = next[index];
    return item.id === other.id
      && item.status === other.status
      && item.conteudo === other.conteudo
      && item.enviada_em === other.enviada_em
      && JSON.stringify(item.metadata || {}) === JSON.stringify(other.metadata || {});
  });
}

function conversationFingerprint(items: ConversationWithPreview[]) {
  return items.map((item) => [
    item.id,
    item.status,
    item.nome_contato,
    item.ultima_mensagem_em,
    item.ultima_mensagem?.id,
    item.ultima_mensagem?.status,
    item.ultima_mensagem?.conteudo,
    metadataString(item, 'profile_picture_url')
  ].join(':')).join('|');
}

function Avatar({ name, url, large = false }: { name: string; url?: string; large?: boolean }) {
  return (
    <span className={`fp-avatar ${large ? 'large' : ''}`}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}

export default function CaixaDeEntradaPage() {
  return <AppShell><InboxContent /></AppShell>;
}

function InboxContent() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [conversations, setConversations] = useState<ConversationWithPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MensagemWhatsapp[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [profileUrls, setProfileUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<InboxFilter>('aguardando');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<MensagemWhatsapp[]>([]);
  const profileAttemptsRef = useRef(new Set<string>());
  const refreshTimerRef = useRef<number | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  const loadThread = useCallback(async (
    conversationId: string | null,
    companyId: string,
    options: { silent?: boolean } = {}
  ) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const showLoading = !options.silent && messagesRef.current.length === 0;
    if (showLoading) setLoadingThread(true);

    const { data, error: threadError } = await supabase
      .from('mensagens_whatsapp')
      .select('*')
      .eq('empresa_id', companyId)
      .eq('conversa_id', conversationId)
      .order('enviada_em', { ascending: true });

    if (threadError) {
      if (!options.silent) setError(`Não foi possível carregar a conversa: ${threadError.message}`);
    } else {
      const next = (data || []) as MensagemWhatsapp[];
      setMessages((current) => sameMessages(current, next) ? current : next);
    }

    if (showLoading) setLoadingThread(false);
  }, []);

  const loadConversations = useCallback(async (
    companyId: string,
    options: { preserveSelection?: boolean; silent?: boolean } = {}
  ) => {
    const preserveSelection = options.preserveSelection !== false;

    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversas_whatsapp')
      .select('*,clientes(id,nome,telefone,email,categoria)')
      .eq('empresa_id', companyId)
      .neq('status', 'arquivada')
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false });

    if (conversationError) {
      if (!options.silent) setError(`Não foi possível carregar as conversas: ${conversationError.message}`);
      setLoading(false);
      return;
    }

    const rows = ((conversationRows || []) as ConversationWithPreview[])
      .filter((item) => !isGroupConversation(item));
    const ids = rows.map((item) => item.id);
    const latestByConversation = new Map<string, MensagemWhatsapp>();

    if (ids.length) {
      const { data: messageRows } = await supabase
        .from('mensagens_whatsapp')
        .select('*')
        .eq('empresa_id', companyId)
        .in('conversa_id', ids)
        .order('enviada_em', { ascending: false });

      for (const item of (messageRows || []) as MensagemWhatsapp[]) {
        if (!latestByConversation.has(item.conversa_id)) latestByConversation.set(item.conversa_id, item);
      }
    }

    const withPreview = rows.map((item) => ({
      ...item,
      ultima_mensagem: latestByConversation.get(item.id) || null
    }));

    setConversations((current) => (
      conversationFingerprint(current) === conversationFingerprint(withPreview) ? current : withPreview
    ));

    const requested = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('conversa')
      : null;

    setSelectedId((currentSelected) => {
      const previous = preserveSelection ? currentSelected : null;
      if (requested && withPreview.some((item) => item.id === requested)) return requested;
      if (previous && withPreview.some((item) => item.id === previous)) return previous;
      return withPreview.find((item) => item.status === 'aguardando_equipe')?.id
        || withPreview[0]?.id
        || null;
    });

    setLoading(false);
  }, []);

  const scheduleSilentRefresh = useCallback((companyId: string) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      if (document.hidden) return;
      void loadConversations(companyId, { preserveSelection: true, silent: true });
      void loadThread(selectedIdRef.current, companyId, { silent: true });
    }, 350);
  }, [loadConversations, loadThread]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: companies, error: companyError } = await supabase
        .from('empresas')
        .select('id,nome,plano,status,perfil_negocio,modulos,configuracoes')
        .order('created_at')
        .limit(1);

      if (cancelled) return;
      if (companyError || !companies?.[0]) {
        setError('Empresa não encontrada para este login.');
        setLoading(false);
        return;
      }

      const current = companies[0] as Empresa;
      setEmpresa(current);
      await loadConversations(current.id, { preserveSelection: false });
    })();

    return () => { cancelled = true; };
  }, [loadConversations]);

  useEffect(() => {
    if (!empresa || !selectedId) return;
    stickToBottomRef.current = true;
    setMessages([]);
    void loadThread(selectedId, empresa.id);
  }, [empresa, selectedId, loadThread]);

  useEffect(() => {
    if (!empresa) return;

    const channel = supabase
      .channel(`fp-inbox-${empresa.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'mensagens_whatsapp',
        filter: `empresa_id=eq.${empresa.id}`
      }, () => scheduleSilentRefresh(empresa.id))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversas_whatsapp',
        filter: `empresa_id=eq.${empresa.id}`
      }, () => scheduleSilentRefresh(empresa.id))
      .subscribe();

    const fallback = window.setInterval(() => {
      if (!document.hidden) scheduleSilentRefresh(empresa.id);
    }, 30000);

    return () => {
      window.clearInterval(fallback);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [empresa, scheduleSilentRefresh]);

  useEffect(() => {
    const paths = [...new Set(messages.map((item) => metadataString(item, 'arquivo_path')).filter(Boolean))];
    if (!paths.length) return;

    void Promise.all(paths.map(async (path) => {
      if (mediaUrls[path]) return null;
      const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(path, 60 * 60);
      return data?.signedUrl ? [path, data.signedUrl] as const : null;
    })).then((entries) => {
      const valid = entries.filter(Boolean) as Array<readonly [string, string]>;
      if (valid.length) setMediaUrls((current) => ({ ...current, ...Object.fromEntries(valid) }));
    });
  }, [messages, mediaUrls]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages, selectedId]);

  useEffect(() => () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesFilter = filter === 'todas'
        || (filter === 'aguardando' && conversation.status === 'aguardando_equipe')
        || (filter === 'cliente' && conversation.status === 'aguardando_cliente')
        || (filter === 'resolvidas' && conversation.status === 'resolvida');
      const haystack = `${conversation.clientes?.nome || ''} ${conversation.nome_contato || ''} ${conversation.telefone} ${messagePreview(conversation.ultima_mensagem)}`.toLowerCase();
      return matchesFilter && (!term || haystack.includes(term));
    });
  }, [conversations, filter, search]);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const waitingCount = conversations.filter((item) => item.status === 'aguardando_equipe').length;
  const waitingCustomerCount = conversations.filter((item) => item.status === 'aguardando_cliente').length;

  const profileUrl = useCallback((conversation: ConversaWhatsapp) => (
    profileUrls[conversation.id] || metadataString(conversation, 'profile_picture_url')
  ), [profileUrls]);

  useEffect(() => {
    if (!empresa || !selected || profileUrl(selected) || profileAttemptsRef.current.has(selected.id)) return;
    profileAttemptsRef.current.add(selected.id);

    void authFetch(`/api/whatsapp/mensagens?empresa_id=${encodeURIComponent(empresa.id)}&conversa_id=${encodeURIComponent(selected.id)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.profile_picture_url) return;
        const picture = String(payload.profile_picture_url);
        setProfileUrls((current) => ({ ...current, [selected.id]: picture }));
        setConversations((current) => current.map((item) => item.id === selected.id
          ? { ...item, metadata: { ...(item.metadata || {}), profile_picture_url: picture } }
          : item));
      })
      .catch(() => null);
  }, [authFetch, empresa, profileUrl, selected]);

  async function uploadFile(file: File, conversationId: string, companyId: string) {
    if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 20 MB.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${companyId}/${conversationId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('whatsapp-media').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (uploadError) throw new Error(`Não foi possível enviar o arquivo: ${uploadError.message}`);
    return path;
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empresa || !selected || (!draft.trim() && !selectedFile) || sending) return;

    setSending(true);
    setError(null);
    setFeedback(null);

    try {
      let filePayload: Record<string, string> = {};
      if (selectedFile) {
        const path = await uploadFile(selectedFile, selected.id, empresa.id);
        filePayload = {
          arquivo_path: path,
          arquivo_nome: selectedFile.name,
          arquivo_mime: selectedFile.type || 'application/octet-stream',
          arquivo_tipo: mediaKind(selectedFile)
        };
      }

      const response = await authFetch('/api/whatsapp/mensagens', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresa.id,
          conversa_id: selected.id,
          mensagem: draft.trim(),
          ...filePayload
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');

      const sent = payload.message as MensagemWhatsapp | undefined;
      if (sent) {
        setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent]);
      }

      setDraft('');
      setSelectedFile(null);
      setFilter('cliente');
      setFeedback('Mensagem enviada. Esta conversa agora está em “Aguardando cliente”.');
      setConversations((current) => current.map((item) => item.id === selected.id
        ? { ...item, status: 'aguardando_cliente', ultima_mensagem_em: sent?.enviada_em || new Date().toISOString(), ultima_mensagem: sent || item.ultima_mensagem }
        : item));
      stickToBottomRef.current = true;
      scheduleSilentRefresh(empresa.id);
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

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, status } : item));
    setFeedback(status === 'resolvida'
      ? 'Conversa marcada como resolvida.'
      : 'Conversa reaberta para atendimento.');
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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        setSelectedFile(new File([blob], `audio-${Date.now()}.webm`, { type }));
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function renderMedia(item: MensagemWhatsapp) {
    const path = metadataString(item, 'arquivo_path');
    const url = path ? mediaUrls[path] : '';
    const name = metadataString(item, 'arquivo_nome') || 'Arquivo recebido';

    if (!url) {
      if (item.tipo === 'texto') return null;
      return (
        <div className="fp-media-placeholder">
          {item.tipo === 'audio' ? '🎙️ Áudio'
            : item.tipo === 'imagem' ? '🖼️ Imagem'
              : item.tipo === 'video' ? '🎬 Vídeo'
                : '📎 Anexo'}
        </div>
      );
    }

    if (item.tipo === 'imagem') return <img className="fp-media-image" src={url} alt={name} />;
    if (item.tipo === 'audio') return <audio className="fp-media-audio" controls preload="metadata" src={url} />;
    if (item.tipo === 'video') return <video className="fp-media-video" controls preload="metadata" src={url} />;
    return <a className="fp-document-link" href={url} target="_blank" rel="noreferrer">📎 {name}</a>;
  }

  return (
    <div className="fp-inbox-page">
      {error && <Notice type="danger">{error}</Notice>}
      {feedback && <Notice type="success">{feedback}</Notice>}

      <section className="fp-inbox-summary">
        <div>
          <span>Central de atendimento</span>
          <h2>Caixa de entrada</h2>
          <p>Responda clientes, envie arquivos e acompanhe quem ainda precisa de retorno.</p>
        </div>
        <div className="fp-inbox-metrics">
          <article className={waitingCount ? 'attention' : ''}><strong>{waitingCount}</strong><small>para responder</small></article>
          <article><strong>{waitingCustomerCount}</strong><small>aguardando cliente</small></article>
        </div>
      </section>

      <section className="fp-inbox-shell">
        <aside className={`fp-conversation-panel ${selected ? 'has-selection' : ''}`}>
          <div className="fp-panel-top">
            <div><strong>Conversas</strong><small>{waitingCount ? `${waitingCount} aguardando você` : 'Tudo respondido'}</small></div>
            <button type="button" onClick={() => empresa && loadConversations(empresa.id, { preserveSelection: true })} aria-label="Atualizar conversas">↻</button>
          </div>

          <label className="fp-search">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" />
          </label>

          <div className="fp-inbox-filters">
            <button type="button" className={filter === 'aguardando' ? 'active' : ''} onClick={() => setFilter('aguardando')}>Para responder</button>
            <button type="button" className={filter === 'cliente' ? 'active' : ''} onClick={() => setFilter('cliente')}>Aguardando cliente</button>
            <button type="button" className={filter === 'todas' ? 'active' : ''} onClick={() => setFilter('todas')}>Todas</button>
            <button type="button" className={filter === 'resolvidas' ? 'active' : ''} onClick={() => setFilter('resolvidas')}>Resolvidas</button>
          </div>

          <div className="fp-conversation-list">
            {loading && <div className="fp-empty-state">Carregando conversas...</div>}
            {!loading && filteredConversations.length === 0 && (
              <div className="fp-empty-state"><strong>Nada por aqui</strong><span>Nenhuma conversa neste filtro.</span></div>
            )}
            {filteredConversations.map((conversation) => {
              const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone;
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`fp-conversation-item ${selectedId === conversation.id ? 'selected' : ''}`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <Avatar name={name} url={profileUrl(conversation)} />
                  <span className="fp-conversation-copy">
                    <span className="fp-name-line"><strong>{name}</strong><small>{formatTime(conversation.ultima_mensagem_em)}</small></span>
                    <span className="fp-preview">{messagePreview(conversation.ultima_mensagem)}</span>
                    <span className={`fp-conversation-status ${conversation.status}`}>{statusLabel[conversation.status]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`fp-thread-panel ${selected ? 'open' : ''}`}>
          {!selected && (
            <div className="fp-thread-empty">
              <span>💬</span><strong>Selecione uma conversa</strong><p>O histórico e a caixa de resposta aparecerão aqui.</p>
            </div>
          )}

          {selected && <>
            <header className="fp-thread-header">
              <button type="button" className="fp-back-button" onClick={() => setSelectedId(null)} aria-label="Voltar">←</button>
              <Avatar
                large
                name={selected.clientes?.nome || selected.nome_contato || selected.telefone}
                url={profileUrl(selected)}
              />
              <div className="fp-thread-person">
                <strong>{selected.clientes?.nome || selected.nome_contato || selected.telefone}</strong>
                <small>{selected.telefone} · {statusLabel[selected.status]}</small>
              </div>
              <div className="fp-thread-actions">
                {selected.status === 'resolvida'
                  ? <button type="button" onClick={() => updateConversationStatus('aguardando_equipe')}>Reabrir</button>
                  : <button type="button" onClick={() => updateConversationStatus('resolvida')}>Resolver</button>}
              </div>
            </header>

            <div className="fp-contact-strip">
              <div className="fp-contact-context">
                <span>Cadastro</span>
                <strong>{selected.cliente_id ? selected.clientes?.categoria || 'Cliente cadastrado' : 'Contato ainda não cadastrado'}</strong>
              </div>
              <div className="fp-contact-actions">
                {selected.cliente_id
                  ? <Link className="secondary" href={`/clientes/${selected.cliente_id}`}>Abrir ficha</Link>
                  : <Link className="primary" href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>+ Cadastrar cliente</Link>}
                <Link className="secondary" href={`/operacao?cliente=${selected.cliente_id || ''}`}>+ Criar ação</Link>
              </div>
            </div>

            <div
              className="fp-messages"
              ref={messagesViewportRef}
              onScroll={(event) => {
                const element = event.currentTarget;
                stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
              }}
            >
              {loadingThread && messages.length === 0 && <div className="fp-thread-empty compact">Carregando a conversa...</div>}
              {!loadingThread && messages.length === 0 && <div className="fp-thread-empty compact">Nenhuma mensagem registrada.</div>}
              {messages.map((item) => {
                const receipt = deliveryStatus(item.status);
                return (
                  <article key={item.id} className={`fp-bubble-row ${item.direcao === 'saida' ? 'outgoing' : 'incoming'}`}>
                    <div className="fp-bubble">
                      {renderMedia(item)}
                      {item.conteudo && !item.conteudo.startsWith('[') && <p>{item.conteudo}</p>}
                      <small>
                        {formatTime(item.enviada_em)}
                        {item.direcao === 'saida' && (
                          <span className={`fp-receipt ${receipt.className}`} title={receipt.label}>
                            {receipt.icon} {receipt.label}
                          </span>
                        )}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>

            <form className="fp-composer" onSubmit={sendMessage}>
              {selectedFile && (
                <div className="fp-file-preview">
                  <span>{mediaKind(selectedFile) === 'audio' ? '🎙️' : '📎'} {selectedFile.name}</span>
                  <button type="button" onClick={() => setSelectedFile(null)}>Remover</button>
                </div>
              )}
              <textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit();
                }}
                placeholder={selectedFile ? 'Adicione uma legenda (opcional)' : 'Digite uma resposta...'}
                disabled={sending}
              />
              <div className="fp-composer-footer">
                <div className="fp-media-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo">📎</button>
                  <button
                    type="button"
                    className={recording ? 'recording' : ''}
                    onClick={recording ? stopRecording : startRecording}
                    title={recording ? 'Parar gravação' : 'Gravar áudio'}
                  >
                    {recording ? '■' : '🎙️'}
                  </button>
                  <small>{recording ? 'Gravando áudio...' : 'Ctrl + Enter para enviar'}</small>
                </div>
                <button className="fp-send-button" type="submit" disabled={sending || (!draft.trim() && !selectedFile)}>
                  {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </>}
        </main>
      </section>

      <style jsx>{`
        .fp-inbox-page{display:grid;gap:16px;min-width:0}
        .fp-inbox-summary{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 22px;border:1px solid rgba(112,80,62,.1);border-radius:20px;background:rgba(255,255,255,.86);box-shadow:0 16px 38px rgba(67,46,32,.045)}
        .fp-inbox-summary>div>span{display:block;color:#9a5639;font-size:.66rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
        .fp-inbox-summary h2{margin:3px 0 6px;font-size:1.45rem;letter-spacing:-.04em}
        .fp-inbox-summary p{margin:0;color:#7d6d64;font-size:.82rem}
        .fp-inbox-metrics{display:flex;gap:9px}
        .fp-inbox-metrics article{min-width:126px;padding:12px 14px;border-radius:15px;background:#f8f1ed}
        .fp-inbox-metrics article.attention{background:#fff0e5}
        .fp-inbox-metrics strong{display:block;font-size:1.2rem}
        .fp-inbox-metrics small{color:#8a776d;font-size:.66rem}
        .fp-inbox-shell{display:grid;grid-template-columns:310px minmax(0,1fr);height:min(690px,calc(100dvh - 225px));min-height:560px;border:1px solid rgba(112,80,62,.11);border-radius:22px;background:#fff;box-shadow:0 18px 46px rgba(67,46,32,.055);overflow:hidden}
        .fp-conversation-panel{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid #eee2dc;background:#fffdfb}
        .fp-panel-top{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;padding:15px 15px 10px}
        .fp-panel-top strong{display:block;font-size:.92rem}
        .fp-panel-top small{display:block;margin-top:2px;color:#947f74;font-size:.66rem}
        .fp-panel-top button{width:34px;height:34px;border:1px solid #e3d5cd;border-radius:11px;background:#fff;color:#754331;cursor:pointer}
        .fp-search{display:flex;flex:0 0 42px;align-items:center;gap:8px;height:42px;margin:0 13px 9px;padding:0 11px;border:1px solid #e2d5cd;border-radius:12px;background:#fff}
        .fp-search span{color:#a38d82}
        .fp-search input{width:100%;height:38px;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;outline:0;font-size:.74rem;box-shadow:none!important}
        .fp-inbox-filters{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;padding:0 13px 10px}
        .fp-inbox-filters button{min-height:34px;padding:0 6px;border:0;border-radius:9px;background:#f6efeb;color:#806b61;font-size:.61rem;font-weight:800;cursor:pointer}
        .fp-inbox-filters button.active{background:#754331;color:#fff}
        .fp-conversation-list{display:block;min-height:0;flex:1;overflow:auto}
        .fp-conversation-item{display:flex;width:100%;gap:10px;padding:12px 13px;border:0;border-top:1px solid #f2e9e4;background:transparent;text-align:left;cursor:pointer}
        .fp-conversation-item:hover{background:#fff8f4}
        .fp-conversation-item.selected{background:#faeee7;box-shadow:inset 3px 0 #a65738}
        .fp-avatar{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;overflow:hidden;border-radius:50%;background:#efded5;color:#7b4835;font-size:.68rem;font-weight:900}
        .fp-avatar.large{flex-basis:44px;width:44px;height:44px}
        .fp-avatar img{width:100%;height:100%;object-fit:cover}
        .fp-conversation-copy{display:grid;min-width:0;flex:1;gap:3px}
        .fp-name-line{display:flex;justify-content:space-between;gap:8px}
        .fp-name-line strong{overflow:hidden;color:#33251f;font-size:.75rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-name-line small{color:#9b887e;font-size:.58rem}
        .fp-preview{overflow:hidden;color:#7d6c63;font-size:.66rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-conversation-status{justify-self:start;padding:3px 7px;border-radius:999px;background:#f0e9e5;color:#785e52;font-size:.54rem;font-weight:850}
        .fp-conversation-status.aguardando_equipe{background:#fff0d9;color:#996211}
        .fp-conversation-status.aguardando_cliente{background:#e9f0fb;color:#3c6596}
        .fp-conversation-status.resolvida{background:#e3f3e8;color:#2b7b4a}
        .fp-empty-state{display:grid;gap:5px;margin:16px;padding:24px;border:1px dashed #dccdc5;border-radius:15px;color:#8d7b72;text-align:center;font-size:.75rem}
        .fp-thread-panel{display:flex;min-width:0;min-height:0;flex-direction:column;background:linear-gradient(180deg,#fffaf7 0%,#fbf5f1 100%)}
        .fp-thread-header{display:flex;align-items:center;gap:11px;padding:13px 16px;border-bottom:1px solid #eadfd9;background:#fff}
        .fp-thread-person{display:grid;min-width:0;flex:1}
        .fp-thread-person strong{overflow:hidden;font-size:.83rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-thread-person small{margin-top:3px;color:#8e7c72;font-size:.64rem}
        .fp-thread-actions button,.fp-back-button{min-height:36px;padding:0 13px;border:1px solid #d9c8be;border-radius:10px;background:#fff;color:#704738;font-size:.68rem;font-weight:850;cursor:pointer}
        .fp-back-button{display:none;width:36px;padding:0}
        .fp-contact-strip{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid #eadfd9;background:#fffdfb}
        .fp-contact-context{display:grid;gap:2px;min-width:0}
        .fp-contact-context span{color:#9a857a;font-size:.58rem;text-transform:uppercase;letter-spacing:.08em}
        .fp-contact-context strong{overflow:hidden;color:#4d3930;font-size:.7rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-contact-actions{display:flex;align-items:center;gap:8px}
        .fp-contact-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border-radius:10px;text-decoration:none;font-size:.66rem;font-weight:850;white-space:nowrap}
        .fp-contact-actions a.primary{border:1px solid #8c4d36;background:#8c4d36;color:#fff}
        .fp-contact-actions a.secondary{border:1px solid #d8c6bc;background:#fff;color:#704738}
        .fp-messages{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:18px 20px;scroll-behavior:smooth}
        .fp-bubble-row{display:flex}
        .fp-bubble-row.outgoing{justify-content:flex-end}
        .fp-bubble{max-width:min(74%,620px);padding:9px 11px;border:1px solid #e6d8d0;border-radius:14px 14px 14px 4px;background:#fff;box-shadow:0 4px 13px rgba(60,40,30,.03)}
        .outgoing .fp-bubble{border-color:#cde3d6;border-radius:14px 14px 4px 14px;background:#eaf6ef}
        .fp-bubble p{margin:0;color:#3b2d27;font-size:.76rem;line-height:1.48;white-space:pre-wrap}
        .fp-bubble small{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:5px;color:#8c7c73;font-size:.58rem}
        .fp-receipt{font-weight:800}
        .fp-receipt.read{color:#1786d2}
        .fp-receipt.delivered{color:#6d7f83}
        .fp-receipt.failed{color:#c74f4f}
        .fp-media-image,.fp-media-video{display:block;max-width:100%;max-height:330px;margin-bottom:7px;border-radius:10px;object-fit:contain}
        .fp-media-audio{display:block;width:min(330px,100%);margin-bottom:5px}
        .fp-media-placeholder,.fp-document-link{display:block;margin-bottom:5px;padding:9px;border-radius:9px;background:rgba(255,255,255,.58);color:#6e4b3c;text-decoration:none;font-size:.7rem}
        .fp-composer{display:grid;gap:8px;padding:11px 14px;border-top:1px solid #e7dbd4;background:#fff}
        .fp-composer textarea{width:100%;min-height:64px;resize:none;border:1px solid #dccdc4;border-radius:13px;padding:10px 11px;outline:0;font:inherit;font-size:.76rem}
        .fp-composer textarea:focus{border-color:#a66045;box-shadow:0 0 0 3px rgba(166,96,69,.09)}
        .fp-composer-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .fp-media-actions{display:flex;align-items:center;gap:7px}
        .fp-media-actions button{display:grid;place-items:center;width:35px;height:35px;border:1px solid #ddcec5;border-radius:10px;background:#fff;cursor:pointer}
        .fp-media-actions button.recording{border-color:#d95c5c;background:#fff0f0;color:#bd3434}
        .fp-media-actions small{color:#9a887e;font-size:.59rem}
        .fp-send-button{min-height:38px;padding:0 18px;border:0;border-radius:10px;background:#754331;color:#fff;font-size:.7rem;font-weight:850;cursor:pointer}
        .fp-send-button:disabled{opacity:.5;cursor:not-allowed}
        .fp-file-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:#f8f0ec;font-size:.68rem}
        .fp-file-preview button{border:0;background:transparent;color:#9a4d38;font-size:.62rem;font-weight:800;cursor:pointer}
        .fp-thread-empty{display:grid;place-items:center;align-content:center;flex:1;gap:8px;min-height:220px;color:#8c796e;text-align:center}
        .fp-thread-empty>span{font-size:1.8rem}
        .fp-thread-empty strong{color:#49352d}
        .fp-thread-empty p{margin:0;font-size:.74rem}
        .fp-thread-empty.compact{min-height:120px}
        @media(max-width:1050px){.fp-inbox-shell{grid-template-columns:285px minmax(0,1fr)}}
        @media(max-width:820px){
          .fp-inbox-summary{align-items:flex-start;flex-direction:column}
          .fp-inbox-metrics{width:100%}
          .fp-inbox-metrics article{min-width:0;flex:1}
          .fp-inbox-shell{display:block;height:calc(100dvh - 245px);min-height:520px}
          .fp-conversation-panel{min-height:100%;border-right:0}
          .fp-conversation-panel.has-selection{display:none}
          .fp-thread-panel{display:none;height:100%}
          .fp-thread-panel.open{display:flex}
          .fp-back-button{display:grid;place-items:center}
          .fp-messages{padding:15px}
          .fp-bubble{max-width:88%}
        }
        @media(max-width:560px){
          .fp-inbox-summary{padding:15px}
          .fp-inbox-summary h2{font-size:1.22rem}
          .fp-inbox-summary p{font-size:.74rem}
          .fp-inbox-shell{border-radius:17px}
          .fp-contact-strip{align-items:stretch;flex-direction:column;gap:9px}
          .fp-contact-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}
          .fp-contact-actions a{text-align:center}
          .fp-composer-footer{align-items:stretch;flex-direction:column}
          .fp-media-actions{justify-content:space-between}
          .fp-send-button{width:100%}
        }
      `}</style>
    </div>
  );
}
