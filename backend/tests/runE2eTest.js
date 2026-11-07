async function main() {
  console.log('Starting E2E API test on http://localhost:5000 ...');

  // 1. Quick load target
  const qlRes = await fetch('http://localhost:5000/api/system/quick-load-target', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferredModel: 'qwen2.5:1.5b' })
  });
  const job = await qlRes.json();
  console.log(`Created Job: ${job.jobId}, totalChunks: ${job.totalChunks}`);

  // 2. Start analysis
  await fetch(`http://localhost:5000/api/analysis/${job.jobId}/start`, { method: 'POST' });
  console.log('Analysis started. Waiting for completion...');

  let finished = false;
  let attempts = 0;
  while (!finished && attempts < 60) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
    const res = await fetch(`http://localhost:5000/api/analysis/${job.jobId}`);
    const j = await res.json();
    process.stdout.write(`Chunk ${j.completedChunks}/${j.totalChunks} (RAM: ~${j.metrics?.totalTokensProcessed || 0} tokens)... \r`);
    if (j.status === 'COMPLETED' || j.status === 'FAILED') {
      finished = true;
      console.log(`\nJob reached status: ${j.status}`);
      if (j.status === 'COMPLETED') {
        const repRes = await fetch(`http://localhost:5000/api/analysis/${job.jobId}/report`);
        const report = await repRes.json();
        console.log('\n--- FINAL AUDIT FINDINGS ---');
        report.findings.forEach(f => {
          console.log(`[${f.severity}] ${f.attack_type} | IP: ${f.target_or_attacker_id} | ${f.line_range} (Lines: ${f.evidence_lines.join(', ')})`);
          console.log(`  Reason: ${f.reason}`);
        });
        console.log('\n--- SUMMARY ---');
        console.log(`Total incidents: ${report.summary.total_incidents}`);
        console.log(`Tokens Processed: ${report.summary.totalTokensProcessed || j.metrics.totalTokensProcessed}`);
      }
    }
  }
}

main().catch(console.error);
