'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PatriotsLogo, SeahawksLogo, SuperBowlLXLogo, MatchupBanner } from '@/components/Logos';

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Patriots blue glow (left) */}
          <div className="absolute top-1/4 left-0 w-96 h-96 bg-[#002244]/30 rounded-full blur-[128px] animate-pulse" />
          {/* Seahawks green glow (right) */}
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-[#69be28]/20 rounded-full blur-[128px] animate-pulse delay-300" />
          {/* Gold accent */}
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-[var(--championship-gold)]/10 rounded-full blur-[96px] animate-pulse delay-500" />

          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            {/* Super Bowl LX Logo */}
            <div className="flex justify-center mb-6 animate-fade-up opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
              <SuperBowlLXLogo size={160} />
            </div>

            {/* Event info badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30 mb-6 animate-fade-up opacity-0" style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}>
              <div className="w-2 h-2 rounded-full bg-[var(--championship-gold)] animate-pulse" />
              <span className="text-sm font-medium text-[var(--championship-gold)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                FEBRUARY 8, 2026 • LEVI'S STADIUM
              </span>
            </div>

            {/* Teams matchup */}
            <div className="flex items-center justify-center gap-8 md:gap-16 mb-8 animate-fade-up opacity-0" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
              {/* Patriots */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#c60c30]/20 blur-xl rounded-full" />
                  <PatriotsLogo size={80} className="relative" />
                </div>
                <span
                  className="mt-3 text-lg font-bold"
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em', color: '#c60c30' }}
                >
                  PATRIOTS
                </span>
                <span className="text-xs text-[var(--smoke)]">AFC Champions</span>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center">
                <span
                  className="text-3xl font-bold text-[var(--championship-gold)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  VS
                </span>
              </div>

              {/* Seahawks */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#69be28]/20 blur-xl rounded-full" />
                  <SeahawksLogo size={80} className="relative" />
                </div>
                <span
                  className="mt-3 text-lg font-bold"
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em', color: '#69be28' }}
                >
                  SEAHAWKS
                </span>
                <span className="text-xs text-[var(--smoke)]">NFC Champions</span>
              </div>
            </div>

            {/* Main title */}
            <h1 className="hero-title mb-6 animate-fade-up opacity-0" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
              <span className="block text-[var(--chrome)]">SUPER BOWL</span>
              <span className="block gradient-text">SQUARES</span>
            </h1>

            {/* Subtitle */}
            <p className="hero-subtitle mx-auto mb-10 animate-fade-up opacity-0" style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}>
              Create or join betting pools for the big game. Powered by blockchain for transparent, trustless, and automatic payouts after every quarter.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up opacity-0" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
              <Link href="/pools" className="btn-primary text-lg px-10 py-4">
                Browse Pools
              </Link>
              <Link href="/pools/create" className="btn-secondary text-lg px-10 py-4">
                Create Pool
              </Link>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto mt-16 animate-fade-up opacity-0" style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}>
              <StatItem value="100" label="Squares" />
              <StatItem value="4" label="Payouts" />
              <StatItem value="∞" label="Possibilities" />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* What is Super Bowl Squares */}
      <section className="py-20 relative">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                WHAT IS SUPER BOWL SQUARES?
              </h2>
              <p className="text-[var(--smoke)] text-lg">
                The most popular Super Bowl party game, now onchain
              </p>
            </div>

            <div className="card p-8 md:p-10">
              <div className="space-y-6 text-[var(--smoke)]">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--turf-green)]/20 flex items-center justify-center">
                    <span className="text-[var(--turf-green)] font-bold text-sm">1</span>
                  </div>
                  <div>
                    <h3 className="text-[var(--chrome)] font-bold mb-1">Buy Squares on a 10x10 Grid</h3>
                    <p>The grid has 100 squares. One team runs along the top, the other down the side. Each square represents a unique combination of score digits for both teams.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--turf-green)]/20 flex items-center justify-center">
                    <span className="text-[var(--turf-green)] font-bold text-sm">2</span>
                  </div>
                  <div>
                    <h3 className="text-[var(--chrome)] font-bold mb-1">Numbers Are Randomly Assigned</h3>
                    <p>After all squares are sold, random numbers 0-9 are assigned to each team's axis using a secure commit-reveal scheme. This keeps it fair - no one knows which numbers they'll get when buying.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--turf-green)]/20 flex items-center justify-center">
                    <span className="text-[var(--turf-green)] font-bold text-sm">3</span>
                  </div>
                  <div>
                    <h3 className="text-[var(--chrome)] font-bold mb-1">Win by Matching the Last Digit of Each Score</h3>
                    <p>At the end of each quarter, take the last digit of each team's score. The square where those two numbers meet wins!</p>
                  </div>
                </div>

                <div className="mt-8 p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20">
                  <p className="text-sm">
                    <span className="text-[var(--turf-green)] font-bold">Example:</span>{' '}
                    <span className="text-[var(--chrome)]">Score is Patriots <span className="text-[var(--turf-green)] font-bold">17</span> - Seahawks <span className="text-[var(--turf-green)] font-bold">14</span>. Take the last digit of each: Patriots = <span className="text-[var(--turf-green)] font-bold">7</span>, Seahawks = <span className="text-[var(--turf-green)] font-bold">4</span>. The square where 7 (Patriots side) meets 4 (Seahawks side) wins!</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              WHY CHOOSE ONCHAIN?
            </h2>
            <p className="text-[var(--smoke)] max-w-2xl mx-auto">
              Traditional squares pools rely on trust. We built something better.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<DiceIcon />}
              title="Provably Fair"
              description="Random number assignment uses a secure commit-reveal scheme that ensures truly random and verifiable results. No more suspicious organizers."
              delay={100}
            />
            <FeatureCard
              icon={<OracleIcon />}
              title="Transparent Scoring"
              description="Pool operators submit verified scores on-chain. All transactions are publicly auditable and immutably recorded on Ethereum."
              delay={200}
            />
            <FeatureCard
              icon={<WalletIcon />}
              title="Instant Payouts"
              description="Smart contracts automatically distribute winnings after each quarter settles. No waiting, no disputes, no middlemen."
              delay={300}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 relative">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--turf-green)]/5 to-transparent" />

        <div className="container mx-auto px-6 relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              HOW IT WORKS
            </h2>
            <p className="text-[var(--smoke)] max-w-2xl mx-auto">
              Four simple steps from square to payout
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 md:gap-4 relative">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-[var(--turf-green)]/50 via-[var(--turf-green)] to-[var(--turf-green)]/50" />

            <Step
              number={1}
              title="Create or Join"
              description="Create a new pool or join an existing one by purchasing squares on the 10x10 grid."
              delay={100}
            />
            <Step
              number={2}
              title="Random Numbers"
              description="After the pool closes, the operator reveals the randomness to assign 0-9 numbers to rows and columns."
              delay={200}
            />
            <Step
              number={3}
              title="Watch & Score"
              description="During the game, the pool operator submits scores on-chain after each quarter ends."
              delay={300}
            />
            <Step
              number={4}
              title="Claim Winnings"
              description="If your square matches the last digit of each team's score, claim your payout!"
              delay={400}
            />
          </div>
        </div>
      </section>

      {/* Payout Structure */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="card p-8 md:p-12">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              {/* Left side - Visual */}
              <div className="flex-1 w-full">
                <MiniGrid />
              </div>

              {/* Right side - Content */}
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  EXAMPLE PAYOUT STRUCTURE
                </h2>
                <p className="text-[var(--smoke)] mb-8">
                  Typical pools distribute the pot across all four quarters. Pool operators can customize the split.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <PayoutCard quarter="Q1" percentage={20} color="green" />
                  <PayoutCard quarter="Q2" percentage={20} color="green" />
                  <PayoutCard quarter="Q3" percentage={20} color="green" />
                  <PayoutCard quarter="Final" percentage={40} color="gold" />
                </div>

                <div className="mt-8">
                  <Link href="/pools/create" className="btn-primary">
                    Create Your Pool
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--turf-green)]/10 rounded-full blur-[128px]" />

        <div className="container mx-auto px-6 relative">
          <div className="max-w-3xl mx-auto text-center">
            {/* Team logos */}
            <div className="flex justify-center items-center gap-8 mb-8">
              <PatriotsLogo size={48} />
              <SuperBowlLXLogo size={80} />
              <SeahawksLogo size={48} />
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-[var(--chrome)] mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              READY FOR <span className="gradient-text">GAME DAY</span>?
            </h2>
            <p className="text-xl text-[var(--smoke)] mb-4">
              Patriots vs Seahawks • Super Bowl LX
            </p>
            <p className="text-lg text-[var(--smoke)] mb-10">
              Join the decentralized future of Super Bowl squares. No trust required, just blockchain.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/pools" className="btn-primary text-lg px-12 py-4">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Components

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="stat-value gradient-text">{value}</div>
      <div className="stat-label mt-1">{label}</div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      className="card p-8 group hover:border-[var(--turf-green)]/30 transition-all duration-300 animate-fade-up opacity-0"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="feature-icon mb-6 group-hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] transition-shadow duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      <p className="text-[var(--smoke)] leading-relaxed">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  delay,
}: {
  number: number;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      className="relative text-center animate-fade-up opacity-0"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="step-number mx-auto mb-4 relative z-10">{number}</div>
      <h3 className="text-lg font-bold text-[var(--chrome)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>{title}</h3>
      <p className="text-sm text-[var(--smoke)]">{description}</p>
    </div>
  );
}

