'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { OrderDetailsModal, orderSubtitle, orderTitle } from '@/components/OrderDetailsModal';
import { StatusPill } from '@/components/StatusPill';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, getParcelaSituacao, initials, todayISO, whatsappLink } from '@/lib/format';
import type { Cliente, HistoricoCliente, Parcela, Venda } from '@/lib/types';

type ClienteData = {
  cliente: Cliente | null;
  vendas: Venda[];
  parcelas: Parcela[];
  historico: HistoricoCliente[];
};

export default function ClienteFichaPage() {
  return (
    <AppShell>
      <ClienteFichaContent />
    </AppShell>
  );
}

function ClienteFichaContent() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ClienteData>({ cliente: null, vendas: [], parcelas: [], historico: [] });
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Venda | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [whatsappSending, setWhatsappSending] = useState<string | null>(null);

  const clienteId = params.id;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clienteResult, vendasResult, parcelasResult, historicoResult] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', clienteId).single(),
      supabase.from('vendas').select('*, venda_itens(*)').eq('cliente_id', clienteId).order('data_venda', { ascending: false }),
      supabase.from('parcelas').select('*, vendas(*)').eq('cliente_id', clienteId).order('vencimento'),
      supabase.from('historico_cliente').select('*').eq('cliente_id', clienteId).order('data_evento', { ascending: false })
    ]);

    if (clienteResult.error) {
      setError(clienteResult.error.message);
      setLoading(false);
      return;
    }

    setData({
      cliente: clienteResult.data as Cliente,
      vendas: (vendasResult.data || []) as Venda[],
      parcelas: (parcelasResult.data || []) as Parcela[],
      historico: (historicoResult.data || []) as HistoricoCliente[]
    });
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resumo = useMemo(() => {
    const comprado = data.vendas.reduce((sum, venda) => sum + Number(venda.valor_total || 0), 0);
    const pago = data.parcelas.filter((parcela) => parcela.status === 'pago').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const pendente = data.parcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
    const atrasadas = data.parcelas.filter((parcela) => getParcelaSituacao(parcela) === 'atrasada');
    return { comprado, pago, pendente, atrasadas };
  }, [data]);


  const sendWahaMessage = async (phone: string | null | undefined, text: string, successText = 'Mensagem enviada pelo WhatsApp integrado.') => {
    if (!phone) {
      setError('Este cliente não possui telefone cadastrado.');
      return;
    }

    setWhatsappSending(text);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: text })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError(result.error || 'Não foi possível enviar pelo WAHA.');
        return;
      }

      setMessage(successText);
    } catch {
      setError('Erro ao chamar a integração WAHA do FichaPRO.');
    } finally {
      setWhatsappSending(null);
    }
  };

  const handleMarkPaid = async (parcelaId: string) => {
    const { error: updateError } = await supabase
      .from('parcelas')
      .update({ status: 'pago', data_pagamento: todayISO() })
      .eq('id', parcelaId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
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

    setError(null);
    setMessage(null);

    const nextStatus = mode === 'estorno' ? 'estornada' : 'cancelada';
    const { error: vendaError } = await supabase.from('vendas').update({ status: nextStatus }).eq('id', venda.id);

    let parcelasUpdate = supabase.from('parcelas').update({ status: 'cancelado' }).eq('venda_id', venda.id);
    if (mode === 'cancelamento') parcelasUpdate = parcelasUpdate.neq('status', 'pago');
    const { error: parcelasError } = await parcelasUpdate;

    if (vendaError || parcelasError) {
      setError(vendaError?.message || parcelasError?.message || 'Erro ao ajustar venda.');
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

    setSelectedOrder(null);
    setMessage(mode === 'estorno' ? 'Venda estornado com sucesso.' : 'Venda cancelado com sucesso.');
    await loadData();
  };

  const handleNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const noteText = note.trim();
    if (!noteText || !data.cliente) return;

    setSavingNote(true);
    setError(null);
    setMessage(null);

    const currentNotes = data.cliente.observacoes?.trim();
    const nextNotes = [currentNotes, `${formatDate(todayISO())}: ${noteText}`].filter(Boolean).join('\n');

    const [historyResult, clienteUpdateResult] = await Promise.all([
      supabase.from('historico_cliente').insert({
        cliente_id: clienteId,
        tipo: 'observacao',
        titulo: 'Observação rápida',
        descricao: noteText,
        data_evento: todayISO()
      }),
      supabase.from('clientes').update({ observacoes: nextNotes }).eq('id', clienteId)
    ]);

    setSavingNote(false);

    if (historyResult.error || clienteUpdateResult.error) {
      setError(historyResult.error?.message || clienteUpdateResult.error?.message || 'Erro ao salvar nota rápida.');
      return;
    }

    setNote('');
    setMessage('Observação salva na ficha e no histórico.');
    await loadData();
  };

  if (loading) {
    return <div className="loading-screen">Carregando ficha do cliente...</div>;
  }

  if (!data.cliente) {
    return (
      <div className="panel empty-state">
        <h3>Cliente não encontrado</h3>
        <Link className="primary-button" href="/clientes">Voltar para clientes</Link>
      </div>
    );
  }

  const cliente = data.cliente;
  const observacoesRecentes = data.historico.filter((item) => item.tipo === 'observacao').slice(0, 4);
  const cobrançaMsg = `Oi, ${cliente.nome}! Passando para lembrar dos vencimentos em aberto no FichaPro. Você possui ${formatCurrency(resumo.pendente)} pendente. Qualquer dúvida me chama por aqui.`;
  const posVendaMsg = `Oi, ${cliente.nome}! Tudo bem? Passando para saber se você gostou da última compra e te mostrar algumas novidades.`;

  return (
    <div className="content-grid client-detail-page">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="panel client-detail-hero">
        <div className="client-detail-head">
          <div className="client-detail-title">
            <span className="avatar large">{initials(cliente.nome)}</span>
            <div>
              <span className="eyebrow">Ficha {cliente.letra_fichario || '-'}</span>
              <h2>{cliente.nome}</h2>
              <p>{cliente.telefone || 'Sem telefone'} • {cliente.cidade || 'Sem cidade'}</p>
            </div>
          </div>

          <div className="client-detail-actions">
            <button className="primary-button" type="button" onClick={() => sendWahaMessage(cliente.telefone, cobrançaMsg, 'Cobrança enviada pelo WAHA.')} disabled={whatsappSending === cobrançaMsg}>
              {whatsappSending === cobrançaMsg ? 'Enviando...' : 'Cobrar via WAHA'}
            </button>
            <button className="ghost-button" type="button" onClick={() => sendWahaMessage(cliente.telefone, posVendaMsg, 'Pós-venda enviado pelo WAHA.')} disabled={whatsappSending === posVendaMsg}>
              {whatsappSending === posVendaMsg ? 'Enviando...' : 'Pós-venda WAHA'}
            </button>
            <a className="outline-button" href={whatsappLink(cliente.telefone, cobrançaMsg)} target="_blank">Abrir WhatsApp</a>
            <Link className="outline-button" href={`/pedidos/novo?cliente=${cliente.id}`}>Nova venda</Link>
            <Link className="outline-button" href="/clientes">Voltar</Link>
          </div>
        </div>

        <div className="client-summary-grid">
          <div className="summary-card"><span>Categoria</span><strong>{cliente.categoria}</strong></div>
          <div className="summary-card"><span>Total comprado</span><strong>{formatCurrency(resumo.comprado)}</strong></div>
          <div className="summary-card"><span>A receber</span><strong>{formatCurrency(resumo.pendente)}</strong></div>
          <div className="summary-card"><span>Pago</span><strong>{formatCurrency(resumo.pago)}</strong></div>
          <div className="summary-card"><span>Aniversário</span><strong>{formatDate(cliente.aniversario)}</strong></div>
          <div className="summary-card"><span>Atrasadas</span><strong>{resumo.atrasadas.length} parcelas</strong></div>
        </div>

        <div className="client-notes-grid">
          <article className="notes-card">
            <span className="eyebrow">Observações da ficha</span>
            <p>{cliente.observacoes || 'Nenhuma observação cadastrada para esta cliente.'}</p>
          </article>
          <article className="notes-card">
            <span className="eyebrow">Últimas notas rápidas</span>
            <div className="notes-list compact-notes">
              {observacoesRecentes.length > 0 ? observacoesRecentes.map((item) => (
                <div className="note-preview" key={item.id}>
                  <strong>{item.descricao}</strong>
                  <small>{formatDate(item.data_evento)}</small>
                </div>
              )) : <p>Nenhuma nota rápida salva ainda.</p>}
            </div>
          </article>
        </div>
      </section>

      <section className="content-grid two-columns client-detail-columns">
        <article className="panel">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Compras</span>
              <h3>Histórico de compras</h3>
            </div>
          </div>
          <div className="detail-list">
            {data.vendas.length === 0 && <Notice>Nenhuma venda registrada para este cliente.</Notice>}
            {data.vendas.map((venda) => (
              <button className="detail-sale-row order-clickable detail-sale-button" key={venda.id} onClick={() => setSelectedOrder(venda)}>
                <div>
                  <strong>{orderTitle(venda)}</strong>
                  <small>{formatDate(venda.data_venda)} • {orderSubtitle(venda)} • {venda.forma_pagamento}</small>
                </div>
                <div className="detail-sale-value">
                  <strong>{formatCurrency(venda.valor_total)}</strong>
                  <small>Ver detalhes</small>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Financeiro</span>
              <h3>Parcelas</h3>
            </div>
          </div>
          <div className="detail-list">
            {data.parcelas.length === 0 && <Notice>Nenhuma parcela registrada.</Notice>}
            {data.parcelas.map((parcela) => {
              const situacao = getParcelaSituacao(parcela);
              const msg = `Oi, ${cliente.nome}! Passando para lembrar da parcela ${parcela.numero} de ${parcela.vendas?.produto_nome || 'sua compra'}, no valor de ${formatCurrency(parcela.valor)}, com vencimento em ${formatDate(parcela.vencimento)}.`;
              return (
                <div className="detail-due-row" key={parcela.id}>
                  <div className="detail-row-main">
                    <strong>Parcela {parcela.numero} • {formatCurrency(parcela.valor)}</strong>
                    <small>Vencimento: {formatDate(parcela.vencimento)}</small>
                  </div>
                  <div className="row-actions detail-row-actions">
                    <StatusPill label={situacao} tone={situacao} />
                    {parcela.status !== 'pago' && <button className="outline-button small" onClick={() => handleMarkPaid(parcela.id)}>Marcar pago</button>}
                    <button className="ghost-button small" type="button" onClick={() => sendWahaMessage(cliente.telefone, msg, 'Lembrete da parcela enviado pelo WAHA.')} disabled={whatsappSending === msg}>
                      {whatsappSending === msg ? 'Enviando...' : 'WAHA'}
                    </button>
                    <a className="outline-button small" href={whatsappLink(cliente.telefone, msg)} target="_blank">Abrir</a>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="content-grid two-columns client-detail-columns">
        <article className="panel">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Histórico</span>
              <h3>Atendimentos e observações</h3>
            </div>
          </div>
          <div className="detail-list">
            {data.historico.length === 0 && <Notice>Nenhum histórico registrado.</Notice>}
            {data.historico.map((item) => (
              <div className="detail-history-row" key={item.id}>
                <div>
                  <strong>{item.titulo}</strong>
                  <small>{formatDate(item.data_evento)} • {item.tipo}</small>
                  {item.descricao && <p>{item.descricao}</p>}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel note-panel">
          <div className="panel-header compact">
            <div>
              <span className="eyebrow">Nota rápida</span>
              <h3>Nota rápida</h3>
            </div>
          </div>
          <form className="note-form" onSubmit={handleNote}>
            <label>Observação
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex: pediu para avisar quando chegar perfume novo..." />
            </label>
            <button className="primary-button" disabled={savingNote}>{savingNote ? 'Salvando...' : 'Salvar nota rápida'}</button>
          </form>
        </article>
      </section>

      {selectedOrder && data.cliente && (
        <OrderDetailsModal
          cliente={data.cliente}
          venda={selectedOrder}
          parcelas={data.parcelas.filter((parcela) => parcela.venda_id === selectedOrder.id)}
          onClose={() => setSelectedOrder(null)}
          onMarkPaid={handleMarkPaid}
          onCancelOrder={() => reverseOrder(selectedOrder, 'cancelamento')}
          onRefundOrder={() => reverseOrder(selectedOrder, 'estorno')}
        />
      )}
    </div>
  );
}
