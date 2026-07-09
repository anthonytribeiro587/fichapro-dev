'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import { formatCurrency, getParcelaSituacao } from '@/lib/format';
import type { Cliente, Parcela, Produto, Venda, VendaItem } from '@/lib/types';

type ReportData = {
  clientes: Cliente[];
  vendas: Venda[];
  parcelas: Parcela[];
  produtos: Produto[];
  vendaItens: VendaItem[];
};

type Ranking = {
  id: string;
  nome: string;
  total: number;
  count: number;
  categoria?: string;
};

type MonthOption = {
  key: string;
  label: string;
  shortLabel: string;
};

type ClientFocus = {
  maiorCompra: { nome: string; valor: number } | null;
  semCompra: { nome: string; dias: number } | null;
  recompra: { nome: string; chance: number } | null;
};

function monthKeyFromDate(date: string | null | undefined) {
  if (!date) return '';
  return date.slice(0, 7);
}

function formatMonthLabel(key: string, short = false) {
  if (!key) return '-';
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', {
    month: short ? 'short' : 'long',
    year: 'numeric'
  })
    .format(date)
    .replace('.', '')
    .replace(/^./, (char) => char.toUpperCase());
}

function previousMonthKey(key: string) {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'Novo período';
  const abs = Math.abs(value);
  return `${abs.toFixed(abs >= 10 ? 1 : 1).replace('.', ',')}%`;
}

function daysBetween(dateISO: string) {
  const today = new Date();
  const date = new Date(`${dateISO}T12:00:00`);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
}

function AnalyticsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18V9" />
      <path d="M10 18V5" />
      <path d="M16 18v-7" />
      <path d="M22 18v-3" />
      <path d="M3 20h19" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <rect x="4" y="5" width="16" height="16" rx="3" />
      <path d="M4 10h16" />
    </svg>
  );
}


function ChevronDownTiny() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MiniIcon({ type }: { type: 'bag' | 'money' | 'wallet' | 'alert' | 'cart' | 'user' | 'tag' | 'trophy' | 'clock' | 'spark' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'bag':
      return <svg {...common}><path d="M7 8h10l1 12H6L7 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>;
    case 'money':
      return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M7 12h.01" /><path d="M17 12h.01" /><path d="M12 9.5v5" /></svg>;
    case 'wallet':
      return <svg {...common}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5Z" /><path d="M4 9h16" /><path d="M15.5 14h.01" /></svg>;
    case 'alert':
      return <svg {...common}><path d="M12 4 3 20h18L12 4Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
    case 'cart':
      return <svg {...common}><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /><path d="M3 5h2l2.5 10h9.5l2-7H7" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>;
    case 'tag':
      return <svg {...common}><path d="M20 13 13 20 4 11V4h7l9 9Z" /><path d="M7.5 7.5h.01" /></svg>;
    case 'trophy':
      return <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M8 4h8v4a4 4 0 0 1-8 0Z" /><path d="M16 6h2a2 2 0 0 1 0 4h-2" /><path d="M8 6H6a2 2 0 0 0 0 4h2" /></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
    default:
      return <svg {...common}><path d="M12 3v18" /><path d="M3 12h18" /></svg>;
  }
}

export default function RelatoriosPage() {
  return (
    <AppShell>
      <RelatoriosContent />
    </AppShell>
  );
}