function PayoutCard({
  quarter,
  percentage,
  color,
}: {
  quarter: string;
  percentage: number;
  color: 'green' | 'gold';
}) {
  const colorClasses = color === 'gold'
    ? 'border-[var(--championship-gold)]/30 bg-[var(--championship-gold)]/5'
    : 'border-[var(--turf-green)]/30 bg-[var(--turf-green)]/5';

  const textColor = color === 'gold' ? 'gradient-text-gold' : 'gradient-text';

  return (
    <div className={`rounded-xl border p-6 text-center ${colorClasses}`}>
      <div className="text-sm font-bold text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        {quarter}
      </div>
      <div className={`text-3xl font-bold ${textColor}`} style={{ fontFamily: 'var(--font-display)' }}>
        {percentage}%
      </div>
    </div>
  );
}

function MiniGrid() {
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null);

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-[var(--turf-green)]/10 blur-3xl rounded-3xl" />

      <div className="relative card p-6">
        {/* Seahawks label (top - columns) */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <SeahawksLogo size={24} />
          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: '#69be28' }}>
            SEAHAWKS
          </span>
        </div>

        <div className="flex">
          {/* Patriots label (left - rows) */}
          <div className="flex items-center justify-center w-8">
            <div className="flex items-center gap-1 -rotate-90 whitespace-nowrap">
              <PatriotsLogo size={16} />
              <span
                className="text-[10px] font-bold"
                style={{ fontFamily: 'var(--font-display)', color: '#c60c30' }}
              >
                PATRIOTS
              </span>
            </div>
          </div>

          <div className="flex-1">
            {/* Column numbers */}
            <div className="flex gap-1 mb-1 ml-6">
              {[1, 7, 4, 0, 9, 2, 5, 8, 3, 6].map((num, i) => (
                <div key={i} className="flex-1 flex items-center justify-center h-5 rounded-sm bg-[var(--steel)]/20">
                  <span className="text-[10px] font-bold text-[var(--turf-green)]">{num}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-1">
              {/* Row numbers */}
              <div className="flex flex-col gap-1 w-5">
                {[3, 8, 1, 6, 0, 9, 4, 7, 2, 5].map((num, i) => (
                  <div key={i} className="flex-1 flex items-center justify-center rounded-sm bg-[var(--steel)]/20">
                    <span className="text-[10px] font-bold text-[var(--turf-green)]">{num}</span>
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex-1 grid grid-cols-10 gap-1">
                {Array.from({ length: 100 }).map((_, i) => {
                  const isHighlighted = i === 34 || i === 56 || i === 78;
                  const isHovered = i === hoveredSquare;

                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-sm transition-all duration-200 cursor-pointer border ${
                        isHighlighted
                          ? 'bg-[var(--turf-green)] shadow-[0_0_10px_rgba(34,197,94,0.5)] border-[var(--turf-green)]'
                          : isHovered
                          ? 'bg-[var(--turf-green)]/30 border-[var(--turf-green)]/50'
                          : 'bg-[var(--grass-dark)]/20 border-[var(--turf-green)]/30 hover:bg-[var(--grass-dark)]/40'
                      }`}
                      onMouseEnter={() => setHoveredSquare(i)}
                      onMouseLeave={() => setHoveredSquare(null)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[var(--grass-dark)]/20 border border-[var(--turf-green)]/30" />
            <span className="text-[var(--smoke)]">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[var(--turf-green)]" />
            <span className="text-[var(--smoke)]">Your Squares</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons

function DiceIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function OracleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="3" x2="12" y2="8" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="16" x2="12" y2="21" stroke="currentColor" strokeWidth="2" />
      <line x1="3" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
      <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M6 6V5a3 3 0 013-3h6a3 3 0 013 3v1" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="13" r="2" fill="currentColor" />
    </svg>
  );
}
