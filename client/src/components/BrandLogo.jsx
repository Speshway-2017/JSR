/** JSR brand mark — logo image used in sidebar, login, title bar */
export default function BrandLogo({ className = 'w-10 h-10', rounded = true }) {
  return (
    <img
      src="/jsr-icon.png"
      alt="JSR"
      className={`${rounded ? 'rounded-xl' : ''} object-contain ${className}`}
      draggable={false}
    />
  );
}
