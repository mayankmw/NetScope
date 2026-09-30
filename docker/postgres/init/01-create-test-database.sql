-- Runs once, when the postgres-data volume is first initialized.
-- The image already created the "netscope" role and database from POSTGRES_USER / POSTGRES_DB.
-- `npm test` uses this separate database; its name must end in "_test".
CREATE DATABASE netscope_test OWNER netscope;
