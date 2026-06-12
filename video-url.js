(function () {
  function joinUrl(baseUrl, relativePath) {
    if (!relativePath) return '';
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(relativePath)) return relativePath;
    const cleanRelative = String(relativePath).replace(/^\/+/, '');
    if (!baseUrl) return cleanRelative;
    return `${String(baseUrl).replace(/\/+$/, '')}/${cleanRelative}`;
  }

  function resolveArtifactVideoUrl(baseUrl, relativePath) {
    const candidates = [];
    const cleanPath = String(relativePath || '').replace(/^\/+/, '');

    if (cleanPath) {
      candidates.push(cleanPath);
      if (cleanPath.startsWith('test-results/') && !cleanPath.startsWith('playwright/')) {
        candidates.push(`playwright/${cleanPath}`);
      }
    }

    const unique = [...new Set(candidates)];
    return {
      primary: unique[0] ? joinUrl(baseUrl, unique[0]) : '',
      fallbacks: unique.slice(1).map((path) => joinUrl(baseUrl, path)),
    };
  }

  function attachVideoSource(video, baseUrl, relativePath) {
    const { primary, fallbacks } = resolveArtifactVideoUrl(baseUrl, relativePath);
    const attempts = [primary, ...fallbacks].filter(Boolean);
    let attemptIndex = 0;

    function tryNextSource() {
      if (attemptIndex >= attempts.length) {
        return;
      }

      video.src = attempts[attemptIndex];
      attemptIndex += 1;
      video.load();
    }

    video.addEventListener('error', () => {
      if (attemptIndex < attempts.length) {
        tryNextSource();
      }
    });

    tryNextSource();

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  window.resolveArtifactVideoUrl = resolveArtifactVideoUrl;
  window.attachArtifactVideoSource = attachVideoSource;
})();
