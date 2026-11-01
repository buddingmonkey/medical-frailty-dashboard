# What is this site?

TL;DR a way to compare Medicaid coding used to designate medical frailty between different US States.

In the Big Beautiful Bill there is a requirement that people must work to qualify for Medicaid. There are exceptions to that rule. One of those exceptions is that people who are medically frail do not need to meet the work requirements. The bill has some specification for what qualifies for medically frail, but leaves a lot to the states to implement the specifics of frailty.

The states are now releasing their criteria for what qualifies for frailty. These break down into various medicaid coding that is the prerequisite to qualify as medically frail. Each state has a different set of codes, and possibly types of codes (e.g. ICD-10 codes, these are diagnoses, like cancer diagnosis, and HCPCS or CPT codes, service codes, like chemotherapy or radiation). They are all delivered in different formats. Some online, some in spreadsheets, and some in large PDF Files.

This site’s goal is to take the disparate information and create a way to compare data between different states. The primary users of this site will be state Medicaid Directors (and their employees), providers or their associations, and healthcare advocates.

# Technology

- Typescript

## Frontend

- VueJS  
- TailwindCSS  
- Vite \+ Vite Unit Testing  
- Playwright

## Backend

- Relational DB (your choice)  
- NodeJS

# Features

- Data ingestion after deployment including PDF, Excel Spreadsheet, or unformatted JSON.  
  - All of these should be unformatted and if the cleanup cannot be automated the site should refer the user to use AI to perform the cleanup  
- Home Page \- Full country overview. US State Map with overviews for each state when highlighted. These should include \# of codes, type of codes, and any other important misc information  
- Comparison by type  
  - The user selects the type of code and a state and a list of codes with number and name is displayed. The user can select as many states as they may like to have each state compared  
  - The bill specifies some types of codes, but there are more codes used by states than the bill lists. The ingestion should make a best attempt at matching the codes, and create a place where an administrator can remap the types if the automatic matching is not correct.  
- Code search  
  - The user can search by code number or name (and filter by state) to find a specific code. When selected the user can see all the states that are confirmed to implement the same code.  
    - They can also see if there is a “like” code for a state that uses a different type of coding  
- Admin  
  - Protected admin panel that is ideally logged into via a Google account (but we can make an account if we need to)  
  - Ingestion page and type mapping are behind the admin page  
  - Also a way to manually backup the database to the admin computer is here
