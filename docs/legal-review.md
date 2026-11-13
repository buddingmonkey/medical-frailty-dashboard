# Legal review: Medical Frailty Coding Dashboard

*Prepared for the legal team, 4 November 2026. Every item below is live on the site as provisional
wording. Nothing here is final until the legal team approves it.*

## About the site

The Medical Frailty Coding Dashboard compares the code lists that US states publish to mark
Medicaid members as "medically frail", which exempts them from the work requirements in H.R.1
(Pub. L. 119-21, §71119). The site shows each state's list next to the others, by code and by
category. It holds public state policy only, never patient data.

The site is not open to the public yet; a sign-in is needed to view it. That is why this
document quotes the text in full, not as links. The appendix holds the full Disclaimer, Privacy
and About pages.

## How to answer

For each item, please write one of these:

- **Approve** (keep as is)
- **Change to:** the new wording
- **Remove**
- **Question:** anything you need from us first

Words in [square brackets] are filled in by the site, for example [state] becomes "Georgia".

Part 1 holds the decisions. Part 2 lists every piece of public wording, by page, for a
line-by-line check. Changes are made in one place in the code, so any rewording is quick.

---

## Part 1: Decisions

### 1. Licence for the compiled lists

The site offers each state's list as a download (CSV and JSON), and the pages describe the
lists to search engines as datasets. Search engines recommend naming a licence for a dataset.
We have left the licence out until you decide.

**Question:** Which licence (if any) should the compiled lists and downloads carry? The source
documents are public state records; the site adds its own categories, matching and notes.

### 2. Qualification badges (each state's rule for a code)

Each code shows a badge for the state's rule on whether that code, by itself, is enough to count
as medically frail. The badges describe the state's rule, never whether a person is eligible.
The column heading over them is **"State’s rule"**.

| Badge | Help text shown with it |
| --- | --- |
| Enough by itself | The state’s list says this code, by itself, meets its medically frail criteria. |
| Needs another code or documentation | The state says this code counts only with another listed code or documentation. |
| Supporting only | The state treats this code as supporting evidence; it never counts by itself. |
| State doesn’t say | The state’s document does not say whether this code is enough by itself. |

Each badge also says where the rule came from:

- "Stated by the state"
- "Inferred by this site from the state’s documents (not stated by the state)"

Search and compare can filter to codes that are "Enough by itself". Counts on the pages read,
for example, "Enough by itself: 3 states (1 inferred)".

**Questions:**

1. Keep, reword or remove the badges?
2. Is it acceptable for the site to show a rule it *inferred* (labelled as inferred)? Example:
   Louisiana's "Code Designation" column; we have asked the state (LDH) to confirm its meaning.
3. Should the badge read "Enough by itself (state’s rule)" everywhere, or is the column heading
   "State’s rule" enough?

### 3. Federal category labels

The site sorts each state's categories into the five groups in the law (Social Security Act
§1902(xx)(9)(A)(ii)(V)). Labels, and the law's text shown with them:

| Clause | Label on the site | Text shown from the law |
| --- | --- | --- |
| (aa) | Blind or disabled | who is blind or disabled (as defined in section 1614) |
| (bb) | Substance use disorder | with a substance use disorder |
| (cc) | Disabling mental disorder | with a disabling mental disorder |
| (dd) | Physical, intellectual or developmental disability | with a physical, intellectual or developmental disability that significantly impairs their ability to perform 1 or more activities of daily living |
| (ee) | Serious or complex medical condition | with a serious or complex medical condition |
| none | State’s own category (not in the law) | The state uses a category that does not fit the five groups in the law. |
| none | Not yet classified | This site has not yet assigned a federal category to these entries. |

**Questions:**

1. Approve the labels?
2. The site places **dementia** under (cc) and **chromosomal conditions** under (dd). These are
   the site's own choices; the About page will say so. Approve?

### 4. Court ruling note

The About page has a dated note on *Massachusetts v. Oz* (D. Mass., decided 29 October 2026)
and the pending *Taylor v. Kennedy* (D. Md.). Full text: appendix, About, "Court rulings".

**Questions:** Is the note accurate and fair? Should it stay, and how often should it be
re-dated? It says "This note is not legal advice."

### 5. Disclaimer, footer and "not an eligibility decision" wording

Footer text on every page:

> Every code comes from a state’s own published documents, linked on each state’s page. This
> site is not a state or federal source and does not determine anyone’s eligibility; check the
> state’s document before relying on a code. No patient data.

