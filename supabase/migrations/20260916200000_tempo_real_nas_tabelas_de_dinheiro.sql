-- Dados em tempo real.
--
-- Kawa: "eu adiciono uma despesa, ela tem que automaticamente entrar na minha
-- operacao". Ate aqui a tela so via a mudanca feita na propria aba; o que outra
-- pessoa ou outra aba lancava so aparecia recarregando a pagina. As tabelas que
-- mudam os numeros do sistema passam a avisar o Realtime do Supabase, e as telas
-- abertas se recarregam sozinhas.
--
-- O Realtime respeita RLS: cada sessao so recebe aviso das linhas que ja podia
-- ler. O aviso nao carrega regra nenhuma — a tela so usa para saber que precisa
-- consultar de novo.
do $$
declare v_tabela text;
begin
    foreach v_tabela in array array[
        'despesas', 'receitas', 'contas_receber', 'ordens_servico_porto',
        'ordens_pagamento_porto', 'pagamentos_comissao', 'quilometragens'
    ] loop
        if not exists (
            select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela
        ) then
            execute format('alter publication supabase_realtime add table public.%I', v_tabela);
        end if;
    end loop;
end $$;
