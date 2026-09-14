-- Storage: dois buckets, nao um.
--
-- A primeira versao pos comprovante de despesa e relatorio importado da Porto no
-- mesmo bucket, separados por prefixo. Sao coisas diferentes: o comprovante e de
-- quem lancou a despesa (e do administrador), enquanto o relatorio traz o
-- faturamento inteiro do ciclo e e so do administrador. Guardar os dois no mesmo
-- lugar obriga toda policy a comecar conferindo o prefixo, e a que esquecer
-- dessa conferencia vaza o faturamento.
--
-- Com dois buckets, o bucket ja e a fronteira: `importacoes-porto` nao tem
-- nenhuma policy que libere alguem que nao seja administrador. Cada um tambem
-- ganha seu limite e sua lista de tipos — CSV nao e comprovante valido, e PDF
-- de comprovante nao precisa entrar como relatorio.

-- Comprovantes: 10 MB, documento ou imagem.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'comprovantes';

-- Relatorios da Porto: texto, e maiores — um ciclo fechado passa de 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'importacoes-porto', 'importacoes-porto', false, 26214400,
    array['text/csv', 'text/plain', 'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
   set file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types,
       public = false;

-- A policy antiga cobria os dois prefixos do bucket unico.
drop policy if exists porto_arquivos_admin on storage.objects;

create policy porto_arquivos_admin on storage.objects
    for all to authenticated
    using (bucket_id = 'importacoes-porto' and public.e_administrador())
    with check (bucket_id = 'importacoes-porto' and public.e_administrador());

-- As policies de comprovante passam a valer so no bucket de comprovante: sem
-- isso, o mesmo caminho `despesas/<id>/...` criado dentro do bucket da Porto
-- seria lido pela policy de comprovante e daria acesso a quem lancou a despesa.
drop policy if exists comprovantes_leitura on storage.objects;
drop policy if exists comprovantes_envio on storage.objects;
drop policy if exists comprovantes_remocao on storage.objects;

-- Quem alcanca o comprovante: o administrador, ou quem lancou a despesa.
-- `despesa_do_caminho` devolve null para caminho fora da convencao, e ai nenhuma
-- das policias casa — o padrao e negar.
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

-- Sobrescrever o objeto de outro seria editar o comprovante alheio sem passar
-- por insert nem delete. Nenhuma policy de UPDATE existe, e sem policy o UPDATE
-- nao acontece — mas deixar isso escrito evita que alguem "complete" o conjunto
-- por simetria mais tarde.
