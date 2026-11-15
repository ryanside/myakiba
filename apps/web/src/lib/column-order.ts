export function withNewColumns(stored: readonly string[], defaults: readonly string[]): string[] {
  const order = [...stored];
  defaults.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = defaults.slice(0, index).findLast((earlier) => order.includes(earlier));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order;
}
