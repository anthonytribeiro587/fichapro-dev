'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Notice } from '@/components/Notice';
import { OrderDetailsModal, orderSubtitle, orderTitle } from '@/components/OrderDetailsModal';
import { StatusPill } from '@/components/StatusPill';
import { supabase } from '@/lib/supabase';
import { addMonthsISO, formatCurrency, formatDate, todayISO } from '@/lib/format';
import type { Cliente, Parcela, Produto, Venda, VendaItem } from '@/lib/types';

type OrderEditForm = {
  data_venda: string;
  primeiro_vencimento: string;
  forma_pagamento: string;
  observacoes: string;
};

type AdvancedFilters = {
  dateFrom: string;
  dateTo: string;
  minValue: string;
  maxValue: string;
};

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function itemPreviewLines(items: VendaItem[]) {
  if (items.length === 0) return [];
  const preview = items.slice(0, 2).map((item) => `${Number(item.quantidade || 1)}x ${item.produto_nome}`);
  if (items.length > 2) preview.push(`+${items.length - 2} item${items.length - 2 > 1 ? 's' : ''}`);
  return preview;
}

function fallbackItems(venda: Venda): VendaItem[] {
  const items = venda.venda_itens || [];
  if (items.length > 0) return items;

  const quantity = Number(venda.quantidade || 1) || 1;
  const total = Number(venda.valor_total || 0);
  return [{
    id: `${venda.id}-fallback`,
    venda_id: venda.id,
    produto_id: venda.produto_id,
    produto_nome: venda.produto_nome || 'Produto vendido',
    quantidade: quantity,
    valor_unitario: quantity > 0 ? Number((total / quantity).toFixed(2)) : total,
    valor_total: total,
    created_at: venda.created_at
  }];
}

function getOrderPaymentStatus(venda: Venda, parcelas: Parcela[]) {
  if (venda.status === 'cancelada') return { label: 'Cancelado', tone: 'atrasada' as const, key: 'revertidas' as const };
  if (venda.status === 'estornada') return { label: 'Estornado', tone: 'atrasada' as const, key: 'revertidas' as const };
  const orderParcelas = parcelas.filter((parcela) => parcela.venda_id === venda.id);
  if (orderParcelas.length > 0 && orderParcelas.every((parcela) => parcela.status === 'pago')) return { label: 'Pago', tone: 'pago' as const, key: 'pagas' as const };
  if (orderParcelas.some((parcela) => parcela.status === 'pago')) return { label: 'Parcial', tone: 'pendente' as const, key: 'parciais' as const };
  return { label: 'Pendente', tone: 'atrasada' as const, key: 'abertas' as const };
}

