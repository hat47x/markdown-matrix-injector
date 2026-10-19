// How to start npm / npx from a Node script on every OS.
//
// Windows refuses to spawn npm.cmd / npx.cmd without a shell (spawnSync
// returns EINVAL since the Node.js fix for CVE-2024-27980), so those go
// through cmd.exe, with arguments quoted for it.
export function spawnPlan(command, args, platform = process.platform) {
  if (platform === 'win32' && ['npm', 'npx'].includes(command)) {
    const quote = (value) => (/[\s"&|<>^]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value);
    return { file: `${command}.cmd`, args: args.map(quote), shell: true };
  }
  return { file: command, args, shell: false };
}
