'use client';

import Link from 'next/link';
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ConversaWhatsapp, Empresa, MensagemWhatsapp } from '@/lib/types';

type InboxFilter = 'aguardando' | 'cliente' | 'todas' | 'resolvidas';
type ConversationWithPreview = ConversaWhatsapp & { ultima_mensagem?: MensagemWhatsapp | null };
type MediaKind = 'imagem' | 'audio' | 'video' | 'documento';
type CustomerSummary = {
  salesCount: number;
  latestSale: {
    id: string;
    produto_nome: string;
    valor_total: number;
    data_venda: string;
    status: string;
  } | null;
  pendingCount: number;
  pendingTotal: number;
  nextDueDate: string | null;
};

const emptyCustomerSummary: CustomerSummary = {
  salesCount: 0,
  latestSale: null,
  pendingCount: 0,
  pendingTotal: 0,
  nextDueDate: null
};

const statusLabel: Record<ConversaWhatsapp['status'], string> = {
  aberta: 'Aberta',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_equipe: 'Para responder',
  resolvida: 'Resolvida',
  arquivada: 'Arquivada'
};

function formatListTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMessageTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function messageDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function messagePreview(message?: MensagemWhatsapp | null) {
  if (!message) return 'Sem mensagens registradas';
  const prefix = message.direcao === 'saida' ? 'Você: ' : '';
  if (message.tipo !== 'texto') {
    const label = message.tipo === 'imagem'
      ? 'Imagem'
      : message.tipo === 'audio'
        ? 'Áudio'
        : message.tipo === 'video'
          ? 'Vídeo'
          : 'Anexo';
    return `${prefix}${message.conteudo && !message.conteudo.startsWith('[') ? message.conteudo : label}`;
  }
  return `${prefix}${message.conteudo || 'Mensagem sem texto'}`;
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

function Avatar({ name, url, size = 42 }: { name: string; url?: string; size?: number }) {
  return (
    <span
      className="fp-avatar-shell"
      style={{ width: size, height: size, flexBasis: size }}
      aria-hidden="true"
    >
      {url
        ? <img src={url} alt="" referrerPolicy="no-referrer" />
        : <span>{initials(name)}</span>}
      <i />
    </span>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <span className="fp-inline-icon" aria-hidden="true">{children}</span>;
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
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary>(emptyCustomerSummary);
  const [loadingCustomerSummary, setLoadingCustomerSummary] = useState(false);

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
  const resolvedCount = conversations.filter((item) => item.status === 'resolvida').length;

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

  useEffect(() => {
    let cancelled = false;
    if (!empresa || !selected?.cliente_id) {
      setCustomerSummary(emptyCustomerSummary);
      return;
    }

    setLoadingCustomerSummary(true);
    void Promise.all([
      supabase
        .from('vendas')
        .select('id,produto_nome,valor_total,data_venda,status', { count: 'exact' })
        .eq('empresa_id', empresa.id)
        .eq('cliente_id', selected.cliente_id)
        .order('data_venda', { ascending: false })
        .limit(1),
      supabase
        .from('parcelas')
        .select('valor,vencimento,status')
        .eq('empresa_id', empresa.id)
        .eq('cliente_id', selected.cliente_id)
        .eq('status', 'pendente')
        .order('vencimento', { ascending: true })
    ]).then(([salesResult, pendingResult]) => {
      if (cancelled) return;
      const pendingRows = (pendingResult.data || []) as Array<{ valor: number; vencimento: string; status: string }>;
      setCustomerSummary({
        salesCount: salesResult.count || 0,
        latestSale: (salesResult.data?.[0] || null) as CustomerSummary['latestSale'],
        pendingCount: pendingRows.length,
        pendingTotal: pendingRows.reduce((sum, item) => sum + Number(item.valor || 0), 0),
        nextDueDate: pendingRows[0]?.vencimento || null
      });
    }).finally(() => {
      if (!cancelled) setLoadingCustomerSummary(false);
    });

    return () => { cancelled = true; };
  }, [empresa, selected?.cliente_id]);

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
        ? {
            ...item,
            status: 'aguardando_cliente',
            ultima_mensagem_em: sent?.enviada_em || new Date().toISOString(),
            ultima_mensagem: sent || item.ultima_mensagem
          }
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
          <Icon>{item.tipo === 'audio' ? '◉' : item.tipo === 'imagem' ? '▧' : item.tipo === 'video' ? '▶' : '▤'}</Icon>
          <span>{item.tipo === 'audio' ? 'Áudio' : item.tipo === 'imagem' ? 'Imagem' : item.tipo === 'video' ? 'Vídeo' : 'Anexo'}</span>
        </div>
      );
    }

    if (item.tipo === 'imagem') return <img className="fp-media-image" src={url} alt={name} />;
    if (item.tipo === 'audio') return <audio className="fp-media-audio" controls preload="metadata" src={url} />;
    if (item.tipo === 'video') return <video className="fp-media-video" controls preload="metadata" src={url} />;
    return (
      <a className="fp-document-link" href={url} target="_blank" rel="noreferrer">
        <span className="fp-document-icon">PDF</span>
        <span><strong>{name}</strong><small>Abrir documento</small></span>
        <b>↗</b>
      </a>
    );
  }

  const selectedName = selected?.clientes?.nome || selected?.nome_contato || selected?.telefone || '';
  const selectedEmail = selected?.clientes?.email || null;

  return (
    <div className="fp-inbox-page">
      {error && <Notice type="danger">{error}</Notice>}
      {feedback && <Notice type="success">{feedback}</Notice>}

      <section className="fp-inbox-overview" aria-label="Resumo da caixa de entrada">
        <div className="fp-overview-note">
          <span className="fp-live-dot" />
          Atendimento em tempo real
        </div>
        <div className="fp-inbox-metrics">
          <article className={waitingCount ? 'attention' : ''}>
            <span className="fp-metric-icon">▣</span>
            <div><small>Para responder</small><strong>{waitingCount}</strong></div>
          </article>
          <article>
            <span className="fp-metric-icon">◷</span>
            <div><small>Aguardando cliente</small><strong>{waitingCustomerCount}</strong></div>
          </article>
        </div>
      </section>

      <section className="fp-inbox-shell">
        <aside className={`fp-conversation-panel ${selected ? 'has-selection' : ''}`}>
          <div className="fp-list-tools">
            <label className="fp-search">
              <span>⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas" />
            </label>
            <button
              type="button"
              className="fp-filter-button"
              onClick={() => empresa && loadConversations(empresa.id, { preserveSelection: true })}
              aria-label="Atualizar conversas"
              title="Atualizar conversas"
            >
              ↻
            </button>
          </div>

          <div className="fp-inbox-filters">
            <button type="button" className={filter === 'aguardando' ? 'active' : ''} onClick={() => setFilter('aguardando')}>
              <span>Para responder</span><b>{waitingCount}</b>
            </button>
            <button type="button" className={filter === 'cliente' ? 'active' : ''} onClick={() => setFilter('cliente')}>
              <span>Aguardando cliente</span><b>{waitingCustomerCount}</b>
            </button>
            <button type="button" className={filter === 'todas' ? 'active' : ''} onClick={() => setFilter('todas')}>
              <span>Todas</span><b>{conversations.length}</b>
            </button>
            <button type="button" className={filter === 'resolvidas' ? 'active' : ''} onClick={() => setFilter('resolvidas')}>
              <span>Resolvidas</span><b>{resolvedCount}</b>
            </button>
          </div>

          <div className="fp-conversation-list">
            {loading && <div className="fp-empty-state">Carregando conversas...</div>}
            {!loading && filteredConversations.length === 0 && (
              <div className="fp-empty-state"><strong>Nada por aqui</strong><span>Nenhuma conversa neste filtro.</span></div>
            )}
            {filteredConversations.map((conversation) => {
              const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone;
              const requiresAnswer = conversation.status === 'aguardando_equipe';
              const lastReceipt = conversation.ultima_mensagem?.direcao === 'saida'
                ? deliveryStatus(conversation.ultima_mensagem.status)
                : null;

              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`fp-conversation-item ${selectedId === conversation.id ? 'selected' : ''}`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <Avatar name={name} url={profileUrl(conversation)} size={42} />
                  <span className="fp-conversation-copy">
                    <span className="fp-name-line"><strong>{name}</strong><small>{formatListTime(conversation.ultima_mensagem_em)}</small></span>
                    <span className="fp-preview">{messagePreview(conversation.ultima_mensagem)}</span>
                  </span>
                  {requiresAnswer
                    ? <span className="fp-unread-badge" title="Precisa de resposta">1</span>
                    : lastReceipt
                      ? <span className={`fp-list-receipt ${lastReceipt.className}`} title={lastReceipt.label}>{lastReceipt.icon}</span>
                      : <span className={`fp-list-status ${conversation.status}`}>•</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`fp-thread-panel ${selected ? 'open' : ''}`}>
          {!selected && (
            <div className="fp-thread-empty">
              <span>◌</span>
              <strong>Selecione uma conversa</strong>
              <p>O histórico e a caixa de resposta aparecerão aqui.</p>
            </div>
          )}

          {selected && <>
            <header className="fp-thread-header">
              <button type="button" className="fp-back-button" onClick={() => setSelectedId(null)} aria-label="Voltar">←</button>
              <Avatar name={selectedName} url={profileUrl(selected)} size={44} />
              <div className="fp-thread-person">
                <div className="fp-thread-name-line">
                  <strong>{selectedName}</strong>
                  <span className={`fp-status-pill ${selected.status}`}>{statusLabel[selected.status]}</span>
                </div>
                <small>{selected.telefone}</small>
              </div>
              <div className="fp-thread-quick-actions">
                <button type="button" title="Buscar nesta conversa" aria-label="Buscar nesta conversa">⌕</button>
                <a href={`https://wa.me/${selected.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="Abrir no WhatsApp" aria-label="Abrir no WhatsApp">◒</a>
                <button type="button" title="Mais opções" aria-label="Mais opções">⋮</button>
              </div>
            </header>

            <div className="fp-mobile-contact-actions">
              {selected.cliente_id
                ? <Link href={`/clientes/${selected.cliente_id}`}>Abrir ficha</Link>
                : <Link href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>Cadastrar cliente</Link>}
              <Link href={`/operacao?cliente=${selected.cliente_id || ''}`}>Criar ação</Link>
              <button type="button" onClick={() => updateConversationStatus(selected.status === 'resolvida' ? 'aguardando_equipe' : 'resolvida')}>
                {selected.status === 'resolvida' ? 'Reabrir' : 'Resolver'}
              </button>
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
              {messages.map((item, index) => {
                const receipt = deliveryStatus(item.status);
                const previous = messages[index - 1];
                const showDay = !previous || messageDayKey(previous.enviada_em) !== messageDayKey(item.enviada_em);
                return (
                  <div key={item.id} className="fp-message-block">
                    {showDay && <div className="fp-day-separator"><span>{formatDayLabel(item.enviada_em)}</span></div>}
                    <article className={`fp-bubble-row ${item.direcao === 'saida' ? 'outgoing' : 'incoming'}`}>
                      <div className="fp-bubble">
                        {renderMedia(item)}
                        {item.conteudo && !item.conteudo.startsWith('[') && <p>{item.conteudo}</p>}
                        <small>
                          {formatMessageTime(item.enviada_em)}
                          {item.direcao === 'saida' && (
                            <span className={`fp-receipt ${receipt.className}`} title={receipt.label}>
                              {receipt.icon}<em>{receipt.label}</em>
                            </span>
                          )}
                        </small>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>

            <form className="fp-composer" onSubmit={sendMessage}>
              {selectedFile && (
                <div className="fp-file-preview">
                  <span>{mediaKind(selectedFile) === 'audio' ? '◉' : '▤'} {selectedFile.name}</span>
                  <button type="button" onClick={() => setSelectedFile(null)}>Remover</button>
                </div>
              )}
              <div className="fp-composer-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                />
                <button type="button" className="fp-composer-icon" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo" aria-label="Anexar arquivo">⌕</button>
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit();
                  }}
                  placeholder={selectedFile ? 'Adicione uma legenda (opcional)' : 'Digite uma mensagem...'}
                  disabled={sending}
                />
                <button
                  type="button"
                  className={`fp-composer-icon ${recording ? 'recording' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  title={recording ? 'Parar gravação' : 'Gravar áudio'}
                  aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
                >
                  {recording ? '■' : '◉'}
                </button>
                <button className="fp-send-button" type="submit" disabled={sending || (!draft.trim() && !selectedFile)} aria-label="Enviar mensagem">
                  {sending ? '…' : '➤'}
                </button>
              </div>
              <small className="fp-composer-hint">{recording ? 'Gravando áudio...' : 'Ctrl + Enter para enviar'}</small>
            </form>
          </>}
        </main>

        <aside className={`fp-customer-panel ${selected ? 'open' : ''}`}>
          {!selected && (
            <div className="fp-customer-empty">
              <span>◎</span>
              <strong>Dados do cliente</strong>
              <p>Selecione uma conversa para visualizar o relacionamento.</p>
            </div>
          )}

          {selected && <>
            <div className="fp-customer-title">Dados do cliente</div>
            <section className="fp-customer-card fp-customer-profile">
              <Avatar name={selectedName} url={profileUrl(selected)} size={48} />
              <div>
                <strong>{selectedName}</strong>
                <span>{selected.telefone}</span>
                {selectedEmail && <small>{selectedEmail}</small>}
              </div>
            </section>

            <div className="fp-customer-actions">
              {selected.cliente_id
                ? <Link className="primary" href={`/clientes/${selected.cliente_id}`}>Abrir ficha <span>↗</span></Link>
                : <Link className="primary" href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>Cadastrar cliente <span>+</span></Link>}
              <Link href={`/operacao?cliente=${selected.cliente_id || ''}`}>Criar ação <span>+</span></Link>
              <button type="button" onClick={() => updateConversationStatus(selected.status === 'resolvida' ? 'aguardando_equipe' : 'resolvida')}>
                {selected.status === 'resolvida' ? 'Reabrir conversa' : 'Resolver conversa'} <span>✓</span>
              </button>
            </div>

            <section className="fp-customer-card fp-detail-card">
              <div className="fp-detail-heading"><span>Status da conversa</span><b className={selected.status}>{statusLabel[selected.status]}</b></div>
              <small>Atualizado {formatListTime(selected.ultima_mensagem_em)}</small>
            </section>

            <section className="fp-customer-card fp-detail-card">
              <div className="fp-detail-heading"><span>Cadastro</span></div>
              {selected.cliente_id ? <>
                <strong>{selected.clientes?.categoria || 'Cliente cadastrado'}</strong>
                <small>{loadingCustomerSummary ? 'Carregando histórico...' : `${customerSummary.salesCount} compra${customerSummary.salesCount === 1 ? '' : 's'} registrada${customerSummary.salesCount === 1 ? '' : 's'}`}</small>
              </> : <>
                <strong>Novo contato</strong>
                <small>Cadastre para vincular vendas, cobranças e histórico.</small>
              </>}
            </section>

            {selected.cliente_id && customerSummary.latestSale && (
              <section className="fp-customer-card fp-detail-card">
                <div className="fp-detail-heading"><span>Última compra</span><b className="paid">{customerSummary.latestSale.status}</b></div>
                <strong>{customerSummary.latestSale.produto_nome}</strong>
                <small>{new Date(customerSummary.latestSale.data_venda).toLocaleDateString('pt-BR')} · {formatCurrency(Number(customerSummary.latestSale.valor_total || 0))}</small>
              </section>
            )}

            {selected.cliente_id && (
              <section className="fp-customer-card fp-detail-card pending">
                <div className="fp-detail-heading"><span>Pagamentos pendentes</span><b>{customerSummary.pendingCount}</b></div>
                {customerSummary.pendingCount ? <>
                  <strong>{formatCurrency(customerSummary.pendingTotal)} em aberto</strong>
                  <small>{customerSummary.nextDueDate ? `Próximo vencimento: ${new Date(`${customerSummary.nextDueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem vencimento definido'}</small>
                </> : <>
                  <strong>Nenhuma cobrança em aberto</strong>
                  <small>Relacionamento financeiro em dia.</small>
                </>}
              </section>
            )}

            {selected.cliente_id && (
              <Link className="fp-history-link" href={`/clientes/${selected.cliente_id}`}>↻ Ver histórico do cliente</Link>
            )}
          </>}
        </aside>
      </section>

      <style jsx global>{`
        .fp-avatar-shell{position:relative;display:grid;place-items:center;min-width:0;overflow:visible;border-radius:50%;background:#efded5;color:#7b4835;font-size:.68rem;font-weight:900;line-height:1}
        .fp-avatar-shell>img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;border-radius:50%!important;object-fit:cover!important}
        .fp-avatar-shell>span{display:grid;width:100%;height:100%;place-items:center;border-radius:50%;overflow:hidden}
        .fp-avatar-shell>i{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#28b55c;box-shadow:0 1px 3px rgba(0,0,0,.12)}
      `}</style>

      <style jsx>{`
        .fp-inbox-page{display:grid;gap:12px;min-width:0}
        .fp-inbox-overview{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:16px;padding:8px 2px}
        .fp-overview-note{display:flex;align-items:center;gap:8px;color:#806d64;font-size:.72rem;font-weight:750}
        .fp-live-dot{width:8px;height:8px;border-radius:50%;background:#31b76a;box-shadow:0 0 0 5px rgba(49,183,106,.12)}
        .fp-inbox-metrics{display:flex;gap:10px}
        .fp-inbox-metrics article{display:flex;min-width:168px;align-items:center;gap:11px;padding:10px 13px;border:1px solid rgba(112,80,62,.11);border-radius:15px;background:rgba(255,255,255,.88);box-shadow:0 8px 24px rgba(67,46,32,.035)}
        .fp-inbox-metrics article.attention{background:#fff6ef}
        .fp-metric-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:10px;background:#fff1e8;color:#ba5d36;font-size:.83rem}
        .fp-inbox-metrics div{display:grid;grid-template-columns:auto auto;align-items:end;column-gap:10px}
        .fp-inbox-metrics small{grid-column:1/-1;color:#7f7068;font-size:.62rem}
        .fp-inbox-metrics strong{font-size:1.05rem;line-height:1}
        .fp-inbox-shell{display:grid;grid-template-columns:minmax(275px,320px) minmax(410px,1fr) minmax(235px,285px);height:min(735px,calc(100dvh - 175px));min-height:590px;border:1px solid rgba(112,80,62,.11);border-radius:22px;background:#fff;box-shadow:0 18px 48px rgba(67,46,32,.055);overflow:hidden}
        .fp-conversation-panel{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid #eee4de;background:#fff}
        .fp-list-tools{display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:8px;padding:13px 12px 9px}
        .fp-search{display:flex;height:42px;align-items:center;gap:8px;padding:0 11px;border:1px solid #e0d4cd;border-radius:12px;background:#fff}
        .fp-search span{color:#9a8377;font-size:.9rem}
        .fp-search input{width:100%;height:38px;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;outline:0!important;font-size:.72rem;box-shadow:none!important}
        .fp-filter-button{display:grid;width:42px;height:42px;place-items:center;border:1px solid #e0d4cd;border-radius:12px;background:#fff;color:#8b553f;font-size:.88rem;cursor:pointer}
        .fp-inbox-filters{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 12px 12px}
        .fp-inbox-filters button{display:flex;min-width:0;min-height:36px;align-items:center;justify-content:center;gap:7px;padding:0 8px;border:0;border-radius:10px;background:#f6f1ed;color:#796a62;font-size:.6rem;font-weight:850;cursor:pointer}
        .fp-inbox-filters button b{display:grid;min-width:20px;height:20px;place-items:center;border-radius:999px;background:rgba(255,255,255,.85);font-size:.56rem}
        .fp-inbox-filters button.active{background:#81462f;color:#fff;box-shadow:0 6px 15px rgba(129,70,47,.16)}
        .fp-inbox-filters button.active b{color:#81462f}
        .fp-conversation-list{min-height:0;flex:1;overflow:auto;border-top:1px solid #f1e9e5}
        .fp-conversation-item{position:relative;display:grid;width:100%;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;border:0;border-bottom:1px solid #f2ebe7;background:transparent;text-align:left;cursor:pointer;transition:.16s ease}
        .fp-conversation-item:hover{background:#fff9f5}
        .fp-conversation-item.selected{background:linear-gradient(90deg,#fff4ec,#fffaf7);box-shadow:inset 3px 0 #d16f42}
        .fp-conversation-copy{display:grid;min-width:0;gap:4px}
        .fp-name-line{display:flex;min-width:0;justify-content:space-between;gap:8px}
        .fp-name-line strong{overflow:hidden;color:#30251f;font-size:.72rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-name-line small{flex:0 0 auto;color:#9a877d;font-size:.57rem}
        .fp-preview{overflow:hidden;color:#7c6d66;font-size:.63rem;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
        .fp-unread-badge{display:grid;width:22px;height:22px;place-items:center;border-radius:50%;background:#cb6539;color:#fff;font-size:.57rem;font-weight:900}
        .fp-list-receipt{align-self:end;color:#93999a;font-size:.68rem;font-weight:900}
        .fp-list-receipt.read{color:#1687d6}
        .fp-list-status{align-self:end;font-size:1.15rem}
        .fp-list-status.aguardando_cliente{color:#e4a333}
        .fp-list-status.resolvida{color:#48a66d}
        .fp-empty-state{display:grid;gap:5px;margin:16px;padding:24px;border:1px dashed #dccfc8;border-radius:15px;color:#8d7b72;text-align:center;font-size:.72rem}
        .fp-thread-panel{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid #eee4de;background:#fbf7f4}
        .fp-thread-header{display:flex;min-height:70px;align-items:center;gap:11px;padding:10px 15px;border-bottom:1px solid #eee3dd;background:#fff}
        .fp-back-button{display:none;width:34px;height:34px;border:1px solid #ded0c8;border-radius:10px;background:#fff;color:#754331;cursor:pointer}
        .fp-thread-person{display:grid;min-width:0;flex:1;gap:3px}
        .fp-thread-name-line{display:flex;min-width:0;align-items:center;gap:8px}
        .fp-thread-name-line strong{overflow:hidden;font-size:.79rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-thread-person>small{color:#8e7b72;font-size:.61rem}
        .fp-status-pill{flex:0 0 auto;padding:4px 8px;border-radius:999px;background:#eef1f2;color:#6b7478;font-size:.52rem;font-weight:850}
        .fp-status-pill.aguardando_cliente{background:#e6f4e7;color:#498657}
        .fp-status-pill.aguardando_equipe{background:#fff0dc;color:#a66b16}
        .fp-status-pill.resolvida{background:#e3f3e8;color:#2b7b4a}
        .fp-thread-quick-actions{display:flex;align-items:center;gap:5px}
        .fp-thread-quick-actions button,.fp-thread-quick-actions a{display:grid;width:34px;height:34px;place-items:center;border:0;border-radius:10px;background:transparent;color:#785746;text-decoration:none;font-size:.9rem;cursor:pointer}
        .fp-thread-quick-actions button:hover,.fp-thread-quick-actions a:hover{background:#f7eeea}
        .fp-mobile-contact-actions{display:none}
        .fp-messages{position:relative;display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:18px 20px;background-color:#fbf6f2;background-image:radial-gradient(circle at 20px 20px,rgba(145,105,84,.045) 1.2px,transparent 1.2px),radial-gradient(circle at 4px 4px,rgba(145,105,84,.025) 1px,transparent 1px);background-size:38px 38px,24px 24px;scroll-behavior:smooth}
        .fp-message-block{display:grid;gap:8px}
        .fp-day-separator{display:flex;justify-content:center;padding:4px 0}
        .fp-day-separator span{padding:4px 10px;border:1px solid #eadfd9;border-radius:999px;background:rgba(255,255,255,.9);color:#8b766b;font-size:.56rem;font-weight:800;box-shadow:0 3px 9px rgba(65,43,32,.03)}
        .fp-bubble-row{display:flex}
        .fp-bubble-row.outgoing{justify-content:flex-end}
        .fp-bubble{max-width:min(76%,590px);padding:9px 11px;border:1px solid #e7ddd7;border-radius:14px 14px 14px 4px;background:#fff;box-shadow:0 4px 12px rgba(60,40,30,.035)}
        .outgoing .fp-bubble{border-color:#cee5d7;border-radius:14px 14px 4px 14px;background:#eaf7ee}
        .fp-bubble p{margin:0;color:#342a25;font-size:.72rem;line-height:1.48;white-space:pre-wrap}
        .fp-bubble small{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:5px;color:#8c7c73;font-size:.55rem;font-style:normal}
        .fp-receipt{display:inline-flex;align-items:center;gap:4px;font-weight:900}
        .fp-receipt em{font-size:.52rem;font-style:normal;font-weight:700}
        .fp-receipt.read{color:#1687d6}
        .fp-receipt.delivered{color:#6d7f83}
        .fp-receipt.failed{color:#c74f4f}
        .fp-media-image,.fp-media-video{display:block;width:min(360px,100%);max-height:330px;margin-bottom:7px;border-radius:10px;object-fit:cover}
        .fp-media-audio{display:block;width:min(340px,100%);height:38px;margin-bottom:5px}
        .fp-media-placeholder{display:flex;min-width:190px;align-items:center;gap:9px;margin-bottom:5px;padding:10px;border-radius:10px;background:rgba(255,255,255,.58);color:#6e4b3c;font-size:.69rem}
        .fp-inline-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:8px;background:#fff;color:#a05639;font-size:.68rem}
        .fp-document-link{display:grid;min-width:250px;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:9px;margin-bottom:6px;padding:10px;border-radius:11px;background:rgba(255,255,255,.72);color:#5d463b;text-decoration:none}
        .fp-document-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:9px;background:#e94f4f;color:#fff;font-size:.55rem;font-weight:900}
        .fp-document-link>span:nth-child(2){display:grid;gap:2px;min-width:0}
        .fp-document-link strong{overflow:hidden;font-size:.65rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-document-link small{margin:0;justify-content:flex-start;color:#927e73;font-size:.52rem}
        .fp-document-link b{font-size:.72rem}
        .fp-composer{display:grid;gap:5px;padding:10px 12px;border-top:1px solid #e7dbd4;background:#fff}
        .fp-file-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:10px;background:#f8f0ec;font-size:.64rem}
        .fp-file-preview button{border:0;background:transparent;color:#9a4d38;font-size:.59rem;font-weight:800;cursor:pointer}
        .fp-composer-row{display:grid;grid-template-columns:38px minmax(0,1fr) 38px 42px;align-items:end;gap:7px}
        .fp-composer textarea{width:100%;min-height:42px;max-height:105px;resize:none;border:1px solid #dfd2cb;border-radius:13px;padding:11px 12px;outline:0;font:inherit;font-size:.71rem;line-height:1.35}
        .fp-composer textarea:focus{border-color:#a66045;box-shadow:0 0 0 3px rgba(166,96,69,.08)}
        .fp-composer-icon{display:grid;width:38px;height:38px;place-items:center;border:1px solid #dfd2cb;border-radius:11px;background:#fff;color:#81503e;font-size:.78rem;cursor:pointer}
        .fp-composer-icon.recording{border-color:#d95c5c;background:#fff0f0;color:#bd3434}
        .fp-send-button{display:grid;width:42px;height:42px;place-items:center;border:0;border-radius:12px;background:#9a4f32;color:#fff;font-size:.9rem;font-weight:900;box-shadow:0 7px 16px rgba(154,79,50,.2);cursor:pointer}
        .fp-send-button:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}
        .fp-composer-hint{padding-left:46px;color:#a08c81;font-size:.53rem}
        .fp-thread-empty{display:grid;place-items:center;align-content:center;flex:1;gap:8px;min-height:220px;color:#8c796e;text-align:center}
        .fp-thread-empty>span{font-size:1.8rem}
        .fp-thread-empty strong{color:#49352d}
        .fp-thread-empty p{margin:0;font-size:.7rem}
        .fp-thread-empty.compact{min-height:120px}
        .fp-customer-panel{display:flex;min-width:0;min-height:0;flex-direction:column;gap:10px;overflow:auto;padding:15px 13px;background:#fffdfb}
        .fp-customer-title{color:#3a2b24;font-size:.78rem;font-weight:900}
        .fp-customer-card{border:1px solid #eee2dc;border-radius:14px;background:#fff;padding:12px;box-shadow:0 7px 18px rgba(64,43,33,.025)}
        .fp-customer-profile{display:flex;align-items:center;gap:10px}
        .fp-customer-profile>div{display:grid;min-width:0;gap:3px}
        .fp-customer-profile strong{overflow:hidden;font-size:.73rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-customer-profile span{color:#7d6e66;font-size:.61rem}
        .fp-customer-profile small{overflow:hidden;color:#9c877b;font-size:.56rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-customer-actions{display:grid;gap:7px}
        .fp-customer-actions a,.fp-customer-actions button{display:flex;width:100%;min-height:36px;align-items:center;justify-content:space-between;padding:0 11px;border:1px solid #dfb8a8;border-radius:10px;background:#fff;color:#9b5237;text-decoration:none;font-size:.63rem;font-weight:850;cursor:pointer}
        .fp-customer-actions .primary{border-color:#b95d38;background:#b95d38;color:#fff;box-shadow:0 7px 15px rgba(185,93,56,.18)}
        .fp-detail-card{display:grid;gap:5px}
        .fp-detail-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .fp-detail-heading span{color:#67534a;font-size:.6rem;font-weight:850}
        .fp-detail-heading b{padding:3px 7px;border-radius:999px;background:#f0eae6;color:#79665c;font-size:.5rem;text-transform:capitalize}
        .fp-detail-heading b.aguardando_cliente,.fp-detail-heading b.paid{background:#e5f4e7;color:#4b8959}
        .fp-detail-heading b.aguardando_equipe{background:#fff0dc;color:#a66b16}
        .fp-detail-heading b.resolvida{background:#e3f3e8;color:#2b7b4a}
        .fp-detail-card>strong{color:#46352d;font-size:.66rem;line-height:1.4}
        .fp-detail-card>small{color:#8d796e;font-size:.56rem;line-height:1.45}
        .fp-detail-card.pending{border-color:#ecd6ca}
        .fp-history-link{display:flex;min-height:38px;align-items:center;justify-content:center;gap:8px;margin-top:auto;border:1px solid #dfb8a8;border-radius:10px;color:#9b5237;text-decoration:none;font-size:.62rem;font-weight:850}
        .fp-customer-empty{display:grid;place-items:center;align-content:center;flex:1;gap:7px;color:#927e73;text-align:center}
        .fp-customer-empty span{font-size:1.5rem}
        .fp-customer-empty strong{color:#513b31;font-size:.74rem}
        .fp-customer-empty p{margin:0;font-size:.61rem;line-height:1.5}
        @media(max-width:1280px){
          .fp-inbox-shell{grid-template-columns:minmax(270px,300px) minmax(400px,1fr) 240px}
          .fp-inbox-metrics article{min-width:150px}
        }
        @media(max-width:1100px){
          .fp-inbox-shell{grid-template-columns:285px minmax(0,1fr)}
          .fp-customer-panel{display:none}
          .fp-thread-panel{border-right:0}
          .fp-mobile-contact-actions{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid #eee3dd;background:#fff}
          .fp-mobile-contact-actions a,.fp-mobile-contact-actions button{display:inline-flex;min-height:32px;align-items:center;justify-content:center;padding:0 10px;border:1px solid #ddc8bd;border-radius:9px;background:#fff;color:#824b36;text-decoration:none;font-size:.58rem;font-weight:800;cursor:pointer}
        }
        @media(max-width:820px){
          .fp-inbox-overview{align-items:stretch;flex-direction:column}
          .fp-overview-note{display:none}
          .fp-inbox-metrics{width:100%}
          .fp-inbox-metrics article{min-width:0;flex:1}
          .fp-inbox-shell{display:block;height:calc(100dvh - 210px);min-height:530px}
          .fp-conversation-panel{min-height:100%;border-right:0}
          .fp-conversation-panel.has-selection{display:none}
          .fp-thread-panel{display:none;height:100%}
          .fp-thread-panel.open{display:flex}
          .fp-back-button{display:grid;place-items:center}
          .fp-messages{padding:14px}
          .fp-bubble{max-width:88%}
        }
        @media(max-width:560px){
          .fp-inbox-metrics article{padding:9px 10px}
          .fp-inbox-metrics small{font-size:.56rem}
          .fp-inbox-shell{border-radius:17px}
          .fp-list-tools{grid-template-columns:minmax(0,1fr) 40px}
          .fp-thread-name-line{align-items:flex-start;flex-direction:column;gap:3px}
          .fp-thread-quick-actions button:first-child{display:none}
          .fp-mobile-contact-actions{overflow:auto}
          .fp-mobile-contact-actions a,.fp-mobile-contact-actions button{flex:0 0 auto}
          .fp-composer-row{grid-template-columns:36px minmax(0,1fr) 36px 40px}
          .fp-composer-icon{width:36px;height:36px}
          .fp-send-button{width:40px;height:40px}
          .fp-composer-hint{display:none}
          .fp-document-link{min-width:210px}
        }
      `}</style>
    </div>
  );
}
