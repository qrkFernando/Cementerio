-- Sucursales (branches) + sectorización por sucursal

CREATE TABLE IF NOT EXISTS branches (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL UNIQUE
);

-- Seed de sucursales solicitadas
INSERT INTO branches (name)
VALUES
	('Lima (Huachipa)'),
	('Chiclayo (Monsefú)'),
	('Piura (Castilla/Río Seco)'),
	('Ica (Ricardo Palma/Fundo El Guayabo)'),
	('Chincha (Sunampe)'),
	('Pisco (Alto El Molino)'),
	('Huancayo')
ON CONFLICT (name) DO NOTHING;

-- Agrega branch_id a sectors y migra data existente a una sucursal por defecto
ALTER TABLE sectors
	ADD COLUMN IF NOT EXISTS branch_id BIGINT;

-- FK (idempotente)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.table_constraints
		WHERE constraint_type = 'FOREIGN KEY'
			AND table_name = 'sectors'
			AND constraint_name = 'sectors_branch_id_fkey'
	) THEN
		ALTER TABLE sectors
			ADD CONSTRAINT sectors_branch_id_fkey
			FOREIGN KEY (branch_id) REFERENCES branches(id);
	END IF;
END $$;

-- Asignar sucursal por defecto a sectores existentes (para no romper datos previos)
UPDATE sectors s
SET branch_id = b.id
FROM branches b
WHERE s.branch_id IS NULL
	AND b.name = 'Lima (Huachipa)';

-- Asegura que exista al menos una branch y que branch_id quede completo
UPDATE sectors s
SET branch_id = b.id
FROM (
	SELECT id FROM branches ORDER BY id ASC LIMIT 1
) b
WHERE s.branch_id IS NULL;

ALTER TABLE sectors
	ALTER COLUMN branch_id SET NOT NULL;

-- Cambia unicidad: antes era UNIQUE(name), ahora UNIQUE(branch_id, name)
ALTER TABLE sectors
	DROP CONSTRAINT IF EXISTS sectors_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS sectors_branch_name_ux
	ON sectors (branch_id, name);

-- Seeds mínimos de sectores A-D por sucursal
INSERT INTO sectors (branch_id, name)
SELECT b.id, v.name
FROM branches b
CROSS JOIN (VALUES ('A'), ('B'), ('C'), ('D')) AS v(name)
ON CONFLICT (branch_id, name) DO NOTHING;
