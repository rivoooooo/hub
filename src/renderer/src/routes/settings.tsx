import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: () => (
    <div className="pt-[120px] px-[24px]">
      <h1 className="font-headline text-[64px] leading-none text-black pb-[16px]">SETTINGS</h1>
      <p className="font-body text-[16px] leading-[1.6] text-black pb-[40px] max-w-[600px]">
        Nothing to configure yet. The raw defaults are already perfect.
      </p>
      <Link to="/" className="font-mono text-[15px] text-black underline hover:text-blue">
        ← Back to Home
      </Link>
    </div>
  )
})
