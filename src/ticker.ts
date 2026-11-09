/**
 * Relógio que não pausa com a aba em segundo plano.
 * `setInterval` e `requestAnimationFrame` são freados (ou parados) em abas escondidas; um Web Worker
 * continua marcando o tempo, então a simulação e a transmissão do overlay seguem rodando.
 * Se o navegador não deixar criar o Worker, cai no `setInterval` comum.
 */
export function startTicker(ms: number, cb: () => void): () => void {
  try {
    const src = `let t = setInterval(() => postMessage(0), ${Math.max(1, Math.floor(ms))}); onmessage = () => clearInterval(t);`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => cb();
    worker.onerror = () => { /* sem Worker útil: o fallback abaixo já cobre na próxima chamada */ };
    return () => { worker.postMessage(0); worker.terminate(); };
  } catch {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }
}
