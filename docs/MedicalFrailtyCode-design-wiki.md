# What is this site?

This site compares the Medicaid codes that US states use to designate medical frailty.

H.R.1 (Pub. L. 119-21) requires many people to meet work requirements to qualify for Medicaid. One exemption covers people who are medically frail. The law gives some specification of what counts as medically frail, but leaves the specifics to the states.

States are now publishing their criteria. These criteria reduce to Medicaid codes that serve as the prerequisite for qualifying as medically frail. Each state uses a different set of codes, and sometimes different types of codes. ICD-10 codes are diagnoses, such as a cancer diagnosis. HCPCS and CPT codes are service codes, such as those for chemotherapy or radiation. States publish their lists in different formats: some online, some in spreadsheets, and some in large PDF files.

The site's goal is to take this disparate information and make it comparable across states. Its primary users are state Medicaid directors and their staff, providers and provider associations, and healthcare advocates.

# Technology

- TypeScript

## Frontend

- Vue
- Tailwind CSS
- Vite and Vite unit testing
- Playwright

## Backend

- Relational database (implementer's choice)
- Node.js

# Features

- **Data ingestion after deployment.** Accepts PDF, Excel spreadsheet or unformatted JSON.
  - All input is treated as unformatted. If cleanup cannot be automated, the site refers the user to an AI tool to perform it.
- **Home page.** A full country overview with a US state map. Highlighting a state shows an overview that includes the number of codes, the types of codes and any other important information.
- **Comparison by type.**
  - The user selects a code type and a state, and the site lists the codes with number and name. The user can select as many states as they like to compare.
  - The law specifies some code types, but states use more types than the law lists. Ingestion makes a best attempt at matching codes to types. An administrator can remap the types where the automatic match is wrong.
- **Code search.**
  - The user can search by code number or name, and filter by state, to find a specific code. Selecting a code shows all the states confirmed to use it.
  - The user can also see whether a state has a "like" code of a different code type.
- **Admin.**
  - A protected admin panel, ideally signed into with a Google account (a separate account can be created if needed).
  - Ingestion and type mapping are behind the admin panel.
  - The admin panel also provides a way to back up the database manually to the administrator's computer.
