import React from "react";

function getRatingSummary(feedbacks) {
    const ratings = feedbacks
        .map((feedback) => Number(feedback.nota))
        .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
    const counts = [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: ratings.filter((value) => value === rating).length
    }));

    return {
        total: ratings.length,
        average: ratings.length
            ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
            : "0.0",
        counts
    };
}

export default function RatingDistribution({ feedbacks = [] }) {
    const summary = getRatingSummary(feedbacks);

    if (!summary.total) {
        return (
            <div className="rating-empty" role="status">
                <span className="rating-empty-icon" aria-hidden="true">☆</span>
                <strong>As avaliações aparecerão aqui</strong>
                <span>Ainda não há feedbacks neste período.</span>
            </div>
        );
    }

    return (
        <div className="rating-distribution">
            <div className="rating-summary">
                <strong className="rating-average">{summary.average}</strong>
                <div>
                    <div className="rating-summary-stars" role="img" aria-label={`Média de ${summary.average} de 5 estrelas`}>
                        {[1, 2, 3, 4, 5].map((star) => {
                            const score = Number(summary.average);
                            const className = score >= star ? "is-filled" : score > star - 1 ? "is-partial" : "";
                            const partial = className === "is-partial"
                                ? { backgroundImage: `linear-gradient(90deg, #b66a12 ${(score % 1) * 100}%, #ded6cd ${(score % 1) * 100}%)` }
                                : undefined;
                            return <span className={className} style={partial} key={star} aria-hidden="true">★</span>;
                        })}
                    </div>
                    <span className="rating-summary-caption">
                        {summary.total} {summary.total === 1 ? "avaliação" : "avaliações"}
                    </span>
                </div>
            </div>
            <div className="rating-bars" role="group" aria-label="Distribuição de avaliações por nota">
                {summary.counts.map(({ rating, count }) => {
                    const percentage = Math.round((count / summary.total) * 100);
                    const feedbackLabel = count === 1 ? "avaliação" : "avaliações";
                    return (
                        <div className="rating-bar-row" key={rating}>
                            <span className="rating-bar-label">{rating} <span aria-hidden="true">★</span></span>
                            <div
                                className="rating-bar-track"
                                role="img"
                                aria-label={`${rating} estrelas: ${count} ${feedbackLabel}, ${percentage}%`}
                            >
                                <span className="rating-bar-fill" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="rating-bar-count">{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export { getRatingSummary };
