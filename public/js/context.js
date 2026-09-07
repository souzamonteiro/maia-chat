export function estimateTokens(messages) {
  const characters = messages.reduce((total, message) => {
    const attachments = (message.attachments || []).reduce(
      (attachmentTotal, attachment) => attachmentTotal + (attachment.content || '').length,
      0
    );
    return total + (message.content || '').length + attachments;
  }, 0);
  return Math.ceil(characters / 4);
}

export function contextUsage(messages, contextWindow) {
  const usedTokens = estimateTokens(messages);
  const limit = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 8192;

  return {
    usedTokens,
    limit,
    percentage: Math.min(100, Math.round((usedTokens / limit) * 100))
  };
}
