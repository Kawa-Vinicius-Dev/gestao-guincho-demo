-- Seed: o minimo para o sistema abrir util.
--
-- Nao cria usuario. O primeiro administrador nasce no painel do Supabase (Auth ->
-- Add user) com `perfil: ADMINISTRADOR` em User Metadata; o trigger de
-- provisionamento cria o perfil no mesmo commit. Criar usuario por SQL exigiria
-- escrever hash de senha na mao em auth.users, que e exatamente o tipo de atalho
-- que deixa uma conta fraca em producao.

insert into public.categorias (nome, tipo) values
    ('Combustível', 'DESPESA'),
    ('Pedágio', 'DESPESA'),
    ('Manutenção', 'DESPESA'),
    ('Alimentação', 'DESPESA'),
    ('Comissão de socorrista', 'DESPESA'),
    ('Serviços de guincho', 'RECEITA')
on conflict do nothing;

-- O pipeline da Porto procura este contratante pelo nome e cria se nao achar;
-- deixar pronto evita que a primeira importacao o crie com outra grafia.
insert into public.contratantes (nome) values ('Porto Seguro')
on conflict do nothing;