The home page intro ends: "It does not decide anyone’s eligibility."

The Disclaimer page has four sections: Not an official source, Not an eligibility decision, Not
legal advice, and Accuracy. Full text: appendix.

**Question:** Approve, or change the footer and the Disclaimer page?

### 6. CPT text (AMA copyright)

CPT descriptions are copyrighted by the American Medical Association. The site never uses the
AMA's own descriptions. Where a CPT code has a description, it is the text **the state
published**, shown with a link to the state's document.

Footer notice on every page:

> CPT is a registered trademark of the American Medical Association. This site shows CPT
> descriptions only as states published them.

The full notice is on the About page (appendix, "CPT codes (AMA notice)").

**Questions:**

1. Is showing the state's own published CPT text, with its citation, acceptable?
2. The downloads and the compare page's CSV carry those state descriptions **in bulk** (CPT text
   included). Acceptable?
3. Approve the short and full notices?

### 7. Louisiana drug class codes

Louisiana's pharmacy rows include 3-character drug class codes (for example `H2G`
"ANTIPSYCHOTICS,PHENOTHIAZINES"; 67 rows). They look like First Databank's licensed HIC3
classes (not confirmed). The site shows only Louisiana's own published text for them.

**Question:** Is it acceptable to show these codes and Louisiana's text as published?

### 8. Permission for AI training

The site's `robots.txt` tells crawlers:

> Content-Signal: search=yes, ai-input=yes, ai-train=yes

That allows search engines, AI answers and AI training. We chose this so AI tools give
correct answers about the lists. Because some pages quote CPT text (item 6), you may want
`ai-train=no`.

**Question:** Keep `ai-train=yes`, or change it to `no`?

### 9. CCSR (federal diagnosis groups) licence and citation

The comparison categories use AHRQ's Clinical Classifications Software Refined (CCSR) for
ICD-10-CM, v2026.1, cited by name with a link. AHRQ's site states no terms of use.

**Question:** Is the citation enough? Any notice needed?

### 10. Two rules the site applies as best guesses

1. When comparing two states, a code marked "State doesn’t say" in one state is **not** counted as
   a disagreement with the other state.
2. When the site maps a whole ICD-10-CM chapter to a federal category (a "chapter override"), a
   code in that chapter counts as confirmed even if it has no comparison category.

**Question:** Approve these rules, or should the site change them?

### 11. Draft categories and groups written by AI

The site's starting comparison categories (19) and its 8 "like code" condition groups (Cancer and
chemotherapy, Kidney failure and dialysis, Organ transplant, HIV, Serious mental illness, Substance
use disorder, Hemophilia and clotting factor disorders, Multiple sclerosis) were first drafted by
AI. The labels, definitions and members are drafts. The groups' CPT ranges are numbers only and
are not checked against a CPT file. The site calls like codes "not an official crosswalk".

**Question:** May these drafts stay public with that note while experts review them, or should
they be hidden until reviewed?

### 12. Search: a known difference

Word search over CMS code descriptions matches word forms ("disorders" finds "disorder"). Search
over the states' own published text does not. So the same word can find a code through the CMS
text and miss it in a state's text. We left this as is for now.

**Question:** Does the site need to say this on the search page?

### 13. Analytics in the Privacy page

The site is ready to use Cloudflare Web Analytics (it is off until we turn it on). The Privacy
page says it "counts page views and how fast pages load, by page, referring site, browser and
country. It sets no cookies, stores nothing in your browser and does not track you across sites."

**Question:** Approve the Privacy page (full text in the appendix)?

---

## Part 2: Public wording by page

Every string below is live and provisional. Please mark any you want changed.

### Every page

- Footer disclaimer (item 5) and AMA notice (item 6)
- Footer links: About, Disclaimer, Privacy, Accessibility
- "Data last updated [date]"
- "Report a problem" (opens a GitHub issue form)

### Home page

- Title: "Medical Frailty Coding Dashboard"
- Tagline: "Compare the code lists US states use to mark Medicaid members as medically frail."
- Intro: "Under H.R.1 (Pub. L. 119-21), Medicaid members who are medically frail are excluded
  from the new community engagement (work) requirements. States are publishing lists of the
  diagnosis and service codes they use to identify medically frail members. This site puts those
  lists side by side so you can compare them. It does not decide anyone’s eligibility."
- "Read the law" links
- Map placeholder: "Point at a state on the map, or tab to it, to see its list."
- Link: "See one category across the country on the map"

