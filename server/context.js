export function estimateInputTokens(messages) {
  const characters = messages.reduce((total, message) => total + (message.content || '').length, 0);
  return Math.ceil(characters / 4);
}
