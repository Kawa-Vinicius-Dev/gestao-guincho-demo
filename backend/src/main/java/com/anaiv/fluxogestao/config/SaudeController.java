package com.anaiv.fluxogestao.config;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

/**
 * Endpoint de saude, publico e deliberadamente burro.
 *
 * Existe para o agendador externo (cron-job.org / UptimeRobot) manter o servico
 * acordado no plano gratuito do Render, que hiberna apos 15 minutos sem trafego
 * e leva cerca de um minuto para religar - medido em producao: 114,8 s. Sem isso,
 * o primeiro acesso de cada dia trava e parece que o sistema caiu.
 *
 * NAO toca o banco de proposito. Quem chama e um robo, a cada 10 minutos, e o
 * objetivo e so gerar trafego de entrada; consultar o Postgres a cada chamada
 * gastaria conexao do Supabase sem responder nenhuma pergunta a mais. Se um dia
 * for preciso saber se o banco responde, isso e outro endpoint, com outro nome.
 *
 * A janela de ping e das 07h as 19h em dias uteis: o gratuito da 750 horas de
 * instancia por mes e o servico so consome hora enquanto acordado, entao pingar
 * 24/7 gastaria ~730 e estourar suspende todos os servicos gratuitos ate o mes
 * seguinte. Ver docs/manter-backend-acordado.md.
 */
@RestController
public class SaudeController {
    @GetMapping("/api/health")
    public Map<String, String> saude() {
        return Map.of("status", "ok");
    }
}
