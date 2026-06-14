import { type ReactNode } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

function App(): ReactNode {
  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <button
          className="counter"
          onClick={() => {
            console.log(window['bridge']['call']('info'))
          }}
        >
          Look Window
        </button>
      </section>
    </>
  )
}

export default App
