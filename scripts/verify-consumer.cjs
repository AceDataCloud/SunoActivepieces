const fs = require('node:fs');
const path = require('node:path');
const expected = require(path.resolve('package.json'));
const root = path.join(process.argv[2], 'node_modules', expected.name);
const installed = require(path.join(root, 'package.json'));
if (installed.name !== expected.name || installed.version !== expected.version) throw new Error('Unexpected installed package.');
const piece = Object.values(require(root)).find(value => value && typeof value.getAction === 'function');
if (!piece) throw new Error('Installed package has no loadable Piece.');
const example = fs.readdirSync(path.join(root, 'examples')).find(name => name.endsWith('.json'));
const flow = JSON.parse(fs.readFileSync(path.join(root, 'examples', example), 'utf8'));
const actions = [];
for (let step = flow.flows[0].trigger.nextAction; step; step = step.nextAction) {
  if (!piece.getAction(step.settings.actionName)) throw new Error('Template action is not installed.');
  if (step.settings.pieceVersion !== installed.version || step.settings.input.auth !== '') throw new Error('Unsafe or stale template.');
  actions.push({ action: step.settings.actionName, input_names: Object.keys(step.settings.input) });
}
if (actions.length !== 2) throw new Error('Expected creation and lookup actions.');
const lookup = flow.flows[0].trigger.nextAction.nextAction.settings.input;
if ((lookup.taskId || lookup.task_id) !== "{{step_1['output']['task_id']}}") throw new Error('Same-task mapping was not retained.');
const result = { package: installed.name, version: installed.version, display_name: piece.metadata().displayName, actions, ordinary_public_npm_install: true, template_same_task_mapping: true, empty_connections: true, paid_API_calls: 0, limitation: 'Fresh public npm consumer, not Activepieces CE server or official shared catalog.' };
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/public-npm-consumer.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
