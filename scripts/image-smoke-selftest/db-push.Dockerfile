FROM postgres:18.6
ARG MODE
ENV MODE=${MODE}
CMD ["sh", "-c", "[ \"$MODE\" = no-tables ] && exit 0; psql \"$DATABASE_URL\" -qc 'create table selftest (id int)' || exit 1; [ \"$MODE\" = exit-3 ] && exit 3; exit 0"]
