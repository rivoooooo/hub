import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="fixed bottom-0 left-0 right-0 flex border-t-[3px] border-black bg-white font-mono text-[15px] leading-[1.5] list-none m-0 p-0">
      <li className="py-[12px] px-[20px] border-r-[3px] border-black text-black">
        Electron v{versions.electron}
      </li>
      <li className="py-[12px] px-[20px] border-r-[3px] border-black text-black">
        Chromium v{versions.chrome}
      </li>
      <li className="py-[12px] px-[20px] text-black">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
