-- A Porto entrega o calendario com meses de antecedencia, mas nao o ano inteiro. Quando acaba, a
-- importacao trava. O sistema passa a projetar os ciclos seguintes pelo padrao observado, e esta
-- marca separa o que foi projetado do que a Porto confirmou.
alter table calendario_pagamentos_porto add column estimado boolean not null default false;
