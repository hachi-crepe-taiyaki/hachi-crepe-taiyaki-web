// Runtime validation coverage for: animated modal dismissal and focus restoration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

async function openLegalModal() {
    const trigger = screen.getByRole("link", { name: "Termos e Condições de Uso" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Termos e Condições de Uso" })).toBeInTheDocument();
    expect(document.body).toHaveClass("modal-open");
    return trigger;
}

describe("modal interactions", () => {
    beforeEach(async () => {
        vi.resetModules();
        window.history.replaceState(null, "", `${window.location.pathname}#home`);
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = '<div id="app" class="app-shell"></div><div id="toast-region"></div>';
        await import("../app.js");
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove("modal-open");
        document.body.innerHTML = "";
        localStorage.clear();
        sessionStorage.clear();
    });

    it("closes with Escape and restores focus to the trigger", async () => {
        const trigger = await openLegalModal();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(document.querySelector(".modal-backdrop")).toHaveClass("is-closing");
        await waitFor(() => expect(document.querySelector(".modal-backdrop")).not.toBeInTheDocument());
        expect(document.body).not.toHaveClass("modal-open");
        expect(document.activeElement).toHaveAttribute("data-legal", trigger.getAttribute("data-legal"));
    });

    it("closes when the backdrop itself is clicked", async () => {
        await openLegalModal();

        const backdrop = document.querySelector(".modal-backdrop");
        fireEvent.click(screen.getByRole("dialog"));
        expect(backdrop).not.toHaveClass("is-closing");

        fireEvent.click(backdrop);

        expect(backdrop).toHaveClass("is-closing");
        await waitFor(() => expect(document.querySelector(".modal-backdrop")).not.toBeInTheDocument());
        expect(document.body).not.toHaveClass("modal-open");
    });

    it("lets a customer adjust the feedback stars with keyboard arrows", async () => {
        fireEvent.click(screen.getByText("Acessos rápidos de demonstração"));
        fireEvent.click(screen.getByRole("button", { name: "Cliente" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Enviar feedback" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Enviar feedback" }));

        const threeStars = screen.getByRole("button", { name: "3 estrelas" });
        threeStars.focus();
        fireEvent.click(threeStars);
        fireEvent.keyDown(threeStars, { key: "ArrowRight" });

        const fourStars = screen.getByRole("button", { name: "4 estrelas" });
        expect(fourStars).toHaveAttribute("aria-pressed", "true");
        expect(document.activeElement).toBe(fourStars);
    });
});
