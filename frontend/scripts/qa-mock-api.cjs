const http=require('node:http')
const usuario={id:1,nome:'Administrador',email:'admin@fluxogestao.local',perfil:'ADMINISTRADOR',ativo:true,senhaProvisoria:false}
const dashboard={
  receitaRecebida:68450,receitaPrevista:19200,totalAtrasado:3200,despesasPagas:28750,
  despesasPrevistas:6450,saldoRealizado:39700,saldoProjetado:42450,registrosImportados:48,
  quilometragemTotal:3240,kmRemunerado:2490,kmMorto:750,custoKmMorto:2325,
  producaoPaga:51200,comissaoSobreProducao:10240,producaoPendente:8900,
  servicosPendentes:7,servicosDoPeriodo:41,comissaoAPagar:6180,
  despesasPorCategoria:[
    {categoriaId:1,categoria:'Combustível',valor:9700,participacao:33.74},
    {categoriaId:2,categoria:'Manutenção',valor:6250,participacao:21.74},
    {categoriaId:3,categoria:'Comissões',valor:5100,participacao:17.74},
    {categoriaId:4,categoria:'Pedágios',valor:2840,participacao:9.88},
    {categoriaId:5,categoria:'Impostos',valor:2500,participacao:8.7},
    {categoriaId:6,categoria:'Outros',valor:2360,participacao:8.2}],
  despesasAcumuladasPorDia:[
    {data:'2026-09-02',valorDia:1800,acumulado:1800},{data:'2026-09-05',valorDia:4950,acumulado:6750},
    {data:'2026-09-09',valorDia:3200,acumulado:9950},{data:'2026-09-12',valorDia:8100,acumulado:18050},
    {data:'2026-09-15',valorDia:10700,acumulado:28750}],
  resultadoPorVeiculo:[{veiculoId:1,veiculo:'VTR-01',receitas:24700,despesas:8100}],
  resultadoPorSocorrista:[{motoristaId:1,socorrista:'Anderson',producao:22100,custoTotal:6100}]}
const porto={quantidadeTotalOps:9,valorTotalPrevisto:22700,valorProgramado:15400,valorRecebido:7300}
const responder=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
http.createServer((req,res)=>{
  const rota=new URL(req.url,'http://localhost').pathname
  if(req.method==='POST'&&rota==='/api/auth/login')return responder(res,200,{token:'qa-token-local',usuario})
  if(rota==='/api/auth/me')return responder(res,200,usuario)
  if(rota==='/api/dashboard')return responder(res,200,dashboard)
  if(rota==='/api/favoritos')return responder(res,200,{rotas:[]})
  if(rota==='/api/porto/ordens-pagamento/resumo')return responder(res,200,porto)
  return responder(res,404,{detalhe:'Rota não simulada'})
}).listen(8080,'127.0.0.1')
