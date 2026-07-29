export default function PulsingDot({ className = 'h-2 w-2' }) {
  return (
    <span className={`relative flex ${className}`}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
      <span className="relative inline-flex rounded-full h-full w-full bg-error" />
    </span>
  );
}
