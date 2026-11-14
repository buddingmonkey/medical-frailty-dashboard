import { federalCategoryInfo, STATUTE_CITATION, STATUTE_URL } from './categories'
import { compareLegend, compareStatusLabels } from './compare'
import { CCSR_CITATION, CCSR_URL } from './drill'
import { federalCategories } from './enums'
import { formatDay, reviewStatusText, SITE_NAME, STATED_BY_STATE } from './public'
import { qualificationBasisLabels, qualificationHelp, qualificationLabels } from './qualification'

// The About/methodology page, the disclaimer, privacy and accessibility pages, the footer links
// and the "learn more" links (roadmap M8 step 4). Shared by the Vue pages and the Worker's
// server-rendered HTML, so both say the same thing. The text is data (paragraphs, lists, links),
// never HTML. Wording is provisional: the legal team reviews it (docs/legal-review.md, Part 2).

/** A link inside text. A link that starts with `https://` leaves the site. */
export interface AboutLink {
  text: string
  href: string
}
export type AboutInline = string | AboutLink

export type AboutBlock =
  | { kind: 'p'; parts: readonly AboutInline[] }
  | { kind: 'ul'; items: readonly (readonly AboutInline[])[] }
  | { kind: 'dl'; items: readonly { term: string; parts: readonly AboutInline[] }[] }

export interface AboutSection {
  /** The anchor (`/about#matching`). Stable: other pages link to it. */
  id: string
  heading: string
  blocks: readonly AboutBlock[]
}

export interface InfoPage {
  path: string
  title: string
  description: string
  heading: string
  intro: readonly AboutBlock[]
  sections: readonly AboutSection[]
}

const p = (...parts: AboutInline[]): AboutBlock => ({ kind: 'p', parts })
const ul = (...items: AboutInline[][]): AboutBlock => ({ kind: 'ul', items })
const dl = (...items: { term: string; parts: AboutInline[] }[]): AboutBlock => ({
  kind: 'dl',
  items,
})

/** An external link opens off the site (`rel="noopener noreferrer external"`). */
export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href)

/** The repository (`git remote get-url origin`). */
export const SOURCE_CODE_URL = 'https://github.com/buddingmonkey/medical-frailty-dashboard'

/** The data-error issue form (`.github/ISSUE_TEMPLATE/data-error.yml`). No email: the repo is public. */
export const REPORT_PROBLEM_URL = `${SOURCE_CODE_URL}/issues/new?template=data-error.yml`

/** A blank issue, for a problem that is not a data error (an accessibility barrier, a bug). */
export const NEW_ISSUE_URL = `${SOURCE_CODE_URL}/issues/new`

/** The court ruling note's date. Re-check the facts in docs/sources.md before changing it. */
export const COURT_NOTE_AS_OF = '2026-11-03'

const MASS_V_OZ_OPINION_URL =
  'https://hpmmatters.publichealth.gwu.edu/sites/g/files/zaxdzs6671/files/2026-10/MSJ%20Decision%20(Mass%20v.%20Oz)%20(1).pdf'

/** The short AMA notice in the footer; the full one is on About (`#cpt`). */
export const AMA_NOTICE_SHORT =
  'CPT is a registered trademark of the American Medical Association. This site shows CPT ' +
  'descriptions only as states published them.'

