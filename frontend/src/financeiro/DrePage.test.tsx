import { render,screen } from '@testing-library/react'
import { expect,test } from 'vitest'
import DrePage from '../pages/DrePage'

test('DRE usa os totais financeiros reais expostos pelo backend',async()=>{
  render(<DrePage/>)
  expect((await screen.findAllByText('R$ 780,00')).length).toBeGreaterThan(0)
  expect(screen.getAllByText('R$ 200,00').length).toBeGreaterThan(0)
  expect(screen.getAllByText('R$ 580,00').length).toBeGreaterThan(0)
})
