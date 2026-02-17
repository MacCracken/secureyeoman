interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 28 }: LogoProps) {
  return (
    <img
      src="/logo-mark.svg"
      alt="SecureYeoman"
      width={size}
      height={size}
      className={`flex-shrink-0 ${className}`}
    />
  );
}
