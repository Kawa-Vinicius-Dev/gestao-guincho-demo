-- O termo usado no negocio e "socorrista", que e como a propria Porto identifica quem executa a OS.
-- A categoria e localizada pelo nome no ComissaoService, entao renomear apenas no codigo quebraria a
-- busca. O nome tambem aparece nos relatorios financeiros, por isso a troca vale para o dado gravado.
update categorias set nome='Comissão de socorrista'
 where lower(nome)=lower('Comissão de funcionário') and tipo='DESPESA'
   and not exists (select 1 from categorias c where lower(c.nome)=lower('Comissão de socorrista') and c.tipo='DESPESA');
