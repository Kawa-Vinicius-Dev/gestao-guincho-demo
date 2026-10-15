-- OS que veio com nome de socorrista sai do Auxiliar (Kawa, 15/10/2026).
--
-- "Auxiliar e uma coisa, Jeferson e outra." O painel da Porto corta o nome em
-- 20 caracteres: "JEFERSON MARTINS DA" serve para o pai e para o filho, e a
-- importacao, sem saber qual, deixava a OS sem dono e ela caia no Auxiliar. O
-- filho esta desativado; agora o nome cortado que serve para mais de um vale
-- para o unico ativo (frontend/src/dados/porto/importacao.ts). Esta migration
-- corrige o que ja caiu no Auxiliar pela mesma regra:
--
--  * nome igual a um cadastro vale; senao, o comeco que serve para um so; se
--    servir para varios, o unico ativo. Mais de um ativo: fica no Auxiliar.
--  * OS cuja comissao do Auxiliar ja foi paga naquele ciclo nao muda: o
--    dinheiro ja saiu, e mexer ali e decisao de quem paga.
--
-- Idempotente: rodar de novo nao acha mais nada para mover.

create temporary table auxiliar_devolve as
with aux as (
    select id from public.motoristas where upper(btrim(nome)) = 'AUXILIAR'
),
nomes as (
    select m.id, m.ativo,
           regexp_replace(upper(btrim(translate(m.nome,
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
               'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))), '\s+', ' ', 'g') as chave
      from public.motoristas m
     where m.id not in (select id from aux)
),
orfas as (
    select os.id, os.motorista_id as auxiliar_id,
           regexp_replace(upper(btrim(translate(os.socorrista,
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
               'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))), '\s+', ' ', 'g') as alvo
      from public.ordens_servico_porto os
      left join public.ordens_pagamento_porto op on op.id = os.ordem_pagamento_id
     where os.motorista_id in (select id from aux)
       and length(btrim(coalesce(os.socorrista, ''))) >= 5
       and not exists (select 1 from public.pagamentos_comissao pc
                        where pc.motorista_id = os.motorista_id
                          and pc.calendario_pagamento_id = op.calendario_pagamento_id)
),
candidatos as (
    select o.id as os_id, n.id as motorista_id, n.ativo, n.chave = o.alvo as exato
      from orfas o
      join nomes n on n.chave = o.alvo or n.chave like o.alvo || '%' or o.alvo like n.chave || '%'
),
escolha as (
    select os_id,
           case when count(*) filter (where exato) = 1 then max(motorista_id) filter (where exato)
                when count(*) filter (where exato) > 1 then null
                when count(*) = 1 then max(motorista_id)
                when count(*) filter (where ativo) = 1 then max(motorista_id) filter (where ativo)
           end as motorista_id
      from candidatos
     group by os_id
)
select os_id, motorista_id from escolha where motorista_id is not null;

update public.ordens_servico_porto os set motorista_id = d.motorista_id
  from auxiliar_devolve d where os.id = d.os_id;
update public.receitas r set motorista_id = d.motorista_id
  from auxiliar_devolve d where r.ordem_servico_porto_id = d.os_id;
update public.contas_receber c set motorista_id = d.motorista_id
  from auxiliar_devolve d where c.ordem_servico_porto_id = d.os_id;

select public.porto_sincronizar_comissoes();
drop table auxiliar_devolve;
