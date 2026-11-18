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
    const DEMO_SCHEMA_VERSION = 4;

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
        adminTab: "overview",
        clientSearch: "",
        clientLoyaltyFilter: "all",
        clientLocationFilter: "all",
        clientRatingFilter: "all",
        clientAgeFilter: "all",
        catalogSearch: "",
        pendingAction: null,
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

    function dateDaysAgo(days) {
        return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    function createSeedDatabase() {
        const users = [
            {
                idUsuario: 9001, nome: "Camila Tanaka", email: "camila@demo.hachi",
                telefone: "11912345678", dtNasc: "2005-04-15", cidade: "São Paulo",
                regiao: "Liberdade", funcao: 0, statusUsuario: 1, selos: 8,
                senha: "hachi123", criadoEm: dateDaysAgo(140), atualizadoEm: dateDaysAgo(2),
                consentimentoLGPD: true, consentimentoEm: dateDaysAgo(140)
            },
            {
                idUsuario: 9002, nome: "Leonardo", email: "leonardo@demo.hachi",
                telefone: "", dtNasc: "", cidade: "São Paulo", regiao: "Liberdade",
                funcao: 2, statusUsuario: 1, selos: 0, senha: "hachi123",
                criadoEm: dateDaysAgo(180), consentimentoLGPD: true
            },
            {
                idUsuario: 9003, nome: "Julia", email: "julia@demo.hachi",
                telefone: "", dtNasc: "", cidade: "São Paulo", regiao: "Liberdade",
                funcao: 1, statusUsuario: 1, selos: 0, senha: "hachi123",
                criadoEm: dateDaysAgo(170), consentimentoLGPD: true
            },
            {
                idUsuario: 9004, nome: "Mika Aoki", email: "mika.aoki@demo.hachi",
                telefone: "11923456781", dtNasc: "1998-06-14", cidade: "São Paulo",
                regiao: "Vila Mariana", funcao: 0, statusUsuario: 1, selos: 11,
                senha: "hachi123", criadoEm: dateDaysAgo(95), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(95)
            },
            {
                idUsuario: 9005, nome: "Rafael Sato", email: "rafael.sato@demo.hachi",
                telefone: "11934567812", dtNasc: "1991-03-22", cidade: "São Paulo",
                regiao: "Pinheiros", funcao: 0, statusUsuario: 1, selos: 3,
                senha: "hachi123", criadoEm: dateDaysAgo(80), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(80)
            },
            {
                idUsuario: 9006, nome: "Aiko Nakamura", email: "aiko.nakamura@demo.hachi",
                telefone: "11945678123", dtNasc: "1971-09-10", cidade: "Guarulhos",
                regiao: "Centro", funcao: 0, statusUsuario: 1, selos: 12,
                senha: "hachi123", criadoEm: dateDaysAgo(125), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(125)
            },
            {
                idUsuario: 9007, nome: "Renan Oliveira", email: "renan.oliveira@demo.hachi",
                telefone: "11956781234", dtNasc: "1984-11-08", cidade: "São Paulo",
                regiao: "Mooca", funcao: 0, statusUsuario: 1, selos: 6,
                senha: "hachi123", criadoEm: dateDaysAgo(72), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(72)
            },
            {
                idUsuario: 9008, nome: "Lívia Costa", email: "livia.costa@demo.hachi",
                telefone: "11967812345", dtNasc: "2002-02-19", cidade: "São Paulo",
                regiao: "Consolação", funcao: 0, statusUsuario: 1, selos: 0,
                senha: "hachi123", criadoEm: dateDaysAgo(110), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(110)
            },
            {
                idUsuario: 9009, nome: "Bruno Lima", email: "bruno.lima@demo.hachi",
                telefone: "11978123456", dtNasc: "1980-08-03", cidade: "São Paulo",
                regiao: "Vila Mariana", funcao: 0, statusUsuario: 1, selos: 9,
                senha: "hachi123", criadoEm: dateDaysAgo(105), consentimentoLGPD: true,
                consentimentoEm: dateDaysAgo(105)
            }
        ];
        const redemptions = [
            { id: 9201, idUsuario: 9006, item: "Taiyaki de Anko", dataHora: dateDaysAgo(24), exemplo: true },
            { id: 9202, idUsuario: 9008, item: "Crepe cortesia", dataHora: dateDaysAgo(66), exemplo: true }
        ];
        const feedbacks = [
            { idFeedback: 1, idUsuario: 9001, nota: 5, comentario: "Adorei o crepe de morango e o atendimento. Voltarei em breve!", dataHora: dateDaysAgo(3) },
            { idFeedback: 2, idUsuario: 9001, nota: 4, comentario: "O café estava ótimo e o ambiente é muito acolhedor.", dataHora: dateDaysAgo(16) },
            { idFeedback: 3, idUsuario: 9001, nota: 5, comentario: "Uma experiência deliciosa na Liberdade.", dataHora: dateDaysAgo(36) },
            { idFeedback: 10, idUsuario: 9004, nota: 5, comentario: "Taiyaki quentinho e recheio delicioso. Atendimento muito gentil.", dataHora: dateDaysAgo(4), exemplo: true },
            { idFeedback: 11, idUsuario: 9005, nota: 4, comentario: "Gostei das opções vegetarianas e do café especial.", dataHora: dateDaysAgo(19), exemplo: true },
            { idFeedback: 12, idUsuario: 9006, nota: 5, comentario: "O parfait sazonal estava lindo e muito gostoso.", dataHora: dateDaysAgo(28), exemplo: true },
            { idFeedback: 13, idUsuario: 9007, nota: 3, comentario: "O crepe estava ótimo, mas a fila demorou no domingo.", dataHora: dateDaysAgo(8), exemplo: true },
            { idFeedback: 14, idUsuario: 9008, nota: 2, comentario: "A espera foi longa; espero encontrar menos fila na próxima visita.", dataHora: dateDaysAgo(77), exemplo: true }
        ];
        const menuItem = (idProduto, nome, preco, nomeCategoria, descricao, elegivelResgate = false, tipo = "Produto") => ({
            idProduto,
            nome,
            preco,
            nomeCategoria,
            descricao,
            disponivel: 1,
            elegivelResgate,
            tipo
        });
        const baseCrepe = "Monte o Seu Crepe (Base)";
        const harajuku = "Crepes Doces — Harajuku Style";
        const taiyaki = "Taiyaki";
        const savory = "Crepe Japonês Salgado";
        const vegan = "Menu Vegano";
        const drinks = "Frappes, Drinks Gelados, Cafés e Bebidas";
        const paidExtra = "Adicional pago · não elegível para cortesia";
        const products = [
            menuItem(1, "Crepe Especial", 22, baseCrepe, "Até 3 frutas, 1 cobertura e 1 sorvete (acompanha chantilly). Escolha entre frutas: morango, banana, manga, pêssego e kiwi; coberturas: chocolate, morango, caramelo e leite condensado; sorvetes: creme, morango, chocolate e flocos. A massa tradicional contém leite, ovo, açúcar e trigo; opção vegana/sem glúten por R$ 2,50."),
            menuItem(2, "Crepe Tradicional", 16, baseCrepe, "Até 3 frutas e 1 cobertura (acompanha chantilly). Escolha entre frutas: morango, banana, manga, pêssego e kiwi; coberturas: chocolate, morango, caramelo e leite condensado. A massa tradicional contém leite, ovo, açúcar e trigo; opção vegana/sem glúten por R$ 2,50."),
            menuItem(3, "Creme de Avelã", 6, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(4, "Doce de Leite", 5, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(5, "Creme de Baunilha", 5, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(6, "Sorvete de Creme", 10, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(7, "Sorvete de Morango", 10, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(8, "Sorvete de Chocolate", 10, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(9, "Sorvete de Flocos", 10, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(10, "Sorvete de Matchá", 12, baseCrepe, paidExtra, false, "Adicional"),
            menuItem(11, "Massa Vegana / Sem Glúten", 2.5, baseCrepe, "Opção de massa especial para o crepe. Adicional de R$ 2,50; não elegível para cortesia.", false, "Adicional"),
            menuItem(12, "Hachi Avelã", 23, harajuku, "Morango, banana e creme de avelã.", true),
            menuItem(13, "Hachi Brownie", 23, harajuku, "Morango, banana, brownie, chantilly e cobertura de chocolate.", true),
            menuItem(14, "Hachi Tentação", 23, harajuku, "Morango, chantilly sabor café, creme de avelã e canela.", true),
            menuItem(15, "Hachi Daifuku", 23, harajuku, "Morango, chantilly, mochi (bolinho doce de arroz), ankô (doce de feijão) e leite condensado.", true),
            menuItem(16, "Hachi Berry", 24, harajuku, "Morango, mirtilo, chantilly e sorvete de creme.", true),
            menuItem(17, "Hachi Kohi", 23, harajuku, "Banana, chantilly sabor café, cobertura de chocolate e sorvete de creme.", true),
            menuItem(18, "Hachi Churros", 23, harajuku, "Morango, banana, doce de leite, canela e sorvete de creme.", true),
            menuItem(19, "Hachi Bananela", 20, harajuku, "Banana, canela, sorvete de creme e cobertura de caramelo.", true),
            menuItem(20, "Hachi Matcha", 26, harajuku, "Morango, chantilly, ankô (doce de feijão), mochi (bolinho doce de arroz), leite condensado e sorvete de matchá.", true),
            menuItem(21, "Taiyaki Tradicional", 12.9, taiyaki, "Bolinho doce japonês em formato de peixe. Escolha o recheio: ankô (doce de feijão), creme de avelã, creme de baunilha ou doce de leite.", true),
            menuItem(22, "Sorvete de Creme", 10, taiyaki, paidExtra, false, "Adicional"),
            menuItem(23, "Sorvete de Chocolate", 10, taiyaki, paidExtra, false, "Adicional"),
            menuItem(24, "Sorvete de Morango", 10, taiyaki, paidExtra, false, "Adicional"),
            menuItem(25, "Sorvete de Flocos", 10, taiyaki, paidExtra, false, "Adicional"),
            menuItem(26, "Sorvete de Matchá / Chá Verde", 12, taiyaki, paidExtra, false, "Adicional"),
            menuItem(27, "Hachi Pep", 17, savory, "Calabresa, mussarela, catupiry, batata palha e alface.", true),
            menuItem(28, "Hachi Expresso", 17, savory, "Presunto, mussarela, catupiry, cebola e tomate.", true),
            menuItem(29, "Hachi Tamago", 20, savory, "Presunto, mussarela, catupiry, ovo, bacon, batata palha e alface.", true),
            menuItem(30, "Hachi Italian", 20, savory, "Salame, mussarela, catupiry, cebola e tomate.", true),
            menuItem(31, "Hachi Chiken", 20, savory, "Frango desfiado e catupiry.", true),
            menuItem(32, "Hachi Kare", 22, savory, "Carne moída com molho curry, legumes, mussarela e alface.", true),
            menuItem(33, "Hachi Americano", 24, savory, "Hambúrguer, bacon, mussarela, catupiry e batata palha.", true),
            menuItem(34, "Hachi Tsuna", 20, savory, "Atum ralado, mussarela, maionese e alface.", true),
            menuItem(35, "Hachi Light", 22, savory, "Atum ralado, mussarela, palmito, cebola, tomate e alface.", true),
            menuItem(36, "Hachi 4 Queijos", 18, savory, "Mussarela, catupiry, queijo branco e queijo parmesão.", true),
            menuItem(37, "Hachi Vegetarian", 22, savory, "Alface, rúcula, palmito, tomate seco e queijo branco.", true),
            menuItem(38, "Curry Vegetarian", 20, savory, "Proteína de soja com molho curry, mussarela e alface.", true),
            menuItem(39, "Especial Vegan", 26, vegan, "Até 3 frutas, 1 cobertura e sorvete de açaí (acompanha chantilly vegano).", true),
            menuItem(40, "Tradicional Vegan", 18, vegan, "Até 3 frutas e 1 cobertura (acompanha chantilly vegano).", true),
            menuItem(41, "Vegan Curry (Salgado)", 20, vegan, "Proteína de soja com molho curry e alface.", true),
            menuItem(42, "Hachi Vegan (Salgado)", 21, vegan, "Alface, rúcula, palmito e tomate seco.", true),
            menuItem(43, "Veg Taiyaki", 13, vegan, "Taiyaki vegano recheado com ankô (doce de feijão).", true),
            menuItem(44, "Ice Veg Taiyaki", 24, vegan, "Taiyaki vegano recheado com ankô e sorvete de açaí.", true),
            menuItem(45, "Café com Leite de Aveia P (80ml)", 8, vegan, "Café com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(46, "Café com Leite de Aveia G (180ml)", 12, vegan, "Café com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(47, "Café Gelado com Leite de Aveia (400ml)", 16, vegan, "Café gelado com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(48, "Matcha Latte Quente com Leite de Aveia (200ml)", 14, vegan, "Matcha latte quente com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(49, "Matcha Latte Gelado com Leite de Aveia (400ml)", 18, vegan, "Matcha latte gelado com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(50, "Ichigo Latte com Leite de Aveia (400ml)", 18, vegan, "Purê de morango com leite de aveia. Bebida vegana; não elegível para cortesia.", false),
            menuItem(51, "Ice Berry Vegan (400ml)", 24, vegan, "Frappe de morango com blueberry servido no topo com chantilly vegano. Bebida; não elegível para cortesia.", false),
            menuItem(52, "Ice Berry (400ml)", 25, drinks, "Frappe de morango e mirtilo. Não elegível para cortesia.", false),
            menuItem(53, "Ice Mocha (400ml)", 25, drinks, "Frappe de chocolate e café. Não elegível para cortesia.", false),
            menuItem(54, "Ice Matcha (400ml)", 25, drinks, "Frappe de chá verde. Não elegível para cortesia.", false),
            menuItem(55, "Choco Ice (400ml)", 25, drinks, "Frappe de chocolate. Não elegível para cortesia.", false),
            menuItem(56, "Café Gelado (400ml)", 13, drinks, "Café gelado. Não elegível para cortesia.", false),
            menuItem(57, "Café Gelado com Leite (400ml)", 14, drinks, "Café gelado com leite. Não elegível para cortesia.", false),
            menuItem(58, "Matcha Latte Gelado (400ml)", 15, drinks, "Matcha latte gelado. Não elegível para cortesia.", false),
            menuItem(59, "Ichigo Latte (400ml)", 16, drinks, "Ichigo latte gelado. Não elegível para cortesia.", false),
            menuItem(60, "Soda Italiana (400ml)", 19.9, drinks, "Escolha o sabor: melão, melancia, maçã verde ou framboesa. Não elegível para cortesia.", false),
            menuItem(61, "Melon Soda Cream (400ml)", 19.9, drinks, "Soda de melão com sorvete de creme. Não elegível para cortesia.", false),
            menuItem(62, "Espresso P (80ml)", 7, drinks, "Espresso quente. Não elegível para cortesia.", false),
            menuItem(63, "Espresso G (200ml)", 10, drinks, "Espresso quente. Não elegível para cortesia.", false),
            menuItem(64, "Cappuccino Tradicional (200ml)", 10, drinks, "Cappuccino tradicional quente. Não elegível para cortesia.", false),
            menuItem(65, "Chocolate Quente (200ml)", 10, drinks, "Chocolate quente. Não elegível para cortesia.", false),
            menuItem(66, "Matcha Latte Quente (200ml)", 12, drinks, "Matcha latte quente. Não elegível para cortesia.", false),
            menuItem(67, "Choco Hachi (250ml)", 16, drinks, "Chocolate quente, sorvete de creme, chantilly e creme de avelã. Não elegível para cortesia.", false),
            menuItem(68, "Hachi Coffee (250ml)", 16, drinks, "Café quente, sorvete de creme e chantilly. Não elegível para cortesia.", false),
            menuItem(69, "Água sem gás", 5, drinks, "Água sem gás. Não elegível para cortesia.", false),
            menuItem(70, "Água com gás", 6, drinks, "Água com gás. Não elegível para cortesia.", false),
            menuItem(71, "Refrigerante Lata", 8, drinks, "Refrigerante em lata. Não elegível para cortesia.", false),
            menuItem(72, "Chá Artesanal", 10.9, drinks, "Escolha o sabor: limão siciliano, pêssego, framboesa, melão, maçã verde ou melancia. Não elegível para cortesia.", false)
        ];
        const redemptionCounts = new Map();
        redemptions.forEach((item) => redemptionCounts.set(item.idUsuario, (redemptionCounts.get(item.idUsuario) || 0) + 1));
        const stampEvents = [];
        const codes = [];

        users.filter((user) => Number(user.funcao) === 0).forEach((user) => {
            const count = Number(user.selos || 0) + (redemptionCounts.get(user.idUsuario) || 0) * STAMPS_FOR_REWARD;
            for (let index = 0; index < count; index++) {
                const codigo = `H${String(user.idUsuario).slice(-2)}${String(index + 1).padStart(3, "0")}`;
                const dataHora = dateDaysAgo(Math.min(89, (count - index) * 2 + index % 3));
                const valor = 40 + ((user.idUsuario + index * 7) % 46);
                stampEvents.push({ id: `seed-${user.idUsuario}-${index + 1}`, idUsuario: user.idUsuario, codigo, valorCompra: valor, dataHora, exemplo: true });
                codes.push({ codigo, valor, used: true, idUsuario: user.idUsuario, dataHora, usedAt: dataHora, exemplo: true });
            }
        });

        return { schemaVersion: DEMO_SCHEMA_VERSION, users, feedbacks, products, codes, redemptions, stampEvents };
    }

    function getDemoDatabase() {
        const saved = localStorage.getItem(DEMO_STORAGE_KEY);
        if (!saved) {
            const initialDatabase = createSeedDatabase();
            saveDemoDatabase(initialDatabase);
            return initialDatabase;
        }

        try {
            const database = JSON.parse(saved);
            if (!database || typeof database !== "object" || !Array.isArray(database.users)) {
                throw new Error("Invalid local database.");
            }
            database.feedbacks ||= [];
            database.products ||= [];
            database.codes ||= [];
            database.redemptions ||= [];
            database.stampEvents ||= [];

            const presetPasswords = {
                "camila@demo.hachi": "hachi123",
                "leonardo@demo.hachi": "hachi123",
                "julia@demo.hachi": "hachi123",
                "mika.aoki@demo.hachi": "hachi123",
                "rafael.sato@demo.hachi": "hachi123",
                "aiko.nakamura@demo.hachi": "hachi123",
                "renan.oliveira@demo.hachi": "hachi123",
                "livia.costa@demo.hachi": "hachi123",
                "bruno.lima@demo.hachi": "hachi123"
            };
            let changed = false;
            database.users.forEach((user) => {
                if (!user.senha && presetPasswords[user.email]) {
                    user.senha = presetPasswords[user.email];
                    changed = true;
                }
            });

            const noisyFeedbacks = database.feedbacks.filter((item) => /^\.[a-z0-9]{7}$/i.test(String(item.comentario || "").trim()));
            if (noisyFeedbacks.length) {
                database.feedbacks = database.feedbacks.filter((item) => !noisyFeedbacks.includes(item));
                changed = true;
            }

            if (Number(database.schemaVersion || 1) < DEMO_SCHEMA_VERSION) {
                const seed = createSeedDatabase();
                const existingUserIds = new Set(database.users.map((user) => Number(user.idUsuario)));
                seed.users.forEach((user) => {
                    if (!existingUserIds.has(Number(user.idUsuario))) database.users.push(user);
                });
                const demoBirthDates = {
                    "camila@demo.hachi": "2005-04-15",
                    "mika.aoki@demo.hachi": "1998-06-14",
                    "rafael.sato@demo.hachi": "1991-03-22",
                    "aiko.nakamura@demo.hachi": "1971-09-10",
                    "renan.oliveira@demo.hachi": "1984-11-08",
                    "livia.costa@demo.hachi": "2002-02-19",
                    "bruno.lima@demo.hachi": "1980-08-03"
                };
                database.users.forEach((user) => {
                    const birthDate = demoBirthDates[String(user.email || "").toLowerCase()];
                    if (birthDate && user.dtNasc !== birthDate) {
                        user.dtNasc = birthDate;
                        changed = true;
                    }
                });
                const existingFeedbackIds = new Set(database.feedbacks.map((item) => String(item.idFeedback)));
                seed.feedbacks.forEach((item) => {
                    if (!existingFeedbackIds.has(String(item.idFeedback))) database.feedbacks.push(item);
                });
                const existingCodeValues = new Set(database.codes.map((item) => String(item.codigo)));
                seed.codes.forEach((item) => {
                    if (!existingCodeValues.has(String(item.codigo))) database.codes.push(item);
                });
                const existingRedemptionIds = new Set(database.redemptions.map((item) => String(item.id)));
                seed.redemptions.forEach((item) => {
                    if (!existingRedemptionIds.has(String(item.id))) database.redemptions.push(item);
                });
                const existingStampIds = new Set(database.stampEvents.map((item) => String(item.id)));
                seed.stampEvents.forEach((item) => {
                    if (!existingStampIds.has(String(item.id))) database.stampEvents.push(item);
                });

                database.products = seed.products;
                database.schemaVersion = DEMO_SCHEMA_VERSION;
                changed = true;
            }
            if (changed) saveDemoDatabase(database);
            return database;
        } catch {
            throw new Error("Os dados locais de demonstração não puderam ser lidos. Limpe os dados do site e tente novamente.");
        }
    }

    function saveDemoDatabase(database) {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(database));
        if (state.dashboard) {
            state.dashboard = {
                users: database.users,
                feedbacks: database.feedbacks,
                redemptions: database.redemptions,
                stampEvents: database.stampEvents,
                codes: database.codes
            };
        }
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
        if (window.location.hash !== `#${screen}`) window.location.hash = screen;
        render();
        afterRender();
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
        const navItems = !state.user
            ? [["home", "Início"], ["catalog", "Cardápio"], ["login", "Entrar"]]
            : isAdmin()
                ? [["home", "Início"], ["dashboard", "Painel"]]
                : isEmployee()
                    ? [["home", "Início"], ["attendant", "Atendimento"], ["catalog", "Cardápio"]]
                    : [["home", "Início"], ["loyalty", "Meu cartão"], ["catalog", "Cardápio"]];
        const navigation = navItems.map(([route, label]) =>
            `<a class="nav-link" href="#${route}" data-route="${route}" ${state.screen === route ? 'aria-current="page"' : ""}>${label}</a>`
        ).join("") + (isAdmin() ? `<button class="nav-link nav-link-button" type="button" data-action="admin-clients" aria-current="${state.screen === "dashboard" && state.adminTab === "clients" ? "page" : "false"}">Clientes &amp; Insights</button>` : "");
        return `<header class="site-header" role="banner">
            <div class="header-actions">
                ${back ? `<button class="btn btn-quiet btn-small" type="button" data-route="${escapeHtml(back)}" aria-label="Voltar para a tela anterior">← Voltar</button>` : ""}
                <a class="brand" href="#home" data-route="home" aria-label="Hachi Conecta, página inicial">
                    <img src="assets/HachiLogo.png" alt="Hachi Crepe &amp; Taiyaki - logotipo oficial">
                    <span class="brand-copy"><strong>Hachi Conecta</strong><span>${admin ? "Área administrativa" : "Fidelidade &amp; experiência"}</span></span>
                </a>
                ${title ? `<span class="language-chip">${escapeHtml(title)}</span>` : ""}
            </div>
            <nav class="site-nav" aria-label="Navegação principal">${navigation}</nav>
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
        return `${header({ authenticated: Boolean(state.user), admin: isAdmin() })}
        <main id="main-content" class="page page-wide home-page" role="main">
            ${alertMarkup()}
            <section class="home-hero" aria-labelledby="home-title">
                <div class="home-hero-copy">
                    <p class="eyebrow">Desde 2011 · Um pedacinho do Japão na Liberdade</p>
                    <h1 id="home-title">Seu momento doce tem lugar na Hachi.</h1>
                    <p class="home-hero-lead">Crepes japoneses, taiyakis feitos na hora e encontros cheios de afeto no coração de São Paulo.</p>
                    <div class="loyalty-promise"><span class="loyalty-promise-icon" aria-hidden="true">✦</span><p><strong>Hachi Conecta</strong><br>A cada compra a partir de <strong>R$ 40,00</strong>, ganhe 1 selo. Junte 12 e troque por um item elegível do cardápio.</p></div>
                    <div class="home-actions">
                        <button class="btn btn-dark" type="button" data-route="register-1">Criar conta / Participar</button>
                        <button class="btn btn-secondary" type="button" data-route="login">Entrar na conta</button>
                        <button class="btn btn-quiet" type="button" data-route="catalog">Explorar cardápio</button>
                    </div>
                </div>
                <div class="home-hero-art" aria-hidden="true"><img src="assets/HachiLogo.png" alt=""><span class="hero-art-caption">Feito com carinho<br>na Liberdade</span></div>
            </section>
            <section class="home-intro section-block" aria-labelledby="about-title">
                <div class="section-heading"><div><p class="eyebrow">A casa Hachi</p><h2 id="about-title">Tradição, criatividade e aconchego desde 2011.</h2></div><p>Na Rua Galvão Bueno, em um dos polos culturais e gastronômicos asiáticos mais queridos do mundo, cada visita é um convite para experimentar.</p></div>
                <div class="specialty-grid">
                    <article class="specialty-card"><span class="specialty-icon" aria-hidden="true">◉</span><p class="eyebrow">Feitos para passear</p><h3>Crepes japoneses</h3><p>Massa fina em formato de cone, opções doces, salgadas, vegetarianas e veganas. Frutas, chantili, sorvete, anko e mochi para combinar.</p></article>
                    <article class="specialty-card"><span class="specialty-icon" aria-hidden="true">鯛</span><p class="eyebrow">Assados na hora</p><h3>Taiyakis</h3><p>O tradicional doce japonês em formato de peixe, com recheios de anko, creme de baunilha, avelã ou doce de leite.</p></article>
                    <article class="specialty-card"><span class="specialty-icon" aria-hidden="true">✿</span><p class="eyebrow">Sabores da estação</p><h3>Bebidas &amp; sazonais</h3><p>Parfaits, cafés especiais e frappes, além de menus temáticos de Páscoa, Festa Junina, Dia dos Namorados, Halloween, Natal e Matsuris.</p></article>
                </div>
                <div class="visit-card">
                    <div><p class="eyebrow">Venha nos visitar</p><h3>Rua Galvão Bueno, 586</h3><p>Liberdade · São Paulo — SP</p></div>
                    <div><p class="eyebrow">Horário de funcionamento</p><p><strong>Quarta a sábado:</strong> 11h às 19h<br><strong>Domingo:</strong> 11h às 18h<br><strong>Segunda-feira:</strong> fechado</p></div>
                    <a class="btn btn-secondary" href="https://maps.google.com/?q=Rua+Galv%C3%A3o+Bueno+586+Liberdade+S%C3%A3o+Paulo" target="_blank" rel="noopener noreferrer">Ver localização</a>
                </div>
            </section>
            <section class="home-hub section-block" aria-labelledby="hub-title">
                <div class="section-heading"><div><p class="eyebrow">Hachi Conecta</p><h2 id="hub-title">O que você deseja fazer agora?</h2></div><p>Escolha seu próximo passo. Os recursos de fidelidade funcionam localmente neste protótipo.</p></div>
                <div class="hub-grid">
                    <button class="hub-card" type="button" data-route="loyalty"><span aria-hidden="true">✦</span><strong>Meu cartão fidelidade</strong><small>Acompanhe seus 12 selos e resgate recompensas.</small></button>
                    <button class="hub-card" type="button" data-action="hub-validate"><span aria-hidden="true">⌁</span><strong>Validar código / QR Code</strong><small>Registre o código recebido no balcão após a compra.</small></button>
                    <button class="hub-card" type="button" data-route="catalog"><span aria-hidden="true">◉</span><strong>Ver cardápio Hachi</strong><small>Conheça os sabores e opções de troca.</small></button>
                    <button class="hub-card" type="button" data-action="feedback"><span aria-hidden="true">★</span><strong>Deixar um feedback</strong><small>Conte como foi sua experiência na loja.</small></button>
                </div>
                <details class="demo-entry"><summary>Acesso da equipe / demonstração</summary><div class="inline-actions"><button class="btn btn-secondary btn-small" type="button" data-demo-role="client">Cliente · Camila</button><button class="btn btn-secondary btn-small" type="button" data-demo-role="employee">Atendente · Julia</button><button class="btn btn-secondary btn-small" type="button" data-demo-role="admin">Administrador · Leonardo</button></div><p class="field-hint">Acessos fictícios para testar a jornada do cliente e as áreas da equipe. Nenhuma alteração é enviada a um servidor.</p></details>
            </section>
            <footer class="home-footer">
                <a href="#" data-action="legal" data-legal="Termos e Condições de Uso">Termos de Uso</a>
                <a href="#" data-action="legal" data-legal="Política de Privacidade">Política de Privacidade</a>
                <a href="#" data-action="legal" data-legal="Política de Cookies">Política de Cookies</a>
            </footer>
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
                        <p class="field-hint">Cortesias disponíveis em Taiyaki, Crepes Doces — Harajuku Style, Crepe Japonês Salgado e itens não-bebida do Menu Vegano. Adicionais e bebidas não participam.</p>
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
        const query = normalizeText(state.catalogSearch);
        const visibleProducts = state.products.filter((product) =>
            Number(product.disponivel) !== 0 &&
            (selected === "Todas" || product.nomeCategoria === selected) &&
            (!query || normalizeText(`${product.nome} ${product.nomeCategoria} ${product.descricao} ${product.tipo}`).includes(query))
        );
        const content = state.productsLoading
            ? `<div class="grid grid-3">${Array.from({ length: 6 }, () => `<div class="card stack"><div class="skeleton" style="height:140px"></div><div class="skeleton" style="width:60%"></div><div class="skeleton"></div></div>`).join("")}</div>`
            : state.productsError
                ? `<div class="alert alert-error"><p>${escapeHtml(state.productsError)}</p></div>`
                : visibleProducts.length
                    ? `<div class="product-grid">${visibleProducts.map(productCard).join("")}</div>`
                    : `<div class="empty-state"><strong>${query ? "Nenhum item encontrado para essa busca." : "Não há itens disponíveis nesta categoria."}</strong><span>${query ? "Confira a grafia ou limpe a busca para ver o cardápio completo." : "Escolha outra categoria para continuar."}</span></div>`;

        return `${header({ back: isCustomer() ? "loyalty" : "home", authenticated: Boolean(state.user), admin: isAdmin() })}
        <main id="main-content" class="page page-wide" role="main">
            <div class="page-heading">
                <p class="eyebrow">Cardápio oficial Hachi Crepe &amp; Taiyaki</p>
                <h1>Cardápio</h1>
                <p>Explore as categorias e encontre seu próximo sabor favorito. Consulte a equipe para confirmar a disponibilidade dos itens.</p>
            </div>
            ${alertMarkup()}
            <section class="panel">
                <div class="catalog-toolbar">
                    <div class="field catalog-search-field"><label for="catalog-search">Buscar no cardápio</label><input id="catalog-search" class="input" type="search" data-focus-key="catalog-search" data-catalog-search value="${escapeHtml(state.catalogSearch)}" placeholder="Produto, ingrediente ou categoria" autocomplete="off"></div>
                    <div class="category-pills" aria-label="Filtrar por categoria">
                        ${categories.map((category) => `<button class="pill" type="button" data-category="${escapeHtml(category)}" aria-pressed="${selected === category}">${escapeHtml(category)}</button>`).join("")}
                    </div>
                    <span class="demo-badge">${visibleProducts.length} ${visibleProducts.length === 1 ? "item" : "itens"}</span>
                </div>
                <div class="menu-reward-note"><strong>Resgate com 12 selos:</strong> itens das categorias Taiyaki, Crepes Doces — Harajuku Style, Crepe Japonês Salgado e Menu Vegano (exceto bebidas e adicionais pagos). Os itens elegíveis estão marcados no cardápio.</div>
                ${content}
            </section>
        </main>
        ${footer()}`;
    }

    function productCard(product) {
        const image = product.imagemUrl && safeHttpUrl(product.imagemUrl)
            ? `<img loading="lazy" src="${escapeHtml(product.imagemUrl)}" alt="">`
            : `<span aria-hidden="true">${productIcon(product.nomeCategoria)}</span>`;
        const typeLabel = product.tipo === "Adicional" ? "Adicional pago" : product.elegivelResgate ? "Cortesia com 12 selos" : "Não elegível para cortesia";
        return `<article class="card product-card">
            <div class="product-art">${image}</div>
            <div class="product-card-tags"><span class="badge">${escapeHtml(product.nomeCategoria || "Cardápio")}</span><span class="menu-eligibility ${product.elegivelResgate ? "is-redeemable" : "is-not-redeemable"}">${escapeHtml(typeLabel)}</span></div>
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
        if (/café|bebida|frappe/i.test(category || "")) return "☕";
        if (/salgad/i.test(category || "")) return "🥙";
        if (/monte o seu/i.test(category || "")) return "🥞";
        if (/vegano/i.test(category || "")) return "🌱";
        return "🍡";
    }

    function dashboardScreen() {
        const dashboard = state.dashboard || { users: [], feedbacks: [], redemptions: [], stampEvents: [] };
        const users = dashboard.users.filter((user) => Number(user.funcao) === 0 && Number(user.statusUsuario) === 1);
        const periodFeedbacks = withinSelectedPeriod(dashboard.feedbacks);
        const periodStamps = withinSelectedPeriod(dashboard.stampEvents || []);
        const periodRedemptions = withinSelectedPeriod(dashboard.redemptions);
        const average = periodFeedbacks.length
            ? (periodFeedbacks.reduce((sum, item) => sum + Number(item.nota || 0), 0) / periodFeedbacks.length).toFixed(1)
            : "0,0";
        const metrics = [
            ["Avaliação média", `${average} / 5`, periodFeedbacks.length ? `${periodFeedbacks.length} avaliações no período` : "Nenhuma avaliação neste período"],
            ["Total de clientes", users.length.toLocaleString("pt-BR"), "Clientes ativos cadastrados localmente"],
            ["Selos emitidos", periodStamps.length.toLocaleString("pt-BR"), "Compras elegíveis registradas no período"],
            ["Resgates realizados", periodRedemptions.length.toLocaleString("pt-BR"), "Recompensas trocadas no período"]
        ];
        return `${header({ authenticated: true, admin: true })}
        <main id="main-content" class="page page-wide" role="main">
            <div class="dashboard-header page-heading">
                <div><p class="eyebrow">Visão do estabelecimento</p><h1>Painel Administrativo</h1><p>Olá, ${escapeHtml(fullName())}. Acompanhe a fidelidade e a experiência dos clientes.</p></div>
                <span class="badge">Perfil administrativo</span>
            </div>
            <div class="admin-tabs" role="tablist" aria-label="Seções do painel administrativo">
                <button class="admin-tab" type="button" role="tab" data-admin-tab="overview" aria-selected="${state.adminTab === "overview"}">Visão Geral</button>
                <button class="admin-tab" type="button" role="tab" data-admin-tab="clients" aria-selected="${state.adminTab === "clients"}">Clientes &amp; Insights</button>
            </div>
            ${state.adminTab === "clients" ? clientInsightsScreen(users) : dashboardOverview({ dashboard, users, periodFeedbacks, periodStamps, periodRedemptions, metrics })}
        </main>
        ${footer()}`;
    }

    function dashboardOverview({ dashboard, users, periodFeedbacks, periodStamps, periodRedemptions, metrics }) {
        const locations = locationSummary(users);
        const recent = filteredFeedbacks(dashboard.feedbacks);
        return `<div class="alert alert-warning"><p>Os dados são salvos neste navegador; perfis e interações iniciais são exemplos fictícios.</p></div>
            ${state.dashboardLoading ? `<div class="grid grid-4">${Array.from({ length: 4 }, () => `<div class="card stack"><div class="skeleton" style="width:45%"></div><div class="skeleton" style="height:34px"></div><div class="skeleton"></div></div>`).join("")}</div>` : ""}
            ${state.dashboardError ? `<div class="alert alert-error" role="alert"><p>${escapeHtml(state.dashboardError)} <button class="btn btn-quiet btn-small" type="button" data-action="refresh-dashboard">Tentar novamente</button></p></div>` : ""}
            <div class="filter-row">
                <h2 class="sr-only">Período dos indicadores</h2>
                <div class="period-pills" aria-label="Período dos feedbacks">
                    ${[7, 30, 90, 0].map((days) => `<button class="pill" type="button" data-period="${days}" aria-pressed="${state.selectedPeriod === days}">${days ? `${days} dias` : "Todos"}</button>`).join("")}
                </div><span class="meta">${periodFeedbacks.length} avaliações · ${periodStamps.length} selos · ${periodRedemptions.length} resgates</span>
            </div>
            <section class="grid grid-4" aria-label="Indicadores">
                ${metrics.map(([label, value, note]) => `<article class="card kpi-card"><p class="kpi-label">${escapeHtml(label)}</p><p class="kpi-value">${escapeHtml(value)}</p><p class="kpi-note">${escapeHtml(note)}</p></article>`).join("")}
            </section>
            <div class="dashboard-content">
                <section class="card stack" aria-labelledby="feedback-heading">
                    <div class="filter-row"><div><p class="eyebrow">A voz dos clientes</p><h2 id="feedback-heading">Feedbacks recebidos</h2></div><span class="badge">${recent.length} ${state.selectedRatingFilter === "Todas" ? "no período" : "correspondentes"}</span></div>
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
                        ${ratingDistributionMarkup(periodFeedbacks)}
                        <p class="field-hint">Distribuição dos feedbacks por nota neste período.</p>
                    </section>
                </aside>
            </div>
        </div>`;
    }

    function clientProfiles(users) {
        const dashboard = state.dashboard || {};
        const feedbacks = dashboard.feedbacks || [];
        const redemptions = dashboard.redemptions || [];
        const stamps = dashboard.stampEvents || [];
        return users.map((user) => {
            const userFeedbacks = feedbacks.filter((item) => Number(item.idUsuario) === Number(user.idUsuario));
            const userRedemptions = redemptions.filter((item) => Number(item.idUsuario) === Number(user.idUsuario));
            const userStamps = stamps.filter((item) => Number(item.idUsuario) === Number(user.idUsuario));
            const balance = Math.max(0, Number(user.selos) || 0);
            const lifetimeStamps = Math.max(userStamps.length, balance + userRedemptions.length * STAMPS_FOR_REWARD);
            const orderedFeedbacks = [...userFeedbacks].sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
            const rating = userFeedbacks.length
                ? userFeedbacks.reduce((sum, item) => sum + Number(item.nota || 0), 0) / userFeedbacks.length
                : null;
            return {
                user,
                balance,
                age: calculateAge(user.dtNasc),
                lifetimeStamps,
                redemptions: userRedemptions.length,
                feedbacks: orderedFeedbacks,
                latestFeedback: orderedFeedbacks[0] || null,
                rating,
                locationGroup: clientLocationGroup(user)
            };
        });
    }

    function clientLocationGroup(user) {
        const city = normalizeText(user.cidade || "");
        const region = normalizeText(user.regiao || "");
        if (!city.includes("sao paulo")) return "other-cities";
        return /liberdade|se|centro/.test(region) ? "sp-center" : "sp-other";
    }

    function normalizeText(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    function calculateAge(birthDate) {
        if (!birthDate) return null;
        const date = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(date.getTime()) || date > new Date()) return null;
        const today = new Date();
        return today.getFullYear() - date.getFullYear() -
            (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate()) ? 1 : 0);
    }

    function clientAgeGroup(age) {
        if (age === null || age === undefined) return "unknown";
        if (age <= 24) return "under-24";
        if (age <= 34) return "25-34";
        if (age <= 44) return "35-44";
        return "45-plus";
    }

    function clientAgeGroupLabel(group) {
        return {
            "under-24": "Até 24 anos (Jovens / Estudantes)",
            "25-34": "25 a 34 anos (Jovens Adultos)",
            "35-44": "35 a 44 anos",
            "45-plus": "45+ anos"
        }[group] || "Idade não informada";
    }

    function customerLoyaltyStatus(balance) {
        if (balance >= STAMPS_FOR_REWARD) return "ready";
        if (balance >= 8) return "engaged";
        if (balance > 0) return "progress";
        return "inactive";
    }

    function filteredClients(customers) {
        const query = normalizeText(state.clientSearch);
        return customers.filter((customer) => {
            const { user, balance, rating, locationGroup, age } = customer;
            const searchText = normalizeText(`${user.nome} ${user.email}`);
            const phoneQuery = query.replace(/\D/g, "");
            const matchesQuery = !query ||
                searchText.includes(query) ||
                Boolean(phoneQuery) && String(user.telefone || "").replace(/\D/g, "").includes(phoneQuery);
            const matchesLoyalty = state.clientLoyaltyFilter === "all" ||
                customerLoyaltyStatus(balance) === state.clientLoyaltyFilter;
            const matchesLocation = state.clientLocationFilter === "all" ||
                locationGroup === state.clientLocationFilter;
            const matchesAge = state.clientAgeFilter === "all" ||
                clientAgeGroup(age) === state.clientAgeFilter;
            const ratingGroup = rating === null ? "none" : rating >= 4 ? "promoters" : rating >= 3 ? "neutral" : "detractors";
            const matchesRating = state.clientRatingFilter === "all" || ratingGroup === state.clientRatingFilter;
            return matchesQuery && matchesLoyalty && matchesLocation && matchesAge && matchesRating;
        });
    }

    function clientSegmentInsights(customers) {
        const nearlyReady = customers.filter(({ balance }) => balance >= 9 && balance <= 11).length;
        const locations = new Map();
        customers.forEach(({ user }) => {
            const name = [user.cidade, user.regiao].filter(Boolean).join(" · ") || "Localização não informada";
            locations.set(name, (locations.get(name) || 0) + 1);
        });
        const leadingLocation = [...locations.entries()].sort((a, b) => b[1] - a[1])[0];
        const locationPercent = leadingLocation && customers.length ? Math.round((leadingLocation[1] / customers.length) * 100) : 0;
        const leadingCustomer = leadingLocation && customers.find(({ user }) =>
            ([user.cidade, user.regiao].filter(Boolean).join(" · ") || "Localização não informada") === leadingLocation[0]
        );
        const regionalProfile = leadingCustomer?.locationGroup === "other-cities" ? "um perfil de visitantes de outras cidades" : "um perfil local recorrente";
        const feedbacks = customers.flatMap((customer) => customer.feedbacks);
        const average = feedbacks.length
            ? (feedbacks.reduce((sum, item) => sum + Number(item.nota || 0), 0) / feedbacks.length).toFixed(1)
            : null;
        const detractors = feedbacks.filter((item) => Number(item.nota) <= 2).length;
        const ageCounts = new Map();
        customers.filter(({ age }) => age !== null).forEach(({ age }) => {
            const group = clientAgeGroup(age);
            ageCounts.set(group, (ageCounts.get(group) || 0) + 1);
        });
        const leadingAgeGroup = [...ageCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        const agePercent = leadingAgeGroup
            ? Math.round((leadingAgeGroup[1] / [...ageCounts.values()].reduce((sum, count) => sum + count, 0)) * 100)
            : 0;
        return [
            {
                icon: "↗",
                title: "Oportunidade de retorno",
                text: nearlyReady
                    ? `${nearlyReady} ${nearlyReady === 1 ? "cliente está" : "clientes estão"} a 1–3 visitas de completar o cartão.`
                    : "Nenhum cliente deste grupo está a até três selos do resgate."
            },
            {
                icon: "⌖",
                title: "Predominância regional",
                text: leadingLocation
                    ? `${locationPercent}% vêm de ${leadingLocation[0]}, sugerindo ${regionalProfile}.`
                    : "A região será destacada quando houver clientes neste filtro."
            },
            {
                icon: "★",
                title: "Termômetro de satisfação",
                text: average
                    ? `Média de ${average}/5★ neste grupo.${detractors ? ` Atenção: ${detractors} ${detractors === 1 ? "avaliação detratora pede" : "avaliações detratoras pedem"} acompanhamento.` : " Sem avaliações detratoras registradas."}`
                    : "Ainda não há avaliações para calcular a satisfação deste grupo."
            },
            {
                icon: "◷",
                title: "Perfil etário",
                text: leadingAgeGroup
                    ? `Faixa etária predominante neste filtro: ${clientAgeGroupLabel(leadingAgeGroup[0])} (${agePercent}%).`
                    : "Não há datas de nascimento informadas neste segmento."
            }
        ];
    }

    function clientInsightsScreen(users) {
        const profiles = clientProfiles(users);
        const filtered = filteredClients(profiles);
        const insights = clientSegmentInsights(filtered);
        const loyaltyOptions = [
            ["all", "Todos os clientes"],
            ["ready", "Prontos para resgate (12+)"],
            ["engaged", "Quase lá / Engajados (8–11)"],
            ["progress", "Em progresso (1–7)"],
            ["inactive", "Inativos / Sem selos (0)"]
        ];
        const ratingOptions = [
            ["all", "Todos os perfis"],
            ["promoters", "Promotores (4–5★)"],
            ["neutral", "Neutros (3★)"],
            ["detractors", "Detratores (1–2★)"],
            ["none", "Sem avaliação"]
        ];
        const locationOptions = [
            ["all", "Todas as regiões"],
            ["sp-center", "Liberdade / Centro"],
            ["sp-other", "Outras regiões de SP"],
            ["other-cities", "Turistas / Outras cidades"]
        ];
        const ageOptions = [
            ["all", "Todas as idades"],
            ["under-24", "Até 24 anos (Jovens / Estudantes)"],
            ["25-34", "25 a 34 anos (Jovens Adultos)"],
            ["35-44", "35 a 44 anos"],
            ["45-plus", "45+ anos"]
        ];
        return `<section class="client-insights" aria-labelledby="clients-title">
            <div class="clients-heading"><div><p class="eyebrow">Relacionamento acionável</p><h2 id="clients-title">Clientes &amp; Insights</h2><p class="muted">Combine filtros para encontrar oportunidades de fidelização.</p></div><span class="badge">${users.length} clientes na base</span></div>
            <div class="client-filters card">
                <div class="field client-search-field"><label for="client-search">Buscar cliente</label><input id="client-search" class="input" type="search" data-focus-key="client-search" data-client-search value="${escapeHtml(state.clientSearch)}" placeholder="Nome, e-mail ou telefone" autocomplete="off"></div>
                <div class="field"><label for="client-loyalty-filter">Fidelidade</label><select id="client-loyalty-filter" class="input" data-focus-key="client-loyalty" data-client-filter="loyalty">${loyaltyOptions.map(([value, label]) => `<option value="${value}" ${state.clientLoyaltyFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
                <div class="field"><label for="client-location-filter">Região / cidade</label><select id="client-location-filter" class="input" data-focus-key="client-location" data-client-filter="location">${locationOptions.map(([value, label]) => `<option value="${value}" ${state.clientLocationFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
                <div class="field"><label for="client-rating-filter">Perfil de avaliação</label><select id="client-rating-filter" class="input" data-focus-key="client-rating" data-client-filter="rating">${ratingOptions.map(([value, label]) => `<option value="${value}" ${state.clientRatingFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
                <div class="field"><label for="client-age-filter">Faixa etária</label><select id="client-age-filter" class="input" data-focus-key="client-age" data-client-filter="age">${ageOptions.map(([value, label]) => `<option value="${value}" ${state.clientAgeFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
                <div class="client-filter-footer"><span role="status">Mostrando <strong>${filtered.length}</strong> de <strong>${users.length}</strong> clientes encontrados</span><button class="btn btn-quiet btn-small" type="button" data-action="clear-client-filters">Limpar filtros</button></div>
            </div>
            <section class="insight-section" aria-labelledby="insights-title"><div class="section-heading"><div><p class="eyebrow">Leitura do segmento</p><h3 id="insights-title">Insights inteligentes</h3></div></div><div class="insight-grid">${insights.map((insight) => `<article class="insight-card"><span class="insight-icon" aria-hidden="true">${insight.icon}</span><div><h4>${escapeHtml(insight.title)}</h4><p>${escapeHtml(insight.text)}</p></div></article>`).join("")}</div></section>
            <section class="client-list-section" aria-labelledby="client-list-title"><div class="section-heading"><div><p class="eyebrow">Base de relacionamento</p><h3 id="client-list-title">Clientes encontrados</h3></div></div>
                ${filtered.length ? `<div class="data-table-wrap client-table-wrap"><table class="data-table client-table"><thead><tr><th>Cliente</th><th>Idade</th><th>Cidade / região</th><th>Progresso de selos</th><th>Resgates</th><th>Última avaliação</th><th></th></tr></thead><tbody>${filtered.map((customer) => clientTableRow(customer)).join("")}</tbody></table></div>` : `<div class="empty-state card"><strong>Nenhum cliente corresponde aos filtros.</strong><span>Altere a busca ou limpe os filtros para ver a base completa.</span></div>`}
            </section>
        </section>`;
    }

    function clientTableRow(customer) {
        const { user, balance, redemptions, latestFeedback, rating, age } = customer;
        const loyaltyClass = `loyalty-status-${customerLoyaltyStatus(balance)}`;
        const ratingText = latestFeedback ? `${latestFeedback.nota}/5 ★` : "Sem avaliação";
        const progress = Math.min(100, (balance / STAMPS_FOR_REWARD) * 100);
        return `<tr>
            <td><strong>${escapeHtml(user.nome)}</strong><span class="table-subtext">${escapeHtml(user.email || "")}</span></td>
            <td>${age === null ? "Não informado" : `${age} anos`}</td>
            <td>${escapeHtml([user.cidade, user.regiao].filter(Boolean).join(" · ") || "Não informado")}</td>
            <td><span class="loyalty-status ${loyaltyClass}">${balance}/${STAMPS_FOR_REWARD}</span><div class="client-progress" role="img" aria-label="${balance} de 12 selos"><span style="width:${progress}%"></span></div></td>
            <td>${redemptions}</td>
            <td><span class="${latestFeedback && Number(latestFeedback.nota) <= 2 ? "rating-detractor" : ""}">${ratingText}</span></td>
            <td><button class="btn btn-secondary btn-small" type="button" data-action="client-details" data-client-id="${escapeHtml(user.idUsuario)}">Ver detalhes</button></td>
        </tr>`;
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
        if (Number(state.selectedPeriod) === 0) return feedbacks.filter((item) => item && !Number.isNaN(new Date(item.dataHora || 0).getTime()));
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

    function ratingDistributionMarkup(feedbacks) {
        const ratings = feedbacks
            .map((item) => Number(item.nota))
            .filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);
        if (!ratings.length) {
            return `<div class="rating-empty" role="status"><span class="rating-empty-icon" aria-hidden="true">☆</span><strong>As avaliações aparecerão aqui</strong><span>Ainda não há feedbacks neste período.</span></div>`;
        }

        const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
        const averageText = average.toFixed(1);
        const stars = Array.from({ length: 5 }, (_, index) => {
            const star = index + 1;
            const partial = average > index && average < star;
            const fill = Math.max(0, Math.min(100, (average - index) * 100));
            const className = average >= star ? "is-filled" : partial ? "is-partial" : "";
            const style = partial ? ` style="background-image:linear-gradient(90deg,#b66a12 ${fill}%,#ded6cd ${fill}%)"` : "";
            return `<span class="${className}"${style} aria-hidden="true">★</span>`;
        }).join("");
        const bars = [5, 4, 3, 2, 1].map((rating) => {
            const count = ratings.filter((value) => value === rating).length;
            const percentage = Math.round((count / ratings.length) * 100);
            const label = count === 1 ? "avaliação" : "avaliações";
            return `<div class="rating-bar-row"><span class="rating-bar-label">${rating} <span aria-hidden="true">★</span></span><div class="rating-bar-track" role="img" aria-label="${rating} estrelas: ${count} ${label}, ${percentage}%"><span class="rating-bar-fill" style="width:${percentage}%"></span></div><span class="rating-bar-count">${count}</span></div>`;
        }).join("");
        return `<div class="rating-distribution">
            <div class="rating-summary"><strong class="rating-average">${averageText}</strong><div><div class="rating-summary-stars" role="img" aria-label="Média de ${averageText} de 5 estrelas">${stars}</div><span class="rating-summary-caption">${ratings.length} ${ratings.length === 1 ? "avaliação" : "avaliações"}</span></div></div>
            <div class="rating-bars" role="group" aria-label="Distribuição de avaliações por nota">${bars}</div>
        </div>`;
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

    function render({ preserveFocus = null } = {}) {
        const screenChanged = lastRenderedScreen !== state.screen;
        const focusKey = preserveFocus?.dataset?.focusKey || null;
        const selectionStart = typeof preserveFocus?.selectionStart === "number" ? preserveFocus.selectionStart : null;
        const selectionEnd = typeof preserveFocus?.selectionEnd === "number" ? preserveFocus.selectionEnd : null;
        if (!state.modal && modalCloseTimer !== null) {
            window.clearTimeout(modalCloseTimer);
            modalCloseTimer = null;
        }
        document.body.classList.toggle("modal-open", Boolean(state.modal));
        app.innerHTML = `${screenContent()}${state.modal ? renderModal(state.modal) : ""}`;
        if (screenChanged) {
            app.querySelector(".page")?.classList.add("page-entering");
            lastRenderedScreen = state.screen;
        }
        if (focusKey) {
            const nextFocus = [...app.querySelectorAll("[data-focus-key]")]
                .find((element) => element.dataset.focusKey === focusKey);
            nextFocus?.focus();
            if (nextFocus?.setSelectionRange && selectionStart !== null && selectionEnd !== null) {
                nextFocus.setSelectionRange(selectionStart, selectionEnd);
            }
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
        if (state.pendingAction && isCustomer() && state.screen === "loyalty") {
            const action = state.pendingAction;
            state.pendingAction = null;
            const trigger = app.querySelector(action === "validate" ? '[data-action="scan-code"]' : '[data-action="feedback"]');
            trigger?.focus();
            state.selectedRating = 5;
            openModal(action === "validate" ? "scan" : "feedback");
            return;
        }
        if (state.pendingAction && state.user && state.screen === routeForUser() && !isCustomer()) {
            state.pendingAction = null;
            showToast("Esse recurso está disponível para contas de cliente.", "info");
        }
        if (state.screen === "catalog" && !state.productsLoaded && !state.productsLoading) loadProducts();
        if (state.screen === "dashboard" && !state.dashboardLoaded && !state.dashboardLoading) loadDashboard();
    }

    function navigateRoute(screen) {
        const protectedScreens = new Set(["loyalty", "profile", "dashboard", "attendant", "attendant-code"]);
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
        if (window.location.hash !== `#${screen}`) window.location.hash = screen;
        render();
        afterRender();
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
        const backdropClass = size === "modal-drawer" ? "modal-backdrop modal-backdrop-drawer" : "modal-backdrop";
        return `<div class="${backdropClass}" data-action="backdrop-close">
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
            const content = `<p class="modal-copy">No balcão da Hachi, escolha um item elegível: Taiyaki, Crepes Doces — Harajuku Style, Crepe Japonês Salgado ou um item não-bebida do Menu Vegano.</p>
                <p>Confirma o resgate? Bebidas, bases de crepe e adicionais pagos não são elegíveis.</p>
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
                    <p>Direito a resgate de <strong>01 item elegível</strong>.</p>
                    <p class="field-hint">Escolha um item identificado como cortesia com 12 selos no cardápio. Bebidas e adicionais pagos não participam.</p>
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

        if (modal.type === "client-details") {
            return clientDetailModal(modal.clientId);
        }

        if (modal.type === "legal") {
            const content = `<div class="alert alert-info"><p>O conteúdo oficial de ${escapeHtml(modal.name)} ainda precisa ser fornecido pelo grupo e pelo estabelecimento.</p></div>
                <p class="modal-copy">O projeto prevê disponibilizar as informações de privacidade antes do uso. Este protótipo não substitui os documentos legais aprovados.</p>
                <div class="modal-actions"><button class="btn btn-dark btn-block" type="button" data-action="close-modal">Entendi</button></div>`;
            return modalShell(modal.name, content, { size: "modal-small" });
        }

        return "";
    }

    function clientDetailModal(clientId) {
        const dashboard = state.dashboard || {};
        const user = (dashboard.users || []).find((item) => Number(item.idUsuario) === Number(clientId));
        if (!user || Number(user.funcao) !== 0) {
            return modalShell("Cliente não encontrado", `<div class="alert alert-warning"><p>Não foi possível carregar os dados deste cliente.</p></div><button class="btn btn-dark btn-block" type="button" data-action="close-modal">Fechar</button>`, { size: "modal-small" });
        }
        const customer = clientProfiles([user])[0];
        const timeline = [
            ...(dashboard.stampEvents || [])
                .filter((item) => Number(item.idUsuario) === Number(user.idUsuario))
                .map((item) => ({ date: item.dataHora, label: "Selo emitido", detail: `Código ${item.codigo || "local"}`, icon: "✦" })),
            ...(dashboard.redemptions || [])
                .filter((item) => Number(item.idUsuario) === Number(user.idUsuario))
                .map((item) => ({ date: item.dataHora, label: "Recompensa resgatada", detail: item.item || "Item cortesia", icon: "♡" })),
            ...customer.feedbacks.map((item) => ({
                date: item.dataHora,
                label: `Feedback ${item.nota}/5 estrelas`,
                detail: item.comentario || "Sem comentário.",
                icon: "★"
            }))
        ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        const recommendations = [];
        const completedCycles = Math.floor(customer.lifetimeStamps / STAMPS_FOR_REWARD);
        if (completedCycles) recommendations.push(`Cliente recorrente: já acumulou o equivalente a ${completedCycles} ${completedCycles === 1 ? "ciclo" : "ciclos"} completos de fidelidade.`);
        if (customer.balance > 0 && customer.balance < STAMPS_FOR_REWARD && STAMPS_FOR_REWARD - customer.balance <= 3) {
            recommendations.push(`Falta${STAMPS_FOR_REWARD - customer.balance === 1 ? "" : "m"} ${STAMPS_FOR_REWARD - customer.balance} selo${STAMPS_FOR_REWARD - customer.balance === 1 ? "" : "s"} para a próxima cortesia: uma boa oportunidade para incentivar o retorno.`);
        }
        const attentionFeedback = customer.feedbacks.find((item) => Number(item.nota) <= 3);
        if (attentionFeedback) recommendations.push(`A avaliação ${attentionFeedback.nota}★ merece atenção: revise o comentário e priorize uma abordagem acolhedora na próxima visita.`);
        if (recommendations.length < 2) recommendations.push(customer.feedbacks.length
            ? "Reconheça a preferência do cliente e apresente as novidades sazonais na próxima visita."
            : "Convide o cliente a compartilhar uma avaliação após a próxima visita.");
        if (recommendations.length < 3) recommendations.push("Reforce que cada compra elegível a partir de R$ 40,00 gera um selo no cartão Hachi Conecta.");
        return modalShell(user.nome, `<div class="client-drawer-content">
            <section class="drawer-section"><p class="eyebrow">Dados cadastrais</p><dl class="data-list drawer-data-list">
                <div class="data-row"><dt>E-mail</dt><dd>${escapeHtml(user.email || "Não informado")}</dd></div>
                <div class="data-row"><dt>Telefone</dt><dd>${escapeHtml(user.telefone ? formatPhone(user.telefone) : "Não informado")}</dd></div>
                <div class="data-row"><dt>Bairro / cidade</dt><dd>${escapeHtml([user.regiao, user.cidade].filter(Boolean).join(" · ") || "Não informado")}</dd></div>
                <div class="data-row"><dt>Idade</dt><dd>${customer.age === null ? "Não informada" : `${customer.age} anos`}</dd></div>
                <div class="data-row"><dt>Data de nascimento</dt><dd>${escapeHtml(formatDate(user.dtNasc))}</dd></div>
                <div class="data-row"><dt>Cadastro</dt><dd>${escapeHtml(formatDate(user.criadoEm))}</dd></div>
                <div class="data-row"><dt>Consentimento LGPD</dt><dd>${user.consentimentoLGPD ? "Registrado" : "Não registrado"}</dd></div>
            </dl></section>
            <section class="drawer-section"><p class="eyebrow">Resumo de fidelidade</p><div class="drawer-kpi-grid">
                <div><span>Saldo atual</span><strong>${customer.balance} selo${customer.balance === 1 ? "" : "s"}</strong></div>
                <div><span>Selos históricos</span><strong>${customer.lifetimeStamps}</strong></div>
                <div><span>Resgates</span><strong>${customer.redemptions}</strong></div>
                <div><span>Gasto estimado mínimo</span><strong>${formatCurrency(customer.lifetimeStamps * MIN_PURCHASE)}</strong><small>Estimativa: selos históricos × R$ 40,00</small></div>
            </div></section>
            <section class="drawer-section"><p class="eyebrow">Próximos passos</p><ul class="recommendation-list">${recommendations.slice(0, 3).map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>
            <section class="drawer-section"><p class="eyebrow">Histórico cronológico</p>${timeline.length
                ? `<ol class="client-timeline">${timeline.map((item) => `<li><span class="timeline-icon" aria-hidden="true">${item.icon}</span><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p><time datetime="${escapeHtml(item.date || "")}">${escapeHtml(formatDate(item.date))}</time></div></li>`).join("")}</ol>`
                : `<div class="empty-state"><strong>Sem atividades registradas</strong><span>Os códigos, resgates e avaliações aparecerão aqui.</span></div>`}</section>
        </div>`, { size: "modal-drawer" });
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
            state.dashboard = {
                users: database.users,
                feedbacks: database.feedbacks,
                redemptions: database.redemptions,
                stampEvents: database.stampEvents,
                codes: database.codes
            };
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
        const timestamp = new Date().toISOString();
        localCode.used = true;
        localCode.usedAt = timestamp;
        localCode.idUsuario = Number(state.user.idUsuario);
        const user = getDemoUserById(database, state.user.idUsuario);
        user.selos = (Number(user.selos) || 0) + 1;
        database.stampEvents.push({
            id: `stamp-${normalizedCode}`,
            idUsuario: Number(user.idUsuario),
            codigo: normalizedCode,
            valorCompra: Number(localCode.valor) || MIN_PURCHASE,
            dataHora: timestamp
        });
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
            database.redemptions.push({
                id: Date.now(),
                idUsuario: user.idUsuario,
                item: "Item cortesia do cardápio",
                dataHora: new Date().toISOString()
            });
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
            database.codes.push({ codigo: generated, valor: amount, used: false, criadoEm: new Date().toISOString() });
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

    function startClientAction(action) {
        if (!state.user) {
            state.pendingAction = action;
            state.alert = { type: "warning", message: "Entre na sua conta para continuar." };
            go("login", { preserveAlert: true });
            return;
        }
        if (!isCustomer()) {
            showToast("Esse recurso está disponível para contas de cliente.", "info");
            return;
        }
        if (state.screen !== "loyalty") {
            state.pendingAction = action;
            navigateRoute("loyalty");
            return;
        }
        state.selectedRating = 5;
        openModal(action === "validate" ? "scan" : "feedback");
    }

    function handleClick(event) {
        const target = event.target.closest("[data-route], [data-action], [data-demo-role], [data-category], [data-period], [data-rating-filter], [data-rating], [data-admin-tab]");
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
        if (target.dataset.adminTab) {
            state.adminTab = target.dataset.adminTab === "clients" ? "clients" : "overview";
            if (state.screen !== "dashboard") navigateRoute("dashboard");
            else render();
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
                startClientAction("feedback");
                break;
            case "hub-validate":
                startClientAction("validate");
                break;
            case "admin-clients":
                state.adminTab = "clients";
                navigateRoute("dashboard");
                break;
            case "client-details":
                if (!isAdmin()) {
                    showToast("Acesso restrito à administração.", "error");
                    return;
                }
                openModal("client-details", { clientId: target.dataset.clientId });
                break;
            case "clear-client-filters":
                state.clientSearch = "";
                state.clientLoyaltyFilter = "all";
                state.clientLocationFilter = "all";
                state.clientRatingFilter = "all";
                state.clientAgeFilter = "all";
                render();
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
        if (event.target.matches("[data-client-search]")) {
            state.clientSearch = event.target.value;
            render({ preserveFocus: event.target });
            return;
        }
        if (event.target.matches("[data-catalog-search]")) {
            state.catalogSearch = event.target.value;
            render({ preserveFocus: event.target });
            return;
        }
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
        if (event.target.matches("[data-client-filter]")) {
            const filter = event.target.dataset.clientFilter;
            if (filter === "loyalty") state.clientLoyaltyFilter = event.target.value;
            if (filter === "location") state.clientLocationFilter = event.target.value;
            if (filter === "rating") state.clientRatingFilter = event.target.value;
            if (filter === "age") state.clientAgeFilter = event.target.value;
            render({ preserveFocus: event.target });
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
        const protectedRoutes = new Set(["loyalty", "profile", "dashboard", "attendant", "attendant-code"]);
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
