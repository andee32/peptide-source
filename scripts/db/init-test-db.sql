-- Runs once on first `docker compose up` (empty data volume). Creates the scratch
-- database the integration suite points at, so tests never touch dev data.
CREATE DATABASE app_test;
