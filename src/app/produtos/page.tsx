'use client';

import Image from 'next/image';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Notice } from '@/components/Notice';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import type { Produto, ProdutoStatus } from '@/lib/types';

type ProdutoForm = {
  nome: string;
  categoria: string;
  preco: string;
  fornecedor: string;
  estoque: string;
  controla_estoque: boolean;
  status: ProdutoStatus;
  descricao: string;
};

const emptyForm: ProdutoForm = {
  nome: '',
  categoria: 'Joias',
  preco: '0',
  fornecedor: '',
  estoque: '0',
  controla_estoque: true,
  status: 'ativo',
  descricao: ''
};

const PHOTO_STORAGE_KEY = 'fichapro_produto_fotos_v1';
const PRODUCT_PHOTOS_BUCKET = 'produto-fotos';
const STOCK_LEVELS_STORAGE_KEY = 'fichapro_produto_stock_levels_v1';
const HIDDEN_SUPPLIERS_STORAGE_KEY = 'fichapro_hidden_supplier_suggestions_v1';
const HIDDEN_CATEGORIES_STORAGE_KEY = 'fichapro_hidden_category_suggestions_v1';
const DEFAULT_SUPPLIERS = ['Natura', 'O Boticário', 'Eudora', 'H Maria', 'Importado', 'Cacau Show'];
const DEFAULT_CATEGORIES = ['Joias', 'Perfumes', 'Cosméticos', 'Roupas', 'Bolsas', 'Acessórios', 'Kits', 'Presentes'];

type ExtraFilter = 'todos' | 'ativos' | 'inativos' | 'estoque_baixo' | 'venda_livre';

type StockMovement = {
  id: string;
  tipo: 'entrada' | 'saida' | 'ajuste' | 'venda' | 'estorno';
  quantidade: number;
  estoque_anterior?: number | null;
  estoque_novo?: number | null;
  descricao?: string | null;
  data: string;
  venda_id?: string | null;
};

function formFromProduto(produto: Produto): ProdutoForm {
  return {
    nome: produto.nome,
    categoria: produto.categoria || '',
    preco: formatInputNumber(produto.preco || 0),
    fornecedor: produto.fornecedor || '',
    estoque: formatInputNumber(produto.estoque || 0, true),
    controla_estoque: produto.controla_estoque !== false,
    status: produto.status,
    descricao: produto.descricao || ''
  };
}

export default function ProdutosPage() {
  return (
    <AppShell>
      <ProdutosContent />
    </AppShell>
  );
}

