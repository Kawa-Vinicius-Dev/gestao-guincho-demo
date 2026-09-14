-- Atalhos que cada pessoa fixa no topo do menu.
--
-- O menu tem dezoito itens em cinco grupos, e quem opera usa de tres a cinco
-- deles o dia inteiro. Guardar por usuario, e nao no navegador, e o que faz a
-- lista acompanhar a pessoa do computador da base para o celular - e o que
-- impede dois usuarios do mesmo computador de dividirem a mesma lista.
--
-- Guarda a rota, nao um id de tela: a rota e o que a barra lateral conhece.
-- Item removido do sistema vira uma linha orfa aqui, que a tela simplesmente
-- ignora; nao vale um vinculo rigido para isso.
create table favoritos_menu (
    id bigint generated always as identity primary key,
    usuario_id bigint not null references usuarios(id),
    rota text not null,
    ordem integer not null default 0,
    criado_em timestamp with time zone not null default current_timestamp,
    constraint favoritos_menu_sem_repetir unique (usuario_id, rota)
);

create index favoritos_menu_por_usuario on favoritos_menu (usuario_id);
