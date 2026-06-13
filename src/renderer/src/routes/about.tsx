import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: () => (
    <div className="pt-[120px] px-[24px]">
      <h1 className="font-headline text-[64px] leading-none text-black pb-[16px]">ABOUT</h1>
      <p className="font-body text-[16px] leading-[1.6] text-black pb-[40px] max-w-[600px]">
        This is the About page, powered by TanStack Router — rendered in the raw, unapologetic
        RawBlock brutalist design system.
      </p>
      <Link to="/" className="font-mono text-[15px] text-black underline hover:text-blue">
        ← Back to Home
      </Link>
    </div>
  )
})
