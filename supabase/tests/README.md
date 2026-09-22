# Testes do esquema

Validam as migrations num Postgres local, sem depender de um projeto Supabase.

- `00_ambiente_supabase.sql` — emula o que o Supabase oferece pronto: os papeis
  `anon` / `authenticated` / `service_role`, o schema `auth` com `auth.users` e
  `auth.uid()`, e o schema `storage`. Nao vai para producao; existe para as
  migrations poderem rodar fora do Supabase.
- `10_seguranca.sql` — 46 asserções de RLS: quem ve o que, quem escreve o que, e
  as tentativas de escalada que precisam falhar.
- `20_funcional.sql` — 34 asserções sobre os numeros: dashboard, extrato,
  comissao e pagamento de comissao conferidos contra valores calculados a mao.
- `40_ataque.sql` — 52 asserções adversariais: tudo roda direto no banco, como
  quem abre o console do navegador e usa a anon key na mao. A interface nao
  participa. Visitante sem login, funcionario em operacao de administrador,
  troca de id, arquivos alheios e as tentativas de contornar a segregacao de
  funcoes escrevendo direto na coluna.
- `60_despesas_do_socorrista.sql` — 10 asserções sobre as despesas que aparecem
  na tela do socorrista: a janela da OP, o que fica de fora (rejeitada, de outro
  período, o pagamento da própria comissão) e, principalmente, que listar não
  mudou o que desconta do líquido dele.
- `70_lancamento_em_um_passo.sql` — 18 asserções sobre quem lança e quem aprova:
  o administrador em um passo, o funcionário continuando pela aprovação, a trava
  de autoaprovação de pé, e alimentação perdendo a viatura por todas as portas
  (despesa fixa, insert direto, correção de categoria).
- `80_duas_ops.sql` — 5 asserções para o cenário de duas OPs no mesmo mês:
  cada uma fecha a sua produção, e pagar comissão em OPs diferentes e a
  socorristas diferentes não colide mais na categoria.
- `90_tirar_comissao.sql` — 12 asserções sobre tirar a comissão de uma OS que já
  está paga numa OP: a OS fica cancelada, o dinheiro do socorrista baixa e a
  despesa de comissão é refeita, e o serviço sai da produção mas continua no nome
  dele. Devolver restaura a situação de antes (a OS que a Porto cancelou volta
  cancelada), e só o administrador tira.
- `91_percentual_por_socorrista.sql` — 8 asserções de que a comissão é de cada
  socorrista, com teto de 20%, e de que baixar a taxa de alguém não reescreve o
  que ele já recebeu: a OP que fechou guarda a taxa dela.
- `95_copia_dos_dados.sql` — 10 asserções de que a cópia dos dados consegue ler
  todas as colunas que pede. O banco não tem backup automático, então essa cópia
  é a única proteção do dono — e ela ficou quebrada sem ninguém saber.
- `30_financeiro.sql` — 33 asserções sobre as regras que mexem em dinheiro:
  recorte de periodo e suas bordas, atraso derivado do vencimento, despesa nao
  aprovada fora do resultado, custo do km congelado no registro, producao e
  comissao, resumo Porto (previsto x programado x recebido) e periodo vazio.

## Rodar

Precisa de um Postgres 16 acessivel. Com o binario em `/usr/lib/postgresql/16/bin`:

```sh
initdb -D /tmp/pg/data -U postgres --auth=trust
pg_ctl -D /tmp/pg/data -o "-p 55432 -k /tmp/pg -c listen_addresses=" start

createdb -h /tmp/pg -p 55432 -U postgres teste
psql -h /tmp/pg -p 55432 -U postgres -d teste -v ON_ERROR_STOP=1 \
     -f tests/00_ambiente_supabase.sql
for f in migrations/*.sql; do
  psql -h /tmp/pg -p 55432 -U postgres -d teste -v ON_ERROR_STOP=1 -f "$f"
done
psql -h /tmp/pg -p 55432 -U postgres -d teste -v ON_ERROR_STOP=1 -f tests/10_seguranca.sql
```

Cada suite quer um banco recem-criado: as fixtures usam ids fixos e reaplicar
sobre um banco ja populado falha na chave primaria — que e o que se espera.

Uma asserção que falha aborta com `FALHOU | <o que era esperado>`; no fim de uma
rodada boa sai `TODOS OS TESTES PASSARAM`.

## Por que o helper mede linhas afetadas

Um `UPDATE` barrado por RLS nao levanta erro: ele nao encontra a linha e afeta
zero. Um teste que so verificasse "nao lancou excecao" leria isso como permissao
concedida. Por isso `pg_temp.tentar()` olha o `row_count` — a pergunta e se a
escrita teve efeito, nao se ela reclamou.
