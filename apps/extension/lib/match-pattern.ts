/** Firefox ignores a match pattern whose host carries a port (https://bugzil.la/1362809), so its host goes alone. */
export function withoutPort(pattern: string): string {
  return pattern.replace(/^([^:/]+:\/\/(?:\[[^\]/]*\]|[^/:[]+)):\d+\//u, "$1/");
}
