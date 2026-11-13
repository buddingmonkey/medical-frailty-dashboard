// The server-rendered content of each public page (docs/seo.md): one module per page type,
// shared helpers in shared.ts. The exports are the same as the old seo/pages.ts.

export {
  type PageParts,
  siteOrganization,
  pageJsonLd,
  footerHtml,
  navHtml,
  compareTabsHtml,
  siteIconTags,
  headTags,
  renderInto,
} from './shared'
export { homePage } from './home'
export { statesPage } from './states'
export { mapPage } from './map'
export { overlapsPage } from './overlaps'
export { categoriesPage } from './categories'
export { downloadName, statePage } from './state'
export { type CompareFormValues, compareCsvPath, comparePage } from './compare'
export { overviewPage } from './overview'
export { drillCellWords, drillPage, categoryNotFoundPage } from './drill'
export { statesComparePage, statesCompareNotFoundPage, statesLandingPage } from './states-compare'
export { notFoundPage } from './not-found'
