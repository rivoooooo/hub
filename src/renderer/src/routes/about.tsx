import { createFileRoute, Link } from '@tanstack/react-router'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/about')({
  component: () => (
    <div className="pt-[120px] px-[24px]">
      <h1 className="font-headline text-[64px] leading-none text-black pb-[16px]">
        {m.about_title()}
      </h1>
      <p className="font-body text-[16px] leading-[1.6] text-black pb-[40px] max-w-[600px]">
        {m.about_description()}
      </p>
      <Link to="/" className="font-mono text-[15px] text-black underline hover:text-blue">
        {m.back_to_home()}
      </Link>
    </div>
  )
})
