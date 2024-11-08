import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { fetchAuthSession } from 'aws-amplify/auth';

function App() {
  const [count, setCount] = useState(0)
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);  // 読み込み中の状態

  const handleSubmit = async () => {
    setLoading(true);  // 読み込み開始

    try {
      const idToken = (await fetchAuthSession()).tokens?.idToken as unknown as string ?? "";
      const response = await fetch('/api/hello/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${idToken}`,
        },
      });

      const data = await response.json();
      setResults(data);
      if (response.status === 200) {
        setResults(data);
      } else {
        setResults(null);  // 結果をリセット
      }
    } catch (error) {
      setResults(null);
    } finally {
      setLoading(false);  // 読み込み完了
    }
  };

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <button onClick={handleSubmit} disabled={loading}>チェック</button>
      {results && (
        <span>{results.message}</span>
      )}
    </>
  )
}

export default App
