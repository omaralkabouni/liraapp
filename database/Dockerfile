# =============================================================
# PostgreSQL Custom Image - يضم init.sql و seed.sql تلقائياً
# =============================================================
FROM postgres:16-alpine
COPY init.sql /docker-entrypoint-initdb.d/01_init.sql
COPY seed.sql /docker-entrypoint-initdb.d/02_seed.sql
