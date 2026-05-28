# RegLayer — Compliance Standards Reference

## Supported Standards

### WCAG 2.1 (Web Content Accessibility Guidelines)

| Level | Criteria | Coverage |
|-------|----------|----------|
| Level A | 30 success criteria | Full automated + manual checks |
| Level AA | 20 success criteria | Full automated + manual checks |
| Level AAA | 28 success criteria | Partial (best-effort advisory) |

### EN 301 549 v3.2.1 (European Standard)

The European harmonized standard for ICT accessibility. Maps directly to WCAG 2.1 with additional requirements for:
- Software (Chapter 11)
- Documentation (Chapter 12)
- ICT providing relay or emergency services (Chapter 13)

### Section 508 (US Federal)

Revised Section 508 aligns with WCAG 2.0 Level A and AA. RegLayer evaluates:
- 1194.22 Web-based intranet and internet information and applications
- 1194.31 Functional performance criteria

### European Accessibility Act (EAA)

Directive 2019/882 — applies from June 28, 2025 to:
- E-commerce websites
- Banking services
- Transport services
- E-books and e-readers
- Digital media players

---

## VPAT/ACR Generation

RegLayer auto-generates Voluntary Product Accessibility Conformance Reports:

### Supported Formats
- **JSON** — Structured data for API integration
- **Markdown** — Git-friendly, reviewable format
- **HTML** — Professional print-ready document (Ctrl+P → PDF)

### Conformance Levels
| Level | Definition |
|-------|------------|
| Supports | Fully meets the criterion |
| Partially Supports | Some functionality meets, some does not |
| Does Not Support | Majority of functionality does not meet |
| Not Applicable | Criterion is not relevant to the product |

### Mapping Coverage
- 50 WCAG 2.1 success criteria evaluated
- 50+ axe rule IDs mapped to specific criteria
- Per-criterion remarks with violation details
- Overall conformance level determination
- Legal disclaimer and evaluation methodology

---

## Compliance Scoring

```
Score = 100 - Σ(violation_weight × severity_multiplier)

Severity Multipliers:
  Critical: 10 points
  Serious:   5 points
  Moderate:  2 points
  Minor:     1 point

Max deduction per rule: 25 points
Floor: 0 (minimum score)
```

---

## Regulatory Timeline

| Date | Regulation | Impact |
|------|-----------|--------|
| 2025-06-28 | EAA enforcement begins | All EU digital services must comply |
| 2025-06-28 | EN 301 549 v4 expected | Updated technical standard |
| 2026 | WCAG 2.2 adoption | New criteria: focus appearance, dragging, target size |
| 2027 | Expected EAA enforcement reviews | First compliance audits by authorities |
