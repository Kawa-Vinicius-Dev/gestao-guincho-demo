# Automação com n8n: alertas do dono

O primeiro item da lista de `docs/revisao-2026-11-11.md` (seção 5): um aviso por
agendamento, **sem LLM**. O número e a regra vêm do banco; o n8n só agenda e envia.

## O que existe
- **`public.alertas_do_dono(p_dias_documento default 30, p_horas_turno default 12)`**
  (migration `20261111180000`). Só lê, só o administrador chama. Devolve uma linha por
  tipo que tenha ocorrência, com `gravidade`, `quantidade`, `valor_total`, `resumo` e
  até 10 exemplos em `itens` (os mais antigos primeiro). Usa as definições que o sistema
  já tem, sem regra nova de atraso:

  | Tipo | Gravidade | Regra |
  |---|---|---|
  | `CONTA_A_RECEBER_ATRASADA` | URGENTE | vencimento antes de hoje e status PENDENTE/ATRASADO |
  | `DESPESA_VENCIDA` | URGENTE | aprovada, PENDENTE/ATRASADO e vencimento antes de hoje |
  | `OP_ATRASADA` | URGENTE | não RECEBIDO e pagamento programado antes de hoje |
  | `DOCUMENTO_VENCIDO` | URGENTE | `vence_em` antes de hoje |
  | `DOCUMENTO_A_VENCER` | ATENCAO | vence em até `p_dias_documento` dias |
  | `TURNO_ABERTO_HA_MUITO_TEMPO` | ATENCAO | ABERTO há mais de `p_horas_turno` horas |
  | `TURNO_PARA_APROVAR` | ATENCAO | AGUARDANDO_APROVACAO |
  | `DESPESA_PARA_APROVAR` | ATENCAO | não aprovada e não rejeitada |

  "Hoje" é o de São Paulo. Suíte `99u` (22 verificações).
- **`docs/n8n/alertas_do_dono.json`**: fluxo para importar no n8n. Dias úteis às 8h:
  entra no Supabase, chama `alertas_do_dono`, monta a mensagem e envia. **Em dia sem
  alerta nada é enviado** (o n8n não segue adiante sem itens).

## O que o dono receberia hoje (dados reais, só leitura, 11/11/2026)
Os 3 tipos com ocorrência: 2 turnos abertos há mais de 12 h e 1 turno esperando
aprovação. Sem atraso financeiro e sem documento vencendo (a tabela de documentos pode
estar sem uso). Os 2 turnos abertos há mais de 12 h merecem uma olhada: pode ser turno
esquecido aberto.

## Para ligar
1. Aplicar a migration `20261111180000` (nada em produção foi aplicado por mim).
2. No n8n, importar `docs/n8n/alertas_do_dono.json` e definir as variáveis de ambiente:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALERTAS_EMAIL`, `ALERTAS_SENHA`,
   `ALERTAS_ORIGEM`, `ALERTAS_DESTINO`. Se o seu n8n bloqueia `$env`, troque por
   credenciais do n8n.
3. **Trocar o último nó pelo canal que o dono usa** (e-mail está de exemplo; WhatsApp ou
   Telegram entram no lugar sem mexer no resto: o nó anterior entrega `assunto` e
   `texto`).
4. Rodar uma vez à mão antes de ativar.

## Segurança: leia antes de ligar
- Para chamar a função, o n8n entra como **um usuário ADMINISTRADOR**. Isso dá a ele,
  por enquanto, mais poder do que o necessário: o fluxo só lê, mas a credencial pode
  tudo que um administrador pode. Use um usuário **dedicado** só para isso, com senha
  forte e guardada no n8n, nunca a conta do dono.
- Melhor a seguir (não feito): um papel de banco só com `execute` nesta função e uma
  variante sem a checagem de administrador, para o n8n nunca ter sessão de administrador.
- Nunca dar `service_role` ao n8n. A mensagem leva nomes de socorristas e valores: o
  canal precisa ser privado.

## O que NÃO foi feito
- **Não testei no n8n.** Só validei o JSON, executei o código do nó de mensagem com dados
  de exemplo e testei a função SQL. Não importei nada na sua instância (`n8n` local).
- Resumo semanal com LLM, assistente no WhatsApp e leitura de comprovante por foto
  (itens 1, 3 e 4 da lista) seguem só como recomendação. Precisam de chave do LLM e de
  decisão sua sobre o canal.
- O alerta "mês parcial antes de fechar metas" não entrou: `qualidade_dos_meses` já existe,
  mas calcula o dashboard de vários meses (~0,6 s) e pesaria num alerta diário.
