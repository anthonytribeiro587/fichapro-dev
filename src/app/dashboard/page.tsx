'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, initials, todayISO, whatsappLink } from '@/lib/format';
import type { Cliente, Parcela, Venda } from '@/lib/types';

type DashboardData = {
  clientes: Cliente[];
  vendas: Venda[];
  parcelas: Parcela[];
};

type IconType = 'clientes' | 'vendas' | 'receber' | 'atrasos' | 'calendar' | 'bag' | 'user' | 'bolt';

function UiIcon({ type }: { type: IconType }) {
  const paths = {
    clientes: <><path d="M16 20a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="3" /><path d="M20 19a3.4 3.4 0 0 0-3-3.2" /></>,
    vendas: <><path d="M7 8h10l1 12H6L7 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    receber: <><rect x="4" y="6" width="16" height="12" rx="3" /><path d="M4 10h16" /><path d="M8 15h4" /></>,
    atrasos: <><path d="M12 8v5" /><path d="M12 17h.01" /><path d="M10.3 4.6 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" /></>,
    calendar: <><path d="M7 3v4" /><path d="M17 3v4" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16" /></>,
    bag: <><path d="M7 8h10l1 12H6L7 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    user: <><path d="M16 20a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="3" /></>,
    bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function MetricIcon({ type, tone = 'peach' }: { type: IconType; tone?: 'peach' | 'gold' | 'danger' | 'pink' }) {
  return (
    <span className={`metric-icon-v31 ${tone}`}>
      <UiIcon type={type} />
    </span>
  );
}

function TinyIcon({ type }: { type: IconType }) {
  return (
    <span className="section-icon-v31">
      <UiIcon type={type} />
    </span>
  );
}

function statusLabel(status?: string | null) {
  if (status === 'cancelada') return 'Cancelado';
  if (status === 'estornada') return 'Estornado';
  if (status === 'pago') return 'Pago';
  if (status === 'parcial') return 'Parcial';
  if (status === 'pendente') return 'Pendente';
  return 'Em aberto';
}

function statusClass(status?: string | null) {
  if (status === 'cancelada' || status === 'estornada') return 'cancelado';
  if (status === 'pago') return 'pago';
  if (status === 'parcial') return 'parcial';
  if (status === 'pendente') return 'pendente';
  return 'aberto';
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

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function orderLabel(venda: Venda) {
  if (Number(venda.quantidade || 0) > 1) return `Venda com ${venda.quantidade} itens`;
  return venda.produto_nome || 'Venda registrada';
}

function chargeLabel(parcela: Parcela) {
  const total = parcela.vendas?.numero_parcelas || 1;
  return `Parcela ${parcela.numero} de ${total}`;
}

function growthDescription(vendasTrend: number | null, vendasMes: number, clientesMes: number, activeClients: number) {
  return {
    clientes: clientesMes > 0 ? `+${clientesMes} este mês ↗` : `${activeClients} cadastrados`,
    vendas: vendasTrend === null ? `${vendasMes} vendas neste mês` : `${vendasTrend >= 0 ? '+' : ''}${vendasTrend}% vs mês anterior ${vendasTrend >= 0 ? '↗' : '↘'}`
  };
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData>({ clientes: [], vendas: [], parcelas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [clientesResult, vendasResult, parcelasResult] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('vendas').select('*, clientes(*)').order('created_at', { ascending: false }),
      supabase.from('parcelas').select('*, clientes(*), vendas(*)').order('vencimento')
    ]);

    if (clientesResult.error || vendasResult.error || parcelasResult.error) {
      setError(clientesResult.error?.message || vendasResult.error?.message || parcelasResult.error?.message || 'Erro ao carregar dashboard.');
      setLoading(false);
      return;
    }

    setData({
      clientes: (clientesResult.data || []) as Cliente[],
      vendas: (vendasResult.data || []) as Venda[],
      parcelas: (parcelasResult.data || []) as Parcela[]
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const today = todayISO();
    const currentMonth = today.slice(0, 7);
    const previousMonth = previousMonthKey(currentMonth);
    const activeClients = data.clientes.filter((cliente) => cliente.status === 'ativo').length;
    const clientesMes = data.clientes.filter((cliente) => cliente.created_at?.slice(0, 7) === currentMonth).length;
    const validSales = data.vendas.filter((venda) => venda.status !== 'cancelada' && venda.status !== 'estornada');
    const saleNumberMap = saleNumberMapFromSales(data.vendas);
    const vendasDoMes = validSales.filter((venda) => venda.data_venda?.slice(0, 7) === currentMonth);
    const vendasMes = vendasDoMes.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
    const vendasDoMesAnterior = validSales.filter((venda) => venda.data_venda?.slice(0, 7) === previousMonth);
    const vendasMesAnterior = vendasDoMesAnterior.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
    const canCompareTrend = vendasMesAnterior > 0;
    const vendasTrend = canCompareTrend ? Math.round(((vendasMes - vendasMesAnterior) / vendasMesAnterior) * 100) : null;

    const abertas = data.parcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado');
    const valorAReceber = abertas.reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const atrasadas = abertas.filter((parcela) => parcela.vencimento < today);
    const futuras = abertas.filter((parcela) => parcela.vencimento >= today).slice(0, 5);
    const urgentes = [...atrasadas, ...futuras].slice(0, 5);
    const ultimosVendas = validSales.slice(0, 5);
    const atrasadoTotal = atrasadas.reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);

    return {
      activeClients,
      clientesMes,
      vendasMes,
      vendasTrend,
      vendasQuantidadeMes: vendasDoMes.length,
      abertas,
      valorAReceber,
      atrasadas,
      atrasadoTotal,
      urgentes,
      ultimosVendas,
      saleNumberMap
    };
  }, [data]);

  const growth = growthDescription(metrics.vendasTrend, metrics.vendasQuantidadeMes, metrics.clientesMes, metrics.activeClients);

  return (
    <div className="dashboard-v31 dashboard-screen-v2">
      {error && <Notice type="danger">{error}</Notice>}

      <section className="dashboard-kpis-v31" aria-label="Resumo principal">
        <article className="dashboard-kpi-v31">
          <MetricIcon type="clientes" />
          <div>
            <span>Clientes ativos</span>
            <strong>{loading ? '...' : metrics.activeClients}</strong>
            <small className={metrics.clientesMes > 0 ? 'trend-up-v34' : undefined}>{growth.clientes}</small>
          </div>
        </article>

        <article className="dashboard-kpi-v31">
          <MetricIcon type="vendas" />
          <div>
            <span>Vendas do mês</span>
            <strong>{loading ? '...' : formatCurrency(metrics.vendasMes)}</strong>
            <small className={metrics.vendasTrend !== null && metrics.vendasTrend >= 0 ? 'trend-up-v34' : metrics.vendasTrend !== null ? 'trend-down-v35' : undefined}>{growth.vendas}</small>
          </div>
        </article>

        <article className="dashboard-kpi-v31">
          <MetricIcon type="receber" tone="gold" />
          <div>
            <span>A receber</span>
            <strong className="gold-text-v31">{loading ? '...' : formatCurrency(metrics.valorAReceber)}</strong>
            <small>{metrics.abertas.length} parcelas</small>
          </div>
        </article>

        <article className="dashboard-kpi-v31">
          <MetricIcon type="atrasos" tone="danger" />
          <div>
            <span>Atrasados</span>
            <strong className="danger-text-v31">{loading ? '...' : formatCurrency(metrics.atrasadoTotal)}</strong>
            <small>{metrics.atrasadas.length} parcelas</small>
          </div>
        </article>
      </section>

      <section className="dashboard-panels-v31 dashboard-panels-v2">
        <article className="dashboard-panel-v31 dashboard-panel-v2">
          <header className="dashboard-panel-head-v31">
            <div className="panel-title-v31">
              <TinyIcon type="calendar" />
              <h3>Próximas cobranças</h3>
            </div>
            <Link href="/vencimentos" className="dashboard-outline-link-v31">Ver todos</Link>
          </header>

          <div className="dashboard-table-v31 charges-dashboard-v31">
            <div className="dashboard-table-head-v31 charges-head-v2">
              <span>Cliente</span>
              <span>Parcela</span>
              <span>Vencimento</span>
              <span>Valor</span>
            </div>

            {metrics.urgentes.length === 0 && <Notice>Nenhuma cobrança em aberto.</Notice>}

            {metrics.urgentes.map((parcela) => {
              const msg = `Oi, ${parcela.clientes?.nome || ''}! Passando para lembrar da ${chargeLabel(parcela).toLowerCase()} no valor de ${formatCurrency(parcela.valor)}.`;
              return (
                <div className="dashboard-table-row-v31 charges-row-v2" key={parcela.id}>
                  <div className="dashboard-client-cell-v31">
                    <span className="mini-avatar-v31">{initials(parcela.clientes?.nome || 'Cliente')}</span>
                    <strong>{parcela.clientes?.nome || 'Cliente'}</strong>
                    <a className="whatsapp-dot-v32" href={whatsappLink(parcela.clientes?.telefone, msg)} target="_blank" aria-label="Enviar WhatsApp">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 11.5a8 8 0 0 1-11.9 7L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z" />
                        <path d="M9 8.8c.2 3 2.3 5 5.2 5.5" />
                      </svg>
                    </a>
                  </div>
                  <span>{chargeLabel(parcela)}</span>
                  <span className={parcela.vencimento < todayISO() ? 'danger-text-v31' : ''}>{formatDate(parcela.vencimento)}</span>
                  <b>{formatCurrency(parcela.valor)}</b>
                </div>
              );
            })}
          </div>

          <footer className="dashboard-card-footer-v31">Exibindo {metrics.urgentes.length} de {metrics.abertas.length} cobranças</footer>
        </article>

        <article className="dashboard-panel-v31 dashboard-panel-v2">
          <header className="dashboard-panel-head-v31">
            <div className="panel-title-v31">
              <TinyIcon type="bag" />
              <h3>Últimas vendas</h3>
            </div>
            <Link href="/pedidos/historico" className="dashboard-outline-link-v31">Ver todos</Link>
          </header>

          <div className="dashboard-table-v31 orders-dashboard-v31">
            <div className="dashboard-table-head-v31 orders-head-v2">
              <span>Venda</span>
              <span>Cliente</span>
              <span>Data</span>
              <span>Total</span>
              <span>Status</span>
            </div>

            {metrics.ultimosVendas.length === 0 && <Notice>Nenhuma venda registrada ainda.</Notice>}

            {metrics.ultimosVendas.map((venda) => (
              <div className="dashboard-table-row-v31 orders-row-v2" key={venda.id}>
                <span className="order-code-v31">{saleNumberLabel(venda, metrics.saleNumberMap)}</span>
                <strong>{venda.clientes?.nome || 'Cliente'}</strong>
                <span>{formatDate(venda.data_venda)}</span>
                <b>{formatCurrency(venda.valor_total)}</b>
                <span className={`dashboard-status-v31 ${statusClass(venda.status)}`}>{statusLabel(venda.status)}</span>
              </div>
            ))}
          </div>

          <footer className="dashboard-card-footer-v31">Exibindo {metrics.ultimosVendas.length} de {data.vendas.length} vendas</footer>
        </article>
      </section>

      <section className="dashboard-actions-v31 dashboard-actions-v2">
        <header className="dashboard-actions-head-v2">
          <div className="panel-title-v31">
            <TinyIcon type="bolt" />
            <h3>Ações rápidas</h3>
          </div>
        </header>

        <div className="dashboard-actions-grid-v31">
          <Link href="/pedidos/novo" className="dashboard-action-v31 primary">
            <span className="dashboard-action-icon-v2 pink"><UiIcon type="bag" /></span>
            <div>
              <strong>Nova venda</strong>
              <small>Criar uma venda para cliente</small>
            </div>
            <b>›</b>
          </Link>

          <Link href="/clientes?novo=1" className="dashboard-action-v31">
            <span className="dashboard-action-icon-v2 soft-pink"><UiIcon type="user" /></span>
            <div>
              <strong>Nova cliente</strong>
              <small>Cadastrar uma nova cliente</small>
            </div>
            <b>›</b>
          </Link>

          <Link href="/vencimentos" className="dashboard-action-v31">
            <span className="dashboard-action-icon-v2 sand"><UiIcon type="calendar" /></span>
            <div>
              <strong>Ver vencimentos</strong>
              <small>Acompanhar parcelas a vencer</small>
            </div>
            <b>›</b>
          </Link>
        </div>
      </section>
    </div>
  );
}
