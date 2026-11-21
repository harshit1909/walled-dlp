// Text files: decode honouring a BOM, and also yield a NUL-stripped view so
// BOM-less UTF-16 content is still matched.
export async function* extractText(buffer) {
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buffer);
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) text = new TextDecoder('utf-16be').decode(buffer);
  else text = new TextDecoder('utf-8').decode(buffer);
  yield { text, where: 'file content' };
  if (text.includes('\u0000')) yield { text: text.replaceAll('\u0000', ''), where: 'file content' };
}
