// Role B. The hero's way into the Habitat Lens: a photo of the Moon in the corner. At rest a slow ring and a
// short caption mark it as something to press; on hover or keyboard focus a panel slides out and says exactly
// what it does before the user commits. On touch screens, where there is no hover, the panel is always open.
import Link from 'next/link';

export function MoonLauncher({
  href,
  name,
  readout,
}: {
  href: string;
  /** Habitat name, e.g. "Moon base". */
  name: string;
  /** One line of the habitat's values, e.g. "30% O2 · 70.3 kPa · 0.166 g". */
  readout: string;
}) {
  return (
    <Link href={href} className="moon" aria-label={`Check the ${name} in the Habitat Lens: ${readout}`}>
      <span className="moon-panel" aria-hidden="true">
        <b>Check the {name}</b>
        <span>{readout}</span>
        <i>Opens the Habitat Lens →</i>
      </span>
      <span className="moon-orb" aria-hidden="true">
        <span className="moon-ring" />
        {/* eslint-disable-next-line @next/next/no-img-element -- small decorative photo in a fixed circle */}
        <img src="/media/moon-gsfc-e001862.jpg" alt="" width={720} height={720} />
      </span>
      <span className="moon-cap" aria-hidden="true">
        {name}
      </span>
    </Link>
  );
}
