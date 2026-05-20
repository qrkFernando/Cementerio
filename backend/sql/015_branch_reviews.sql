-- Reseas / Encuesta por sede (branch)

CREATE TABLE IF NOT EXISTS branch_reviews (
	id BIGSERIAL PRIMARY KEY,
	branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
	client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
	rating INT NOT NULL,
	comment TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT branch_reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
	CONSTRAINT branch_reviews_branch_client_ux UNIQUE (branch_id, client_id)
);

CREATE INDEX IF NOT EXISTS branch_reviews_branch_updated_idx
	ON branch_reviews (branch_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS branch_reviews_client_updated_idx
	ON branch_reviews (client_id, updated_at DESC);
