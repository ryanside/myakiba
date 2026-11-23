import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { itemIsPaid, paidItemCount, paidItemPrice } from "./order-money";

const dialect = new PgDialect();
const sqlOf = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  dialect.sqlToQuery(fragment).sql.toLowerCase();

test("a Collection Item's Paid reads its joined Order, never a lookup on order for each row", () => {
  const statements = [itemIsPaid, paidItemPrice, paidItemCount].map(sqlOf);

  expect({
    lookups: statements.filter((statement) => statement.includes("select")).length,
    readJoinedOrder: statements.every((statement) => statement.includes('"order"."paid"')),
  }).toEqual({ lookups: 0, readJoinedOrder: true });
});