function OrderHistoryIcon({ index }: { index: number }) {
  const tones = ['pink', 'orange', 'purple', 'pink', 'orange'];
  return (
    <span className={`order-history-icon history-exact-icon ${tones[index % tones.length]}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 8h10l1 11H6L7 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </svg>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h7" />
      <path d="M14 6h6" />
      <path d="M10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
      <path d="M4 12h11" />
      <path d="M18 12h2" />
      <path d="M16 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
      <path d="M4 18h4" />
      <path d="M15 18h5" />
      <path d="M13 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const PAGE_SIZE = 5;

export function OrdersHistoryWorkspace() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Venda | null>(null);
  const [editingOrder, setEditingOrder] = useState<Venda | null>(null);
  const [editForm, setEditForm] = useState<OrderEditForm>({ data_venda: todayISO(), primeiro_vencimento: todayISO(), forma_pagamento: 'Parcelado', observacoes: '' });
  const [loading, setLoading] = useState(true);
  const [orderActionLoading, setOrderActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'todas' | 'abertas' | 'pagas' | 'parciais' | 'revertidas'>('todas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'recentes' | 'antigos'>('recentes');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({ dateFrom: '', dateTo: '', minValue: '', maxValue: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [vendasResult, parcelasResult, clientesResult, produtosResult] = await Promise.all([
      supabase.from('vendas').select('*, clientes(*), venda_itens(*)').order('data_venda', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('parcelas').select('*').order('vencimento'),
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('produtos').select('*').order('nome')
    ]);

    if (vendasResult.error || parcelasResult.error || clientesResult.error || produtosResult.error) {
      setError(vendasResult.error?.message || parcelasResult.error?.message || clientesResult.error?.message || produtosResult.error?.message || 'Erro ao carregar vendas.');
      setLoading(false);
      return;
    }

    const vendasData = (vendasResult.data || []) as Venda[];
    setVendas(vendasData);
    setParcelas((parcelasResult.data || []) as Parcela[]);
    setClientes((clientesResult.data || []) as Cliente[]);
    setProdutos((produtosResult.data || []) as Produto[]);
    setSelectedOrder((current) => current ? vendasData.find((venda) => venda.id === current.id) || null : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const saleNumberMap = useMemo(() => {
    const sorted = [...vendas].sort((a, b) => {
      const createdA = parseDateValue(a.created_at || a.data_venda);
      const createdB = parseDateValue(b.created_at || b.data_venda);
      return createdA - createdB;
    });
    return sorted.reduce<Record<string, number>>((acc, venda, index) => {
      acc[venda.id] = index + 1;
      return acc;
    }, {});
  }, [vendas]);

  const saleNumberLabel = useCallback((venda: Venda) => `Venda nº ${String(saleNumberMap[venda.id] || 1).padStart(3, '0')}`, [saleNumberMap]);

  const filteredOrders = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const minValue = advancedFilters.minValue ? Number(advancedFilters.minValue) : null;
    const maxValue = advancedFilters.maxValue ? Number(advancedFilters.maxValue) : null;
    const fromTime = parseDateValue(advancedFilters.dateFrom);
    const toTime = parseDateValue(advancedFilters.dateTo);

    return vendas.filter((venda) => {
      const paymentStatus = getOrderPaymentStatus(venda, parcelas);
      if (filter !== 'todas' && paymentStatus.key !== filter) return false;

      const saleTime = parseDateValue(venda.data_venda || venda.created_at);
      const orderValue = Number(venda.valor_total || 0);

      if (fromTime && saleTime < fromTime) return false;
      if (toTime && saleTime > toTime) return false;
      if (minValue !== null && !Number.isNaN(minValue) && orderValue < minValue) return false;
      if (maxValue !== null && !Number.isNaN(maxValue) && orderValue > maxValue) return false;

      if (!searchTerm) return true;
      const searchableText = [
        saleNumberLabel(venda),
        orderTitle(venda),
        orderSubtitle(venda),
        venda.clientes?.nome,
        venda.produto_nome,
        venda.data_venda,
        venda.status,
        paymentStatus.label,
        formatCurrency(venda.valor_total)
      ].filter(Boolean).join(' ').toLowerCase();
      return searchableText.includes(searchTerm);
    }).sort((a, b) => {
      const dateA = parseDateValue(a.data_venda || a.created_at);
      const dateB = parseDateValue(b.data_venda || b.created_at);
      const createdA = parseDateValue(a.created_at || a.data_venda);
      const createdB = parseDateValue(b.created_at || b.data_venda);
      const diff = dateA === dateB ? createdA - createdB : dateA - dateB;
      return sortOrder === 'recentes' ? diff * -1 : diff;
    });
  }, [filter, search, vendas, parcelas, sortOrder, advancedFilters, saleNumberLabel]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const paginationItems = useMemo(() => {
    const pages: Array<number | 'dots-left' | 'dots-right'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (currentPage > 3) pages.push('dots-left');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('dots-right');
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  const selectedOrderClient = useMemo(() => {
    if (!selectedOrder) return null;
    return selectedOrder.clientes || clientes.find((cliente) => cliente.id === selectedOrder.cliente_id) || null;
  }, [clientes, selectedOrder]);

  const selectedOrderParcelas = useMemo(() => selectedOrder ? parcelas.filter((parcela) => parcela.venda_id === selectedOrder.id) : [], [parcelas, selectedOrder]);


  const handleMarkPaid = async (parcelaId: string) => {
    setOrderActionLoading(true);
    setError(null);
    const { error: markError } = await supabase.from('parcelas').update({ status: 'pago', data_pagamento: todayISO() }).eq('id', parcelaId);
    setOrderActionLoading(false);
    if (markError) {
      setError(markError.message);
      return;
    }
    setMessage('Parcela marcada como paga.');
    await loadData();
  };

  const restoreStock = async (venda: Venda) => {
    const items = fallbackItems(venda);
    const quantitiesByProduct = items.reduce<Record<string, number>>((acc, item) => {
      if (!item.produto_id) return acc;
      acc[item.produto_id] = (acc[item.produto_id] || 0) + Number(item.quantidade || 0);
      return acc;
    }, {});

    await Promise.all(Object.entries(quantitiesByProduct).map(([produtoId, quantity]) => {
      const product = produtos.find((produto) => produto.id === produtoId);
      if (product?.controla_estoque === false) return Promise.resolve();
      const currentStock = Number(product?.estoque || 0);
      return supabase.from('produtos').update({ estoque: currentStock + quantity }).eq('id', produtoId);
    }));
  };

  const reverseOrder = async (venda: Venda, mode: 'cancelamento' | 'estorno') => {
    if (venda.status === 'cancelada' || venda.status === 'estornada') return;
    const confirmText = mode === 'estorno'
      ? 'Deseja estornar esta venda? O sistema vai cancelar as parcelas e devolver os itens ao estoque.'
      : 'Deseja cancelar esta venda? O sistema vai cancelar as parcelas em aberto e devolver os itens ao estoque.';
    if (!window.confirm(confirmText)) return;

    setOrderActionLoading(true);
    setError(null);
    setMessage(null);

    const nextStatus = mode === 'estorno' ? 'estornada' : 'cancelada';
    const { error: vendaError } = await supabase.from('vendas').update({ status: nextStatus }).eq('id', venda.id);

    let parcelasUpdate = supabase.from('parcelas').update({ status: 'cancelado' }).eq('venda_id', venda.id);
    if (mode === 'cancelamento') parcelasUpdate = parcelasUpdate.neq('status', 'pago');
    const { error: parcelasError } = await parcelasUpdate;

    if (vendaError || parcelasError) {
      setOrderActionLoading(false);
      setError(vendaError?.message || parcelasError?.message || 'Erro ao cancelar venda.');
      return;
    }

    await restoreStock(venda);
    await supabase.from('historico_cliente').insert({
      cliente_id: venda.cliente_id,
      tipo: mode,
      titulo: mode === 'estorno' ? 'Venda estornada' : 'Venda cancelada',
      descricao: mode === 'estorno'
        ? `${orderTitle(venda)} • ${formatCurrency(Number(venda.valor_total || 0))}. Venda estornado, parcelas canceladas e estoque devolvido.`
        : `${orderTitle(venda)} • ${formatCurrency(Number(venda.valor_total || 0))}. Venda cancelado, parcelas em aberto canceladas e estoque devolvido.`,
      data_evento: todayISO()
    });

    setOrderActionLoading(false);
    setSelectedOrder(null);
    setMessage(mode === 'estorno' ? 'Venda estornado, parcelas canceladas e estoque devolvido.' : 'Venda cancelado, parcelas em aberto canceladas e estoque devolvido.');
    await loadData();
  };


  const deleteOrder = async (venda: Venda) => {
    const paidCount = parcelas.filter((parcela) => parcela.venda_id === venda.id && parcela.status === 'pago').length;
    const confirmText = paidCount > 0
      ? 'Esta venda possui parcela marcada como paga. O ideal contábil é estornar, mas você pode excluir se foi um lançamento errado. Excluir mesmo assim? O estoque será devolvido e as parcelas sairão da agenda.'
      : 'Excluir esta venda? Use apenas para lançamento errado. O estoque será devolvido e as parcelas sairão da agenda.';
    if (!window.confirm(confirmText)) return;

    setOrderActionLoading(true);
    setError(null);
    setMessage(null);

    if (venda.status !== 'cancelada' && venda.status !== 'estornada') {
      await restoreStock(venda);
    }

    await supabase.from('estoque_movimentacoes').update({ venda_id: null, descricao: 'Venda excluída do histórico' }).eq('venda_id', venda.id);
    const { error: parcelasError } = await supabase.from('parcelas').delete().eq('venda_id', venda.id);
    const { error: itensError } = await supabase.from('venda_itens').delete().eq('venda_id', venda.id);
    const { error: vendaError } = await supabase.from('vendas').delete().eq('id', venda.id);

    setOrderActionLoading(false);

    if (parcelasError || itensError || vendaError) {
      setError(parcelasError?.message || itensError?.message || vendaError?.message || 'Erro ao excluir venda.');
      return;
    }

    setSelectedOrder(null);
    setMessage('Venda excluída. Parcelas removidas e estoque devolvido quando necessário.');
    await loadData();
  };

  const openEditOrder = (venda: Venda) => {
    setSelectedOrder(null);
    setEditingOrder(venda);
    setEditForm({
      data_venda: venda.data_venda || todayISO(),
      primeiro_vencimento: venda.primeiro_vencimento || todayISO(),
      forma_pagamento: venda.forma_pagamento || 'Parcelado',
      observacoes: venda.observacoes || ''
    });
  };

  const handleEditOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingOrder) return;

    setOrderActionLoading(true);
    setError(null);
    setMessage(null);

    const { error: vendaError } = await supabase.from('vendas').update({
      data_venda: editForm.data_venda,
      primeiro_vencimento: editForm.primeiro_vencimento,
      forma_pagamento: editForm.forma_pagamento,
      observacoes: editForm.observacoes || null
    }).eq('id', editingOrder.id);

    if (vendaError) {
      setOrderActionLoading(false);
      setError(vendaError.message);
      return;
    }

    const currentParcelas = parcelas.filter((parcela) => parcela.venda_id === editingOrder.id).sort((a, b) => a.numero - b.numero);
    await Promise.all(currentParcelas.map((parcela, index) => {
      if (parcela.status === 'pago' || parcela.status === 'cancelado') return Promise.resolve();
      return supabase.from('parcelas').update({ vencimento: addMonthsISO(editForm.primeiro_vencimento, index) }).eq('id', parcela.id);
    }));

    await supabase.from('historico_cliente').insert({
      cliente_id: editingOrder.cliente_id,
      tipo: 'edicao',
      titulo: 'Venda editada',
      descricao: 'Dados do venda ajustados: data, vencimento, forma de pagamento ou observação.',
      data_evento: todayISO()
    });

    setOrderActionLoading(false);
    setEditingOrder(null);
    setMessage('Venda atualizado com sucesso.');
    await loadData();
  };

  if (loading) {
    return <div className="loading-screen">Carregando histórico de vendas...</div>;
  }

  return (
    <div className="content-grid single-column history-exact-page">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}
      {orderActionLoading && <Notice>Processando ação do venda...</Notice>}

      <section className="history-exact-toolbar">
        <div className="history-exact-topbar">
          <label className="history-exact-search">
            <span className="history-exact-search-icon"><SearchIcon /></span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por cliente, produto, valor, status ou data..."
            />
          </label>
          <button className={`history-exact-advanced ${advancedOpen ? 'active' : ''}`} type="button" onClick={() => setAdvancedOpen((prev) => !prev)}>
            <FilterIcon />
            Filtros avançados
          </button>
        </div>

        {advancedOpen && (
          <div className="history-exact-advanced-panel">
            <label>
              Data inicial
              <input type="date" value={advancedFilters.dateFrom} onChange={(event) => setAdvancedFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} />
            </label>
            <label>
              Data final
              <input type="date" value={advancedFilters.dateTo} onChange={(event) => setAdvancedFilters((prev) => ({ ...prev, dateTo: event.target.value }))} />
            </label>
            <label>
              Valor mínimo
              <input type="number" min="0" step="0.01" placeholder="0,00" value={advancedFilters.minValue} onChange={(event) => setAdvancedFilters((prev) => ({ ...prev, minValue: event.target.value }))} />
            </label>
            <label>
              Valor máximo
              <input type="number" min="0" step="0.01" placeholder="0,00" value={advancedFilters.maxValue} onChange={(event) => setAdvancedFilters((prev) => ({ ...prev, maxValue: event.target.value }))} />
            </label>
            <div className="history-exact-advanced-actions">
              <button className="outline-button small" type="button" onClick={() => setAdvancedFilters({ dateFrom: '', dateTo: '', minValue: '', maxValue: '' })}>Limpar filtros</button>
            </div>
          </div>
        )}

        <div className="history-exact-chips">
          <button className={`history-exact-chip ${filter === 'todas' ? 'active' : ''}`} type="button" onClick={() => setFilter('todas')}>Todos</button>
          <button className={`history-exact-chip ${filter === 'abertas' ? 'active' : ''}`} type="button" onClick={() => setFilter('abertas')}>Em aberto</button>
          <button className={`history-exact-chip ${filter === 'pagas' ? 'active' : ''}`} type="button" onClick={() => setFilter('pagas')}>Pagos</button>
          <button className={`history-exact-chip ${filter === 'parciais' ? 'active' : ''}`} type="button" onClick={() => setFilter('parciais')}>Parciais</button>
          <button className={`history-exact-chip ${filter === 'revertidas' ? 'active' : ''}`} type="button" onClick={() => setFilter('revertidas')}>Cancelados/estornados</button>
          <button className="history-exact-chip" type="button" onClick={() => setAdvancedOpen(true)}>+ Mais filtros</button>
        </div>
      </section>

      <div className="history-exact-meta">
        <span>Exibindo {paginatedOrders.length} de {filteredOrders.length} vendas</span>
        <div className="history-sort-box">
          <span>Ordenar por:</span>
          <button className="history-exact-order" type="button" onClick={() => setSortMenuOpen((prev) => !prev)}>
            <strong>{sortOrder === 'recentes' ? 'Mais recentes' : 'Mais antigos'}</strong>
            <span className={`history-sort-arrow ${sortMenuOpen ? 'open' : ''}`}><ChevronDownIcon /></span>
          </button>
          {sortMenuOpen && (
            <div className="history-sort-menu">
              <button type="button" className={sortOrder === 'recentes' ? 'active' : ''} onClick={() => { setSortOrder('recentes'); setSortMenuOpen(false); }}>Mais recentes</button>
              <button type="button" className={sortOrder === 'antigos' ? 'active' : ''} onClick={() => { setSortOrder('antigos'); setSortMenuOpen(false); }}>Mais antigos</button>
            </div>
          )}
        </div>
      </div>

      <section className="history-exact-list">
        {paginatedOrders.length === 0 && <Notice>Nenhum venda encontrado com esses filtros.</Notice>}

        {paginatedOrders.map((venda, index) => {
          const paymentStatus = getOrderPaymentStatus(venda, parcelas);
          const items = fallbackItems(venda);
          const itemCount = items.length;
          const vendaNumero = saleNumberLabel(venda);
          return (
            <button className="history-exact-row" key={venda.id} type="button" onClick={() => setSelectedOrder(venda)}>
              <div className="history-exact-col order">
                <OrderHistoryIcon index={index} />
                <div className="history-exact-order-info">
                  <strong>{vendaNumero}</strong>
                  <small>{orderTitle(venda)}</small>
                </div>
              </div>

              <div className="history-exact-col client">
                <strong>{venda.clientes?.nome || 'Cliente'}</strong>
                <small>{formatDate(venda.data_venda)}</small>
              </div>

              <div className="history-exact-col items">
                <strong>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</strong>
                <div className="history-exact-item-lines">
                  {itemPreviewLines(items).map((line, itemIndex) => (
                    <small key={`${venda.id}-line-${itemIndex}`}>{line}</small>
                  ))}
                </div>
              </div>

              <div className="history-exact-col value">
                <strong>{formatCurrency(venda.valor_total)}</strong>
                <StatusPill label={paymentStatus.label} tone={paymentStatus.tone} />
              </div>

              <span className="history-exact-details">Abrir detalhes <b>›</b></span>
            </button>
          );
        })}
      </section>

      {totalPages > 1 && (
        <div className="history-exact-pagination" aria-label="Paginação do histórico">
          <button className="history-exact-page-nav" type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>‹</button>
          {paginationItems.map((item) => (
            typeof item === 'number' ? (
              <button key={item} className={`history-exact-page-num ${item === currentPage ? 'active' : ''}`} type="button" onClick={() => setPage(item)}>{item}</button>
            ) : (
              <span key={item} className="history-exact-page-dots">…</span>
            )
          ))}
          <button className="history-exact-page-nav" type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>›</button>
        </div>
      )}

      {selectedOrder && selectedOrderClient && (
        <OrderDetailsModal
          cliente={selectedOrderClient}
          venda={selectedOrder}
          parcelas={selectedOrderParcelas}
          onClose={() => setSelectedOrder(null)}
          onMarkPaid={handleMarkPaid}
          onEditOrder={() => openEditOrder(selectedOrder)}
          onCancelOrder={() => reverseOrder(selectedOrder, 'cancelamento')}
          onRefundOrder={() => reverseOrder(selectedOrder, 'estorno')}
          onDeleteOrder={() => deleteOrder(selectedOrder)}
        />
      )}

      {editingOrder && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel compact">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Editar venda</span>
                <h3>{orderTitle(editingOrder)}</h3>
                <p className="modal-description">Ajuste dados administrativos do venda. Para alterar itens ou valores, o ideal é estornar/cancelar e lançar novamente.</p>
              </div>
              <button className="outline-button icon-button" onClick={() => setEditingOrder(null)}>×</button>
            </div>

            <form className="inline-form" onSubmit={handleEditOrder}>
              <label>Data do venda
                <input type="date" value={editForm.data_venda} onChange={(event) => setEditForm({ ...editForm, data_venda: event.target.value })} />
              </label>
              <label>Primeiro vencimento
                <input type="date" value={editForm.primeiro_vencimento} onChange={(event) => setEditForm({ ...editForm, primeiro_vencimento: event.target.value })} />
              </label>
              <label>Forma de pagamento
                <select value={editForm.forma_pagamento} onChange={(event) => setEditForm({ ...editForm, forma_pagamento: event.target.value })}>
                  <option>Parcelado</option>
                  <option>Pix</option>
                  <option>Dinheiro</option>
                  <option>Cartão</option>
                  <option>Fiado</option>
                </select>
              </label>
              <label>Observações do venda
                <textarea value={editForm.observacoes} onChange={(event) => setEditForm({ ...editForm, observacoes: event.target.value })} placeholder="Ex: corrigido vencimento, cliente pediu entrega, combinado desconto..." />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={orderActionLoading}>{orderActionLoading ? 'Salvando...' : 'Salvar edição'}</button>
                <button className="outline-button" type="button" onClick={() => setEditingOrder(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
