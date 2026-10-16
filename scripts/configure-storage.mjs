import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  region: { type: 'string', default: 'us-east-2' },
  stack: { type: 'string', default: 'amplify-altan-local-apis-storage' },
  app: { type: 'string', default: 'd35166z8sfi9mb' },
  branch: { type: 'string', default: 'master' }
} })
function aws(...args) {
  return JSON.parse(execFileSync('aws', [...args, '--region', values.region, '--output', 'json'], { encoding: 'utf8', windowsHide: true }))
}
const stack = aws('cloudformation', 'describe-stacks', '--stack-name', values.stack).Stacks[0]
const outputs = Object.fromEntries(stack.Outputs.map(output => [output.OutputKey, output.OutputValue]))
if (!outputs.ComputeRoleArn || !outputs.TableName) throw new Error('The stack does not expose a table and Compute role.')
const branch = aws('amplify', 'get-branch', '--app-id', values.app, '--branch-name', values.branch).branch
const environmentVariables = {
  ...branch.environmentVariables,
  MOCK_STORAGE: 'dynamodb', DYNAMODB_TABLE: outputs.TableName,
  DYNAMODB_REGION: values.region, MOCK_NAMESPACE: 'default'
}
const input = {
  appId: values.app, branchName: values.branch,
  computeRoleArn: outputs.ComputeRoleArn, environmentVariables
}
// AWS CLI requires a file on Windows. Keep existing environment secrets out of
// command-line arguments and output, and remove the private temporary input.
const directory = mkdtempSync(join(tmpdir(), 'altan-storage-'))
const inputPath = join(directory, 'input.json')
try {
  writeFileSync(inputPath, JSON.stringify(input), { mode: 0o600 })
  const result = aws('amplify', 'update-branch', '--cli-input-json', `file://${inputPath}`)
  console.log(JSON.stringify({ branch: result.branch.branchName, table: outputs.TableName, region: values.region, computeRole: outputs.ComputeRoleArn }))
} finally {
  unlinkSync(inputPath)
  rmdirSync(directory)
}
