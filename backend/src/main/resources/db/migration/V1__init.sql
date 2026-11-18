-- Schéma initial V1 (cf. docs/SPEC.md). Tout se compte en heures, au pas de 0,25.

CREATE TABLE app_user (
    id          BIGSERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    first_name  VARCHAR(100),
    last_name   VARCHAR(100),
    role        VARCHAR(20)  NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'ADMIN')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_app_user_email ON app_user (lower(email));

-- Créneaux de travail (planning)
CREATE TABLE work_slot (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user (id),
    slot_date   DATE        NOT NULL,
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_work_slot_times CHECK (end_time > start_time)
);
CREATE INDEX ix_work_slot_date ON work_slot (slot_date);
CREATE INDEX ix_work_slot_user ON work_slot (user_id);

-- Déclarations d'heures supplémentaires
CREATE TABLE overtime_request (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES app_user (id),
    work_date      DATE         NOT NULL,
    hours          NUMERIC(5,2) NOT NULL,
    reason         TEXT         NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    admin_comment  TEXT,
    decided_by     BIGINT REFERENCES app_user (id),
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_overtime_hours CHECK (hours > 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_overtime_user_status ON overtime_request (user_id, status);

-- Absences (récup d'heures sup ou sans solde)
CREATE TABLE absence_request (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES app_user (id),
    type           VARCHAR(20)  NOT NULL CHECK (type IN ('RECUP_HEURES_SUP', 'SANS_SOLDE')),
    start_date     DATE         NOT NULL,
    end_date       DATE         NOT NULL,
    hours          NUMERIC(5,2) NOT NULL,
    comment        TEXT,
    status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    admin_comment  TEXT,
    decided_by     BIGINT REFERENCES app_user (id),
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_absence_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_absence_hours CHECK (hours > 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_absence_user_status ON absence_request (user_id, status);
CREATE INDEX ix_absence_dates ON absence_request (start_date, end_date);

-- Ajustements de solde saisis par un admin (+/- heures)
CREATE TABLE balance_adjustment (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES app_user (id),
    hours       NUMERIC(6,2) NOT NULL,
    reason      TEXT         NOT NULL,
    created_by  BIGINT       NOT NULL REFERENCES app_user (id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_adjustment_hours CHECK (hours <> 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_adjustment_user ON balance_adjustment (user_id);

-- Premier admin (email fourni par configuration : spring.flyway.placeholders.initialAdminEmail)
INSERT INTO app_user (email, first_name, last_name, role)
VALUES ('${initialAdminEmail}', 'Admin', 'Initial', 'ADMIN');
