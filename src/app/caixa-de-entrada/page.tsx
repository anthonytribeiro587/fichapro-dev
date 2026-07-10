'use client';

import Link from 'next/link';
import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Cliente, ConversaWhatsapp, Empresa, MensagemWhatsapp } from '@/lib/types';

type InboxFilter = 'aguardando' | 'cliente' | 'todas' | 'resolvidas';
type ClientLite = Pick<Cliente, 'id' | 'nome' | 'telefone' | 'email' | 'categoria'>;
type ConversationWithPreview = ConversaWhatsapp & {
  ultima_mensagem?: MensagemWhatsapp | null;
  clientes?: ClientLite;
};
type MediaKind = 'imagem' | 'audio' | 'video' | 'documento';
type IconName =
  | 'search'
  | 'refresh'
  | 'paperclip'
  | 'mic'
  | 'send'
  | 'external'
  | 'plus'
  | 'check'
  | 'message'
  | 'clock'
  | 'user'
  | 'close'
  | 'up'
  | 'down';

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

function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };

  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.7-3.7" /></>,
    refresh: <><path d="M20 6v5h-5" /><path d="M19 11a7 7 0 1 0 1 5" /></>,
    paperclip: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.6-8.6" />,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    external: <><path d="M14 3h7v7M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    up: <path d="m7 14 5-5 5 5" />,
    down: <path d="m7 10 5 5 5-5" />
  };

  return <svg {...common}>{paths[name]}</svg>;
}

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

function phoneKeys(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  const keys = new Set<string>();
  if (!digits) return keys;

  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const candidates = [digits, local, local.slice(-11), local.slice(-10)].filter(Boolean);

  for (const candidate of candidates) {
    keys.add(candidate);
    if (!candidate.startsWith('55') && candidate.length >= 10) keys.add(`55${candidate}`);
  }

  if (local.length === 10) {
    const withNine = `${local.slice(0, 2)}9${local.slice(2)}`;
    keys.add(withNine);
    keys.add(`55${withNine}`);
  }

  if (local.length === 11 && local[2] === '9') {
    const withoutNine = `${local.slice(0, 2)}${local.slice(3)}`;
    keys.add(withoutNine);
    keys.add(`55${withoutNine}`);
  }

  return keys;
}

