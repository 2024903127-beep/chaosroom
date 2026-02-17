const inputState = { up: false, down: false, left: false, right: false };
const actionFlags = { dash: false, kill: false };

export function setupInput() {
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyW" || e.code === "ArrowUp") inputState.up = true;
    if (e.code === "KeyS" || e.code === "ArrowDown") inputState.down = true;
    if (e.code === "KeyA" || e.code === "ArrowLeft") inputState.left = true;
    if (e.code === "KeyD" || e.code === "ArrowRight") inputState.right = true;
    if (e.code === "Space") {
      e.preventDefault();
      actionFlags.dash = true;
    }
    if (e.code === "KeyF") actionFlags.kill = true;
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW" || e.code === "ArrowUp") inputState.up = false;
    if (e.code === "KeyS" || e.code === "ArrowDown") inputState.down = false;
    if (e.code === "KeyA" || e.code === "ArrowLeft") inputState.left = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") inputState.right = false;
  });
}

export function bindMobileControls({ baseEl, knobEl, dashBtn, killBtn }) {
  if (!("ontouchstart" in window)) return;

  let active = false;
  const maxRadius = 40;

  function updateFromTouch(clientX, clientY) {
    const rect = baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    knobEl.style.transform = `translate(${dx}px, ${dy}px)`;

    inputState.left = dx < -10;
    inputState.right = dx > 10;
    inputState.up = dy < -10;
    inputState.down = dy > 10;
  }

  function resetStick() {
    active = false;
    knobEl.style.transform = "translate(0px, 0px)";
    inputState.up = false;
    inputState.down = false;
    inputState.left = false;
    inputState.right = false;
  }

  baseEl.addEventListener("touchstart", (e) => {
    active = true;
    const t = e.touches[0];
    updateFromTouch(t.clientX, t.clientY);
  }, { passive: true });

  baseEl.addEventListener("touchmove", (e) => {
    if (!active) return;
    const t = e.touches[0];
    updateFromTouch(t.clientX, t.clientY);
  }, { passive: true });

  baseEl.addEventListener("touchend", resetStick, { passive: true });
  baseEl.addEventListener("touchcancel", resetStick, { passive: true });

  dashBtn.addEventListener("click", () => {
    actionFlags.dash = true;
  });

  killBtn.addEventListener("click", () => {
    actionFlags.kill = true;
  });
}

export function getInputPacket() {
  return { ...inputState };
}

export function consumeActions() {
  const actions = { ...actionFlags };
  actionFlags.dash = false;
  actionFlags.kill = false;
  return actions;
}