function RelatoriosContent() {
  const [data, setData] = useState<ReportData>({ clientes: [], vendas: [], parcelas: [], produtos: [], vendaItens: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthMenuRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [clientesResult, vendasResult, parcelasResult, produtosResult, itensResult] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('vendas').select('*, clientes(*)').order('data_venda', { ascending: false }),
      supabase.from('parcelas').select('*, clientes(*), vendas(*)').order('vencimento'),
      supabase.from('produtos').select('*'),
      supabase.from('venda_itens').select('*')
    ]);

    if (clientesResult.error || vendasResult.error || parcelasResult.error || produtosResult.error || itensResult.error) {
      setError(clientesResult.error?.message || vendasResult.error?.message || parcelasResult.error?.message || produtosResult.error?.message || itensResult.error?.message || 'Erro ao carregar relatórios.');
      setLoading(false);
      return;
    }

    setData({
      clientes: (clientesResult.data || []) as Cliente[],
      vendas: (vendasResult.data || []) as Venda[],
      parcelas: (parcelasResult.data || []) as Parcela[],
      produtos: (produtosResult.data || []) as Produto[],
      vendaItens: (itensResult.data || []) as VendaItem[]
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const keys = new Set<string>();
    data.vendas.forEach((venda) => {
      const key = monthKeyFromDate(venda.data_venda);
      if (key) keys.add(key);
    });
    data.parcelas.forEach((parcela) => {
      const key = monthKeyFromDate(parcela.vencimento);
      if (key) keys.add(key);
    });

    const sortedKeys = Array.from(keys).sort();
    const anchorKey = sortedKeys.length > 0
      ? sortedKeys[sortedKeys.length - 1]
      : monthKeyFromDate(new Date().toISOString().slice(0, 10));

    const [anchorYear, anchorMonth] = anchorKey.split('-').map(Number);
    for (let offset = 0; offset < 6; offset += 1) {
      const date = new Date(anchorYear, anchorMonth - 1 - offset, 1);
      keys.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    return Array.from(keys)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => ({ key, label: formatMonthLabel(key), shortLabel: formatMonthLabel(key, true) }));
  }, [data.parcelas, data.vendas]);

  useEffect(() => {
    if (!selectedMonth && monthOptions.length > 0) {
      setSelectedMonth(monthOptions[0].key);
    }
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!monthMenuRef.current) return;
      if (!monthMenuRef.current.contains(event.target as Node)) {
        setMonthMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const reports = useMemo(() => {
    const vendaMap = Object.fromEntries(data.vendas.map((venda) => [venda.id, venda]));
    const produtoMap = Object.fromEntries(data.produtos.map((produto) => [produto.id, produto]));

    const allItems = data.vendaItens.length > 0
      ? data.vendaItens.map((item) => {
          const produto = item.produto_id ? produtoMap[item.produto_id] : undefined;
          return {
            ...item,
            data_venda: vendaMap[item.venda_id]?.data_venda,
            cliente_id: vendaMap[item.venda_id]?.cliente_id,
            categoria: produto?.categoria || 'Sem categoria'
          };
        })
      : data.vendas.map((venda) => ({
          id: venda.id,
          venda_id: venda.id,
          produto_id: venda.produto_id,
          produto_nome: venda.produto_nome,
          quantidade: venda.quantidade,
          valor_unitario: venda.quantidade > 0 ? Number(venda.valor_total || 0) / venda.quantidade : Number(venda.valor_total || 0),
          valor_total: venda.valor_total,
          data_venda: venda.data_venda,
          cliente_id: venda.cliente_id,
          categoria: venda.produtos?.categoria || produtoMap[venda.produto_id || '']?.categoria || 'Sem categoria'
        }));

    const currentVendas = data.vendas.filter((venda) => monthKeyFromDate(venda.data_venda) === selectedMonth);
    const previousKey = previousMonthKey(selectedMonth);
    const previousVendas = data.vendas.filter((venda) => monthKeyFromDate(venda.data_venda) === previousKey);
    const currentParcelas = data.parcelas.filter((parcela) => monthKeyFromDate(parcela.vencimento) === selectedMonth);
    const previousParcelas = data.parcelas.filter((parcela) => monthKeyFromDate(parcela.vencimento) === previousKey);
    const currentItems = allItems.filter((item) => monthKeyFromDate(item.data_venda) === selectedMonth);

    const totalVendido = currentVendas.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
    const prevTotalVendido = previousVendas.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
    const recebido = currentParcelas.filter((parcela) => parcela.status === 'pago').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const prevRecebido = previousParcelas.filter((parcela) => parcela.status === 'pago').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const pendente = currentParcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const prevPendente = previousParcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const atrasado = currentParcelas.filter((parcela) => getParcelaSituacao(parcela) === 'atrasada').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const prevAtrasado = previousParcelas.filter((parcela) => getParcelaSituacao(parcela) === 'atrasada').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const atrasadasCount = currentParcelas.filter((parcela) => getParcelaSituacao(parcela) === 'atrasada').length;

    const rankingMap = currentItems.reduce<Record<string, Ranking>>((acc, item) => {
      const key = item.produto_id || item.produto_nome;
      if (!acc[key]) acc[key] = { id: key, nome: item.produto_nome, total: 0, count: 0, categoria: item.categoria || 'Sem categoria' };
      acc[key].total += Number(item.valor_total || 0);
      acc[key].count += Number(item.quantidade || 1);
      return acc;
    }, {});
    const topProdutos = Object.values(rankingMap).sort((a, b) => b.total - a.total).slice(0, 5);

    const categoryMap = currentItems.reduce<Record<string, number>>((acc, item) => {
      const categoria = item.categoria || 'Sem categoria';
      acc[categoria] = (acc[categoria] || 0) + Number(item.valor_total || 0);
      return acc;
    }, {});
    const categorias = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total, percentual: totalVendido > 0 ? (total / totalVendido) * 100 : 0 }));

    const mesesBase = monthOptions.length > 0 ? monthOptions.map((item) => item.key).sort() : [selectedMonth];
    const selectedIndex = Math.max(0, mesesBase.indexOf(selectedMonth));
    const evolutionKeys = mesesBase.slice(Math.max(0, selectedIndex - 5), selectedIndex + 1);
    const evolucao = evolutionKeys.map((key) => {
      const total = data.vendas.filter((venda) => monthKeyFromDate(venda.data_venda) === key).reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
      return { key, label: formatMonthLabel(key, true).replace(' de ', '/'), total };
    });

    const maxEvolucao = Math.max(1, ...evolucao.map((item) => item.total));
    const maxProduto = Math.max(1, ...topProdutos.map((item) => item.count));

    const performance = Object.values(rankingMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        ticketMedio: item.count > 0 ? item.total / item.count : item.total
      }));

    const clientFocus: ClientFocus = (() => {
      const maiorVenda = [...currentVendas].sort((a, b) => Number(b.valor_total || 0) - Number(a.valor_total || 0))[0];
      const lastSaleByClient = data.clientes.map((cliente) => {
        const vendasCliente = data.vendas
          .filter((venda) => venda.cliente_id === cliente.id)
          .sort((a, b) => (a.data_venda < b.data_venda ? 1 : -1));
        const ultima = vendasCliente[0]?.data_venda || null;
        return { cliente, ultima, dias: ultima ? daysBetween(ultima) : 999 };
      });
      const semCompra = [...lastSaleByClient].sort((a, b) => b.dias - a.dias)[0];
      const recompras = lastSaleByClient
        .filter((item) => item.ultima)
        .map((item) => {
          const totalCompras = data.vendas.filter((venda) => venda.cliente_id === item.cliente.id).length;
          const chance = Math.min(97, 48 + totalCompras * 9 + Math.max(0, 25 - Math.min(item.dias, 25)));
          return { nome: item.cliente.nome, chance };
        })
        .sort((a, b) => b.chance - a.chance);

      return {
        maiorCompra: maiorVenda ? { nome: maiorVenda.clientes?.nome || data.clientes.find((c) => c.id === maiorVenda.cliente_id)?.nome || 'Cliente', valor: Number(maiorVenda.valor_total || 0) } : null,
        semCompra: semCompra ? { nome: semCompra.cliente.nome, dias: semCompra.dias } : null,
        recompra: recompras[0] || null
      };
    })();

    const cobrancas = {
      pagas: recebido,
      abertas: currentParcelas.filter((parcela) => parcela.status === 'pendente' && getParcelaSituacao(parcela) !== 'atrasada').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0),
      atrasadas: atrasado
    };
    cobrancas.abertas = Math.max(0, pendente - cobrancas.atrasadas);
    const totalCobrancas = cobrancas.pagas + cobrancas.abertas + cobrancas.atrasadas;

    const vipClientes = data.clientes.filter((cliente) => cliente.categoria === 'VIP').length;
    const ticketMedio = currentVendas.length > 0 ? totalVendido / currentVendas.length : 0;
    const periodCount = `${currentVendas.length} venda(s) no período`;

    return {
      previousKey,
      totalVendido,
      recebido,
      pendente,
      atrasado,
      atrasadasCount,
      topProdutos,
      categorias,
      evolucao,
      maxEvolucao,
      maxProduto,
      performance,
      vipClientes,
      ticketMedio,
      periodCount,
      cobrancas,
      totalCobrancas,
      clientFocus,
      comparisons: {
        totalVendido: percentChange(totalVendido, prevTotalVendido),
        recebido: percentChange(recebido, prevRecebido),
        pendente: percentChange(pendente, prevPendente),
        atrasado: percentChange(atrasado, prevAtrasado)
      }
    };
  }, [data, monthOptions, selectedMonth]);

  const currentMonthLabel = monthOptions.find((item) => item.key === selectedMonth)?.label || formatMonthLabel(selectedMonth);
  const previousMonthLabel = reports.previousKey ? formatMonthLabel(reports.previousKey, true) : '-';

  return (
    <div className="content-grid relatorios-v3-page">
      {error && <Notice type="danger">{error}</Notice>}
      {loading && <Notice>Carregando relatórios...</Notice>}

      <section className="panel relatorios-v3-hero">
        <div className="relatorios-v3-hero-main">
          <div className="relatorios-v3-hero-icon"><AnalyticsIcon /></div>
          <div>
            <h2>Resumo financeiro e comercial</h2>
            <p>Acompanhe o desempenho do seu negócio, vendas, recebimentos e oportunidades de crescimento.</p>
          </div>
        </div>

        <div className="relatorios-v3-period-box">
          <label>Período</label>
          <div className={`relatorios-v3-period-select ${monthMenuOpen ? 'open' : ''}`} ref={monthMenuRef}>
            <button
              type="button"
              className="relatorios-v3-period-button"
              onClick={() => setMonthMenuOpen((value) => !value)}
              aria-haspopup="listbox"
              aria-expanded={monthMenuOpen}
            >
              <span className="relatorios-v3-period-icon"><CalendarIcon /></span>
              <span className="relatorios-v3-period-value">{currentMonthLabel}</span>
              <span className="relatorios-v3-period-arrow"><ChevronDownTiny /></span>
            </button>
            {monthMenuOpen && (
              <div className="relatorios-v3-period-menu" role="listbox" aria-label="Selecionar período">
                {monthOptions.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={`relatorios-v3-period-option ${option.key === selectedMonth ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedMonth(option.key);
                      setMonthMenuOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <small>Comparado com {previousMonthLabel || 'mês anterior'}</small>
        </div>
      </section>

      <section className="relatorios-v3-kpi-grid">
        <KpiCard icon="bag" title="Vendas registradas" value={formatCurrency(reports.totalVendido)} subtitle={reports.periodCount} change={reports.comparisons.totalVendido} changeLabel={`vs ${previousMonthLabel}`} tone="default" />
        <KpiCard icon="money" title="Recebido" value={formatCurrency(reports.recebido)} subtitle={`${reports.totalVendido > 0 ? Math.round((reports.recebido / reports.totalVendido) * 100) : 0}% do total vendido`} change={reports.comparisons.recebido} changeLabel={`vs ${previousMonthLabel}`} tone="success" />
        <KpiCard icon="wallet" title="A receber" value={formatCurrency(reports.pendente)} subtitle="parcelas abertas" change={reports.comparisons.pendente} changeLabel={`vs ${previousMonthLabel}`} tone="warning" />
        <KpiCard icon="alert" title="Atrasado" value={formatCurrency(reports.atrasado)} subtitle={`${reports.atrasadasCount} parcela(s) vencida(s)`} change={reports.comparisons.atrasado} changeLabel={`vs ${previousMonthLabel}`} tone="danger" invertTrend />
      </section>

      <section className="relatorios-v3-grid-mid">
        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Indicadores do mês</span>
            </div>
          </div>
          <div className="relatorios-v3-indicator-list">
            <MetricRow icon="cart" label="Ticket médio" value={formatCurrency(reports.ticketMedio)} />
            <MetricRow icon="user" label="Clientes VIP" value={String(reports.vipClientes)} />
            <MetricRow icon="tag" label="Produtos cadastrados" value={String(data.produtos.length)} />
            <MetricRow icon="alert" label="Alertas de cobrança" value={String(reports.atrasadasCount)} danger />
          </div>
        </article>

        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Mais vendidos</span>
            </div>
          </div>
          <div className="relatorios-v3-sellers-list">
            {reports.topProdutos.length === 0 ? (
              <Notice>Nenhum produto vendido no período.</Notice>
            ) : reports.topProdutos.slice(0, 4).map((produto) => (
              <div className="relatorios-v3-seller-row" key={produto.id}>
                <div>
                  <strong>{produto.nome}</strong>
                  <small>{produto.count} venda(s)</small>
                </div>
                <div className="relatorios-v3-seller-track"><i style={{ width: `${Math.max(10, (produto.count / reports.maxProduto) * 100)}%` }} /></div>
                <b>{produto.count}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Cobranças</span>
              <p>Situação das cobranças</p>
            </div>
          </div>
          <div className="relatorios-v3-charge-wrap">
            <DonutChart total={reports.totalCobrancas} values={[reports.cobrancas.pagas, reports.cobrancas.abertas, reports.cobrancas.atrasadas]} colors={['#57c67b', '#f6a623', '#eb4a4f']} centerValue={formatCurrency(reports.totalCobrancas)} />
            <div className="relatorios-v3-charge-legend">
              <LegendRow color="#57c67b" label="Pagas" value={formatCurrency(reports.cobrancas.pagas)} percent={reports.totalCobrancas > 0 ? (reports.cobrancas.pagas / reports.totalCobrancas) * 100 : 0} />
              <LegendRow color="#f6a623" label="Em aberto" value={formatCurrency(reports.cobrancas.abertas)} percent={reports.totalCobrancas > 0 ? (reports.cobrancas.abertas / reports.totalCobrancas) * 100 : 0} />
              <LegendRow color="#eb4a4f" label="Atrasadas" value={formatCurrency(reports.cobrancas.atrasadas)} percent={reports.totalCobrancas > 0 ? (reports.cobrancas.atrasadas / reports.totalCobrancas) * 100 : 0} />
            </div>
          </div>
        </article>

        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Clientes em foco</span>
            </div>
          </div>
          <div className="relatorios-v3-focus-list">
            <FocusRow icon="trophy" label="Maior compra" name={reports.clientFocus.maiorCompra?.nome || '-'} meta={reports.clientFocus.maiorCompra ? formatCurrency(reports.clientFocus.maiorCompra.valor) : '-'} tone="green" />
            <FocusRow icon="clock" label="Não compra há mais tempo" name={reports.clientFocus.semCompra?.nome || '-'} meta={reports.clientFocus.semCompra ? `há ${reports.clientFocus.semCompra.dias} dias` : '-'} tone="orange" />
            <FocusRow icon="spark" label="Maior chance de recompra" name={reports.clientFocus.recompra?.nome || '-'} meta={reports.clientFocus.recompra ? `${reports.clientFocus.recompra.chance}%` : '-'} tone="purple" />
          </div>
        </article>
      </section>

      <section className="relatorios-v3-grid-bottom">
        <article className="panel relatorios-v3-card">
          <div className="panel-header compact relatorios-v3-header-with-action">
            <div>
              <span className="eyebrow">Evolução das vendas</span>
              <p>Receita por mês</p>
            </div>
            <span className="ghost-badge">Últimos {Math.max(1, reports.evolucao.length)} meses</span>
          </div>
          <div className="relatorios-v3-evolution-list">
            {reports.evolucao.map((item) => (
              <div className="relatorios-v3-evolution-row" key={item.key}>
                <span>{item.label}</span>
                <div className="relatorios-v3-evolution-track">
                  <i style={{ width: `${Math.max(6, (item.total / reports.maxEvolucao) * 100)}%` }} />
                </div>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Vendas por categoria</span>
              <p>Distribuição do total vendido</p>
            </div>
          </div>
          <div className="relatorios-v3-category-wrap">
            <DonutChart total={reports.totalVendido} values={reports.categorias.map((item) => item.total)} colors={['#7c4dff', '#ff2ea6', '#f6a623', '#67d192', '#59b6ff']} centerValue={formatCurrency(reports.totalVendido)} />
            <div className="relatorios-v3-category-list">
              {reports.categorias.map((categoria, index) => (
                <LegendRow key={categoria.nome} color={['#7c4dff', '#ff2ea6', '#f6a623', '#67d192', '#59b6ff'][index % 5]} label={categoria.nome} value={formatCurrency(categoria.total)} percent={categoria.percentual} compact />
              ))}
            </div>
          </div>
        </article>

        <article className="panel relatorios-v3-card">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Desempenho por produto</span>
            </div>
          </div>
          <div className="relatorios-v3-table-wrap">
            <table className="relatorios-v3-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Vendas</th>
                  <th>Receita</th>
                  <th>Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {reports.performance.slice(0, 5).map((item) => (
                  <tr key={item.id}>
                    <td>{item.nome}</td>
                    <td>{item.count}</td>
                    <td>{formatCurrency(item.total)}</td>
                    <td>{formatCurrency(item.ticketMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  subtitle,
  change,
  changeLabel,
  tone,
  invertTrend
}: {
  icon: 'bag' | 'money' | 'wallet' | 'alert';
  title: string;
  value: string;
  subtitle: string;
  change: number | null;
  changeLabel: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
  invertTrend?: boolean;
}) {
  const positive = change === null ? true : invertTrend ? change <= 0 : change >= 0;
  return (
    <article className={`relatorios-v3-kpi-card ${tone}`}>
      <div className="relatorios-v3-kpi-icon"><MiniIcon type={icon} /></div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{subtitle}</small>
      <div className={`relatorios-v3-kpi-change ${positive ? 'up' : 'down'}`}>
        <b>{positive ? '↑' : '↓'} {formatPercent(change)}</b>
        <em>{changeLabel}</em>
      </div>
    </article>
  );
}

function MetricRow({ icon, label, value, danger }: { icon: 'cart' | 'user' | 'tag' | 'alert'; label: string; value: string; danger?: boolean }) {
  return (
    <div className={`relatorios-v3-metric-row ${danger ? 'danger' : ''}`}>
      <span className="relatorios-v3-metric-icon"><MiniIcon type={icon} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LegendRow({ color, label, value, percent, compact }: { color: string; label: string; value: string; percent: number; compact?: boolean }) {
  return (
    <div className={`relatorios-v3-legend-row ${compact ? 'compact' : ''}`}>
      <span className="relatorios-v3-legend-dot" style={{ backgroundColor: color }} />
      <span className="relatorios-v3-legend-label">{label}</span>
      <strong>{value}</strong>
      <em>{Math.round(percent)}%</em>
    </div>
  );
}

function FocusRow({ icon, label, name, meta, tone }: { icon: 'trophy' | 'clock' | 'spark'; label: string; name: string; meta: string; tone: 'green' | 'orange' | 'purple' }) {
  return (
    <div className="relatorios-v3-focus-row">
      <div className={`relatorios-v3-focus-icon ${tone}`}><MiniIcon type={icon} /></div>
      <div className="relatorios-v3-focus-copy">
        <small>{label}</small>
        <strong>{name}</strong>
      </div>
      <b>{meta}</b>
    </div>
  );
}

function DonutChart({ total, values, colors, centerValue }: { total: number; values: number[]; colors: string[]; centerValue: string }) {
  const size = 96;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relatorios-v3-donut-box">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relatorios-v3-donut-chart" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#efe6df" strokeWidth={stroke} />
        {values.map((value, index) => {
          const ratio = total > 0 ? value / total : 0;
          const dash = circumference * ratio;
          const segment = (
            <circle
              key={`${index}-${value}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return segment;
        })}
      </svg>
      <div className="relatorios-v3-donut-center">
        <span>Total</span>
        <strong>{centerValue}</strong>
      </div>
    </div>
  );
}
