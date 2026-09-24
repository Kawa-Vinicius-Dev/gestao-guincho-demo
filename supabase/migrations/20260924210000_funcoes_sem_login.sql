-- Fecha 6 funcoes que qualquer pessoa, sem login, conseguia chamar (Kawa, 24/09/2026).
--
-- O verificador do Supabase apontou: a chave anon vai no JavaScript do site, e
-- com ela dava para chamar estas funcoes direto pela API. A que mais importava
-- era porto_valor_esperado, que devolve a tabela de precos por servico;
-- percentual_da_comissao e km_atual_da_viatura tambem respondiam. As duas de
-- trigger nao rodam fora do gatilho, mas nao precisam do acesso.
--
-- Quem esta logado continua podendo chamar as quatro que as telas usam; os
-- gatilhos seguem disparando (a permissao so e checada ao criar o gatilho).
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

revoke execute on function public.checklist_abre_danos() from public, anon, authenticated;
revoke execute on function public.despesa_em_categoria_liberada() from public, anon, authenticated;

revoke execute on function public.km_atual_da_viatura(bigint) from public, anon;
revoke execute on function public.percentual_da_comissao(bigint, bigint) from public, anon;
revoke execute on function public.porto_valor_esperado(text, numeric) from public, anon;
revoke execute on function public.proxima_parcela(public.despesas_recorrentes) from public, anon;

grant execute on function public.km_atual_da_viatura(bigint) to authenticated;
grant execute on function public.percentual_da_comissao(bigint, bigint) to authenticated;
grant execute on function public.porto_valor_esperado(text, numeric) to authenticated;
grant execute on function public.proxima_parcela(public.despesas_recorrentes) to authenticated;
