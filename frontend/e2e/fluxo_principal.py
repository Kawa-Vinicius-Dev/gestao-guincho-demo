import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

raiz = Path(__file__).resolve().parents[1]
resultados = raiz / "test-results"
resultados.mkdir(exist_ok=True)
sufixo = str(int(time.time()))[-6:]
placa = f"EET1A{sufixo[-2:]}"
contratante = f"Porto Seguro E2E {sufixo}"
protocolo_pdf = f"PS-PDF-{sufixo}"
protocolo_manual = f"PS-MAN-{sufixo}"
pdf = resultados / f"porto-{sufixo}.pdf"

c = canvas.Canvas(str(pdf))
c.drawString(72, 760, f"Documento Porto Seguro de teste {sufixo}")
c.drawString(72, 740, "Formato oficial ainda nao mapeado automaticamente")
c.save()

erros_console = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("console", lambda msg: erros_console.append(f"{msg.text} @ {msg.location}") if msg.type == "error" else None)

    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="Entre na sua conta")).to_be_visible()
    page.get_by_label("E-mail").fill("admin@fluxogestao.local")
    page.get_by_label("Senha").fill("Admin@123")
    page.get_by_role("button", name="Entrar no sistema").click()
    expect(page.get_by_role("heading", name="Visão financeira")).to_be_visible()

    page.get_by_role("link", name="Veículos").click()
    page.get_by_role("button", name="Novo cadastro").click()
    page.get_by_label("Identificação").fill(f"Guincho E2E {sufixo}")
    page.get_by_label("Placa").fill(placa)
    page.get_by_label("Modelo").fill("Daily teste")
    page.get_by_label("Custo por quilômetro").fill("2.50")
    page.get_by_role("button", name="Salvar cadastro").click()
    expect(page.get_by_text(placa)).to_be_visible()

    page.get_by_role("link", name="Configurações").click()
    contratantes = page.locator(".settings-card").filter(has_text="Contratantes")
    contratantes.get_by_placeholder("Nome do contratante").fill(contratante)
    contratantes.get_by_role("button", name="Adicionar").click()
    expect(contratantes.get_by_text(contratante)).to_be_visible()

    page.get_by_role("link", name="Importações Porto Seguro").click()
    page.locator('input[type="file"]').set_input_files(str(pdf))
    page.get_by_role("button", name="Enviar e analisar").click()
    expect(page.get_by_text("Mapeamento definitivo pendente")).to_be_visible()
    page.get_by_label("Protocolo").fill(protocolo_pdf)
    page.get_by_label("Data do serviço").fill("2026-07-20")
    page.get_by_label("Origem").fill("Fortaleza")
    page.get_by_label("Destino").fill("Caucaia")
    page.get_by_label("Valor", exact=True).fill("450")
    page.get_by_label("Previsão de pagamento").fill("2026-08-20")
    page.get_by_label("Guincho").select_option(label=f"Guincho E2E {sufixo}")
    page.get_by_role("button", name="Adicionar à prévia").click()
    expect(page.get_by_text(protocolo_pdf, exact=True)).to_be_visible()
    page.get_by_label("Contratante das contas").select_option(label=contratante)
    page.get_by_role("button", name="Confirmar e criar contas").click()
    expect(page.get_by_text("Importação concluída")).to_be_visible()

    page.get_by_role("link", name="Contas a receber").click()
    page.get_by_placeholder("Protocolo, contratante ou descrição").fill(protocolo_pdf)
    expect(page.get_by_text(protocolo_pdf, exact=True)).to_be_visible()
    page.get_by_role("button", name="Nova conta").click()
    page.get_by_label("Contratante").select_option(label=contratante)
    page.get_by_label("Protocolo").fill(protocolo_manual)
    page.get_by_label("Descrição").fill("Remoção particular E2E")
    page.get_by_label("Valor previsto").fill("800")
    page.get_by_label("Veículo").select_option(label=f"Guincho E2E {sufixo}")
    page.get_by_role("button", name="Salvar conta").click()
    page.get_by_placeholder("Protocolo, contratante ou descrição").fill(protocolo_manual)
    linha = page.locator("tr").filter(has_text=protocolo_manual)
    expect(linha).to_be_visible()
    page.get_by_role("button", name="Registrar pagamento").click()
    page.get_by_label("Valor recebido").fill("780")
    page.get_by_role("button", name="Confirmar recebimento").click()
    expect(page.locator("tr").filter(has_text=protocolo_manual).get_by_text(re.compile("R\\$.*780,00"))).to_be_visible()

    page.get_by_role("link", name="Despesas").click()
    page.get_by_role("button", name="Registrar despesa").click()
    page.get_by_label("Descrição").fill(f"Abastecimento E2E {sufixo}")
    page.get_by_label("Valor").fill("200")
    page.get_by_label("Veículo").select_option(label=f"Guincho E2E {sufixo}")
    page.get_by_label("Data do pagamento").fill("2026-07-23")
    page.get_by_role("button", name="Enviar despesa").click()
    linha_despesa = page.locator("tr").filter(has_text=f"Abastecimento E2E {sufixo}")
    linha_despesa.get_by_role("button", name="Aprovar").click()
    expect(linha_despesa.get_by_text("Aprovada")).to_be_visible()

    page.get_by_role("link", name="Quilometragem").click()
    page.get_by_role("button", name="Novo registro").click()
    page.get_by_label("Veículo").select_option(label=f"Guincho E2E {sufixo}")
    page.get_by_label("Hodômetro inicial").fill("1000")
    page.get_by_label("Hodômetro final").fill("1100")
    page.get_by_label("Km remunerado", exact=True).fill("70")
    page.get_by_label("Protocolo relacionado").fill(protocolo_manual)
    page.get_by_role("button", name="Salvar quilometragem").click()
    expect(page.get_by_text("30 km", exact=True)).to_be_visible()

    page.get_by_role("link", name="Visão geral").click()
    expect(page.get_by_role("heading", name="Visão financeira")).to_be_visible()
    expect(page.get_by_label("Resumo do fluxo").get_by_text(re.compile(r"R\$.*580,00")).first).to_be_visible()
    expect(page.get_by_text("100 km", exact=True)).to_be_visible()
    page.screenshot(path=str(resultados / "financeiro-desktop.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(400)
    page.screenshot(path=str(resultados / "financeiro-mobile.png"), full_page=True)
    browser.close()

if erros_console:
    raise AssertionError(f"Erros no console: {erros_console}")
print("Fluxo financeiro principal validado no navegador.")
