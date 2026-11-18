import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import RatingDistribution from "./src/components/RatingDistribution.jsx";

(() => {
    "use strict";

    /*
     * Integração com a API desativada para execução local.
     * Endpoints para reativação futura:
     * POST /usuarios, POST /usuarios/login, GET /usuarios,
     * GET /produtos, GET /categorias, GET /feedbacks,
     * POST /usuarios/{id}/selos, POST /usuarios/{id}/resgatarItem,
     * POST /usuarios/feedback, PUT/DELETE /usuarios/{id},
     * POST /usuarios/logout e POST /codigos/gerar. A consulta externa de CEP
     * (ViaCEP) também está desligada; endereço é preenchido manualmente.
     */
    const DEMO_STORAGE_KEY = "hachi-conecta-demo-v1";
    const SESSION_USER_KEY = "hachi-conecta-user";
    const REGISTER_DRAFT_KEY = "hachi-conecta-register";
    const MIN_PURCHASE = 40;
    const STAMPS_FOR_REWARD = 12;
    const MODAL_CLOSE_DURATION = 220;

    const routeNames = new Set([
        "home", "register-1", "register-2", "login", "loyalty",
        "profile", "catalog", "dashboard", "attendant", "attendant-code"
    ]);

    const state = {
        screen: routeFromHash(),
        modal: null,
        user: loadSessionUser(),
        busy: false,
        alert: null,
        registerDraft: loadRegisterDraft(),
        selectedRating: 5,
        selectedCategory: "Todas",
        selectedPeriod: 7,
        selectedRatingFilter: "Todas",
        products: [],
        categories: [],
        productsLoaded: false,
        productsLoading: false,
        productsError: null,
        dashboard: null,
        dashboardLoading: false,
        dashboardError: null,
        dashboardLoaded: false,
        attendantCode: null,
        attendantPurchase: null,
        cameraStream: null,
        cameraTimer: null,
        restoreFocus: null
    };

    const app = document.getElementById("app");
    const toastRegion = document.getElementById("toast-region");
    const reactRoot = createRoot(app);
    let ratingRoot = null;
    let modalCloseTimer = null;
    let lastRenderedScreen = null;

    function routeFromHash() {
        const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
        return routeNames.has(route) ? route : "home";
    }

    function loadSessionUser() {
        const saved = sessionStorage.getItem(SESSION_USER_KEY);
        if (!saved) return null;
        try {
            const user = JSON.parse(saved);
            if (!user || typeof user !== "object" || Array.isArray(user)) throw new Error("Invalid local session.");
            delete user.senha;
            return user;
        } catch {
            sessionStorage.removeItem(SESSION_USER_KEY);
            return null;
        }
    }

    function saveSessionUser(user) {
        const sessionUser = { ...user };
        delete sessionUser.senha;
        state.user = sessionUser;
        sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(sessionUser));
    }

    function clearSession() {
        state.user = null;
        state.modal = null;
        sessionStorage.removeItem(SESSION_USER_KEY);
        sessionStorage.removeItem("hachi-conecta-mode");
    }

    function loadRegisterDraft() {
        const saved = sessionStorage.getItem(REGISTER_DRAFT_KEY);
        if (!saved) return {};
        try {
            return JSON.parse(saved);
        } catch {
            sessionStorage.removeItem(REGISTER_DRAFT_KEY);
            return {};
        }
    }

    function saveRegisterDraft(draft) {
        state.registerDraft = draft;
        sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(draft));
    }

    function clearRegisterDraft() {
        state.registerDraft = {};
        sessionStorage.removeItem(REGISTER_DRAFT_KEY);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function initials(name) {
        return String(name || "Hachi")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
        }).format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) return "Não informado";
        const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
        return Number.isNaN(date.getTime())
            ? "Não informado"
            : new Intl.DateTimeFormat("pt-BR").format(date);
    }

    function fullName() {
        return state.user?.nome || "Pessoa cliente";
    }

    function isCustomer() {
        return Number(state.user?.funcao) === 0;
    }

    function isEmployee() {
        return Number(state.user?.funcao) === 1;
    }

    function isAdmin() {
        return Number(state.user?.funcao) === 2;
    }

    function routeForUser() {
        if (isAdmin()) return "dashboard";
        if (isEmployee()) return "attendant";
        return "loyalty";
    }

    function getDemoDatabase() {
        const saved = localStorage.getItem(DEMO_STORAGE_KEY);
        if (saved) {
            try {
                const database = JSON.parse(saved);
                const presetPasswords = {
                    "camila@demo.hachi": "hachi123",
                    "leonardo@demo.hachi": "hachi123",
                    "julia@demo.hachi": "hachi123"
                };
                let migrated = false;
                database.users.forEach((user) => {
                    if (!user.senha && presetPasswords[user.email]) {
                        user.senha = presetPasswords[user.email];
                        migrated = true;
                    }
                });
                database.feedbacks ||= [];
                database.products ||= [];
                database.codes ||= [];
                database.redemptions ||= [];
                if (migrated) saveDemoDatabase(database);
                return database;
            } catch {
                throw new Error("Os dados locais de demonstração não puderam ser lidos. Limpe os dados do site e tente novamente.");
            }
        }

        const now = new Date().toISOString();
        const database = {
            users: [
                {
                    idUsuario: 9001, nome: "Camila Tanaka", email: "camila@demo.hachi",
                    telefone: "11912345678", dtNasc: "2002-12-25", cidade: "São Paulo",
                    regiao: "Liberdade", funcao: 0, statusUsuario: 1, selos: 8,
                    senha: "hachi123", criadoEm: now, atualizadoEm: now
                },
                {
                    idUsuario: 9002, nome: "Leonardo", email: "leonardo@demo.hachi",
                    telefone: "", dtNasc: "", cidade: "São Paulo", regiao: "Liberdade",
                    funcao: 2, statusUsuario: 1, selos: 0, senha: "hachi123", criadoEm: now, atualizadoEm: now
                },
                {
                    idUsuario: 9003, nome: "Julia", email: "julia@demo.hachi",
                    telefone: "", dtNasc: "", cidade: "São Paulo", regiao: "Liberdade",
                    funcao: 1, statusUsuario: 1, selos: 0, senha: "hachi123", criadoEm: now, atualizadoEm: now
                }
            ],
            feedbacks: [
                { idFeedback: 1, idUsuario: 9001, nota: 5, comentario: "Adorei o atendimento e o taiyaki. Voltarei em breve!", dataHora: now },
                { idFeedback: 2, idUsuario: 9001, nota: 4, comentario: "O café estava ótimo e o ambiente é muito acolhedor.", dataHora: now },
                { idFeedback: 3, idUsuario: 9001, nota: 5, comentario: "Uma experiência deliciosa na Liberdade.", dataHora: now }
            ],
            products: [
                { idProduto: 1, nome: "Espresso", descricao: "Café espresso tradicional.", preco: 6, disponivel: 1, nomeCategoria: "Cafés" },
                { idProduto: 2, nome: "Cappuccino", descricao: "Café com leite vaporizado e espuma.", preco: 10, disponivel: 1, nomeCategoria: "Cafés" },
                { idProduto: 3, nome: "Café Gelado", descricao: "Café gelado levemente adocicado.", preco: 12, disponivel: 1, nomeCategoria: "Cafés" },
                { idProduto: 4, nome: "Brownie", descricao: "Brownie de chocolate.", preco: 9, disponivel: 1, nomeCategoria: "Doces" },
                { idProduto: 5, nome: "Cheesecake", descricao: "Fatia de cheesecake cremosa.", preco: 14, disponivel: 1, nomeCategoria: "Doces" },
                { idProduto: 6, nome: "Cookie", descricao: "Cookie com gotas de chocolate.", preco: 7, disponivel: 1, nomeCategoria: "Doces" },
                { idProduto: 7, nome: "Pão de Queijo", descricao: "Pão de queijo assado na hora.", preco: 6.5, disponivel: 1, nomeCategoria: "Salgados" },
                { idProduto: 8, nome: "Coxinha", descricao: "Coxinha de frango.", preco: 8, disponivel: 1, nomeCategoria: "Salgados" },
                { idProduto: 9, nome: "Misto Quente", descricao: "Sanduíche de queijo e presunto.", preco: 11, disponivel: 1, nomeCategoria: "Salgados" }
            ],
            codes: [],
            redemptions: []
        };
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(database));
        return database;
    }

    function saveDemoDatabase(database) {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(database));
    }

    function getDemoUserById(database, id) {
        return database.users.find((user) => Number(user.idUsuario) === Number(id));
    }

    function go(screen, options = {}) {
        if (!routeNames.has(screen)) return;
        if (options.protected && !state.user) {
            state.alert = { type: "warning", message: "Entre na sua conta para continuar." };
            go("login", { preserveAlert: true });
            return;
        }
        if (options.role === "admin" && !isAdmin()) {
            state.alert = { type: "error", message: "Acesso restrito à administração." };
            go(state.user ? routeForUser() : "login");
            return;
        }
        if (options.role === "employee" && !isEmployee()) {
            state.alert = { type: "error", message: "Acesso disponível somente para a equipe da Hachi." };
            go(state.user ? routeForUser() : "login");
            return;
        }

        state.modal = null;
        if (!options.preserveAlert) state.alert = null;
        state.screen = screen;
        if (window.location.hash === `#${screen}`) {
            render();
            afterRender();
        } else {
            window.location.hash = screen;
        }
    }

    function showToast(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.setAttribute("role", type === "error" ? "alert" : "status");
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 4200);
    }

    function field({ id, label, name = id, type = "text", value = "", placeholder = "", required = false, hint = "", autocomplete = "", min = "", max = "", inputmode = "" }) {
        const requiredText = required ? " *" : "";
        const attributes = [
            `id="${escapeHtml(id)}"`,
            `name="${escapeHtml(name)}"`,
            `type="${escapeHtml(type)}"`,
            `value="${escapeHtml(value)}"`,
            `placeholder="${escapeHtml(placeholder)}"`,
            required ? "required" : "",
            autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : "",
            min ? `min="${escapeHtml(min)}"` : "",
            max ? `max="${escapeHtml(max)}"` : "",
            inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ""
        ].filter(Boolean).join(" ");
        return `<div class="field">
            <label for="${escapeHtml(id)}">${escapeHtml(label)}${requiredText}</label>
            <input class="input" ${attributes} ${hint ? `aria-describedby="${escapeHtml(id)}-hint"` : ""}>
            ${hint ? `<p class="field-hint" id="${escapeHtml(id)}-hint">${escapeHtml(hint)}</p>` : ""}
        </div>`;
    }

    function header({ back = null, title = null, authenticated = false, admin = false } = {}) {
        const userControl = authenticated && state.user
            ? `<button class="header-user" type="button" data-action="profile" aria-label="Abrir perfil de ${escapeHtml(fullName())}">
                <span class="avatar" aria-hidden="true">${escapeHtml(initials(fullName()))}</span>
                <span>${escapeHtml(fullName())}</span>
              </button>`
            : "";
        return `<header class="site-header" role="banner">
            <div class="header-actions">
                ${back ? `<button class="btn btn-quiet btn-small" type="button" data-route="${escapeHtml(back)}" aria-label="Voltar para a tela anterior">← Voltar</button>` : ""}
                <a class="brand" href="#home" data-route="home" aria-label="Hachi Conecta, página inicial">
                    <img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                    <span class="brand-copy"><strong>Hachi Conecta</strong><span>${admin ? "Área administrativa" : "Fidelidade &amp; experiência"}</span></span>
                </a>
                ${title ? `<span class="language-chip">${escapeHtml(title)}</span>` : ""}
            </div>
            <div class="header-actions">
                ${userControl}
                <span class="language-chip" aria-label="Idioma português do Brasil">pt-BR</span>
                <span class="demo-badge">Modo local</span>
                ${authenticated ? `<button class="btn btn-quiet btn-small" type="button" data-action="logout">Sair</button>` : ""}
            </div>
        </header>`;
    }

    function alertMarkup(alert = state.alert) {
        if (!alert) return "";
        const type = ["error", "success", "warning", "info"].includes(alert.type) ? alert.type : "info";
        const label = { error: "Atenção", success: "Tudo certo", warning: "Aviso", info: "Informação" }[type];
        return `<div class="alert alert-${type}" role="${type === "error" ? "alert" : "status"}">
            <span aria-hidden="true">${type === "error" ? "!" : type === "success" ? "✓" : "i"}</span>
            <p><strong>${label}:</strong> ${escapeHtml(alert.message)}</p>
        </div>`;
    }

    function homeScreen() {
        return `${header()}
        <main id="main-content" class="page home-page" role="main">
            <section class="panel home-card" aria-labelledby="home-title">
                <img class="home-logo" src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                <p class="eyebrow">Seu cantinho na Liberdade</p>
                <h1 class="home-title" id="home-title">Seu momento Hachi fica ainda melhor</h1>
                <span class="home-rule">A cada compra acima de R$ 40,00 você ganha um selo.</span>
                <p>Faça parte do Sistema de Fidelidade da Hachi. Acompanhe seus selos, resgates e compartilhe sua experiência.</p>
                ${alertMarkup()}
                <div class="home-actions">
                    <button class="btn btn-dark btn-block" type="button" data-route="register-1">Cadastre-se agora</button>
                    <span class="divider">ou</span>
                    <button class="btn btn-secondary btn-block" type="button" data-route="login">Entrar na sua conta</button>
                </div>
                <footer class="home-footer">
                    <a href="#" data-action="legal" data-legal="Termos e Condições de Uso">Termos e Condições de Uso</a>
                    <a href="#" data-action="legal" data-legal="Política de Privacidade">Política de Privacidade</a>
                    <a href="#" data-action="legal" data-legal="Política de Cookies">Política de Cookies</a>
                    <a href="#" data-action="feedback">Enviar feedback</a>
                </footer>
                <details class="demo-entry">
                    <summary>Acessos rápidos de demonstração</summary>
                    <div class="inline-actions">
                        <button class="btn btn-secondary btn-small" type="button" data-demo-role="client">Cliente</button>
                        <button class="btn btn-secondary btn-small" type="button" data-demo-role="employee">Atendente</button>
                        <button class="btn btn-secondary btn-small" type="button" data-demo-role="admin">Administração</button>
                    </div>
                    <p class="field-hint">Sem conexão com servidor. As alterações ficam neste navegador; perfis e feedbacks iniciais são fictícios.</p>
                </details>
            </section>
        </main>
        ${footer()}`;
    }

    function registerStepOneScreen() {
        const draft = state.registerDraft;
        return `${header({ back: "home" })}
        <main id="main-content" class="page page-narrow page-auth" role="main">
            <div class="brand-heading">
                <img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                <p class="step-indicator"><strong>Etapa 1 de 2</strong> · Seus dados pessoais</p>
                <h1>Crie a sua conta</h1>
                <p class="muted">Vamos começar com algumas informações básicas.</p>
            </div>
            <section class="panel">
                ${alertMarkup()}
                <form id="register-step-one" class="form-grid" novalidate>
                    ${field({ id: "first-name", label: "Nome", value: draft.firstName || "", placeholder: "Ex.: Pedro", required: true, autocomplete: "given-name" })}
                    ${field({ id: "last-name", label: "Sobrenome", value: draft.lastName || "", placeholder: "Ex.: Santos", required: true, autocomplete: "family-name" })}
                    ${field({ id: "birth-date", label: "Data de nascimento", value: draft.birthDate || "", type: "date", required: true, autocomplete: "bday", max: new Date().toISOString().slice(0, 10) })}
                    <button class="btn btn-dark btn-block" type="submit">Próximo</button>
                    <p class="field-hint">Usaremos seus dados para identificar sua conta no programa de fidelidade.</p>
                </form>
            </section>
        </main>
        ${footer()}`;
    }

    function registerStepTwoScreen() {
        const draft = state.registerDraft;
        return `${header({ back: "register-1" })}
        <main id="main-content" class="page page-narrow page-auth" role="main">
            <div class="brand-heading">
                <img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                <p class="step-indicator"><strong>Etapa 2 de 2</strong> · Contato e acesso</p>
                <h1>Crie a sua conta</h1>
                <p class="muted">Quase lá! Complete seus dados de contato.</p>
            </div>
            <section class="panel">
                ${alertMarkup()}
                <form id="register-step-two" class="form-grid" novalidate>
                    ${field({ id: "phone", label: "Contato", type: "tel", value: draft.phone || "", placeholder: "+55 (11) 91234-5678", required: true, autocomplete: "tel", inputmode: "tel" })}
                    ${field({ id: "email", label: "E-mail", type: "email", value: draft.email || "", placeholder: "email@seuemail.com", required: true, autocomplete: "email" })}
                    ${field({ id: "postal-code", label: "CEP (opcional)", value: draft.postalCode || "", placeholder: "00000-000", autocomplete: "postal-code", inputmode: "numeric", hint: "O endereço não é consultado automaticamente." })}
                    ${field({ id: "city", label: "Cidade", value: draft.city || "", placeholder: "Ex.: São Paulo", required: true, autocomplete: "address-level2" })}
                    ${field({ id: "region", label: "Bairro ou região", value: draft.region || "", placeholder: "Ex.: Liberdade", required: true, autocomplete: "address-level3" })}
                    ${field({ id: "password", label: "Senha", type: "password", placeholder: "Mínimo de 8 caracteres", required: true, autocomplete: "new-password", min: "8" })}
                    ${field({ id: "confirm-password", label: "Confirmar senha", type: "password", placeholder: "Digite a senha novamente", required: true, autocomplete: "new-password", min: "8" })}
                    <label class="checkbox-row">
                        <input id="terms-accepted" name="terms" type="checkbox" ${draft.termsAccepted ? "checked" : ""} required>
                        <span>Concordo com os <a href="#" data-action="legal" data-legal="Termos de Uso">termos de uso</a> e a <a href="#" data-action="legal" data-legal="Política de Privacidade">política de privacidade</a>.</span>
                    </label>
                    <p class="field-hint">Seus dados serão usados para manter sua conta e seu cartão de fidelidade.</p>
                    <button class="btn btn-dark btn-block" type="submit">Confirmar</button>
                </form>
            </section>
        </main>
        ${footer()}`;
    }

    function loginScreen() {
        return `${header({ back: "home" })}
        <main id="main-content" class="page page-narrow page-auth" role="main">
            <div class="brand-heading">
                <img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                <h1>Entre na sua conta</h1>
                <p class="muted">Que bom ter você por aqui. Confira seus pontos.</p>
            </div>
            <section class="panel">
                ${alertMarkup()}
                <form id="login-form" class="form-grid" novalidate>
                    ${field({ id: "login-email", name: "email", label: "E-mail", type: "email", placeholder: "email@seuemail.com", required: true, autocomplete: "email" })}
                    ${field({ id: "login-password", name: "password", label: "Senha", type: "password", placeholder: "Sua senha", required: true, autocomplete: "current-password" })}
                    <p class="field-hint">Acessos de exemplo: camila@demo.hachi, leonardo@demo.hachi ou julia@demo.hachi. Senha: hachi123.</p>
                    <div class="form-footer">
                        <a class="text-link" href="#" data-action="forgot-password">Esqueci minha senha</a>
                        <span class="muted">Não possui uma conta? <a href="#register-1" data-route="register-1">Faça seu cadastro</a></span>
                    </div>
                    <button class="btn btn-dark btn-block" type="submit">Entrar</button>
                </form>
            </section>
            <div class="page-links"><button class="btn btn-quiet" type="button" data-action="feedback">Enviar feedback</button></div>
        </main>
        ${footer()}`;
    }

    function loyaltyScreen() {
        const stamps = Math.max(0, Number(state.user?.selos) || 0);
        const currentCardStamps = stamps % STAMPS_FOR_REWARD;
        const availableRewards = Math.floor(stamps / STAMPS_FOR_REWARD);
        const stampMarkup = Array.from({ length: STAMPS_FOR_REWARD }, (_, index) => {
            const earned = index < currentCardStamps;
            return `<span class="stamp ${earned ? "is-earned" : ""}" role="img" aria-label="Selo ${index + 1} de 12: ${earned ? "Registrado" : "Pendente"}">${earned ? "✓" : index + 1}</span>`;
        }).join("");

        return `${header({ authenticated: true })}
        <main id="main-content" class="page page-medium" role="main">
            <div class="page-heading">
                <p class="eyebrow">Olá, ${escapeHtml(fullName().split(/\s+/)[0])}</p>
                <h1>Minha fidelidade</h1>
                <p>Acompanhe seus selos e veja quando chega a hora do próximo resgate.</p>
            </div>
            ${alertMarkup()}
            <div class="alert alert-warning"><p>Modo local: suas alterações ficam somente neste navegador e não são sincronizadas.</p></div>
            <div class="loyalty-layout">
                <section class="card loyalty-card" aria-labelledby="stamp-card-title">
                    <div class="loyalty-card-header">
                        <div>
                            <h2 id="stamp-card-title">Meu cartão de fidelidade</h2>
                            <p>A cada compra, um novo selo aproxima você do próximo resgate.</p>
                        </div>
                        <span class="stamp-count"><strong>${currentCardStamps}</strong> / ${STAMPS_FOR_REWARD}</span>
                    </div>
                    <h3>Seus selos</h3>
                    <div class="stamp-grid">${stampMarkup}</div>
                    <p class="stamp-note">Complete seu cartão com 12 selos e escolha um dos itens disponíveis para resgate. A cada compra acima de R$ 40,00 você ganha um selo.</p>
                    <div class="stamp-actions">
                        <button class="btn btn-dark" type="button" data-action="scan-code">▦ Escanear QR Code</button>
                        <span class="divider">ou</span>
                        <button class="btn btn-secondary" type="button" data-action="enter-code">Digitar código manualmente</button>
                    </div>
                </section>
                <section class="card reward-card" aria-labelledby="reward-title">
                    <div>
                        <p class="eyebrow">Sua próxima recompensa</p>
                        <h2 id="reward-title">Escolha seu próximo resgate.</h2>
                        <p class="reward-count">Você já pode resgatar: ${String(availableRewards).padStart(2, "0")} ${availableRewards === 1 ? "item" : "itens"}</p>
                        <p>${availableRewards > 0
                            ? "Apresente o bilhete no estabelecimento para escolher seu item."
                            : `Faltam ${STAMPS_FOR_REWARD - currentCardStamps} selo(s) para liberar seu próximo resgate.`}</p>
                    </div>
                    <div class="stack">
                        <button class="btn btn-primary btn-block" type="button" data-action="redeem" ${availableRewards < 1 ? "disabled" : ""}>Fazer resgate</button>
                        <button class="btn btn-secondary btn-block" type="button" data-route="catalog">Cardápio</button>
                    </div>
                </section>
            </div>
            <div class="page-links">
                <button class="btn btn-quiet" type="button" data-action="feedback">Enviar feedback</button>
            </div>
        </main>
        ${footer()}`;
    }

    function profileScreen() {
        const user = state.user || {};
        const rows = [
            ["Contato", user.telefone ? formatPhone(user.telefone) : "Não informado"],
            ["E-mail", user.email || "Não informado"],
            ["Data de nascimento", formatDate(user.dtNasc)],
            ["Cidade", [user.cidade, user.regiao].filter(Boolean).join(" · ") || "Não informado"]
        ];
        return `${header({ back: "loyalty", title: "Perfil", authenticated: true })}
        <main id="main-content" class="page page-narrow" role="main">
            <div class="page-heading"><p class="eyebrow">Sua conta</p><h1>Perfil</h1></div>
            <section class="panel">
                <div class="profile-summary">
                    <span class="avatar avatar-large" aria-hidden="true">${escapeHtml(initials(fullName()))}</span>
                    <h2>${escapeHtml(fullName())}</h2>
                    <button class="btn btn-secondary btn-small" type="button" data-action="edit-profile">Editar informações</button>
                </div>
                <dl class="data-list">${rows.map(([label, value]) => `<div class="data-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
                <div class="profile-actions">
                    <button class="btn btn-secondary btn-block" type="button" data-action="logout">Sair da conta</button>
                    <button class="btn btn-quiet btn-block text-link-danger" type="button" data-action="edit-profile">Editar informações e excluir conta</button>
                </div>
            </section>
        </main>
        ${footer()}`;
    }

    function formatPhone(value) {
        const digits = String(value || "").replace(/\D/g, "").slice(-11);
        if (digits.length === 11) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        return value || "Não informado";
    }

    function catalogScreen() {
        const categories = ["Todas", ...new Set(state.categories.map((category) => category.nome).filter(Boolean))];
        const selected = state.selectedCategory;
        const visibleProducts = state.products.filter((product) =>
            Number(product.disponivel) !== 0 &&
            (selected === "Todas" || product.nomeCategoria === selected)
        );
        const content = state.productsLoading
            ? `<div class="grid grid-3">${Array.from({ length: 6 }, () => `<div class="card stack"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="width:60%"></div><div class="skeleton"></div></div>`).join("")}</div>`
            : state.productsError
                ? `<div class="alert alert-error"><p>${escapeHtml(state.productsError)}</p></div>`
                : visibleProducts.length
                    ? `<div class="product-grid">${visibleProducts.map(productCard).join("")}</div>`
                    : `<div class="empty-state"><strong>Não há itens disponíveis nesta categoria.</strong><span>Escolha outra categoria para continuar.</span></div>`;

        return `${header({ back: "loyalty", authenticated: true })}
        <main id="main-content" class="page page-wide" role="main">
            <div class="page-heading">
                <p class="eyebrow">Conheça os sabores da Hachi</p>
                <h1>Cardápio</h1>
                <p>Peça no totem ou caixa. Este cardápio é para consulta.</p>
            </div>
            ${alertMarkup()}
            <section class="panel">
                <div class="catalog-toolbar">
                    <div class="category-pills" aria-label="Filtrar por categoria">
                        ${categories.map((category) => `<button class="pill" type="button" data-category="${escapeHtml(category)}" aria-pressed="${selected === category}">${escapeHtml(category)}</button>`).join("")}
                    </div>
                    <span class="demo-badge">Cardápio local</span>
                </div>
                ${content}
            </section>
        </main>
        ${footer()}`;
    }

    function productCard(product) {
        const image = product.imagemUrl && safeHttpUrl(product.imagemUrl)
            ? `<img loading="lazy" src="${escapeHtml(product.imagemUrl)}" alt="">`
            : `<span aria-hidden="true">${productIcon(product.nomeCategoria)}</span>`;
        return `<article class="card product-card">
            <div class="product-art">${image}</div>
            <div class="inline-actions"><span class="badge">${escapeHtml(product.nomeCategoria || "Cardápio")}</span><span class="meta">#${escapeHtml(product.idProduto || "")}</span></div>
            <h3>${escapeHtml(product.nome || "Produto")}</h3>
            <p>${escapeHtml(product.descricao || "Consulte a equipe da Hachi para saber mais.")}</p>
            <strong class="product-price">${formatCurrency(product.preco)}</strong>
        </article>`;
    }

    function safeHttpUrl(value) {
        try {
            return ["http:", "https:"].includes(new URL(value, window.location.href).protocol);
        } catch {
            return false;
        }
    }

    function productIcon(category) {
        if (/café/i.test(category || "")) return "☕";
        if (/salgad/i.test(category || "")) return "🥟";
        return "🍡";
    }

    function dashboardScreen() {
        const dashboard = state.dashboard;
        const feedbacks = dashboard?.feedbacks || [];
        const redemptions = withinSelectedPeriod(dashboard?.redemptions || []);
        const users = (dashboard?.users || []).filter((user) => Number(user.funcao) === 0);
        const periodFeedbacks = withinSelectedPeriod(feedbacks);
        const recent = filteredFeedbacks(feedbacks);
        const average = periodFeedbacks.length
            ? (periodFeedbacks.reduce((sum, item) => sum + Number(item.nota || 0), 0) / periodFeedbacks.length).toFixed(1)
            : "—";
        const locations = locationSummary(users);
        const metrics = [
            ["Ticket médio", "—", "Pedidos não são registrados neste protótipo local."],
            ["Avaliação média", periodFeedbacks.length ? `${average} / 5` : "—", `${periodFeedbacks.length} feedback(s) no período`],
            ["Total de clientes", users.length.toLocaleString("pt-BR"), "Contas salvas neste navegador"],
            ["Resgates realizados", redemptions.length.toLocaleString("pt-BR"), "Resgates locais no período."]
        ];

        return `${header({ authenticated: true, admin: true })}
        <main id="main-content" class="page page-wide" role="main">
            <div class="dashboard-header page-heading">
                <div><p class="eyebrow">Visão do estabelecimento</p><h1>Painel Administrativo</h1><p>Olá, ${escapeHtml(fullName())}. Acompanhe os feedbacks e dados disponíveis.</p></div>
                <span class="badge">Perfil administrativo</span>
            </div>
            <div class="alert alert-warning"><p>Os dados exibidos são locais e podem incluir exemplos fictícios; não representam resultados reais da Hachi.</p></div>
            ${state.dashboardLoading ? `<div class="grid grid-4">${Array.from({ length: 4 }, () => `<div class="card stack"><div class="skeleton" style="width:45%"></div><div class="skeleton" style="height:34px"></div><div class="skeleton"></div></div>`).join("")}</div>` : ""}
            ${state.dashboardError ? `<div class="alert alert-error" role="alert"><p>${escapeHtml(state.dashboardError)} <button class="btn btn-quiet btn-small" type="button" data-action="refresh-dashboard">Tentar novamente</button></p></div>` : ""}
            <div class="filter-row">
                <h2 class="sr-only">Período dos feedbacks</h2>
                <div class="period-pills" aria-label="Período dos feedbacks">
                    ${[7, 30, 90].map((days) => `<button class="pill" type="button" data-period="${days}" aria-pressed="${state.selectedPeriod === days}">${days} dias</button>`).join("")}
                </div>
                <span class="meta">Dados armazenados neste navegador</span>
            </div>
            <section class="grid grid-4" aria-label="Indicadores">
                ${metrics.map(([label, value, note]) => `<article class="card kpi-card"><p class="kpi-label">${escapeHtml(label)}</p><p class="kpi-value">${escapeHtml(value)}</p><p class="kpi-note">${escapeHtml(note)}</p></article>`).join("")}
            </section>
            <div class="dashboard-content">
                <section class="card stack" aria-labelledby="feedback-heading">
                    <div class="filter-row"><div><p class="eyebrow">A voz dos clientes</p><h2 id="feedback-heading">Feedbacks recebidos</h2></div><span class="badge">${recent.length} no período</span></div>
                    <div class="rating-filters" aria-label="Filtrar por nota">
                        ${["Todas", 5, 4, 3, 2, 1].map((rating) => `<button class="pill" type="button" data-rating-filter="${rating}" aria-pressed="${String(state.selectedRatingFilter) === String(rating)}">${rating === "Todas" ? "Todas" : `${rating} estrela(s)`}</button>`).join("")}
                    </div>
                    ${recent.length
                        ? `<div class="feedback-list">${recent.map((item) => feedbackCard(item, users)).join("")}</div>`
                        : `<div class="empty-state"><strong>Nenhum feedback registrado neste período.</strong><span>As avaliações enviadas aparecerão aqui.</span></div>`}
                </section>
                <aside class="stack">
                    <section class="card">
                        <p class="eyebrow">Perfil dos clientes</p>
                        <h2>Distribuição por cidade e região</h2>
                        ${locations.length
                            ? `<div class="location-list">${locations.map((item) => `<div class="location-row"><div class="location-label"><span>${escapeHtml(item.name)}</span><strong>${item.percent}%</strong></div><div class="location-track" role="img" aria-label="${escapeHtml(item.name)}: ${item.percent}%"><div class="location-fill" style="width:${item.percent}%"></div></div><span class="meta">${item.count} cliente(s)</span></div>`).join("")}</div>`
                            : `<p class="muted">Ainda não há localização disponível nos cadastros.</p>`}
                    </section>
                    <section class="card">
                        <p class="eyebrow">Experiência do cliente</p>
                        <h2>Notas das avaliações</h2>
                        <div id="react-rating-chart"></div>
                        <p class="field-hint">Distribuição dos feedbacks por nota neste período.</p>
                    </section>
                </aside>
            </div>
        </main>
        ${footer()}`;
    }

    function feedbackCard(item, users) {
        const user = users.find((entry) => Number(entry.idUsuario) === Number(item.idUsuario));
        const rating = Math.max(0, Math.min(5, Number(item.nota) || 0));
        return `<article class="feedback-item">
            <div class="feedback-item-header">
                <strong>${escapeHtml(user?.nome || "Cliente")}</strong>
                <time class="meta" datetime="${escapeHtml(item.dataHora || "")}">${escapeHtml(formatDate(item.dataHora))}</time>
            </div>
            <div class="feedback-item-header"><span class="stars" aria-label="${rating} de 5 estrelas">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span><span class="badge">${rating}/5</span></div>
            <p>${escapeHtml(item.comentario || "")}</p>
        </article>`;
    }

    function filteredFeedbacks(feedbacks) {
        const periodIds = new Set(withinSelectedPeriod(feedbacks));
        return feedbacks
            .filter((item) => {
                const matchesPeriod = periodIds.has(item);
                const matchesRating = state.selectedRatingFilter === "Todas" ||
                    Number(item.nota) === Number(state.selectedRatingFilter);
                return matchesPeriod && matchesRating;
            })
            .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
    }

    function withinSelectedPeriod(feedbacks) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - state.selectedPeriod);
        return feedbacks.filter((item) => {
            const date = new Date(item.dataHora || 0);
            return !Number.isNaN(date.getTime()) && date >= cutoff;
        });
    }

    function locationSummary(users) {
        const counts = new Map();
        users.forEach((user) => {
            const name = [user.cidade, user.regiao].filter(Boolean).join(" · ");
            if (name) counts.set(name, (counts.get(name) || 0) + 1);
        });
        const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
        return [...counts.entries()]
            .map(([name, count]) => ({ name, count, percent: total ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }

    function attendantScreen() {
        return `${header({ authenticated: true })}
        <main id="main-content" class="page page-narrow" role="main">
            <div class="brand-heading"><img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial"><p class="eyebrow">Área da equipe</p><h1>Novo registro</h1><p class="muted">Informe o valor da compra para gerar o selo.</p></div>
            <section class="panel">
                ${alertMarkup()}
                <form id="attendant-form" class="form-grid" novalidate>
                    ${field({ id: "purchase-value", label: "Insira o valor da compra", type: "number", placeholder: "Ex.: 52,00", required: true, min: "40", inputmode: "decimal", hint: "Mínimo de R$ 40,00" })}
                    <button class="btn btn-dark btn-block" type="submit">Confirmar e gerar código</button>
                </form>
            </section>
        </main>
        ${footer()}`;
    }

    function attendantCodeScreen() {
        const code = state.attendantCode;
        if (!code) {
            return `${header({ authenticated: true })}<main id="main-content" class="page page-narrow" role="main"><section class="panel empty-state"><strong>Nenhum código foi gerado.</strong><button class="btn btn-primary" type="button" data-route="attendant">Novo registro</button></section></main>${footer()}`;
        }
        return `${header({ authenticated: true })}
        <main id="main-content" class="page page-narrow" role="main">
            <div class="page-heading"><p class="eyebrow">Registro concluído</p><h1>Escanear QR Code</h1><p>Aponte a câmera para o código ou informe o código manualmente.</p></div>
            <section class="panel stack">
                <div class="alert alert-warning"><p>Código local de demonstração: funciona somente neste navegador.</p></div>
                <div class="code-display">
                    <p class="muted">Use este QR Code para registrar o selo.</p>
                    <div id="qr-display">${qrSvgMarkup(code)}</div>
                    <p class="code-value" aria-label="Código de compra">${escapeHtml(code)}</p>
                    ${state.attendantPurchase ? `<span class="badge">Compra de ${formatCurrency(state.attendantPurchase)}</span>` : ""}
                </div>
                <p class="field-hint">O cliente pode escanear o QR Code ou digitar o código de seis caracteres.</p>
                <button class="btn btn-dark btn-block" type="button" data-route="attendant">Concluído</button>
            </section>
        </main>
        ${footer()}`;
    }

    function footer() {
        return `<footer class="app-footer">Hachi Conecta · Uma experiência mais próxima, visita após visita.</footer>`;
    }

    function screenContent() {
        switch (state.screen) {
            case "register-1": return registerStepOneScreen();
            case "register-2": return registerStepTwoScreen();
            case "login": return loginScreen();
            case "loyalty": return loyaltyScreen();
            case "profile": return profileScreen();
            case "catalog": return catalogScreen();
            case "dashboard": return dashboardScreen();
            case "attendant": return attendantScreen();
            case "attendant-code": return attendantCodeScreen();
            default: return homeScreen();
        }
    }

    function render() {
        const screenChanged = lastRenderedScreen !== state.screen;
        if (!state.modal && modalCloseTimer !== null) {
            window.clearTimeout(modalCloseTimer);
            modalCloseTimer = null;
        }
        document.body.classList.toggle("modal-open", Boolean(state.modal));
        if (ratingRoot) {
            ratingRoot.unmount();
            ratingRoot = null;
        }
        flushSync(() => {
            reactRoot.render(React.createElement("div", {
                className: "react-app-frame",
                dangerouslySetInnerHTML: { __html: `${screenContent()}${state.modal ? renderModal(state.modal) : ""}` }
            }));
        });
        if (screenChanged) {
            app.querySelector(".page")?.classList.add("page-entering");
            lastRenderedScreen = state.screen;
        }
        const ratingContainer = app.querySelector("#react-rating-chart");
        if (ratingContainer) {
            ratingRoot = createRoot(ratingContainer);
            ratingRoot.render(React.createElement(RatingDistribution, {
                feedbacks: withinSelectedPeriod(state.dashboard?.feedbacks || [])
            }));
        }
    }

    function afterRender() {
        if (state.modal) {
            const dialog = app.querySelector("[role='dialog']");
            const firstControl = dialog?.querySelector("button, input, textarea, select");
            firstControl?.focus();
            if (state.modal.type === "scan") startCameraScanner();
            return;
        }
        if (state.screen === "catalog" && !state.productsLoaded && !state.productsLoading) loadProducts();
        if (state.screen === "dashboard" && !state.dashboardLoaded && !state.dashboardLoading) loadDashboard();
    }

    function navigateRoute(screen) {
        const protectedScreens = new Set(["loyalty", "profile", "catalog", "dashboard", "attendant", "attendant-code"]);
        if (protectedScreens.has(screen) && !state.user) {
            state.alert = { type: "warning", message: "Entre na sua conta para continuar." };
            go("login", { preserveAlert: true });
            return;
        }
        if (screen === "dashboard" && !isAdmin()) {
            state.alert = { type: "error", message: "Acesso restrito à administração." };
            go(state.user ? routeForUser() : "login", { preserveAlert: true });
            return;
        }
        if ((screen === "attendant" || screen === "attendant-code") && !isEmployee()) {
            state.alert = { type: "error", message: "Acesso disponível somente para a equipe da Hachi." };
            go(state.user ? routeForUser() : "login", { preserveAlert: true });
            return;
        }
        if (screen === "loyalty" && !isCustomer()) {
            go(state.user ? routeForUser() : "login");
            return;
        }
        state.screen = screen;
        state.modal = null;
        state.restoreFocus = null;
        state.alert = null;
        state.dashboardLoaded = screen === "dashboard" ? state.dashboardLoaded : false;
        state.productsLoaded = screen === "catalog" ? state.productsLoaded : false;
        if (window.location.hash === `#${screen}`) {
            render();
            afterRender();
        } else {
            window.location.hash = screen;
        }
    }

    function openModal(type, options = {}) {
        if (modalCloseTimer !== null) {
            window.clearTimeout(modalCloseTimer);
            modalCloseTimer = null;
        }
        if (!state.restoreFocus) state.restoreFocus = captureFocusTarget(document.activeElement);
        state.modal = { type, ...options };
        state.alert = null;
        render();
        afterRender();
    }

    function captureFocusTarget(element) {
        if (!(element instanceof HTMLElement)) return null;
        const attributes = ["id", "data-action", "data-route", "data-legal", "data-demo-role", "aria-label", "href"]
            .filter((name) => element.hasAttribute(name))
            .reduce((result, name) => ({ ...result, [name]: element.getAttribute(name) }), {});
        const tagName = element.tagName.toLowerCase();
        const matchingElements = [...app.querySelectorAll(tagName)].filter((candidate) =>
            Object.entries(attributes).every(([name, value]) => candidate.getAttribute(name) === value)
        );
        return { tagName, attributes, index: Math.max(0, matchingElements.indexOf(element)) };
    }

    function restoreModalFocus(target) {
        if (target instanceof HTMLElement && target.isConnected) {
            target.focus();
            return;
        }
        if (!target?.tagName) return;
        const candidates = [...app.querySelectorAll(target.tagName)].filter((candidate) =>
            Object.entries(target.attributes).every(([name, value]) => candidate.getAttribute(name) === value)
        );
        candidates[target.index]?.focus();
    }

    function closeModal() {
        if (!state.modal || modalCloseTimer !== null) return;
        stopCameraScanner();
        const backdrop = app.querySelector(".modal-backdrop");
        const finishClose = () => {
            modalCloseTimer = null;
            const restoreFocus = state.restoreFocus;
            state.modal = null;
            state.restoreFocus = null;
            render();
            restoreModalFocus(restoreFocus);
        };
        if (!backdrop) {
            finishClose();
            return;
        }
        backdrop.classList.add("is-closing");
        const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        modalCloseTimer = window.setTimeout(finishClose, reducedMotion ? 0 : MODAL_CLOSE_DURATION);
    }

    function modalShell(title, content, { size = "modal-small", labelledBy = "dialog-title" } = {}) {
        return `<div class="modal-backdrop" data-action="backdrop-close">
            <section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}" tabindex="-1">
                <div class="modal-header"><h2 id="${labelledBy}">${escapeHtml(title)}</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button></div>
                ${content}
            </section>
        </div>`;
    }

    function renderModal(modal) {
        if (modal.type === "scan") {
            const cameraMessage = modal.cameraError || "Permita o acesso à câmera ou digite o código abaixo.";
            const content = `<p class="modal-copy">Enquadre o QR Code da compra. Se preferir, informe o código manualmente.</p>
                <div class="scanner-frame"><video id="scanner-video" playsinline muted aria-label="Pré-visualização da câmera para ler o QR Code"></video><div class="scanner-placeholder" id="scanner-placeholder">${escapeHtml(cameraMessage)}</div></div>
                <form id="manual-code-form" class="form-grid" novalidate>
                    ${field({ id: "manual-code", label: "Informar manualmente", placeholder: "A12BC3", required: true, hint: "Digite o código de seis caracteres recebido na compra." })}
                    ${alertMarkup(modal.error ? { type: "error", message: modal.error } : null)}
                    <button class="btn btn-dark btn-block" type="submit">Registrar selo</button>
                </form>`;
            return modalShell("Aponte para o QR Code", content, { size: "modal-medium" });
        }

        if (modal.type === "redeem") {
            const content = `<p class="modal-copy">Você precisa estar no estabelecimento da Hachi para obter o resgate.</p>
                <p>Você confirma que realmente quer realizar um resgate?</p>
                <div class="alert alert-warning"><p><strong>Esta ação consumirá 12 selos da sua conta e não tem volta.</strong></p></div>
                ${alertMarkup(modal.error ? { type: "error", message: modal.error } : null)}
                <div class="modal-actions">
                    <button class="btn btn-dark btn-block" type="button" data-action="confirm-redeem">Sim, confirmar o resgate</button>
                    <button class="btn btn-secondary btn-block" type="button" data-action="close-modal">Cancelar resgate</button>
                </div>`;
            return modalShell("Confirmar resgate", content, { size: "modal-small" });
        }

        if (modal.type === "ticket") {
            const content = `<div class="ticket">
                    <div class="ticket-icon" aria-hidden="true">♥</div>
                    <h3>Apresente esta tela ao atendente</h3>
                    <p><strong>Cliente:</strong> ${escapeHtml(fullName())}</p>
                    <p>Direito a resgate de <strong>01 item</strong>.</p>
                    <p class="field-hint">Escolha seu item disponível no balcão da Hachi.</p>
                </div>
                <div class="modal-actions"><button class="btn btn-dark btn-block" type="button" data-action="close-modal">Concluído</button></div>`;
            return modalShell("Bilhete de resgate", content, { size: "modal-small" });
        }

        if (modal.type === "feedback") {
            const content = `<p class="modal-copy">O que achou da sua experiência com a Hachi?</p>
                <form id="feedback-form" class="form-grid" novalidate>
                    <fieldset class="field" style="border:0;padding:0;margin:0">
                        <legend class="field-label">Nota de avaliação</legend>
                        <div class="star-picker" role="group" aria-label="Escolha uma nota de 1 a 5 estrelas">
                            ${[1, 2, 3, 4, 5].map((rating) => `<button type="button" data-rating="${rating}" tabindex="${rating === state.selectedRating ? "0" : "-1"}" aria-pressed="${rating === state.selectedRating}" aria-label="${rating} ${rating === 1 ? "estrela" : "estrelas"}">${rating <= state.selectedRating ? "★" : "☆"}</button>`).join("")}
                        </div>
                        <p class="star-picker-hint">Use as setas do teclado ou passe o cursor para escolher uma nota.</p>
                    </fieldset>
                    <div class="field"><label for="feedback-comment">Detalhe seu feedback *</label><textarea class="textarea" id="feedback-comment" name="comentario" maxlength="255" required placeholder="Conte para nós como foi sua visita."></textarea><p class="field-hint">Até 255 caracteres. Seu feedback é enviado para análise interna.</p></div>
                    ${alertMarkup(modal.error ? { type: "error", message: modal.error } : null)}
                    <button class="btn btn-dark btn-block" type="submit">Enviar feedback</button>
                </form>`;
            return modalShell("Enviar feedback", content, { size: "modal-medium" });
        }

        if (modal.type === "edit-profile") {
            const user = state.user || {};
            const nameParts = String(user.nome || "").split(/\s+/);
            const content = `<form id="edit-profile-form" class="form-grid" novalidate>
                    ${field({ id: "edit-first-name", label: "Nome", value: nameParts.shift() || "", required: true, autocomplete: "given-name" })}
                    ${field({ id: "edit-last-name", label: "Sobrenome", value: nameParts.join(" "), required: true, autocomplete: "family-name" })}
                    ${field({ id: "edit-phone", label: "Contato", type: "tel", value: user.telefone || "", required: true, autocomplete: "tel" })}
                    ${field({ id: "edit-email", label: "E-mail", type: "email", value: user.email || "", required: true, autocomplete: "email" })}
                    ${field({ id: "edit-birth-date", label: "Data de nascimento", type: "date", value: user.dtNasc || "", required: true, autocomplete: "bday" })}
                    ${field({ id: "edit-city", label: "Cidade", value: user.cidade || "", required: true })}
                    ${field({ id: "edit-region", label: "Região", value: user.regiao || "", required: true })}
                    ${alertMarkup(modal.error ? { type: "error", message: modal.error } : null)}
                    <button class="btn btn-dark btn-block" type="submit">Salvar alterações</button>
                    <button class="btn btn-quiet btn-block text-link-danger" type="button" data-action="confirm-delete">Excluir conta</button>
                </form>`;
            return modalShell("Editar informações", content, { size: "modal-medium" });
        }

        if (modal.type === "delete-account") {
            const content = `<p class="modal-copy">Excluir sua conta é uma ação irreversível. Seu acesso será desativado.</p>
                ${alertMarkup(modal.error ? { type: "error", message: modal.error } : null)}
                <div class="modal-actions">
                    <button class="btn btn-danger btn-block" type="button" data-action="delete-account">Confirmar exclusão</button>
                    <button class="btn btn-secondary btn-block" type="button" data-action="edit-profile">Voltar</button>
                </div>`;
            return modalShell("Excluir conta?", content, { size: "modal-small" });
        }

        if (modal.type === "legal") {
            const content = `<div class="alert alert-info"><p>O conteúdo oficial de ${escapeHtml(modal.name)} ainda precisa ser fornecido pelo grupo e pelo estabelecimento.</p></div>
                <p class="modal-copy">O projeto prevê disponibilizar as informações de privacidade antes do uso. Este protótipo não substitui os documentos legais aprovados.</p>
                <div class="modal-actions"><button class="btn btn-dark btn-block" type="button" data-action="close-modal">Entendi</button></div>`;
            return modalShell(modal.name, content, { size: "modal-small" });
        }

        return "";
    }

    function setBusy(button, busy) {
        if (!button) return;
        button.disabled = busy;
        button.classList.toggle("btn-loading", busy);
        button.setAttribute("aria-busy", String(busy));
    }

    function formValues(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
    }

    function validateBirthDate(value) {
        if (!value) return false;
        const date = new Date(`${value}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date < new Date();
    }

    function normalizePhone(value) {
        return String(value || "").replace(/\D/g, "").slice(-11);
    }

    function setScreenAlert(type, message) {
        state.alert = { type, message };
        render();
    }

    function showFormError(form, message) {
        const existing = form.querySelector(".alert");
        if (existing) existing.remove();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = alertMarkup({ type: "error", message });
        form.prepend(wrapper.firstElementChild);
    }

    async function handleRegisterStepOne(form) {
        const values = formValues(form);
        const firstName = String(values["first-name"] || "").trim();
        const lastName = String(values["last-name"] || "").trim();
        const birthDate = String(values["birth-date"] || "");
        if (!firstName || !lastName || !validateBirthDate(birthDate)) {
            showFormError(form, "Confira seu nome, sobrenome e uma data de nascimento válida.");
            return;
        }
        saveRegisterDraft({ ...state.registerDraft, firstName, lastName, birthDate });
        go("register-2");
    }

    async function handleRegisterStepTwo(form, submitButton) {
        const values = formValues(form);
        const firstName = String(state.registerDraft.firstName || "").trim();
        const lastName = String(state.registerDraft.lastName || "").trim();
        const phone = normalizePhone(values.phone);
        const email = String(values.email || "").trim().toLowerCase();
        const postalCode = String(values["postal-code"] || "").replace(/\D/g, "");
        const city = String(values.city || "").trim();
        const region = String(values.region || "").trim();
        const password = String(values.password || "");
        const confirmPassword = String(values["confirm-password"] || "");
        const termsAccepted = form.querySelector("#terms-accepted")?.checked === true;

        if (!firstName || !lastName || !validateBirthDate(state.registerDraft.birthDate)) {
            showFormError(form, "Volte à etapa anterior e confira seus dados pessoais.");
            return;
        }
        if (phone.length < 10 || phone.length > 11 || !validateEmail(email) || (postalCode && postalCode.length !== 8) || !city || !region) {
            showFormError(form, "Confira seu telefone, e-mail, cidade e bairro ou região.");
            return;
        }
        if (password.length < 8 || password.length > 72) {
            showFormError(form, "Sua senha deve ter entre 8 e 72 caracteres.");
            return;
        }
        if (password !== confirmPassword) {
            showFormError(form, "As senhas não são iguais. Confira e tente novamente.");
            return;
        }
        if (!termsAccepted) {
            showFormError(form, "Aceite os termos de uso e a política de privacidade para continuar.");
            return;
        }
        const payload = {
            nome: `${firstName} ${lastName}`,
            email,
            senha: password,
            telefone: phone,
            dtNasc: state.registerDraft.birthDate,
            cidade: city,
            regiao: region,
            cep: postalCode
        };
        saveRegisterDraft({ ...state.registerDraft, phone, email, postalCode, city, region });
        setBusy(submitButton, true);
        try {
            const database = getDemoDatabase();
            if (database.users.some((user) => user.email.toLowerCase() === email)) {
                throw new Error("Este e-mail já está cadastrado. Entre na sua conta.");
            }
            const user = {
                idUsuario: Date.now(),
                ...payload,
                funcao: 0,
                statusUsuario: 1,
                selos: 0,
                criadoEm: new Date().toISOString()
            };
            database.users.push(user);
            saveDemoDatabase(database);
            saveSessionUser(user);
            clearRegisterDraft();
            showToast("Conta criada. Que bom ter você por aqui!", "success");
            navigateRoute(routeForUser());
        } catch (error) {
            showFormError(form, error.message);
        } finally {
            setBusy(submitButton, false);
        }
    }

    async function handleLogin(form, submitButton) {
        const values = formValues(form);
        const email = String(values.email || "").trim().toLowerCase();
        const password = String(values.password || "");
        if (!validateEmail(email) || !password) {
            showFormError(form, "Informe um e-mail válido e sua senha.");
            return;
        }
        const user = getDemoDatabase().users.find((entry) =>
            entry.email.toLowerCase() === email &&
            entry.senha === password &&
            Number(entry.statusUsuario) === 1
        );
        if (!user) {
            showFormError(form, "E-mail ou senha incorretos. Cadastre uma conta neste navegador ou use um acesso de demonstração.");
            return;
        }
        saveSessionUser(user);
        state.dashboardLoaded = false;
        state.productsLoaded = false;
        state.attendantCode = null;
        showToast("Acesso local iniciado neste navegador.", "success");
        navigateRoute(routeForUser());
    }

    function loginDemo(role) {
        const database = getDemoDatabase();
        const roleValue = { client: 0, employee: 1, admin: 2 }[role];
        const user = database.users.find((entry) => Number(entry.funcao) === roleValue && Number(entry.statusUsuario) === 1);
        if (!user) {
            showToast("Não foi possível carregar o perfil de demonstração.", "error");
            return;
        }
        saveSessionUser(user);
        state.dashboardLoaded = false;
        state.productsLoaded = false;
        state.attendantCode = null;
        showToast("Perfil de exemplo aberto no modo local.", "warning");
        navigateRoute(routeForUser());
    }

    async function loadProducts() {
        state.productsLoading = true;
        state.productsError = null;
        render();
        try {
            const database = getDemoDatabase();
            state.products = database.products;
            state.categories = [...new Set(database.products.map((item) => item.nomeCategoria))].map((nome, index) => ({ idCategoria: index + 1, nome }));
            state.productsLoaded = true;
        } catch (error) {
            state.productsError = error.message;
        } finally {
            state.productsLoading = false;
            if (state.screen === "catalog") render();
        }
    }

    async function loadDashboard() {
        state.dashboardLoading = true;
        state.dashboardError = null;
        render();
        try {
            const database = getDemoDatabase();
            state.dashboard = { users: database.users, feedbacks: database.feedbacks, redemptions: database.redemptions };
            state.dashboardLoaded = true;
        } catch (error) {
            state.dashboardError = error.message;
        } finally {
            state.dashboardLoading = false;
            if (state.screen === "dashboard") render();
        }
    }

    async function registerStamp(code, form) {
        const normalizedCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
            if (form) showFormError(form, "Informe o código de seis letras ou números.");
            return;
        }
        const database = getDemoDatabase();
        const localCode = database.codes.find((entry) => entry.codigo === normalizedCode && !entry.used);
        if (!localCode) {
            if (form) showFormError(form, "Código inválido ou já utilizado. Gere um novo código na área do atendente.");
            return;
        }
        localCode.used = true;
        const user = getDemoUserById(database, state.user.idUsuario);
        user.selos = (Number(user.selos) || 0) + 1;
        saveDemoDatabase(database);
        saveSessionUser(user);
        closeModal();
        render();
        showToast("Selo registrado! Seu cartão está atualizado.", "success");
    }

    async function redeemReward() {
        if (!state.user || (Number(state.user.selos) || 0) < STAMPS_FOR_REWARD) {
            state.modal = { ...state.modal, error: "Saldo de selos insuficiente." };
            render();
            return;
        }
        const button = app.querySelector("[data-action='confirm-redeem']");
        setBusy(button, true);
        try {
            const database = getDemoDatabase();
            const user = getDemoUserById(database, state.user.idUsuario);
            user.selos = (Number(user.selos) || 0) - STAMPS_FOR_REWARD;
            database.redemptions.push({ id: Date.now(), idUsuario: user.idUsuario, dataHora: new Date().toISOString() });
            saveDemoDatabase(database);
            saveSessionUser(user);
            state.modal = { type: "ticket" };
            render();
            afterRender();
        } catch (error) {
            state.modal = { type: "redeem", error: error.message };
            render();
            afterRender();
        }
    }

    async function sendFeedback(form, submitButton) {
        const values = formValues(form);
        const comment = String(values.comentario || "").trim();
        if (!comment) {
            showFormError(form, "Conte um pouco sobre sua experiência para enviar o feedback.");
            return;
        }
        if (comment.length > 255) {
            showFormError(form, "Seu feedback deve ter até 255 caracteres.");
            return;
        }
        if (!state.user) {
            closeModal();
            setScreenAlert("warning", "Entre na sua conta para enviar seu feedback.");
            go("login");
            return;
        }
        setBusy(submitButton, true);
        try {
            const database = getDemoDatabase();
            database.feedbacks.unshift({
                idFeedback: Date.now(),
                idUsuario: state.user.idUsuario,
                nota: state.selectedRating,
                comentario: comment,
                dataHora: new Date().toISOString()
            });
            saveDemoDatabase(database);
            closeModal();
            showToast("Obrigado! Seu feedback foi enviado com sucesso.", "success");
        } catch (error) {
            showFormError(form, error.message);
        } finally {
            setBusy(submitButton, false);
        }
    }

    async function updateProfile(form, submitButton) {
        const values = formValues(form);
        const firstName = String(values["edit-first-name"] || "").trim();
        const lastName = String(values["edit-last-name"] || "").trim();
        const phone = normalizePhone(values["edit-phone"]);
        const email = String(values["edit-email"] || "").trim().toLowerCase();
        const birthDate = String(values["edit-birth-date"] || "");
        const city = String(values["edit-city"] || "").trim();
        const region = String(values["edit-region"] || "").trim();
        if (!firstName || !lastName || phone.length < 10 || !validateEmail(email) || !validateBirthDate(birthDate) || !city || !region) {
            showFormError(form, "Confira os campos obrigatórios antes de salvar.");
            return;
        }
        const payload = {
            nome: `${firstName} ${lastName}`,
            telefone: phone,
            email,
            dtNasc: birthDate,
            cidade: city,
            regiao: region
        };
        setBusy(submitButton, true);
        try {
            const database = getDemoDatabase();
            const duplicateEmail = database.users.some((user) =>
                Number(user.idUsuario) !== Number(state.user.idUsuario) &&
                user.email.toLowerCase() === email
            );
            if (duplicateEmail) {
                throw new Error("Este e-mail já está sendo usado por outra conta.");
            }
            const updated = getDemoUserById(database, state.user.idUsuario);
            Object.assign(updated, payload, { atualizadoEm: new Date().toISOString() });
            saveDemoDatabase(database);
            saveSessionUser(updated);
            state.modal = null;
            render();
            showToast("Dados atualizados com sucesso!", "success");
        } catch (error) {
            showFormError(form, error.message);
        } finally {
            setBusy(submitButton, false);
        }
    }

    async function deleteAccount() {
        if (!state.user) return;
        try {
            const database = getDemoDatabase();
            database.users = database.users.filter((user) => Number(user.idUsuario) !== Number(state.user.idUsuario));
            database.feedbacks = database.feedbacks.filter((feedback) => Number(feedback.idUsuario) !== Number(state.user.idUsuario));
            database.redemptions = database.redemptions.filter((entry) => Number(entry.idUsuario) !== Number(state.user.idUsuario));
            saveDemoDatabase(database);
            clearSession();
            go("home");
            showToast("Sua conta foi desativada.", "success");
        } catch (error) {
            state.modal = { type: "delete-account", error: error.message };
            render();
        }
    }

    async function logout() {
        clearSession();
        go("home");
        showToast("Você saiu da sua conta.", "success");
    }

    async function generateAttendantCode(form, submitButton) {
        const values = formValues(form);
        const amount = Number(String(values["purchase-value"] || "").replace(",", "."));
        if (!Number.isFinite(amount) || amount < MIN_PURCHASE) {
            showFormError(form, "O valor mínimo para gerar um selo é R$ 40,00.");
            return;
        }
        setBusy(submitButton, true);
        try {
            const database = getDemoDatabase();
            const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let generated;
            do {
                generated = "";
                for (let index = 0; index < 6; index++) generated += alphabet[Math.floor(Math.random() * alphabet.length)];
            } while (database.codes.some((entry) => entry.codigo === generated));
            database.codes.push({ codigo: generated, valor: amount, used: false });
            saveDemoDatabase(database);
            state.attendantCode = generated.toUpperCase();
            state.attendantPurchase = amount;
            navigateRoute("attendant-code");
        } catch (error) {
            showFormError(form, error.message);
        } finally {
            setBusy(submitButton, false);
        }
    }

    function startCameraScanner() {
        if (state.modal?.type !== "scan") return;
        const video = document.getElementById("scanner-video");
        const placeholder = document.getElementById("scanner-placeholder");
        if (!video || !placeholder) return;

        if (!navigator.mediaDevices?.getUserMedia || !("BarcodeDetector" in window)) {
            placeholder.textContent = "Leitor de QR indisponível neste navegador. Utilize a digitação manual abaixo.";
            return;
        }
        if (!window.isSecureContext && window.location.protocol !== "file:") {
            placeholder.textContent = "A câmera precisa de uma conexão segura. Utilize a digitação manual abaixo.";
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
            .then((stream) => {
                if (state.modal?.type !== "scan") {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                state.cameraStream = stream;
                video.srcObject = stream;
                placeholder.hidden = true;
                return video.play();
            })
            .then(() => scanFrame(video))
            .catch(() => {
                placeholder.hidden = false;
                placeholder.textContent = "Permissão de câmera negada. Utilize a digitação manual abaixo.";
            });
    }

    async function scanFrame(video) {
        if (!state.cameraStream || state.modal?.type !== "scan") return;
        try {
            const detector = new BarcodeDetector({ formats: ["qr_code"] });
            const codes = await detector.detect(video);
            if (codes.length && codes[0].rawValue) {
                await registerStamp(codes[0].rawValue);
                return;
            }
        } catch {
            const placeholder = document.getElementById("scanner-placeholder");
            if (placeholder) {
                placeholder.hidden = false;
                placeholder.textContent = "Não foi possível ler este QR Code. Digite o código abaixo.";
            }
            stopCameraScanner();
            return;
        }
        state.cameraTimer = window.setTimeout(() => scanFrame(video), 350);
    }

    function stopCameraScanner() {
        if (state.cameraTimer) window.clearTimeout(state.cameraTimer);
        state.cameraTimer = null;
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach((track) => track.stop());
            state.cameraStream = null;
        }
    }

    function gfMultiply(left, right) {
        let product = 0;
        let a = left;
        let b = right;
        while (b > 0) {
            if (b & 1) product ^= a;
            a <<= 1;
            if (a & 0x100) a ^= 0x11d;
            b >>>= 1;
        }
        return product;
    }

    function reedSolomonRemainder(data, degree) {
        let generator = [1];
        let root = 1;
        for (let index = 0; index < degree; index++) {
            const next = new Array(generator.length + 1).fill(0);
            generator.forEach((coefficient, position) => {
                next[position] ^= coefficient;
                next[position + 1] ^= gfMultiply(coefficient, root);
            });
            generator = next;
            root = gfMultiply(root, 2);
        }
        const message = [...data, ...new Array(degree).fill(0)];
        for (let index = 0; index < data.length; index++) {
            const factor = message[index];
            if (factor === 0) continue;
            generator.forEach((coefficient, position) => {
                message[index + position] ^= gfMultiply(coefficient, factor);
            });
        }
        return message.slice(data.length);
    }

    function qrSvgMarkup(value) {
        const bytes = Array.from(new TextEncoder().encode(value));
        if (bytes.length > 17) {
            return `<p class="field-error">Não foi possível criar o QR Code deste valor.</p>`;
        }

        const bits = [];
        const appendBits = (number, count) => {
            for (let bit = count - 1; bit >= 0; bit--) bits.push((number >>> bit) & 1);
        };
        appendBits(0b0100, 4);
        appendBits(bytes.length, 8);
        bytes.forEach((byte) => appendBits(byte, 8));
        const capacity = 19 * 8;
        for (let index = 0; index < Math.min(4, capacity - bits.length); index++) bits.push(0);
        while (bits.length % 8) bits.push(0);

        const data = [];
        for (let index = 0; index < bits.length; index += 8) {
            data.push(bits.slice(index, index + 8).reduce((valueSoFar, bit) => (valueSoFar << 1) | bit, 0));
        }
        for (let pad = 0; data.length < 19; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
        const codewords = [...data, ...reedSolomonRemainder(data, 7)];
        const size = 21;
        const matrix = Array.from({ length: size }, () => new Array(size).fill(false));
        const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
        const setModule = (x, y, dark, reserve = true) => {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            matrix[y][x] = Boolean(dark);
            if (reserve) reserved[y][x] = true;
        };
        const finder = (left, top) => {
            for (let dy = -1; dy <= 7; dy++) {
                for (let dx = -1; dx <= 7; dx++) {
                    const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
                    const dark = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
                    setModule(left + dx, top + dy, dark);
                }
            }
        };
        finder(0, 0);
        finder(size - 7, 0);
        finder(0, size - 7);
        for (let index = 8; index < size - 8; index++) {
            setModule(index, 6, index % 2 === 0);
            setModule(6, index, index % 2 === 0);
        }
        const formatPositions = [];
        for (let index = 0; index <= 5; index++) formatPositions.push([index, 8]);
        formatPositions.push([7, 8], [8, 8], [8, 7]);
        for (let index = 9; index < 15; index++) formatPositions.push([8, 14 - index]);
        for (let index = 0; index < 8; index++) formatPositions.push([8, size - 1 - index]);
        for (let index = 8; index < 15; index++) formatPositions.push([size - 15 + index, 8]);
        formatPositions.forEach(([x, y]) => setModule(x, y, false));
        setModule(8, 17, true);

        let bitIndex = 0;
        let upward = true;
        for (let right = size - 1; right > 0; right -= 2) {
            if (right === 6) right--;
            for (let vertical = 0; vertical < size; vertical++) {
                const row = upward ? size - 1 - vertical : vertical;
                for (let offset = 0; offset < 2; offset++) {
                    const col = right - offset;
                    if (reserved[row][col]) continue;
                    let dark = bitIndex < codewords.length * 8
                        ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1
                        : false;
                    bitIndex++;
                    if ((row + col) % 2 === 0) dark = !dark;
                    setModule(col, row, dark);
                }
            }
            upward = !upward;
        }

        const formatData = (0b01 << 3);
        let remainder = formatData;
        for (let index = 0; index < 10; index++) {
            remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
        }
        const formatBits = ((formatData << 10) | remainder) ^ 0x5412;
        formatPositions.forEach(([x, y], index) => {
            matrix[y][x] = ((formatBits >>> index) & 1) === 1;
        });
        matrix[17][8] = true;

        const quiet = 4;
        const total = size + quiet * 2;
        const rects = [];
        matrix.forEach((row, y) => row.forEach((dark, x) => {
            if (dark) rects.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
        }));
        return `<svg class="qr-code" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="QR Code do código ${escapeHtml(value)}" shape-rendering="crispEdges">
            <rect width="${total}" height="${total}" fill="#ffffff"/>
            <g fill="#211a16">${rects.join("")}</g>
        </svg>`;
    }

    function focusTrap(event) {
        const dialog = app.querySelector("[role='dialog']");
        if (!dialog || event.key !== "Tab") return;
        const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) {
            event.preventDefault();
            dialog.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!dialog.contains(document.activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function paintRatingPicker(picker, previewRating = null) {
        if (!picker) return;
        picker.querySelectorAll("[data-rating]").forEach((button) => {
            const rating = Number(button.dataset.rating);
            const displayedRating = previewRating ?? state.selectedRating;
            button.setAttribute("aria-pressed", String(rating === state.selectedRating));
            button.tabIndex = rating === state.selectedRating ? 0 : -1;
            button.classList.toggle("is-previewed", previewRating !== null && rating <= previewRating);
            button.textContent = rating <= displayedRating ? "★" : "☆";
        });
    }

    function handleRatingPointerOver(event) {
        const button = event.target.closest("[data-rating]");
        if (!button) return;
        paintRatingPicker(button.closest(".star-picker"), Number(button.dataset.rating));
    }

    function handleRatingPointerOut(event) {
        const picker = event.target.closest(".star-picker");
        if (!picker || picker.contains(event.relatedTarget)) return;
        paintRatingPicker(picker);
    }

    function handleClick(event) {
        const target = event.target.closest("[data-route], [data-action], [data-demo-role], [data-category], [data-period], [data-rating-filter], [data-rating]");
        if (!target) return;

        if (target.dataset.route) {
            event.preventDefault();
            navigateRoute(target.dataset.route);
            return;
        }
        if (target.dataset.demoRole) {
            loginDemo(target.dataset.demoRole);
            return;
        }
        if (target.dataset.category) {
            state.selectedCategory = target.dataset.category;
            render();
            return;
        }
        if (target.dataset.period) {
            state.selectedPeriod = Number(target.dataset.period);
            render();
            return;
        }
        if (target.dataset.ratingFilter) {
            state.selectedRatingFilter = target.dataset.ratingFilter;
            render();
            return;
        }
        if (target.dataset.rating) {
            state.selectedRating = Number(target.dataset.rating);
            paintRatingPicker(target.closest(".star-picker"));
            return;
        }

        switch (target.dataset.action) {
            case "profile":
                navigateRoute("profile");
                break;
            case "logout":
                logout();
                break;
            case "feedback":
                if (!state.user) {
                    state.alert = { type: "warning", message: "Entre na sua conta para enviar seu feedback." };
                    go("login", { preserveAlert: true });
                    return;
                }
                state.selectedRating = 5;
                openModal("feedback");
                break;
            case "scan-code":
                openModal("scan");
                break;
            case "enter-code":
                openModal("scan", { cameraError: "Digite o código de compra no campo abaixo." });
                break;
            case "redeem":
                openModal("redeem");
                break;
            case "confirm-redeem":
                redeemReward();
                break;
            case "edit-profile":
                openModal("edit-profile");
                break;
            case "confirm-delete":
                openModal("delete-account");
                break;
            case "delete-account":
                deleteAccount();
                break;
            case "close-modal":
                closeModal();
                break;
            case "backdrop-close":
                if (event.target === target) closeModal();
                break;
            case "forgot-password":
                event.preventDefault();
                showToast("O fluxo de recuperação de senha ainda não foi definido no briefing.", "info");
                break;
            case "legal":
                event.preventDefault();
                openModal("legal", { name: target.dataset.legal || "Documento legal" });
                break;
            case "refresh-dashboard":
                state.dashboardLoaded = false;
                loadDashboard();
                break;
        }
    }

    async function handleSubmit(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");

        if (form.id === "register-step-one") {
            await handleRegisterStepOne(form);
        } else if (form.id === "register-step-two") {
            await handleRegisterStepTwo(form, submitButton);
        } else if (form.id === "login-form") {
            await handleLogin(form, submitButton);
        } else if (form.id === "manual-code-form") {
            await registerStamp(formValues(form)["manual-code"], form);
        } else if (form.id === "feedback-form") {
            await sendFeedback(form, submitButton);
        } else if (form.id === "edit-profile-form") {
            await updateProfile(form, submitButton);
        } else if (form.id === "attendant-form") {
            await generateAttendantCode(form, submitButton);
        }
    }

    function handleInput(event) {
        if (event.target.id === "postal-code") {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
            event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
        }
        if (event.target.id === "phone" || event.target.id === "edit-phone") {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
            if (digits.length <= 2) event.target.value = digits ? `(${digits}` : "";
            else if (digits.length <= 7) event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
            else event.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        }
        if (event.target.id === "manual-code") {
            const start = event.target.selectionStart;
            event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
            if (event.target.value.length === 6) event.target.closest("form").requestSubmit();
            else if (start !== null) event.target.setSelectionRange(event.target.value.length, event.target.value.length);
        }
        const registrationForm = event.target.closest("#register-step-two");
        if (registrationForm) {
            const values = formValues(registrationForm);
            saveRegisterDraft({
                ...state.registerDraft,
                phone: values.phone || "",
                email: values.email || "",
                postalCode: String(values["postal-code"] || "").replace(/\D/g, ""),
                city: values.city || "",
                region: values.region || ""
            });
        }
    }

    function handleChange(event) {
        if (event.target.id === "terms-accepted") {
            saveRegisterDraft({ ...state.registerDraft, termsAccepted: event.target.checked });
        }
    }

    function handleKeydown(event) {
        focusTrap(event);
        const starButton = event.target.closest?.("[data-rating]");
        if (starButton && ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const nextRating = event.key === "Home" ? 1
                : event.key === "End" ? 5
                    : Math.min(5, Math.max(1, state.selectedRating + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1)));
            state.selectedRating = nextRating;
            const picker = starButton.closest(".star-picker");
            paintRatingPicker(picker);
            picker?.querySelector(`[data-rating="${nextRating}"]`)?.focus();
            return;
        }
        if (event.key === "Escape" && state.modal) {
            closeModal();
        }
    }

    function enforceRouteAccess(screen) {
        const protectedRoutes = new Set(["loyalty", "profile", "catalog", "dashboard", "attendant", "attendant-code"]);
        if (protectedRoutes.has(screen) && !state.user) {
            state.alert = { type: "warning", message: "Entre na sua conta para continuar." };
            state.screen = "login";
            window.location.hash = "login";
            return false;
        }
        if (screen === "dashboard" && !isAdmin()) {
            state.alert = { type: "error", message: "Acesso restrito à administração." };
            state.screen = state.user ? routeForUser() : "login";
            window.location.hash = state.screen;
            return false;
        }
        if ((screen === "attendant" || screen === "attendant-code") && !isEmployee()) {
            state.alert = { type: "error", message: "Acesso disponível somente para a equipe da Hachi." };
            state.screen = state.user ? routeForUser() : "login";
            window.location.hash = state.screen;
            return false;
        }
        if (screen === "loyalty" && !isCustomer()) {
            state.screen = state.user ? routeForUser() : "login";
            window.location.hash = state.screen;
            return false;
        }
        return true;
    }

    window.addEventListener("hashchange", () => {
        const nextScreen = routeFromHash();
        if (nextScreen === state.screen) return;
        state.screen = nextScreen;
        state.modal = null;
        state.restoreFocus = null;
        if (!enforceRouteAccess(state.screen)) return;
        render();
        afterRender();
    });

    app.addEventListener("click", handleClick);
    app.addEventListener("submit", (event) => { handleSubmit(event); });
    app.addEventListener("input", handleInput);
    app.addEventListener("change", handleChange);
    app.addEventListener("pointerover", handleRatingPointerOver);
    app.addEventListener("pointerout", handleRatingPointerOut);
    document.addEventListener("keydown", handleKeydown);

    if (!window.location.hash) window.location.hash = "home";
    if (!enforceRouteAccess(state.screen)) {
        render();
    } else {
        render();
        afterRender();
    }
})();
