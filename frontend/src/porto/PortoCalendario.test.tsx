import { render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import PortoCalendarioPage from '../pages/PortoCalendarioPage'
import { servidor } from '../test/servidor'

test('adiciona, edita e desativa uma data do calendário Porto',async()=>{
  let itens=[{id:1,dataPagamento:'2026-08-14',competenciaInicio:'2026-07-01',competenciaFim:'2026-07-15',descricao:'Ciclo 14/08',ativo:true,criadoEm:'2026-01-01',atualizadoEm:'2026-01-01'}]
  servidor.use(
    http.get('/api/porto/calendario',()=>HttpResponse.json(itens)),
    http.post('/api/porto/calendario',async({request})=>{const body=await request.json() as {dataPagamento:string;competenciaInicio:string;competenciaFim:string;descricao:string;ativo:boolean};const novo={id:2,...body,criadoEm:'2026-08-04',atualizadoEm:'2026-08-04'};itens=[...itens,novo];return HttpResponse.json(novo,{status:201})}),
    http.put('/api/porto/calendario/1',async({request})=>{const body=await request.json() as {dataPagamento:string;competenciaInicio:string;competenciaFim:string;descricao:string;ativo:boolean};itens=itens.map(x=>x.id===1?{...x,...body}:x);return HttpResponse.json(itens[0])}),
    http.patch('/api/porto/calendario/1/desativar',()=>{itens=itens.map(x=>x.id===1?{...x,ativo:false}:x);return HttpResponse.json(itens[0])}),
  )
  const user=userEvent.setup();render(<PortoCalendarioPage/>);expect(await screen.findByText('Ciclo 14/08')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:/editar ciclo 14\/08/i}));const dialogo=screen.getByRole('dialog'),descricao=within(dialogo).getByLabelText(/descrição/i);await user.clear(descricao);await user.type(descricao,'Ciclo principal 14/08');await user.click(within(dialogo).getByRole('button',{name:/salvar alterações/i}));expect(await screen.findByText('Ciclo principal 14/08')).toBeInTheDocument()
  await user.type(screen.getByLabelText(/início da competência/i),'2026-08-01');await user.type(screen.getByLabelText(/fim da competência/i),'2026-08-15');await user.type(screen.getByLabelText(/data de pagamento/i),'2026-09-16');await user.type(screen.getByLabelText(/descrição/i),'Ciclo 16/09');await user.click(screen.getByRole('button',{name:/adicionar data/i}))
  expect(await screen.findByText('Ciclo 16/09')).toBeInTheDocument();await user.click(screen.getAllByRole('button',{name:/desativar/i})[0]);expect(await screen.findByText('Inativa')).toBeInTheDocument()
})
