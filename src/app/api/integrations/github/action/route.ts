import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/integrations/github/action?url=<site>&threshold=80
 * 
 * Returns a ready-to-use GitHub Actions workflow YAML
 * that runs RegLayer as a deployment gate.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") || "https://your-site.com";
  const threshold = request.nextUrl.searchParams.get("threshold") || "80";
  const origin = request.nextUrl.origin;

  const yaml = `# RegLayer Accessibility Gate
# Add this to .github/workflows/accessibility.yml
# Runs on every push and blocks merge if score drops below threshold.

name: Accessibility Check

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday 6am

jobs:
  accessibility-scan:
    name: RegLayer Accessibility Gate
    runs-on: ubuntu-latest
    
    steps:
      - name: Run Accessibility Scan
        id: scan
        run: |
          RESULT=$(curl -s -X POST \\
            -H "Authorization: Bearer \${{ secrets.REGLAYER_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"url": "${url}", "threshold": ${threshold}}' \\
            ${origin}/api/gate)
          
          echo "result=$RESULT" >> $GITHUB_OUTPUT
          
          PASSED=$(echo $RESULT | jq -r '.passed')
          SCORE=$(echo $RESULT | jq -r '.score')
          REPORT_URL=$(echo $RESULT | jq -r '.reportUrl')
          
          echo "## Accessibility Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Score | $SCORE/100 |" >> $GITHUB_STEP_SUMMARY
          echo "| Threshold | ${threshold} |" >> $GITHUB_STEP_SUMMARY
          echo "| Status | $([ \\"$PASSED\\" = 'true' ] && echo '✅ PASSED' || echo '❌ FAILED') |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "[Full Report]($REPORT_URL)" >> $GITHUB_STEP_SUMMARY
          
          if [ "$PASSED" != "true" ]; then
            REASON=$(echo $RESULT | jq -r '.reason')
            echo "❌ Accessibility check failed: $REASON"
            exit 1
          fi
          
          echo "✅ Accessibility check passed (Score: $SCORE)"
      
      - name: Update Badge
        if: github.ref == 'refs/heads/main' && always()
        run: |
          echo "Badge URL: ${origin}/api/badge?url=${encodeURIComponent(url)}"
`;

  return new Response(yaml, {
    headers: {
      "Content-Type": "text/yaml",
      "Content-Disposition": `attachment; filename="accessibility.yml"`,
    },
  });
}
