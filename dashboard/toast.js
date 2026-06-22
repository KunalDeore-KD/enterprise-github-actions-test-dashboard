class ToastManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error('Toast container not found');
    window.toastManager = this;
  }

  show(message, variant = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('toast--visible'));
    const remove = () => {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };
    window.setTimeout(remove, 4000);
    toast.addEventListener('click', remove);
  }
}

window.ToastManager = ToastManager;
