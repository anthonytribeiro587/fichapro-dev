import { StatusPill } from '@/components/StatusPill';
import { formatCurrency, formatDate, getParcelaSituacao, whatsappLink } from '@/lib/format';
import type { Cliente, Parcela, Venda, VendaItem } from '@/lib/types';

function fallbackItems(venda: Venda): VendaItem[] {
  const items = venda.venda_itens || [];
  if (items.length > 0) return items;

  const quantidade = Number(venda.quantidade || 1) || 1;
  const valorTotal = Number(venda.valor_total || 0);
  return [{
    id: `${venda.id}-fallback`,
    venda_id: venda.id,
    produto_id: venda.produto_id,
    produto_nome: venda.produto_nome || 'Produto vendido',
    quantidade,
    valor_unitario: quantidade > 0 ? valorTotal / quantidade : valorTotal,
    valor_total: valorTotal,
    created_at: venda.created_at,
    updated_at: venda.created_at
  }];
}

function buildOrderMessage(cliente: Cliente, venda: Venda, parcelas: Parcela[]) {
  const items = fallbackItems(venda);
  const itemsText = items
    .map((item) => `• ${item.quantidade}x ${item.produto_nome} — ${formatCurrency(Number(item.valor_total || 0))}`)
    .join('\n');

  const nextParcela = parcelas.find((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado');
  const dueText = nextParcela
    ? `\nPróximo vencimento: ${formatDate(nextParcela.vencimento)} — ${formatCurrency(Number(nextParcela.valor || 0))}`
    : '\nParcelas em dia.';

  return `Oi, ${cliente.nome.split(' ')[0]}! Segue o resumo da sua venda:\n\n${itemsText}\n\nTotal: ${formatCurrency(Number(venda.valor_total || 0))}\nPagamento: ${venda.numero_parcelas}x${dueText}`;
}

export function orderTitle(venda: Venda) {
  const items = fallbackItems(venda);
  return items.length > 1 ? `Venda com ${items.length} itens` : items[0]?.produto_nome || venda.produto_nome || 'Venda';
}

export function orderSubtitle(venda: Venda) {
  const items = fallbackItems(venda);
  if (items.length === 0) return `${venda.numero_parcelas}x • ${formatCurrency(Number(venda.valor_total || 0))}`;
  if (items.length === 1) return `${items[0].quantidade}x • ${formatCurrency(Number(venda.valor_total || 0))}`;

  const names = items.map((item) => item.produto_nome);
  const first = names[0];
  const second = names[1];
  const extra = items.length - 2;
  const preview = extra > 0 ? `${first} + ${second} + ${extra} item${extra > 1 ? 's' : ''}` : `${first} + ${second}`;
  return `${preview} • ${venda.numero_parcelas}x • ${formatCurrency(Number(venda.valor_total || 0))}`;
}

type OrderDetailsModalProps = {
  cliente: Cliente;
  venda: Venda;
  parcelas: Parcela[];
  onClose: () => void;
  onMarkPaid?: (parcelaId: string) => void | Promise<void>;
  onEditOrder?: () => void;
  onCancelOrder?: () => void | Promise<void>;
  onRefundOrder?: () => void | Promise<void>;
  onDeleteOrder?: () => void | Promise<void>;
};

export function OrderDetailsModal({ cliente, venda, parcelas, onClose, onMarkPaid, onEditOrder, onCancelOrder, onRefundOrder, onDeleteOrder }: OrderDetailsModalProps) {
  const items = fallbackItems(venda);
  const paid = parcelas.filter((parcela) => parcela.status === 'pago').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
  const pending = parcelas.filter((parcela) => parcela.status !== 'pago' && parcela.status !== 'cancelado').reduce((sum, parcela) => sum + Number(parcela.valor || 0), 0);
  const msg = buildOrderMessage(cliente, venda, parcelas);
  const isReversed = venda.status === 'cancelada' || venda.status === 'estornada';
  const reversedLabel = venda.status === 'estornada' ? 'estornada' : 'cancelada';
  const hasPaidParcel = paid > 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel order-modal-panel">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Detalhes da venda</span>
            <div className="modal-title-row">
              <h3>{orderTitle(venda)}</h3>
              {isReversed && <StatusPill label={reversedLabel} tone="atrasada" />}
            </div>
            <p className="modal-description">{formatDate(venda.data_venda)} • {venda.forma_pagamento} • Cliente: {cliente.nome}</p>
          </div>
          <button className="outline-button icon-button" onClick={onClose}>×</button>
        </div>

        {isReversed && (
          <div className="notice danger order-management-notice">
            Esta venda está {reversedLabel}. As parcelas foram ajustadas e o estoque pode ter sido devolvido no momento da ação.
          </div>
        )}

        <div className="order-modal-summary">
          <div><span>Total</span><strong>{formatCurrency(Number(venda.valor_total || 0))}</strong></div>
          <div><span>Pago</span><strong>{formatCurrency(paid)}</strong></div>
          <div><span>Em aberto</span><strong>{formatCurrency(pending)}</strong></div>
          <div><span>Parcelas</span><strong>{venda.numero_parcelas}x</strong></div>
        </div>

        <section className="order-modal-section order-management-box">
          <div>
            <span className="eyebrow">Gestão da venda</span>
            <h3>Ações da venda</h3>
            <p>Use essas ações quando a cliente desistir, devolver produtos ou quando precisar corrigir data, forma de pagamento e observações. Alterações de itens/valores devem ser feitas por estorno ou cancelamento e novo lançamento.</p>
          </div>
          <div className="order-management-actions">
            {onEditOrder && <button className="outline-button" onClick={onEditOrder} disabled={isReversed}>Editar dados</button>}
            {onRefundOrder && <button className="ghost-button" onClick={onRefundOrder} disabled={isReversed}>Estornar venda</button>}
            {onCancelOrder && <button className="danger-button" onClick={onCancelOrder} disabled={isReversed}>{hasPaidParcel ? 'Cancelar restante' : 'Cancelar venda'}</button>}
            {onDeleteOrder && <button className="danger-button" onClick={onDeleteOrder}>Excluir venda</button>}
          </div>
        </section>

        <section className="order-modal-section">
          <div className="panel-header compact no-margin">
            <div>
              <span className="eyebrow">Itens da venda</span>
              <h3>Produtos vendidos</h3>
            </div>
            <span className="count-badge">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="order-items-list">
            {items.map((item) => (
              <div className="order-item-row" key={item.id}>
                <div>
                  <strong>{item.produto_nome}</strong>
                  <small>{item.quantidade}x • {formatCurrency(Number(item.valor_unitario || 0))} un.</small>
                </div>
                <strong>{formatCurrency(Number(item.valor_total || 0))}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="order-modal-section">
          <div className="panel-header compact no-margin">
            <div>
              <span className="eyebrow">Financeiro</span>
              <h3>Parcelas da venda</h3>
            </div>
          </div>

          <div className="order-parcels-list">
            {parcelas.length === 0 && <p className="muted">Nenhuma parcela encontrada para esta venda.</p>}
            {parcelas.map((parcela) => {
              const situacao = getParcelaSituacao(parcela);
              const parcelaMsg = `Oi, ${cliente.nome}! Passando para lembrar da parcela ${parcela.numero} da sua compra, no valor de ${formatCurrency(parcela.valor)}, com vencimento em ${formatDate(parcela.vencimento)}.`;
              return (
                <div className="order-parcel-row" key={parcela.id}>
                  <div>
                    <strong>Parcela {parcela.numero}</strong>
                    <small>{formatDate(parcela.vencimento)} • {formatCurrency(Number(parcela.valor || 0))}</small>
                  </div>
                  <div className="row-actions order-parcel-actions">
                    <StatusPill label={situacao} tone={situacao} />
                    {onMarkPaid && parcela.status !== 'pago' && parcela.status !== 'cancelado' && !isReversed && <button className="outline-button small" onClick={() => onMarkPaid(parcela.id)}>Marcar pago</button>}
                    <a className="ghost-button small" href={whatsappLink(cliente.telefone, parcelaMsg)} target="_blank">WhatsApp</a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {venda.observacoes && (
          <section className="order-modal-section order-notes-box">
            <span className="eyebrow">Observação da venda</span>
            <p>{venda.observacoes}</p>
          </section>
        )}

        <div className="order-modal-actions">
          <a className="whatsapp-button" href={whatsappLink(cliente.telefone, msg)} target="_blank">Enviar resumo no WhatsApp</a>
          <button className="ghost-button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
