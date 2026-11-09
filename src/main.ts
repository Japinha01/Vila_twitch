export {};
// Mesma página, duas entradas: o jogo do streamer (com painel) ou o overlay do OBS (?overlay=TOKEN).
const overlayToken = new URLSearchParams(location.search).get('overlay');
if (overlayToken !== null) {
  const { runOverlay } = await import('./overlay');
  await runOverlay(overlayToken);
} else {
  await import('./game');
}
