/**
 * RegLayer — Risk Disclaimer Component
 *
 * WHY: Legal requirement — risk scores are informational, not legal advice.
 * WHAT: Non-dismissable disclaimer shown below every risk score display.
 */

export function RiskDisclaimer() {
  return (
    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
        This score is an informational estimate based on publicly available lawsuit filing patterns
        and is not legal advice. Consult qualified legal counsel for compliance decisions.
      </p>
    </div>
  );
}
