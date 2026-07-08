export function applyEnv(str, vars) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const entry = vars.find((v) => v.key === key);
    return entry !== undefined ? entry.value : match;
  });
}
