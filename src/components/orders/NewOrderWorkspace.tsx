'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import { addMonthsISO, formatCurrency, formatDate, todayISO, whatsappLink } from '@/lib/format';
import type { Cliente, Produto } from '@/lib/types';

type SaleForm = {
  cliente_id: string;
  forma_pagamento: string;
  numero_parcelas: number;
  data_venda: string;
  primeiro_vencimento: string;
  observacoes: string;
};

type CartItem = {
  line_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  estoque: number;
  controla_estoque: boolean;
};

const MANUAL_PRODUCT_ID = '__manual__';

const defaultForm: SaleForm = {
  cliente_id: '',
  forma_pagamento: 'Parcelado',
  numero_parcelas: 3,
  data_venda: todayISO(),
  primeiro_vencimento: todayISO(),
  observacoes: ''
};

function productSaleLabel(produto: Produto) {
  const stockLabel = produto.controla_estoque === false ? 'venda livre' : `estoque ${Number(produto.estoque || 0)} un.`;
  return `${produto.nome} • ${formatCurrency(Number(produto.preco || 0))} • ${stockLabel}`;
}

export function NewOrderWorkspace() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [form, setForm] = useState<SaleForm>(defaultForm);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftProductId, setDraftProductId] = useState('');
  const [draftManualName, setDraftManualName] = useState('');
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftUnitPrice, setDraftUnitPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nextSaleNumber, setNextSaleNumber] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [clientesResult, produtosResult, vendasCountResult] = await Promise.all([
      supabase.from('clientes').select('*').eq('status', 'ativo').order('nome'),
      supabase.from('produtos').select('*').eq('status', 'ativo').order('nome'),
      supabase.from('vendas').select('id', { count: 'exact', head: true })
    ]);

    if (clientesResult.error || produtosResult.error || vendasCountResult.error) {
      setError(clientesResult.error?.message || produtosResult.error?.message || vendasCountResult.error?.message || 'Erro ao carregar dados.');
      setLoading(false);
      return;
    }

    const clientesData = (clientesResult.data || []) as Cliente[];
    const produtosData = (produtosResult.data || []) as Produto[];

    setClientes(clientesData);
    setProdutos(produtosData);
    setNextSaleNumber(Number(vendasCountResult.count || 0) + 1);

    const clienteFromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('cliente') : null;
    const selectedCliente = clienteFromUrl && clientesData.some((cliente) => cliente.id === clienteFromUrl) ? clienteFromUrl : clientesData[0]?.id || '';
    const selectedProduto = produtosData[0]?.id || MANUAL_PRODUCT_ID;

    setForm((previous) => ({
      ...previous,
      cliente_id: previous.cliente_id || selectedCliente
    }));
    setDraftProductId((current) => current || selectedProduto);
    if (produtosData[0]) setDraftUnitPrice((current) => current || Number(produtosData[0].preco || 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedProduto = useMemo(() => produtos.find((produto) => produto.id === draftProductId), [produtos, draftProductId]);
  const selectedCliente = useMemo(() => clientes.find((cliente) => cliente.id === form.cliente_id), [clientes, form.cliente_id]);
  const isManualProduct = draftProductId === MANUAL_PRODUCT_ID;
  const selectedControlsStock = !isManualProduct && selectedProduto?.controla_estoque !== false;
  const selectedStock = Number(selectedProduto?.estoque || 0);
  const selectedOutOfStock = Boolean(selectedControlsStock && selectedStock <= 0);
  const draftProductName = isManualProduct ? (draftManualName.trim() || 'Produto avulso') : (selectedProduto?.nome || 'Produto selecionado');

  useEffect(() => {
    if (selectedProduto) setDraftUnitPrice(Number(selectedProduto.preco || 0));
  }, [selectedProduto]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.valor_total || 0), 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + Number(item.quantidade || 0), 0), [cart]);
  const draftLineTotal = useMemo(() => Number((Math.max(0, Number(draftUnitPrice || 0)) * Math.max(1, Number(draftQuantity || 1))).toFixed(2)), [draftUnitPrice, draftQuantity]);
  const summaryTotal = cart.length > 0 ? cartTotal : draftLineTotal;
  const saleCode = `Venda nº ${String(nextSaleNumber).padStart(3, '0')}`;
  const summarySubtitle = selectedCliente ? `Cliente: ${selectedCliente.nome}` : 'Selecione uma cliente para registrar';
  const summaryItemCount = cart.length > 0 ? itemCount : Math.max(1, Number(draftQuantity || 1));
  const previewRows = cart.length > 0
    ? cart
    : [{
        line_id: 'draft-preview',
        produto_id: selectedProduto?.id || null,
        produto_nome: draftProductName,
        quantidade: Math.max(1, Number(draftQuantity || 1)),
        valor_unitario: Math.max(0, Number(draftUnitPrice || 0)),
        valor_total: draftLineTotal,
        estoque: Number(selectedProduto?.estoque || 0),
        controla_estoque: selectedProduto?.controla_estoque !== false
      } satisfies CartItem];

  const parcelasPreview = useMemo(() => {
    const quantidade = Math.max(1, Number(form.numero_parcelas || 1));
    const valorTotal = Number(cartTotal || 0);
    const valorBase = Number((valorTotal / quantidade).toFixed(2));
    return Array.from({ length: quantidade }, (_, index) => ({
      numero: index + 1,
      vencimento: addMonthsISO(form.primeiro_vencimento || todayISO(), index),
      valor: index + 1 === quantidade ? Number((valorTotal - valorBase * (quantidade - 1)).toFixed(2)) : valorBase
    }));
  }, [form.numero_parcelas, cartTotal, form.primeiro_vencimento]);

  const displayParcelasPreview = useMemo(() => {
    const quantidade = Math.max(1, Number(form.numero_parcelas || 1));
    const valorTotal = Number(summaryTotal || 0);
    const valorBase = Number((valorTotal / quantidade).toFixed(2));
    return Array.from({ length: quantidade }, (_, index) => ({
      numero: index + 1,
      vencimento: addMonthsISO(form.primeiro_vencimento || todayISO(), index),
      valor: index + 1 === quantidade ? Number((valorTotal - valorBase * (quantidade - 1)).toFixed(2)) : valorBase
    }));
  }, [form.numero_parcelas, summaryTotal, form.primeiro_vencimento]);

  const addItemToCart = () => {
    const quantity = Math.max(1, Number(draftQuantity || 1));
    const unitPrice = Math.max(0, Number(draftUnitPrice || 0));
    const manualName = draftManualName.trim();

    if (!selectedProduto && !isManualProduct) return;
    if (isManualProduct && !manualName) {
      setError('Informe o nome do item avulso antes de adicionar à sacola.');
      return;
    }

    if (!isManualProduct && selectedProduto?.controla_estoque !== false) {
      const availableStock = Number(selectedProduto?.estoque || 0);
      const alreadyInCart = cart
        .filter((item) => item.produto_id === selectedProduto?.id && item.controla_estoque)
        .reduce((sum, item) => sum + item.quantidade, 0);
      if (availableStock <= 0) {
        setError(`O produto "${selectedProduto?.nome}" está sem estoque. Ajuste o estoque ou use Produto avulso / sem estoque para uma venda sob encomenda.`);
        return;
      }
      if (alreadyInCart + quantity > availableStock) {
        setError(`Estoque insuficiente para "${selectedProduto?.nome}". Disponível: ${availableStock} un. Já na sacola: ${alreadyInCart} un.`);
        return;
      }
    }

    const productName = isManualProduct ? manualName : selectedProduto?.nome || 'Produto avulso';
    const productId = isManualProduct ? null : selectedProduto?.id || null;
    const controlsStock = isManualProduct ? false : selectedProduto?.controla_estoque !== false;

    setCart((current) => [
      ...current,
      {
        line_id: `${productId || 'manual'}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        produto_id: productId,
        produto_nome: productName,
        quantidade: quantity,
        valor_unitario: unitPrice,
        valor_total: Number((unitPrice * quantity).toFixed(2)),
        estoque: Number(selectedProduto?.estoque || 0),
        controla_estoque: controlsStock
      }
    ]);

    setDraftQuantity(1);
    if (!isManualProduct && selectedProduto) setDraftUnitPrice(Number(selectedProduto.preco || 0));
    if (isManualProduct) setDraftManualName('');
    setError(null);
  };

  const changeCartQuantity = (lineId: string, delta: number) => {
    setCart((current) => current.map((item) => {
      if (item.line_id !== lineId) return item;
      const product = item.produto_id ? produtos.find((produto) => produto.id === item.produto_id) : null;
      const availableStock = Number(product?.estoque || item.estoque || 0);
      const nextQuantityRaw = Math.max(1, item.quantidade + delta);
      const nextQuantity = item.controla_estoque ? Math.min(nextQuantityRaw, Math.max(1, availableStock)) : nextQuantityRaw;
      if (item.controla_estoque && nextQuantityRaw > availableStock) {
        setError(`Estoque insuficiente para "${item.produto_nome}". Disponível: ${availableStock} un.`);
      } else {
        setError(null);
      }
      return { ...item, quantidade: nextQuantity, valor_total: Number((nextQuantity * item.valor_unitario).toFixed(2)) };
    }));
  };

  const changeCartUnitPrice = (lineId: string, value: number) => {
    setCart((current) => current.map((item) => {
      if (item.line_id !== lineId) return item;
      const nextPrice = Math.max(0, Number(value || 0));
      return { ...item, valor_unitario: nextPrice, valor_total: Number((nextPrice * item.quantidade).toFixed(2)) };
    }));
  };

  const removeCartItem = (lineId: string) => setCart((current) => current.filter((item) => item.line_id !== lineId));

  const clearSale = () => {
    setCart([]);
    setForm((current) => ({ ...defaultForm, cliente_id: current.cliente_id }));
    setMessage(null);
    setError(null);
  };

  const saleMessage = useMemo(() => {
    const itensText = cart.map((item) => `${item.quantidade}x ${item.produto_nome} (${formatCurrency(item.valor_total)})`).join(', ');
    return `Oi, ${selectedCliente?.nome?.split(' ')[0] || 'tudo bem'}! Segue a confirmação da sua compra: ${itensText || 'itens selecionados'}. Total ${formatCurrency(cartTotal)} em ${form.numero_parcelas}x de ${formatCurrency(parcelasPreview[0]?.valor || 0)}. Primeiro vencimento: ${formatDate(parcelasPreview[0]?.vencimento || form.primeiro_vencimento)}.`;
  }, [cart, selectedCliente, cartTotal, form.numero_parcelas, parcelasPreview, form.primeiro_vencimento]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldSendWhatsApp = submitter?.dataset?.action === 'send-whatsapp';
    setSaving(true);
    setError(null);
    setMessage(null);

    if (cart.length === 0) {
      setSaving(false);
      setError('Adicione pelo menos um produto na venda.');
      return;
    }

    const stockProblems = Object.entries(cart.reduce<Record<string, { nome: string; quantidade: number }>>((acc, item) => {
      if (!item.controla_estoque || !item.produto_id) return acc;
      if (!acc[item.produto_id]) acc[item.produto_id] = { nome: item.produto_nome, quantidade: 0 };
      acc[item.produto_id].quantidade += item.quantidade;
      return acc;
    }, {})).map(([produtoId, item]) => {
      const product = produtos.find((produto) => produto.id === produtoId);
      const availableStock = Number(product?.estoque || 0);
      return item.quantidade > availableStock ? `${item.nome}: disponível ${availableStock} un., na venda ${item.quantidade} un.` : null;
    }).filter(Boolean);

    if (stockProblems.length > 0) {
      setSaving(false);
      setError(`Não foi possível registrar a venda por falta de estoque. ${stockProblems.join(' ')}`);
      return;
    }

    const summaryName = cart.length === 1 ? cart[0].produto_nome : `Venda com ${cart.length} itens`;

    const { data: venda, error: vendaError } = await supabase.from('vendas').insert({
      cliente_id: form.cliente_id,
      produto_id: cart.length === 1 ? cart[0].produto_id : null,
      produto_nome: summaryName,
      quantidade: itemCount,
      valor_total: cartTotal,
      forma_pagamento: form.forma_pagamento,
      numero_parcelas: Number(form.numero_parcelas || 1),
      data_venda: form.data_venda,
      primeiro_vencimento: form.primeiro_vencimento,
      observacoes: form.observacoes || null,
      status: 'aberta'
    }).select().single();

    if (vendaError || !venda) {
      setSaving(false);
      setError(vendaError?.message || 'Erro ao registrar venda.');
      return;
    }

    const itensPayload = cart.map((item) => ({
      venda_id: venda.id,
      produto_id: item.produto_id,
      produto_nome: item.produto_nome,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      valor_total: item.valor_total
    }));

    const { error: itensError } = await supabase.from('venda_itens').insert(itensPayload);
    if (itensError) {
      setSaving(false);
      setError(`${itensError.message}. Rode o SQL de migração da v5 para criar a tabela venda_itens.`);
      return;
    }

    const paymentType = form.forma_pagamento.toLowerCase();
    const canPayOnSaleDate = paymentType.includes('pix') || paymentType.includes('dinheiro');
    const parcelasPayload = parcelasPreview.map((parcela) => {
      const paidOnSaleDate = canPayOnSaleDate && parcela.vencimento === form.data_venda;
      return {
        venda_id: venda.id,
        cliente_id: form.cliente_id,
        numero: parcela.numero,
        vencimento: parcela.vencimento,
        valor: parcela.valor,
        status: paidOnSaleDate ? 'pago' : 'pendente',
        data_pagamento: paidOnSaleDate ? form.data_venda : null
      };
    });

    const { error: parcelasError } = await supabase.from('parcelas').insert(parcelasPayload);
    if (parcelasError) {
      setSaving(false);
      setError(parcelasError.message);
      return;
    }

    const quantitiesByProduct = cart.reduce<Record<string, number>>((acc, item) => {
      if (!item.controla_estoque || !item.produto_id) return acc;
      acc[item.produto_id] = (acc[item.produto_id] || 0) + item.quantidade;
      return acc;
    }, {});

    await Promise.all(Object.entries(quantitiesByProduct).map(async ([produtoId, quantity]) => {
      const product = produtos.find((produto) => produto.id === produtoId);
      const currentStock = Number(product?.estoque || 0);
      const nextStock = Math.max(0, currentStock - quantity);
      const updateResult = await supabase.from('produtos').update({ estoque: nextStock }).eq('id', produtoId);
      if (!updateResult.error) {
        await supabase.from('estoque_movimentacoes').insert({
          produto_id: produtoId,
          venda_id: venda.id,
          tipo: 'venda',
          quantidade: quantity,
          estoque_anterior: currentStock,
          estoque_novo: nextStock,
          descricao: `Venda ${saleCode}`
        });
      }
      return updateResult;
    }));

    await supabase.from('historico_cliente').insert({
      cliente_id: form.cliente_id,
      tipo: 'venda',
      titulo: 'Nova venda registrada',
      descricao: `${summaryName} • ${itemCount} itens • ${formatCurrency(cartTotal)} em ${form.numero_parcelas}x.`,
      data_evento: form.data_venda
    });

    setSaving(false);
    setMessage(shouldSendWhatsApp ? 'Venda registrada com sucesso. Abrindo WhatsApp da cliente...' : 'Venda registrada com sucesso. Você pode acompanhar ou editar no histórico de vendas.');
    if (shouldSendWhatsApp && selectedCliente?.telefone && typeof window !== 'undefined') {
      window.open(whatsappLink(selectedCliente.telefone, saleMessage), '_blank', 'noopener,noreferrer');
    }
    setCart([]);
    setForm({ ...defaultForm, cliente_id: form.cliente_id });
    await loadData();
  };

  if (loading) {
    return <div className="loading-screen">Carregando vendas...</div>;
  }

  return (
    <div className="content-grid two-columns pedidos-page separated-orders-page order-page-v2">
      <section className="panel order-editor-panel">
        {error && <Notice type="danger">{error}</Notice>}
        {message && <Notice type="success">{message} <Link href="/pedidos/historico">Ir para histórico</Link></Notice>}
        {clientes.length === 0 && !loading && <Notice>Cadastre uma cliente antes de registrar venda.</Notice>}
        {produtos.length === 0 && !loading && <Notice>Você ainda pode usar Produto avulso para vender itens sem cadastro.</Notice>}

        <form className="order-form-v2" onSubmit={handleSubmit}>
          <label className="full-span">Cliente
            <select value={form.cliente_id} onChange={(event) => setForm({ ...form, cliente_id: event.target.value })} required>
              {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
            </select>
          </label>

          <div className="order-product-card-v2 full-span">
            <label className="full-span">Produto
              <div className="product-select-wrap-v2">
                <select value={draftProductId} onChange={(event) => { const value = event.target.value; setDraftProductId(value); if (value === MANUAL_PRODUCT_ID) setDraftUnitPrice(0); }} required title={selectedProduto?.nome || 'Produto'}>
                  {produtos.map((produto) => {
                    const isUnavailable = produto.controla_estoque !== false && Number(produto.estoque || 0) <= 0;
                    return <option key={produto.id} value={produto.id} disabled={isUnavailable}>{produto.nome}{isUnavailable ? ' — sem estoque' : ''}</option>;
                  })}
                  <option value={MANUAL_PRODUCT_ID}>Produto avulso / sem estoque</option>
                </select>
                {!isManualProduct && selectedProduto && (
                  <span className={`stock-pill-v2 ${selectedOutOfStock ? 'stock-pill-danger-v2' : ''}`}>Estoque: {Number(selectedProduto.estoque || 0)} un.</span>
                )}
              </div>
              {selectedOutOfStock && (
                <small className="stock-warning-v2">Este produto está sem estoque. Para vender, adicione estoque no cadastro ou use Produto avulso / sem estoque para venda sob encomenda.</small>
              )}
            </label>

            {isManualProduct && (
              <label className="full-span">Nome do item avulso
                <input value={draftManualName} onChange={(event) => setDraftManualName(event.target.value)} placeholder="Ex: Presente importado, kit sob encomenda..." />
              </label>
            )}

            <label>Qtd.
              <div className="qty-stepper-v2">
                <button type="button" className="qty-btn-v2" onClick={() => setDraftQuantity((value) => Math.max(1, value - 1))}>−</button>
                <input type="number" min={1} value={draftQuantity} onChange={(event) => setDraftQuantity(Math.max(1, Number(event.target.value || 1)))} />
                <button type="button" className="qty-btn-v2" onClick={() => setDraftQuantity((value) => Math.max(1, value + 1))}>+</button>
              </div>
            </label>

            <label>Valor un.
              <input type="number" min={0} step="0.01" value={draftUnitPrice} onChange={(event) => setDraftUnitPrice(Math.max(0, Number(event.target.value || 0)))} />
            </label>

            <div className="line-total-card-v2">
              <span>Total do item</span>
              <strong>{formatCurrency(draftLineTotal)}</strong>
            </div>

            <button className="outline-button add-item-button-v2 full-span" type="button" onClick={addItemToCart} disabled={(!selectedProduto && !isManualProduct) || selectedOutOfStock}>
              Adicionar à sacola
            </button>
          </div>

          <div className="cart-box-v2 full-span">
            <div className="cart-box-title-v2"><span>Sacola da venda</span><strong>{cart.length} {cart.length === 1 ? 'item' : 'itens'} • {formatCurrency(cartTotal)}</strong></div>
            <div className="cart-table-head-v2">
              <span>Produto</span>
              <span>Qtd.</span>
              <span>Valor un.</span>
              <span>Total</span>
              <span></span>
            </div>

            {cart.length === 0 ? (
              <p className="empty-line-v2">Adicione um ou mais produtos para montar a venda da cliente.</p>
            ) : (
              <div className="cart-table-body-v2">
                {cart.map((item) => (
                  <div className="cart-row-v2" key={item.line_id}>
                    <strong>{item.produto_nome}</strong>
                    <div className="cart-qty-v2">
                      <button type="button" className="qty-btn-v2 small" onClick={() => changeCartQuantity(item.line_id, -1)}>−</button>
                      <span>{item.quantidade}</span>
                      <button type="button" className="qty-btn-v2 small" onClick={() => changeCartQuantity(item.line_id, 1)}>+</button>
                    </div>
                    <input className="cart-unit-input-v2" type="number" min={0} step="0.01" value={item.valor_unitario} onChange={(event) => changeCartUnitPrice(item.line_id, Number(event.target.value || 0))} />
                    <b>{formatCurrency(item.valor_total)}</b>
                    <button className="delete-row-v2" type="button" onClick={() => removeCartItem(item.line_id)} aria-label="Remover item">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label>Forma de pagamento
            <select value={form.forma_pagamento} onChange={(event) => setForm({ ...form, forma_pagamento: event.target.value })}>
              <option>Cartão de crédito</option>
              <option>Parcelado</option>
              <option>Pix</option>
              <option>Dinheiro</option>
              <option>Cartão</option>
              <option>Fiado</option>
            </select>
          </label>
          <label>Número de parcelas
            <select value={form.numero_parcelas} onChange={(event) => setForm({ ...form, numero_parcelas: Number(event.target.value) })}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((number) => <option key={number} value={number}>{number} {number === 1 ? 'parcela' : 'parcelas'}</option>)}
            </select>
          </label>
          <label>Data da venda
            <input type="date" value={form.data_venda} onChange={(event) => setForm({ ...form, data_venda: event.target.value })} />
          </label>
          <label>Primeiro vencimento
            <input type="date" value={form.primeiro_vencimento} onChange={(event) => setForm({ ...form, primeiro_vencimento: event.target.value })} />
          </label>
          <label className="full-span">Observações (opcional)
            <textarea value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} placeholder="Digite observações sobre a venda..." maxLength={300} />
          </label>
          <div className="form-actions full-span order-actions-v2">
            <div className="order-submit-actions-v2">
              <button className="primary-button order-save-button-v2" disabled={saving || clientes.length === 0 || cart.length === 0}>{saving ? 'Registrando...' : 'Registrar venda e gerar parcelas'}</button>
              <button className="whatsapp-button order-save-button-v2" data-action="send-whatsapp" disabled={saving || clientes.length === 0 || cart.length === 0}>{saving ? 'Registrando...' : 'Registrar e enviar WhatsApp'}</button>
            </div>
          </div>
        </form>
      </section>

      <section className="content-grid single-column compact-stack">
        <article className="panel sale-preview-panel sticky-panel order-summary-panel-v2">
          <div className="order-summary-hero-v2">
            <div className="order-summary-icon-v2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 7V6a6 6 0 0 1 12 0v1" /><path d="M4 7h16l-1 13H5L4 7Z" />
              </svg>
            </div>
            <div>
              <span className="order-summary-kicker-v2">Próxima venda</span>
              <h3>{saleCode}</h3>
              <p>{summarySubtitle} • {summaryItemCount} {summaryItemCount === 1 ? 'item' : 'itens'}</p>
            </div>
          </div>

          <div className="summary-table-v2">
            <h4>Itens da venda</h4>
            <div className="summary-table-head-v2">
              <span>Produto</span>
              <span>Qtd.</span>
              <span>Valor un.</span>
              <span>Total</span>
            </div>
            {previewRows.map((item) => (
              <div className="summary-table-row-v2" key={item.line_id}>
                <span>{item.produto_nome}</span>
                <span>{item.quantidade}</span>
                <span>{formatCurrency(item.valor_unitario)}</span>
                <strong>{formatCurrency(item.valor_total)}</strong>
              </div>
            ))}
          </div>

          <div className="receipt-meta-v2">
            <div className="receipt-line"><span>Valor total</span><strong>{formatCurrency(summaryTotal)}</strong></div>
            <div className="receipt-line"><span>Parcelas</span><strong>{form.numero_parcelas} parcelas de {formatCurrency(displayParcelasPreview[0]?.valor || 0)}</strong></div>
            <div className="receipt-line"><span>Próximo vencimento</span><strong>{formatDate(displayParcelasPreview[0]?.vencimento || form.primeiro_vencimento)}</strong></div>
            <div className="receipt-line"><span>Forma de pagamento</span><strong>{form.forma_pagamento}</strong></div>
          </div>

          {cart.length > 0 && selectedCliente ? (
            <a className="whatsapp-button order-whatsapp-v2" href={whatsappLink(selectedCliente.telefone, saleMessage)} target="_blank">Enviar prévia pelo WhatsApp</a>
          ) : (
            <button className="whatsapp-button order-whatsapp-v2" type="button" disabled>Adicione itens para enviar WhatsApp</button>
          )}
        </article>
      </section>
    </div>
  );

}
