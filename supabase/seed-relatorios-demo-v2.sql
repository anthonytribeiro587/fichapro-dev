-- Seed complementar para enriquecer a tela de Relatórios do FichaPro.
-- Uso: rodar no SQL Editor do Supabase.
-- O script procura o primeiro usuário em auth.users e cria dados demo vinculados a ele.

DO $$
DECLARE
  v_user_id uuid;

  c_camila uuid;
  c_juliana uuid;
  c_marina uuid;
  c_tais uuid;
  c_carla uuid;
  c_fernanda uuid;

  p_perfume uuid;
  p_brinco uuid;
  p_kit uuid;
  p_colar uuid;
  p_hidratante uuid;

  v_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado em auth.users. Crie um usuário antes de rodar a seed.';
  END IF;

  -- Clientes
  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Camila Andrade', '51991522802', 'camila@email.com', 'Rua das Flores, 120', 'Centro', 'Sapucaia do Sul', '1994-08-19', 'C', 'VIP', 'ativo', 'Compra com frequência e responde bem a lançamentos.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Camila Andrade');

  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Juliana Martins', '51981234567', 'juliana@email.com', 'Av. João Pereira, 900', 'Primor', 'Sapucaia do Sul', '1988-07-12', 'J', 'VIP', 'ativo', 'Cliente com boa recorrência e ticket alto.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Juliana Martins');

  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Marina Rocha', '51999990000', 'marina@email.com', 'Rua Imigrante, 45', 'Niterói', 'Canoas', '1991-07-05', 'M', 'Regular', 'ativo', 'Boa cliente para kits e presentes.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Marina Rocha');

  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Taís Nunes', '51977775555', 'tais@email.com', 'Rua do Comércio, 311', 'São José', 'Esteio', '1986-11-23', 'T', 'Regular', 'ativo', 'Cliente parada há mais tempo, ideal para reativação.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Taís Nunes');

  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Carla Souza', '51971112233', 'carla@email.com', 'Rua Sete, 52', 'Rio Branco', 'Canoas', '1993-03-17', 'C', 'Potencial', 'ativo', 'Cliente com pedidos abertos.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Carla Souza');

  INSERT INTO public.clientes (user_id, nome, telefone, email, endereco, bairro, cidade, aniversario, letra_fichario, categoria, status, observacoes)
  SELECT v_user_id, 'Fernanda Lima', '51973334455', 'fernanda@email.com', 'Rua da Praça, 88', 'Centro', 'Esteio', '1990-09-30', 'F', 'VIP', 'ativo', 'Maior chance de recompra nos relatórios.'
  WHERE NOT EXISTS (SELECT 1 FROM public.clientes WHERE user_id = v_user_id AND nome = 'Fernanda Lima');

  SELECT id INTO c_camila FROM public.clientes WHERE user_id = v_user_id AND nome = 'Camila Andrade' LIMIT 1;
  SELECT id INTO c_juliana FROM public.clientes WHERE user_id = v_user_id AND nome = 'Juliana Martins' LIMIT 1;
  SELECT id INTO c_marina FROM public.clientes WHERE user_id = v_user_id AND nome = 'Marina Rocha' LIMIT 1;
  SELECT id INTO c_tais FROM public.clientes WHERE user_id = v_user_id AND nome = 'Taís Nunes' LIMIT 1;
  SELECT id INTO c_carla FROM public.clientes WHERE user_id = v_user_id AND nome = 'Carla Souza' LIMIT 1;
  SELECT id INTO c_fernanda FROM public.clientes WHERE user_id = v_user_id AND nome = 'Fernanda Lima' LIMIT 1;

  -- Produtos
  INSERT INTO public.produtos (user_id, nome, categoria, preco, estoque, controla_estoque, status, descricao)
  SELECT v_user_id, 'Perfume Essencial Feminino', 'Perfumes', 189.90, 12, true, 'ativo', 'Fragrância feminina de alta saída.'
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE user_id = v_user_id AND nome = 'Perfume Essencial Feminino');

  INSERT INTO public.produtos (user_id, nome, categoria, preco, estoque, controla_estoque, status, descricao)
  SELECT v_user_id, 'Brinco Pérola Dourado', 'Joias', 79.90, 18, true, 'ativo', 'Semijoia para presente.'
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE user_id = v_user_id AND nome = 'Brinco Pérola Dourado');

  INSERT INTO public.produtos (user_id, nome, categoria, preco, estoque, controla_estoque, status, descricao)
  SELECT v_user_id, 'Kit Hidratante Corporal', 'Cosméticos', 119.90, 14, true, 'ativo', 'Kit com creme corporal e sabonete.'
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE user_id = v_user_id AND nome = 'Kit Hidratante Corporal');

  INSERT INTO public.produtos (user_id, nome, categoria, preco, estoque, controla_estoque, status, descricao)
  SELECT v_user_id, 'Colar Ponto de Luz', 'Joias', 99.90, 20, true, 'ativo', 'Colar delicado com bom giro.'
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE user_id = v_user_id AND nome = 'Colar Ponto de Luz');

  INSERT INTO public.produtos (user_id, nome, categoria, preco, estoque, controla_estoque, status, descricao)
  SELECT v_user_id, 'Hidratante Corporal', 'Hidratantes', 64.90, 22, true, 'ativo', 'Item de entrada com boa recorrência.'
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE user_id = v_user_id AND nome = 'Hidratante Corporal');

  SELECT id INTO p_perfume FROM public.produtos WHERE user_id = v_user_id AND nome = 'Perfume Essencial Feminino' LIMIT 1;
  SELECT id INTO p_brinco FROM public.produtos WHERE user_id = v_user_id AND nome = 'Brinco Pérola Dourado' LIMIT 1;
  SELECT id INTO p_kit FROM public.produtos WHERE user_id = v_user_id AND nome = 'Kit Hidratante Corporal' LIMIT 1;
  SELECT id INTO p_colar FROM public.produtos WHERE user_id = v_user_id AND nome = 'Colar Ponto de Luz' LIMIT 1;
  SELECT id INTO p_hidratante FROM public.produtos WHERE user_id = v_user_id AND nome = 'Hidratante Corporal' LIMIT 1;

  -- Fevereiro
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_juliana AND produto_nome = 'Brinco Pérola Dourado' AND data_venda = DATE '2026-02-14' AND valor_total = 159.80) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_juliana, p_brinco, 'Brinco Pérola Dourado', 2, 159.80, 'Pix', 1, '2026-02-14', '2026-02-14', 'Venda do período de fevereiro.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_brinco, 'Brinco Pérola Dourado', 2, 79.90, 159.80);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_juliana, 1, '2026-02-14', 159.80, 'pago', '2026-02-14');
  END IF;

  -- Março
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_marina AND produto_nome = 'Perfume Essencial Feminino' AND data_venda = DATE '2026-03-03' AND valor_total = 189.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_marina, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, '3x no cartão', 3, '2026-03-03', '2026-03-10', 'Venda parcelada de março.', 'aberta') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, 189.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento) VALUES
      (v_user_id, v_id, c_marina, 1, '2026-03-10', 63.30, 'pago', '2026-03-10'),
      (v_user_id, v_id, c_marina, 2, '2026-04-10', 63.30, 'pago', '2026-04-10'),
      (v_user_id, v_id, c_marina, 3, '2026-05-10', 63.30, 'pago', '2026-05-10');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_fernanda AND produto_nome = 'Kit Hidratante Corporal' AND data_venda = DATE '2026-03-28' AND valor_total = 119.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_fernanda, p_kit, 'Kit Hidratante Corporal', 1, 119.90, 'Pix', 1, '2026-03-28', '2026-03-28', 'Presente de aniversário.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_kit, 'Kit Hidratante Corporal', 1, 119.90, 119.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_fernanda, 1, '2026-03-28', 119.90, 'pago', '2026-03-28');
  END IF;

  -- Abril
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_camila AND produto_nome = 'Colar Ponto de Luz' AND data_venda = DATE '2026-04-09' AND valor_total = 199.80) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_camila, p_colar, 'Colar Ponto de Luz', 2, 199.80, '2x no cartão', 2, '2026-04-09', '2026-04-09', 'Cliente levou duas unidades.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_colar, 'Colar Ponto de Luz', 2, 99.90, 199.80);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento) VALUES
      (v_user_id, v_id, c_camila, 1, '2026-04-09', 99.90, 'pago', '2026-04-09'),
      (v_user_id, v_id, c_camila, 2, '2026-05-09', 99.90, 'pago', '2026-05-09');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_carla AND produto_nome = 'Perfume Essencial Feminino' AND data_venda = DATE '2026-04-26' AND valor_total = 189.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_carla, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, '2x no cartão', 2, '2026-04-26', '2026-05-05', 'Venda com segunda parcela em aberto.', 'aberta') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, 189.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento) VALUES
      (v_user_id, v_id, c_carla, 1, '2026-05-05', 94.95, 'pago', '2026-05-05'),
      (v_user_id, v_id, c_carla, 2, '2026-06-05', 94.95, 'pago', '2026-06-10');
  END IF;

  -- Maio
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_juliana AND produto_nome = 'Brinco Pérola Dourado' AND data_venda = DATE '2026-05-07' AND valor_total = 239.70) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_juliana, p_brinco, 'Brinco Pérola Dourado', 3, 239.70, 'Pix', 1, '2026-05-07', '2026-05-07', 'Reposição de joias.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_brinco, 'Brinco Pérola Dourado', 3, 79.90, 239.70);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_juliana, 1, '2026-05-07', 239.70, 'pago', '2026-05-07');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_tais AND produto_nome = 'Hidratante Corporal' AND data_venda = DATE '2026-05-19' AND valor_total = 129.80) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_tais, p_hidratante, 'Hidratante Corporal', 2, 129.80, 'Pix', 1, '2026-05-19', '2026-05-19', 'Venda de item de entrada.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_hidratante, 'Hidratante Corporal', 2, 64.90, 129.80);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_tais, 1, '2026-05-19', 129.80, 'pago', '2026-05-19');
  END IF;

  -- Junho
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_camila AND produto_nome = 'Perfume Essencial Feminino' AND data_venda = DATE '2026-06-08' AND valor_total = 379.80) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_camila, p_perfume, 'Perfume Essencial Feminino', 2, 379.80, '3x no cartão', 3, '2026-06-08', '2026-06-15', 'Venda com parcelas para compor o relatório.', 'aberta') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_perfume, 'Perfume Essencial Feminino', 2, 189.90, 379.80);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento) VALUES
      (v_user_id, v_id, c_camila, 1, '2026-06-15', 126.60, 'pago', '2026-06-15'),
      (v_user_id, v_id, c_camila, 2, '2026-07-15', 126.60, 'pendente', null),
      (v_user_id, v_id, c_camila, 3, '2026-08-15', 126.60, 'pendente', null);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_marina AND produto_nome = 'Kit Hidratante Corporal' AND data_venda = DATE '2026-06-21' AND valor_total = 119.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_marina, p_kit, 'Kit Hidratante Corporal', 1, 119.90, 'Pix', 1, '2026-06-21', '2026-06-21', 'Venda à vista.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_kit, 'Kit Hidratante Corporal', 1, 119.90, 119.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_marina, 1, '2026-06-21', 119.90, 'pago', '2026-06-21');
  END IF;

  -- Julho
  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_fernanda AND produto_nome = 'Brinco Pérola Dourado' AND data_venda = DATE '2026-07-09' AND valor_total = 159.80) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_fernanda, p_brinco, 'Brinco Pérola Dourado', 2, 159.80, 'Pix', 1, '2026-07-09', '2026-07-09', 'Venda rápida do mês atual.', 'quitada') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_brinco, 'Brinco Pérola Dourado', 2, 79.90, 159.80);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_fernanda, 1, '2026-07-09', 159.80, 'pago', '2026-07-09');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_carla AND produto_nome = 'Colar Ponto de Luz' AND data_venda = DATE '2026-07-05' AND valor_total = 99.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_carla, p_colar, 'Colar Ponto de Luz', 1, 99.90, 'Fiado', 1, '2026-07-05', '2026-07-20', 'Venda em aberto para alimentar cobrancas.', 'aberta') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_colar, 'Colar Ponto de Luz', 1, 99.90, 99.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento)
    VALUES (v_user_id, v_id, c_carla, 1, '2026-07-20', 99.90, 'pendente', null);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendas WHERE user_id = v_user_id AND cliente_id = c_juliana AND produto_nome = 'Perfume Essencial Feminino' AND data_venda = DATE '2026-07-12' AND valor_total = 189.90) THEN
    INSERT INTO public.vendas (user_id, cliente_id, produto_id, produto_nome, quantidade, valor_total, forma_pagamento, numero_parcelas, data_venda, primeiro_vencimento, observacoes, status)
    VALUES (v_user_id, c_juliana, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, '2x no cartão', 2, '2026-07-12', '2026-07-12', 'Cliente com maior compra no mês.', 'aberta') RETURNING id INTO v_id;
    INSERT INTO public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
    VALUES (v_user_id, v_id, p_perfume, 'Perfume Essencial Feminino', 1, 189.90, 189.90);
    INSERT INTO public.parcelas (user_id, venda_id, cliente_id, numero, vencimento, valor, status, data_pagamento) VALUES
      (v_user_id, v_id, c_juliana, 1, '2026-07-12', 94.95, 'pago', '2026-07-12'),
      (v_user_id, v_id, c_juliana, 2, '2026-08-12', 94.95, 'pendente', null);
  END IF;

  INSERT INTO public.historico_cliente (user_id, cliente_id, tipo, titulo, descricao, data_evento)
  SELECT v_user_id, c_juliana, 'venda', 'Cliente em alta', 'Juliana concentrou compras em fevereiro, maio e julho.', '2026-07-12'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.historico_cliente
    WHERE user_id = v_user_id AND cliente_id = c_juliana AND titulo = 'Cliente em alta'
  );

  INSERT INTO public.historico_cliente (user_id, cliente_id, tipo, titulo, descricao, data_evento)
  SELECT v_user_id, c_carla, 'cobranca', 'Cobrança pendente', 'Cliente com parcela em aberto de Colar Ponto de Luz.', '2026-07-20'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.historico_cliente
    WHERE user_id = v_user_id AND cliente_id = c_carla AND titulo = 'Cobrança pendente'
  );

  INSERT INTO public.historico_cliente (user_id, cliente_id, tipo, titulo, descricao, data_evento)
  SELECT v_user_id, c_fernanda, 'pos-venda', 'Recompra recomendada', 'Cliente com alta probabilidade de nova compra.', '2026-07-10'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.historico_cliente
    WHERE user_id = v_user_id AND cliente_id = c_fernanda AND titulo = 'Recompra recomendada'
  );
END $$;
