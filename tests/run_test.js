// Teste de regressão do motor: concatena engine/* + test_body.js e avalia.
// Rodar da raiz ou de qualquer lugar: node tests/run_test.js
// Esperado: 13+ linhas "OK ..." e NENHUMA "FALHA".
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SCRATCH = __dirname;
const src = ['engine/data.js', 'engine/radio_phrase.js', 'engine/separation.js', 'engine/holding.js', 'engine/emergency.js', 'engine/runway_state.js', 'engine/emergency_units.js', 'engine/emergency_response.js', 'engine/emergency_traffic.js', 'engine/approach.js', 'engine/aircraft.js', 'engine/commands.js', 'engine/core.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n')
  + '\n' + fs.readFileSync(path.join(SCRATCH, 'test_body.js'), 'utf8');
eval(src);
