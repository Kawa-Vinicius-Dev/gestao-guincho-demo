from pathlib import Path
from playwright.sync_api import sync_playwright

PASTA = Path(__file__).resolve().parent / "evidencias"
PASTA.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="pt-BR")
    page = context.new_page()
    erros_console = []
    page.on("console", lambda mensagem: erros_console.append(mensagem.text) if mensagem.type == "error" else None)

    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    page.get_by_label("E-mail").fill("admin@fluxogestao.local")
    page.get_by_label("Senha").fill("Admin@123")
    page.get_by_role("button", name="Entrar no sistema").click()
    page.get_by_role("heading", name="Visão financeira").wait_for()
    assert page.get_by_text("Atenção ao deslocamento improdutivo").is_visible()
    assert page.get_by_text("G-02", exact=True).count() >= 1
    page.screenshot(path=PASTA / "dashboard-desktop.png", full_page=True)

    page.get_by_role("link", name="Lançamentos", exact=True).click()
    page.get_by_role("heading", name="Lançamentos", exact=True).wait_for()
    page.get_by_role("button", name="Novo lançamento").click()
    dialogo = page.get_by_role("dialog")
    dialogo.get_by_label("Descrição").fill("Atendimento de validação visual")
    dialogo.get_by_label("Valor").fill("425")
    dialogo.get_by_label("Veículo").select_option("1")
    dialogo.get_by_role("button", name="Salvar lançamento").click()
    page.get_by_text("Atendimento de validação visual").wait_for()
    page.get_by_role("link", name="Visão geral").click()
    page.get_by_text("Atendimento de validação visual").wait_for()

    rotas = {
        "/dre": "DRE mensal",
        "/quilometragem": "Km rodado e km morto",
        "/veiculos": "Frota e custos",
        "/equipe": "Funcionários",
        "/escala": "Escala operacional",
        "/metas": "Metas mensais",
        "/importacoes": "Importar planilha",
        "/relatorios": "Relatórios",
        "/integracoes": "Integrações futuras",
    }
    for rota, titulo in rotas.items():
        page.goto(f"http://127.0.0.1:5173{rota}")
        page.get_by_role("heading", name=titulo, exact=True).wait_for()

    page.goto("http://127.0.0.1:5173/")
    page.get_by_role("heading", name="Visão financeira").wait_for()
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(400)
    page.screenshot(path=PASTA / "dashboard-mobile.png", full_page=True)
    largura = page.evaluate("Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)")
    assert largura <= 391, f"Layout excedeu a largura mobile: {largura}px"

    print({
        "rotas_validadas": len(rotas) + 2,
        "persistencia_validada": True,
        "largura_mobile": largura,
        "erros_console": erros_console,
        "screenshots": [str(PASTA / "dashboard-desktop.png"), str(PASTA / "dashboard-mobile.png")],
    })
    browser.close()
