// ICD-10-CM chapters (CMS/NCHS tabular list, FY2027; public domain). Used to group codes for
// states that publish no categories of their own (GA, NE) and for `ref_codes.chapter`.
// No imports: packages/reference-data loads this file directly in Node (type stripping).

export interface Icd10cmChapter {
  number: number
  /** First and last 3-character category, inclusive. */
  first: string
  last: string
  title: string
}

export const icd10cmChapters: readonly Icd10cmChapter[] = [
  { number: 1, first: 'A00', last: 'B99', title: 'Certain infectious and parasitic diseases' },
  { number: 2, first: 'C00', last: 'D49', title: 'Neoplasms' },
  {
    number: 3,
    first: 'D50',
    last: 'D89',
    title:
      'Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism',
  },
  { number: 4, first: 'E00', last: 'E89', title: 'Endocrine, nutritional and metabolic diseases' },
  {
    number: 5,
    first: 'F01',
    last: 'F99',
    title: 'Mental, behavioral and neurodevelopmental disorders',
  },
  { number: 6, first: 'G00', last: 'G99', title: 'Diseases of the nervous system' },
  { number: 7, first: 'H00', last: 'H59', title: 'Diseases of the eye and adnexa' },
  { number: 8, first: 'H60', last: 'H95', title: 'Diseases of the ear and mastoid process' },
  { number: 9, first: 'I00', last: 'I99', title: 'Diseases of the circulatory system' },
  { number: 10, first: 'J00', last: 'J99', title: 'Diseases of the respiratory system' },
  { number: 11, first: 'K00', last: 'K95', title: 'Diseases of the digestive system' },
  { number: 12, first: 'L00', last: 'L99', title: 'Diseases of the skin and subcutaneous tissue' },
  {
    number: 13,
    first: 'M00',
    last: 'M99',
    title: 'Diseases of the musculoskeletal system and connective tissue',
  },
  { number: 14, first: 'N00', last: 'N99', title: 'Diseases of the genitourinary system' },
  { number: 15, first: 'O00', last: 'O9A', title: 'Pregnancy, childbirth and the puerperium' },
  {
    number: 16,
    first: 'P00',
    last: 'P96',
    title: 'Certain conditions originating in the perinatal period',
  },
  {
    number: 17,
    first: 'Q00',
    // FY2027 added QA0–QA1 (neurodevelopmental disorders and inherited neoplasm syndromes
    // related to genetic variants) after Q99. They sort after Q99 and before R00.
    last: 'QA1',
    title: 'Congenital malformations, deformations and chromosomal abnormalities',
  },
  {
    number: 18,
    first: 'R00',
    last: 'R99',
    title:
      'Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified',
  },
  {
    number: 19,
    first: 'S00',
    last: 'T88',
    title: 'Injury, poisoning and certain other consequences of external causes',
  },
  { number: 20, first: 'V00', last: 'Y99', title: 'External causes of morbidity' },
  {
    number: 21,
    first: 'Z00',
    last: 'Z99',
    title: 'Factors influencing health status and contact with health services',
  },
  { number: 22, first: 'U00', last: 'U85', title: 'Codes for special purposes' },
]

/**
 * The chapter of a normalized ICD-10-CM code (`F200`), or null. Compares the 3-character
 * category as text, which sorts `C7A` inside C00–D49 and `O9A` at the end of O00–O9A.
 */
export function icd10cmChapterOf(codeNorm: string): Icd10cmChapter | null {
  const category = codeNorm.slice(0, 3).toUpperCase()
  return icd10cmChapters.find((c) => category >= c.first && category <= c.last) ?? null
}
