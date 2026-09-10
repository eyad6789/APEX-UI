/**
 * Raw PCM → WAV. Piper (and Kokoro) hand us bare little-endian 16-bit samples;
 * browsers want a container, and a 44-byte RIFF header is the whole difference.
 */

export function wavFromPcm(pcm: Uint8Array, sampleRate: number, channels = 1): Uint8Array<ArrayBuffer> {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);   // file size minus the first 8 bytes
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);               // fmt chunk size
  view.setUint16(20, 1, true);                // 1 = uncompressed PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, 44);
  return wav;
}
