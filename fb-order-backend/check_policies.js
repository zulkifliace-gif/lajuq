const https = require('https');
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweWtqcWVkbmNmd3F2Y2Fxcm5pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk0MjkxNywiZXhwIjoyMTAxNTE4OTE3fQ.9w3PdVSJ0d5wqDzUsvtYpcwdGi2NFpgSU724dWtEJ2A';
const SUPABASE_HOST = 'wpykjqedncfwqvcaqrni.supabase.co';

async function runSql(query) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: SUPABASE_HOST,
      path: '/pg/v1/query',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let d = '';
      res.on('data', x => d += x);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.write(body);
    req.end();
  });
}

async function auditPolicies() {
  const query = `
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public';
  `;
  const result = await runSql(query);
  console.log(JSON.stringify(result, null, 2));
}

auditPolicies();
