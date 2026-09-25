import http from 'http';
import app from '../src/app';

/** Sans base de données : vérifie le câblage des routes et que l'authentification les protège toutes. */
const routes: [string, string][] = [
  ['GET', '/api/v1/credits'], ['POST', '/api/v1/credits'], ['POST', '/api/v1/credits/simulation'], ['GET', '/api/v1/credits/1'],
  ['PUT', '/api/v1/credits/1/grille'], ['POST', '/api/v1/credits/grille/apercu'], ['POST', '/api/v1/credits/1/decision'],
  ['POST', '/api/v1/credits/1/decaissement'], ['POST', '/api/v1/credits/1/remboursements'], ['POST', '/api/v1/credits/1/avenants'],
  ['GET', '/api/v1/kyc/dossiers'], ['POST', '/api/v1/kyc/dossiers/1/valider'],
  ['GET', '/api/v1/archives?entite_type=demande_credit&entite_id=1'], ['POST', '/api/v1/parametrages'],
  ['GET', '/api/v1/organisation/zones'], ['PUT', '/api/v1/organisation/zones/1/agents'],
  ['GET', '/api/v1/rbac/me'], ['GET', '/api/v1/rbac/roles'], ['PUT', '/api/v1/rbac/roles/1/permissions'],
];

const server = http.createServer(app).listen(0, async () => {
  const port = (server.address() as { port: number }).port;
  let ko = 0;
  for (const [method, path] of routes) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
    const ok = r.status === 401;
    if (!ok) ko++;
    console.log(`${ok ? 'OK ' : 'KO '} ${method.padEnd(5)} ${path} -> ${r.status}`);
  }
  console.log(ko === 0 ? `\n${routes.length} routes protégées` : `\n${ko} route(s) NON protégée(s)`);
  server.close(); process.exit(ko === 0 ? 0 : 1);
});
