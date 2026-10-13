# Content migration notes

The new structured content was migrated from `academic.md`. The original file remains an archival reference.

- **Profile:** name, portrait, email, five profile links, three education entries, institution and department links, research interests, and the complete substance of the biography.
- **News:** all 18 entries, including two distinct entries in October 2024. The source supplies months only, so entries keep `YYYY-MM` with `datePrecision: 'month'`. No day was invented. Future exact-date entries can use `YYYY-MM-DD` and `datePrecision: 'day'`.
- **Publications:** all six papers: one conference paper, four journal papers, and one preprint. Titles, author order, contribution markers, venue/year, cover assets, paper links, arXiv, code, BibTeX, and individual Scholar citation links are preserved. The old plain-text labels “Supp / Code / Slides / Poster” without link targets were not converted into fake links.
- **Featured publications:** TEA, EL, and ANM are an explicit initial editorial selection, not a recency rule. Change `featured` in `src/data/publications.ts`; there is no selection limit.
- **Awards:** all original ten list items, with the 2023 and 2024 scholarship split into two annual records (11 records total).
- **Gallery:** three requested albums, with empty photo arrays and no stock photographs.
- **Quotes:** three clearly commented, original editorial placeholder lines without attribution. Replace them in `src/data/quotes.ts`.

## Deliberately preserved uncertainties

- The source award says **GMU Academic Scholarship** while the education section uses **GXMU**. “GMU” is retained instead of guessing the institution. Please confirm its expansion before changing it.
- Chinese award names are faithful translations of the supplied English wording, not verified official certificate wording. In particular, the two long course-design/teaching contest titles can be replaced with the exact Chinese text on the certificates.
- SCI quartiles and impact factors are historical values copied from the source; no claim is made that they are current metrics. Review them whenever updating publication metadata.
- Source News and publication dates occasionally differ from dates suggested by URLs/BibTeX. The visible source years/months are retained, rather than silently interpreting acceptance/publication dates as interchangeable.
- The original footer said “Last updated: Jan, 2026” even though News included February 2026. The new `lastUpdated` is the site migration date; it does not assert that the underlying research information was independently re-verified then.
- `siteUrl` follows the existing GitHub Pages repository URL from the legacy footer. Update it when using a custom domain.

All personal content has English and Chinese fields where appropriate. Paper titles, author names, venues, and source links retain their original wording.
