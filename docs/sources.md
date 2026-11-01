# State sources

One section per state. Record every source document, its date, its layout quirks and the
state's own category list. When a state reissues its list, add the new document here with the
date; never delete the old entry.

Seed files were reviewed on 2026-11-01 with `pdftotext -layout`.

## Georgia (GA)

| Document | Pages | Notes |
| --- | --- | --- |
| Attachment A | 87 | ~1,700 ICD-10-CM rows |
| Attachment B | 258 | ~4,500 ICD-10-CM rows |

- Source URL and publish date: **unknown, ask the user** (open question in `docs/status.md`).
- Columns: `Code | Code Type | Description | Yes/ No | Rationale`. Every row reviewed so far is
  "Yes". Keep `yes_no` and `rationale` in `attributes_json`. If a later file has "No" rows,
  they are **not** frail codes. Do not publish them as included (add an ingestion check).
- Codes are dotted (`F10.26`) and sometimes parent categories (`F01`, `F10`).
- The header row repeats on every page; skip repeated headers.
- **A and B are two tiers** (user, 2026-11-01). Source page:
  https://pathways.georgia.gov/hr-1-changes-pathways (A: "satisfy the criteria"; B: "may
  meet the criteria ... if combined with certain diagnoses or documentation"). B list URL per
  research: dch.georgia.gov/document/document/medical-frailty-list-schedule-b0. Load both into
  one version with `tier` = "Attachment A" / "Attachment B". The Board added some HIV
  diagnoses in 2026-08 (The Current, 2026-08-14).
- Georgia has no category column; the user will map categories (likely per ICD chapter, as for
  Nebraska) or use the rationale text as a hint.

## Louisiana (LA)

| Document | Pages | Notes |
| --- | --- | --- |
| `Lousiana Codes-20260721.pdf` (printed from `HR1-Codes.xlsx`) | 73 | Dated 2026-07-21 by filename |

