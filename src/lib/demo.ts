import { supabase } from './supabase';
import { addDaysISO, addMonthsISO, todayISO } from './format';

export async function hasDemoData() {
  const { count, error } = await supabase
    .from('clientes')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return Number(count || 0) > 0;
}

export async function seedDemoData() {
  const alreadyHasData = await hasDemoData();
  if (alreadyHasData) return 'Sua conta já possui dados cadastrados.';

  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .insert([
      {
        nome: 'Camila Andrade',
        telefone: '51991522802',
        email: 'camila@email.com',
        endereco: 'Rua das Flores, 120',
        bairro: 'Centro',
        cidade: 'Sapucaia do Sul',
        aniversario: '1994-08-19',
        letra_fichario: 'C',
        categoria: 'VIP',
        status: 'ativo',
        observacoes: 'Gosta de perfumes doces e joias delicadas. Compra todo mês.'
      },
      {
        nome: 'Juliana Alves',
        telefone: '51981234567',
        email: 'juliana@email.com',
        endereco: 'Av. João Pereira, 900',
        bairro: 'Primor',
        cidade: 'Sapucaia do Sul',
        aniversario: '1988-07-12',
        letra_fichario: 'J',
        categoria: 'Regular',
        status: 'ativo',
        observacoes: 'Prefere parcelar em 3x. Boa pagadora.'
      },
      {
        nome: 'Marina Rocha',
        telefone: '51999990000',
        email: 'marina@email.com',
        endereco: 'Rua Imigrante, 45',
        bairro: 'Niterói',
        cidade: 'Canoas',
        aniversario: '1991-07-05',
        letra_fichario: 'M',
        categoria: 'Potencial',
        status: 'ativo',
        observacoes: 'Pediu aviso quando chegarem novos kits de presente.'
      },
      {
        nome: 'Taís Nunes',
        telefone: '51977775555',
        email: 'tais@email.com',
        endereco: 'Rua do Comércio, 311',
        bairro: 'São José',
        cidade: 'Esteio',
        aniversario: '1986-11-23',
        letra_fichario: 'T',
        categoria: 'VIP',
        status: 'ativo',
        observacoes: 'Cliente indicada por Camila. Gosta de semijoias douradas.'
      }
    ])
    .select();

  if (clientesError) throw clientesError;

  const { data: produtos, error: produtosError } = await supabase
    .from('produtos')
    .insert([
      { nome: 'Perfume Essencial Feminino', categoria: 'Perfumes', preco: 189.9, estoque: 12, controla_estoque: true, status: 'ativo', descricao: 'Fragrância feminina de alta saída.' },
      { nome: 'Brinco Pérola Dourado', categoria: 'Joias', preco: 79.9, estoque: 8, controla_estoque: true, status: 'ativo', descricao: 'Semijoia para presente.' },
      { nome: 'Kit Hidratante Corporal', categoria: 'Cosméticos', preco: 119.9, estoque: 15, controla_estoque: true, status: 'ativo', descricao: 'Kit com creme corporal e sabonete.' },
      { nome: 'Colar Ponto de Luz', categoria: 'Joias', preco: 99.9, estoque: 0, controla_estoque: false, status: 'ativo', descricao: 'Produto rotativo / sob encomenda, sem controle de estoque.' }
    ])
    .select();

  if (produtosError) throw produtosError;

  const clienteCamila = clientes?.find((cliente) => cliente.nome === 'Camila Andrade');
  const clienteJuliana = clientes?.find((cliente) => cliente.nome === 'Juliana Alves');
  const clienteMarina = clientes?.find((cliente) => cliente.nome === 'Marina Rocha');
  const perfume = produtos?.find((produto) => produto.nome.includes('Perfume'));
  const brinco = produtos?.find((produto) => produto.nome.includes('Brinco'));
  const kit = produtos?.find((produto) => produto.nome.includes('Kit'));

  if (!clienteCamila || !clienteJuliana || !clienteMarina || !perfume || !brinco || !kit) {
    throw new Error('Não foi possível localizar os dados demo criados.');
  }

  const vendasPayload = [
    {
      cliente_id: clienteCamila.id,
      produto_id: perfume.id,
      produto_nome: perfume.nome,
      quantidade: 1,
      valor_total: 189.9,
      forma_pagamento: '3x no cartão/fiado',
      numero_parcelas: 3,
      data_venda: todayISO(),
      primeiro_vencimento: todayISO(),
      observacoes: 'Entregue em mãos. Cliente pediu lembrete por WhatsApp.',
      status: 'aberta'
    },
    {
      cliente_id: clienteJuliana.id,
      produto_id: brinco.id,
      produto_nome: brinco.nome,
      quantidade: 1,
      valor_total: 79.9,
      forma_pagamento: '2x',
      numero_parcelas: 2,
      data_venda: addDaysISO(todayISO(), -10),
      primeiro_vencimento: addDaysISO(todayISO(), -3),
      observacoes: 'Primeira parcela em atraso.',
      status: 'aberta'
    },
    {
      cliente_id: clienteMarina.id,
      produto_id: kit.id,
      produto_nome: kit.nome,
      quantidade: 1,
      valor_total: 119.9,
      forma_pagamento: 'Pix',
      numero_parcelas: 1,
      data_venda: addDaysISO(todayISO(), -4),
      primeiro_vencimento: addDaysISO(todayISO(), 6),
      observacoes: 'Comprou para presente.',
      status: 'aberta'
    }
  ];

  const { data: vendas, error: vendasError } = await supabase
    .from('vendas')
    .insert(vendasPayload)
    .select();

  if (vendasError) throw vendasError;

  const itensPayload = vendasPayload.flatMap((venda, vendaIndex) => {
    const vendaCriada = vendas?.[vendaIndex];
    if (!vendaCriada) return [];
    return [{
      venda_id: vendaCriada.id,
      produto_id: venda.produto_id,
      produto_nome: venda.produto_nome,
      quantidade: venda.quantidade,
      valor_unitario: Number((venda.valor_total / venda.quantidade).toFixed(2)),
      valor_total: venda.valor_total
    }];
  });

  const { error: itensError } = await supabase.from('venda_itens').insert(itensPayload);
  if (itensError) throw itensError;

  const parcelasPayload = vendasPayload.flatMap((venda, vendaIndex) => {
    const vendaCriada = vendas?.[vendaIndex];
    if (!vendaCriada) return [];
    const valorBase = Number((venda.valor_total / venda.numero_parcelas).toFixed(2));
    return Array.from({ length: venda.numero_parcelas }, (_, index) => ({
      venda_id: vendaCriada.id,
      cliente_id: venda.cliente_id,
      numero: index + 1,
      vencimento: addMonthsISO(venda.primeiro_vencimento, index),
      valor: index + 1 === venda.numero_parcelas
        ? Number((venda.valor_total - valorBase * (venda.numero_parcelas - 1)).toFixed(2))
        : valorBase,
      status: (['pix', 'dinheiro'].includes(String(venda.forma_pagamento || '').toLowerCase()) && addMonthsISO(venda.primeiro_vencimento, index) === venda.data_venda) ? 'pago' : 'pendente',
      data_pagamento: (['pix', 'dinheiro'].includes(String(venda.forma_pagamento || '').toLowerCase()) && addMonthsISO(venda.primeiro_vencimento, index) === venda.data_venda) ? venda.data_venda : null
    }));
  });

  const { error: parcelasError } = await supabase.from('parcelas').insert(parcelasPayload);
  if (parcelasError) throw parcelasError;

  const { error: historicoError } = await supabase.from('historico_cliente').insert([
    { cliente_id: clienteCamila.id, tipo: 'venda', titulo: 'Venda registrada', descricao: 'Perfume Essencial em 3 parcelas.', data_evento: todayISO() },
    { cliente_id: clienteJuliana.id, tipo: 'cobranca', titulo: 'Cobrança pendente', descricao: 'Primeira parcela em atraso.', data_evento: todayISO() },
    { cliente_id: clienteMarina.id, tipo: 'pos-venda', titulo: 'Pós-venda sugerido', descricao: 'Verificar satisfação com o kit.', data_evento: todayISO() }
  ]);

  if (historicoError) throw historicoError;

  return 'Dados demo inseridos com sucesso.';
}
