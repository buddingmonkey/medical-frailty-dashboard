// The releases the reference tables are built from: CMS's ICD-10-CM and HCPCS files for
// `ref_codes` (public domain; docs/data-model.md, "Licensing of code text") and AHRQ's CCSR for
// `ref_ccsr` (no stated licence; see below). To update, change a release here (URL, SHA-256,
// member file, effective date) and follow README.md, "Updating".

export interface Release {
  /** Chunk names and app_meta markers start with this, e.g. `icd10cm-fy2027-000`. */
  id: string
  codeSystem: 'icd10cm' | 'hcpcs'
  url: string
  sha256: string
  /** The file to read inside the zip. */
  member: string
  /** First day the release is valid; becomes `ref_codes.valid_from`. */
  validFrom: string
}

export const releases: readonly Release[] = [
  {
    id: 'icd10cm-fy2027',
    codeSystem: 'icd10cm',
    // "2027 Code Descriptions in Tabular Order", https://www.cms.gov/medicare/coding-billing/icd-10-codes
    url: 'https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip',
    sha256: '91c6c9d1117764ce72375a0f3a5493b1725dafbc1ab283b55799076c9e194965',
    member: 'Code Descriptions/icd10cm_order_2027.txt',
    validFrom: '2026-10-01',
  },
  {
    id: 'hcpcs-2026-10',
    codeSystem: 'hcpcs',
    // "October 2026 Alpha-Numeric HCPCS File" (updated 2026-09-23),
    // https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update
    url: 'https://www.cms.gov/files/zip/october-2026-alpha-numeric-hcpcs-file.zip',
    sha256: '08c2202fa92c1d1fb6f31b808b61c767bc487954f6930b6a0f8d09c89af5992f',
    member: 'HCPC2026_OCT_ANWEB_09232026.txt',
    validFrom: '2026-10-01',
  },
]

/** The AHRQ CCSR release behind `ref_ccsr` and `ref_ccsr_categories`. */
export interface CcsrRelease {
  /** Chunk names and app_meta markers start with this, e.g. `ccsr-dx-2026.1-000`. */
  id: string
  url: string
  sha256: string
  /** The CSV mapping file inside the zip. */
  member: string
}

// Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1. Healthcare
// Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality, Rockville, MD.
// https://hcup-us.ahrq.gov/toolssoftware/ccsr/dxccsr.jsp
// AHRQ states no licence for these files: never commit them or anything copied from them. The
// build downloads the zip into .cache/ and writes only to dist/ (both gitignored); README.md.
export const ccsrRelease: CcsrRelease = {
  id: 'ccsr-dx-2026.1',
  url: 'https://hcup-us.ahrq.gov/toolssoftware/ccsr/DXCCSR-v2026-1.zip',
  sha256: '093ea8f925606eea74a9342395eed440e7635293d0abf031d8c89d1183cde310',
  member: 'DXCCSR-v2026-1/DXCCSR_v2026-1.csv',
}
