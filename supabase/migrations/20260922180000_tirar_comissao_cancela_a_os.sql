-- Tirar a comissao de uma OS e cancelar a OS.
--
-- Kawa, 22/09/2026: "ao tirar comissao a OS se torna uma OS cancelada". Ate
-- aqui tirar a comissao deixava a OS valendo como servico — contava na producao
-- do socorrista e nos paineis — e so zerava a comissao. Agora ela vira CANCELADO,
-- que e o estado que o sistema inteiro ja sabe tratar: sai da comissao, da
-- contagem de servicos e dos paineis. A receita que a Porto ja pagou na OP
-- continua no caixa, como em qualquer OS cancelada depois de paga.
--
-- Devolver desfaz: a OS volta a situacao que tinha antes, guardada na coluna
-- nova. Uma OS que ja vinha cancelada da Porto volta cancelada.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

alter table public.ordens_servico_porto
    add column if not exists status_antes_de_tirar_comissao public.status_operacional_porto;
comment on column public.ordens_servico_porto.status_antes_de_tirar_comissao is
    'Situacao da OS antes de o administrador tirar a comissao (que a cancela). Devolver a comissao restaura.';

-- ------------------------------------------------------------------ escrita
create or replace function public.porto_definir_comissao_da_os(
    p_os_id bigint,
    p_sem_comissao boolean
)
returns public.ordens_servico_porto
language plpgsql
security definer
set search_path = ''
as $$
declare v_os public.ordens_servico_porto;
begin
    perform public.exigir_administrador();

    if coalesce(p_sem_comissao, false) then
        update public.ordens_servico_porto
           set status_antes_de_tirar_comissao = case
                   -- Tirar duas vezes nao pode gravar CANCELADO como "antes".
                   when sem_comissao then status_antes_de_tirar_comissao
                   else status_operacional end,
               sem_comissao = true,
               status_operacional = 'CANCELADO',
               atualizado_em = now()
         where id = p_os_id
        returning * into v_os;
    else
        update public.ordens_servico_porto
           set status_operacional = case
                   when sem_comissao then coalesce(status_antes_de_tirar_comissao, 'NORMAL')
                   else status_operacional end,
               status_antes_de_tirar_comissao = null,
               sem_comissao = false,
               atualizado_em = now()
         where id = p_os_id
        returning * into v_os;
    end if;

    if not found then
        raise exception 'Ordem de servico nao encontrada.' using errcode = 'no_data_found';
    end if;

    perform public.porto_sincronizar_comissoes();
    return v_os;
end;
$$;
revoke execute on function public.porto_definir_comissao_da_os(bigint, boolean) from public, anon;
grant execute on function public.porto_definir_comissao_da_os(bigint, boolean) to authenticated;

-- ------------------------------------------------------------------ importacao
-- Reimportar o arquivo da Porto nao pode "descancelar" uma OS que o
-- administrador cancelou tirando a comissao: a marca dele vale sobre o arquivo.
do $$
declare
    v_def text := pg_get_functiondef('public.porto_confirmar_importacao'::regproc);
    v_antes constant text := '                   status_operacional = case
                       when public.ordens_servico_porto.status_financeiro = ''RECEBIDO''';
    v_depois constant text := '                   status_operacional = case
                       when public.ordens_servico_porto.sem_comissao
                       then public.ordens_servico_porto.status_operacional
                       when public.ordens_servico_porto.status_financeiro = ''RECEBIDO''';
begin
    if position('ordens_servico_porto.sem_comissao' in v_def) > 0 then
        return; -- ja aplicada
    end if;
    if position(v_antes in v_def) = 0 then
        raise exception 'status do upsert nao encontrado em porto_confirmar_importacao; revisar esta migration';
    end if;
    execute replace(v_def, v_antes, v_depois);
end $$;

-- ------------------------------------------------------------------ as que ja existem
-- As OS que ja estavam sem comissao seguem a regra nova: ficam canceladas,
-- lembrando a situacao de antes para o "Devolver".
update public.ordens_servico_porto
   set status_antes_de_tirar_comissao = status_operacional,
       status_operacional = 'CANCELADO',
       atualizado_em = now()
 where sem_comissao
   and status_operacional <> 'CANCELADO'
   and status_antes_de_tirar_comissao is null;

select public.porto_sincronizar_comissoes();
