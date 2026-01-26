'use client';
import Image from 'next/image';

// New England Patriots Logo
export function PatriotsLogo({ className = '', size = 48 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logos/patriots.svg"
      alt="New England Patriots"
      width={size}
      height={size * 0.47}
      className={`object-contain ${className}`}
    />
  );
}

// Seattle Seahawks Logo
export function SeahawksLogo({ className = '', size = 48 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logos/seahawks.svg"
      alt="Seattle Seahawks"
      width={size}
      height={size * 0.44}
      className={`object-contain ${className}`}
    />
  );
}

// Super Bowl LX Logo
export function SuperBowlLXLogo({ className = '', size = 120 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/logos/super-bowl-lx.svg"
      alt="Super Bowl LX"
      width={size}
      height={size * 0.66}
      className={`object-contain ${className}`}
    />
  );
}

// Combined matchup banner
export function MatchupBanner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-6 md:gap-10 ${className}`}>
      <div className="flex flex-col items-center">
        <PatriotsLogo size={64} />
        <span
          className="mt-2 text-sm font-bold text-[#c60c30]"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
        >
          PATRIOTS
        </span>
      </div>

      <div className="flex flex-col items-center">
        <SuperBowlLXLogo size={100} />
        <span className="text-xs text-[var(--smoke)] mt-1">Feb 8, 2026</span>
      </div>

      <div className="flex flex-col items-center">
        <SeahawksLogo size={64} />
        <span
          className="mt-2 text-sm font-bold text-[#69be28]"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
        >
          SEAHAWKS
        </span>
      </div>
    </div>
  );
}

// Team colors for styling
export const TEAM_COLORS = {
  patriots: {
    primary: '#002244',
    secondary: '#c60c30',
    accent: '#b0b7bc',
  },
  seahawks: {
    primary: '#002244',
    secondary: '#69be28',
    accent: '#a5acaf',
  },
};
