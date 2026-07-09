'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { OrderDetailsModal, orderSubtitle, orderTitle } from '@/components/OrderDetailsModal';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, getParcelaSituacao, initials, todayISO, whatsappLink } from '@/lib/format';
import type { Cliente, ClienteCategoria, ClienteStatus, HistoricoCliente, Parcela, Venda } from '@/lib/types';

const baseLetters = ['Todos', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

type ClientForm = {
  nome: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  aniversario: string;
  letra_fichario: string;
  categoria: ClienteCategoria;
  status: ClienteStatus;
  observacoes: string;
};

const emptyForm: ClientForm = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  bairro: '',
  cidade: '',
  aniversario: '',
  letra_fichario: '',
  categoria: 'Regular',
  status: 'ativo',
  observacoes: ''
};

function formFromCliente(cliente: Cliente): ClientForm {
  return {
    nome: cliente.nome || '',
    telefone: cliente.telefone || '',
    email: cliente.email || '',
    endereco: cliente.endereco || '',
    bairro: cliente.bairro || '',
    cidade: cliente.cidade || '',
    aniversario: cliente.aniversario || '',
    letra_fichario: cliente.letra_fichario || '',
    categoria: cliente.categoria,
    status: cliente.status,
    observacoes: cliente.observacoes || ''
  };
}

function phoneDisplay(phone: string | null | undefined) {
  if (!phone) return 'Sem telefone';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

function birthdayWithAge(date: string | null | undefined) {
  if (!date) return 'Aniversário não informado';
  const [y, m, d] = date.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthday = (now.getMonth() + 1 > m) || ((now.getMonth() + 1 === m) && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return `Aniversário: ${formatDate(date)}${age > 0 ? ` (${age} anos)` : ''}`;
}

function saleStatus(venda: Venda, parcelas: Parcela[]) {
  if (venda.status === 'cancelada') return { label: 'Cancelado', className: 'cancelled' };
  if (venda.status === 'estornada') return { label: 'Estornado', className: 'cancelled' };

  const itens = parcelas.filter((parcela) => parcela.venda_id === venda.id);
  if (itens.length === 0) return { label: 'Pendente', className: 'pending' };

  const paid = itens.filter((parcela) => parcela.status === 'pago').length;
  const overdue = itens.some((parcela) => getParcelaSituacao(parcela) === 'atrasada');

  if (paid === itens.length) return { label: 'Pago', className: 'paid' };
  if (paid > 0) return { label: 'Parcial', className: 'partial' };
  if (overdue) return { label: 'Pendente', className: 'pending' };
  return { label: 'Pendente', className: 'pending' };
}

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function saleNumberMapFromSales(vendas: Venda[]) {
  const sorted = [...vendas].sort((a, b) => {
    const createdA = parseDateValue(a.created_at || a.data_venda);
    const createdB = parseDateValue(b.created_at || b.data_venda);
    return createdA - createdB;
  });
  return sorted.reduce<Record<string, number>>((acc, venda, index) => {
    acc[venda.id] = index + 1;
    return acc;
  }, {});
}

function saleNumberLabel(venda: Venda, map: Record<string, number>) {
  return `Venda nº ${String(map[venda.id] || 1).padStart(3, '0')}`;
}

function saleItemsPreview(venda: Venda) {
  const items = venda.venda_itens && venda.venda_itens.length > 0
    ? venda.venda_itens.map((item) => `${item.quantidade}x ${item.produto_nome}`)
    : [orderSubtitle(venda)];

  if (items.length <= 2) return items;
  return [...items.slice(0, 2), `+${items.length - 2} item${items.length - 2 > 1 ? 's' : ''}`];
}

function WhatsappMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11.5a8.1 8.1 0 0 1-11.8 7.2L4 20l1.3-4A8.1 8.1 0 1 1 20 11.5Z" />
      <path d="M9.5 8.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.6 1.5c.1.2.1.4-.1.6l-.4.5c.6 1.1 1.5 2 2.7 2.6l.5-.4c.2-.2.4-.2.7-.1l1.4.6c.3.1.4.3.4.6v.4c0 .4-.2.6-.5.8-.5.3-1.4.5-2.8 0-1.7-.6-3.2-1.9-4.3-3.6-1-1.5-1.2-2.6-.9-3.1Z" />
    </svg>
  );
}

function CakeMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7h8" />
      <path d="M7 11h10a3 3 0 0 1 3 3v5H4v-5a3 3 0 0 1 3-3Z" />
      <path d="M4 16c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0 2 .8 4 0" />
      <path d="M12 3v4" />
    </svg>
  );
}

function BagMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 8h10l1 12H6L7 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  );
}

function CardMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 14h4" />
    </svg>
  );
}

function CalendarMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </svg>
  );
}

function NoteMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8l3 3v13H5V4h3Z" />
      <path d="M15 4v4h4" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  );
}

export default function ClientesPage() {
  return (
    <AppShell>
      <ClientesContent />
    </AppShell>
  );
}

function ClientesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [historicos, setHistoricos] = useState<HistoricoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState('Todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'nome_asc' | 'nome_desc' | 'recentes'>('nome_asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clientesResult, vendasResult, parcelasResult, historicosResult] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('vendas').select('*, venda_itens(*)').order('data_venda', { ascending: false }),
      supabase.from('parcelas').select('*, vendas(*)').order('vencimento'),
      supabase.from('historico_cliente').select('*').order('data_evento', { ascending: false })
    ]);

    if (clientesResult.error || vendasResult.error || parcelasResult.error || historicosResult.error) {
      setError(clientesResult.error?.message || vendasResult.error?.message || parcelasResult.error?.message || historicosResult.error?.message || 'Erro ao carregar clientes.');
      setLoading(false);
      return;
    }

    const loadedClientes = (clientesResult.data || []) as Cliente[];
    setClientes(loadedClientes);
    setVendas((vendasResult.data || []) as Venda[]);
    setParcelas((parcelasResult.data || []) as Parcela[]);
    setHistoricos((historicosResult.data || []) as HistoricoCliente[]);
    setSelectedId((current) => current || loadedClientes[0]?.id || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobileView(mobile);
      if (!mobile) setMobileProfileOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const letters = useMemo(() => baseLetters, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clientes.filter((cliente) => {
      if (cliente.status === 'inativo') return false;
      const clienteVendas = vendas.filter((venda) => venda.cliente_id === cliente.id);
      const searchable = [
        cliente.nome,
        cliente.telefone,
        cliente.email,
        cliente.cidade,
        cliente.letra_fichario,
        cliente.categoria,
        ...clienteVendas.map((venda) => venda.produto_nome),
        ...historicos.filter((item) => item.cliente_id === cliente.id).map((item) => `${item.titulo} ${item.descricao || ''}`)
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesQuery = !normalized || searchable.includes(normalized);
      const matchesLetter = letter === 'Todos' || cliente.letra_fichario === letter || cliente.nome.charAt(0).toUpperCase() === letter;
      return matchesQuery && matchesLetter;
    });
  }, [clientes, vendas, historicos, query, letter]);

  const sortedClients = useMemo(() => {
    const list = [...filtered];
    if (sortBy === 'nome_desc') return list.sort((a, b) => b.nome.localeCompare(a.nome));
    if (sortBy === 'recentes') return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return list.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtered, sortBy]);

  useEffect(() => {
    if (sortedClients.length > 0 && selectedId && !sortedClients.some((cliente) => cliente.id === selectedId)) {
      setSelectedId(sortedClients[0].id);
    }
  }, [sortedClients, selectedId]);

  const selected = useMemo(() => {
    return clientes.find((cliente) => cliente.id === selectedId) || sortedClients[0] || clientes[0] || null;
  }, [clientes, sortedClients, selectedId]);

  const visibleClients = useMemo(() => sortedClients, [sortedClients]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
    setMessage(null);
    setError(null);
  };

  useEffect(() => {
    if (searchParams.get('novo') !== '1') return;
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
    setMessage(null);
    setError(null);
    router.replace('/clientes', { scroll: false });
  }, [searchParams, router]);

  const openEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setForm(formFromCliente(cliente));
    setModalOpen(true);
    setMessage(null);
    setError(null);
  };

  const openNote = () => {
    setNoteText('');
    setNoteModalOpen(true);
    setMessage(null);
    setError(null);
  };

  const handleQuickNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cliente = selected;
    const text = noteText.trim();
    if (!cliente || !text) return;

    setSavingNote(true);
    setError(null);
    setMessage(null);

    const currentNotes = cliente.observacoes?.trim();
    const nextNotes = [currentNotes, `${formatDate(todayISO())}: ${text}`].filter(Boolean).join('\n');

    const [historyResult, clienteUpdateResult] = await Promise.all([
      supabase.from('historico_cliente').insert({
        cliente_id: cliente.id,
        tipo: 'observacao',
        titulo: 'Nota rápida',
        descricao: text,
        data_evento: todayISO()
      }),
      supabase.from('clientes').update({ observacoes: nextNotes }).eq('id', cliente.id)
    ]);

    setSavingNote(false);

    if (historyResult.error || clienteUpdateResult.error) {
      setError(historyResult.error?.message || clienteUpdateResult.error?.message || 'Erro ao salvar nota rápida.');
      return;
    }

    setNoteModalOpen(false);
    setNoteText('');
    setSelectedId(cliente.id);
    setMessage('Observação adicionada ao resumo e à ficha completa.');
    await loadData();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      endereco: form.endereco.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      aniversario: form.aniversario || null,
      letra_fichario: (form.letra_fichario || form.nome.charAt(0)).toUpperCase().slice(0, 1),
      categoria: form.categoria,
      status: form.status,
      observacoes: form.observacoes.trim() || null
    };

    const request = editingId
      ? supabase.from('clientes').update(payload).eq('id', editingId)
      : supabase.from('clientes').insert(payload).select('id').single();

    const { data, error: saveError } = await request;
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    if (!editingId && data && 'id' in data) setSelectedId(data.id as string);
    if (editingId) setSelectedId(editingId);
    setModalOpen(false);
    setMessage(editingId ? 'Ficha atualizada com sucesso.' : 'Cliente cadastrada com sucesso.');
    await loadData();
  };

  return (
    <div className="content-grid clientes-page clientes-page-v2">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="clientes-top-grid-v2">
        <div className="clientes-search-panel-v2">
          <label className="search-box clientes-search-box-v2">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail..." />
          </label>
        </div>

        <div className="clientes-alpha-panel-v2">
          <div className="alphabet-filter clientes-alpha-filter-v2">
            {letters.map((item) => (
              <button key={item} className={`letter-button ${letter === item ? 'active' : ''}`} onClick={() => setLetter(item)}>{item}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="client-layout clientes-layout-v2">
        <article className="panel client-list-panel clientes-list-panel-v2">
          <div className="clientes-list-head-v2">
            <span>{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</span>
            <label>
              <span>Ordenar:</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'nome_asc' | 'nome_desc' | 'recentes')}>
                <option value="nome_asc">Nome A-Z</option>
                <option value="nome_desc">Nome Z-A</option>
                <option value="recentes">Mais recentes</option>
              </select>
            </label>
          </div>

          <div className="client-list clientes-scroll-list-v2">
            {visibleClients.map((cliente) => {
              const openValue = parcelas.filter((parcela) => parcela.cliente_id === cliente.id && parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
              const dotClass = openValue > 0 ? 'warning' : 'ok';
              return (
                <button
                  key={cliente.id}
                  className={`client-item client-card-v2 ${selected?.id === cliente.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedId(cliente.id);
                    if (isMobileView) setMobileProfileOpen(true);
                  }}
                >
                  <span className={`avatar client-avatar-v2 ${cliente.categoria === 'VIP' ? 'gold' : ''}`}>{initials(cliente.nome)}</span>
                  <div className="client-card-main-v2">
                    <strong>{cliente.nome}</strong>
                    <small>
                      <span className={`client-dot-v2 ${dotClass}`} />
                      {phoneDisplay(cliente.telefone)}
                    </small>
                  </div>
                  <span className="client-card-arrow-v2">›</span>
                </button>
              );
            })}
            {!loading && visibleClients.length === 0 && <Notice>Nenhuma cliente encontrada com esses filtros.</Notice>}
          </div>

          <div className="clientes-list-footer-v2">
            Exibindo 1 a {Math.min(visibleClients.length, filtered.length)} de {filtered.length} clientes
          </div>
        </article>

        <article className="panel client-profile clientes-profile-panel-v2 clientes-desktop-profile-v2">
          {selected ? (
            <ClientProfile
              cliente={selected}
              vendas={vendas.filter((venda) => venda.cliente_id === selected.id)}
              parcelas={parcelas.filter((parcela) => parcela.cliente_id === selected.id)}
              historicos={historicos.filter((item) => item.cliente_id === selected.id)}
              onEdit={() => openEdit(selected)}
              onNote={openNote}
              onRefresh={loadData}
              onMessage={setMessage}
              onError={setError}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">♡</div>
              <h3>Selecione uma cliente</h3>
              <p>A ficha mostra compras, parcelas, histórico, preferências e mensagens rápidas para WhatsApp.</p>
            </div>
          )}
        </article>
      </section>


      {isMobileView && mobileProfileOpen && selected && (
        <div className="modal-backdrop mobile-detail-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel mobile-detail-panel">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Cliente</span>
                <h3>Ficha da cliente</h3>
              </div>
              <button className="outline-button icon-button" type="button" onClick={() => setMobileProfileOpen(false)}>×</button>
            </div>
            <ClientProfile
              cliente={selected}
              vendas={vendas.filter((venda) => venda.cliente_id === selected.id)}
              parcelas={parcelas.filter((parcela) => parcela.cliente_id === selected.id)}
              historicos={historicos.filter((item) => item.cliente_id === selected.id)}
              onEdit={() => openEdit(selected)}
              onNote={openNote}
              onRefresh={loadData}
              onMessage={setMessage}
              onError={setError}
            />
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <div className="modal-head">
              <div>
                <span className="eyebrow">{editingId ? 'Edição' : 'Cadastro'}</span>
                <h3>{editingId ? 'Editar ficha' : 'Novo cliente'}</h3>
              </div>
              <button className="outline-button icon-button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>Nome completo
                <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value, letra_fichario: event.target.value.charAt(0).toUpperCase() })} required />
              </label>
              <label>Telefone/WhatsApp
                <input value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} placeholder="(51) 99999-0000" />
              </label>
              <label>E-mail
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label>Aniversário
                <input type="date" value={form.aniversario} onChange={(event) => setForm({ ...form, aniversario: event.target.value })} />
              </label>
              <label>Endereço
                <input value={form.endereco} onChange={(event) => setForm({ ...form, endereco: event.target.value })} />
              </label>
              <label>Bairro
                <input value={form.bairro} onChange={(event) => setForm({ ...form, bairro: event.target.value })} />
              </label>
              <label>Cidade
                <input value={form.cidade} onChange={(event) => setForm({ ...form, cidade: event.target.value })} />
              </label>
              <label>Letra do fichário
                <input maxLength={1} value={form.letra_fichario} onChange={(event) => setForm({ ...form, letra_fichario: event.target.value.toUpperCase().slice(0, 1) })} />
              </label>
              <label>Categoria
                <select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value as ClienteCategoria })}>
                  <option>Regular</option>
                  <option>VIP</option>
                  <option>Potencial</option>
                  <option>Inativa</option>
                </select>
              </label>
              <label>Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ClienteStatus })}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label className="full-span">Observações
                <textarea value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} placeholder="Preferências, produtos favoritos, hábitos de pagamento..." />
              </label>
              <div className="form-actions full-span">
                <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Salvar cliente'}</button>
                <button className="ghost-button" type="button" onClick={() => setModalOpen(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {noteModalOpen && selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel compact">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Nota rápida</span>
                <h3>Nota rápida</h3>
                <p className="modal-description">Essa anotação aparece no resumo da cliente, no histórico e na ficha completa.</p>
              </div>
              <button className="outline-button icon-button" onClick={() => setNoteModalOpen(false)}>×</button>
            </div>
            <form className="inline-form" onSubmit={handleQuickNote}>
              <label>Cliente
                <input value={selected.nome} disabled />
              </label>
              <label>Observação
                <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Ex: prefere perfumes doces, pediu para avisar quando chegar shampoo novo..." required />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={savingNote}>{savingNote ? 'Salvando...' : 'Salvar nota rápida'}</button>
                <button className="ghost-button" type="button" onClick={() => setNoteModalOpen(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientProfile({ cliente, vendas, parcelas, historicos, onEdit, onNote, onRefresh, onMessage, onError }: { cliente: Cliente; vendas: Venda[]; parcelas: Parcela[]; historicos: HistoricoCliente[]; onEdit: () => void; onNote: () => void; onRefresh: () => Promise<void>; onMessage: (message: string | null) => void; onError: (message: string | null) => void }) {
  const [selectedOrder, setSelectedOrder] = useState<Venda | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleDeleteCliente = async () => {
    const hasHistory = vendas.length > 0 || parcelas.length > 0 || historicos.length > 0;
    const confirmText = hasHistory
      ? `A cliente ${cliente.nome} possui histórico de vendas/parcelas. Para segurança, ela será arquivada e sairá da lista principal, mas o histórico não será perdido. Continuar?`
      : `Deseja excluir a cliente ${cliente.nome}? Essa ação remove a ficha da lista.`;
    if (!window.confirm(confirmText)) return;

    setActionLoading(true);
    onError(null);
    onMessage(null);

    const result = hasHistory
      ? await supabase.from('clientes').update({ status: 'inativo' }).eq('id', cliente.id)
      : await supabase.from('clientes').delete().eq('id', cliente.id);

    setActionLoading(false);

    if (result.error) {
      onError(result.error.message);
      return;
    }

    onMessage(hasHistory ? 'Cliente arquivada com segurança.' : 'Cliente excluída com sucesso.');
    await onRefresh();
  };


  const deleteOrder = async (venda: Venda) => {
    const paidCount = parcelas.filter((parcela) => parcela.venda_id === venda.id && parcela.status === 'pago').length;
    const confirmText = paidCount > 0
      ? 'Esta venda possui parcela paga. O ideal é estornar, mas você pode excluir se foi lançamento errado. Excluir mesmo assim? O estoque será devolvido e as parcelas sairão da agenda.'
      : 'Excluir esta venda? Use apenas para lançamento errado. O estoque será devolvido e as parcelas sairão da agenda.';
    if (!window.confirm(confirmText)) return;

    setActionLoading(true);
    onError(null);
    onMessage(null);

    if (venda.status !== 'cancelada' && venda.status !== 'estornada') {
      await restoreStock(venda);
    }

    await supabase.from('estoque_movimentacoes').update({ venda_id: null, descricao: 'Venda excluída do histórico' }).eq('venda_id', venda.id);
    const { error: parcelasError } = await supabase.from('parcelas').delete().eq('venda_id', venda.id);
    const { error: itensError } = await supabase.from('venda_itens').delete().eq('venda_id', venda.id);
    const { error: vendaError } = await supabase.from('vendas').delete().eq('id', venda.id);

    setActionLoading(false);

    if (parcelasError || itensError || vendaError) {
      onError(parcelasError?.message || itensError?.message || vendaError?.message || 'Erro ao excluir venda.');
      return;
    }

    setSelectedOrder(null);
    onMessage('Venda excluída. Parcelas removidas e estoque devolvido quando necessário.');
    await onRefresh();
  };

  const handleMarkPaid = async (parcelaId: string) => {
    setActionLoading(true);
    onError(null);
    const { error: markError } = await supabase.from('parcelas').update({ status: 'pago', data_pagamento: todayISO() }).eq('id', parcelaId);
    setActionLoading(false);
    if (markError) {
      onError(markError.message);
      return;
    }
    onMessage('Parcela marcada como paga.');
    await onRefresh();
  };

  const restoreStock = async (venda: Venda) => {
    const items = venda.venda_itens && venda.venda_itens.length > 0
      ? venda.venda_itens
      : [{ produto_id: venda.produto_id, quantidade: venda.quantidade }];

    await Promise.all(items.map(async (item) => {
      if (!item.produto_id) return;
      const { data: produto } = await supabase.from('produtos').select('estoque, controla_estoque').eq('id', item.produto_id).single();
      if (produto?.controla_estoque === false) return;
      const currentStock = Number(produto?.estoque || 0);
      await supabase.from('produtos').update({ estoque: currentStock + Number(item.quantidade || 0) }).eq('id', item.produto_id);
    }));
  };

  const reverseOrder = async (venda: Venda, mode: 'cancelamento' | 'estorno') => {
    if (venda.status === 'cancelada' || venda.status === 'estornada') return;
    const confirmText = mode === 'estorno'
      ? 'Deseja estornar este venda? Use quando houve devolução/reembolso. O sistema cancela as parcelas e devolve os itens ao estoque.'
      : 'Deseja cancelar este venda? Use para desistência ou lançamento errado. O sistema cancela as parcelas em aberto e devolve os itens ao estoque.';
    if (!window.confirm(confirmText)) return;

    setActionLoading(true);
    onError(null);
    onMessage(null);

    const nextStatus = mode === 'estorno' ? 'estornada' : 'cancelada';
    const { error: vendaError } = await supabase.from('vendas').update({ status: nextStatus }).eq('id', venda.id);

    let parcelasUpdate = supabase.from('parcelas').update({ status: 'cancelado' }).eq('venda_id', venda.id);
    if (mode === 'cancelamento') parcelasUpdate = parcelasUpdate.neq('status', 'pago');
    const { error: parcelasError } = await parcelasUpdate;

    if (vendaError || parcelasError) {
      setActionLoading(false);
      onError(vendaError?.message || parcelasError?.message || 'Erro ao ajustar venda.');
      return;
    }

    await restoreStock(venda);
    await supabase.from('historico_cliente').insert({
      cliente_id: venda.cliente_id,
      tipo: mode,
      titulo: mode === 'estorno' ? 'Venda estornado' : 'Venda cancelado',
      descricao: mode === 'estorno'
        ? `${orderTitle(venda)} • ${formatCurrency(Number(venda.valor_total || 0))}. Venda estornado, parcelas canceladas e estoque devolvido.`
        : `${orderTitle(venda)} • ${formatCurrency(Number(venda.valor_total || 0))}. Venda cancelado, parcelas em aberto canceladas e estoque devolvido.`,
      data_evento: todayISO()
    });

    setActionLoading(false);
    setSelectedOrder(null);
    onMessage(mode === 'estorno' ? 'Venda estornado com sucesso.' : 'Venda cancelado com sucesso.');
    await onRefresh();
  };

  const totalComprado = vendas.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
  const emAberto = parcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
  const ultimaCompra = vendas[0];
  const msg = `Oi, ${cliente.nome.split(' ')[0]}! Tudo bem? Estou entrando em contato pelo FichaPro. Posso te ajudar com alguma informação da sua compra?`;
  const historyRows = vendas.slice(0, 5);
  const saleNumberMap = useMemo(() => saleNumberMapFromSales(vendas), [vendas]);

  return (
    <>
      <div className="cliente-profile-head-v2">
        <div className="cliente-identity-v2">
          <span className={`avatar cliente-avatar-hero-v2 ${cliente.categoria === 'VIP' ? 'gold' : ''}`}>{initials(cliente.nome)}</span>
          <div className="cliente-identity-copy-v2">
            <div className="cliente-name-row-v2">
              <h3>{cliente.nome}</h3>
              {cliente.categoria === 'VIP' && <span className="pill vip">VIP</span>}
              {cliente.categoria === 'Potencial' && <span className="pill success">Potencial</span>}
            </div>
            <div className="cliente-meta-row-v2">
              <span><span className="whatsapp-mini-icon-v2"><WhatsappMiniIcon /></span>{phoneDisplay(cliente.telefone)}</span>
              <span>{cliente.email || 'sem e-mail'}</span>
            </div>
            <div className="cliente-meta-row-v2 muted">
              <span><span className="cliente-line-icon-v2"><CakeMiniIcon /></span>{birthdayWithAge(cliente.aniversario)}</span>
            </div>
          </div>
        </div>

        <div className="cliente-action-area-v2">
          <div className="cliente-top-actions-v2">
            <button className="outline-button clientes-icon-button-v2" onClick={onNote}>✎ Nota rápida</button>
            <button className="outline-button clientes-icon-button-v2 clientes-edit-button-v2" onClick={onEdit}>Editar cliente</button>
            <button className="outline-button clientes-icon-button-v2 clientes-delete-button-v2" type="button" disabled={actionLoading} onClick={handleDeleteCliente}>Excluir cliente</button>
          </div>
          <a className="clientes-whatsapp-v2" href={whatsappLink(cliente.telefone, msg)} target="_blank">Conversar no WhatsApp</a>
        </div>
      </div>

      <div className="clientes-metrics-v2">
        <div className="clientes-metric-card-v2">
          <div className="clientes-metric-icon pink"><BagMiniIcon /></div>
          <div>
            <span>Total comprado</span>
            <strong>{formatCurrency(totalComprado)}</strong>
            <small>{vendas.length} venda{vendas.length !== 1 ? 's' : ''}</small>
          </div>
        </div>
        <div className="clientes-metric-card-v2 is-open">
          <div className="clientes-metric-icon orange"><CardMiniIcon /></div>
          <div>
            <span>Em aberto</span>
            <strong>{formatCurrency(emAberto)}</strong>
            <small>{parcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').length} parcelas</small>
          </div>
        </div>
        <div className="clientes-metric-card-v2">
          <div className="clientes-metric-icon purple"><CalendarMiniIcon /></div>
          <div>
            <span>Última compra</span>
            <strong>{ultimaCompra ? formatDate(ultimaCompra.data_venda) : '-'}</strong>
            <small>{ultimaCompra ? formatCurrency(Number(ultimaCompra.valor_total || 0)) : 'Sem compras'}</small>
          </div>
        </div>
      </div>

      <article className="clientes-note-panel-v2">
        <div className="clientes-section-title-v2"><span className="section-icon-v2"><NoteMiniIcon /></span>Observações</div>
        <p>{cliente.observacoes || historicos.find((item) => item.tipo === 'observacao')?.descricao || 'Sem observações cadastradas.'}</p>
      </article>

      <article className="clientes-history-panel-v2">
        <div className="clientes-history-head-v2">
          <div className="clientes-section-title-v2"><span className="section-icon-v2"><BagMiniIcon /></span>Histórico de compras / parcelas</div>
          <Link className="outline-button clientes-history-link-v2" href={`/clientes/${cliente.id}`}>Ver todas</Link>
        </div>

        <div className="clientes-history-table-v2">
          <div className="clientes-history-table-head-v2">
            <span>Data</span>
            <span>Venda</span>
            <span>Descrição</span>
            <span>Total</span>
            <span>Status</span>
          </div>

          {historyRows.length === 0 && <Notice>Nenhuma venda registrada ainda.</Notice>}

          {historyRows.map((venda) => {
            const status = saleStatus(venda, parcelas);
            const preview = saleItemsPreview(venda);
            return (
              <button className="clientes-history-row-v2" key={venda.id} onClick={() => setSelectedOrder(venda)}>
                <span>{formatDate(venda.data_venda)}</span>
                <span>{saleNumberLabel(venda, saleNumberMap)}</span>
                <div className="clientes-history-description-v2">
                  {preview.map((line) => <small key={line}>{line}</small>)}
                </div>
                <strong>{formatCurrency(Number(venda.valor_total || 0))}</strong>
                <span className={`clientes-status-pill-v2 ${status.className}`}>{status.label}</span>
              </button>
            );
          })}
        </div>

        {historyRows.length > 0 && (
          <div className="clientes-history-foot-v2">
            Exibindo {historyRows.length} de {vendas.length} registros
          </div>
        )}
      </article>

      {selectedOrder && (
        <OrderDetailsModal
          cliente={cliente}
          venda={selectedOrder}
          parcelas={parcelas.filter((parcela) => parcela.venda_id === selectedOrder.id)}
          onClose={() => setSelectedOrder(null)}
          onMarkPaid={handleMarkPaid}
          onCancelOrder={() => reverseOrder(selectedOrder, 'cancelamento')}
          onRefundOrder={() => reverseOrder(selectedOrder, 'estorno')}
          onDeleteOrder={() => deleteOrder(selectedOrder)}
        />
      )}
    </>
  );
}
