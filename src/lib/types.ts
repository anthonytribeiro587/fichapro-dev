export type ClienteStatus = 'ativo' | 'inativo';
export type ClienteCategoria = 'Regular' | 'VIP' | 'Potencial' | 'Inativa';
export type ProdutoStatus = 'ativo' | 'inativo';
export type ParcelaStatus = 'pendente' | 'pago' | 'cancelado';

export type Cliente = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  aniversario: string | null;
  letra_fichario: string | null;
  categoria: ClienteCategoria;
  status: ClienteStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type Produto = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  nome: string;
  categoria: string | null;
  fornecedor?: string | null;
  foto_url?: string | null;
  quantidade_atencao?: number | null;
  preco: number;
  estoque: number;
  controla_estoque?: boolean;
  status: ProdutoStatus;
  descricao: string | null;
  created_at: string;
  updated_at: string;
};

export type VendaItem = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  venda_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  created_at: string;
  updated_at?: string;
  produtos?: Produto;
};

export type Venda = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  cliente_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  valor_total: number;
  forma_pagamento: string;
  numero_parcelas: number;
  data_venda: string;
  primeiro_vencimento: string;
  observacoes: string | null;
  status: string;
  created_at: string;
  clientes?: Cliente;
  produtos?: Produto;
  venda_itens?: VendaItem[];
};

export type Parcela = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  venda_id: string;
  cliente_id: string;
  numero: number;
  vencimento: string;
  valor: number;
  status: ParcelaStatus;
  data_pagamento: string | null;
  created_at: string;
  vendas?: Venda;
  clientes?: Cliente;
};

export type HistoricoCliente = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  cliente_id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  data_evento: string;
  created_at: string;
};
