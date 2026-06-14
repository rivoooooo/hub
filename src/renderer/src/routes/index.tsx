import { createFileRoute, Link } from '@tanstack/react-router'
import Versions from '@renderer/components/Versions'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/')({
  component: function Dashboard(): React.JSX.Element {
    return (
      <div className="pt-[120px] px-[24px] pb-[180px] h-screen overflow-y-auto">
        <h1 className="font-headline text-[64px] leading-none text-black pb-[8px]">
          {m.home_title()}
        </h1>
        <p className="font-mono text-[15px] leading-[1.5] text-black pb-[40px]">
          {m.home_subtitle()}
        </p>

        <div className="flex gap-[24px] flex-wrap">
          <Link
            to="/browser"
            className="group block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[12px] uppercase tracking-[3px] text-black group-hover:text-white pb-[8px]">
              {m.home_module_label()}
            </span>
            <span className="block font-headline text-[32px] leading-[1.1] pb-[8px]">
              {m.home_browser_card_title()}
            </span>
            <span className="block font-mono text-[13px] leading-[1.5] opacity-60">
              {m.home_browser_card_desc()}
            </span>
          </Link>
          <Link
            to="/seo"
            className="group block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[12px] uppercase tracking-[3px] text-black group-hover:text-white pb-[8px]">
              {m.home_module_label()}
            </span>
            <span className="block font-headline text-[32px] leading-[1.1] pb-[8px]">
              {m.seo_card_title()}
            </span>
            <span className="block font-mono text-[13px] leading-[1.5] opacity-60">
              {m.seo_card_desc()}
            </span>
          </Link>
          <Link
            to="/dock"
            className="group block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[12px] uppercase tracking-[3px] text-black group-hover:text-white pb-[8px]">
              {m.home_module_label()}
            </span>
            <span className="block font-headline text-[32px] leading-[1.1] pb-[8px]">APP DOCK</span>
            <span className="block font-mono text-[13px] leading-[1.5] opacity-60">
              {m.dock_card_desc()}
            </span>
          </Link>
          <Link
            to="/logs"
            className="group block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[12px] uppercase tracking-[3px] text-black group-hover:text-white pb-[8px]">
              {m.home_module_label()}
            </span>
            <span className="block font-headline text-[32px] leading-[1.1] pb-[8px]">
              {m.logs_title()}
            </span>
            <span className="block font-mono text-[13px] leading-[1.5] opacity-60">
              {m.logs_system_logs_desc()}
            </span>
          </Link>
          <Link
            to="/bridge-console"
            className="group block w-[280px] p-[24px] border-[3px] border-black bg-white text-black transition-colors duration-[50ms] hover:bg-black hover:text-white"
          >
            <span className="block font-headline text-[12px] uppercase tracking-[3px] text-black group-hover:text-white pb-[8px]">
              {m.home_module_label()}
            </span>
            <span className="block font-headline text-[32px] leading-[1.1] pb-[8px]">
              {m.bridge_console_card_title()}
            </span>
            <span className="block font-mono text-[13px] leading-[1.5] opacity-60">
              {m.bridge_console_card_desc()}
            </span>
          </Link>
        </div>

        <Versions />
      </div>
    )
  }
})
