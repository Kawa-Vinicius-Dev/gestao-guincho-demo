-- Remove o registro do atendimento no celular (20260924180000).
--
-- Kawa, 24/09/2026: a assinatura do segurado, as fotos e o GPS o socorrista ja
-- registra no app da Porto, e a contestacao e feita com a propria Porto. Repetir
-- aqui era trabalho dobrado no local e peso no banco. A tabela nunca recebeu
-- registro nem arquivo quando foi removida.
--
-- Idempotente: pode rodar de novo no SQL Editor sem efeito colateral.

drop policy if exists atendimentos_arquivos_leitura on storage.objects;
drop policy if exists atendimentos_arquivos_envio on storage.objects;

drop function if exists public.marcar_atendimentos_apagados(bigint[]);
drop function if exists public.atendimentos_para_apagar();
drop function if exists public.atendimentos_registrados(date, date);
drop function if exists public.anexar_arquivos_atendimento(bigint, jsonb, text);
drop function if exists public.registrar_atendimento(text, text, timestamptz, text, text, text);
drop function if exists public.atendimento_do_caminho(text);

drop table if exists public.atendimentos;
