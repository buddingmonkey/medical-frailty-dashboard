# Adding or updating a state's code list

Step by step, written from loading the four seed states (GA, LA, MT, NE) on 2026-11-02
(`docs/devlog/2026-11-02-m2-step11-seed-run.md`). For admins, and for an AI assistant helping
one. Nothing here is public until step 8, and every step before it can be undone.

## Before you start

- Find the state's **official** list: a PDF, Excel or CSV from the state Medicaid agency's site.
  Note its address and the date printed on it. Read `docs/sources.md` for that state; add a
  section if it is new.
- Check how the state says a code qualifies: alone, only with another code, or as supporting
  evidence. Write down what the state says and where. If it says nothing, the answer is "State
  doesn't say". **Do not guess**; mark anything you deduced as "Inferred by us". The legal team
  reviews this wording.

## 1. Store the file (Admin → Source files)

Choose the state, pick the file, and fill in the title, the state's address for the file, and
the date on the document. These become the citation on the public page. The page warns you if
the same file is already stored.

## 2. Read and map it (Admin → Read and map)

1. Choose the state and the same file. A PDF can take a few seconds.
2. If the file has several tables (Nebraska: diagnoses, then a CPT/HCPCS page) or sheets, the
   **Table** list shows them. Map and send each one; they go to the same draft.
3. **Columns:** check what each column "means". The guess is usually right; fix it where two
   columns share a name (Montana: the first "Category" is the tier).
4. **Does a code qualify on its own?** One value for the whole file, or per value of a column
   (Louisiana's 0/1/2 "Code Designation"; Montana's tier). Pick "The state says so" or
   "Inferred by us" honestly.
5. **Category for every row / Tier for every row** appear when the file has no such column.
   Georgia publishes each tier as a file: "Attachment A" for one, "Attachment B" for the other.
6. Click **Save column profile**: the next file with the same headers maps itself.
7. **PDF wrapped lines:** look at the first mapped rows. If a description sits next to the wrong
   code, change "Wrapped lines".

## 3. Review the rows

The review table shows what needs you first.

- **Cannot be read**: fix the code (Edit) or Drop the row. Montana's `L89.500-L89` is cut off
  in the state's own PDF: drop it or type the full range if you know it from the state.
- **Whole category or this code only?** for bare 3-character codes (`F20`). We read them as the
  whole category for the seed states; check the state's wording.
- **ICD-10-CM or HCPCS?** for codes written without dots (Nebraska). The CMS lists settle most
  of them; for the rest, filter and use "Code system for the rows shown".
- **Not in the CMS lists**: worth a look. Louisiana's pharmacy codes (`H2G`) are drug classes:
  filter "Not in the CMS lists" plus each "… / Pharmacy" category, then set "Drug class".
  Outdated codes (`T40.4X1A`) are the state's; keep them as published.
- When everything is answered, **Accept flags for all shown** for the rest you checked.

## 4. Send to a draft

The panel finds the stored file by its contents. Choose **New draft**, or the open draft when
this is the second file or table of the same list. Sending the same table again replaces it.

## 5. Read the checks (the draft page)

- **Blocks publishing**: fix it first (too many unreadable rows, an upload that stopped).
- **Needs the state code typed**: stop and read. "The file names NE, but this draft is for MT"
  or "44% of codes are gone" usually means the wrong file. On 2026-11-02 loading Nebraska's file
  as Montana produced exactly these two.
- **Needs a confirmation**: unknown codes, missing categories, open flags. Read each one.
- Download the diff (CSV) if you want to check the changes offline.

## 6. Publish

Tick each confirmation, type the state code where asked, and publish. The previous list is
backed up and stays one click away under **Versions → Restore**.

## 7. Map the categories (Admin → Categories)

Each state category needs a federal category. Publishing stores keyword guesses; **Confirm**
each one, or "Confirm all guesses" after reading them. For states without categories
(Georgia, Nebraska) map "(no category)" and use **chapter overrides**. Launch needs every
mapping confirmed.

## If a file will not read

Use **Get help from an AI assistant** on the Read and map page: copy each part's prompt into an
AI assistant, paste its JSON answer back, and review the rows as above. Tested on Montana and
Nebraska: the answers matched the PDF reader code for code.

## Asking an AI coding assistant to help

```
Read CLAUDE.md, docs/status.md and docs/add-state-source.md.
I want to add <state>'s list from <URL>. Profile the file first (columns, code shapes, how the
state says codes qualify) and add a section to docs/sources.md. Tell me anything the admin
screens cannot handle before changing code.
```
