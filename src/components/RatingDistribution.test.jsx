// Runtime validation coverage for: dashboard rating summaries and empty state.
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RatingDistribution from "./RatingDistribution.jsx";

describe("RatingDistribution", () => {
    it("shows a clear average and rating bars for feedback", () => {
        render(
            <RatingDistribution
                feedbacks={[
                    { nota: 5 },
                    { nota: 4 },
                    { nota: 5 },
                    { nota: 2 },
                    { nota: "invalid" }
                ]}
            />
        );

        expect(screen.getByText("4.0")).toBeInTheDocument();
        expect(screen.getByText("4 avaliações")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "5 estrelas: 2 avaliações, 50%" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "2 estrelas: 1 avaliação, 25%" })).toBeInTheDocument();
    });

    it("handles an empty period without rendering broken chart markup", () => {
        render(<RatingDistribution feedbacks={[]} />);

        expect(screen.getByRole("status")).toHaveTextContent("Ainda não há feedbacks neste período.");
        expect(screen.queryByLabelText(/Gráfico de notas/)).not.toBeInTheDocument();
        expect(within(screen.getByRole("status")).getByText("As avaliações aparecerão aqui")).toBeInTheDocument();
    });
});