function ProdutosContent() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listSort, setListSort] = useState<'recentes' | 'antigos'>('recentes');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [extraFilter, setExtraFilter] = useState<ExtraFilter>('todos');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const moreFiltersRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProdutoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const [stockLevels, setStockLevels] = useState<Record<string, number>>({});
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removeCustomPhoto, setRemoveCustomPhoto] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [hiddenSuppliers, setHiddenSuppliers] = useState<string[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [attentionDraft, setAttentionDraft] = useState('1');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(PHOTO_STORAGE_KEY);
      setPhotoOverrides(stored ? JSON.parse(stored) : {});
    } catch {
      setPhotoOverrides({});
    }

    try {
      const storedStockLevels = window.localStorage.getItem(STOCK_LEVELS_STORAGE_KEY);
      setStockLevels(storedStockLevels ? JSON.parse(storedStockLevels) : {});
    } catch {
      setStockLevels({});
    }

    try {
      const storedHiddenSuppliers = window.localStorage.getItem(HIDDEN_SUPPLIERS_STORAGE_KEY);
      setHiddenSuppliers(storedHiddenSuppliers ? JSON.parse(storedHiddenSuppliers) : []);
    } catch {
      setHiddenSuppliers([]);
    }

    try {
      const storedHiddenCategories = window.localStorage.getItem(HIDDEN_CATEGORIES_STORAGE_KEY);
      setHiddenCategories(storedHiddenCategories ? JSON.parse(storedHiddenCategories) : []);
    } catch {
      setHiddenCategories([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobileView(mobile);
      if (!mobile) setMobileDetailOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const persistPhotoOverrides = useCallback((next: Record<string, string>) => {
    setPhotoOverrides(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const persistStockLevels = useCallback((next: Record<string, number>) => {
    setStockLevels(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STOCK_LEVELS_STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const updatePhotoOverride = useCallback((produtoId: string, nextValue: string | null) => {
    const next = { ...photoOverrides };
    if (nextValue) next[produtoId] = nextValue;
    else delete next[produtoId];
    persistPhotoOverrides(next);
  }, [persistPhotoOverrides, photoOverrides]);

  const updateStockLevel = useCallback((produtoId: string, nextValue: number | null) => {
    const next = { ...stockLevels };
    if (nextValue && Number.isFinite(nextValue) && nextValue > 0) next[produtoId] = nextValue;
    else delete next[produtoId];
    persistStockLevels(next);
  }, [persistStockLevels, stockLevels]);


  const hideSupplierSuggestion = useCallback((value: string) => {
    const normalized = normalizeTextOption(value);
    if (!normalized) return;
    const next = Array.from(new Set([...hiddenSuppliers, normalized]));
    setHiddenSuppliers(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(HIDDEN_SUPPLIERS_STORAGE_KEY, JSON.stringify(next));
  }, [hiddenSuppliers]);

  const hideCategorySuggestion = useCallback((value: string) => {
    const normalized = normalizeTextOption(value);
    if (!normalized) return;
    const next = Array.from(new Set([...hiddenCategories, normalized]));
    setHiddenCategories(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(HIDDEN_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
  }, [hiddenCategories]);

  const getAttentionQuantity = useCallback((produto: Produto | null) => {
    if (!produto) return 5;
    return Math.max(1, Number(stockLevels[produto.id] || 5));
  }, [stockLevels]);

  const getStockReference = useCallback((produto: Produto | null) => {
    if (!produto) return 5;
    return Math.max(Number(produto.estoque || 0), getAttentionQuantity(produto), 5);
  }, [getAttentionQuantity]);

  const getLowStockThreshold = useCallback((produto: Produto | null) => {
    return getAttentionQuantity(produto);
  }, [getAttentionQuantity]);

  const isLowStock = useCallback((produto: Produto | null) => {
    if (!produto || produto.controla_estoque === false) return false;
    return Number(produto.estoque || 0) <= getLowStockThreshold(produto);
  }, [getLowStockThreshold]);

  const loadProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.from('produtos').select('*').order('nome');

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as Produto[];
    setProdutos(rows);
    setSelectedId((current) => current || rows[0]?.id || null);
    setLoading(false);
  }, []);

  const loadStockMovements = useCallback(async (produtoId: string | null) => {
    if (!produtoId) {
      setStockMovements([]);
      return;
    }

    setLoadingMovements(true);
    const movements: StockMovement[] = [];

    const [{ data: manualRows }, { data: saleRows }] = await Promise.all([
      supabase
        .from('estoque_movimentacoes')
        .select('id,tipo,quantidade,estoque_anterior,estoque_novo,descricao,data_movimento,venda_id')
        .eq('produto_id', produtoId)
        .order('data_movimento', { ascending: false })
        .limit(8),
      supabase
        .from('venda_itens')
        .select('id,quantidade,created_at,venda_id,vendas(id,data_venda,status)')
        .eq('produto_id', produtoId)
        .order('created_at', { ascending: false })
        .limit(8)
    ]);

    const movementSaleIds = new Set<string>();
    (manualRows || []).forEach((row: any) => {
      if (row.venda_id) movementSaleIds.add(row.venda_id);
      movements.push({
        id: `manual-${row.id}`,
        tipo: row.tipo || 'ajuste',
        quantidade: Number(row.quantidade || 0),
        estoque_anterior: row.estoque_anterior,
        estoque_novo: row.estoque_novo,
        descricao: row.descricao,
        data: row.data_movimento,
        venda_id: row.venda_id || null
      });
    });

    (saleRows || []).forEach((row: any) => {
      if (row.venda_id && movementSaleIds.has(row.venda_id)) return;
      const venda = Array.isArray(row.vendas) ? row.vendas[0] : row.vendas;
      movements.push({
        id: `sale-${row.id}`,
        tipo: venda?.status === 'estornada' ? 'estorno' : 'venda',
        quantidade: Number(row.quantidade || 0),
        descricao: venda?.status === 'estornada' ? 'Estorno de venda' : 'Venda registrada',
        data: venda?.data_venda || row.created_at,
        venda_id: row.venda_id
      });
    });

    const unique = Array.from(new Map(movements.map((item) => [item.id, item])).values())
      .sort((a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime())
      .slice(0, 6);

    setStockMovements(unique);
    setLoadingMovements(false);
  }, []);

  useEffect(() => {
    loadProdutos();
  }, [loadProdutos]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
      if (moreFiltersRef.current && !moreFiltersRef.current.contains(event.target as Node)) {
        setMoreFiltersOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categoriasProduto = useMemo(() => {
    const hidden = new Set(hiddenCategories.map((item) => item.toLowerCase()));
    const saved = produtos.map((produto) => normalizeTextOption(produto.categoria || '')).filter(Boolean);
    const uniqueSaved = Array.from(new Set(saved)).filter((item) => !hidden.has(item.toLowerCase()));
    const defaults = DEFAULT_CATEGORIES.filter((item) => !hidden.has(item.toLowerCase()) && !uniqueSaved.some((savedItem) => savedItem.toLowerCase() === item.toLowerCase()));
    return [...uniqueSaved.sort((a, b) => a.localeCompare(b)), ...defaults];
  }, [produtos, hiddenCategories]);

  const categories = useMemo(() => {
    const values = Array.from(new Set(produtos.map((produto) => produto.categoria || 'Sem categoria'))).sort((a, b) => a.localeCompare(b));
    const ordered = DEFAULT_CATEGORIES.filter((item) => values.includes(item));
    const others = values.filter((item) => !ordered.includes(item));
    return ['Todos', ...ordered, ...others].slice(0, 5);
  }, [produtos]);

  const fornecedores = useMemo(() => {
    const hidden = new Set(hiddenSuppliers.map((item) => item.toLowerCase()));
    const saved = produtos.map((produto) => normalizeTextOption(produto.fornecedor || '')).filter(Boolean);
    const uniqueSaved = Array.from(new Set(saved)).filter((item) => !hidden.has(item.toLowerCase()));
    const defaults = DEFAULT_SUPPLIERS.filter((item) => !hidden.has(item.toLowerCase()) && !uniqueSaved.some((savedItem) => savedItem.toLowerCase() === item.toLowerCase()));
    return [...uniqueSaved.sort((a, b) => a.localeCompare(b)), ...defaults];
  }, [produtos, hiddenSuppliers]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const base = produtos.filter((produto) => {
      const matchesQuery = !normalized || [
        produto.nome,
        produto.categoria,
        produto.fornecedor,
        produto.descricao,
        produto.status,
        productCode(produto)
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized);

      const category = produto.categoria || 'Sem categoria';
      const matchesCategory = selectedCategory === 'Todos' || category === selectedCategory;
      const lowStock = isLowStock(produto);
      const matchesExtra = extraFilter === 'todos'
        || (extraFilter === 'ativos' && produto.status === 'ativo')
        || (extraFilter === 'inativos' && produto.status === 'inativo')
        || (extraFilter === 'estoque_baixo' && lowStock)
        || (extraFilter === 'venda_livre' && produto.controla_estoque === false);

      return matchesQuery && matchesCategory && matchesExtra;
    });

    return [...base].sort((a, b) => {
      const aTime = new Date(a.created_at || a.updated_at || 0).getTime();
      const bTime = new Date(b.created_at || b.updated_at || 0).getTime();
      return listSort === 'recentes' ? bTime - aTime : aTime - bTime;
    });
  }, [produtos, query, selectedCategory, listSort, extraFilter, isLowStock]);

  const selectedProduto = useMemo(() => {
    return produtos.find((produto) => produto.id === selectedId) || filtered[0] || produtos[0] || null;
  }, [filtered, produtos, selectedId]);

  useEffect(() => {
    loadStockMovements(selectedProduto?.id || null);
  }, [selectedProduto?.id, loadStockMovements]);

  const summary = useMemo(() => {
    const ativos = produtos.filter((produto) => produto.status === 'ativo').length;
    const inativos = produtos.length - ativos;
    const controlados = produtos.filter((produto) => produto.controla_estoque !== false);
    const totalEstoque = controlados.reduce((sum, produto) => sum + Number(produto.estoque || 0), 0);
    const estoqueBaixo = controlados.filter((produto) => isLowStock(produto)).length;
    const vendaLivre = produtos.filter((produto) => produto.controla_estoque === false || Number(produto.estoque || 0) > 0).length;
    const sobEncomenda = produtos.filter((produto) => produto.controla_estoque === false).length;
    return { ativos, inativos, total: produtos.length, totalEstoque, estoqueBaixo, vendaLivre, sobEncomenda };
  }, [produtos, isLowStock]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPhotoPreview(null);
    setPhotoFile(null);
    setRemoveCustomPhoto(false);
    setAttentionDraft('1');
    setModalOpen(true);
    setError(null);
    setMessage(null);
  };

  const openEdit = (produto: Produto) => {
    setEditingId(produto.id);
    setForm(formFromProduto(produto));
    setPhotoPreview(photoOverrides[produto.id] || produto.foto_url || null);
    setPhotoFile(null);
    setRemoveCustomPhoto(false);
    setAttentionDraft(String(getAttentionQuantity(produto)));
    setModalOpen(true);
    setError(null);
    setMessage(null);
  };

  const handlePhotoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoPreview(reader.result);
        setPhotoFile(file);
        setRemoveCustomPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const previousProduto = editingId ? produtos.find((produto) => produto.id === editingId) : null;
    const previousStock = previousProduto ? Number(previousProduto.estoque || 0) : 0;

    const payload = {
      nome: form.nome.trim(),
      categoria: normalizeTextOption(form.categoria) || null,
      fornecedor: normalizeTextOption(form.fornecedor) || null,
      preco: parseMoneyInput(form.preco),
      estoque: form.controla_estoque ? parseIntegerInput(form.estoque) : 0,
      controla_estoque: form.controla_estoque,
      status: form.status,
      descricao: form.descricao.trim() || null
    };

    const request = editingId
      ? supabase.from('produtos').update(payload).eq('id', editingId).select().single()
      : supabase.from('produtos').insert(payload).select().single();

    const { data: savedProduto, error: saveError } = await request;
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    if (savedProduto?.id) {
      if (removeCustomPhoto) {
        updatePhotoOverride(savedProduto.id, null);
        await supabase.from('produtos').update({ foto_url: null }).eq('id', savedProduto.id);
      } else if (photoPreview) {
        const uploadedUrl = await uploadProdutoPhoto(savedProduto.id, photoPreview, photoFile);
        if (uploadedUrl) {
          await supabase.from('produtos').update({ foto_url: uploadedUrl }).eq('id', savedProduto.id);
          updatePhotoOverride(savedProduto.id, null);
        } else if (photoPreview.startsWith('data:image/')) {
          updatePhotoOverride(savedProduto.id, photoPreview);
        }
      }
      const nextAttention = parseAttentionQuantity(attentionDraft);
      updateStockLevel(savedProduto.id, nextAttention);
      updateStockLevel('__draft__', null);
    }

    const savedStock = Number(savedProduto?.estoque || payload.estoque || 0);

    if (savedProduto?.id && !editingId && savedStock > 0 && payload.controla_estoque) {
      await supabase.from('estoque_movimentacoes').insert({
        produto_id: savedProduto.id,
        tipo: 'entrada',
        quantidade: savedStock,
        estoque_anterior: 0,
        estoque_novo: savedStock,
        descricao: 'Cadastro inicial do estoque'
      });
    }

    if (savedProduto?.id && editingId && payload.controla_estoque) {
      const difference = savedStock - previousStock;
      if (difference !== 0) {
        await supabase.from('estoque_movimentacoes').insert({
          produto_id: savedProduto.id,
          tipo: difference > 0 ? 'entrada' : 'saida',
          quantidade: Math.abs(difference),
          estoque_anterior: previousStock,
          estoque_novo: savedStock,
          descricao: difference > 0 ? 'Ajuste de estoque pelo cadastro do produto' : 'Redução de estoque pelo cadastro do produto'
        });
      }
    }

    setModalOpen(false);
    setMessage(editingId ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.');
    await loadProdutos();
    if (savedProduto?.id) {
      setSelectedId(savedProduto.id);
      await loadStockMovements(savedProduto.id);
    }
  };

  const adjustStock = async (produto: Produto, delta: number) => {
    if (produto.controla_estoque === false) return;
    const nextStock = Math.max(0, Number(produto.estoque || 0) + delta);
    setAdjustingId(produto.id);
    setError(null);
    setMessage(null);

    const previousStock = Number(produto.estoque || 0);
    const { error: updateError } = await supabase.from('produtos').update({ estoque: nextStock }).eq('id', produto.id);
    setAdjustingId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.from('estoque_movimentacoes').insert({
      produto_id: produto.id,
      tipo: delta > 0 ? 'entrada' : 'saida',
      quantidade: Math.abs(delta),
      estoque_anterior: previousStock,
      estoque_novo: nextStock,
      descricao: delta > 0 ? 'Entrada manual de estoque' : 'Saída manual de estoque'
    });

    setMessage(delta > 0 ? 'Entrada de estoque registrada.' : 'Saída de estoque registrada.');
    await loadProdutos();
    await loadStockMovements(produto.id);
  };


  const deleteProduto = async (produto: Produto) => {
    const confirmText = `Excluir o produto ${produto.nome}? Se ele já tiver vendas ou movimentações, o sistema vai arquivar para manter o histórico seguro.`;
    if (!window.confirm(confirmText)) return;

    setAdjustingId(produto.id);
    setError(null);
    setMessage(null);

    const [{ count: vendasCount }, { count: movimentosCount }] = await Promise.all([
      supabase.from('venda_itens').select('id', { count: 'exact', head: true }).eq('produto_id', produto.id),
      supabase.from('estoque_movimentacoes').select('id', { count: 'exact', head: true }).eq('produto_id', produto.id)
    ]);

    const hasHistory = Number(vendasCount || 0) > 0 || Number(movimentosCount || 0) > 0;
    const result = hasHistory
      ? await supabase.from('produtos').update({ status: 'inativo' }).eq('id', produto.id)
      : await supabase.from('produtos').delete().eq('id', produto.id);

    setAdjustingId(null);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(hasHistory ? 'Produto arquivado com segurança, mantendo o histórico.' : 'Produto excluído com sucesso.');
    setSelectedId(null);
    setMobileDetailOpen(false);
    await loadProdutos();
  };

  const displayPhoto = useMemo(() => {
    if (!selectedProduto) return defaultPhotoFromForm(form);
    return selectedProduto.foto_url || photoOverrides[selectedProduto.id] || defaultPhotoForProduto(selectedProduto);
  }, [form, photoOverrides, selectedProduto]);

  const selectedReferenceStock = getStockReference(selectedProduto);
  const selectedAttentionQuantity = getAttentionQuantity(selectedProduto);
  const selectedLowStock = isLowStock(selectedProduto);
  const stockPercent = selectedProduto
    ? selectedProduto.controla_estoque === false
      ? 100
      : Math.max(10, Math.min(100, (Number(selectedProduto.estoque || 0) / Math.max(selectedReferenceStock, 1)) * 100))
    : 0;

  return (
    <div className="content-grid produtos-model-page compact-mode">
      {error && <Notice type="danger">{error}</Notice>}
      {message && <Notice type="success">{message}</Notice>}

      <section className="produtos-model-stats compact-grid">
        <article className="produtos-model-kpi compact-kpi">
          <span className="produtos-model-kpi-icon box"><KpiIcon kind="produtos" /></span>
          <div>
            <span>Produtos cadastrados</span>
            <strong>{summary.total || 0}</strong>
            <small><b className="green">Ativos: {summary.ativos}</b> <i>•</i> <b className="red">Inativos: {summary.inativos}</b></small>
          </div>
        </article>
        <article className="produtos-model-kpi compact-kpi">
          <span className="produtos-model-kpi-icon purple"><KpiIcon kind="estoque" /></span>
          <div>
            <span>Estoque total</span>
            <strong>{summary.totalEstoque} un.</strong>
            <small>Valor previsto em estoque: {formatCurrency(produtos.reduce((s, p) => s + Number(p.preco || 0) * Number(p.estoque || 0), 0))}</small>
          </div>
        </article>
        <article className="produtos-model-kpi compact-kpi">
          <span className="produtos-model-kpi-icon warning"><KpiIcon kind="alerta" /></span>
          <div>
            <span>Estoque baixo</span>
            <strong>{summary.estoqueBaixo} produtos</strong>
            <small>Requer atenção</small>
          </div>
        </article>
        <article className="produtos-model-kpi compact-kpi">
          <span className="produtos-model-kpi-icon green"><KpiIcon kind="carrinho" /></span>
          <div>
            <span>Venda livre / sob encomenda</span>
            <strong>{summary.vendaLivre} / {summary.sobEncomenda}</strong>
            <small>{summary.total ? Math.round((summary.vendaLivre / summary.total) * 100) : 0}% venda livre</small>
          </div>
        </article>
      </section>

      <section className="produtos-model-filters compact-filters">
        <label className="produtos-model-search compact-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por produto ou código..." />
        </label>

        <div className="produtos-model-chips compact-chips">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={selectedCategory === category ? 'active' : ''}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
          <div className="produto-more-box" ref={moreFiltersRef}>
            <button type="button" className={`more ${moreFiltersOpen ? 'open' : ''}`} onClick={() => setMoreFiltersOpen((prev) => !prev)}><FilterIcon /> Mais filtros</button>
            {moreFiltersOpen && (
              <div className="produto-more-menu">
                <button type="button" className={extraFilter === 'todos' ? 'active' : ''} onClick={() => { setExtraFilter('todos'); setMoreFiltersOpen(false); }}>Todos os produtos</button>
                <button type="button" className={extraFilter === 'ativos' ? 'active' : ''} onClick={() => { setExtraFilter('ativos'); setMoreFiltersOpen(false); }}>Somente ativos</button>
                <button type="button" className={extraFilter === 'inativos' ? 'active' : ''} onClick={() => { setExtraFilter('inativos'); setMoreFiltersOpen(false); }}>Somente inativos</button>
                <button type="button" className={extraFilter === 'estoque_baixo' ? 'active' : ''} onClick={() => { setExtraFilter('estoque_baixo'); setMoreFiltersOpen(false); }}>Estoque baixo</button>
                <button type="button" className={extraFilter === 'venda_livre' ? 'active' : ''} onClick={() => { setExtraFilter('venda_livre'); setMoreFiltersOpen(false); }}>Venda livre / sob encomenda</button>
              </div>
            )}
          </div>
        </div>

        <button className="primary-button produtos-model-new compact-button" onClick={openNew}>＋ Novo produto</button>
      </section>

      {loading && <Notice>Carregando produtos...</Notice>}
      {!loading && filtered.length === 0 && <Notice>Nenhum produto encontrado.</Notice>}

      {!loading && selectedProduto && (
        <section className="produtos-model-main compact-main">
          <article className="produtos-model-list-panel compact-panel">
            <header>
              <h3>Lista de produtos</h3>
              <div className="produto-sort-box" ref={sortMenuRef}>
                <button className="produto-sort-trigger" type="button" onClick={() => setSortMenuOpen((prev) => !prev)}>
                  <strong>{listSort === 'recentes' ? 'Mais recentes' : 'Mais antigos'}</strong>
                  <span className={`produto-sort-arrow ${sortMenuOpen ? 'open' : ''}`}><ChevronDownIcon /></span>
                </button>
                {sortMenuOpen && (
                  <div className="produto-sort-menu">
                    <button type="button" className={listSort === 'recentes' ? 'active' : ''} onClick={() => { setListSort('recentes'); setSortMenuOpen(false); }}>Mais recentes</button>
                    <button type="button" className={listSort === 'antigos' ? 'active' : ''} onClick={() => { setListSort('antigos'); setSortMenuOpen(false); }}>Mais antigos</button>
                  </div>
                )}
              </div>
            </header>

            <div className="produtos-model-list compact-list">
              {filtered.map((produto) => {
                const isSelected = selectedProduto?.id === produto.id;
                const lowStock = isLowStock(produto);
                return (
                  <button
                    key={produto.id}
                    type="button"
                    className={`produto-model-row compact-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedId(produto.id);
                      if (isMobileView) setMobileDetailOpen(true);
                    }}
                  >
                    <span className="produto-model-row-icon"><ProductCategoryIcon category={produto.categoria || produto.nome} /></span>
                    <span className="produto-model-row-copy">
                      <strong>{produto.nome}</strong>
                      <small>{produto.categoria || 'Sem categoria'} <i>•</i> Código: {productCode(produto)}</small>
                    </span>
                    <span className="produto-model-row-stock">
                      <b className={lowStock ? 'low' : 'ok'}>{lowStock ? 'Estoque baixo' : produto.status === 'ativo' ? 'Ativo' : 'Inativo'}</b>
                      <small>{produto.controla_estoque === false ? 'Livre' : `${produto.estoque} un.`}</small>
                    </span>
                    <span className="produto-model-row-price">{formatCurrency(produto.preco)}</span>
                    <span className="produto-model-row-arrow">›</span>
                  </button>
                );
              })}
            </div>

            <button className="produtos-model-load" type="button">Carregar mais produtos <span className="load-chevron"><ChevronDownIcon /></span></button>
          </article>

          <div className="produtos-model-detail-stack compact-stack produtos-desktop-detail-stack">
            <article className="produtos-model-detail compact-detail">
              <div className="produto-model-photo compact-photo">
                <Image src={displayPhoto} alt="Produto selecionado" width={320} height={320} />
                <button type="button" className="produto-model-photo-edit" onClick={() => openEdit(selectedProduto)} aria-label="Alterar foto"><ImageEditIcon /></button>
              </div>

              <div className="produto-model-info compact-info">
                <header>
                  <div>
                    <h3>{selectedProduto.nome}</h3>
                    <p>{selectedProduto.categoria || 'Sem categoria'} <i>•</i> Código: {productCode(selectedProduto)}</p>
                  </div>
                  <div className="produto-model-info-actions">
                    <span className={`produto-v2-badge ${selectedProduto.status === 'ativo' ? 'active' : 'inactive'}`}>{selectedProduto.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </header>

                <div className="produto-model-info-grid compact-info-grid">
                  <div><span>Preço de venda</span><strong>{formatCurrency(selectedProduto.preco)}</strong></div>
                  <div><span>Fornecedor</span><strong>{selectedProduto.fornecedor || 'Não informado'}</strong></div>
                  <div><span>Estoque atual</span><strong className={selectedLowStock ? 'orange' : ''}>{selectedProduto.controla_estoque === false ? 'Não controla estoque' : `${selectedProduto.estoque} unidades`}</strong></div>
                  {selectedProduto.controla_estoque !== false && <div><span>Qtd. de atenção</span><strong>{selectedAttentionQuantity} unidades</strong></div>}
                  <div><span>Tipo de venda</span><strong>{selectedProduto.controla_estoque === false ? 'Venda livre / sob encomenda' : 'Venda com estoque'}</strong></div>
                </div>

                {selectedProduto.controla_estoque !== false && (
                  <div className="produto-model-stock-card compact-stock-card">
                    <div className="produto-model-stock-head">
                      <strong>Nível de estoque ⓘ</strong>
                    </div>
                    <div className="produto-model-stock-line compact-stock-line">
                      <span><i style={{ width: `${stockPercent}%` }} /></span>
                      <small>{`${selectedProduto.estoque} de ${selectedReferenceStock} un.`}</small>
                      <b>{selectedLowStock ? 'Estoque baixo' : 'Ativo'}</b>
                    </div>
                  </div>
                )}
                {selectedProduto.controla_estoque === false && (
                  <div className="produto-model-stock-card compact-stock-card free-sale-card">
                    <div className="produto-model-stock-head">
                      <strong>Venda livre / sob encomenda</strong>
                    </div>
                    <p>Este produto pode ser vendido sem controlar quantidade em estoque.</p>
                  </div>
                )}

                <div className="produto-model-description compact-description">
                  <span>Descrição</span>
                  <p>{selectedProduto.descricao || `${selectedProduto.nome} com cadastro ativo para venda. Produto pronto para vendas, controle de estoque e reposição rápida.`}</p>
                </div>

                <div className="produto-model-detail-buttons compact-detail-buttons">
                  <button className="edit" type="button" onClick={() => openEdit(selectedProduto)}><EditIcon /> Editar produto</button>
                  <button className="ghost" type="button" onClick={() => openEdit(selectedProduto)}><ImageEditIcon /> Alterar foto</button>
                  {selectedProduto.controla_estoque !== false && (<>
                    <button className="add" type="button" disabled={adjustingId === selectedProduto.id} onClick={() => adjustStock(selectedProduto, 1)}><PlusIcon /> 1 estoque</button>
                    <button className="remove" type="button" disabled={adjustingId === selectedProduto.id || Number(selectedProduto.estoque || 0) <= 0} onClick={() => adjustStock(selectedProduto, -1)}><MinusIcon /> 1 estoque</button>
                  </>) }
                  <button className="remove" type="button" disabled={adjustingId === selectedProduto.id} onClick={() => deleteProduto(selectedProduto)}>Excluir produto</button>
                </div>
              </div>
            </article>

            <article className="produtos-model-movements compact-movements">
              <header>
                <h3>Movimentações recentes</h3>
                <button type="button">Ver todas</button>
              </header>
              {loadingMovements && <div className="produto-model-movement-row empty"><span>Carregando...</span><span>Buscando movimentações do produto.</span><span></span><b></b></div>}
              {!loadingMovements && stockMovements.length === 0 && (
                <div className="produto-model-movement-row empty">
                  <span>Sem movimentações ainda</span><span>Entradas, saídas e vendas aparecerão aqui.</span><span></span><b></b>
                </div>
              )}
              {!loadingMovements && stockMovements.map((movement) => (
                <div className="produto-model-movement-row" key={movement.id}>
                  <span>{formatDateOnly(movement.data)}</span>
                  <span>{movementLabel(movement)}</span>
                  <span>{movement.descricao || movementDescription(movement)}</span>
                  <b className={movement.tipo === 'entrada' || movement.tipo === 'estorno' ? 'green' : movement.tipo === 'saida' || movement.tipo === 'venda' ? 'red' : ''}>{movementSign(movement)}</b>
                </div>
              ))}
            </article>
          </div>
        </section>
      )}

      {isMobileView && mobileDetailOpen && selectedProduto && (
        <div className="modal-backdrop mobile-detail-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel mobile-detail-panel product-mobile-detail-panel">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Produto</span>
                <h3>Detalhes do produto</h3>
              </div>
              <button className="outline-button icon-button" type="button" onClick={() => setMobileDetailOpen(false)}>×</button>
            </div>

            <article className="produtos-model-detail compact-detail mobile-product-detail-card">
              <div className="produto-model-photo compact-photo">
                <Image src={displayPhoto} alt="Produto selecionado" width={320} height={320} />
                <button type="button" className="produto-model-photo-edit" onClick={() => openEdit(selectedProduto)} aria-label="Alterar foto"><ImageEditIcon /></button>
              </div>

              <div className="produto-model-info compact-info">
                <header>
                  <div>
                    <h3>{selectedProduto.nome}</h3>
                    <p>{selectedProduto.categoria || 'Sem categoria'} <i>•</i> Código: {productCode(selectedProduto)}</p>
                  </div>
                  <div className="produto-model-info-actions">
                    <span className={`produto-v2-badge ${selectedProduto.status === 'ativo' ? 'active' : 'inactive'}`}>{selectedProduto.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </header>

                <div className="produto-model-info-grid compact-info-grid">
                  <div><span>Preço de venda</span><strong>{formatCurrency(selectedProduto.preco)}</strong></div>
                  <div><span>Fornecedor</span><strong>{selectedProduto.fornecedor || 'Não informado'}</strong></div>
                  <div><span>Estoque atual</span><strong className={selectedLowStock ? 'orange' : ''}>{selectedProduto.controla_estoque === false ? 'Não controla estoque' : `${selectedProduto.estoque} unidades`}</strong></div>
                  {selectedProduto.controla_estoque !== false && <div><span>Qtd. de atenção</span><strong>{selectedAttentionQuantity} unidades</strong></div>}
                  <div><span>Tipo de venda</span><strong>{selectedProduto.controla_estoque === false ? 'Venda livre / sob encomenda' : 'Venda com estoque'}</strong></div>
                </div>

                {selectedProduto.controla_estoque !== false && (
                  <div className="produto-model-stock-card compact-stock-card">
                    <div className="produto-model-stock-head">
                      <strong>Nível de estoque ⓘ</strong>
                    </div>
                    <div className="produto-model-stock-line compact-stock-line">
                      <span><i style={{ width: `${stockPercent}%` }} /></span>
                      <small>{`${selectedProduto.estoque} de ${selectedReferenceStock} un.`}</small>
                      <b>{selectedLowStock ? 'Estoque baixo' : 'Ativo'}</b>
                    </div>
                  </div>
                )}
                {selectedProduto.controla_estoque === false && (
                  <div className="produto-model-stock-card compact-stock-card free-sale-card">
                    <div className="produto-model-stock-head">
                      <strong>Venda livre / sob encomenda</strong>
                    </div>
                    <p>Este produto pode ser vendido sem controlar quantidade em estoque.</p>
                  </div>
                )}

                <div className="produto-model-description compact-description">
                  <span>Descrição</span>
                  <p>{selectedProduto.descricao || `${selectedProduto.nome} com cadastro ativo para venda. Produto pronto para vendas, controle de estoque e reposição rápida.`}</p>
                </div>

                <div className="produto-model-detail-buttons compact-detail-buttons">
                  <button className="edit" type="button" onClick={() => openEdit(selectedProduto)}><EditIcon /> Editar produto</button>
                  <button className="ghost" type="button" onClick={() => openEdit(selectedProduto)}><ImageEditIcon /> Alterar foto</button>
                  {selectedProduto.controla_estoque !== false && (<>
                    <button className="add" type="button" disabled={adjustingId === selectedProduto.id} onClick={() => adjustStock(selectedProduto, 1)}><PlusIcon /> 1 estoque</button>
                    <button className="remove" type="button" disabled={adjustingId === selectedProduto.id || Number(selectedProduto.estoque || 0) <= 0} onClick={() => adjustStock(selectedProduto, -1)}><MinusIcon /> 1 estoque</button>
                  </>) }
                  <button className="remove" type="button" disabled={adjustingId === selectedProduto.id} onClick={() => deleteProduto(selectedProduto)}>Excluir produto</button>
                </div>
              </div>
            </article>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel compact">
            <div className="modal-head">
              <div>
                <span className="eyebrow">{editingId ? 'Edição' : 'Cadastro'}</span>
                <h3>{editingId ? 'Editar produto' : 'Novo produto'}</h3>
              </div>
              <button className="outline-button icon-button" onClick={() => { setModalOpen(false); setAttentionDraft('1'); }}>×</button>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="full-span">Nome do produto
                <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} required />
              </label>
              <label>Categoria
                <input value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} placeholder="Ex.: Joias, Perfumes, Kits..." />
                <SuggestionChips
                  options={categoriasProduto}
                  currentValue={form.categoria}
                  onSelect={(categoria) => setForm({ ...form, categoria })}
                  onRemove={hideCategorySuggestion}
                />
                <small className="field-help">Digite ou escolha uma categoria da lista. Use o × para remover uma sugestão da lista.</small>
              </label>
              <label>Fornecedor
                <input value={form.fornecedor} onChange={(event) => setForm({ ...form, fornecedor: event.target.value })} placeholder="Ex.: Natura, Boticário, H Maria..." />
                <SuggestionChips
                  options={fornecedores}
                  currentValue={form.fornecedor}
                  onSelect={(fornecedor) => setForm({ ...form, fornecedor })}
                  onRemove={hideSupplierSuggestion}
                />
                <small className="field-help">Ao salvar um fornecedor novo, ele entra nas próximas sugestões. Use o × para remover uma sugestão da lista.</small>
              </label>
              <label>Preço
                <input type="text" inputMode="decimal" value={form.preco} onChange={(event) => setForm({ ...form, preco: sanitizeDecimalInput(event.target.value) })} onBlur={() => setForm((current) => ({ ...current, preco: formatInputNumber(parseMoneyInput(current.preco)) }))} />
              </label>
              <label>Controle de estoque
                <select value={form.controla_estoque ? 'sim' : 'nao'} onChange={(event) => { const controla = event.target.value === 'sim'; setForm({ ...form, controla_estoque: controla, estoque: controla ? form.estoque : '0' }); }}>
                  <option value="sim">Controlar estoque</option>
                  <option value="nao">Venda livre / sob encomenda</option>
                </select>
              </label>
              {form.controla_estoque && (<>
                <label>Estoque
                  <input type="text" inputMode="numeric" value={form.estoque} onChange={(event) => setForm({ ...form, estoque: sanitizeIntegerInput(event.target.value) })} onBlur={() => setForm((current) => ({ ...current, estoque: String(parseIntegerInput(current.estoque)) }))} />
                </label>
                <label>Qtd. de atenção
                  <input type="text" inputMode="numeric" value={attentionDraft} onChange={(event) => setAttentionDraft(sanitizeIntegerInput(event.target.value))} onBlur={() => setAttentionDraft((current) => String(parseAttentionQuantity(current)))} />
                  <small style={{ marginTop: 6, color: '#7d685d', display: 'block' }}>Quando o estoque chegar nessa quantidade ou abaixo dela, o sistema mostra o alerta de estoque baixo.</small>
                </label>
              </>)}
              {!form.controla_estoque && (
                <div className="full-span produto-free-sale-note">
                  <strong>Venda livre / sob encomenda</strong>
                  <span>Esse produto não usa estoque. Ele aparece nas vendas, mas não gera entrada, saída nem alerta de estoque baixo.</span>
                </div>
              )}
              <label>Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProdutoStatus })}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
              <label className="full-span">Descrição
                <textarea value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Observações, fragrância, acabamento, tamanho, cor..." />
              </label>

              <div className="full-span produto-foto-field">
                <span>Foto do produto</span>
                <div className="produto-foto-editor">
                  <div className="produto-foto-preview">
                    <Image src={photoPreview || defaultPhotoFromForm(form)} alt="Prévia da foto" width={120} height={120} />
                  </div>
                  <div className="produto-foto-actions">
                    <label className="ghost-button file-like-button">
                      Escolher foto
                      <input type="file" accept="image/*" onChange={handlePhotoFile} hidden />
                    </label>
                    <button type="button" className="ghost-button" onClick={() => { setPhotoPreview(null); setPhotoFile(null); setRemoveCustomPhoto(true); }}>
                      Usar foto padrão
                    </button>
                    <small>Se nenhuma foto for enviada, o sistema usa uma imagem padrão conforme o tipo do produto.</small>
                  </div>
                </div>
              </div>

              <div className="form-actions full-span">
                <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar edição' : 'Salvar produto'}</button>
                <button className="ghost-button" type="button" onClick={() => { setModalOpen(false); setAttentionDraft('1'); }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



async function uploadProdutoPhoto(produtoId: string, preview: string, file: File | null) {
  try {
    const source = file || dataUrlToFile(preview, `produto-${produtoId}.png`);
    if (!source) return null;

    const extension = source.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const safeExtension = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension) ? extension : 'png';
    const path = `${produtoId}/${Date.now()}.${safeExtension}`;

    const { error } = await supabase.storage
      .from(PRODUCT_PHOTOS_BUCKET)
      .upload(path, source, { upsert: true, contentType: source.type || 'image/png' });

    if (error) {
      console.error('Erro ao enviar foto do produto:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(PRODUCT_PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  } catch (error) {
    console.error('Erro ao processar foto do produto:', error);
    return null;
  }
}

function dataUrlToFile(dataUrl: string, filename: string) {
  if (!dataUrl.startsWith('data:image/')) return null;
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) return null;
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function formatDateOnly(value: string) {
  if (!value) return '-';
  const [date] = value.split('T');
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function movementLabel(movement: StockMovement) {
  if (movement.tipo === 'entrada') return 'Entrada de estoque';
  if (movement.tipo === 'saida') return 'Saída de estoque';
  if (movement.tipo === 'venda') return 'Venda realizada';
  if (movement.tipo === 'estorno') return 'Estorno de venda';
  return 'Ajuste de estoque';
}

function movementDescription(movement: StockMovement) {
  if (typeof movement.estoque_anterior === 'number' && typeof movement.estoque_novo === 'number') {
    return `${movement.estoque_anterior} → ${movement.estoque_novo} un.`;
  }
  return movement.venda_id ? 'Movimentação vinculada à venda' : 'Movimentação manual';
}

function movementSign(movement: StockMovement) {
  const quantity = Math.abs(Number(movement.quantidade || 0));
  if (movement.tipo === 'entrada' || movement.tipo === 'estorno') return `+${quantity} un.`;
  if (movement.tipo === 'saida' || movement.tipo === 'venda') return `-${quantity} un.`;
  return `${quantity} un.`;
}

function KpiIcon({ kind }: { kind: 'produtos' | 'estoque' | 'alerta' | 'carrinho' }) {
  if (kind === 'produtos') return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 4l8 3.5-8 3.5L4 7.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M4 7.5V16.5L12 20l8-3.5V7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
  );
  if (kind === 'estoque') return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 7v10l-7 4-7-4V7l7-4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M5 8l7 4 7-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
  );
  if (kind === 'alerta') return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 19H3L12 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M12 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.8" fill="currentColor"/><circle cx="17" cy="20" r="1.8" fill="currentColor"/><path d="M4 5h2l2.2 9h9.7l1.6-6.5H7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}

function ProductCategoryIcon({ category }: { category: string }) {
  const text = category.toLowerCase();
  if (text.includes('perfume')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v3H9zM8 7h8l2 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-7l2-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M15 5c1.7 0 3 1.3 3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (text.includes('colar')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6c0 4 1.7 6.7 4 9 2.3-2.3 4-5 4-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="18" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
  if (text.includes('hidratante') || text.includes('cosm')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M10 4v3m4-3v3M8 7h8l1 3v7a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-7l1-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>;
  if (text.includes('kit')) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm0 0 3-4h10l3 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c3 0 5 2.1 5 5.2 0 4.1-2.4 6.2-5 8.8-2.6-2.6-5-4.7-5-8.8C7 7.1 9 5 12 5Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function FilterIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
function ChevronDownIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function SuggestionChips({ options, currentValue, onSelect, onRemove }: { options: string[]; currentValue: string; onSelect: (value: string) => void; onRemove?: (value: string) => void }) {
  const normalized = currentValue.trim().toLowerCase();
  const exactMatch = options.some((option) => option.toLowerCase() === normalized);
  const visible = options
    .filter(Boolean)
    .filter((option) => exactMatch || !normalized || option.toLowerCase().includes(normalized))
    .slice(0, 12);

  if (!visible.length) {
    return null;
  }

  return (
    <div className="product-suggestion-chips" aria-label="Sugestões">
      {visible.map((option) => (
        <span key={option} className={`product-suggestion-chip ${option.toLowerCase() === normalized ? 'selected' : ''}`}>
          <button type="button" className="chip-main" onClick={() => onSelect(option)}>{option}</button>
          {onRemove && (
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remover ${option} das sugestões`}
              title="Remover sugestão"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(option);
              }}
            >×</button>
          )}
        </span>
      ))}
    </div>
  );
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="m12.5 7.5 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
function ImageEditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><path d="m8 16 3-3 2.2 2.2L16 12l2 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
function MinusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function productCode(produto: Produto) {
  const prefix = (produto.categoria || produto.nome || 'P').slice(0, 1).toUpperCase();
  const digits = produto.id?.replace(/\D/g, '').slice(0, 3) || '';
  const fallback = Math.abs(produto.nome.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)).toString().slice(0, 3);
  return `${prefix}${(digits || fallback).padStart(3, '0')}`;
}


function sanitizeDecimalInput(value: string) {
  let clean = value.replace(/[^0-9,.]/g, '');
  const commaIndex = clean.indexOf(',');
  const dotIndex = clean.indexOf('.');
  const separatorIndex = commaIndex >= 0 && dotIndex >= 0 ? Math.min(commaIndex, dotIndex) : Math.max(commaIndex, dotIndex);
  if (separatorIndex >= 0) {
    const intPart = clean.slice(0, separatorIndex).replace(/[,.]/g, '');
    const decimalPart = clean.slice(separatorIndex + 1).replace(/[,.]/g, '').slice(0, 2);
    clean = `${intPart}${clean[separatorIndex]}${decimalPart}`;
  }
  return clean;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/\D/g, '');
}

function parseMoneyInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function parseIntegerInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/\D/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function formatInputNumber(value: string | number | null | undefined, integer = false) {
  if (integer) return String(parseIntegerInput(value));
  const parsed = parseMoneyInput(value);
  return Number.isInteger(parsed) ? String(parsed) : String(parsed).replace('.', ',');
}

function normalizeTextOption(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean
    .split(' ')
    .map((part) => {
      const lower = part.toLowerCase();
      if (['da', 'de', 'do', 'das', 'dos', 'e'].includes(lower)) return lower;
      if (part.length <= 3 && part === part.toUpperCase()) return part;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}


function parseAttentionQuantity(value: string | number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function defaultPhotoFromForm(form: ProdutoForm) {
  return defaultPhotoByNameAndCategory(form.nome, form.categoria);
}

function defaultPhotoForProduto(produto: Produto) {
  return defaultPhotoByNameAndCategory(produto.nome, produto.categoria || '');
}

function defaultPhotoByNameAndCategory(nome: string, categoria: string) {
  const text = `${nome} ${categoria}`.toLowerCase();
  if (text.includes('brinco')) return '/assets/produtos/brinco-perola.png';
  if (text.includes('colar')) return '/assets/produtos/colar-ponto-luz.png';
  if (text.includes('perfume')) return '/assets/produtos/perfume-essencial.png';
  if (text.includes('hidratante') || text.includes('cosmético') || text.includes('cosmetico') || text.includes('kit')) return '/assets/produtos/hidratante-kit.png';
  if (text.includes('joia')) return '/assets/produtos/brinco-perola.png';
  return '/assets/produtos/brinco-perola.png';
}
