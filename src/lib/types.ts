export type ClienteStatus = 'ativo' | 'inativo';
export type ClienteCategoria = 'Regular' | 'VIP' | 'Potencial' | 'Inativa';
export type ProdutoStatus = 'ativo' | 'inativo';
export type ParcelaStatus = 'pendente' | 'pago' | 'cancelado';

export type PerfilNegocio = 'comercio' | 'servicos' | 'recorrencia' | 'hibrido';
export type TipoItem = 'produto' | 'servico' | 'assinatura' | 'pacote' | 'encomenda';
export type TarefaTipo = 'separar_pedido' | 'entregar' | 'renovar' | 'agendar' | 'liberar_acesso' | 'pos_venda' | 'cobrar' | 'responder' | 'outra';
export type TarefaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
export type TarefaPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type AutomacaoStatus = 'rascunho' | 'ativa' | 'pausada' | 'arquivada';
export type ExecucaoStatus = 'pendente' | 'processando' | 'concluida' | 'ignorada' | 'erro';

export type ModulosEmpresa = {
  vendas: boolean;
  estoque: boolean;
  servicos: boolean;
  recorrencia: boolean;
  tarefas: boolean;
  pagamentos: boolean;
  whatsapp: boolean;
  ia: boolean;
};

export type ConfiguracoesEmpresa = {
  nome_exibicao?: string;
  cor_marca?: string;
  termo_cliente?: string;
  termo_venda?: string;
  termo_produto?: string;
  mensagem_assinatura?: string;
  [key: string]: unknown;
};

export type Empresa = {
  id: string;
  nome: string;
  plano: string;
  status: string;
  perfil_negocio?: PerfilNegocio;
  modulos?: ModulosEmpresa;
  configuracoes?: ConfiguracoesEmpresa;
  created_at?: string;
  updated_at?: string;
};

export type Cliente = {
  id: string;
  user_id?: string;
  empresa_id?: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  documento?: string | null;
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
  tipo_item?: TipoItem;
  periodicidade?: string | null;
  intervalo_dias?: number | null;
  acao_pos_pagamento?: TarefaTipo | string | null;
  prazo_recompra_dias?: number | null;
  configuracoes?: Record<string, unknown>;
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

export type Assinatura = {
  id: string;
  user_id?: string;
  empresa_id: string;
  cliente_id: string;
  item_id?: string | null;
  nome: string;
  status: 'ativa' | 'pausada' | 'vencida' | 'cancelada';
  periodicidade: string;
  intervalo_dias?: number | null;
  valor: number;
  vencimento_atual?: string | null;
  proximo_vencimento?: string | null;
  identificador_externo?: string | null;
  observacoes?: string | null;
  configuracoes?: Record<string, unknown>;
  clientes?: Pick<Cliente, 'id' | 'nome' | 'telefone'>;
};

export type CobrancaIntegrada = {
  id: string;
  user_id?: string;
  empresa_id: string;
  cliente_id: string;
  parcela_id?: string | null;
  assinatura_id?: string | null;
  provedor: string;
  id_externo?: string | null;
  chave_idempotencia: string;
  status: 'pendente' | 'pago' | 'cancelado' | 'expirado' | 'falhou';
  valor: number;
  vencimento?: string | null;
  pix_copia_cola?: string | null;
  qr_code_base64?: string | null;
  link_pagamento?: string | null;
  pago_em?: string | null;
  expira_em?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  clientes?: Pick<Cliente, 'id' | 'nome' | 'telefone' | 'email'>;
  assinaturas?: Pick<Assinatura, 'id' | 'nome' | 'proximo_vencimento'>;
};

export type TarefaOperacional = {
  id: string;
  user_id?: string;
  empresa_id: string;
  cliente_id?: string | null;
  venda_id?: string | null;
  parcela_id?: string | null;
  assinatura_id?: string | null;
  cobranca_id?: string | null;
  tipo: TarefaTipo;
  titulo: string;
  descricao?: string | null;
  status: TarefaStatus;
  prioridade: TarefaPrioridade;
  origem: string;
  data_limite?: string | null;
  responsavel_user_id?: string | null;
  metadata?: Record<string, unknown>;
  concluida_em?: string | null;
  created_at: string;
  updated_at: string;
  clientes?: Pick<Cliente, 'id' | 'nome' | 'telefone'>;
  assinaturas?: Pick<Assinatura, 'id' | 'nome' | 'proximo_vencimento'>;
};

export type Automacao = {
  id: string;
  user_id?: string;
  empresa_id: string;
  nome: string;
  descricao?: string | null;
  gatilho: string;
  canal: string;
  status: AutomacaoStatus;
  condicoes: Record<string, unknown>;
  acoes: Array<Record<string, unknown>>;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  dias_semana: number[];
  ultima_execucao_em?: string | null;
  proxima_execucao_em?: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomacaoExecucao = {
  id: string;
  empresa_id: string;
  automacao_id?: string | null;
  evento_origem: string;
  referencia_externa?: string | null;
  status: ExecucaoStatus;
  entrada: Record<string, unknown>;
  saida: Record<string, unknown>;
  erro?: string | null;
  tentativas: number;
  iniciou_em?: string | null;
  concluiu_em?: string | null;
  created_at: string;
  automacoes?: Pick<Automacao, 'id' | 'nome'>;
};

export type IntegracaoEmpresa = {
  id: string;
  empresa_id: string;
  provedor: string;
  status: 'inativa' | 'ativa' | 'erro';
  configuracao_publica: Record<string, unknown>;
  segredo_referencia?: string | null;
  ultimo_teste_em?: string | null;
  ultimo_erro?: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversaWhatsapp = {
  id: string;
  empresa_id: string;
  cliente_id?: string | null;
  telefone: string;
  nome_contato?: string | null;
  status: 'aberta' | 'aguardando_cliente' | 'aguardando_equipe' | 'resolvida' | 'arquivada';
  intencao?: string | null;
  resumo_ia?: string | null;
  ultima_mensagem_em?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  clientes?: Pick<Cliente, 'id' | 'nome' | 'telefone'>;
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
