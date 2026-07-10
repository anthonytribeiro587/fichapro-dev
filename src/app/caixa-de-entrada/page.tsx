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
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function messagePreview(message?: MensagemWhatsapp | null) {
  if (!message) return 'Sem mensagens registradas';
  if (message.tipo !== 'texto') return message.conteudo && !message.conteudo.startsWith('[') ? message.conteudo : `[${message.tipo}]`;
  return message.conteudo || 'Mensagem sem texto';
}

function metadataValue(message: MensagemWhatsapp, key: string) {
  const value = message.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function isGroupConversation(conversation: ConversaWhatsapp) {
  const jid = String(conversation.metadata?.remote_jid || '').toLowerCase();
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
  if (value === 'lida') return { icon: '✓✓', label: 'Lida', className: 'read' };
  if (value === 'entregue') return { icon: '✓✓', label: 'Entregue', className: 'delivered' };
  if (value === 'falhou') return { icon: '!', label: 'Falhou', className: 'failed' };
  return { icon: '✓', label: 'Enviada', className: 'sent' };
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

    const rows = ((conversationRows || []) as ConversationWithPreview[]).filter((item) => !isGroupConversation(item));
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
      return withPreview.find((item) => item.status === 'aguardando_equipe')?.id || withPreview[0]?.id || null;
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
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadThread, selectedId]);

  useEffect(() => {
    const paths = [...new Set(messages.map((item) => metadataValue(item, 'arquivo_path')).filter(Boolean))];
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
        body: JSON.stringify({ empresa_id: empresa.id, conversa_id: selected.id, mensagem: draft.trim(), ...filePayload })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a mensagem.');

      const answeredId = selected.id;
      setDraft('');
      setSelectedFile(null);
      setFeedback('Mensagem enviada. A conversa foi movida para “Aguardando cliente”.');
      setFilter('aguardando');
      const next = conversations.find((item) => item.id !== answeredId && item.status === 'aguardando_equipe');
      setSelectedId(next?.id || null);
      await loadConversations(true);
      if (next?.id) await loadThread(next.id);
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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
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
    const path = metadataValue(item, 'arquivo_path');
    const url = path ? mediaUrls[path] : '';
    const name = metadataValue(item, 'arquivo_nome') || 'Arquivo recebido';
    if (!url) return item.tipo !== 'texto' ? <div className="fp-media-placeholder">{item.tipo === 'audio' ? '🎙️ Áudio' : item.tipo === 'imagem' ? '🖼️ Imagem' : item.tipo === 'video' ? '🎬 Vídeo' : '📎 Anexo'}</div> : null;
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
            <button type="button" onClick={() => loadConversations(true)} aria-label="Atualizar conversas">↻</button>
          </div>

          <label className="fp-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversa" /></label>

          <div className="fp-inbox-filters">
            <button type="button" className={filter === 'aguardando' ? 'active' : ''} onClick={() => setFilter('aguardando')}>Para responder</button>
            <button type="button" className={filter === 'cliente' ? 'active' : ''} onClick={() => setFilter('cliente')}>Aguardando</button>
            <button type="button" className={filter === 'todas' ? 'active' : ''} onClick={() => setFilter('todas')}>Todas</button>
            <button type="button" className={filter === 'resolvidas' ? 'active' : ''} onClick={() => setFilter('resolvidas')}>Resolvidas</button>
          </div>

          <div className="fp-conversation-list">
            {loading && <div className="fp-empty-state">Carregando conversas...</div>}
            {!loading && filteredConversations.length === 0 && <div className="fp-empty-state"><strong>Nada por aqui</strong><span>Nenhuma conversa neste filtro.</span></div>}
            {filteredConversations.map((conversation) => {
              const name = conversation.clientes?.nome || conversation.nome_contato || conversation.telefone;
              return (
                <button type="button" key={conversation.id} className={`fp-conversation-item ${selectedId === conversation.id ? 'selected' : ''}`} onClick={() => selectConversation(conversation.id)}>
                  <span className="fp-avatar">{initials(name)}</span>
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
          {!selected && <div className="fp-thread-empty"><span>💬</span><strong>Selecione uma conversa</strong><p>O histórico e a caixa de resposta aparecerão aqui.</p></div>}
          {selected && <>
            <header className="fp-thread-header">
              <button type="button" className="fp-back-button" onClick={() => setSelectedId(null)} aria-label="Voltar">←</button>
              <span className="fp-avatar">{initials(selected.clientes?.nome || selected.nome_contato || selected.telefone)}</span>
              <div className="fp-thread-person"><strong>{selected.clientes?.nome || selected.nome_contato || selected.telefone}</strong><small>{selected.telefone} · {statusLabel[selected.status]}</small></div>
              <div className="fp-thread-actions">
                {selected.status === 'resolvida'
                  ? <button type="button" onClick={() => updateConversationStatus('aguardando_equipe')}>Reabrir</button>
                  : <button type="button" onClick={() => updateConversationStatus('resolvida')}>Resolver</button>}
              </div>
            </header>

            <div className="fp-contact-strip">
              <div><span>Cadastro</span><strong>{selected.cliente_id ? selected.clientes?.categoria || 'Cliente' : 'Novo contato'}</strong></div>
              <div className="fp-contact-actions">
                {selected.cliente_id
                  ? <Link href={`/clientes/${selected.cliente_id}`}>Abrir ficha</Link>
                  : <Link href={`/clientes?novo=1&telefone=${encodeURIComponent(selected.telefone)}`}>Cadastrar cliente</Link>}
                <Link href={`/operacao?cliente=${selected.cliente_id || ''}`}>Criar ação</Link>
              </div>
            </div>

            <div className="fp-messages">
              {loadingThread && <div className="fp-thread-empty compact">Carregando mensagens...</div>}
              {!loadingThread && messages.length === 0 && <div className="fp-thread-empty compact">Nenhuma mensagem registrada.</div>}
              {messages.map((item) => {
                const receipt = deliveryStatus(item.status);
                return (
                  <article key={item.id} className={`fp-bubble-row ${item.direcao === 'saida' ? 'outgoing' : 'incoming'}`}>
                    <div className="fp-bubble">
                      {renderMedia(item)}
                      {item.conteudo && !item.conteudo.startsWith('[') && <p>{item.conteudo}</p>}
                      <small>{formatTime(item.enviada_em)}{item.direcao === 'saida' && <span className={`fp-receipt ${receipt.className}`} title={receipt.label}> · {receipt.icon}</span>}</small>
                    </div>
                  </article>
                );
              })}
            </div>

            <form className="fp-composer" onSubmit={sendMessage}>
              {selectedFile && <div className="fp-file-preview"><span>{mediaKind(selectedFile) === 'audio' ? '🎙️' : '📎'} {selectedFile.name}</span><button type="button" onClick={() => setSelectedFile(null)}>Remover</button></div>}
              <textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit(); }} placeholder={selectedFile ? 'Adicione uma legenda (opcional)' : 'Digite uma resposta...'} disabled={sending} />
              <div className="fp-composer-footer">
                <div className="fp-media-actions">
                  <input ref={fileInputRef} type="file" hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo">📎</button>
                  <button type="button" className={recording ? 'recording' : ''} onClick={recording ? stopRecording : startRecording} title={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? '■' : '🎙️'}</button>
                  <small>{recording ? 'Gravando áudio...' : 'Ctrl + Enter para enviar'}</small>
                </div>
                <button className="fp-send-button" type="submit" disabled={sending || (!draft.trim() && !selectedFile)}>{sending ? 'Enviando...' : 'Enviar'}</button>
              </div>
            </form>
          </>}
        </main>
      </section>

      <style jsx>{`
        .fp-inbox-page{display:grid;gap:16px;min-width:0}.fp-inbox-summary{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 22px;border:1px solid rgba(112,80,62,.1);border-radius:20px;background:rgba(255,255,255,.86);box-shadow:0 16px 38px rgba(67,46,32,.045)}.fp-inbox-summary>div>span{display:block;color:#9a5639;font-size:.66rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.fp-inbox-summary h2{margin:3px 0 6px;font-size:1.45rem;letter-spacing:-.04em}.fp-inbox-summary p{margin:0;color:#7d6d64;font-size:.82rem}.fp-inbox-metrics{display:flex;gap:9px}.fp-inbox-metrics article{min-width:126px;padding:12px 14px;border-radius:15px;background:#f8f1ed}.fp-inbox-metrics article.attention{background:#fff0e5}.fp-inbox-metrics strong{display:block;font-size:1.2rem}.fp-inbox-metrics small{color:#8a776d;font-size:.66rem}.fp-inbox-shell{display:grid;grid-template-columns:320px minmax(0,1fr);height:min(680px,calc(100dvh - 230px));min-height:560px;border:1px solid rgba(112,80,62,.11);border-radius:22px;background:#fff;box-shadow:0 18px 46px rgba(67,46,32,.055);overflow:hidden}.fp-conversation-panel{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid #eee2dc;background:#fffdfb}.fp-panel-top{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;padding:15px 15px 10px}.fp-panel-top strong{display:block;font-size:.92rem}.fp-panel-top small{display:block;margin-top:2px;color:#947f74;font-size:.66rem}.fp-panel-top button{width:34px;height:34px;border:1px solid #e3d5cd;border-radius:11px;background:#fff;color:#754331}.fp-search{display:flex;flex:0 0 42px;align-items:center;gap:8px;height:42px;min-height:42px;max-height:42px;margin:0 13px 9px;padding:0 11px;border:1px solid #e2d5cd;border-radius:12px;background:#fff}.fp-search span{color:#a38d82}.fp-search input{width:100%;height:38px;min-height:0!important;padding:0!important;border:0!important;background:transparent!important;outline:0;font-size:.74rem;box-shadow:none!important}.fp-inbox-filters{display:grid;grid-template-columns:repeat(2,1fr);flex:0 0 auto;gap:5px;padding:0 13px 10px}.fp-inbox-filters button{min-height:32px;border:0;border-radius:9px;background:#f6efeb;color:#806b61;font-size:.62rem;font-weight:800}.fp-inbox-filters button.active{background:#754331;color:#fff}.fp-conversation-list{display:block;min-height:0;flex:1;overflow:auto}.fp-conversation-item{display:flex;width:100%;gap:10px;padding:12px 13px;border:0;border-top:1px solid #f2e9e4;background:transparent;text-align:left;cursor:pointer}.fp-conversation-item:hover{background:#fff8f4}.fp-conversation-item.selected{background:#faeee7;box-shadow:inset 3px 0 #a65738}.fp-avatar{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:13px;background:#efded5;color:#7b4835;font-size:.68rem;font-weight:900}.fp-conversation-copy{display:grid;min-width:0;flex:1;gap:3px}.fp-name-line{display:flex;justify-content:space-between;gap:8px}.fp-name-line strong{overflow:hidden;color:#33251f;font-size:.75rem;text-overflow:ellipsis;white-space:nowrap}.fp-name-line small{color:#9b887e;font-size:.58rem}.fp-preview{overflow:hidden;color:#7d6c63;font-size:.66rem;text-overflow:ellipsis;white-space:nowrap}.fp-conversation-status{justify-self:start;padding:3px 7px;border-radius:999px;background:#f0e9e5;color:#785e52;font-size:.54rem;font-weight:850}.fp-conversation-status.aguardando_equipe{background:#fff0d9;color:#996211}.fp-conversation-status.aguardando_cliente{background:#e9f0fb;color:#3c6596}.fp-conversation-status.resolvida{background:#e3f3e8;color:#2b7b4a}.fp-empty-state{display:grid;gap:5px;margin:14px;padding:22px;border:1px dashed #dccdc5;border-radius:14px;color:#8d7b72;text-align:center;font-size:.73rem}.fp-thread-panel{display:flex;min-width:0;min-height:0;flex-direction:column;background:linear-gradient(180deg,#fffaf7 0%,#fbf5f1 100%)}.fp-thread-header{display:flex;flex:0 0 auto;align-items:center;gap:10px;padding:13px 17px;border-bottom:1px solid #eadfd9;background:rgba(255,255,255,.92)}.fp-thread-person{display:grid;min-width:0;flex:1}.fp-thread-person strong{overflow:hidden;font-size:.8rem;text-overflow:ellipsis;white-space:nowrap}.fp-thread-person small{margin-top:2px;color:#8e7c72;font-size:.62rem}.fp-thread-actions button,.fp-back-button{min-height:34px;padding:0 12px;border:1px solid #d9c8be;border-radius:10px;background:#fff;color:#704738;font-weight:800;font-size:.66rem}.fp-back-button{display:none;width:35px;padding:0}.fp-contact-strip{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:8px 17px;border-bottom:1px solid #efe4de;background:#fff}.fp-contact-strip>div:first-child{display:grid}.fp-contact-strip span{color:#938178;font-size:.58rem}.fp-contact-strip strong{font-size:.66rem}.fp-contact-actions{display:flex;gap:7px}.fp-contact-actions a{padding:7px 10px;border:1px solid #ddcec6;border-radius:9px;color:#754331;text-decoration:none;font-size:.62rem;font-weight:800}.fp-messages{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:18px}.fp-bubble-row{display:flex}.fp-bubble-row.outgoing{justify-content:flex-end}.fp-bubble{max-width:min(74%,620px);padding:9px 11px;border:1px solid #e6d8d0;border-radius:14px 14px 14px 4px;background:#fff;box-shadow:0 5px 16px rgba(60,40,30,.035)}.outgoing .fp-bubble{border-color:#cde3d6;border-radius:14px 14px 4px 14px;background:#eaf6ef}.fp-bubble p{margin:7px 0 0;color:#3b2d27;font-size:.75rem;line-height:1.48;white-space:pre-wrap}.fp-bubble small{display:block;margin-top:5px;color:#8c7c73;font-size:.57rem;text-align:right}.fp-receipt{font-weight:900}.fp-receipt.read{color:#2787c7}.fp-receipt.failed{color:#c54343}.fp-media-image,.fp-media-video{display:block;max-width:100%;max-height:340px;border-radius:10px;object-fit:contain}.fp-media-audio{display:block;width:min(310px,100%);height:36px}.fp-media-placeholder{padding:9px 11px;border-radius:9px;background:rgba(80,58,47,.06);font-size:.72rem}.fp-document-link{display:block;color:#754331;font-size:.72rem;font-weight:800;text-decoration:none}.fp-composer{display:grid;flex:0 0 auto;gap:8px;padding:12px 14px;border-top:1px solid #e7dbd4;background:#fff}.fp-file-preview{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:#f7efeb;color:#60463b;font-size:.68rem}.fp-file-preview button{border:0;background:transparent;color:#9e4e38;font-size:.62rem;font-weight:800}.fp-composer textarea{width:100%;min-height:62px;resize:none;border:1px solid #dccdc4;border-radius:13px;padding:10px 11px;outline:0;font:inherit;font-size:.76rem}.fp-composer textarea:focus{border-color:#a66045;box-shadow:0 0 0 3px rgba(166,96,69,.1)}.fp-composer-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.fp-media-actions{display:flex;align-items:center;gap:7px}.fp-media-actions button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #ddcec6;border-radius:10px;background:#fff}.fp-media-actions button.recording{border-color:#c94b42;background:#fff0ef;color:#c94b42}.fp-media-actions small{color:#9a887e;font-size:.58rem}.fp-send-button{min-height:36px;padding:0 17px;border:0;border-radius:10px;background:#754331;color:#fff;font-size:.7rem;font-weight:850}.fp-send-button:disabled{opacity:.5}.fp-thread-empty{display:grid;place-items:center;align-content:center;flex:1;gap:7px;min-height:250px;color:#8c796e;text-align:center}.fp-thread-empty>span{font-size:2rem}.fp-thread-empty strong{color:#49352d}.fp-thread-empty p{margin:0;font-size:.73rem}.fp-thread-empty.compact{min-height:110px}.fp-back-button{flex:0 0 35px}
        @media(max-width:900px){.fp-inbox-summary{align-items:flex-start;flex-direction:column}.fp-inbox-metrics{width:100%}.fp-inbox-metrics article{min-width:0;flex:1}.fp-inbox-shell{display:block;height:calc(100dvh - 230px);min-height:540px}.fp-conversation-panel{height:100%;border-right:0}.fp-conversation-panel.has-selection{display:none}.fp-thread-panel{display:none;height:100%}.fp-thread-panel.open{display:flex}.fp-back-button{display:inline-grid;place-items:center}.fp-messages{padding:14px}.fp-bubble{max-width:88%}.fp-contact-actions a{padding:6px 8px}}
        @media(max-width:560px){.fp-inbox-summary{padding:15px}.fp-inbox-summary h2{font-size:1.22rem}.fp-inbox-summary p{font-size:.74rem}.fp-inbox-shell{border-radius:17px}.fp-contact-strip{align-items:flex-start;flex-direction:column}.fp-contact-actions{width:100%}.fp-contact-actions a{flex:1;text-align:center}.fp-composer-footer{align-items:stretch;flex-direction:column}.fp-media-actions{justify-content:space-between}.fp-send-button{width:100%}}
      `}</style>
    </div>
  );
}
