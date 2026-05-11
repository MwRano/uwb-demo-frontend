import './App.css'
import UwbMap from './components/UwbMap.tsx'

function App() {
  return (
    <div className="App">
      <header className="app-header">
        <div className="app-title">
          <h1>UWB リアルタイムマップ</h1>
          <p>屋内空間の位置情報を即時に可視化</p>
        </div>
        <div className="app-actions">
          <span className="chip">LIVE</span>
          <span className="chip">LAB MAP</span>
        </div>
      </header>
      <main>
        <UwbMap />
      </main>
    </div>
  )
}

export default App
