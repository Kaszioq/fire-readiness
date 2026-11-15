// Role B. A full-width NASA photo behind the top of a page, faded into the background, with its credit.
// Decorative: the photo carries no data, so it has an empty alt and the credit names what it shows.
export function PageBanner({
  src,
  caption,
  creditHref,
  position = 'center',
}: {
  src: string;
  /** What the photo shows, in one short sentence. */
  caption: string;
  creditHref: string;
  /** CSS object-position, to keep the subject clear of the heading. */
  position?: string;
}) {
  return (
    <>
      <div className="banner" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative, absolutely positioned, no layout shift */}
        <img src={src} alt="" style={{ objectPosition: position }} />
      </div>
      <p className="banner-credit">
        {caption}{' '}
        <a href={creditHref} target="_blank" rel="noreferrer">
          Photo: NASA
        </a>
      </p>
    </>
  );
}
