-- A competencia gravada na V9 estava deslocada em uma quinzena. O pagamento ocorre cerca de quinze
-- dias apos o fechamento do periodo: o 1o pagamento do mes cobre a 2a quinzena do mes anterior e o
-- 2o pagamento cobre a 1a quinzena do proprio mes. Exemplo confirmado pelo cliente: o pagamento de
-- 16/09/2026 refere-se aos servicos de 16/08/2026 a 31/08/2026.
--
-- Cada linha assume o periodo que a linha seguinte ocupa hoje, e existe indice unico sobre
-- (competencia_inicio, competencia_fim). Por isso os periodos sao liberados antes de serem
-- regravados, evitando colisao no meio da migracao.
update calendario_pagamentos_porto set competencia_inicio=null, competencia_fim=null
 where data_pagamento in ('2026-08-14','2026-08-28','2026-09-16','2026-09-30','2026-10-16',
                          '2026-10-30','2026-11-16','2026-11-30','2026-12-14','2026-12-30');

update calendario_pagamentos_porto set competencia_inicio='2026-07-16', competencia_fim='2026-07-31' where data_pagamento='2026-08-14';
update calendario_pagamentos_porto set competencia_inicio='2026-08-01', competencia_fim='2026-08-15' where data_pagamento='2026-08-28';
update calendario_pagamentos_porto set competencia_inicio='2026-08-16', competencia_fim='2026-08-31' where data_pagamento='2026-09-16';
update calendario_pagamentos_porto set competencia_inicio='2026-09-01', competencia_fim='2026-09-15' where data_pagamento='2026-09-30';
update calendario_pagamentos_porto set competencia_inicio='2026-09-16', competencia_fim='2026-09-30' where data_pagamento='2026-10-16';
update calendario_pagamentos_porto set competencia_inicio='2026-10-01', competencia_fim='2026-10-15' where data_pagamento='2026-10-30';
update calendario_pagamentos_porto set competencia_inicio='2026-10-16', competencia_fim='2026-10-31' where data_pagamento='2026-11-16';
update calendario_pagamentos_porto set competencia_inicio='2026-11-01', competencia_fim='2026-11-15' where data_pagamento='2026-11-30';
update calendario_pagamentos_porto set competencia_inicio='2026-11-16', competencia_fim='2026-11-30' where data_pagamento='2026-12-14';
update calendario_pagamentos_porto set competencia_inicio='2026-12-01', competencia_fim='2026-12-15' where data_pagamento='2026-12-30';
