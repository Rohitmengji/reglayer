import { NextRequest } from "next/server";

/**
 * GET /api/integrations/github/action?url=<site>&threshold=80&mode=review
 * 
 * Returns a ready-to-use GitHub Actions workflow YAML.
 * 
 * Modes:
 * - "gate" (default): Simple pass/fail gate
 * - "review": Full PR review with inline fix suggestions
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") || "https://your-site.com";
  const threshold = request.nextUrl.searchParams.get("threshold") || "80";
  const mode = request.nextUrl.searchParams.get("mode") || "review";
  const origin = request.nextUrl.origin;

  if (mode === "review") {
    return new Response(generateReviewYaml(url, threshold, origin), {
      headers: {
        "Content-Type": "text/yaml",
        "Content-Disposition": `attachment; filename="accessibility-review.yml"`,
      },
    });
  }

  return new Response(generateGateYaml(url, threshold, origin), {
    headers: {
      "Content-Type": "text/yaml",
      "Content-Disposition": `attachment; filename="accessibility.yml"`,
    },
  });
}

function generateReviewYaml(url: string, threshold: string, origin: string): string {
  return `# RegLayer Accessibility CI Gatekeeper with Inline Fixes
# Add this to .github/workflows/accessibility.yml
#
# On every PR, this action:
# 1. Scans your deployed preview for accessibility issues
# 2. Posts a PR review with fix suggestions you can apply in one click
# 3. Blocks merge if score drops below threshold
#
# Required secrets:
#   REGLAYER_API_KEY — Your RegLayer API key (Settings → API Keys)
#   GH_TOKEN — GitHub token with repo + pull_request write scope

name: Accessibility Review

on:
  pull_request:
    branches: [main, develop]
  deployment_status:

permissions:
  pull-requests: write
  contents: read

jobs:
  accessibility-review:
    name: RegLayer Accessibility Review
    runs-on: ubuntu-latest
    # Run on successful deployment OR on PR (with static URL)
    if: >
      (github.event_name == 'deployment_status' && github.event.deployment_status.state == 'success') ||
      github.event_name == 'pull_request'

    steps:
      - name: Determine scan URL
        id: url
        run: |
          if [ "\${{ github.event_name }}" = "deployment_status" ]; then
            echo "scan_url=\${{ github.event.deployment_status.target_url }}" >> $GITHUB_OUTPUT
          else
            echo "scan_url=${url}" >> $GITHUB_OUTPUT
          fi

      - name: Get PR number
        id: pr
        run: |
          if [ "\${{ github.event_name }}" = "pull_request" ]; then
            echo "number=\${{ github.event.pull_request.number }}" >> $GITHUB_OUTPUT
          else
            # Find PR associated with this deployment
            PR_NUMBER=$(curl -s -H "Authorization: token \${{ secrets.GH_TOKEN }}" \\
              "https://api.github.com/repos/\${{ github.repository }}/commits/\${{ github.sha }}/pulls" | \\
              jq -r '.[0].number // empty')
            echo "number=$PR_NUMBER" >> $GITHUB_OUTPUT
          fi

      - name: Run Accessibility Scan & Post Review
        id: scan
        if: steps.pr.outputs.number != ''
        run: |
          RESULT=$(curl -s -w "\\n%{http_code}" -X POST \\
            -H "Authorization: Bearer \${{ secrets.REGLAYER_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "url": "'\${{ steps.url.outputs.scan_url }}'",
              "threshold": ${threshold},
              "generateFixes": true,
              "github": {
                "owner": "\${{ github.repository_owner }}",
                "repo": "\${{ github.event.repository.name }}",
                "token": "\${{ secrets.GH_TOKEN }}",
                "prNumber": '\${{ steps.pr.outputs.number }}'
              }
            }' \\
            ${origin}/api/gate/review)

          HTTP_CODE=$(echo "$RESULT" | tail -n1)
          BODY=$(echo "$RESULT" | sed '$d')

          echo "response=$BODY" >> $GITHUB_OUTPUT

          PASSED=$(echo $BODY | jq -r '.passed')
          SCORE=$(echo $BODY | jq -r '.score')
          VIOLATIONS=$(echo $BODY | jq -r '.violations.total')
          CRITICAL=$(echo $BODY | jq -r '.violations.critical')

          echo "## ♿ Accessibility Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Score | **$SCORE/100** |" >> $GITHUB_STEP_SUMMARY
          echo "| Threshold | ${threshold} |" >> $GITHUB_STEP_SUMMARY
          echo "| Violations | $VIOLATIONS |" >> $GITHUB_STEP_SUMMARY
          echo "| Critical | $CRITICAL |" >> $GITHUB_STEP_SUMMARY
          echo "| Status | $([ \\"$PASSED\\" = 'true' ] && echo '✅ PASSED' || echo '❌ FAILED') |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "📝 Fix suggestions have been posted as PR review comments." >> $GITHUB_STEP_SUMMARY

          if [ "$PASSED" != "true" ]; then
            REASON=$(echo $BODY | jq -r '.reason')
            echo "❌ Accessibility check failed: $REASON"
            echo "💡 Check the PR review comments for one-click fix suggestions."
            exit 1
          fi

          echo "✅ Accessibility check passed (Score: $SCORE)"
`;
}

function generateGateYaml(url: string, threshold: string, origin: string): string {
  return `# RegLayer Accessibility Gate
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
}
