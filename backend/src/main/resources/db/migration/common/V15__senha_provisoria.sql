-- Quando o dono redefine a senha de alguem, a senha gerada e temporaria: viaja por WhatsApp e
-- precisa morrer no primeiro uso. A marca fica no proprio usuario e some quando ele troca.
alter table usuarios add column senha_provisoria boolean not null default false;