- The original is an Excel file, but LDH does not publish it (search, 2026-11-01): the
  [work requirements page](https://ldh.la.gov/Medicaid/work-requirements) links only notices,
  flyers, a fact sheet and a glossary (latest 2026-08-27). Source URL of our PDF: unknown.
  Parse the PDF; request the .xlsx from LDH if parsing proves unreliable.
- Columns: `Category | Sub-Category | Group | Code Designation | Description | Code`. The code
  is the **last** column.
- Categories: SMI, SUD, IDD, Cancer, Severe diabetes, Severe neurological, Infectious
  disease, Immunodeficiency, Autoimmune, Transplant or ..., Temporary disabling, Miscellaneous.
- Sub-categories mix code systems: Primary Diagnosis, Secondary Diagnosis (Confirmatory),
  Service, Tier 1 / Tier 2 Service Code (CPT), Pharmacy, Revenue Codes, Encounter, Supporting.
  Pharmacy and revenue rows need their own code systems (`ndc`/drug class, `revenue`).
- "Code Designation" is 0/1/2, meaning unknown (open question). Store raw. It is **not** a
  code-system flag. Cross-tab of the PDF text (2026-11-01, sub-category × designation → rows):
  Primary Diagnosis 0 → 566, 1 → 239 (`F29`, `F41.*-F42.*`), 2 → 27 (`Z48.810`);
  Service 0 → 437, 1 → 21, 2 → 86; Tier 1 Service Code 0 → 205, 2 → 193;
  Tier 2 Service Code 2 → 266 (all); Pharmacy 0 → 60, 2 → 81. A guess to check with LDH: it
  may mark how a code qualifies (alone, time-limited, or only with another code), since every
  Tier 2 service code is a 2.
- **Likely meaning (strong evidence, not confirmed by LDH):** SHVS/Manatt (2026-09-11,
  https://shvs.org/resources/cms-releases-new-information-on-operationalizing-medicaid-work-reporting-requirements-medical-frailty-exclusion/)
  reports that Louisiana uses three kinds of code: codes that establish frailty on their own,
  diagnoses that need a supporting code, and codes that serve as supplemental evidence; any
  supporting code counts, it does not have to be linked to the diagnosis. That maps to
  **0 = qualifies alone, 1 = needs a supporting code, 2 = supporting evidence only**, and fits
  the data: every Tier 2 service code (e.g. physical therapy `97112`) is 2; inpatient revenue
  codes (`0100`, a hospitalization, SHVS's own example of supporting evidence) are 2;
  unspecified psychosis `F29` and anxiety `F41.*-F42.*` are 1; aftercare `Z48.810` is 2.
  One poor fit: 21 *service* codes are 1 ("needs support" reads like a diagnosis rule).
  Store the raw value, map it to `qualification` (see `docs/data-model.md`), and label the
  mapping "inferred" on the site until LDH confirms it.
- More code patterns: `Z89.*` and `Z34.*` (asterisk wildcard), `F41.*-F42.*` (wildcard
  range), `J7500-J7599` (HCPCS range), 3- and 4-digit revenue codes (`912`, `0100`).
- Other sub-categories seen: "Pregnancy Status & ...", "Encounter", "Supporting",
  "Secondary Diagnosis General".
- Descriptions wrap onto several lines; the code sits on the first line.

## Montana (MT)

| Document | Pages | Notes |
| --- | --- | --- |
| [DPHHS Medically Frail Condition List](https://dphhs.mt.gov/assets/medicaidchanges/DPHHSMedicallyFrailCodeList_092926.pdf) | 8 | "Updated as of September 29, 2026", ~310 rows |

- Columns: `Category (tier) | Category | Condition Name | Code | Code Name`.
- Tiers: "Tier 1 - DPHHS Approved Condition", "Tier 2 - Frailty Indicators".
- Categories: SCMC (serious/complex medical condition), SUD, DMD (disabling mental disorder),
  SID-SDD-SPD (intellectual/developmental/physical disability), B (likely blind), and Tier 2
  "Impact on Ability to Work".
- Wildcards: `C34.x`, `K70.X`, `D57.0X`, `Q90.x`, `Z89.x`.
- Truncated ranges: `L89.500-L89` (the PDF cuts the column). Flag for manual entry.
- The same code can appear under several condition names (`Z74.09` three times). These are
  separate entries, not duplicates.

## Nebraska (NE)

| Document | Pages | Notes |
| --- | --- | --- |
| [Medically Frail and SUD Conditions Index](https://dhhs.ne.gov/Documents/Nebraska%20Medicaid%20Work%20Requirements%20-%20Medically%20Frail%20and%20SUD%20Conditions.pdf) | 295 | ICD-10-CM by chapter, then a CPT/HCPCS section |
| [Medically Frail and SUD Treatment Program Exemptions Process](https://dhhs.ne.gov/Documents/NE%20MWR%20-%20Medically%20Frail%20and%20SUD%20Treatment%20Program%20Exemptions.pdf) | 3 | Process doc, updated 2026-09-14. Claims reviewed ~90 days before renewal |
| [Work Requirements page](https://dhhs.ne.gov/Pages/WorkRequirements.aspx) | | Landing page linking both |

- ICD codes have **no dots** (`A0103`) except wildcards (`A15.x`).
- Grouped only by ICD-10 chapter; no frailty categories (see `docs/ingestion.md`,
  "Category auto-mapping").
- The CPT/HCPCS section uses ranges with en-dashes (`32851–32854`), hyphens, "and" lists
  (`33230 and 33240`), comma lists across lines (`T2042, X2042, T2043, ...`) and multi-range
  lines (`E1037-E1224 and E1229-E1295`). The normalizer must split these into separate entries.

## Federal and court rulings

- ***Massachusetts v. Oz*, D. Mass. No. 1:26-cv-12962-RGS, Dkt. 147, 2026-10-29** (Judge
  Stearns, summary judgment). Opinion:
  https://hpmmatters.publichealth.gwu.edu/sites/g/files/zaxdzs6671/files/2026-10/MSJ%20Decision%20(Mass%20v.%20Oz)%20(1).pdf
  - Vacated the IFR's extra requirement (42 CFR 435.554(c)(5)(i)) that a condition must
    "significantly impair[] the individual's ability to comply with the community engagement
    requirement", on top of the five statutory categories. Permanent injunction; a 6-month
    enforcement stay for the 26 plaintiffs (25 states + DC). LA, MT, GA and NE are not plaintiffs.
  - **The opinion never mentions tiers** (checked: zero hits for "tier"). It does not strike
    down any state's code list, tiers or combination rules. Its effect on tiers is indirect:
    CMS's tier model existed to show the now-vacated "ability to comply" element, so states
    may loosen combination rules, but none of the four seed states had changed theirs by
    2026-11-01.
  - Secondary sources say the vacatur applies nationwide (not confirmed from the opinion).
    No appeal found as of 2026-11-01; the appeal window runs to about 2026-12-28. Re-check then.
  - Related: *Taylor v. Kennedy*, D. Md. No. 1:26-cv-03705 (filed 2026-09-18), pending.
- **CMS IFR**, 91 FR 33348 (2026-06-03): states must keep an auditable condition list,
  revise it regularly, and track changes.
  https://www.federalregister.gov/documents/2026/06/03/2026-11094/medicaid-program-community-engagement-requirement-for-certain-individuals
- **CMS "Implementing Medical Frailty" deck** (released 2026-09-08): an optional three-tier
  model (1 = a code alone qualifies; 2 = a diagnosis plus utilization/pharmacy/DME/other data;
  3 = manual review). It encourages states to label tiers on their lists. Z codes alone
  should not qualify.
  https://www.medicaid.gov/resources-for-states/working-families-tax-cut-legislation/community-engagement/ImplementingMedicalFrailtyDeck.pdf
- **Current rule per seed state (2026-11-01):**
  - MT: a claim with a code from **either tier** qualifies (no combination), at least one claim
    in 12 months (https://prod-dphhs.mt.gov/medicaidchanges/MedicallyFrail).
  - GA: Attachment A conditions "satisfy the criteria"; Attachment B conditions "may meet the
    criteria ... if combined with certain diagnoses or documentation", and DCH "will develop a
    policy and process" for B (https://pathways.georgia.gov/hr-1-changes-pathways, verified).
  - LA: three kinds of code (see Louisiana above).
  - NE: the index "is not a one-to-one diagnosis list"; members "might have to meet other
    criteria" (process PDF).
- H.R.1 (Public Law 119-21) §71119: community engagement requirement and the medically
  frail exclusion. Federal categories are in `docs/data-model.md`. Link the enacted text and
  any CMS guidance here once confirmed (roadmap M1).
- CMS ICD-10-CM code files (public domain): https://www.cms.gov/medicare/coding-billing/icd-10-codes
- CMS HCPCS Level II quarterly files (public domain): https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update
