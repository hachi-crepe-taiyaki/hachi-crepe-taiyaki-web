import { beforeAll, describe, expect, it } from "vitest";

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForElement(selector) {
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
        const element = document.querySelector(selector);
        if (element) return element;
        await delay(10);
    }
    throw new Error(`Elemento não encontrado: ${selector}`);
}

describe("local interface interactions", () => {
    beforeAll(async () => {
        window.history.replaceState(null, "", `${window.location.pathname}#home`);
        localStorage.clear();
        localStorage.setItem("hachi-conecta-demo-v1", JSON.stringify({
            schemaVersion: 3,
            users: [],
            feedbacks: [],
            products: [{ idProduto: 1, nome: "Produto antigo" }],
            codes: [],
            redemptions: [],
            stampEvents: []
        }));
        sessionStorage.clear();
        document.body.innerHTML = '<div id="app" class="app-shell"></div><div id="toast-region"></div>';
        await import("../app.js");
    });

    it("supports modal dismissal, local demo data and keyboard star selection", async () => {
        const termsLink = document.querySelector('[data-legal="Termos e Condições de Uso"]');
        termsLink.focus();
        termsLink.click();

        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(document.body.classList.contains("modal-open")).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(document.querySelector(".modal-backdrop").classList.contains("is-closing")).toBe(true);
        await waitForElement(".home-footer");
        await delay(230);
        expect(document.querySelector(".modal-backdrop")).toBeNull();
        expect(document.activeElement.dataset.legal).toBe("Termos e Condições de Uso");
        expect(document.body.classList.contains("modal-open")).toBe(false);

        document.querySelector('[data-legal="Termos e Condições de Uso"]').click();
        const backdrop = document.querySelector(".modal-backdrop");
        document.querySelector('[role="dialog"]').click();
        expect(backdrop.classList.contains("is-closing")).toBe(false);
        backdrop.click();
        expect(backdrop.classList.contains("is-closing")).toBe(true);
        await delay(230);
        expect(document.querySelector(".modal-backdrop")).toBeNull();

        document.querySelector('[data-action="hub-validate"]').click();
        const loginForm = await waitForElement("#login-form");
        loginForm.querySelector("#login-email").value = "camila@demo.hachi";
        loginForm.querySelector("#login-password").value = "hachi123";
        loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitForElement("#manual-code-form");
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        document.querySelector(".modal-close").click();
        await delay(230);
        const feedbackButton = await waitForElement(".loyalty-layout ~ .page-links [data-action='feedback']");

        const database = JSON.parse(localStorage.getItem("hachi-conecta-demo-v1"));
        expect(database.schemaVersion).toBe(4);
        expect(database.users.filter((user) => Number(user.funcao) === 0)).toHaveLength(7);
        expect(database.stampEvents.length).toBeGreaterThan(0);
        expect(database.feedbacks.some((item) => item.comentario === ".sjcyp9e")).toBe(false);
        expect(database.products).toHaveLength(72);
        expect(database.products.some((product) => product.nome === "Produto antigo")).toBe(false);
        expect(database.products.some((product) => product.nome === "Taiyaki Tradicional" && product.preco === 12.9 && product.elegivelResgate)).toBe(true);
        expect(database.products.some((product) => product.nome === "Crepe Especial" && product.preco === 22 && !product.elegivelResgate)).toBe(true);
        expect(database.products.some((product) => product.nome === "Sorvete de Matchá" && product.preco === 12 && !product.elegivelResgate)).toBe(true);
        expect(database.users.filter((user) => Number(user.funcao) === 0).every((user) => user.dtNasc)).toBe(true);

        feedbackButton.click();
        const threeStars = document.querySelector('[data-rating="3"]');
        threeStars.focus();
        threeStars.click();
        threeStars.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
        const fourStars = document.querySelector('[data-rating="4"]');
        expect(fourStars.getAttribute("aria-pressed")).toBe("true");
        expect(document.activeElement).toBe(fourStars);

        document.querySelector(".modal-close").click();
        await delay(230);
        document.querySelector('.nav-link[data-route="catalog"]').click();
        await waitForElement("[data-catalog-search]");
        expect(document.querySelectorAll(".product-card")).toHaveLength(72);

        document.querySelector('[data-category="Taiyaki"]').click();
        expect(document.querySelectorAll(".product-card")).toHaveLength(6);
        expect(document.querySelector(".product-card h3").textContent).toBe("Taiyaki Tradicional");

        document.querySelector('[data-category="Todas"]').click();
        const search = document.querySelector("[data-catalog-search]");
        search.value = "Hachi Avelã";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        expect(document.querySelectorAll(".product-card")).toHaveLength(1);
        expect(document.querySelector(".product-card h3").textContent).toBe("Hachi Avelã");
        expect(document.querySelector(".product-card .product-price").textContent).toContain("23,00");
    });

    it("filters clients by age and displays age in the customer drawer", async () => {
        document.querySelector('[data-action="logout"]').click();
        const adminDemo = await waitForElement('[data-demo-role="admin"]');
        adminDemo.click();
        await waitForElement('[data-admin-tab="clients"]');
        document.querySelector('[data-admin-tab="clients"]').click();

        const ageFilter = await waitForElement('[data-client-filter="age"]');
        ageFilter.value = "25-34";
        ageFilter.dispatchEvent(new Event("change", { bubbles: true }));

        const clients = [...document.querySelectorAll(".client-table tbody tr")].map((row) => row.textContent);
        expect(clients.some((row) => row.includes("Mika Aoki"))).toBe(true);
        expect(clients.some((row) => row.includes("Rafael Sato"))).toBe(false);
        expect(document.querySelector(".insight-card:last-child").textContent).toContain("Faixa etária predominante neste filtro");

        document.querySelector('[data-client-id="9004"][data-action="client-details"]').click();
        const drawer = await waitForElement('[role="dialog"]');
        expect(drawer.textContent).toContain("Idade");
        expect(drawer.textContent).toContain("Data de nascimento");
    });
});