### State pages

- Categories intro
- Review status heading, with "Reviewed" / "Not yet reviewed (automatic suggestion)"
- Source document date labels
- The sentences shown for a state with no list on the site

### Compare tabs

- Tab labels: Overview, Categories, Map, Overlaps, States side by side, Single codes (Overlaps
  added 2026-11-12)
- Each tab's heading, intro and search-engine description
- Buttons and prompts: "Start from your state", "Your state", "Choose 2 to 4 states", "Show
  similar states", "Choose states to compare", "Sort by [category]"
- "Fewer than 2 states have a list on this site yet."
- "Comparison categories" heading and intro

### Overview ("How much of each category each state lists")

- Heading, intro, table caption and search-engine description
- "Overall (average)"
- "Reading this table" notes: counts use billable ICD-10-CM codes only; a plain average;
  "* Not yet reviewed"
- The card shown when a reader pauses on a cell (added 2026-11-12, provisional): "Covers N of
  the category’s D diagnosis codes" (or, for † categories, "N of the D distinct entries any
  state lists here"); "N entries placed here; Q are enough by themselves (P%)" or "none is
  enough by itself"; "Every placement here was reviewed" or "Not yet reviewed: some entries
  were placed here automatically, by the CCSR group of their code"; "Select the number to see
  the codes". Since 2026-11-13 the Map tab's tiles show the same card.

### Category drill-down

- "n of N states", "States that include it", "State’s rule"
- "Enough by itself: 3 states (1 inferred)", "2 of 4 include any", and the count note
- Filters: "Included by every state with a list", "Included by fewer than half", "Included by
  one state only"
- "Also show codes no state includes" and the reference-list note

### Map tab

- "One category, every state", intro, caption, "None", and the not-reviewed note

### Overlaps tab (added 2026-11-12, provisional)

- Heading "Which states list the same codes", intro, count note and search-engine description
- Row headers: "N codes listed by exactly these K states: …", "… listed only by [state]", and
  "… listed by all K states that list codes in this category" (that row does not name the
  states)
- Table headings "Group of states", "Codes", "The codes"; "In this group" / "Not in this
  group" (read to screen readers); "Show the codes"; "Show all N groups" / "Show the top 20"
- "No state includes any code in this category yet."
- Question: the word "exactly" matters here (a row's codes are listed by those states and by no
  other). Is the heading clear enough without it?

### States side by side

- "Only [state] includes", "Both include", "All 3 include"
- "Similarity (0–1)" and the similarity note
- Intro (states the "State doesn’t say" rule from item 10), summary and basis notes
- "Not in any comparison category"

### Single codes ("Compare single codes")

Cell words and legend, shown under every code table:

| Word | Meaning shown |
| --- | --- |
| Listed | the state’s list has this code, wildcard or range itself. |
| Covered by a broader entry | a wildcard or range on the state’s list includes it. |
| Narrower codes listed | the state lists some of the more specific codes under it, but not this code itself. |
| Not listed | the state has a list on this site, and the code is not on it in any form. |
| No list on this site | this site has no list from the state yet, so nothing is known. |
| Badges | the state’s rule on whether the code is enough by itself. “Inferred” means this site worked the rule out from the state’s documents; the state does not say so directly. |

Also: "As published by [state]", "No description from CMS or the state", "State’s category:",
"Download this table (CSV, N rows)" (item 6: the CSV carries state descriptions in bulk).

### Code pages (one page per code)

- Title: "[code] [CMS text]: medical frailty status in N states" (CPT: "CPT [code]: …") and
  the search-engine description
- Summary sentences:
  - "n of N states with a list on this site include [code]."
  - "[State]’s list includes [code] (through its entry [entry]). State’s rule: [badge]
    (inferred by this site)."
  - "[State]’s list does not include [code] (itself, but lists n more specific codes under it)."
  - "Last updated on this site [day]."
- "Included" / "Not included" headings and their help text
- Description notes: CMS text; "CPT descriptions are not shown here…"
- The not-found text
- For search engines, a CPT code with no CMS text is named by the first listing state's own
  text, marked "As published by [state] ([document])".

### Search page

- Heading and intro
- "Text published by [state]"
- "Listed by n of N states with a list on this site"
- Empty, loading and error messages, and the filter labels

### Like codes

- "Like codes" heading, its one-sentence explanation, and the note "not an official crosswalk"
- The sentence naming a code's groups
- The 8 draft groups (item 11)

