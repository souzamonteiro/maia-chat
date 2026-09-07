const activeControllers = new Set();
let draining = false;

export function isDraining() {
  return draining;
}

export function registerStream(controller) {
  if (draining) return false;
  activeControllers.add(controller);
  return true;
}

export function unregisterStream(controller) {
  activeControllers.delete(controller);
}

export async function drainStreams(timeoutMs) {
  draining = true;
  const deadline = Date.now() + timeoutMs;

  while (activeControllers.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  for (const controller of activeControllers) controller.abort();
  activeControllers.clear();
}

export function resetLifecycle() {
  draining = false;
  activeControllers.clear();
}
