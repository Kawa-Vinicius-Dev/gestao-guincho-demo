import { render,screen,within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http,HttpResponse } from 'msw'
import { expect,test } from 'vitest'
import { servidor } from '../test/servidor'
import ReceitasPage from '../pages/ReceitasPage'

test('edita receita manual sem duplicar e exclui somente após a confirmação',async()=>{
  let receitas=[{id:1,descricao:'Manual',valor:100,dataCompetencia:'2026-08-01',dataRecebimento:'2026-08-01',status:'RECEBIDA',recorrente:false,categoria:'Serviços',categoriaId:1,manual:true},{id:2,descricao:'Porto OP 9',valor:500,dataCompetencia:'2026-08-01',dataRecebimento:'2026-08-31',status:'RECEBIDA',recorrente:false,categoria:'Serviços',categoriaId:1,manual:false}]
  servidor.use(http.get('/api/receitas',()=>HttpResponse.json(receitas)),http.get('/api/categorias',()=>HttpResponse.json([{id:1,nome:'Serviços',tipo:'RECEITA',ativo:true}])),http.get('/api/contratantes',()=>HttpResponse.json([])),http.get('/api/veiculos',()=>HttpResponse.json([])),http.put('/api/receitas/1',async({request})=>{const body=await request.json() as typeof receitas[number];receitas=receitas.map(r=>r.id===1?{...r,...body}:r);return HttpResponse.json(receitas[0])}),http.delete('/api/receitas/1',()=>{receitas=receitas.filter(r=>r.id!==1);return new HttpResponse(null,{status:204})}))
  const user=userEvent.setup();render(<ReceitasPage/>);const manual=await screen.findByRole('row',{name:/manual/i});expect(within(manual).getByRole('button',{name:/editar/i})).toBeInTheDocument();const porto=screen.getByRole('row',{name:/porto op 9/i});expect(within(porto).queryByRole('button',{name:/editar/i})).not.toBeInTheDocument()
  await user.click(within(manual).getByRole('button',{name:/editar/i}));const dialogo=screen.getByRole('dialog');const valor=within(dialogo).getByLabelText(/^valor$/i);await user.clear(valor);await user.type(valor,'175');await user.click(within(dialogo).getByRole('button',{name:/salvar alterações/i}));expect(await screen.findByText('R$ 175,00')).toBeInTheDocument();expect(screen.getAllByRole('row',{name:/manual/i})).toHaveLength(1)
  await user.click(within(screen.getByRole('row',{name:/manual/i})).getByRole('button',{name:/excluir/i}));const confirmacao=screen.getByRole('dialog',{name:/excluir receita/i});await user.click(within(confirmacao).getByRole('button',{name:/cancelar/i}));expect(screen.getByText('Manual')).toBeInTheDocument();await user.click(within(screen.getByRole('row',{name:/manual/i})).getByRole('button',{name:/excluir/i}));await user.click(within(screen.getByRole('dialog',{name:/excluir receita/i})).getByRole('button',{name:/excluir receita/i}));expect(screen.queryByText('Manual')).not.toBeInTheDocument()
})
