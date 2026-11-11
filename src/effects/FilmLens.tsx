/**
 * FilmLens — the one fixed overlay every pixel sits under (grain, vignette). CONTRACT FILE, owner: stream "film".
 * STUB from SPEC.md §9: the grain layer the site has today. Keep the default export and its props.
 */
export default function FilmLens({ page = 'deck' }: { page?: 'deck' | 'sub' }) {
  // Sub-pages have no grain layer today, so the stub adds none there.
  if (page === 'sub') return null
  return <div aria-hidden="true" className="film-grain z-[80]" />
}