/** About's sections. */
const aboutSections: AboutSection[] = [
  {
    id: 'what-this-is',
    heading: 'What this site is, and is not',
    blocks: [
      p(
        'Under H.R.1 (Pub. L. 119-21), Medicaid members who are medically frail are excluded ' +
          'from the new community engagement (work) requirements. States are publishing lists of ' +
          'the diagnosis and service codes they use to find those members. This site collects ' +
          'those lists and puts them side by side.',
      ),
      ul(
        [
          'It is not a state or federal source. Each state’s own document is the authority; every ' +
            'state page links to it.',
        ],
        [
          'It does not decide anyone’s eligibility. Whether a person is medically frail is ' +
            'decided by their state, under its own process.',
        ],
        [
          'It holds no patient data. It compares published code lists only: no names, member ' +
            'numbers or claims are uploaded, stored or shown.',
        ],
        ['It is not legal advice. See the ', { text: 'disclaimer', href: '/disclaimer' }, '.'],
      ),
    ],
  },
  {
    id: 'sources',
    heading: 'Where the lists come from and how they are dated',
    blocks: [
      p(
        'Every list comes from documents a state published, such as a PDF, a spreadsheet or a ' +
          'web page. Each state page lists those documents with a link, the date the state put ' +
          'on the document (when it gives one) and the date this site retrieved it. Each entry ' +
          'also records where in the document it came from.',
      ),
      p(
        'An admin uploads the state’s file, the site reads it and checks it, and an admin reviews ' +
          'the result before it is published. When a state updates its list, the new list is ' +
          'published as a new version and the state page keeps the version history.',
      ),
      dl(
        {
          term: 'Date on the state’s document',
          parts: ['The date the state printed on its list, or on its newest source document.'],
        },
        {
          term: 'Added to this site',
          parts: ['When this site published that version of the list.'],
        },
        {
          term: 'Last updated on this site',
          parts: [
            'When this site last changed the state’s public data: a new version, or a change ' +
              'in how its categories are mapped.',
          ],
        },
      ),
      p(
        'Descriptions of ICD-10-CM and HCPCS codes come from the public code files of the ' +
          'Centers for Medicare & Medicaid Services (CMS). Where a state published its own ' +
          'description, the site says so and names the state.',
      ),
    ],
  },
  {
    id: 'matching',
    heading: 'How codes are matched',
    blocks: [
      p(
        'Codes are compared without dots or capital letters, so F20.0 and f200 are the same ' +
          'code. States write their lists in different ways, so one line of a list (an entry) can ' +
          'be a single code or a group of codes:',
      ),
      ul(
        ['A wildcard, such as F31.* or C34.x, includes every code that starts with F31 or C34.'],
        [
          'A range, such as E08.621–E08.622, includes the codes of the same length between its ' +
            'two ends. A range whose ends are wildcards, such as F41.*–F42.*, includes both whole ' +
            'categories.',
        ],
        [
          'A bare category, such as F20, may or may not mean the codes under it. Where the state ' +
            'does not say, an admin decides for that state.',
        ],
      ),
      p('For any code, each state shows one of these:'),
      dl(
        ...compareLegend
          .filter((item) => item.term !== 'Badges')
          .map((item) => ({ term: item.term, parts: [item.text] })),
      ),
      p(
        `A narrower code never includes its parent: a state that lists F31.2 does not list F31. `,
        `“${compareStatusLabels.exact}” and “${compareStatusLabels.covered}” together are what `,
        'this site means when it says a state’s list includes a code. Counts of states ' +
          '(“3 of 4 states”) count only states with a list on this site.',
      ),
    ],
  },
  {
    id: 'like-codes',
    heading: 'What “like” codes are',
    blocks: [
      p(
        'There is no official crosswalk between diagnosis codes (ICD-10-CM) and service codes ' +
          '(CPT and HCPCS). To help compare a state that lists a service with one that lists a ' +
          'diagnosis, this site keeps a short list of condition groups by hand, such as cancer ' +
          'or kidney failure and dialysis. Each group names codes in several code systems that ' +
          'point at the same condition.',
      ),
      p(
        'On a code’s page, a state whose list does not include the code may show its codes from ' +
          'another code system in the same group, under “Like codes”. A like code is never a ' +
          'match: the state keeps its real status, such as “Not listed”, and the like codes ' +
          'appear in a separate section. The first groups were drafted with the help of AI; ' +
          'only groups an admin has checked and published are used.',
      ),
    ],
  },
  {
    id: 'badges',
    heading: 'The state’s rule and “inferred”',
    blocks: [
      p(
        'States differ on whether a listed code is enough by itself. A badge shows the state’s ' +
          'rule for a code. It describes the state’s list, never whether a person is eligible.',
      ),
      dl(
        ...(Object.keys(qualificationLabels) as (keyof typeof qualificationLabels)[]).map((q) => ({
          term: qualificationLabels[q],
          parts: [qualificationHelp[q]],
        })),
        {
          term: 'Inferred',
          parts: [
            `${qualificationBasisLabels.inferred}. Some states do not say their rule in so many `,
            'words, but their documents make it clear enough to show. Such badges are marked ' +
              '“inferred” until the state confirms them.',
          ],
        },
      ),
      p(
        'A tier label (for example “Tier 1”) is always shown as the state wrote it. To check a ' +
          'state’s rule, read its documents, linked under Sources on its state page.',
      ),
    ],
  },
  {
    id: 'categories',
    heading: 'Categories: federal, comparison and the state’s own',
    blocks: [
      p('Codes are grouped at three levels.'),
      dl(
        {
          term: 'Federal categories',
          parts: [
            'The five groups in the law (',
            { text: STATUTE_CITATION, href: STATUTE_URL },
            '), plus two of this site’s own for codes that fit none of them or are not yet ' +
              'classified:',
          ],
        },
        {
          term: 'Comparison categories',
          parts: [
            'This site’s own grouping, so every state’s list can be measured the same way. They ' +
              'are not a state’s or CMS’s categories. Most are built from the diagnosis groups of ' +
              'AHRQ’s Clinical Classifications Software Refined (CCSR). The first set was drafted ' +
              'with the help of AI; admins edit each one and publish it. Each comparison ' +
              'category is filed under one federal category.',
          ],
        },
        {
          term: 'The state’s own categories',
          parts: ['Exactly as the state wrote them, such as “SMI” or “Tier 2”.'],
        },
      ),
      ul(
        ...federalCategories.map((c) => {
          const info = federalCategoryInfo[c]
          return [info.statuteClause ? `${info.statuteClause} ${info.label}` : info.label]
        }),
      ),
      p(
        'Where a comparison category sits among the federal categories is this site’s choice, ' +
          'not the law’s or CMS’s. For example, this site files dementia under (cc), a disabling ' +
          'mental disorder, and chromosomal conditions such as Down syndrome under (dd), a ' +
          'physical, intellectual or developmental disability. A state may place them ' +
          'differently.',
      ),
      p(
        'A code can fall in more than one comparison category, so it can count under more than ' +
          'one federal category.',
      ),
      p('CCSR: ', CCSR_CITATION, ' ', { text: 'About the CCSR (AHRQ)', href: CCSR_URL }),
    ],
  },
  {
    id: 'review',
    heading: 'How mapping and review work',
    blocks: [
      p(
        'Each state’s own categories are mapped to comparison categories by an admin, or the ' +
          'admin decides that the state’s categories are not meaningful groups and each code is ' +
          'placed by its CCSR group instead. Until an admin approves a mapping, the site places ' +
          'codes automatically by their CCSR group.',
      ),
      dl(
        {
          term: reviewStatusText(true),
          parts: ['An admin checked and approved how this state category is mapped.'],
        },
        {
          term: reviewStatusText(false),
          parts: [
            'The site suggested the mapping automatically and nobody has checked it yet. ' +
              'Numbers that depend on it may change after review.',
          ],
        },
        {
          term: STATED_BY_STATE,
          parts: [
            'The state’s own list names the federal category for these codes, and this site ' +
              'uses it as published.',
          ],
        },
      ),
      p('Every change an admin makes is recorded in an audit log.'),
    ],
  },
  {
    id: 'coverage',
    heading: 'How the overview’s numbers are worked out',
    blocks: [
      p(
        'Each comparison category built from CCSR groups has a reference list: every billable ' +
          'ICD-10-CM diagnosis code in those groups, from the current CMS release. A state’s ' +
          'number for the category is the share of that reference list its list includes, ' +
          'listed one by one or covered by a wildcard or range.',
      ),
      ul(
        [
          'Only billable ICD-10-CM codes count toward the share. Entries in other code systems ' +
            '(CPT, HCPCS, drug classes) count as entries but not toward the share, so a state ' +
            'that relies on service codes shows a low number.',
        ],
        [
          'A category marked † has no reference list (no CCSR groups). Its number is the ' +
            'state’s distinct entries in the category as a share of the distinct entries every ' +
            'state lists there.',
        ],
        [
          'A share above zero never shows as 0%, and one below 100% never shows as 100%. Shades: ' +
            '75% or more, 25–74%, 1–24%, and none.',
        ],
        [
          'Overall (average) is the plain average of the state’s shares across the categories, ' +
            'so every category counts the same whatever its size. It is not a measure of how ' +
            'many people a list reaches.',
        ],
        [
          '“Similar states together” orders the states so that each one sits next to the state ' +
            'whose shares are closest to its own.',
        ],
      ),
    ],
  },
  {
    id: 'similarity',
    heading: 'How similarity between two states is worked out',
    blocks: [
      p(
        'Similarity is the share of codes two lists have in common, from 0 (nothing shared) to ' +
          '1 (identical). It is the Jaccard index: the codes both lists include, divided by the ' +
          'codes either list includes.',
      ),
      ul(
        [
          'Each list’s codes are every billable ICD-10-CM code it includes (listed, or covered ' +
            'by a wildcard or range), plus its entries in other code systems, each counted once.',
        ],
        [
          'A category code listed without the codes under it, or a code that is not in the ' +
            'current CMS release, adds nothing.',
        ],
        ['It is worked out again whenever a state’s list is published.'],
      ),
    ],
  },
  {
    id: 'downloads',
    heading: 'What the downloads contain',
    blocks: [
      p(
        'Each state page offers its list as CSV and JSON. Every row is one entry of the ' +
          'published list. CSV columns:',
      ),
      dl(
        { term: 'state', parts: ['The state’s two-letter code.'] },
        {
          term: 'code_system',
          parts: ['ICD-10-CM, CPT, HCPCS, revenue code, drug class or other.'],
        },
        { term: 'code', parts: ['The entry as the state wrote it.'] },
        { term: 'code_normalized', parts: ['The same code without dots, in capitals.'] },
        {
          term: 'match_kind',
          parts: ['exact (one code), prefix (a wildcard) or range.'],
        },
        { term: 'range_end', parts: ['The last code of a range, normalized; empty otherwise.'] },
        {
          term: 'includes_children',
          parts: ['yes or no: whether a code includes the codes under it; empty when not set.'],
        },
        {
          term: 'description_published',
          parts: ['The state’s own description, exactly as published; empty if it gave none.'],
        },
        { term: 'state_category, state_subcategory', parts: ['The state’s own category.'] },
        {
          term: 'federal_categories',
          parts: ['The federal categories the entry counts under, joined by “; ”.'],
        },
        { term: 'tier', parts: ['The state’s tier label, as published.'] },
        { term: 'qualification', parts: ['The state’s rule (see the badges above).'] },
        {
          term: 'qualification_basis',
          parts: ['Whether the state stated the rule or this site inferred it.'],
        },
        {
          term: 'source_title, source_url, source_date, source_locator',
          parts: ['The state’s document, its link and date, and where in it the entry is.'],
        },
      ),
      p(
        'The JSON file has the same fields with camelCase names, plus the version, the date on ' +
          'the state’s document, when this site last updated it, and the source documents once.',
      ),
      p(
        'The code tables (single codes, a category’s codes, states side by side) download as CSV ' +
          'with a description and, per state, the status words used on the page.',
      ),
      dl({
        term: 'description_source',
        parts: [
          'Where the description came from: CMS (the public ICD-10-CM or HCPCS file), or the ' +
            'two-letter code of the state whose published text is shown. Empty when neither ' +
            'gives one. CPT codes never have a CMS description.',
        ],
      }),
    ],
  },
  {
    id: 'court-rulings',
    heading: 'Court rulings',
    blocks: [
      p(`As of ${formatDay(COURT_NOTE_AS_OF)}. This note is not legal advice.`),
      p(
        'On October 29, 2026, the U.S. District Court for the District of Massachusetts decided ',
        {
          text: 'Massachusetts v. Oz (No. 1:26-cv-12962)',
          href: MASS_V_OZ_OPINION_URL,
        },
        '. The court vacated a requirement CMS added in its interim final rule (42 CFR ' +
          '435.554(c)(5)(i)): that a condition must significantly impair a person’s ability to ' +
          'meet the work requirement, on top of the five categories in the law. It issued a ' +
          'permanent injunction, with a six-month stay of enforcement for the 26 plaintiffs (25 ' +
          'states and DC).',
      ),
      ul(
        [
          'The opinion does not strike down any state’s code list, tiers or rules for combining ' +
            'codes. States may change their rules in response; this site shows each list as the ' +
            'state published it.',
        ],
        [
          'Some secondary sources say the ruling applies nationwide. This site has not confirmed ' +
            'that from the opinion.',
        ],
        [
          'This site found no appeal as of November 1, 2026; the time to appeal runs to about ' +
            'the end of December 2026.',
        ],
        [
          'A related case, Taylor v. Kennedy (D. Md. No. 1:26-cv-03705, filed September 18, ' +
            '2026), is pending.',
        ],
      ),
    ],
  },
  {
    id: 'cpt',
    heading: 'CPT codes (AMA notice)',
    blocks: [
      p(
        'CPT® is a registered trademark of the American Medical Association (AMA). CPT code ' +
          'descriptions are copyrighted by the AMA. This site does not include the AMA’s CPT ' +
          'descriptions. Where a CPT code has a description here, it is the text the state ' +
          'published, shown with a link to the state’s source document.',
      ),
    ],
  },
  {
    id: 'report',
    heading: 'Report a problem',
    blocks: [
      p(
        'If a code, description, category or date does not match the state’s document, or you ' +
          'know of a state list this site does not have, ',
        { text: 'report it on GitHub', href: REPORT_PROBLEM_URL },
        '. A free GitHub account is needed. Please do not include any patient or member ' +
          'information.',
      ),
      p(
        'For anything else, such as a broken page, ',
        { text: 'open an issue', href: NEW_ISSUE_URL },
        '. The ',
        { text: 'source code', href: SOURCE_CODE_URL },
        ' is public.',
      ),
    ],
  },
]