function samePhone(first?: string | null, second?: string | null) {
  const a = phoneKeys(first);
  const b = phoneKeys(second);
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
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
    item.cliente_id,
    item.clientes?.nome,
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

function highlightText(text: string, query: string) {
  const term = query.trim();
  if (!term) return text;
  const lower = text.toLocaleLowerCase('pt-BR');
  const needle = term.toLocaleLowerCase('pt-BR');
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);

  while (index >= 0) {
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(<mark key={`${index}-${cursor}`}>{text.slice(index, index + term.length)}</mark>);
    cursor = index + term.length;
    index = lower.indexOf(needle, cursor);
  }

  if (!parts.length) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
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
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [activeMatch, setActiveMatch] = useState(-1);

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
  const messageNodeRefs = useRef(new Map<string, HTMLElement>());

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
    const [conversationResult, clientResult] = await Promise.all([
      supabase
        .from('conversas_whatsapp')
        .select('*,clientes(id,nome,telefone,email,categoria)')
        .eq('empresa_id', companyId)
        .neq('status', 'arquivada')
        .order('ultima_mensagem_em', { ascending: false, nullsFirst: false }),
      supabase
        .from('clientes')
        .select('id,nome,telefone,email,categoria')
        .eq('empresa_id', companyId)
        .neq('status', 'inativo')
    ]);

    if (conversationResult.error) {
      if (!options.silent) setError(`Não foi possível carregar as conversas: ${conversationResult.error.message}`);
      setLoading(false);
      return;
    }

    const clients = (clientResult.data || []) as ClientLite[];
    const rows = ((conversationResult.data || []) as ConversationWithPreview[])
      .filter((item) => !isGroupConversation(item));
    const repairs: Array<{ conversationId: string; client: ClientLite }> = [];

    const enrichedRows = rows.map((item) => {
      const joined = Array.isArray(item.clientes) ? item.clientes[0] : item.clientes;
      const linked = joined
        || clients.find((client) => client.id === item.cliente_id)
        || clients.find((client) => samePhone(client.telefone, item.telefone));

      if (linked && (!item.cliente_id || item.cliente_id !== linked.id || item.nome_contato !== linked.nome)) {
        repairs.push({ conversationId: item.id, client: linked });
      }

      return linked
        ? { ...item, cliente_id: linked.id, nome_contato: linked.nome, clientes: linked }
        : item;
    });

    if (repairs.length) {
      void Promise.all(repairs.map(async ({ conversationId, client }) => {
        await Promise.all([
          supabase
            .from('conversas_whatsapp')
            .update({ cliente_id: client.id, nome_contato: client.nome })
            .eq('empresa_id', companyId)
            .eq('id', conversationId),
          supabase
            .from('mensagens_whatsapp')
            .update({ cliente_id: client.id })
            .eq('empresa_id', companyId)
            .eq('conversa_id', conversationId)
            .is('cliente_id', null)
        ]);
      }));
    }

    const ids = enrichedRows.map((item) => item.id);
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

    const withPreview = enrichedRows.map((item) => ({
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

  const syncReceipts = useCallback(async (companyId: string) => {
    try {
      const response = await authFetch(`/api/whatsapp/reconciliar-status?empresa_id=${encodeURIComponent(companyId)}`);
      if (!response.ok) return;
      await loadThread(selectedIdRef.current, companyId, { silent: true });
      await loadConversations(companyId, { preserveSelection: true, silent: true });
    } catch {
      // O webhook continua sendo o fluxo principal; a reconciliação é apenas um reforço.
    }
  }, [authFetch, loadConversations, loadThread]);

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
      void syncReceipts(current.id);
    })();

    return () => { cancelled = true; };
  }, [loadConversations, syncReceipts]);

  useEffect(() => {
    if (!empresa || !selectedId) return;
    stickToBottomRef.current = true;
    setMessages([]);
    setThreadSearch('');
    setThreadSearchOpen(false);
    setActiveMatch(-1);
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
      if (!document.hidden) {
        scheduleSilentRefresh(empresa.id);
        void syncReceipts(empresa.id);
      }
    }, 45000);

    return () => {
      window.clearInterval(fallback);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [empresa, scheduleSilentRefresh, syncReceipts]);

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
    if (!viewport || !stickToBottomRef.current || threadSearchOpen) return;
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages, selectedId, threadSearchOpen]);

  useEffect(() => () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return conversations.filter((conversation) => {
      const matchesFilter = filter === 'todas'
        || (filter === 'aguardando' && conversation.status === 'aguardando_equipe')
        || (filter === 'cliente' && conversation.status === 'aguardando_cliente')
        || (filter === 'resolvidas' && conversation.status === 'resolvida');
      const haystack = `${conversation.clientes?.nome || ''} ${conversation.nome_contato || ''} ${conversation.telefone} ${messagePreview(conversation.ultima_mensagem)}`.toLocaleLowerCase('pt-BR');
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

  const threadMatchIds = useMemo(() => {
    const term = threadSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return [];
    return messages
      .filter((message) => {
        const text = `${message.conteudo || ''} ${metadataString(message, 'arquivo_nome')}`.toLocaleLowerCase('pt-BR');
        return text.includes(term);
      })
      .map((message) => message.id);
  }, [messages, threadSearch]);

  const threadMatchKey = threadMatchIds.join('|');

  useEffect(() => {
    setActiveMatch(threadMatchIds.length ? 0 : -1);
  }, [threadSearch, selectedId, threadMatchKey, threadMatchIds.length]);

  useEffect(() => {
    if (activeMatch < 0 || !threadMatchIds[activeMatch]) return;
    messageNodeRefs.current.get(threadMatchIds[activeMatch])?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }, [activeMatch, threadMatchIds]);

  function moveThreadMatch(direction: number) {
    if (!threadMatchIds.length) return;
    setActiveMatch((current) => {
      const base = current < 0 ? 0 : current;
      return (base + direction + threadMatchIds.length) % threadMatchIds.length;
    });
  }

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
      setFeedback('Mensagem enviada. A conversa está aguardando o cliente.');
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
      window.setTimeout(() => void syncReceipts(empresa.id), 2500);
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
          <AppIcon name={item.tipo === 'audio' ? 'mic' : item.tipo === 'imagem' ? 'message' : item.tipo === 'video' ? 'external' : 'paperclip'} size={17} />
          <span>{item.tipo === 'audio' ? 'Áudio' : item.tipo === 'imagem' ? 'Imagem' : item.tipo === 'video' ? 'Vídeo' : 'Anexo'}</span>
        </div>
      );
    }

    if (item.tipo === 'imagem') return <img className="fp-media-image" src={url} alt={name} />;
    if (item.tipo === 'audio') return <audio className="fp-media-audio" controls preload="metadata" src={url} />;
    if (item.tipo === 'video') return <video className="fp-media-video" controls preload="metadata" src={url} />;
    return (
      <a className="fp-document-link" href={url} target="_blank" rel="noreferrer">
        <span className="fp-document-icon">DOC</span>
        <span><strong>{name}</strong><small>Abrir documento</small></span>
        <AppIcon name="external" size={16} />
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
        <div className="fp-live-note"><span /> Atendimento em tempo real</div>
        <div className="fp-inbox-metrics">
          <article className={waitingCount ? 'attention' : ''}>
            <div className="fp-metric-icon"><AppIcon name="message" size={18} /></div>
            <div><small>Para responder</small><strong>{waitingCount}</strong></div>
          </article>
          <article>
            <div className="fp-metric-icon"><AppIcon name="clock" size={18} /></div>
            <div><small>Aguardando cliente</small><strong>{waitingCustomerCount}</strong></div>
          </article>
        </div>
      </section>

      <section className="fp-inbox-shell">
        <aside className={`fp-conversation-panel ${selected ? 'has-selection' : ''}`}>
          <div className="fp-list-tools">
            <label className="fp-search">
              <AppIcon name="search" size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas" />
            </label>
            <button
              type="button"
              className="fp-square-button"
              onClick={() => empresa && loadConversations(empresa.id, { preserveSelection: true })}
              aria-label="Atualizar conversas"
              title="Atualizar conversas"
            >
              <AppIcon name="refresh" size={17} />
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
                  <Avatar name={name} url={profileUrl(conversation)} size={44} />
                  <span className="fp-conversation-copy">
                    <span className="fp-name-line">
                      <strong>{name}</strong>
                      <small>{formatListTime(conversation.ultima_mensagem_em)}</small>
                    </span>
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
              <AppIcon name="message" size={36} />
              <strong>Selecione uma conversa</strong>
              <p>O histórico e a caixa de resposta aparecerão aqui.</p>
            </div>
          )}

          {selected && <>
            <header className="fp-thread-header">
              <button type="button" className="fp-back-button" onClick={() => setSelectedId(null)} aria-label="Voltar">←</button>
              <Avatar name={selectedName} url={profileUrl(selected)} size={46} />
              <div className="fp-thread-person">
                <div className="fp-thread-name-line">
                  <strong>{selectedName}</strong>
                  <span className={`fp-status-pill ${selected.status}`}>{statusLabel[selected.status]}</span>
                </div>
                <small>{selected.telefone}</small>
              </div>
              <div className="fp-thread-quick-actions">
                <button
                  type="button"
                  className={threadSearchOpen ? 'active' : ''}
                  title="Buscar nesta conversa"
                  aria-label="Buscar nesta conversa"
                  onClick={() => {
                    setThreadSearchOpen((current) => !current);
                    if (threadSearchOpen) setThreadSearch('');
                  }}
                >
                  <AppIcon name="search" size={18} />
                </button>
                <a
                  href={`https://wa.me/${selected.telefone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir no WhatsApp"
                  aria-label="Abrir no WhatsApp"
                >
                  <AppIcon name="external" size={17} />
                </a>
              </div>
            </header>

            {threadSearchOpen && (
              <div className="fp-thread-search">
                <AppIcon name="search" size={16} />
                <input
                  autoFocus
                  value={threadSearch}
                  onChange={(event) => setThreadSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') moveThreadMatch(event.shiftKey ? -1 : 1);
                    if (event.key === 'Escape') {
                      setThreadSearch('');
                      setThreadSearchOpen(false);
                    }
                  }}
                  placeholder="Buscar mensagem, arquivo ou palavra..."
                />
                <span>{threadSearch.trim() ? `${threadMatchIds.length ? activeMatch + 1 : 0}/${threadMatchIds.length}` : ''}</span>
                <button type="button" disabled={!threadMatchIds.length} onClick={() => moveThreadMatch(-1)} aria-label="Resultado anterior"><AppIcon name="up" size={16} /></button>
                <button type="button" disabled={!threadMatchIds.length} onClick={() => moveThreadMatch(1)} aria-label="Próximo resultado"><AppIcon name="down" size={16} /></button>
                <button type="button" onClick={() => { setThreadSearch(''); setThreadSearchOpen(false); }} aria-label="Fechar busca"><AppIcon name="close" size={16} /></button>
              </div>
            )}

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
                const isActiveMatch = activeMatch >= 0 && threadMatchIds[activeMatch] === item.id;

                return (
                  <div
                    key={item.id}
                    className={`fp-message-block ${isActiveMatch ? 'active-search-match' : ''}`}
                    ref={(node) => {
                      if (node) messageNodeRefs.current.set(item.id, node);
                      else messageNodeRefs.current.delete(item.id);
                    }}
                  >
                    {showDay && <div className="fp-day-separator"><span>{formatDayLabel(item.enviada_em)}</span></div>}
                    <article className={`fp-bubble-row ${item.direcao === 'saida' ? 'outgoing' : 'incoming'}`}>
                      <div className="fp-bubble">
                        {renderMedia(item)}
                        {item.conteudo && !item.conteudo.startsWith('[') && (
                          <p>{highlightText(item.conteudo, threadSearch)}</p>
                        )}
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
                  <span><AppIcon name={mediaKind(selectedFile) === 'audio' ? 'mic' : 'paperclip'} size={16} /> {selectedFile.name}</span>
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
                <button type="button" className="fp-composer-icon" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo" aria-label="Anexar arquivo">
                  <AppIcon name="paperclip" size={19} />
                </button>
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
                  {recording ? <span className="fp-stop-recording" /> : <AppIcon name="mic" size={19} />}
                </button>
                <button className="fp-send-button" type="submit" disabled={sending || (!draft.trim() && !selectedFile)} aria-label="Enviar mensagem">
                  {sending ? '…' : <AppIcon name="send" size={19} />}
                </button>
              </div>
              <small className="fp-composer-hint">{recording ? 'Gravando áudio...' : 'Ctrl + Enter para enviar'}</small>
            </form>
          </>}
        </main>

        <aside className={`fp-customer-panel ${selected ? 'open' : ''}`}>
          {!selected && (
            <div className="fp-customer-empty">
              <AppIcon name="user" size={30} />
              <strong>Dados do cliente</strong>
              <p>Selecione uma conversa para visualizar o relacionamento.</p>
            </div>
          )}

          {selected && <>
            <div className="fp-customer-title">Dados do cliente</div>
            <section className="fp-customer-card fp-customer-profile">
              <Avatar name={selectedName} url={profileUrl(selected)} size={50} />
              <div>
                <strong>{selectedName}</strong>
                <span>{selected.telefone}</span>
                {selectedEmail && <small>{selectedEmail}</small>}
              </div>
            </section>

            <div className="fp-customer-actions">
              {selected.cliente_id
                ? <Link className="primary" href={`/clientes/${selected.cliente_id}`}><span>Abrir ficha</span><AppIcon name="external" size={16} /></Link>
                : <Link className="primary" href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}><span>Cadastrar cliente</span><AppIcon name="user" size={16} /></Link>}
              <Link href={`/operacao?cliente=${selected.cliente_id || ''}`}><span>Criar ação</span><AppIcon name="plus" size={16} /></Link>
              <button type="button" onClick={() => updateConversationStatus(selected.status === 'resolvida' ? 'aguardando_equipe' : 'resolvida')}>
                <span>{selected.status === 'resolvida' ? 'Reabrir conversa' : 'Resolver conversa'}</span><AppIcon name="check" size={16} />
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
                  <strong>{formatCurrency(customerSummary.pendingTotal)}</strong>
                  <small>Próximo vencimento {customerSummary.nextDueDate ? new Date(`${customerSummary.nextDueDate}T12:00:00`).toLocaleDateString('pt-BR') : 'não informado'}</small>
                </> : <small>Nenhuma cobrança pendente.</small>}
              </section>
            )}

            {selected.cliente_id && (
              <Link className="fp-history-link" href={`/clientes/${selected.cliente_id}`}>
                <AppIcon name="clock" size={16} /> Ver histórico do cliente
              </Link>
            )}
          </>}
        </aside>
      </section>

      <style jsx>{`
        .fp-inbox-page{display:grid;gap:10px;min-width:0}
        .fp-inbox-overview{display:flex;align-items:center;justify-content:space-between;min-height:58px;padding:0 4px}
        .fp-live-note{display:flex;align-items:center;gap:8px;color:#765f53;font-size:.72rem;font-weight:750}
        .fp-live-note span{width:9px;height:9px;border-radius:50%;background:#2fbc78;box-shadow:0 0 0 6px rgba(47,188,120,.12)}
        .fp-inbox-metrics{display:flex;gap:10px}
        .fp-inbox-metrics article{display:flex;align-items:center;gap:10px;min-width:170px;padding:10px 14px;border:1px solid #eee2db;border-radius:15px;background:rgba(255,255,255,.88);box-shadow:0 10px 28px rgba(77,47,34,.04)}
        .fp-inbox-metrics article.attention{background:#fff7f1}
        .fp-metric-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#fff0e6;color:#b75c36}
        .fp-inbox-metrics small{display:block;color:#8f7a70;font-size:.63rem}
        .fp-inbox-metrics strong{display:block;margin-top:1px;color:#2e211c;font-size:1.05rem}
        .fp-inbox-shell{display:grid;grid-template-columns:330px minmax(520px,1fr) 300px;height:min(735px,calc(100dvh - 156px));min-height:600px;border:1px solid rgba(112,80,62,.11);border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(67,46,32,.06);overflow:hidden}
        .fp-conversation-panel{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid #eee4de;background:#fff}
        .fp-list-tools{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;padding:13px 13px 9px}
        .fp-search{display:flex;align-items:center;gap:9px;height:44px;padding:0 12px;border:1px solid #e2d4cc;border-radius:12px;background:#fff;color:#9a7b6c}
        .fp-search input{width:100%;height:40px;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;outline:0;box-shadow:none!important;font-size:.75rem}
        .fp-square-button{display:grid;place-items:center;width:44px;height:44px;border:1px solid #e2d4cc;border-radius:12px;background:#fff;color:#8c5039;cursor:pointer}
        .fp-square-button:hover{background:#fff7f2}
        .fp-inbox-filters{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 13px 11px}
        .fp-inbox-filters button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 8px;border:0;border-radius:10px;background:#f6f0ec;color:#785f54;font-size:.65rem;font-weight:800;cursor:pointer}
        .fp-inbox-filters button b{display:grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:#fff;color:#8c4d35;font-size:.62rem}
        .fp-inbox-filters button.active{background:#884a33;color:#fff}
        .fp-inbox-filters button.active b{color:#884a33}
        .fp-conversation-list{min-height:0;flex:1;overflow:auto;border-top:1px solid #f0e8e4}
        .fp-conversation-item{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;width:100%;gap:10px;padding:13px;border:0;border-bottom:1px solid #f1e8e3;background:#fff;text-align:left;cursor:pointer}
        .fp-conversation-item:hover{background:#fffaf7}
        .fp-conversation-item.selected{background:#fff3eb;box-shadow:inset 3px 0 #d87443}
        .fp-conversation-copy{display:grid;min-width:0;gap:4px}
        .fp-name-line{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .fp-name-line strong{overflow:hidden;color:#2f211c;font-size:.75rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-name-line small{flex:0 0 auto;color:#a18a7f;font-size:.58rem}
        .fp-preview{overflow:hidden;color:#7d6a61;font-size:.65rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-unread-badge{display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#d96f3c;color:#fff;font-size:.62rem;font-weight:900}
        .fp-list-receipt{font-size:.68rem;font-weight:900}
        .fp-list-receipt.read{color:#1689d1}.fp-list-receipt.delivered{color:#7d9297}.fp-list-receipt.sent{color:#9c8b82}
        .fp-list-status{font-size:1.2rem}.fp-list-status.resolvida{color:#66b77d}.fp-list-status.aguardando_cliente{color:#7699c9}
        .fp-avatar-shell{position:relative;display:grid;place-items:center;min-width:0;overflow:visible;border-radius:50%;background:#f0dfd5;color:#7a4633;font-size:.68rem;font-weight:900}
        .fp-avatar-shell>img{display:block;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;border-radius:50%!important;object-fit:cover!important}
        .fp-avatar-shell>span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%}
        .fp-avatar-shell>i{position:absolute;right:-1px;bottom:0;width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:#24b96c}
        .fp-empty-state{display:grid;gap:5px;margin:16px;padding:26px 16px;border:1px dashed #dfd0c8;border-radius:14px;color:#8f7c72;text-align:center;font-size:.72rem}
        .fp-thread-panel{display:flex;min-width:0;min-height:0;flex-direction:column;background:#fbf7f4}
        .fp-thread-header{display:flex;align-items:center;gap:11px;min-height:76px;padding:12px 16px;border-bottom:1px solid #eadfd9;background:#fff}
        .fp-thread-person{display:grid;min-width:0;flex:1}
        .fp-thread-name-line{display:flex;align-items:center;gap:9px;min-width:0}
        .fp-thread-name-line strong{overflow:hidden;color:#30231d;font-size:.88rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-thread-person small{margin-top:3px;color:#8d786e;font-size:.65rem}
        .fp-status-pill{padding:4px 8px;border-radius:999px;background:#f0e8e3;color:#80685e;font-size:.54rem;font-weight:850;white-space:nowrap}
        .fp-status-pill.aguardando_cliente{background:#e6f4e9;color:#378354}.fp-status-pill.aguardando_equipe{background:#fff0d9;color:#9d6414}.fp-status-pill.resolvida{background:#e3f3e8;color:#2e7e4c}
        .fp-thread-quick-actions{display:flex;align-items:center;gap:7px}
        .fp-thread-quick-actions button,.fp-thread-quick-actions a{display:grid;place-items:center;width:38px;height:38px;border:1px solid transparent;border-radius:10px;background:transparent;color:#775347;text-decoration:none;cursor:pointer}
        .fp-thread-quick-actions button:hover,.fp-thread-quick-actions a:hover,.fp-thread-quick-actions button.active{border-color:#ead7cc;background:#fff6f1;color:#aa593b}
        .fp-back-button{display:none;width:36px;height:36px;border:1px solid #ddcec5;border-radius:10px;background:#fff;color:#704738}
        .fp-thread-search{display:grid;grid-template-columns:auto minmax(0,1fr) auto repeat(3,32px);align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid #eadfd9;background:#fffaf7;color:#896b5e}
        .fp-thread-search input{width:100%;height:34px;padding:0 4px;border:0;background:transparent;outline:0;font-size:.72rem}
        .fp-thread-search>span{min-width:42px;color:#8f7b71;font-size:.61rem;text-align:center}
        .fp-thread-search button{display:grid;place-items:center;width:32px;height:32px;border:1px solid #e2d2ca;border-radius:9px;background:#fff;color:#795444;cursor:pointer}
        .fp-thread-search button:disabled{opacity:.35;cursor:not-allowed}
        .fp-mobile-contact-actions{display:none}
        .fp-messages{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:18px 22px;background-color:#fbf7f3;background-image:radial-gradient(rgba(146,103,80,.055) 1px,transparent 1px);background-size:18px 18px;scroll-behavior:smooth}
        .fp-message-block{transition:filter .2s,transform .2s}
        .fp-message-block.active-search-match{filter:drop-shadow(0 0 7px rgba(211,112,63,.28));transform:translateY(-1px)}
        .fp-day-separator{display:flex;justify-content:center;margin:4px 0 9px}
        .fp-day-separator span{padding:5px 10px;border:1px solid #eadfd9;border-radius:999px;background:rgba(255,255,255,.9);color:#8b766c;font-size:.58rem;font-weight:750}
        .fp-bubble-row{display:flex}.fp-bubble-row.outgoing{justify-content:flex-end}
        .fp-bubble{max-width:min(73%,590px);padding:10px 12px;border:1px solid #e5d9d2;border-radius:15px 15px 15px 4px;background:#fff;box-shadow:0 4px 14px rgba(60,40,30,.035)}
        .outgoing .fp-bubble{border-color:#cce5d5;border-radius:15px 15px 4px 15px;background:#e9f7ee}
        .fp-bubble p{margin:0;color:#352923;font-size:.76rem;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}
        .fp-bubble mark{padding:0 2px;border-radius:3px;background:#ffe18a;color:inherit}
        .fp-bubble small{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:5px;color:#8c7c73;font-size:.56rem}
        .fp-receipt{display:inline-flex;align-items:center;gap:3px;font-weight:850}.fp-receipt em{font-style:normal}
        .fp-receipt.read{color:#1786d2}.fp-receipt.delivered{color:#6d858b}.fp-receipt.failed{color:#c74f4f}.fp-receipt.sent{color:#8c7c73}
        .fp-media-image,.fp-media-video{display:block;max-width:min(100%,420px);max-height:330px;margin-bottom:7px;border-radius:10px;object-fit:contain}
        .fp-media-audio{display:block;width:min(340px,100%);margin-bottom:5px}
        .fp-media-placeholder{display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:10px;border-radius:10px;background:rgba(255,255,255,.65);color:#765044;font-size:.7rem}
        .fp-document-link{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;min-width:250px;margin-bottom:5px;padding:9px;border-radius:10px;background:rgba(255,255,255,.72);color:#5f4238;text-decoration:none}
        .fp-document-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:#d84f47;color:#fff;font-size:.56rem;font-weight:900}
        .fp-document-link>span:nth-child(2){display:grid;min-width:0}.fp-document-link strong{overflow:hidden;font-size:.68rem;text-overflow:ellipsis;white-space:nowrap}.fp-document-link small{color:#907a70;font-size:.56rem}
        .fp-composer{display:grid;gap:6px;padding:10px 12px;border-top:1px solid #e6dad3;background:#fff}
        .fp-composer-row{display:grid;grid-template-columns:42px minmax(0,1fr) 42px 48px;align-items:end;gap:8px}
        .fp-composer-icon{display:grid;place-items:center;width:42px;height:42px;border:1px solid #dfd0c8;border-radius:12px;background:#fff;color:#755145;cursor:pointer}
        .fp-composer-icon.recording{border-color:#dc6565;background:#fff0f0;color:#bd3939}
        .fp-stop-recording{width:12px;height:12px;border-radius:2px;background:currentColor}
        .fp-composer textarea{width:100%;min-height:42px;max-height:108px;resize:none;padding:11px 12px;border:1px solid #dfd0c8;border-radius:12px;outline:0;font:inherit;font-size:.74rem;line-height:1.35}
        .fp-composer textarea:focus{border-color:#b96c4d;box-shadow:0 0 0 3px rgba(185,108,77,.08)}
        .fp-send-button{display:grid;place-items:center;width:48px;height:42px;border:0;border-radius:12px;background:#9c5338;color:#fff;cursor:pointer}
        .fp-send-button:disabled{opacity:.42;cursor:not-allowed}
        .fp-composer-hint{padding-left:50px;color:#9b877d;font-size:.55rem}
        .fp-file-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:#f8f0ec;font-size:.66rem}
        .fp-file-preview span{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fp-file-preview button{border:0;background:transparent;color:#9a4d38;font-size:.61rem;font-weight:800;cursor:pointer}
        .fp-thread-empty,.fp-customer-empty{display:grid;place-items:center;align-content:center;flex:1;gap:8px;min-height:220px;color:#8d796f;text-align:center}
        .fp-thread-empty strong,.fp-customer-empty strong{color:#49362e}.fp-thread-empty p,.fp-customer-empty p{max-width:220px;margin:0;font-size:.7rem}.fp-thread-empty.compact{min-height:120px}
        .fp-customer-panel{display:flex;min-width:0;min-height:0;flex-direction:column;gap:11px;padding:15px;border-left:1px solid #eee4de;background:#fff;overflow:auto}
        .fp-customer-title{color:#2f211c;font-size:.88rem;font-weight:850}
        .fp-customer-card{border:1px solid #eadfd9;border-radius:14px;background:#fff;padding:12px}
        .fp-customer-profile{display:flex;align-items:center;gap:11px}.fp-customer-profile>div{display:grid;min-width:0;gap:2px}.fp-customer-profile strong{overflow:hidden;font-size:.75rem;text-overflow:ellipsis;white-space:nowrap}.fp-customer-profile span{color:#7f6a60;font-size:.63rem}.fp-customer-profile small{overflow:hidden;color:#9a857b;font-size:.57rem;text-overflow:ellipsis;white-space:nowrap}
        .fp-customer-actions{display:grid;gap:7px}
        .fp-customer-actions a,.fp-customer-actions button{display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:0 12px;border:1px solid #dfc9bd;border-radius:11px;background:#fff;color:#8a4a34;text-decoration:none;font-size:.67rem;font-weight:850;cursor:pointer}
        .fp-customer-actions .primary{border-color:#a85a3b;background:#a85a3b;color:#fff}
        .fp-customer-actions a:hover,.fp-customer-actions button:hover{box-shadow:0 6px 16px rgba(122,72,48,.09);transform:translateY(-1px)}
        .fp-detail-card{display:grid;gap:6px}.fp-detail-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.fp-detail-heading span{color:#5c4439;font-size:.64rem;font-weight:850}.fp-detail-heading b{padding:4px 7px;border-radius:999px;background:#f2e9e4;color:#785d51;font-size:.52rem}.fp-detail-heading b.aguardando_cliente,.fp-detail-heading b.paid{background:#e3f3e7;color:#2e7d4a}.fp-detail-heading b.aguardando_equipe{background:#fff0d8;color:#966110}.fp-detail-heading b.resolvida{background:#e3f3e8;color:#2d7f4b}.fp-detail-card>strong{font-size:.7rem}.fp-detail-card>small{color:#8f7b71;font-size:.59rem;line-height:1.45}.fp-detail-card.pending b{min-width:22px;text-align:center}
        .fp-history-link{display:flex;align-items:center;justify-content:center;gap:7px;min-height:39px;border:1px solid #dfc9bd;border-radius:11px;color:#8b4c35;text-decoration:none;font-size:.66rem;font-weight:850}
        @media(max-width:1280px){.fp-inbox-shell{grid-template-columns:300px minmax(450px,1fr) 270px}.fp-customer-panel{padding:12px}.fp-inbox-metrics article{min-width:150px}}
        @media(max-width:1100px){.fp-inbox-shell{grid-template-columns:300px minmax(0,1fr)}.fp-customer-panel{display:none}.fp-mobile-contact-actions{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid #eadfd9;background:#fff}.fp-mobile-contact-actions a,.fp-mobile-contact-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid #decac0;border-radius:9px;background:#fff;color:#754633;text-decoration:none;font-size:.61rem;font-weight:800}}
        @media(max-width:820px){.fp-inbox-overview{align-items:flex-start;flex-direction:column;gap:10px}.fp-inbox-metrics{width:100%}.fp-inbox-metrics article{min-width:0;flex:1}.fp-inbox-shell{display:block;height:calc(100dvh - 210px);min-height:540px}.fp-conversation-panel{min-height:100%;border-right:0}.fp-conversation-panel.has-selection{display:none}.fp-thread-panel{display:none;height:100%}.fp-thread-panel.open{display:flex}.fp-back-button{display:grid;place-items:center}.fp-bubble{max-width:88%}.fp-thread-search{grid-template-columns:auto minmax(0,1fr) auto repeat(3,30px)}}
        @media(max-width:560px){.fp-inbox-overview{min-height:0}.fp-live-note{display:none}.fp-inbox-metrics article{padding:9px 10px}.fp-inbox-shell{height:calc(100dvh - 185px);border-radius:17px}.fp-thread-header{min-height:66px;padding:9px 10px}.fp-status-pill{display:none}.fp-thread-quick-actions a{display:none}.fp-mobile-contact-actions{overflow:auto}.fp-messages{padding:14px 10px}.fp-bubble{max-width:92%}.fp-composer{padding:8px}.fp-composer-row{grid-template-columns:38px minmax(0,1fr) 38px 44px;gap:6px}.fp-composer-icon{width:38px;height:38px}.fp-send-button{width:44px;height:38px}.fp-composer textarea{min-height:38px;padding:9px 10px}.fp-composer-hint{display:none}.fp-thread-search{grid-template-columns:auto minmax(0,1fr) auto 30px 30px}.fp-thread-search button:last-child{display:none}}
      `}</style>
    </div>
  );
}
