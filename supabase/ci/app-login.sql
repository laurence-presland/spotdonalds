-- Throwaway LOGIN for the CI database only. Not a migration.
-- Never run this against the hosted project: it would replace the out-of-band password.
-- scripts/apply-migrations.sh applies it only when SPOTDONALDS_CI_LOGIN=1.

alter role spotdonalds_app with login password 'spotdonalds_ci';
