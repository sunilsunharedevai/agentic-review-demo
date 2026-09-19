import path from 'node:path';
import { QualityAgent } from './quality-agent';
import { TraceRecorder } from './trace';

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '../../../sample-project');
  const result = await new QualityAgent(root, new TraceRecorder('demo')).run();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