export const aboutPage: InfoPage = {
  path: '/about',
  title: `About and methodology | ${SITE_NAME}`,
  description:
    'How this site collects state Medicaid medical frailty code lists, matches codes, builds ' +
    'its categories and works out its numbers, with a guide to the downloads.',
  heading: 'About and methodology',
  intro: [
    p(
      'This page explains where the lists come from and how every number and label on the site ' +
        'is worked out.',
    ),
  ],
  sections: aboutSections,
}

export const disclaimerPage: InfoPage = {
  path: '/disclaimer',
  title: `Disclaimer | ${SITE_NAME}`,
  description:
    'This site compares published state Medicaid medical frailty code lists. It is not a state ' +
    'or federal source, does not decide eligibility and is not legal advice.',
  heading: 'Disclaimer',
  intro: [],
  sections: [
    {
      id: 'not-official',
      heading: 'Not an official source',
      blocks: [
        p(
          'This site is not run by any state, CMS or other government agency. It copies code ' +
            'lists from documents states published. The state’s own document is the authority; ' +
            'check it before relying on a code. Each state page links to its documents.',
        ),
      ],
    },
    {
      id: 'not-eligibility',
      heading: 'Not an eligibility decision',
      blocks: [
        p(
          'A code on a list does not mean a person is medically frail, and a code missing from ' +
            'a list does not mean they are not. Each state decides, under its own process. ' +
            'Badges such as “Enough by itself” describe a state’s list, not a person.',
        ),
      ],
    },
    {
      id: 'not-legal-advice',
      heading: 'Not legal advice',
      blocks: [
        p(
          'Nothing on this site is legal advice, including the notes on the law and on court ' +
            'rulings. For advice about a particular situation, ask a lawyer or the state Medicaid ' +
            'agency.',
        ),
      ],
    },
    {
      id: 'accuracy',
      heading: 'Accuracy',
      blocks: [
        p(
          'Lists are checked and reviewed before they are published, but mistakes can happen and ' +
            'states change their lists. The site’s own categories, mappings and numbers are its ' +
            'own work, explained on the ',
          { text: 'About and methodology', href: '/about' },
          ' page. The site is provided as is, without warranty. ',
          { text: 'Report a problem', href: REPORT_PROBLEM_URL },
          ' if you find one.',
        ),
      ],
    },
  ],
}

