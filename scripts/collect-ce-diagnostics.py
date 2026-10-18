"""Retain startup evidence without container environment or authentication data."""
import json
import pathlib
import re
import subprocess

output = pathlib.Path('artifacts')
output.mkdir(exist_ok=True)
env_file = pathlib.Path('/tmp/ace-ce-validation.env')
secrets = [line.partition('=')[2] for line in env_file.read_text().splitlines()] if env_file.exists() else []


def redact(value):
    for secret in secrets:
        if secret:
            value = value.replace(secret, '[REDACTED]')
    value = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', value)
    value = re.sub(r'(?i)("?(?:password|token|secret|authorization)"?\s*[:=]\s*)"?[^\s",}]+', r'\1[REDACTED]', value)
    return value


inspected = subprocess.run(['docker', 'inspect', 'ace-ce-validation'], capture_output=True, text=True)
if inspected.returncode == 0:
    container = json.loads(inspected.stdout)[0]
    state = container['State']
    safe = {'image': container['Config']['Image'], 'image_id': container['Image'],
            'state': {key: state.get(key) for key in ['Status', 'Running', 'ExitCode', 'OOMKilled', 'Error', 'StartedAt', 'FinishedAt']}}
else:
    safe = {'container_inspect_exit_code': inspected.returncode, 'error': redact(inspected.stderr)}
(output / 'ce-host-state.json').write_text(redact(json.dumps(safe, indent=2)) + '\n')
logs = subprocess.run(['docker', 'logs', '--tail', '500', 'ace-ce-validation'], capture_output=True, text=True)
(output / 'ce-host.log').write_text(redact(logs.stdout + logs.stderr))
print(json.dumps(safe, indent=2))
print('Sanitized container logs retained as ce-host.log; full environment is excluded.')
