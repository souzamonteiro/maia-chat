export function modelInfoRows(model) {
  const status = [
    model.status.includes('default') ? 'Default' : '',
    model.loaded ? 'Loaded' : 'Installed'
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    ['Canonical ID', model.id],
    ['Provider', model.provider],
    ['Parameters', model.parameter_size || 'Not reported'],
    ['Context window', `${model.context_window.toLocaleString()} tokens`],
    ['Capabilities', model.capabilities.join(', ')],
    ['Status', status]
  ];
}
