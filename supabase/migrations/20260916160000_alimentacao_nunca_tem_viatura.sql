-- Alimentação nunca fica pendurada numa viatura — por qualquer porta.
--
-- A regra estava na tela: escolher a categoria Alimentação desativa o campo de
-- veículo. Isso resolve o formulário e só ele. Entram na tabela por outros
-- caminhos:
--
--   lancar_despesas_recorrentes  -> copia veiculo_id da despesa fixa e nunca
--                                   escreve natureza. Uma despesa fixa de
--                                   Alimentação com veículo escolhido no
--                                   cadastro reproduz o mesmo defeito todo mês.
--   registrar_alimentacao        -> o socorrista lançando a própria refeição.
--   insert direto pela policy    -> o funcionário lançando a dele.
--
-- Uma regra que vale em um caminho e não nos outros não é uma regra, é um
-- costume. Aqui ela passa a ser do banco: qualquer escrita em despesas, venha de
-- onde vier, sai obedecendo.
--
-- O critério é o nome da categoria, o mesmo que `registrar_alimentacao` já usa
-- para achá-la. Ter dois critérios para a mesma pergunta é como o lançamento do
-- administrador e o do socorrista acabariam em lados opostos do fechamento.
--
-- Sem socorrista a despesa NÃO vira ALIMENTACAO_FUNCIONARIO: não há de quem
-- descontar, e a marca viraria um estado que nenhuma tela consegue usar. Mas a
-- viatura sai do mesmo jeito — comida não é custo de veículo, com ou sem dono.

create or replace function public.despesa_alimentacao_nao_tem_viatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_e_alimentacao boolean;
begin
    select lower(btrim(c.nome)) = 'alimentação'
      into v_e_alimentacao
      from public.categorias c where c.id = new.categoria_id;

    if coalesce(v_e_alimentacao, false) or new.natureza = 'ALIMENTACAO_FUNCIONARIO' then
        new.veiculo_id := null;
        new.natureza := case when new.motorista_id is not null
            then 'ALIMENTACAO_FUNCIONARIO'::public.natureza_despesa
            else 'GERAL'::public.natureza_despesa end;
    end if;

    return new;
end;
$$;

drop trigger if exists despesas_alimentacao_sem_viatura on public.despesas;
create trigger despesas_alimentacao_sem_viatura
    before insert or update of categoria_id, veiculo_id, motorista_id, natureza
    on public.despesas
    for each row execute function public.despesa_alimentacao_nao_tem_viatura();
