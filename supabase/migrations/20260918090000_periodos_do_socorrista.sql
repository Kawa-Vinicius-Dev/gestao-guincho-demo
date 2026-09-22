-- "Minha comissao" abria com o seletor de periodo vazio.
--
-- A lista de periodos e montada lendo as OPs, e o socorrista nao enxerga OP
-- nenhuma: o RLS de `ordens_pagamento_porto` e so do administrador, e com razao,
-- porque a OP carrega o valor pago a empresa inteira. Resultado, com a sessao
-- de um socorrista de verdade: 7 OPs com servico dele, 0 visiveis, e a tela
-- parada em "Selecione". A comissao em si funcionava — `comissao_das_ops`
-- devolvia os R$ 470,24 da quinzena de 01/09 a 16/09 —, so nao havia como
-- escolher a quinzena.
--
-- Em vez de abrir a tabela, uma RPC entrega so o que o seletor precisa: as OPs
-- em que ele tem servico — Kawa: "so mostre os servicos" —, com numero e
-- periodo, sem valor nenhum. A comissao continua dele: `comissao_das_ops` forca
-- o motorista da sessao e recusa consultar o de outro.

create or replace function public.meus_periodos_de_op()
returns table (
    id bigint, numero text,
    periodo_inicio date, periodo_fim date,
    data_pagamento_programada date,
    quinzena_inicio date, quinzena_entrega date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_motorista bigint := public.exigir_socorrista();
begin
    return query
    select op.id, op.numero, op.periodo_inicio, op.periodo_fim,
           op.data_pagamento_programada, op.quinzena_inicio, op.quinzena_entrega
      from public.ordens_pagamento_porto op
     where exists (
         select 1 from public.ordens_servico_porto os
          where os.ordem_pagamento_id = op.id
            and os.motorista_id = v_motorista
            and os.status_operacional <> 'CANCELADO')
     order by op.periodo_fim desc nulls last, op.id;
end;
$$;

revoke execute on function public.meus_periodos_de_op() from public, anon;
grant execute on function public.meus_periodos_de_op() to authenticated;
