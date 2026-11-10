export {};
// Mesma página, três entradas: a página do viewer (?conta), o jogo do streamer (com painel) ou o overlay do OBS (?overlay=TOKEN).
const q = new URLSearchParams(location.search);
const overlayToken = q.get('overlay');
if (q.has('conta')) {
  const { runConta } = await import('./conta');
  await runConta();
} else if (overlayToken !== null) {
  const { runOverlay } = await import('./overlay');
  await runOverlay(overlayToken);
} else {
  await import('./game');
}
