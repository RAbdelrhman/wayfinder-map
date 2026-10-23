// Both fixture boundaries reject attempted writes, including gh's implicit POST for bodies.
exports.requireReadOnlyApi = function requireReadOnlyApi(args) {
  if (args[0] !== 'api') return;
  const methods = [];
  let hasBody = false;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-X' || arg === '--method') methods.push(args[++i]);
    else if (arg.startsWith('--method=')) methods.push(arg.slice('--method='.length));
    else if (arg.startsWith('-X')) methods.push(arg.slice(2));
    else if (/^(-[fF]|--(?:raw-)?field(?:=|$)|--input(?:=|$))/.test(arg)) hasBody = true;
  }
  if (methods.length === 0) methods.push(hasBody ? 'POST' : 'GET');
  if (methods.some(method => method !== 'GET')) throw new Error('Blocked fixture API write method');
};