### Comparison categories (drafts, item 11)

- 19 starter categories: labels, definitions and CCSR choices
- Includes the SMI definition, "Chronic kidney disease and kidney failure", the transplant and
  frailty indicator definitions, and "Diagnosis groups (CCSR):"
- Match words: exact, close, broad, narrow

### Other files

- `/llms.txt` (a summary for AI tools): its section names, and "Each published list as CSV (one
  row per entry) and JSON, with the source citation on every entry."
- Category pages describe themselves to search engines as datasets, named by the table caption
  and described by the category definition, with no licence (item 1).
- The JSON download note.

---

## Appendix: full text of the policy pages

The text below is exported from the site's code as of 4 November 2026. Links to other pages on
the site are shown as plain text.

### Disclaimer (`/disclaimer`)


#### Not an official source

This site is not run by any state, CMS or other government agency. It copies code lists from documents states published. The state’s own document is the authority; check it before relying on a code. Each state page links to its documents.

#### Not an eligibility decision

A code on a list does not mean a person is medically frail, and a code missing from a list does not mean they are not. Each state decides, under its own process. Badges such as “Enough by itself” describe a state’s list, not a person.

#### Not legal advice

Nothing on this site is legal advice, including the notes on the law and on court rulings. For advice about a particular situation, ask a lawyer or the state Medicaid agency.

#### Accuracy

Lists are checked and reviewed before they are published, but mistakes can happen and states change their lists. The site’s own categories, mappings and numbers are its own work, explained on the About and methodology page. The site is provided as is, without warranty. [Report a problem](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new?template=data-error.yml) if you find one.

### Privacy (`/privacy`)


#### No personal data

The public site collects no personal data: there are no accounts, forms or sign-ups for visitors. It holds no patient data; it compares published code lists only.

#### Cookies and analytics

The public site sets no cookies. It may use Cloudflare Web Analytics to learn which pages people use: it counts page views and how fast pages load, by page, referring site, browser and country. It sets no cookies, stores nothing in your browser and does not track you across sites. Your light or dark theme choice is kept only in your own browser.

#### Sign-in

Only the site’s admins, and testers before launch, sign in, through Cloudflare Access. Visitors to the public site never need to sign in.

#### Logs

The site runs on Cloudflare. Its request logs leave out the query string of each address, so what you type into search is not logged.

#### Reporting a problem

Problem reports go to GitHub, under GitHub’s own privacy terms. Anything written there is public. Please do not include patient or member information.

### About and methodology (`/about`)

This page explains where the lists come from and how every number and label on the site is worked out.

#### What this site is, and is not

Under H.R.1 (Pub. L. 119-21), Medicaid members who are medically frail are excluded from the new community engagement (work) requirements. States are publishing lists of the diagnosis and service codes they use to find those members. This site collects those lists and puts them side by side.

- It is not a state or federal source. Each state’s own document is the authority; every state page links to it.
- It does not decide anyone’s eligibility. Whether a person is medically frail is decided by their state, under its own process.
- It holds no patient data. It compares published code lists only: no names, member numbers or claims are uploaded, stored or shown.
- It is not legal advice. See the disclaimer.

#### Where the lists come from and how they are dated

Every list comes from documents a state published, such as a PDF, a spreadsheet or a web page. Each state page lists those documents with a link, the date the state put on the document (when it gives one) and the date this site retrieved it. Each entry also records where in the document it came from.

An admin uploads the state’s file, the site reads it and checks it, and an admin reviews the result before it is published. When a state updates its list, the new list is published as a new version and the state page keeps the version history.

- **Date on the state’s document:** The date the state printed on its list, or on its newest source document.
- **Added to this site:** When this site published that version of the list.
- **Last updated on this site:** When this site last changed the state’s public data: a new version, or a change in how its categories are mapped.

Descriptions of ICD-10-CM and HCPCS codes come from the public code files of the Centers for Medicare & Medicaid Services (CMS). Where a state published its own description, the site says so and names the state.

#### How codes are matched

Codes are compared without dots or capital letters, so F20.0 and f200 are the same code. States write their lists in different ways, so one line of a list (an entry) can be a single code or a group of codes:

- A wildcard, such as F31.* or C34.x, includes every code that starts with F31 or C34.
- A range, such as E08.621–E08.622, includes the codes of the same length between its two ends. A range whose ends are wildcards, such as F41.*–F42.*, includes both whole categories.
- A bare category, such as F20, may or may not mean the codes under it. Where the state does not say, an admin decides for that state.

