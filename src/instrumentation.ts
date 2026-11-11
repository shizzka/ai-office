export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installPultPeerProof } = await import('./lib/pult/peer');
    installPultPeerProof();
  }
}
