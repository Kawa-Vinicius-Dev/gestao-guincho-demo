-- Comissao do socorrista.
--
-- Nao ha tabela de "comissao": ela e sempre calculada a partir das OSs recebidas
-- no ciclo (ver rpc de comissao). O que se grava e o pagamento — o momento em que
-- o valor sai do caixa — e ele nasce amarrado a uma despesa, que e como a comissao
-- entra no resultado sem ser contada duas vezes.

create table public.pagamentos_comissao (
    id bigint generated always as identity primary key,
    motorista_id bigint not null references public.motoristas (id) on delete restrict,
    calendario_pagamento_id bigint not null
        references public.calendario_pagamentos_porto (id) on delete restrict,
    -- A despesa que representa este pagamento no financeiro. Um-para-um: e ela
    -- que faz a comissao aparecer no resultado do mes em que foi paga.
    despesa_id bigint not null unique references public.despesas (id) on delete restrict,
    valor_pago numeric(12, 2) not null,
    data_pagamento date not null,
    forma_pagamento text,
    observacoes text,
    pago_por uuid not null references public.perfis (id) on delete restrict,
    criado_em timestamptz not null default now(),
    constraint pagamentos_comissao_valor_positivo check (valor_pago > 0)
);

-- Um pagamento por socorrista por ciclo: pagar duas vezes o mesmo periodo e o
-- erro que esta tabela existe para impedir.
create unique index pagamentos_comissao_por_ciclo_unico
    on public.pagamentos_comissao (motorista_id, calendario_pagamento_id);