For any code, each state shows one of these:

- **Listed:** the state’s list has this code, wildcard or range itself.
- **Covered by a broader entry:** a wildcard or range on the state’s list includes it.
- **Narrower codes listed:** the state lists some of the more specific codes under it, but not this code itself.
- **Not listed:** the state has a list on this site, and the code is not on it in any form.
- **No list on this site:** this site has no list from the state yet, so nothing is known.

A narrower code never includes its parent: a state that lists F31.2 does not list F31. “Listed” and “Covered by a broader entry” together are what this site means when it says a state’s list includes a code. Counts of states (“3 of 4 states”) count only states with a list on this site.

#### What “like” codes are

There is no official crosswalk between diagnosis codes (ICD-10-CM) and service codes (CPT and HCPCS). To help compare a state that lists a service with one that lists a diagnosis, this site keeps a short list of condition groups by hand, such as cancer or kidney failure and dialysis. Each group names codes in several code systems that point at the same condition.

On a code’s page, a state whose list does not include the code may show its codes from another code system in the same group, under “Like codes”. A like code is never a match: the state keeps its real status, such as “Not listed”, and the like codes appear in a separate section. The first groups were drafted with the help of AI; only groups an admin has checked and published are used.

#### The state’s rule and “inferred”

States differ on whether a listed code is enough by itself. A badge shows the state’s rule for a code. It describes the state’s list, never whether a person is eligible.

- **Enough by itself:** The state’s list says this code, by itself, meets its medically frail criteria.
- **Needs another code or documentation:** The state says this code counts only with another listed code or documentation.
- **Supporting only:** The state treats this code as supporting evidence; it never counts by itself.
- **State doesn’t say:** The state’s document does not say whether this code is enough by itself.
- **Inferred:** Inferred by this site from the state’s documents (not stated by the state). Some states do not say their rule in so many words, but their documents make it clear enough to show. Such badges are marked “inferred” until the state confirms them.

A tier label (for example “Tier 1”) is always shown as the state wrote it. To check a state’s rule, read its documents, linked under Sources on its state page.

#### Categories: federal, comparison and the state’s own

Codes are grouped at three levels.

- **Federal categories:** The five groups in the law ([Social Security Act §1902(xx)(9)(A)(ii)(V), added by Pub. L. 119-21 §71119](https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm)), plus two of this site’s own for codes that fit none of them or are not yet classified:
- **Comparison categories:** This site’s own grouping, so every state’s list can be measured the same way. They are not a state’s or CMS’s categories. Most are built from the diagnosis groups of AHRQ’s Clinical Classifications Software Refined (CCSR). The first set was drafted with the help of AI; admins edit each one and publish it. Each comparison category is filed under one federal category.
- **The state’s own categories:** Exactly as the state wrote them, such as “SMI” or “Tier 2”.

- (aa) Blind or disabled
- (bb) Substance use disorder
- (cc) Disabling mental disorder
- (dd) Physical, intellectual or developmental disability
- (ee) Serious or complex medical condition
- State’s own category (not in the law)
- Not yet classified

Where a comparison category sits among the federal categories is this site’s choice, not the law’s or CMS’s. For example, this site files dementia under (cc), a disabling mental disorder, and chromosomal conditions such as Down syndrome under (dd), a physical, intellectual or developmental disability. A state may place them differently.

A code can fall in more than one comparison category, so it can count under more than one federal category.

