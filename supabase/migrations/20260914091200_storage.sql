-- Storage: comprovantes de despesa e arquivos de importacao da Porto.
--
-- O bucket ja existia e ja era privado; o que muda e quem assina. Antes o backend
-- segurava a service_role e intermediava cada upload e cada leitura. Agora o
-- browser fala direto com o Storage usando a anon key + JWT, e quem decide o que
-- ele alcanca sao as policies abaixo.
--
-- Convencao de caminho — as policies dependem dela:
--   despesas/<id_da_despesa>/<arquivo>     comprovante
--   porto/<id_da_importacao>/<arquivo>     relatorio importado
--
-- `insert ... on conflict do nothing` porque o bucket pode ja existir no projeto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'comprovantes',
    'comprovantes',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
          'text/csv', 'text/plain']
)
on conflict (id) do nothing;

-- Id da despesa a partir do caminho. Devolve null quando o caminho nao segue a
-- convencao, e ai nenhuma policy casa — o padrao e negar.
create or replace function public.despesa_do_caminho(p_caminho text)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select case
        when p_caminho like 'despesas/%'
             and split_part(p_caminho, '/', 2) ~ '^\d+$'
        then split_part(p_caminho, '/', 2)::bigint
    end
$$;

-- Ler comprovante: administrador, ou quem lancou a despesa.
create policy comprovantes_leitura on storage.objects
    for select to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            public.e_administrador()
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

-- Enviar comprovante: mesma regra. O limite de tamanho e a lista de tipos ficam
-- no bucket, entao o Storage recusa antes de gravar.
create policy comprovantes_envio on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'comprovantes'
        and public.e_operador()
        and (
            public.e_administrador()
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

create policy comprovantes_remocao on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'comprovantes'
        and (
            public.e_administrador()
            or exists (
                select 1 from public.despesas d
                where d.id = public.despesa_do_caminho(name)
                  and d.criado_por = (select auth.uid())
            )
        )
    );

-- Arquivos de importacao da Porto sao do administrador, sem excecao: o relatorio
-- traz o faturamento inteiro do ciclo, nao so o do socorrista que o abriu.
create policy porto_arquivos_admin on storage.objects
    for all to authenticated
    using (bucket_id = 'comprovantes' and name like 'porto/%' and public.e_administrador())
    with check (bucket_id = 'comprovantes' and name like 'porto/%' and public.e_administrador());