export const privacyPage: InfoPage = {
  path: '/privacy',
  title: `Privacy | ${SITE_NAME}`,
  description:
    'This site sets no cookies for visitors and collects no personal data. It holds no patient ' +
    'data: only the code lists states publish.',
  heading: 'Privacy',
  intro: [],
  sections: [
    {
      id: 'no-personal-data',
      heading: 'No personal data',
      blocks: [
        p(
          'The public site collects no personal data: there are no accounts, forms or sign-ups ' +
            'for visitors. It holds no patient data; it compares published code lists only.',
        ),
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and analytics',
      blocks: [
        p(
          'The public site sets no cookies. It may use Cloudflare Web Analytics to learn which ' +
            'pages people use: it counts page views and how fast pages load, by page, referring ' +
            'site, browser and country. It sets no cookies, stores nothing in your browser and ' +
            'does not track you across sites. Your light or dark theme choice is kept only in ' +
            'your own browser.',
        ),
      ],
    },
    {
      id: 'sign-in',
      heading: 'Sign-in',
      blocks: [
        p(
          'Only the site’s admins, and testers before launch, sign in, through Cloudflare ' +
            'Access. Visitors to the public site never need to sign in.',
        ),
      ],
    },
    {
      id: 'logs',
      heading: 'Logs',
      blocks: [
        p(
          'The site runs on Cloudflare. Its request logs leave out the query string of each ' +
            'address, so what you type into search is not logged.',
        ),
      ],
    },
    {
      id: 'github',
      heading: 'Reporting a problem',
      blocks: [
        p(
          'Problem reports go to GitHub, under GitHub’s own privacy terms. Anything written there ' +
            'is public. Please do not include patient or member information.',
        ),
      ],
    },
  ],
}

export const accessibilityPage: InfoPage = {
  path: '/accessibility',
  title: `Accessibility | ${SITE_NAME}`,
  description:
    'This site aims to meet WCAG 2.2 level AA. How it is tested, in light and dark themes, and ' +
    'how to report a barrier.',
  heading: 'Accessibility',
  intro: [],
  sections: [
    {
      id: 'target',
      heading: 'Our goal',
      blocks: [
        p(
          'This site aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level ' +
            'AA, so that everyone, including people who use a screen reader, a keyboard or ' +
            'zoom, can read and compare the lists.',
        ),
      ],
    },
    {
      id: 'testing',
      heading: 'How it is tested',
      blocks: [
        ul(
          [
            'Automated checks (axe) run on every public page type before each release, in both ' +
              'the light and the dark theme.',
          ],
          ['Every page works with a keyboard alone, and every table is a real table.'],
          ['The map has a table with the same facts.'],
          ['The main pages work without JavaScript.'],
        ),
      ],
    },
    {
      id: 'report-barrier',
      heading: 'Report a barrier',
      blocks: [
        p(
          'If something on the site is hard or impossible for you to use, ',
          { text: 'tell us on GitHub', href: NEW_ISSUE_URL },
          '. Say which page and what happened. A free GitHub account is needed.',
        ),
      ],
    },
  ],
}

/** Every info page, in footer order. */
export const infoPages: readonly InfoPage[] = [
  aboutPage,
  disclaimerPage,
  privacyPage,
  accessibilityPage,
]

/** The footer's links, in order (Vue `SiteFooter` and the Worker's footer). */
export const footerLinks: readonly AboutLink[] = [
  { text: 'About and methodology', href: aboutPage.path },
  { text: 'Disclaimer', href: disclaimerPage.path },
  { text: 'Privacy', href: privacyPage.path },
  { text: 'Accessibility', href: accessibilityPage.path },
  { text: 'Source code', href: SOURCE_CODE_URL },
  { text: 'Report a problem', href: REPORT_PROBLEM_URL },
]

/** The footer links' list label. */
export const FOOTER_NAV_LABEL = 'About this site'

/**
 * "Learn more" links, one per place that explains itself on About (docs/status.md lists the
 * places). Both the Vue pages and the Worker's HTML show them.
 */
export const learnMore = {
  home: { text: 'How this site counts codes', href: '/about#matching' },
  overview: { text: 'How these numbers are worked out', href: '/about#coverage' },
  categories: { text: 'How the comparison categories were built', href: '/about#categories' },
  stateCategories: { text: 'How mapping and review work', href: '/about#review' },
  similarity: { text: 'How similarity is worked out', href: '/about#similarity' },
  downloads: { text: 'What each column means', href: '/about#downloads' },
  badges: { text: 'More on the state’s rule and “inferred”', href: '/about#badges' },
  likeCodes: { text: 'More on like codes', href: '/about#like-codes' },
} as const satisfies Record<string, AboutLink>

/** On a state page without a list: the words before the report link. */
export const reportListText = (stateName: string): string =>
  `Know of a published medical frailty code list for ${stateName}?`

/** The report link's text on a state page without a list. */
export const REPORT_LIST_LINK_TEXT = 'Tell us on GitHub'

/** The newest "last updated" across the states with a list (ISO), or null. */
export function dataLastUpdated(
  items: readonly { published: { updatedAt: string | null } | null }[],
): string | null {
  let newest: string | null = null
  for (const s of items) {
    const at = s.published?.updatedAt ?? null
    if (at !== null && (newest === null || at > newest)) newest = at
  }
  return newest
}

/** "Data last updated November 2, 2026". */
export const dataUpdatedText = (at: string): string => `Data last updated ${formatDay(at)}`
