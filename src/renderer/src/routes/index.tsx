import { createFileRoute, Link } from '@tanstack/react-router'
import Versions from '@renderer/components/Versions'

export const Route = createFileRoute('/')({
  component: function Dashboard(): React.JSX.Element {
    return (
      <div className="pt-[120px] px-[24px]">
        <h1 className="font-headline text-[64px] leading-none text-black pb-[40px]">DEV BROWSER</h1>

        <div className="flex gap-[24px] flex-wrap">
          <Link
            to="/browser"
            className="block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[32px] leading-[1.1] pb-[16px]">
              BROWSER CONTROL
            </span>
            <span className="block font-mono text-[15px] leading-[1.5]">
              Open and control a developer browser window
            </span>
          </Link>
        </div>

        <Versions />
      </div>
    )
  }
})
