/**
 * How Firefox matches a URL: a pattern whose host carries a port matches nothing, so its content script never runs and
 * tabs.query finds no tab (https://bugzil.la/1362809, https://bugzil.la/1468162). A host without a port matches any port.
 */
export function firefoxMatches(pattern: string, url: string): boolean {
  const parts = /^(?<scheme>[a-z]+):\/\/(?<host>[^/]+)(?<path>\/.*)$/u.exec(pattern)?.groups;
  if (!parts?.scheme || !parts.host || !parts.path || parts.host.includes(":")) return false;
  const target = new URL(url);
  const glob = new RegExp(`^${parts.path.split("*").map(RegExp.escape).join(".*")}$`, "u");
  return (
    `${parts.scheme}:` === target.protocol &&
    parts.host === target.hostname &&
    glob.test(`${target.pathname}${target.search}`)
  );
}
