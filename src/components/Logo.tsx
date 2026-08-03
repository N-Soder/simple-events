interface LogoProps {
  className?: string;
}

/**
 * Guests seated around a table, with the host picked out in the brand green.
 *
 * The filled centre is load-bearing, not decoration: without it the ring of
 * dots reads as a loading spinner, especially at nav and favicon sizes.
 */
const Logo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 120 120" role="img" aria-label="Simple Events" className={className}>
    <circle cx="60" cy="60" r="27" className="fill-foreground" opacity="0.22" />
    <g className="fill-foreground">
      <circle cx="90.4" cy="29.6" r="8" />
      <circle cx="103" cy="60" r="8" />
      <circle cx="90.4" cy="90.4" r="8" />
      <circle cx="60" cy="103" r="8" />
      <circle cx="29.6" cy="90.4" r="8" />
      <circle cx="17" cy="60" r="8" />
      <circle cx="29.6" cy="29.6" r="8" />
    </g>
    <circle cx="60" cy="17" r="10" className="fill-primary" />
  </svg>
);

export default Logo;