CCSR: Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1. Healthcare Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality. [About the CCSR (AHRQ)](https://hcup-us.ahrq.gov/toolssoftware/ccsr/dxccsr.jsp)

#### How mapping and review work

Each state’s own categories are mapped to comparison categories by an admin, or the admin decides that the state’s categories are not meaningful groups and each code is placed by its CCSR group instead. Until an admin approves a mapping, the site places codes automatically by their CCSR group.

- **Reviewed:** An admin checked and approved how this state category is mapped.
- **Not yet reviewed (automatic suggestion):** The site suggested the mapping automatically and nobody has checked it yet. Numbers that depend on it may change after review.

Every change an admin makes is recorded in an audit log.

#### How the overview’s numbers are worked out

Each comparison category built from CCSR groups has a reference list: every billable ICD-10-CM diagnosis code in those groups, from the current CMS release. A state’s number for the category is the share of that reference list its list includes, listed one by one or covered by a wildcard or range.

- Only billable ICD-10-CM codes count toward the share. Entries in other code systems (CPT, HCPCS, drug classes) count as entries but not toward the share, so a state that relies on service codes shows a low number.
- A category marked † has no reference list (no CCSR groups). Its number is the state’s distinct entries in the category as a share of the distinct entries every state lists there.
- A share above zero never shows as 0%, and one below 100% never shows as 100%. Shades: 75% or more, 25–74%, 1–24%, and none.
- Overall (average) is the plain average of the state’s shares across the categories, so every category counts the same whatever its size. It is not a measure of how many people a list reaches.
- “Similar states together” orders the states so that each one sits next to the state whose shares are closest to its own.

#### How similarity between two states is worked out

Similarity is the share of codes two lists have in common, from 0 (nothing shared) to 1 (identical). It is the Jaccard index: the codes both lists include, divided by the codes either list includes.

- Each list’s codes are every billable ICD-10-CM code it includes (listed, or covered by a wildcard or range), plus its entries in other code systems, each counted once.
- A category code listed without the codes under it, or a code that is not in the current CMS release, adds nothing.
- It is worked out again whenever a state’s list is published.

#### What the downloads contain

Each state page offers its list as CSV and JSON. Every row is one entry of the published list. CSV columns:

- **state:** The state’s two-letter code.
- **code_system:** ICD-10-CM, CPT, HCPCS, revenue code, drug class or other.
- **code:** The entry as the state wrote it.
- **code_normalized:** The same code without dots, in capitals.
- **match_kind:** exact (one code), prefix (a wildcard) or range.
- **range_end:** The last code of a range, normalized; empty otherwise.
- **includes_children:** yes or no: whether a code includes the codes under it; empty when not set.
- **description_published:** The state’s own description, exactly as published; empty if it gave none.
- **state_category, state_subcategory:** The state’s own category.
- **federal_categories:** The federal categories the entry counts under, joined by “; ”.
- **tier:** The state’s tier label, as published.
- **qualification:** The state’s rule (see the badges above).
- **qualification_basis:** Whether the state stated the rule or this site inferred it.
- **source_title, source_url, source_date, source_locator:** The state’s document, its link and date, and where in it the entry is.

The JSON file has the same fields with camelCase names, plus the version, the date on the state’s document, when this site last updated it, and the source documents once.

The code tables (single codes, a category’s codes, states side by side) download as CSV with a description and, per state, the status words used on the page.

- **description_source:** Where the description came from: CMS (the public ICD-10-CM or HCPCS file), or the two-letter code of the state whose published text is shown. Empty when neither gives one. CPT codes never have a CMS description.

#### Court rulings

As of November 3, 2026. This note is not legal advice.

On October 29, 2026, the U.S. District Court for the District of Massachusetts decided [Massachusetts v. Oz (No. 1:26-cv-12962)](https://hpmmatters.publichealth.gwu.edu/sites/g/files/zaxdzs6671/files/2026-10/MSJ%20Decision%20(Mass%20v.%20Oz)%20(1).pdf). The court vacated a requirement CMS added in its interim final rule (42 CFR 435.554(c)(5)(i)): that a condition must significantly impair a person’s ability to meet the work requirement, on top of the five categories in the law. It issued a permanent injunction, with a six-month stay of enforcement for the 26 plaintiffs (25 states and DC).

- The opinion does not strike down any state’s code list, tiers or rules for combining codes. States may change their rules in response; this site shows each list as the state published it.
- Some secondary sources say the ruling applies nationwide. This site has not confirmed that from the opinion.
- This site found no appeal as of November 1, 2026; the time to appeal runs to about the end of December 2026.
- A related case, Taylor v. Kennedy (D. Md. No. 1:26-cv-03705, filed September 18, 2026), is pending.

#### CPT codes (AMA notice)

CPT® is a registered trademark of the American Medical Association (AMA). CPT code descriptions are copyrighted by the AMA. This site does not include the AMA’s CPT descriptions. Where a CPT code has a description here, it is the text the state published, shown with a link to the state’s source document.

#### Report a problem

If a code, description, category or date does not match the state’s document, or you know of a state list this site does not have, [report it on GitHub](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new?template=data-error.yml). A free GitHub account is needed. Please do not include any patient or member information.

For anything else, such as a broken page, [open an issue](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new). The [source code](https://github.com/buddingmonkey/medical-frailty-dashboard) is public.

