// Wrangler --file verwendet die Import-API (keine Ergebniszeilen). Für normale Query-Aufrufe
// SQL erst im CLI-Prozess in process.argv einsetzen, nicht in die sichtbaren OS-Argumente.
const fs = require('node:fs');
const entry = process.argv[1] || '';
const index = process.argv.indexOf('--command');
if (/[/\\]wrangler-dist[/\\]cli\.js$/u.test(entry) && index >= 0 && process.argv[index + 1] === '__LANDESRECHT_FEEDBACK_SQL__') {
  const file = process.env.LANDESRECHT_FEEDBACK_SQL_FILE;
  if (!file) throw new Error('Feedback-CLI-Transport nicht eingerichtet');
  process.argv[index + 1] = fs.readFileSync(file, 'utf8');
  delete process.env.LANDESRECHT_FEEDBACK_SQL_FILE;
}
